// POST /api/v2/consolidation/preview
// Body: { parentEntityCode: string, scenarioCode?: string, periodCode?: string }
// Returns: { totals: { withoutOwnership, withOwnership }, lines: AdjustedFact[] }
//
// Pulls all current facts under the parent's subsidiaries and shows what
// the ownership-aware rollup would produce vs flat sum. Read-only —
// doesn't write anything. Used by /consolidation/ownership to preview
// the impact before integrating into the full consol engine.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { rollupWithOwnership } from "@/lib/ownership/apply";

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const body = await req.json().catch(() => null);
  if (!body?.parentEntityCode) return apiError("parentEntityCode required", 400);

  const parent = await prisma.dimensionMember.findFirst({
    where: { tenantId: auth.tid, dimension: { code: "entity" }, memberCode: body.parentEntityCode },
    select: { id: true, memberCode: true, memberName: true },
  });
  if (!parent) return apiError(`Parent "${body.parentEntityCode}" not found`, 404);

  const ownership = await (prisma as any).entityOwnership.findMany({
    where: { tenantId: auth.tid },
    select: { parentEntityId: true, childEntityId: true, pctOwned: true },
  });
  if (ownership.length === 0) {
    return apiResponse({
      parent: { id: parent.id, code: parent.memberCode, name: parent.memberName },
      totals: { withoutOwnership: 0, withOwnership: 0 },
      lines: [],
      note: "No EntityOwnership rows — add direct edges at /consolidation/ownership first.",
    });
  }

  // Restrict facts to the subsidiaries the parent owns + the parent itself
  const edges = ownership.map((e: any) => ({ parentId: e.parentEntityId, childId: e.childEntityId, pct: Number(e.pctOwned) }));

  // Resolve all involved entity ids (subs of parent + parent)
  const subs = new Set<string>([parent.id]);
  const byParent = new Map<string, string[]>();
  for (const e of edges) { if (!byParent.has(e.parentId)) byParent.set(e.parentId, []); byParent.get(e.parentId)!.push(e.childId); }
  const stack = [parent.id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of (byParent.get(cur) ?? [])) {
      if (!subs.has(c)) { subs.add(c); stack.push(c); }
    }
  }

  // Optional scenario + period filters
  let scenarioId: string | undefined;
  let periodFilter: any = undefined;
  if (body.scenarioCode) {
    const scn = await prisma.dimensionMember.findFirst({
      where: { tenantId: auth.tid, dimension: { code: "scenario" }, memberCode: body.scenarioCode },
      select: { id: true },
    });
    if (!scn) return apiError(`Scenario "${body.scenarioCode}" not found`, 404);
    scenarioId = scn.id;
  }
  if (body.periodCode) {
    const { resolveTimeMembersToLeafMonths } = await import("@/lib/reports/time-resolver");
    const { leafMonthIds } = await resolveTimeMembersToLeafMonths(auth.tid, body.periodCode);
    periodFilter = { timeId: { in: leafMonthIds }};
  }

  // Pull current facts for those subs
  const facts = await prisma.factRow.findMany({
    where: {
      tenantId: auth.tid,
      entityId: { in: Array.from(subs) },
      isCurrent: true,
      ...(scenarioId ? { scenarioId } : {}),
      ...(periodFilter ?? {}),
    },
    select: { entityId: true, valueReporting: true, accountId: true, timeId: true },
    take: 50_000,
  });

  const result = rollupWithOwnership(parent.id, facts.map(f => ({
    subsidiaryId: f.entityId, value: Number(f.valueReporting), accountId: f.accountId, timeId: f.timeId,
  })), edges);

  // Totals
  const withoutOwnership = facts.reduce((a, f) => a + Number(f.valueReporting), 0);
  return apiResponse({
    parent: { id: parent.id, code: parent.memberCode, name: parent.memberName },
    totals: {
      withoutOwnership,
      withOwnership: result.total,
      delta: result.total - withoutOwnership,
    },
    factCount: facts.length,
    // Show first 200 ownership-adjusted lines for the UI; trim the rest
    sampleLines: result.lines.slice(0, 200),
  });
}
