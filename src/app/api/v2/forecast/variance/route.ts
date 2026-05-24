// POST /api/v2/forecast/variance — Sprint W.2 + W.3
//
// Forecast Variance Scorecard. Joins ACTUAL vs FORECAST facts on
// (account × entity × period) and returns variance + variance % per row,
// plus aggregate totals. Pure read; never writes.
//
// Sprint W.3 — every row now carries `accountType` + `favorability` tags
// (favorable / unfavorable / flat / neutral) so the UI can color cells with
// CFO-correct semantics (REVENUE beat = green; EXPENSE overshoot = red;
// balance-sheet items left neutral). Aggregate `favorabilityTotals` returned
// alongside the existing `totals` block.
//
// Body:
//   { accountIds:           string[],
//     entityIds:            string[],
//     actualScenarioCode?:  string,    // default "ACTUAL"
//     forecastScenarioCode?:string,    // default "FORECAST"
//     periodCodes?:         string[],  // explicit leaf-month codes
//     timeCode?:            string,    // OR a Time POV (FY2026 / FY2026H2 / etc.)
//     enrich?:              boolean,   // when true, attaches account/entity/period
//                                      // memberCode + memberName onto each row
//   }
//
// Either periodCodes OR timeCode must be supplied; if both, periodCodes wins.
//
// Returns:
//   { actualScenarioCode, forecastScenarioCode,
//     rows: VarianceRow[] (with accountType + favorability + optional enrichment),
//     totals: { actual, forecast, variance, variancePct, rowCount },
//     favorabilityTotals: { favorable, unfavorable, flat, neutral, netFavorableImpact },
//     periodCount, accountCount, entityCount }

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import {
  computeVarianceRows,
  computeVarianceTotals,
  applyFavorability,
  computeFavorabilityTotals,
  type FactRowLite,
  type AccountTypeForFav,
} from "@/lib/forecast/variance";
import { resolveTimeMembersToLeafMonths } from "@/lib/reports/time-resolver";

// Sprint W.3 — account_type lives in DimensionMember.properties.account_type.
// Coerce to the union the favorability lib understands; anything else is null.
const VALID_ACCOUNT_TYPES = new Set<string>([
  "REVENUE", "EXPENSE", "ASSET", "LIABILITY", "EQUITY",
]);
function coerceAccountType(raw: unknown): AccountTypeForFav | null {
  if (typeof raw !== "string") return null;
  return VALID_ACCOUNT_TYPES.has(raw) ? (raw as AccountTypeForFav) : null;
}

