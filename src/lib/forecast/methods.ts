// Forecast methods — pure functions, take history series + params → forecast series.
//
// 3 methods in v1 (covers ~80% of mid-market forecast needs per FP&A panel):
//   - runRate(history, months) — average last N months × project forward
//   - growthPct(history, pct, months) — apply user-input growth rate
//   - linearTrend(history, months) — least-squares regression over history
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

/** Dispatcher used by /api/v2/forecast/run */
export function applyForecastMethod(
  method: "RUN_RATE" | "GROWTH_PCT" | "LINEAR_TREND",
  history: number[],
  futurePeriods: number,
  params: { basisN?: number; pct?: number } = {}
): ForecastResult {
  switch (method) {
    case "RUN_RATE":     return runRate(history, futurePeriods, params.basisN ?? 3);
    case "GROWTH_PCT":   return growthPct(history, params.pct ?? 0, futurePeriods);
    case "LINEAR_TREND": return linearTrend(history, futurePeriods);
    default:             throw new Error(`Unknown forecast method: ${method}`);
  }
}
