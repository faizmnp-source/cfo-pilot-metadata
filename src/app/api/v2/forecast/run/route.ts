// POST /api/v2/forecast/run
//
// Build a forecast for a given account × entity × scenario, applying one of
// 4 methods (run-rate / growth % / linear trend / seasonal trend) over
// history → future facts.
//
// Body:
//   { accountIds: string[],
//     entityIds:  string[],
//     historyScenarioCode: string,    // e.g. 'ACTUAL' to learn from
//     targetScenarioCode:  string,    // e.g. 'FORECAST' to write to
//     historyPeriods: string[],       // e.g. ["2026M01", ..., "2026M06"] (or "2026-01")
//     futurePeriods:  string[],       // e.g. ["2026M07", ..., "2026M12"]
//     method: 'RUN_RATE' | 'GROWTH_PCT' | 'LINEAR_TREND' | 'SEASONAL_TREND',
//     params: { basisN?: number, pct?: number, seasonLength?: number },
//     overwriteExisting?: boolean }
//
// For SEASONAL_TREND, the route derives `seasonStart` automatically from the
// first historyPeriod code (e.g. "2026M03" → seasonStart=2 so calendar slot 0
// is January). seasonLength defaults to 12 (monthly seasonality).
//
// Returns: { method, accountCount, entityCount, periodCount, rowsRead, rowsWritten, sample[] }

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { applyForecastMethod, type ForecastMethodName } from "@/lib/forecast/methods";

/**
 * Extract the 0-indexed month-of-year from a period code.
 * Supports `2026M03` (tenant convention) and `2026-03` (legacy).
 * Returns 0 (Jan) when no parse — caller should treat as best-effort default.
 */
