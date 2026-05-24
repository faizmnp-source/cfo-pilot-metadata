// Sprint P — Forecast Waterfall unit tests.

import {
  aggregateByAccount,
  buildWaterfall,
  computeValueBounds,
  deriveFavorability,
  projectBarsToPixels,
  sourceFromVarianceRows,
  unbridgedDelta,
  type WaterfallSourceRow,
} from "./waterfall";

describe("aggregateByAccount", () => {
  it("sums variance across rows that share an accountId", () => {
    const rows: WaterfallSourceRow[] = [
      { accountId: "A1", variance: 10, accountCode: "4000", accountType: "REVENUE" },
      { accountId: "A1", variance: -3, accountCode: "4000", accountType: "REVENUE" },
      { accountId: "A2", variance: 5,  accountCode: "5000", accountType: "EXPENSE" },
    ];
    const out = aggregateByAccount(rows);
    expect(out).toHaveLength(2);
    const a1 = out.find(r => r.accountId === "A1")!;
    const a2 = out.find(r => r.accountId === "A2")!;
    expect(a1.variance).toBe(7);
    expect(a2.variance).toBe(5);
  });

  it("orders results by |variance| desc, breaking ties by code asc", () => {
    const rows: WaterfallSourceRow[] = [
      { accountId: "A", variance:  3, accountCode: "0001" },
      { accountId: "B", variance: -7, accountCode: "0002" },
      { accountId: "C", variance:  7, accountCode: "0003" },
    ];
    const out = aggregateByAccount(rows);
    expect(out.map(r => r.accountId)).toEqual(["B", "C", "A"]);
  });
});

describe("deriveFavorability", () => {
  it("revenue: positive variance is favorable", () => {
    expect(deriveFavorability(100, "REVENUE")).toBe("favorable");
  });
  it("revenue: negative variance is unfavorable", () => {
    expect(deriveFavorability(-100, "REVENUE")).toBe("unfavorable");
  });
  it("expense: positive variance is unfavorable (overspent)", () => {
    expect(deriveFavorability(100, "EXPENSE")).toBe("unfavorable");
  });
  it("expense: negative variance is favorable (underspent)", () => {
    expect(deriveFavorability(-100, "EXPENSE")).toBe("favorable");
  });
  it("balance sheet types are neutral", () => {
    expect(deriveFavorability(100, "ASSET")).toBe("neutral");
    expect(deriveFavorability(100, "LIABILITY")).toBe("neutral");
    expect(deriveFavorability(100, "EQUITY")).toBe("neutral");
  });
  it("unknown account type is neutral", () => {
    expect(deriveFavorability(100, null)).toBe("neutral");
    expect(deriveFavorability(100, undefined)).toBe("neutral");
  });
  it("|variance| below epsilon is flat", () => {
    expect(deriveFavorability(0.1, "REVENUE")).toBe("flat");
    expect(deriveFavorability(-0.1, "EXPENSE")).toBe("flat");
  });
});

