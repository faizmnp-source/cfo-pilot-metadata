/*
 * Smart Mapping Engine — core suggester.
 * Given a kind + sourceKey + optional context, returns ranked candidate
 * targets with confidence scores. Reads from existing MappingRule rows
 * (highest hitCount = most-used historical pick), augmented by string
 * similarity heuristics. AI augmentation happens in /api/v2/mappings/suggest.
 */

export type MappingKind = "ACCOUNT" | "BANK_TXN" | "MEMBER" | "COLUMN";

export type Candidate = {
  targetMemberId?: string | null;
  targetField?: string | null;
  targetCode?: string | null;
  targetName?: string | null;
  confidence: number;  // 0..100
  reason: string;
  source: "RULE" | "FREQUENCY" | "SIMILARITY" | "AI";
};

/**
 * Levenshtein-based similarity (0..1). Cheap; good enough for ranking.
 */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  a = a.toLowerCase().trim(); b = b.toLowerCase().trim();
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1]);
    }
  }
  return 1 - dp[m][n] / Math.max(m, n);
}

/**
 * Token-set similarity — good for "Salary Expense" vs "Salaries Expenses".
 */
export function tokenSetSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const norm = (s: string) => new Set(
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean)
  );
  const A = norm(a), B = norm(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  Array.from(A).forEach(t => { if (B.has(t)) inter++; });
  return inter / Math.max(A.size, B.size);
}

/**
 * Composite score for ranking candidates.
 * historyHits × 0.55 + tokenSim × 0.30 + leven × 0.15, scaled to 0..100.
 */
export function score(sourceKey: string, target: { name: string; code?: string }, historyHits: number): number {
  const ts = Math.max(
    tokenSetSimilarity(sourceKey, target.name),
    target.code ? tokenSetSimilarity(sourceKey, target.code) : 0
  );
  const lv = Math.max(
    similarity(sourceKey, target.name),
    target.code ? similarity(sourceKey, target.code) : 0
  );
  const hits = Math.min(1, historyHits / 10);
  return Math.round((hits * 0.55 + ts * 0.30 + lv * 0.15) * 100);
}
