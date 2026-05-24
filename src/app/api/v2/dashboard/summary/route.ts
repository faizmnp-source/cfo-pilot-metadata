// GET /api/v2/dashboard/summary?scenarioId=&entityIds=GRP,US_HQ,...&yearCode=&periodScope=YTD|QTD|MONTH&compareScenarioId=
//
// One call that powers the entire Executive Dashboard. Returns:
//   - kpis:       Revenue / COGS / Gross Profit / Opex / Net Income / Cash (with delta vs compare scenario)
//   - monthly:    12-month series of revenue + expense + budget for the chart
//   - byEntity:   revenue by entity (donut)
//   - byCategory: expense by account-parent (stacked bar)
//   - topVariances: 5 biggest Actual-vs-Budget variances
//   - cashTrend:  closing-balance cash by month

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

type AcctType = "REVENUE" | "COGS" | "EXPENSE" | "ASSET" | "LIABILITY" | "EQUITY";

interface AcctMeta {
  id:         string;
  code:       string;
  name:       string;
  type:       string | null;
  parentId:   string | null;
  parentName: string | null;
  isLeaf:     boolean;
  // For Cash detection
  isCash:     boolean;
}

export async function GET(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;

  const url = new URL(req.url);
  const scenarioId        = url.searchParams.get("scenarioId");
  const yearCode          = url.searchParams.get("yearCode");
  const entityIdsRaw      = url.searchParams.get("entityIds") ?? "";
  const compareScenarioId = url.searchParams.get("compareScenarioId");   // optional — typically BUDGET id
  if (!scenarioId || !yearCode) return apiError("scenarioId, yearCode required", 400);

  // ── Resolve months for year ─────────────────────────────────────
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
  const monthMembers = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, id: { in: monthIds }, isActive: true },
    select: { id: true, memberCode: true },
    orderBy: { memberCode: "asc" },
  });
  const monthOrder = new Map(monthMembers.map((m, i) => [m.id, i]));

  // ── Resolve entities ────────────────────────────────────────────
  let entityIds = entityIdsRaw.split(",").map(s => s.trim()).filter(Boolean);
  if (entityIds.length === 0) {
    // Default: all leaf entities (those not appearing as a parent in any edge)
    const allEnts = await prisma.dimensionMember.findMany({
      where: { tenantId: auth.tid, isActive: true, dimension: { kind: "ENTITY" as any }},
      select: { id: true },
    });
    const entHierEdges = await prisma.hierarchyEdge.findMany({
      where: { tenantId: auth.tid, parentMemberId: { in: allEnts.map(e => e.id) }},
      select: { parentMemberId: true },
    });
    const parents = new Set(entHierEdges.map(e => e.parentMemberId));
    entityIds = allEnts.filter(e => !parents.has(e.id)).map(e => e.id);
  }

  const entityMembers = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, id: { in: entityIds }},
    select: { id: true, memberCode: true, memberName: true },
  });
  const entityById = new Map(entityMembers.map(e => [e.id, { code: e.memberCode, name: e.memberName }]));

  // ── Pull all facts for the slice (both scenarios if compare provided) ──
  const scnFilter: any = compareScenarioId ? [scenarioId, compareScenarioId] : [scenarioId];
  const facts = await prisma.factRow.findMany({
    where: {
      tenantId: auth.tid,
      scenarioId: { in: scnFilter },
      entityId: { in: entityIds },
      timeId: { in: monthIds },
      isCurrent: true,
    },
    select: {
      scenarioId: true, accountId: true, entityId: true, timeId: true, valueReporting: true,
    },
  });

  // ── Account metadata + hierarchy parents for category bucketing ──
  const acctIds = Array.from(new Set(facts.map(f => f.accountId)));
  const acctMembers = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, id: { in: acctIds }},
    select: { id: true, memberCode: true, memberName: true, properties: true },
  });
  const acctDim = acctMembers[0] ? await prisma.dimension.findFirst({
    where: { tenantId: auth.tid, kind: "ACCOUNT" as any }, select: { id: true },
  }) : null;

  // Resolve immediate parent of each account by walking hierarchy edges
  const acctEdges = acctDim ? await prisma.hierarchyEdge.findMany({
    where: { tenantId: auth.tid, childMemberId: { in: acctIds }},
    select: { parentMemberId: true, childMemberId: true },
  }) : [];
  const parentByChild = new Map(acctEdges.map(e => [e.childMemberId, e.parentMemberId]));
  const parentIds = Array.from(new Set(acctEdges.map(e => e.parentMemberId)));
  const parentMembers = parentIds.length > 0 ? await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, id: { in: parentIds }},
    select: { id: true, memberCode: true, memberName: true },
  }) : [];
  const parentNameById = new Map(parentMembers.map(p => [p.id, p.memberName]));

  const acctMeta = new Map<string, AcctMeta>();
  for (const m of acctMembers) {
    const props = (m.properties as any) ?? {};
    const parentId = parentByChild.get(m.id) ?? null;
    acctMeta.set(m.id, {
      id: m.id, code: m.memberCode, name: m.memberName,
      type: (props.account_type as string) ?? null,
      parentId,
      parentName: parentId ? parentNameById.get(parentId) ?? null : null,
      isLeaf: true,
      isCash: /cash|bank/i.test(m.memberName),
    });
  }

  // ── Aggregators ────────────────────────────────────────────────
  // KPIs total per scenario
  const kpiTotals = new Map<string, { revenue: number; cogs: number; opex: number; otherExp: number; cash: number }>();
  for (const scn of scnFilter) kpiTotals.set(scn, { revenue: 0, cogs: 0, opex: 0, otherExp: 0, cash: 0 });

  // Monthly trend for primary scenario
  const monthly = new Map<string, { code: string; revenue: number; expense: number; budget: number; netIncome: number }>();
  for (const m of monthMembers) monthly.set(m.id, { code: m.memberCode, revenue: 0, expense: 0, budget: 0, netIncome: 0 });

  // Revenue by entity (primary scenario)
  const byEntity = new Map<string, number>();
  for (const id of entityIds) byEntity.set(id, 0);

  // Expense by category (parent account name)
  const byCategory = new Map<string, { actual: number; budget: number }>();

  // Cash trend (primary scenario, cash accounts, by month)
  const cashTrend = new Map<string, number>();
  for (const m of monthMembers) cashTrend.set(m.id, 0);

  // Variance per account (actual - budget for primary scenario)
  const acctTotals = new Map<string, { actual: number; budget: number }>();

  for (const f of facts) {
    const meta = acctMeta.get(f.accountId);
    if (!meta) continue;
    const v = Number(f.valueReporting);
    const isPrimary = f.scenarioId === scenarioId;
    const k = kpiTotals.get(f.scenarioId)!;

    // KPI bucketing
    if (meta.type === "REVENUE") k.revenue += v;
    else if (meta.type === "EXPENSE") {
      // Split COGS (5xxx) from Opex (6xxx) by code prefix
      if (meta.code.startsWith("5")) k.cogs += v;
      else if (meta.code.startsWith("6")) k.opex += v;
      else k.otherExp += v;
    }
    if (meta.isCash && meta.type === "ASSET") k.cash += v;

    if (isPrimary) {
      // Monthly bucket
      const mm = monthly.get(f.timeId);
      if (mm) {
        if (meta.type === "REVENUE") mm.revenue += v;
        else if (meta.type === "EXPENSE") mm.expense += v;
      }
      // Cash trend
      if (meta.isCash && meta.type === "ASSET") {
        cashTrend.set(f.timeId, (cashTrend.get(f.timeId) ?? 0) + v);
      }
      // Revenue by entity
      if (meta.type === "REVENUE") byEntity.set(f.entityId, (byEntity.get(f.entityId) ?? 0) + v);
      // Expense by category (parent name)
      if (meta.type === "EXPENSE") {
        const cat = meta.parentName ?? "Other";
        const c = byCategory.get(cat) ?? { actual: 0, budget: 0 };
        c.actual += v; byCategory.set(cat, c);
      }
      // For variance tracking
      const at = acctTotals.get(f.accountId) ?? { actual: 0, budget: 0 };
      at.actual += v; acctTotals.set(f.accountId, at);
    } else {
      // Budget side
      const mm = monthly.get(f.timeId);
      if (mm && meta.type !== "ASSET" && meta.type !== "LIABILITY" && meta.type !== "EQUITY") {
        // Net P&L for budget line — revenue - expense
        if (meta.type === "REVENUE") mm.budget += v;
        else if (meta.type === "EXPENSE") mm.budget -= v;
      }
      if (meta.type === "EXPENSE") {
        const cat = meta.parentName ?? "Other";
        const c = byCategory.get(cat) ?? { actual: 0, budget: 0 };
        c.budget += v; byCategory.set(cat, c);
      }
      const at = acctTotals.get(f.accountId) ?? { actual: 0, budget: 0 };
      at.budget += v; acctTotals.set(f.accountId, at);
    }
  }

  // Compute Net Income per month
  for (const m of Array.from(monthly.values())) m.netIncome = m.revenue - m.expense;

  // KPI deltas
  const primary = kpiTotals.get(scenarioId)!;
  const compare = compareScenarioId ? kpiTotals.get(compareScenarioId)! : null;
  const grossProfit = primary.revenue - primary.cogs;
  const totalExpense = primary.cogs + primary.opex + primary.otherExp;
  const netIncome = primary.revenue - totalExpense;
  const grossProfitBudget = compare ? compare.revenue - compare.cogs : null;
  const netIncomeBudget = compare ? compare.revenue - (compare.cogs + compare.opex + compare.otherExp) : null;

  function delta(actual: number, budget: number | null): number | null {
    if (budget === null || budget === 0) return null;
    return ((actual - budget) / Math.abs(budget)) * 100;
  }

  // Top 5 variances by absolute value (only accounts present in both Actual + Budget)
  const variances = Array.from(acctTotals.entries())
    .map(([accId, t]) => {
      const m = acctMeta.get(accId)!;
      const v = t.actual - t.budget;
      return { code: m.code, name: m.name, type: m.type, actual: t.actual, budget: t.budget, variance: v, variancePct: t.budget === 0 ? 0 : (v / Math.abs(t.budget)) * 100 };
    })
    .filter(v => v.type === "REVENUE" || v.type === "EXPENSE")
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
    .slice(0, 8);

  return apiResponse({
    kpis: {
      revenue:      { value: primary.revenue, deltaPct: delta(primary.revenue, compare?.revenue ?? null) },
      cogs:         { value: primary.cogs,    deltaPct: delta(primary.cogs,    compare?.cogs    ?? null) },
      grossProfit:  { value: grossProfit,     deltaPct: delta(grossProfit,     grossProfitBudget) },
      opex:         { value: primary.opex,    deltaPct: delta(primary.opex,    compare?.opex    ?? null) },
      netIncome:    { value: netIncome,       deltaPct: delta(netIncome,       netIncomeBudget) },
      cash:         { value: primary.cash,    deltaPct: delta(primary.cash,    compare?.cash    ?? null) },
      grossMargin:  primary.revenue === 0 ? 0 : (grossProfit / primary.revenue) * 100,
      netMargin:    primary.revenue === 0 ? 0 : (netIncome / primary.revenue) * 100,
    },
    monthly: Array.from(monthly.values()),
    byEntity: Array.from(byEntity.entries()).map(([id, value]) => ({
      id, code: entityById.get(id)?.code ?? "?", name: entityById.get(id)?.name ?? "?", value,
    })).sort((a, b) => b.value - a.value),
    byCategory: Array.from(byCategory.entries()).map(([name, v]) => ({ name, actual: v.actual, budget: v.budget }))
      .sort((a, b) => b.actual - a.actual),
    topVariances: variances,
    cashTrend: monthMembers.map(m => ({ code: m.memberCode, value: cashTrend.get(m.id) ?? 0 })),
    meta: {
      scenarioId, yearCode, entityCount: entityIds.length,
      hasCompare: !!compareScenarioId,
      factsRead: facts.length,
    },
  });
}