describe("buildWaterfall", () => {
  const rows: WaterfallSourceRow[] = [
    { accountId: "REV", variance:  50, accountCode: "4000", accountType: "REVENUE" },
    { accountId: "COG", variance: -20, accountCode: "5000", accountType: "EXPENSE" },
    { accountId: "OPX", variance:  10, accountCode: "6000", accountType: "EXPENSE" },
  ];

  it("emits forecast anchor, contributors, actual anchor", () => {
    const s = buildWaterfall(1000, 1040, rows, { topN: 10 });
    expect(s.bars[0].kind).toBe("anchor-start");
    expect(s.bars[0].variance).toBe(1000);
    expect(s.bars[s.bars.length - 1].kind).toBe("anchor-end");
    expect(s.bars[s.bars.length - 1].variance).toBe(1040);
    // 1 start + 3 contributors + 1 end = 5
    expect(s.bars).toHaveLength(5);
  });

  it("running totals walk from forecast to actual when all rows fit", () => {
    const s = buildWaterfall(1000, 1040, rows, { topN: 10, includeOther: false });
    const contribs = s.bars.filter(b => b.kind === "contributor");
    expect(contribs[0].runningStart).toBe(1000);
    expect(contribs[0].runningEnd).toBe(1050);  // +50
    expect(contribs[1].runningEnd).toBe(1030);  // -20
    expect(contribs[2].runningEnd).toBe(1040);  // +10 → lands on actual
  });

  it("rolls leftover rows into Other when more than topN", () => {
    const many: WaterfallSourceRow[] = [
      { accountId: "A", variance: 100 },
      { accountId: "B", variance:  50 },
      { accountId: "C", variance:  30 },
      { accountId: "D", variance: -10 },  // tail
      { accountId: "E", variance:  -5 },  // tail
    ];
    const s = buildWaterfall(0, 165, many, { topN: 3 });
    expect(s.otherCount).toBe(2);
    expect(s.otherVariance).toBe(-15);
    const other = s.bars.find(b => b.kind === "other")!;
    expect(other.variance).toBe(-15);
    expect(other.favorability).toBe("neutral");
  });

  it("omits Other bar when includeOther=false", () => {
    const many: WaterfallSourceRow[] = [
      { accountId: "A", variance: 100 },
      { accountId: "B", variance:  50 },
      { accountId: "C", variance:  30 },
      { accountId: "D", variance: -10 },
    ];
    const s = buildWaterfall(0, 170, many, { topN: 3, includeOther: false });
    expect(s.bars.find(b => b.kind === "other")).toBeUndefined();
  });

  it("derives favorability when caller omits it", () => {
    const s = buildWaterfall(1000, 1040, rows);
    const contribs = s.bars.filter(b => b.kind === "contributor");
    const rev = contribs.find(b => b.accountId === "REV")!;
    const cog = contribs.find(b => b.accountId === "COG")!;
    const opx = contribs.find(b => b.accountId === "OPX")!;
    expect(rev.favorability).toBe("favorable");    // REVENUE +50
    expect(cog.favorability).toBe("favorable");    // EXPENSE -20 (underspent)
    expect(opx.favorability).toBe("unfavorable");  // EXPENSE +10 (overspent)
  });
});

describe("unbridgedDelta", () => {
  it("is zero when walking bars cover the full variance", () => {
    const rows: WaterfallSourceRow[] = [
      { accountId: "A", variance:  50 },
      { accountId: "B", variance: -10 },
    ];
    const s = buildWaterfall(1000, 1040, rows, { topN: 10 });
    expect(unbridgedDelta(s)).toBe(0);
  });

  it("returns the unexplained piece when actuals diverge from walked sum", () => {
    const rows: WaterfallSourceRow[] = [
      { accountId: "A", variance: 50 },
    ];
    // Forecast 1000 + contributor 50 = 1050, but actual is 1080.
    // Δ unexplained = (1080 - 1000) - 50 = 30.
    const s = buildWaterfall(1000, 1080, rows, { topN: 10, includeOther: false });
    expect(unbridgedDelta(s)).toBe(30);
  });
});

describe("computeValueBounds + projectBarsToPixels", () => {
  it("bounds enclose every bar with a little headroom", () => {
    const rows: WaterfallSourceRow[] = [
      { accountId: "A", variance:  50 },
      { accountId: "B", variance: -20 },
    ];
    const s = buildWaterfall(1000, 1030, rows, { topN: 10, includeOther: false });
    const { min, max } = computeValueBounds(s.bars);
    expect(min).toBeLessThan(0);
    expect(max).toBeGreaterThan(1050);
  });

  it("projects bars into a pixel rectangle with positive heights", () => {
    const rows: WaterfallSourceRow[] = [
      { accountId: "A", variance:  50 },
      { accountId: "B", variance: -20 },
    ];
    const s = buildWaterfall(1000, 1030, rows, { topN: 10, includeOther: false });
    const { min, max } = computeValueBounds(s.bars);
    const projected = projectBarsToPixels(s.bars, 200, min, max);
    for (const b of projected) {
      expect(b.pxHeight).toBeGreaterThan(0);
      expect(b.pxTop).toBeGreaterThanOrEqual(0);
      expect(b.pxTop + b.pxHeight).toBeLessThanOrEqual(200 + 1);  // +1 for fp slack
    }
  });
});

describe("sourceFromVarianceRows", () => {
  it("preserves accountId + variance and lifts enrichment fields", () => {
    const vr: any = [
      { accountId: "A", entityId: "E", timeId: "T", actual: 100, forecast: 80, variance: 20, variancePct: 25, direction: "pos", accountCode: "4000", accountName: "Sales", accountType: "REVENUE", favorability: "favorable" },
    ];
    const out = sourceFromVarianceRows(vr);
    expect(out[0].accountId).toBe("A");
    expect(out[0].variance).toBe(20);
    expect(out[0].accountCode).toBe("4000");
    expect(out[0].accountType).toBe("REVENUE");
    expect(out[0].favorability).toBe("favorable");
  });
});
