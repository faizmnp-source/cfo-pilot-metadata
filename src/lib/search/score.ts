// Pure scoring function for the global /api/v2/search/global route.
// Extracted here for unit-test pinning (route file is dim-heavy: prisma
// + auth, can't be cleanly unit-tested without mocks).
//
// Contract (load-bearing — pinned by score.test.ts):
//   - empty / whitespace q  → 0
//   - exact case-insensitive match → 100
//   - prefix match (case-insensitive) → 90
//   - substring match (case-insensitive) → 70
//   - else token-overlap fallback: 40 + 10 × #hits (0 hits → 0)
//   - Determinism + purity: input args are NOT mutated.
//
// Stronger matches dominate weaker ones (the function returns the FIRST
// matching tier — it does not max-aggregate). A future refactor that
// changes this order changes search ranking on every page, so any edit
// here must update the tests in lock-step.

export function score(q: string, title: string): number {
  const qn = q.toLowerCase().trim();
  const t = title.toLowerCase();
  if (!qn) return 0;
  if (t === qn) return 100;
  if (t.startsWith(qn)) return 90;
  if (t.includes(qn)) return 70;
  // Token overlap — only when no substring hit.
  const qt = new Set(qn.split(/\s+/));
  const tt = new Set(t.split(/\s+/));
  let hits = 0;
  qt.forEach((tok) => {
    if (tt.has(tok)) hits++;
  });
  return hits === 0 ? 0 : 40 + hits * 10;
}
