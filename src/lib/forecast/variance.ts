// Forecast Variance — pure functions for the Forecast Variance Scorecard (Sprint W.2 + W.3).
//
// Given two parallel lists of fact rows (one from the "actual" scenario and
// one from the "forecast" scenario, scoped to the same account × entity × period
// intersection), compute the row-level variance, the variance %, and aggregate
// totals.
//
// Sprint W.3 adds account-type-aware favorability — REVENUE rows where
// actual > forecast are "favorable" (beat plan), EXPENSE rows where
// actual > forecast are "unfavorable" (overspent). Balance-sheet types
// (ASSET / LIABILITY / EQUITY) are marked "neutral" because favorability
// is context-dependent and we'd rather not color them wrong.
//
// Kept dependency-free so it can be unit-tested without a database.

export type FactRowLite = {
  accountId: string;
  entityId:  string;
  timeId:    string;
  value:     number;
};

// Sprint W.3 — account-type-aware favorability semantics.
export type AccountTypeForFav =
  | "REVENUE"
  | "EXPENSE"
  | "ASSET"
  | "LIABILITY"
  | "EQUITY";

export type Favorability =
  | "favorable"     // beat plan in a way that improves the P&L
  | "unfavorable"   // worse than plan in a way that hurts the P&L
  | "flat"          // |variance| < epsilon
  | "neutral";      // unknown account type or non-P&L type — don't color

export type VarianceRow = {
  accountId:  string;
  entityId:   string;
  timeId:     string;
  actual:     number;
  forecast:   number;
  variance:   number;            // actual - forecast
  variancePct: number | null;    // (actual - forecast) / |forecast| × 100; null if forecast == 0
  direction:  "pos" | "neg" | "flat";  // sign of (actual - forecast)
  // Sprint W.3 fields — populated by `applyFavorability()`; absent on raw
  // `computeVarianceRows()` output so the lib stays back-compat.
  favorability?: Favorability;
  accountType?: AccountTypeForFav | null;
};

export type VarianceTotals = {
  actual:      number;
  forecast:    number;
  variance:    number;
  variancePct: number | null;    // sum(variance) / |sum(forecast)| × 100; null if total forecast == 0
  rowCount:    number;
};

// Sprint W.3 — counts by favorability bucket. Useful for the KPI strip.
export type FavorabilityTotals = {
  favorable:   number;
  unfavorable: number;
  flat:        number;
  neutral:     number;
  // Net favorable impact in currency units: sum over favorable rows MINUS
  // sum over unfavorable rows of |variance|. A simple "did our beats outrun
  // our misses?" number.
  netFavorableImpact: number;
};

/**
 * Build variance rows from parallel actual + forecast fact lists.
 *
 * Behaviour:
 *  - Joins on (accountId|entityId|timeId).
 *  - Rows present in only one side are still emitted, with the missing side as 0.
 *  - variancePct is null when forecast is 0 (avoids divide-by-zero noise).
 *  - direction is "flat" when |variance| < epsilon (default 1e-6).
 */