type EnrichedRow = ReturnType<typeof computeVarianceRows>[number] & {
  accountCode?:  string;
  accountName?:  string;
  entityCode?:   string;
  entityName?:   string;
  periodCode?:   string;
  periodName?:   string;
};

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  let body: any;
  try { body = await req.json(); } catch { return apiError("Invalid JSON", 400); }

  const accountIds = Array.isArray(body.accountIds) ? body.accountIds.filter((x: any) => typeof x === "string") : [];
  const entityIds  = Array.isArray(body.entityIds)  ? body.entityIds.filter((x: any) => typeof x === "string")  : [];
  if (!accountIds.length || !entityIds.length) {
    return apiError("accountIds and entityIds are required", 400);
  }

  // Resolve scenarios (ACTUAL / FORECAST by default, case-insensitive lookup).
  const actualCode   = String(body.actualScenarioCode   ?? "ACTUAL");
  const forecastCode = String(body.forecastScenarioCode ?? "FORECAST");
  const [actualScn, forecastScn] = await Promise.all([
    prisma.dimensionMember.findFirst({
      where: { tenantId: auth.tid, dimension: { kind: "SCENARIO" }, memberCode: { equals: actualCode, mode: "insensitive" }},
      select: { id: true, memberCode: true },
    }),
    prisma.dimensionMember.findFirst({
      where: { tenantId: auth.tid, dimension: { kind: "SCENARIO" }, memberCode: { equals: forecastCode, mode: "insensitive" }},
      select: { id: true, memberCode: true },
    }),
  ]);
  if (!actualScn)   return apiError(`Actual scenario '${actualCode}' not found`, 400);
  if (!forecastScn) return apiError(`Forecast scenario '${forecastCode}' not found`, 400);

  // Resolve period ids — either explicit periodCodes or a timeCode POV.
  let periodIds: string[] = [];
  if (Array.isArray(body.periodCodes) && body.periodCodes.length) {
    const members = await prisma.dimensionMember.findMany({
      where: { tenantId: auth.tid, dimension: { kind: "TIME" }, memberCode: { in: body.periodCodes }},
      select: { id: true },
    });
    periodIds = members.map(m => m.id);
  } else if (body.timeCode) {
    const { leafMonthIds } = await resolveTimeMembersToLeafMonths(auth.tid, String(body.timeCode));
    periodIds = leafMonthIds;
  } else {
    return apiError("Either periodCodes[] or timeCode is required", 400);
  }
  if (!periodIds.length) return apiError("No matching periods found for the supplied POV", 400);

  // Pull both scenarios in two parallel queries, plus account-type metadata
  // for every account in scope (needed for Sprint W.3 favorability tagging).
  const [actualFacts, forecastFacts, accountMembers] = await Promise.all([
    prisma.factRow.findMany({
      where: {
        tenantId:   auth.tid,
        scenarioId: actualScn.id,
        accountId:  { in: accountIds },
        entityId:   { in: entityIds },
        timeId:     { in: periodIds },
        isCurrent:  true,
      },
      select: { accountId: true, entityId: true, timeId: true, valueReporting: true },
    }),
    prisma.factRow.findMany({
      where: {
        tenantId:   auth.tid,
        scenarioId: forecastScn.id,
        accountId:  { in: accountIds },
        entityId:   { in: entityIds },
        timeId:     { in: periodIds },
        isCurrent:  true,
      },
      select: { accountId: true, entityId: true, timeId: true, valueReporting: true },
    }),
    prisma.dimensionMember.findMany({
      where: { tenantId: auth.tid, id: { in: accountIds }},
      select: { id: true, properties: true },
    }),
  ]);

  // Build accountId → accountType lookup map.
  const accountTypeMap = new Map<string, AccountTypeForFav | null>();
  for (const m of accountMembers) {
    const props = (m.properties as any) ?? {};
    accountTypeMap.set(m.id, coerceAccountType(props.account_type));
  }

  const toLite = (f: { accountId: string; entityId: string; timeId: string; valueReporting: any }): FactRowLite => ({
    accountId: f.accountId,
    entityId:  f.entityId,
    timeId:    f.timeId,
    value:     Number(f.valueReporting ?? 0),
  });
  const baseRows = computeVarianceRows(actualFacts.map(toLite), forecastFacts.map(toLite));
  const taggedRows = applyFavorability(baseRows, accountTypeMap);
  const totals = computeVarianceTotals(taggedRows);
  const favorabilityTotals = computeFavorabilityTotals(taggedRows);

  // Optional enrichment — attach member codes/names so the UI can render without an extra round-trip.
  let outRows: EnrichedRow[] = taggedRows;
  if (body.enrich) {
    const uniqAcc  = Array.from(new Set(taggedRows.map(r => r.accountId)));
    const uniqEnt  = Array.from(new Set(taggedRows.map(r => r.entityId)));
    const uniqTime = Array.from(new Set(taggedRows.map(r => r.timeId)));
    const [accMembers, entMembers, timeMembers] = await Promise.all([
      prisma.dimensionMember.findMany({ where: { tenantId: auth.tid, id: { in: uniqAcc }},  select: { id: true, memberCode: true, memberName: true }}),
      prisma.dimensionMember.findMany({ where: { tenantId: auth.tid, id: { in: uniqEnt }},  select: { id: true, memberCode: true, memberName: true }}),
      prisma.dimensionMember.findMany({ where: { tenantId: auth.tid, id: { in: uniqTime }}, select: { id: true, memberCode: true, memberName: true }}),
    ]);
    const accMap  = new Map(accMembers.map(m  => [m.id, m]));
    const entMap  = new Map(entMembers.map(m  => [m.id, m]));
    const timeMap = new Map(timeMembers.map(m => [m.id, m]));
    outRows = taggedRows.map(r => ({
      ...r,
      accountCode: accMap.get(r.accountId)?.memberCode,
      accountName: accMap.get(r.accountId)?.memberName,
      entityCode:  entMap.get(r.entityId)?.memberCode,
      entityName:  entMap.get(r.entityId)?.memberName,
      periodCode:  timeMap.get(r.timeId)?.memberCode,
      periodName:  timeMap.get(r.timeId)?.memberName,
    }));
  }

  return apiResponse({
    actualScenarioCode:   actualScn.memberCode,
    forecastScenarioCode: forecastScn.memberCode,
    rows: outRows,
    totals,
    favorabilityTotals,
    periodCount:  periodIds.length,
    accountCount: accountIds.length,
    entityCount:  entityIds.length,
  });
}
