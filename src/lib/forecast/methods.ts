// Forecast methods — pure functions, take history series + params → forecast series.
//
// 4 methods (covers ~95% of mid-market forecast needs per FP&A panel):
//   - runRate(history, months) — average last N months × project forward
//   - growthPct(history, pct, months) — apply user-input growth rate
//   - linearTrend(history, months) — least-squares regression over history
//   - seasonalTrend(history, months, seasonLength, seasonStart)
//        — linear trend × seasonal index (multiplicative decomposition).
//          Requires ≥ 2 full seasonal cycles; falls back to linearTrend below that.
//
// Each returns { values: number[], method, params } so the API can audit how
// the forecast was built.

export interface ForecastResult {
  method: string;
  params: Record<string, any>;
  values: number[];   // one value per future period, in order
  basis: {
    historyCount: number;
    historyMean:  number;
    historyLast:  number;
  };
}

/** Run-rate: avg last N periods, project flat into the future. */
export function runRate(history: number[], futurePeriods: number, basisN = 3): ForecastResult {
  const recent = history.slice(-basisN);
  const avg = recent.length === 0 ? 0 : recent.reduce((a, b) => a + b, 0) / recent.length;
  return {
    method: "RUN_RATE",
    params: { basisN, avg },
    values: Array(futurePeriods).fill(avg),
    basis: {
      historyCount: history.length,
      historyMean:  history.length ? history.reduce((a, b) => a + b, 0) / history.length : 0,
      historyLast:  history[history.length - 1] ?? 0,
    },
  };
}

/** Growth %: apply growth rate to the LAST history value, compound forward. */
export function growthPct(history: number[], pct: number, futurePeriods: number): ForecastResult {
  const start = history[history.length - 1] ?? 0;
  const factor = 1 + pct;
  const out: number[] = [];
  let v = start;
  for (let i = 0; i < futurePeriods; i++) {
    v = v * factor;
    out.push(v);
  }
  return {
    method: "GROWTH_PCT",
    params: { pct, periodicCompounding: true, startFromLast: start },
    values: out,
    basis: {
      historyCount: history.length,
      historyMean:  history.length ? history.reduce((a, b) => a + b, 0) / history.length : 0,
      historyLast:  start,
    },
  };
}

/** Linear trend: fit y = a + b*x over history indices, project forward. */
export function linearTrend(history: number[], futurePeriods: number): ForecastResult {
  const n = history.length;
  if (n < 2) return runRate(history, futurePeriods);  // fallback when history too short

  // Least squares on (i, y_i)
  const xs = history.map((_, i) => i);
  const ys = history;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;
  const numer = xs.reduce((s, x, i) => s + (x - meanX) * (ys[i] - meanY), 0);
  const denom = xs.reduce((s, x) => s + (x - meanX) ** 2, 0);
  const slope = denom === 0 ? 0 : numer / denom;
  const intercept = meanY - slope * meanX;

  const out: number[] = [];
  for (let i = 0; i < futurePeriods; i++) {
    const futureX = n + i;
    out.push(intercept + slope * futureX);
  }
  return {
    method: "LINEAR_TREND",
    params: { slope, intercept },
    values: out,
    basis: {
      historyCount: n,
      historyMean:  meanY,
      historyLast:  history[n - 1] ?? 0,
    },
  };
}

/**
 * Seasonal trend: linear trend × multiplicative seasonal index.
 *
 *   1. Fit y = a + b*x over history (same as linearTrend).
 *   2. For each seasonal slot s ∈ [0..seasonLength-1], compute
 *      seasonalIndex[s] = mean( history[i] / trend(i) ) over all history points
 *      whose (i + seasonStart) % seasonLength === s.
 *      (Slots with no history points default to 1.0 — no seasonal effect.)
 *   3. forecast[i] = trend(n + i) × seasonalIndex[(n + i + seasonStart) % seasonLength]
 *
 * Inputs:
 *   - history       — chronologically ordered numeric series
 *   - futurePeriods — how many future points to project
 *   - seasonLength  — cycle length (default 12 = monthly seasonality)
 *   - seasonStart   — calendar slot of history[0]
 *                     (e.g. if first history point is 2026M03, pass 2 so slot 0 = January)
 *
 * Falls back to linearTrend when history is shorter than 2 full cycles —
 * seasonal indices would be too noisy with only 1 cycle of evidence.
 */
export function seasonalTrend(
  history: number[],
  futurePeriods: number,
  seasonLength = 12,
  seasonStart = 0,
): ForecastResult {
  const n = history.length;
  if (seasonLength < 2)               return linearTrend(history, futurePeriods);
  if (n < seasonLength * 2)           return linearTrend(history, futurePeriods);

  // Step 1 — linear trend fit (same math as linearTrend)
  const xs = history.map((_, i) => i);
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = history.reduce((s, y) => s + y, 0) / n;
  const numer = xs.reduce((s, x, i) => s + (x - meanX) * (history[i] - meanY), 0);
  const denom = xs.reduce((s, x) => s + (x - meanX) ** 2, 0);
  const slope = denom === 0 ? 0 : numer / denom;
  const intercept = meanY - slope * meanX;
  const trendAt = (i: number) => intercept + slope * i;

  // Step 2 — seasonal indices (multiplicative)
  const sumByIdx   = new Array(seasonLength).fill(0);
  const countByIdx = new Array(seasonLength).fill(0);
  for (let i = 0; i < n; i++) {
    const t = trendAt(i);
    if (t === 0) continue;                              // avoid div-by-zero noise
    const slot = ((i + seasonStart) % seasonLength + seasonLength) % seasonLength;
    sumByIdx[slot]   += history[i] / t;
    countByIdx[slot] += 1;
  }
  const seasonalIndices = sumByIdx.map((s, i) => countByIdx[i] > 0 ? s / countByIdx[i] : 1);

  // Step 3 — project forward
  const out: number[] = [];
  for (let i = 0; i < futurePeriods; i++) {
    const futureX = n + i;
    const slot = ((futureX + seasonStart) % seasonLength + seasonLength) % seasonLength;
    out.push(trendAt(futureX) * seasonalIndices[slot]);
  }

  return {
    method: "SEASONAL_TREND",
    params: { slope, intercept, seasonLength, seasonStart, seasonalIndices },
    values: out,
    basis: {
      historyCount: n,
      historyMean:  meanY,
      historyLast:  history[n - 1] ?? 0,
    },
  };
}

export type ForecastMethodName = "RUN_RATE" | "GROWTH_PCT" | "LINEAR_TREND" | "SEASONAL_TREND";

/** Dispatcher used by /api/v2/forecast/run */
export function applyForecastMethod(
  method: ForecastMethodName,
  history: number[],
  futurePeriods: number,
  params: { basisN?: number; pct?: number; seasonLength?: number; seasonStart?: number } = {}
): ForecastResult {
  switch (method) {
    case "RUN_RATE":       return runRate(history, futurePeriods, params.basisN ?? 3);
    case "GROWTH_PCT":     return growthPct(history, params.pct ?? 0, futurePeriods);
    case "LINEAR_TREND":   return linearTrend(history, futurePeriods);
    case "SEASONAL_TREND": return seasonalTrend(history, futurePeriods, params.seasonLength ?? 12, params.seasonStart ?? 0);
    default:               throw new Error(`Unknown forecast method: ${method}`);
  }
}
