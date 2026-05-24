// Universal Time POV resolver.
//
// Given any Time member code (year FY2026, half FY2026H1, quarter FY2026Q3,
// month 2026-04, or custom rollups), returns the list of LEAF month IDs
// underneath it. The reports engine uses this to pull facts at any level.
//
// Pattern matches OneStream's POV behavior: pick any member, system finds
// the leaves and aggregates upward.

import { prisma } from "@/lib/prisma";

const MAX_DEPTH = 8;   // year → half → quarter → month is 3, give headroom

/** Resolve a Time member code to the list of leaf month IDs underneath it. */
export async function resolveTimeMembersToLeafMonths(
  tenantId: string,
  timeMemberCode: string
): Promise<{ leafMonthIds: string[]; resolvedMember: { id: string; code: string; name: string } | null; depth: number }> {
  // 1. Find the Time dim
  const timeDim = await prisma.dimension.findFirst({
    where: { tenantId, kind: "TIME" as any },
    select: { id: true },
  });
  if (!timeDim) return { leafMonthIds: [], resolvedMember: null, depth: 0 };

  // 2. Find the requested member
  const root = await prisma.dimensionMember.findFirst({
    where: { tenantId, dimensionId: timeDim.id, memberCode: timeMemberCode },
    select: { id: true, memberCode: true, memberName: true },
  });
  if (!root) return { leafMonthIds: [], resolvedMember: null, depth: 0 };

  // 3. BFS down the hierarchy
  let frontier: string[] = [root.id];
  const leaves: string[] = [];
  let depth = 0;

  for (depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth++) {
    const edges = await prisma.hierarchyEdge.findMany({
      where: { tenantId, parentMemberId: { in: frontier }},
      select: { parentMemberId: true, childMemberId: true },
    });

    // Members in current frontier that have NO children are leaves
    const parentsWithChildren = new Set(edges.map(e => e.parentMemberId));
    for (const id of frontier) {
      if (!parentsWithChildren.has(id)) leaves.push(id);
    }

    // Advance to next level
    frontier = edges.map(e => e.childMemberId);
  }
  // Anything left in frontier at max depth → treat as leaves (safety)
  for (const id of frontier) leaves.push(id);

  // 4. Filter to MONTH-level only (members matching YYYY-MM)
  // (in v1, leaves of the FY tree ARE months; this filter is defence-in-depth)
  const monthMembers = await prisma.dimensionMember.findMany({
    where: { tenantId, id: { in: leaves }, isActive: true },
    select: { id: true, memberCode: true },
  });
  const monthIds = monthMembers
    .filter(m => /^\d{4}-\d{2}$/.test(m.memberCode))
    .map(m => m.id);

  // If user picked a leaf month directly, the BFS finds no edges → leaves=[root]
  // and monthIds correctly includes just that month.

  return {
    leafMonthIds: monthIds,
    resolvedMember: { id: root.id, code: root.memberCode, name: root.memberName },
    depth,
  };
}
