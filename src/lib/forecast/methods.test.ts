// Pure-math tests for forecast methods. Run via `npm test`.
// No DB, no network, no mocks needed — these functions are pure.

import { runRate, growthPct, linearTrend, seasonalTrend, applyForecastMethod } from "./methods";

describe("forecast/methods", () => {
  describe("runRate", () => {
    it("returns avg of last 3 by default", () => {
      const r = runRate([10, 20, 30, 40, 50, 60], 4);
      // last 3 = [40, 50, 60], avg = 50
      expect(r.values).toEqual([50, 50, 50, 50]);
      expect(r.method).toBe("RUN_RATE");
    });

    it("respects basisN param", () => {
      const r = runRate([10, 20, 30, 40, 50, 60], 2, 5);
      // last 5 = [20..60], avg = 40
      expect(r.values).toEqual([40, 40]);
    });

    it("returns 0s when history is empty", () => {
      const r = runRate([], 3);
      expect(r.values).toEqual([0, 0, 0]);
    });

    it("populates basis stats correctly", () => {
      const r = runRate([100, 200, 300], 1);
      expect(r.basis.historyCount).toBe(3);
      expect(r.basis.historyMean).toBe(200);
      expect(r.basis.historyLast).toBe(300);
    });
  });

  describe("growthPct", () => {
    it("compounds from last actual", () => {
      const r = growthPct([100], 0.1, 3);
      // 100 -> 110 -> 121 -> 133.1
      expect(r.values[0]).toBeCloseTo(110, 5);
      expect(r.values[1]).toBeCloseTo(121, 5);
      expect(r.values[2]).toBeCloseTo(133.1, 5);
    });

    it("handles negative growth", () => {
      const r = growthPct([100], -0.1, 2);
      expect(r.values[0]).toBeCloseTo(90, 5);
      expect(r.values[1]).toBeCloseTo(81, 5);
    });

    it("handles zero growth (flat)", () => {
      const r = growthPct([100], 0, 3);
      expect(r.values).toEqual([100, 100, 100]);
    });

    it("handles empty history", () => {
      const r = growthPct([], 0.1, 2);
      expect(r.values[0]).toBe(0);
      expect(r.values[1]).toBe(0);
    });
  });

  describe("linearTrend", () => {
    it("extends a perfect line", () => {
      // y = 2x + 10 → [10, 12, 14, 16, 18]
      const r = linearTrend([10, 12, 14, 16, 18], 3);
      // index 5 → 20, 6 → 22, 7 → 24
      expect(r.values[0]).toBeCloseTo(20, 5);
      expect(r.values[1]).toBeCloseTo(22, 5);
      expect(r.values[2]).toBeCloseTo(24, 5);
    });

    it("handles flat history (slope 0)", () => {
      const r = linearTrend([50, 50, 50, 50], 2);
      expect(r.values[0]).toBeCloseTo(50, 5);
      expect(r.values[1]).toBeCloseTo(50, 5);
    });

    it("falls back to run-rate when n < 2", () => {
      const r = linearTrend([42], 3);
      // Should match runRate behavior
      expect(r.method).toBe("RUN_RATE");
      expect(r.values).toEqual([42, 42, 42]);
    });

    it("trends downward when slope negative", () => {
      const r = linearTrend([100, 90, 80, 70], 2);
      expect(r.values[0]).toBeLessThan(70);
      expect(r.values[1]).toBeLessThan(r.values[0]);
    });
  });

  describe("seasonalTrend", () => {
    it("falls back to linearTrend when history < 2 full cycles", () => {
      // 11 months of history with seasonLength=12 → 0 full cycles → fallback.
      const r = seasonalTrend([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 3, 12, 0);
      expect(r.method).toBe("LINEAR_TREND");
    });

    it("recovers flat seasonal pattern (no trend, repeating cycle)", () => {
      // 4 cycles of [100, 200, 50, 150]. No trend, just seasonality.
      const cycle = [100, 200, 50, 150];
      const history = [...cycle, ...cycle, ...cycle, ...cycle];
      const r = seasonalTrend(history, 4, 4, 0);
      expect(r.method).toBe("SEASONAL_TREND");
      // Next 4 forecast values should approximate the cycle.
      // Tight tolerance: slope is ~0, indices recover the cycle ratios.
      expect(r.values[0]).toBeCloseTo(100, 0);
      expect(r.values[1]).toBeCloseTo(200, 0);
      expect(r.values[2]).toBeCloseTo(50,  0);
      expect(r.values[3]).toBeCloseTo(150, 0);
    });

    it("preserves trend × seasonality direction (growth + cycle)", () => {
      // Underlying: trend = 100 + 10*i, seasonal factor cycle [1.0, 1.5, 0.5, 1.0].
      // Build 4 cycles of history.
      // (Note: linear regression on multiplicative data introduces bias, so we
      // assert structural properties — ordering + monotonic growth — rather
      // than exact recovery of the generative parameters.)
      const cycleFactors = [1.0, 1.5, 0.5, 1.0];
      const history: number[] = [];
      for (let i = 0; i < 16; i++) {
        const trend = 100 + 10 * i;
        history.push(trend * cycleFactors[i % 4]);
      }
      const r = seasonalTrend(history, 8, 4, 0);

      // Slot 1 (high-factor) values dominate slot 2 (low-factor) values in
      // the same cycle — proves multiplicative seasonality is preserved.
      expect(r.values[1]).toBeGreaterThan(r.values[0]);
      expect(r.values[1]).toBeGreaterThan(r.values[2]);
      expect(r.values[5]).toBeGreaterThan(r.values[6]);

      // Trend is preserved: values[5] (slot 1, cycle 2) > values[1] (slot 1, cycle 1)
      expect(r.values[5]).toBeGreaterThan(r.values[1]);
    });

    it("returns seasonalIndices in params for audit", () => {
      const cycle = [10, 20, 30, 40];
      const history = [...cycle, ...cycle, ...cycle];
      const r = seasonalTrend(history, 4, 4, 0);
      const idx = (r.params as any).seasonalIndices as number[];
      expect(idx).toHaveLength(4);
      // Indices should be ratios, all positive, summing to roughly seasonLength.
      const sum = idx.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(4, 0);
    });

    it("seasonalIndices align under seasonStart shift", () => {
      // Build 3 cycles of [10, 20, 30, 40]. With seasonStart=2, slot 2 of the
      // cycle aligns with history[0] (=10), slot 3 with history[1] (=20),
      // slot 0 with history[2] (=30), slot 1 with history[3] (=40).
      const cycle = [10, 20, 30, 40];
      const history = [...cycle, ...cycle, ...cycle];
      const r = seasonalTrend(history, 1, 4, 2);
      const idx = (r.params as any).seasonalIndices as number[];

      // After the seasonStart shift, slot 1 ranks highest (carries the 40s),
      // slot 2 the lowest (carries the 10s). This validates the shift logic
      // (without depending on the noisy slope/intercept fit).
      expect(idx[1]).toBeGreaterThan(idx[0]);
      expect(idx[0]).toBeGreaterThan(idx[3]);
      expect(idx[3]).toBeGreaterThan(idx[2]);
    });
  });

  describe("applyForecastMethod (dispatcher)", () => {
    it("dispatches to RUN_RATE", () => {
      const r = applyForecastMethod("RUN_RATE", [10, 20, 30], 2);
      expect(r.method).toBe("RUN_RATE");
    });

    it("dispatches to GROWTH_PCT", () => {
      const r = applyForecastMethod("GROWTH_PCT", [100], 1, { pct: 0.05 });
      expect(r.method).toBe("GROWTH_PCT");
      expect(r.values[0]).toBeCloseTo(105, 5);
    });

    it("dispatches to LINEAR_TREND", () => {
      const r = applyForecastMethod("LINEAR_TREND", [10, 20, 30, 40], 1);
      expect(r.method).toBe("LINEAR_TREND");
      expect(r.values[0]).toBeCloseTo(50, 5);
    });

    it("dispatches to SEASONAL_TREND", () => {
      const cycle = [100, 200, 50, 150];
      const r = applyForecastMethod("SEASONAL_TREND", [...cycle, ...cycle, ...cycle], 1, { seasonLength: 4 });
      expect(r.method).toBe("SEASONAL_TREND");
      expect(r.values[0]).toBeCloseTo(100, 0);
    });

    it("SEASONAL_TREND with insufficient history falls back gracefully", () => {
      // Only 1 cycle of history → falls back to LINEAR_TREND (no throw)
      const r = applyForecastMethod("SEASONAL_TREND", [10, 20, 30, 40], 1, { seasonLength: 4 });
      expect(r.method).toBe("LINEAR_TREND");
    });

    it("throws on unknown method", () => {
      expect(() => applyForecastMethod("BOGUS" as any, [1, 2], 1)).toThrow(/Unknown forecast method/);
    });
  });
});


import { holtWinters, ensemble } from "./methods";

describe("holtWinters", () => {
  it("falls back to linearTrend when history < 2 seasons", () => {
    const h = Array(11).fill(0).map((_, i) => 100 + i);  // 11 points, seasonLength 12
    const r = holtWinters(h, 3, 12);
    expect(r.params.fallbackFrom).toBe("HOLT_WINTERS");
  });

  it("preserves multiplicative seasonality direction over 24 months", () => {
    const cycle = [1.0, 1.5, 0.5, 1.0, 1.2, 0.8, 1.1, 1.4, 0.9, 1.0, 1.3, 0.7];
    const h: number[] = [];
    for (let i = 0; i < 24; i++) {
      const trend = 100 + 5 * i;
      h.push(trend * cycle[i % 12]);
    }
    const r = holtWinters(h, 12, 12);
    // High-factor slots should beat low-factor slots in the forecast window
    expect(r.values[1]).toBeGreaterThan(r.values[2]);   // slot 1 > slot 2
    expect(r.values[7]).toBeGreaterThan(r.values[6]);   // slot 7 > slot 6
  });
});

describe("ensemble", () => {
  it("returns RUN_RATE fallback on tiny history", () => {
    const r = ensemble([100, 110, 120], 3);
    expect(r.ensemble.chosen).toBe("RUN_RATE");
    expect(r.ensemble.backtests).toHaveLength(0);
  });

  it("picks LINEAR_TREND on a clean trend", () => {
    const h = Array(20).fill(0).map((_, i) => 100 + 5 * i);
    const r = ensemble(h, 3, 3);
    expect(["LINEAR_TREND", "HOLT_WINTERS"]).toContain(r.ensemble.chosen);
    expect(r.ensemble.backtests.length).toBeGreaterThan(0);
  });

  it("provides MAPE for every method tested", () => {
    const h = Array(24).fill(0).map((_, i) => 100 + i + 10 * Math.sin(i / 3));
    const r = ensemble(h, 6, 6);
    for (const b of r.ensemble.backtests) {
      expect(Number.isFinite(b.mape) || b.mape === Infinity).toBe(true);
      expect(Number.isFinite(b.rmse) || b.rmse === Infinity).toBe(true);
    }
  });
});


/* ─── Phase 4.3 — holtWinters comprehensive coverage ───────────────────
 * The Phase 4.1 ship landed holtWinters + ensemble with 6 tests covering
 * the happy path. These tests pin every load-bearing edge: fallback
 * boundaries, default params, method tag, shape contract, and numerical
 * properties. Drift in any of these silently re-routes forecasts a CFO
 * shipping board-pack commentary will trust.
 */
describe("holtWinters — fallback boundaries", () => {
  // Boundary check: holtWinters requires history.length >= 2 * seasonLength.
  // Below that, it ALWAYS routes through linearTrend (which itself falls
  // back to runRate when n < 2).
  it("falls back when history is empty (length 0 < 24)", () => {
    const r = holtWinters([], 3, 12);
    // empty history → linearTrend(n<2) → runRate(empty) → zeros
    expect(r.values).toEqual([0, 0, 0]);
    expect(r.params.fallbackFrom).toBe("HOLT_WINTERS");
  });

  it("falls back when history has only 1 point", () => {
    const r = holtWinters([42], 2, 12);
    // linearTrend with n=1 falls through to runRate → returns avg of [42]
    expect(r.values).toEqual([42, 42]);
    expect(r.params.fallbackFrom).toBe("HOLT_WINTERS");
  });

  it("falls back at 1 less than 2*seasonLength (history=23, seasonLength=12)", () => {
    const h = Array(23).fill(0).map((_, i) => 100 + i);
    const r = holtWinters(h, 3, 12);
    expect(r.params.fallbackFrom).toBe("HOLT_WINTERS");
  });

  it("does NOT fall back at exactly 2*seasonLength (history=24, seasonLength=12)", () => {
    // 24 points is the minimum for HW to fire its own math.
    const h = Array(24).fill(0).map((_, i) => 100 + i);
    const r = holtWinters(h, 3, 12);
    expect(r.method).toBe("HOLT_WINTERS");
    expect((r.params as any).fallbackFrom).toBeUndefined();
  });

  it("fallback metadata includes reason 'history < 2 seasons'", () => {
    const r = holtWinters([1, 2, 3, 4, 5], 2, 12);
    expect(r.params.fallbackFrom).toBe("HOLT_WINTERS");
    expect(r.params.reason).toBe("history < 2 seasons");
  });

  it("fallback preserves original linearTrend / runRate method tag", () => {
    // n=5 → linearTrend (>= 2 points) → method tag stays LINEAR_TREND
    const r1 = holtWinters([1, 2, 3, 4, 5], 1, 12);
    expect(r1.method).toBe("LINEAR_TREND");
    // n=1 → linearTrend falls back to runRate → method tag becomes RUN_RATE
    const r2 = holtWinters([42], 1, 12);
    expect(r2.method).toBe("RUN_RATE");
  });

  it("custom seasonLength=4 fallback boundary fires at history.length < 8", () => {
    const r1 = holtWinters([1, 2, 3, 4, 5, 6, 7], 2, 4);          // 7 < 8 → fallback
    expect(r1.params.fallbackFrom).toBe("HOLT_WINTERS");
    const r2 = holtWinters([1, 2, 3, 4, 5, 6, 7, 8], 2, 4);       // 8 >= 8 → no fallback
    expect(r2.method).toBe("HOLT_WINTERS");
  });
});

describe("holtWinters — params and shape contract", () => {
  // The HW result.params dictionary is consumed by /api/v2/forecast/v2
  // and surfaced to the UI for explainability. Any drift in these keys
  // breaks the UI without a runtime error.
  const longH = Array(36).fill(0).map((_, i) => 100 + i + 10 * Math.sin(i / 2));

  it("populates alpha / beta / gamma in params", () => {
    const r = holtWinters(longH, 3, 12);
    expect(r.params.alpha).toBe(0.4);
    expect(r.params.beta).toBe(0.1);
    expect(r.params.gamma).toBe(0.3);
  });

  it("populates seasonLength / finalLevel / finalTrend in params", () => {
    const r = holtWinters(longH, 3, 12);
    expect(r.params.seasonLength).toBe(12);
    expect(typeof r.params.finalLevel).toBe("number");
    expect(typeof r.params.finalTrend).toBe("number");
    expect(Number.isFinite(r.params.finalLevel)).toBe(true);
    expect(Number.isFinite(r.params.finalTrend)).toBe(true);
  });

  it("default alpha = 0.4, beta = 0.1, gamma = 0.3, seasonLength = 12", () => {
    // Default-arg signature locked.
    const r = holtWinters(longH, 3);  // no params after futurePeriods
    expect(r.params.alpha).toBe(0.4);
    expect(r.params.beta).toBe(0.1);
    expect(r.params.gamma).toBe(0.3);
    expect(r.params.seasonLength).toBe(12);
  });

  it("override alpha/beta/gamma reflected back in params", () => {
    const r = holtWinters(longH, 3, 12, 0.7, 0.2, 0.5);
    expect(r.params.alpha).toBe(0.7);
    expect(r.params.beta).toBe(0.2);
    expect(r.params.gamma).toBe(0.5);
  });

  it("method tag is 'HOLT_WINTERS' on the no-fallback path", () => {
    const r = holtWinters(longH, 3, 12);
    expect(r.method).toBe("HOLT_WINTERS");
  });

  it("returns { method, params, values, basis } shape", () => {
    const r = holtWinters(longH, 3, 12);
    expect(r).toEqual(expect.objectContaining({
      method: expect.any(String),
      params: expect.any(Object),
      values: expect.any(Array),
      basis:  expect.any(Object),
    }));
  });

  it("basis.historyCount equals history.length on no-fallback path", () => {
    const r = holtWinters(longH, 3, 12);
    expect(r.basis.historyCount).toBe(longH.length);
  });

  it("basis.historyMean equals true mean on no-fallback path", () => {
    const r = holtWinters(longH, 3, 12);
    const expectedMean = longH.reduce((a, b) => a + b, 0) / longH.length;
    expect(r.basis.historyMean).toBeCloseTo(expectedMean, 5);
  });

  it("basis.historyLast equals last element on no-fallback path", () => {
    const r = holtWinters(longH, 3, 12);
    expect(r.basis.historyLast).toBe(longH[longH.length - 1]);
  });
});

describe("holtWinters — values length contract", () => {
  // Caller relies on values.length === futurePeriods for table rendering.
  const longH = Array(36).fill(0).map((_, i) => 100 + i);

  it("requests of 1 future period return 1 value", () => {
    const r = holtWinters(longH, 1, 12);
    expect(r.values).toHaveLength(1);
  });

  it("requests of 12 future periods return 12 values", () => {
    const r = holtWinters(longH, 12, 12);
    expect(r.values).toHaveLength(12);
  });

  it("requests of 24 future periods return 24 values", () => {
    const r = holtWinters(longH, 24, 12);
    expect(r.values).toHaveLength(24);
  });

  it("requests of 0 future periods return empty values array", () => {
    const r = holtWinters(longH, 0, 12);
    expect(r.values).toHaveLength(0);
  });

  it("every value is a finite number on no-fallback path with positive history", () => {
    const r = holtWinters(longH, 12, 12);
    for (const v of r.values) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe("holtWinters — numerical behavior", () => {
  it("constant history → near-constant forecast", () => {
    // Flat 100s for 2 full seasons. With trend ≈ 0 and seasonals ≈ 1,
    // forecast should also be ≈ 100.
    const h = Array(24).fill(100);
    const r = holtWinters(h, 6, 12);
    for (const v of r.values) {
      expect(v).toBeCloseTo(100, 0);
    }
  });

  it("clean linear trend → forecast continues to rise", () => {
    // Pure y = 100 + 2*i for 24 months. HW should pick up the trend
    // (initial trend = avg of season-2-vs-season-1 deltas).
    const h = Array(24).fill(0).map((_, i) => 100 + 2 * i);
    const r = holtWinters(h, 6, 12);
    // forecast values should be monotonically increasing
    for (let i = 1; i < r.values.length; i++) {
      expect(r.values[i]).toBeGreaterThan(r.values[i - 1]);
    }
  });

  it("clean linear downtrend → forecast continues to fall", () => {
    const h = Array(24).fill(0).map((_, i) => 200 - 2 * i);
    const r = holtWinters(h, 6, 12);
    for (let i = 1; i < r.values.length; i++) {
      expect(r.values[i]).toBeLessThan(r.values[i - 1]);
    }
  });

  it("finalLevel is positive on positive constant history", () => {
    const h = Array(24).fill(100);
    const r = holtWinters(h, 3, 12);
    expect(r.params.finalLevel).toBeGreaterThan(0);
  });

  it("finalTrend ≈ 0 on flat history", () => {
    const h = Array(24).fill(50);
    const r = holtWinters(h, 3, 12);
    expect(Math.abs(r.params.finalTrend)).toBeLessThan(1e-9);
  });

  it("doesn't mutate the caller's history array", () => {
    const h = Array(24).fill(0).map((_, i) => 100 + i);
    const snapshot = [...h];
    holtWinters(h, 6, 12);
    expect(h).toEqual(snapshot);
  });

  it("is deterministic — same input twice yields same output", () => {
    const h = Array(24).fill(0).map((_, i) => 100 + 2 * i + 5 * Math.sin(i / 3));
    const r1 = holtWinters(h, 6, 12);
    const r2 = holtWinters(h, 6, 12);
    expect(r1.values).toEqual(r2.values);
    expect(r1.params.finalLevel).toBe(r2.params.finalLevel);
    expect(r1.params.finalTrend).toBe(r2.params.finalTrend);
  });
});


/* ─── Phase 4.3 — ensemble comprehensive coverage ──────────────────────
 * The ensemble selector backtests 4 methods on a holdout, picks the
 * lowest-MAPE winner, then refits on full history. The structural
 * contract (chosen, backtests, holdoutN, reason) is consumed by the UI
 * + audit log. Pin it.
 */
describe("ensemble — fallback boundaries", () => {
  // Fallback fires when history.length <= holdoutN + 3.
  it("falls back at history.length = 0", () => {
    const r = ensemble([], 3, 3);
    expect(r.ensemble.chosen).toBe("RUN_RATE");
    expect(r.ensemble.backtests).toEqual([]);
  });

  it("falls back at history.length = 1", () => {
    const r = ensemble([42], 3, 3);
    expect(r.ensemble.chosen).toBe("RUN_RATE");
    expect(r.ensemble.backtests).toEqual([]);
  });

  it("falls back at exact boundary history.length = holdoutN + 3", () => {
    // n=6, holdoutN=3 → 6 <= 6 → fallback
    const h = [10, 20, 30, 40, 50, 60];
    const r = ensemble(h, 2, 3);
    expect(r.ensemble.chosen).toBe("RUN_RATE");
    expect(r.ensemble.backtests).toEqual([]);
  });

  it("does NOT fall back at history.length = holdoutN + 4", () => {
    // n=7, holdoutN=3 → 7 > 6 → backtest runs
    const h = [10, 20, 30, 40, 50, 60, 70];
    const r = ensemble(h, 2, 3);
    expect(r.ensemble.backtests.length).toBeGreaterThan(0);
  });

  it("fallback reason mentions 'Not enough history'", () => {
    const r = ensemble([1, 2, 3], 3, 3);
    expect(r.ensemble.reason).toMatch(/Not enough history/);
  });

  it("fallback preserves holdoutN parameter in the returned envelope", () => {
    const r = ensemble([1, 2, 3], 3, 7);
    expect(r.ensemble.holdoutN).toBe(7);
  });

  it("fallback inherits runRate values (last basisN avg)", () => {
    // RunRate fallback: avg of last 3 of [10, 20, 30] = 20.
    const r = ensemble([10, 20, 30], 3, 3);
    expect(r.values).toEqual([20, 20, 20]);
  });
});

describe("ensemble — backtest shape", () => {
  // Sufficient history for HW to fire its own math without falling
  // back. 30 monthly points = 2.5 full seasons.
  const longH = Array(30).fill(0).map((_, i) => 100 + 2 * i + 10 * Math.sin(i / 2));

  it("returns 4 backtest entries when history is sufficient", () => {
    // 4 methods are tried in ALL_METHODS: RUN_RATE, LINEAR_TREND,
    // SEASONAL_TREND, HOLT_WINTERS.
    const r = ensemble(longH, 6, 3);
    expect(r.ensemble.backtests).toHaveLength(4);
  });

  it("every backtest entry has method / mape / rmse fields", () => {
    const r = ensemble(longH, 6, 3);
    for (const b of r.ensemble.backtests) {
      expect(typeof b.method).toBe("string");
      expect(typeof b.mape).toBe("number");
      expect(typeof b.rmse).toBe("number");
    }
  });

  it("all backtest mape values are ≥ 0 (or Infinity for div-by-zero rows)", () => {
    const r = ensemble(longH, 6, 3);
    for (const b of r.ensemble.backtests) {
      expect(b.mape).toBeGreaterThanOrEqual(0);
    }
  });

  it("all backtest rmse values are ≥ 0 (or Infinity)", () => {
    const r = ensemble(longH, 6, 3);
    for (const b of r.ensemble.backtests) {
      expect(b.rmse).toBeGreaterThanOrEqual(0);
    }
  });

  it("chosen is a non-empty string referring to one of the methods", () => {
    const r = ensemble(longH, 6, 3);
    expect(typeof r.ensemble.chosen).toBe("string");
    expect(r.ensemble.chosen.length).toBeGreaterThan(0);
    expect(["RUN_RATE", "LINEAR_TREND", "SEASONAL_TREND", "HOLT_WINTERS"])
      .toContain(r.ensemble.chosen);
  });

  it("reason references the chosen method name", () => {
    const r = ensemble(longH, 6, 3);
    expect(r.ensemble.reason).toContain(r.ensemble.chosen);
  });

  it("holdoutN in result equals holdoutN passed in", () => {
    const r = ensemble(longH, 6, 5);
    expect(r.ensemble.holdoutN).toBe(5);
  });
});

describe("ensemble — defaults and contract", () => {
  const longH = Array(30).fill(0).map((_, i) => 100 + 2 * i);

  it("default holdoutN = 3 when not provided", () => {
    const r = ensemble(longH, 6);  // no holdoutN arg
    expect(r.ensemble.holdoutN).toBe(3);
  });

  it("returns full ForecastResult shape merged with ensemble metadata", () => {
    const r = ensemble(longH, 6, 3);
    expect(r).toEqual(expect.objectContaining({
      method: expect.any(String),
      params: expect.any(Object),
      values: expect.any(Array),
      basis:  expect.any(Object),
      ensemble: expect.any(Object),
    }));
  });

  it("values.length equals futurePeriods on the non-fallback path", () => {
    const r = ensemble(longH, 9, 3);
    expect(r.values).toHaveLength(9);
  });

  it("values.length equals futurePeriods on the fallback path too", () => {
    const r = ensemble([1, 2, 3], 5, 3);  // fallback
    expect(r.values).toHaveLength(5);
  });

  it("basis.historyCount matches input history length on no-fallback path", () => {
    const r = ensemble(longH, 6, 3);
    expect(r.basis.historyCount).toBeGreaterThan(0);
    // refit happens on full history for the winner → basis reflects full history
    expect(r.basis.historyCount).toBe(longH.length);
  });
});

describe("ensemble — method selection on well-known data", () => {
  it("constant series → very low MAPE for RUN_RATE", () => {
    // Flat 100s. RUN_RATE should backtest perfectly (forecast 100, actual 100).
    const h = Array(20).fill(100);
    const r = ensemble(h, 3, 3);
    const runRateBacktest = r.ensemble.backtests.find(b => b.method === "RUN_RATE");
    expect(runRateBacktest).toBeDefined();
    expect(runRateBacktest!.mape).toBeLessThan(1e-9);
  });

  it("clean linear trend → low MAPE for LINEAR_TREND", () => {
    const h = Array(20).fill(0).map((_, i) => 100 + 5 * i);
    const r = ensemble(h, 3, 3);
    const lin = r.ensemble.backtests.find(b => b.method === "LINEAR_TREND");
    expect(lin).toBeDefined();
    expect(lin!.mape).toBeLessThan(5);  // very tight on clean linear data
  });

  it("clean linear trend → chosen is LINEAR_TREND or HOLT_WINTERS", () => {
    const h = Array(20).fill(0).map((_, i) => 100 + 5 * i);
    const r = ensemble(h, 3, 3);
    expect(["LINEAR_TREND", "HOLT_WINTERS"]).toContain(r.ensemble.chosen);
  });
});

describe("ensemble — robustness", () => {
  it("doesn't throw when history contains zeros mid-series", () => {
    // Zeros in 'actual' make MAPE skip those rows. Must not throw.
    const h = [10, 20, 0, 30, 40, 0, 50, 60, 70, 0, 80, 90];
    expect(() => ensemble(h, 3, 3)).not.toThrow();
  });

  it("doesn't throw on history with all zeros", () => {
    const h = Array(20).fill(0);
    expect(() => ensemble(h, 3, 3)).not.toThrow();
  });

  it("is deterministic — same input twice yields same chosen + values", () => {
    const h = Array(20).fill(0).map((_, i) => 100 + 3 * i + 2 * Math.cos(i / 2));
    const r1 = ensemble(h, 6, 3);
    const r2 = ensemble(h, 6, 3);
    expect(r1.ensemble.chosen).toBe(r2.ensemble.chosen);
    expect(r1.values).toEqual(r2.values);
  });

  it("doesn't mutate the caller's history array", () => {
    const h = Array(20).fill(0).map((_, i) => 100 + i);
    const snapshot = [...h];
    ensemble(h, 6, 3);
    expect(h).toEqual(snapshot);
  });

  it("doesn't mutate the backtests array across calls (no shared state leak)", () => {
    const h1 = Array(20).fill(0).map((_, i) => 100 + i);
    const h2 = Array(20).fill(0).map((_, i) => 50 - i);
    const r1 = ensemble(h1, 3, 3);
    const r2 = ensemble(h2, 3, 3);
    // backtests arrays are distinct objects per call
    expect(r1.ensemble.backtests).not.toBe(r2.ensemble.backtests);
  });

  it("handles asymmetric futurePeriods vs holdoutN (forecast longer than holdout)", () => {
    // train, backtest h=3, then refit and forecast 12 future periods.
    const h = Array(20).fill(0).map((_, i) => 100 + 2 * i);
    const r = ensemble(h, 12, 3);
    expect(r.values).toHaveLength(12);
  });

  it("handles holdoutN larger than typical (e.g. 10)", () => {
    const h = Array(30).fill(0).map((_, i) => 100 + i);
    const r = ensemble(h, 3, 10);
    expect(r.ensemble.holdoutN).toBe(10);
    expect(r.ensemble.backtests.length).toBeGreaterThan(0);
  });
});
