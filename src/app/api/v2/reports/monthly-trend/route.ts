// GET /api/v2/reports/monthly-trend?scenarioId=&entityId=&yearCode=
//   → returns 12-month series: { months: [{code, revenue, expense, netIncome}, ...] }
//
// Powers the dashboard revenue+budget chart. Sums revenue / expense
// account_types per month. Entity = leaf (most common) or parent (after
// consolidation). Multi-leaf aggregation done client-side.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;

  const url = new URL(req.url);
  const scenarioId = url.searchParams.get("scenarioId");
  const entityIdRaw = url.searchParams.get("entityId");      // comma-separated allowed
  const yearCode = url.searchParams.get("yearCode");
  if (!scenarioId || !entityIdRaw || !yearCode) {
    return apiError("scenarioId, entityId, yearCode required", 400);
  }
  const entityIds = entityIdRaw.split(",").map(s => s.trim()).filter(Boolean);

  // Year → months
  const timeDim = await prisma.dimension.findFirst({
    where: { tenantId: auth.tid, kind: "TIME" as any }, select: { id: true },
  });
  if (!timeDim) return apiError("Time dim missing", 404);
  const yearMember = await prisma.dimensionMember.findFirst({
    where: { tenantId: auth.tid, dimensionId: timeDim.id, memberCode: yearCode },
    select: { id: true },
  });
  if (!yearMember) return apiError("Year not found", 404);

  const quarterEdges = await prisma.hierarchyEdge.findMany({
    where: { tenantId: auth.tid, parentMemberId: yearMember.id },
    select: { childMemberId: true },
  });
  const monthEdges = await prisma.hierarchyEdge.findMany({
    where: { tenantId: auth.tid, parentMemberId: { in: quarterEdges.map(e => e.childMemberId) } },
    select: { childMemberId: true },
  });
  const monthIds = monthEdges.map(e => e.childMemberId);
  const months = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, id: { in: monthIds }, isActive: true },
    select: { id: true, memberCode: true },
    orderBy: { memberCode: "asc" },
  });

  // Pull all facts for the slice + the relevant accounts (with account_type)
  const facts = await prisma.factRow.findMany({
    where: {
      tenantId: auth.tid,
      scenarioId,
      entityId: { in: entityIds },
      timeId: { in: monthIds },
      isCurrent: true,
    },
    select: { accountId: true, timeId: true, valueReporting: true },
  });

  const accountIds = Array.from(new Set(facts.map(f => f.accountId)));
  const accounts = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, id: { in: accountIds } },
    select: { id: true, properties: true },
  });
  const acctType = new Map(accounts.map(a => [a.id, ((a.properties as any)?.account_type ?? "OTHER") as string]));

  // Aggregate per month
  const byMonth = new Map<string, { revenue: number; expense: number }>();
  for (const m of months) byMonth.set(m.id, { revenue: 0, expense: 0 });
  for (const f of facts) {
    const slot = byMonth.get(f.timeId);
    if (!slot) continue;
    const type = acctType.get(f.accountId);
    const v = Number(f.valueReporting);
    if (type === "REVENUE")      slot.revenue += v;
    else if (type === "EXPENSE") slot.expense += v;
  }

  const series = months.map(m => {
    const v = byMonth.get(m.id)!;
    return {
      code:      m.memberCode,
      revenue:   v.revenue,
      expense:   v.expense,
      netIncome: v.revenue - v.expense,
    };
  });

  return apiResponse({ months: series, rowsRead: facts.length });
}