function monthIndexFromCode(code: string | undefined): number {
  if (!code) return 0;
  const m = code.match(/M(\d{1,2})$/i) ?? code.match(/[-_](\d{1,2})$/);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(11, n - 1)) : 0;
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  let body: any;
  try { body = await req.json(); } catch { return apiError("Invalid JSON", 400); }

  const accountIds      = Array.isArray(body.accountIds)       ? body.accountIds       : [];
  const entityIds       = Array.isArray(body.entityIds)        ? body.entityIds        : [];
  let historyPeriods  = Array.isArray(body.historyPeriods)   ? body.historyPeriods   : [];
  let futurePeriods   = Array.isArray(body.futurePeriods)    ? body.futurePeriods    : [];

  // Convenience: if user passes a single Time member code (year/quarter/half/month)
  // instead of an explicit array, resolve to leaf months via the universal resolver.
  if (body.historyTimeCode && historyPeriods.length === 0) {
    const { resolveTimeMembersToLeafMonths } = await import("@/lib/reports/time-resolver");
    const { leafMonthIds } = await resolveTimeMembersToLeafMonths(auth.tid, body.historyTimeCode);
    const months = await prisma.dimensionMember.findMany({ where: { id: { in: leafMonthIds }}, select: { memberCode: true }});
    historyPeriods = months.map(m => m.memberCode).sort();
  }
  if (body.futureTimeCode && futurePeriods.length === 0) {
    const { resolveTimeMembersToLeafMonths } = await import("@/lib/reports/time-resolver");
    const { leafMonthIds } = await resolveTimeMembersToLeafMonths(auth.tid, body.futureTimeCode);
    const months = await prisma.dimensionMember.findMany({ where: { id: { in: leafMonthIds }}, select: { memberCode: true }});
    futurePeriods = months.map(m => m.memberCode).sort();
  }

  if (!accountIds.length || !entityIds.length || !historyPeriods.length || !futurePeriods.length) {
    return apiError("accountIds, entityIds + (historyPeriods OR historyTimeCode) + (futurePeriods OR futureTimeCode) required", 400);
  }
  const method = String(body.method ?? "RUN_RATE") as ForecastMethodName;
  const params = { ...(body.params ?? {}) };
  const overwrite = !!body.overwriteExisting;

  // For SEASONAL_TREND, auto-derive seasonStart from the first historyPeriod
  // code unless the caller passed one explicitly. This lines up seasonal
  // slot 0 with January regardless of when history starts.
  if (method === "SEASONAL_TREND" && params.seasonStart == null) {
    params.seasonStart = monthIndexFromCode(historyPeriods[0]);
  }
  if (method === "SEASONAL_TREND" && params.seasonLength == null) {
    params.seasonLength = 12;
  }

  // Resolve scenario codes → ids
  const [historyScn, targetScn] = await Promise.all([
    prisma.dimensionMember.findFirst({ where: { tenantId: auth.tid, dimension: { kind: "SCENARIO" }, memberCode: body.historyScenarioCode ?? "ACTUAL" }, select: { id: true }}),
    prisma.dimensionMember.findFirst({ where: { tenantId: auth.tid, dimension: { kind: "SCENARIO" }, memberCode: body.targetScenarioCode ?? "FORECAST" }, select: { id: true }}),
  ]);
  if (!historyScn) return apiError(`History scenario '${body.historyScenarioCode}' not found`, 400);
  if (!targetScn) return apiError(`Target scenario '${body.targetScenarioCode}' not found`, 400);

  // Resolve period codes → ids (historical + future)
  const allPeriodCodes = [...historyPeriods, ...futurePeriods];
  const periodMembers = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, dimension: { kind: "TIME" }, memberCode: { in: allPeriodCodes }},
    select: { id: true, memberCode: true },
  });
  const periodCodeToId = new Map(periodMembers.map(p => [p.memberCode, p.id]));
  const historyIds = historyPeriods.map((c: string) => periodCodeToId.get(c)).filter(Boolean) as string[];
  const futureIds  = futurePeriods.map((c: string) => periodCodeToId.get(c)).filter(Boolean) as string[];
  if (futureIds.length !== futurePeriods.length) {
    return apiError(`Some future periods don't exist as Time members: ${futurePeriods.filter((c: string) => !periodCodeToId.get(c)).join(", ")}`, 400);
  }

  // Resolve Origin = AI
  const origin = await prisma.dimensionMember.findFirst({
    where: { tenantId: auth.tid, dimension: { kind: "ORIGIN" }, memberCode: "AI" },
    select: { id: true },
  });
  if (!origin) return apiError("Origin 'AI' not seeded", 500);

  // Read history facts in one go
  const histFacts = await prisma.factRow.findMany({
    where: {
      tenantId:   auth.tid,
      scenarioId: historyScn.id,
      timeId:     { in: historyIds },
      entityId:   { in: entityIds },
      accountId:  { in: accountIds },
      isCurrent:  true,
    },
    select: { accountId: true, entityId: true, timeId: true, currencyId: true, icpId: true, valueReporting: true },
  });

  // Index by (account|entity) → ordered history values by period
  const histIdx = new Map<string, { account: string; entity: string; ccy: string; icp: string; periods: Map<string, number> }>();
  for (const f of histFacts) {
    const key = `${f.accountId}|${f.entityId}`;
    if (!histIdx.has(key)) {
      histIdx.set(key, { account: f.accountId, entity: f.entityId, ccy: f.currencyId, icp: f.icpId, periods: new Map() });
    }
    histIdx.get(key)!.periods.set(f.timeId, Number(f.valueReporting));
  }

  // Optional overwrite — clear existing forecast rows in the target intersection
  if (overwrite) {
    await prisma.factRow.deleteMany({
      where: {
        tenantId:   auth.tid,
        scenarioId: targetScn.id,
        timeId:     { in: futureIds },
        entityId:   { in: entityIds },
        accountId:  { in: accountIds },
        originId:   origin.id,
      },
    });
  }

  // For each (account, entity) combo, build forecast values and append rows
  const toWrite: any[] = [];
  const sample: any[] = [];
  for (const acc of accountIds) {
    for (const ent of entityIds) {
      const series = histIdx.get(`${acc}|${ent}`);
      const history = historyIds.map(pid => series?.periods.get(pid) ?? 0);
      const forecast = applyForecastMethod(method, history, futureIds.length, params);

      for (let i = 0; i < futureIds.length; i++) {
        const v = forecast.values[i] ?? 0;
        toWrite.push({
          tenantId:    auth.tid,
          accountId:   acc,
          entityId:    ent,
          scenarioId:  targetScn.id,
          timeId:      futureIds[i],
          currencyId:  series?.ccy ?? (await getFirstCurrencyId(auth.tid)),
          icpId:       series?.icp ?? (await getNoneIcpId(auth.tid)),
          originId:    origin.id,
          valueTxn:       v,
          valueLocal:     v,
          valueReporting: v,
          version:        1,
          isCurrent:      true,
          postedBy:       `forecast:${auth.sub}`,
        });
      }
      if (sample.length < 3) {
        sample.push({ accountId: acc, entityId: ent, method, history, forecast: forecast.values, basis: forecast.basis });
      }
    }
  }

  // Batch insert
  let written = 0;
  const BATCH = 500;
  for (let i = 0; i < toWrite.length; i += BATCH) {
    const r = await prisma.factRow.createMany({ data: toWrite.slice(i, i + BATCH), skipDuplicates: true });
    written += r.count;
  }

  return apiResponse({
    method,
    accountCount: accountIds.length,
    entityCount:  entityIds.length,
    historyPeriodCount: historyPeriods.length,
    futurePeriodCount:  futurePeriods.length,
    rowsRead:    histFacts.length,
    rowsWritten: written,
    sample,
  });
}

// Helpers — these only get hit when history was empty (fallback intersections)
let _ccyCache: { tenantId: string; id: string } | null = null;
async function getFirstCurrencyId(tenantId: string): Promise<string> {
  if (_ccyCache?.tenantId === tenantId) return _ccyCache.id;
  const m = await prisma.dimensionMember.findFirst({
    where: { tenantId, dimension: { kind: "CURRENCY" }, isActive: true },
    select: { id: true },
  });
  if (!m) throw new Error("No CURRENCY members seeded");
  _ccyCache = { tenantId, id: m.id };
  return m.id;
}
let _icpCache: { tenantId: string; id: string } | null = null;
async function getNoneIcpId(tenantId: string): Promise<string> {
  if (_icpCache?.tenantId === tenantId) return _icpCache.id;
  const m = await prisma.dimensionMember.findFirst({
    where: { tenantId, dimension: { kind: "ICP" }, memberCode: "None" },
    select: { id: true },
  });
  if (!m) throw new Error("ICP [None] not seeded");
  _icpCache = { tenantId, id: m.id };
  return m.id;
}
