/*
 * Section 20 — Ownership-aware rollup helper.
 * Given a parent + its subsidiary facts + the indirect-ownership matrix
 * from src/lib/ownership/solver.ts, scale each subsidiary's value by
 * the parent's effective % ownership of that subsidiary.
 *
 *   adjustedValue(parent, sub, value) = value × indirectPct(parent → sub)
 *
 * Subsidiaries the parent doesn't own get 0. 100% direct ownership = 1.0.
 *
 * Real consolidation uses this at the rollup step before summing into
 * the parent. Pure — caller fetches the matrix once via
 * indirectOwnershipMatrix() and reuses across many facts.
 */

import type { OwnershipEdge } from "./solver";
import { indirectOwnershipMatrix } from "./solver";

export type SubsidiaryFact = {
  subsidiaryId: string;
  value:        number;
  accountId?:   string;
  timeId?:      string;
};

export type AdjustedFact = SubsidiaryFact & {
  pctOwned:      number;      // 0..1 — the effective ownership applied
  originalValue: number;
  adjustedValue: number;
  ownershipNote: string;      // "100% direct" | "60% via IN_OPS" | "no ownership"
};

/**
 * Returns the matrix lookup function so callers can reuse across many parents.
 * pct returned is 0..1 (not 0..100).
 */
export function makeOwnershipLookup(edges: OwnershipEdge[]) {
  const matrix = indirectOwnershipMatrix(edges);
  return function lookup(parentId: string, subsidiaryId: string): number {
    if (parentId === subsidiaryId) return 1;
    return matrix.get(parentId)?.get(subsidiaryId) ?? 0;
  };
}

export function applyOwnership(
  parentId: string,
  facts: SubsidiaryFact[],
  edges: OwnershipEdge[],
): AdjustedFact[] {
  const lookup = makeOwnershipLookup(edges);
  return facts.map(f => {
    const pct = lookup(parentId, f.subsidiaryId);
    return {
      ...f,
      pctOwned: pct,
      originalValue: f.value,
      adjustedValue: f.value * pct,
      ownershipNote:
        pct === 0 ? "no ownership"
        : pct === 1 ? "100% (self or fully owned)"
        : `${(pct * 100).toFixed(2)}%`,
    };
  });
}

/** Sum-rollup convenience: returns the total adjusted value into the parent. */
export function rollupWithOwnership(parentId: string, facts: SubsidiaryFact[], edges: OwnershipEdge[]): {
  total: number; lines: AdjustedFact[];
} {
  const lines = applyOwnership(parentId, facts, edges);
  const total = lines.reduce((a, b) => a + b.adjustedValue, 0);
  return { total, lines };
}
