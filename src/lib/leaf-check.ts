// Helpers to detect "leaf" status for dimension members.
//
// EPM rule: data input only at leaf members. A member is a leaf if it has
// NO children in any hierarchy of its dimension. Parents are read-only
// rollups — facts there violate the calculation engine's contract.
//
// We cache results per-request via a small Map. For grid loads of 50-200
// accounts, batching the leaf check into one query (isMemberLeafBatch) is
// dramatically cheaper than per-row findFirst.

import { prisma } from "./prisma";

/**
 * Returns a Set of member IDs that ARE NOT leaves (i.e. have children
 * somewhere in any hierarchy of their dimension). Anything not in the
 * returned set is a leaf.
 */
export async function findNonLeafMembers(
  tenantId: string,
  memberIds: string[],
): Promise<Set<string>> {
  if (memberIds.length === 0) return new Set();
  const edges = await prisma.hierarchyEdge.findMany({
    where: { tenantId, parentMemberId: { in: memberIds } },
    select: { parentMemberId: true },
    distinct: ["parentMemberId"],
  });
  return new Set(edges.map((e) => e.parentMemberId));
}

/**
 * For a single member — true if it has children (NOT a leaf).
 */
export async function isMemberParent(
  tenantId: string,
  memberId: string,
): Promise<boolean> {
  const edge = await prisma.hierarchyEdge.findFirst({
    where: { tenantId, parentMemberId: memberId },
    select: { id: true },
  });
  return Boolean(edge);
}
