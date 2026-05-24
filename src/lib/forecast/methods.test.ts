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
