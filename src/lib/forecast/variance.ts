// Forecast Variance — pure functions for the Forecast Variance Scorecard (Sprint W.2).
//
// Given two parallel lists of fact rows (one from the "actual" scenario and
// one from the "forecast" scenario, scoped to the same account × entity × period
// intersection), compute the row-level variance, the variance %, and aggregate
// totals.
//
// Kept dependency-free so it can be unit-tested without a database.

export type FactRowLite = {
  accountId: string;
  entityId:  string;
  timeId:    string;
  value:     number;
};

export type VarianceRow = {
  accountId:  string;
  entityId:   string;
  timeId:     string;
  actual:     number;
  forecast:   number;
  variance:   number;            // actual - forecast
  variancePct: number | null;    // (actual - forecast) / |forecast| × 100; null if forecast == 0
  direction:  "pos" | "neg" | "flat";  // sign of (actual - forecast)
};

export type VarianceTotals = {
  actual:      number;
  forecast:    number;
  variance:    number;
  variancePct: number | null;    // sum(variance) / |sum(forecast)| × 100; null if total forecast == 0
  rowCount:    number;
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
