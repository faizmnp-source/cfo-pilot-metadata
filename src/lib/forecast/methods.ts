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


/* ─── Phase 4 — Holt-Winters (triple exponential smoothing) ─────────
 * Multiplicative seasonal Holt-Winters. Pure JS, no deps.
 * Inputs:
 *   history       — observed series
 *   futurePeriods — how many periods to forecast
 *   seasonLength  — period of seasonality (12 for monthly w/ yearly cycle)
 *   alpha / beta / gamma — smoothing parameters (0..1). Defaults chosen
 *                          empirically: 0.4 / 0.1 / 0.3 work well for
 *                          monthly financial data.
 * Falls back to linearTrend if history < 2 full seasons.
 */
export function holtWinters(
  history: number[],
  futurePeriods: number,
  seasonLength = 12,
  alpha = 0.4,
  beta = 0.1,
  gamma = 0.3,
): ForecastResult {
  if (history.length < 2 * seasonLength) {
    const r = linearTrend(history, futurePeriods);
    r.params = { ...r.params, fallbackFrom: "HOLT_WINTERS", reason: "history < 2 seasons" };
    return r;
  }

  const n = history.length;
  // Initial level: mean of first season
  let level = history.slice(0, seasonLength).reduce((a, b) => a + b, 0) / seasonLength;
  // Initial trend: avg per-period delta between season 1 and season 2
  let trend = 0;
  for (let i = 0; i < seasonLength; i++) {
    trend += (history[seasonLength + i] - history[i]) / seasonLength;
  }
  trend /= seasonLength;
  // Initial seasonals: ratio of each first-season point to the mean (multiplicative)
  const seasonals: number[] = [];
  for (let i = 0; i < seasonLength; i++) {
    seasonals.push(level === 0 ? 1 : history[i] / level);
  }

  // Update through the rest of history
  for (let i = seasonLength; i < n; i++) {
    const s = seasonals[i % seasonLength];
    const prevLevel = level;
    level = alpha * (s === 0 ? history[i] : history[i] / s) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    seasonals[i % seasonLength] = gamma * (level === 0 ? 1 : history[i] / level) + (1 - gamma) * s;
  }

  const values: number[] = [];
  for (let k = 1; k <= futurePeriods; k++) {
    const s = seasonals[(n + k - 1) % seasonLength];
    values.push((level + k * trend) * s);
  }

  return {
    method: "HOLT_WINTERS",
    params: { alpha, beta, gamma, seasonLength, finalLevel: level, finalTrend: trend },
    values,
    basis: {
      historyCount: n,
      historyMean: history.reduce((a, b) => a + b, 0) / n,
      historyLast: history[n - 1],
    },
  };
}

/* ─── Ensemble selector ────────────────────────────────────────────
 * Backtest each method on a holdout of last `holdoutN` periods.
 * Train on history[0..n-holdoutN], predict the holdout, compute MAPE.
 * Pick the method with the lowest MAPE, then refit on full history.
 */
export type BacktestResult = {
  method: string;
  mape:   number;    // mean absolute percentage error (0..∞, lower = better)
  rmse:   number;    // root mean squared error
};

export type EnsembleResult = ForecastResult & {
  ensemble: {
    chosen: string;
    backtests: BacktestResult[];
    holdoutN: number;
    reason: string;
  };
};

const ALL_METHODS = [
  { name: "RUN_RATE",       fn: (h: number[], k: number) => runRate(h, k, 3) },
  { name: "LINEAR_TREND",   fn: (h: number[], k: number) => linearTrend(h, k) },
  { name: "SEASONAL_TREND", fn: (h: number[], k: number) => seasonalTrend(h, k, 12, 0) },
  { name: "HOLT_WINTERS",   fn: (h: number[], k: number) => holtWinters(h, k, 12) },
];

function mape(actual: number[], predicted: number[]): number {
  if (actual.length === 0) return Infinity;
  let sum = 0; let n = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] === 0) continue;
    sum += Math.abs((actual[i] - predicted[i]) / actual[i]);
    n++;
  }
  return n === 0 ? Infinity : (sum / n) * 100;
}

function rmse(actual: number[], predicted: number[]): number {
  if (actual.length === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < actual.length; i++) {
    const d = actual[i] - predicted[i];
    sum += d * d;
  }
  return Math.sqrt(sum / actual.length);
}

export function ensemble(history: number[], futurePeriods: number, holdoutN = 3): EnsembleResult {
  // Need enough history to leave a holdout and still train
  if (history.length <= holdoutN + 3) {
    const r = runRate(history, futurePeriods);
    return {
      ...r,
      ensemble: {
        chosen: "RUN_RATE",
        backtests: [],
        holdoutN,
        reason: "Not enough history for backtest — fell back to run-rate",
      },
    };
  }

  const train  = history.slice(0, history.length - holdoutN);
  const actual = history.slice(history.length - holdoutN);

  const backtests: BacktestResult[] = [];
  for (const m of ALL_METHODS) {
    try {
      const r = m.fn(train, holdoutN);
      backtests.push({
        method: r.method,                       // may be fallback method (e.g. HW → LINEAR_TREND)
        mape: mape(actual, r.values),
        rmse: rmse(actual, r.values),
      });
    } catch (e) {
      backtests.push({ method: m.name, mape: Infinity, rmse: Infinity });
    }
  }

  // Pick winner by lowest MAPE
  const winner = backtests.reduce((best, b) => (b.mape < best.mape ? b : best), backtests[0]);
  const winnerMethod = ALL_METHODS.find(m => m.name === winner.method || m.name === backtests[ALL_METHODS.findIndex(x => x.name === winner.method)]?.method) ?? ALL_METHODS[0];

  // Refit winner on full history
  const final = winnerMethod.fn(history, futurePeriods);

  return {
    ...final,
    ensemble: {
      chosen: winnerMethod.name,
      backtests,
      holdoutN,
      reason: `Picked ${winnerMethod.name} (MAPE ${winner.mape.toFixed(1)}%) — best of ${backtests.length} backtested methods`,
    },
  };
}
