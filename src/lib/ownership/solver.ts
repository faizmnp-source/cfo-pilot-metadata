/*
 * Indirect ownership solver. Given a set of direct edges
 * (parent → child, pctOwned), compute the indirect ownership
 * matrix: pct of any leaf an ancestor effectively owns.
 *
 * Algorithm: for each ancestor, BFS down; multiply pctOwned at each
 * edge; sum across multiple paths.
 *
 * Pure — no DB. Caller passes the edge list.
 */
export type OwnershipEdge = { parentId: string; childId: string; pct: number };

/** Returns map: parentId → Map<descendantId, pctOwned> (0..1). */
export function indirectOwnershipMatrix(edges: OwnershipEdge[]): Map<string, Map<string, number>> {
  // Index edges by parent
  const byParent = new Map<string, OwnershipEdge[]>();
  for (const e of edges) {
    if (!byParent.has(e.parentId)) byParent.set(e.parentId, []);
    byParent.get(e.parentId)!.push(e);
  }
  const allNodes = new Set<string>();
  for (const e of edges) { allNodes.add(e.parentId); allNodes.add(e.childId); }

  const out = new Map<string, Map<string, number>>();
  for (const parent of Array.from(allNodes)) {
    const acc = new Map<string, number>();
    // BFS-style with path multiplication
    type Frame = { node: string; pct: number };
    const stack: Frame[] = [{ node: parent, pct: 1 }];
    const seenEdge = new Set<string>();   // prevent infinite loops in cyclical declarations
    while (stack.length) {
      const f = stack.pop()!;
      const kids = byParent.get(f.node) ?? [];
      for (const k of kids) {
        const edgeKey = `${f.node}|${k.childId}|${f.pct.toFixed(6)}`;
        if (seenEdge.has(edgeKey)) continue;
        seenEdge.add(edgeKey);
        const newPct = f.pct * (k.pct / 100);
        acc.set(k.childId, (acc.get(k.childId) ?? 0) + newPct);
        stack.push({ node: k.childId, pct: newPct });
      }
    }
    out.set(parent, acc);
  }
  return out;
}
