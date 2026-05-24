// Pure-math tests for forecast methods. Run via `npm test`.
// No DB, no network, no mocks needed — these functions are pure.

import { runRate, growthPct, linearTrend, applyForecastMethod } from "./methods";

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

    it("throws on unknown method", () => {
      expect(() => applyForecastMethod("BOGUS" as any, [1, 2], 1)).toThrow(/Unknown forecast method/);
    });
  });
});