export function computeVarianceRows(
  actuals: FactRowLite[],
  forecasts: FactRowLite[],
  opts: { epsilon?: number } = {}
): VarianceRow[] {
  const epsilon = opts.epsilon ?? 1e-6;

  const key = (r: { accountId: string; entityId: string; timeId: string }) =>
    `${r.accountId}|${r.entityId}|${r.timeId}`;

  const actualMap = new Map<string, number>();
  for (const a of actuals) {
    actualMap.set(key(a), (actualMap.get(key(a)) ?? 0) + a.value);
  }
  const forecastMap = new Map<string, number>();
  for (const f of forecasts) {
    forecastMap.set(key(f), (forecastMap.get(key(f)) ?? 0) + f.value);
  }

  const allKeys = new Set<string>();
  actualMap.forEach((_v, k) => allKeys.add(k));
  forecastMap.forEach((_v, k) => allKeys.add(k));
  const rows: VarianceRow[] = [];
  const keysList: string[] = [];
  allKeys.forEach(k => keysList.push(k));
  for (const k of keysList) {
    const [accountId, entityId, timeId] = k.split("|");
    const actual   = actualMap.get(k)   ?? 0;
    const forecast = forecastMap.get(k) ?? 0;
    const variance = actual - forecast;
    const variancePct = Math.abs(forecast) < epsilon ? null : (variance / Math.abs(forecast)) * 100;
    const direction: VarianceRow["direction"] =
      Math.abs(variance) < epsilon ? "flat" : variance > 0 ? "pos" : "neg";
    rows.push({ accountId, entityId, timeId, actual, forecast, variance, variancePct, direction });
  }
  // Stable sort: by (accountId, entityId, timeId) so output is deterministic
  rows.sort((a, b) =>
    a.accountId.localeCompare(b.accountId) ||
    a.entityId.localeCompare(b.entityId) ||
    a.timeId.localeCompare(b.timeId)
  );
  return rows;
}

/** Aggregate variance totals across a list of variance rows. */
export function computeVarianceTotals(rows: VarianceRow[], opts: { epsilon?: number } = {}): VarianceTotals {
  const epsilon = opts.epsilon ?? 1e-6;
  let actual = 0, forecast = 0;
  for (const r of rows) { actual += r.actual; forecast += r.forecast; }
  const variance = actual - forecast;
  const variancePct = Math.abs(forecast) < epsilon ? null : (variance / Math.abs(forecast)) * 100;
  return { actual, forecast, variance, variancePct, rowCount: rows.length };
}

// Sprint W.3 — favorability rule
//
// Classify a single (accountType, variance) pair as favorable / unfavorable /
// flat / neutral. Pure function so it can be reused in lib + UI + tests.
export function classifyFavorability(
  accountType: AccountTypeForFav | null | undefined,
  variance: number,
  opts: { epsilon?: number } = {}
): Favorability {
  const epsilon = opts.epsilon ?? 1e-6;
  if (Math.abs(variance) < epsilon) return "flat";
  if (accountType === "REVENUE") {
    return variance > 0 ? "favorable" : "unfavorable";
  }
  if (accountType === "EXPENSE") {
    return variance > 0 ? "unfavorable" : "favorable";
  }
  // ASSET / LIABILITY / EQUITY / null / unknown → neutral
  return "neutral";
}

/**
 * Annotate variance rows with favorability + accountType, using a lookup
 * map keyed by accountId. Returns a new array; does not mutate input.
 *
 * Rows whose accountId is not in `accountTypeMap` are tagged with
 * accountType=null and favorability="neutral" (or "flat" if variance is ~0).
 */
export function applyFavorability(
  rows: VarianceRow[],
  accountTypeMap: Map<string, AccountTypeForFav | null>,
  opts: { epsilon?: number } = {}
): VarianceRow[] {
  return rows.map(r => {
    const accountType = accountTypeMap.get(r.accountId) ?? null;
    return {
      ...r,
      accountType,
      favorability: classifyFavorability(accountType, r.variance, opts),
    };
  });
}

/**
 * Roll up favorability buckets across a row set. Pairs with `applyFavorability()`.
 * Rows missing a favorability tag are counted as "neutral".
 */
export function computeFavorabilityTotals(rows: VarianceRow[]): FavorabilityTotals {
  let favorable = 0, unfavorable = 0, flat = 0, neutral = 0;
  let netImpact = 0;
  for (const r of rows) {
    const fav = r.favorability ?? "neutral";
    if (fav === "favorable")        { favorable++;   netImpact += Math.abs(r.variance); }
    else if (fav === "unfavorable") { unfavorable++; netImpact -= Math.abs(r.variance); }
    else if (fav === "flat")        { flat++; }
    else                            { neutral++; }
  }
  return {
    favorable,
    unfavorable,
    flat,
    neutral,
    netFavorableImpact: netImpact,
  };
}
