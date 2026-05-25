// POST /api/v2/intelligence/top-contributors
// Body: { povIds: { scenarioId, timeId, entityIds[] }, kpi: "revenue"|"opex"|"netIncome"|"cash"|"grossProfit", top?: number }
// Returns: { contributors: Array<{ entityId, entityCode, entityName, accountId?, accountCode?, accountName?, value }> }
//
// Aggregates fact rows by entity (and optionally account) for the chosen KPI,
// returning the top-N contributors. Powers the drill-through on /explore.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

type KpiKind = "revenue" | "opex" | "netIncome" | "cash" | "grossProfit";

const ACCOUNT_TYPE_FILTER: Record<KpiKind, string[]> = {
  revenue:     ["REVENUE"],
  opex:        ["EXPENSE"],   // refined below using account code prefix 6
  netIncome:   ["REVENUE","EXPENSE","COGS"],
  cash:        ["ASSET"],
  grossProfit: ["REVENUE","COGS","EXPENSE"],
};

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const body = await req.json().catch(() => null);
  if (!body?.povIds?.scenarioId || !body?.povIds?.timeId || !body?.kpi) {
    return apiError("povIds.scenarioId + povIds.timeId + kpi are required", 400);
  }
  const top: number = Math.max(3, Math.min(50, Number(body.top) || 8));
  const kpi: KpiKind = body.kpi;

  // Resolve the time leaf months (if periodCode is FY/QTR, we need its leaves)
  const { resolveTimeMembersToLeafMonths } = await import("@/lib/reports/time-resolver");
  const yearCode = (await prisma.dimensionMember.findFirst({
    where: { id: body.povIds.timeId, tenantId: auth.tid },
    select: { memberCode: true },
  }))?.memberCode;
  const leafMonthIds: string[] = yearCode
    ? (await resolveTimeMembersToLeafMonths(auth.tid, yearCode)).leafMonthIds
    : [body.povIds.timeId];

  // Pull all relevant facts for this scenario + leaves + (optionally) entities
  const entityIds: string[] = body.povIds.entityIds ?? [];
  const facts = await prisma.factRow.findMany({
    where: {
      tenantId: auth.tid,
      scenarioId: body.povIds.scenarioId,
      timeId: { in: leafMonthIds },
      ...(entityIds.length ? { entityId: { in: entityIds }} : {}),
      isCurrent: true,
    },
    select: {
      entityId: true, accountId: true,
      valueReporting: true,
    },
    take: 50_000,
  });

  // Resolve account types for filtering
  const acctIds = Array.from(new Set(facts.map(f => f.accountId)));
  const accts   = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, id: { in: acctIds }, dimension: { code: "account" }},
    select: { id: true, memberCode: true, memberName: true, properties: true },
  });
  const acctMeta = new Map(accts.map(a => [a.id, a]));

  function isKpi(acctId: string): { include: boolean; sign: 1 | -1 } {
    const meta = acctMeta.get(acctId);
    if (!meta) return { include: false, sign: 1 };
    const type = (meta.properties as any)?.accountType ?? null;
    switch (kpi) {
      case "revenue":     return { include: type === "REVENUE", sign: 1 };
      case "opex":        return { include: type === "EXPENSE" && meta.memberCode.startsWith("6"), sign: 1 };
      case "grossProfit": {
        if (type === "REVENUE") return { include: true, sign: 1 };
        if (type === "EXPENSE" && meta.memberCode.startsWith("5")) return { include: true, sign: -1 };  // COGS
        return { include: false, sign: 1 };
      }
      case "netIncome": {
        if (type === "REVENUE") return { include: true, sign: 1 };
        if (type === "EXPENSE") return { include: true, sign: -1 };
        return { include: false, sign: 1 };
      }
      case "cash":        return { include: type === "ASSET" && /cash|bank/i.test(meta.memberName), sign: 1 };
    }
  }

  // Aggregate by entity+account
  const buckets = new Map<string, { entityId: string; accountId: string; value: number }>();
  for (const f of facts) {
    const { include, sign } = isKpi(f.accountId);
    if (!include) continue;
    const key = `${f.entityId}|${f.accountId}`;
    const cur = buckets.get(key);
    const v = sign * Number(f.valueReporting);
    if (cur) cur.value += v;
    else buckets.set(key, { entityId: f.entityId, accountId: f.accountId, value: v });
  }

  // Sort by absolute contribution, take top N
  const ranked = Array.from(buckets.values())
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, top);

  // Resolve entity + account labels
  const entIds  = Array.from(new Set(ranked.map(r => r.entityId)));
  const entMems = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, id: { in: entIds }},
    select: { id: true, memberCode: true, memberName: true },
  });
  const entById = new Map(entMems.map(e => [e.id, e]));

  return apiResponse({
    kpi,
    contributors: ranked.map(r => ({
      entityId:   r.entityId,
      entityCode: entById.get(r.entityId)?.memberCode ?? "?",
      entityName: entById.get(r.entityId)?.memberName ?? "?",
      accountId:    r.accountId,
      accountCode:  acctMeta.get(r.accountId)?.memberCode ?? "?",
      accountName:  acctMeta.get(r.accountId)?.memberName ?? "?",
      value: r.value,
    })),
  });
}
