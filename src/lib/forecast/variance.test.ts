import {
  computeVarianceRows,
  computeVarianceTotals,
  classifyFavorability,
  applyFavorability,
  computeFavorabilityTotals,
  type AccountTypeForFav,
} from "./variance";

describe("computeVarianceRows", () => {
  test("joins on (acc|ent|time) and emits variance + variance%", () => {
    const actuals = [
      { accountId: "A1", entityId: "E1", timeId: "T1", value: 110 },
    ];
    const forecasts = [
      { accountId: "A1", entityId: "E1", timeId: "T1", value: 100 },
    ];
    const rows = computeVarianceRows(actuals, forecasts);
    expect(rows).toHaveLength(1);
    expect(rows[0].actual).toBe(110);
    expect(rows[0].forecast).toBe(100);
    expect(rows[0].variance).toBe(10);
    expect(rows[0].variancePct).toBeCloseTo(10, 6);
    expect(rows[0].direction).toBe("pos");
  });

  test("emits rows present on only one side with the missing side as 0", () => {
    const actuals = [{ accountId: "A", entityId: "E", timeId: "T1", value: 50 }];
    const forecasts = [{ accountId: "A", entityId: "E", timeId: "T2", value: 80 }];
    const rows = computeVarianceRows(actuals, forecasts);
    expect(rows).toHaveLength(2);
    const t1 = rows.find(r => r.timeId === "T1")!;
    const t2 = rows.find(r => r.timeId === "T2")!;
    expect(t1.actual).toBe(50); expect(t1.forecast).toBe(0); expect(t1.variancePct).toBeNull();
    expect(t2.actual).toBe(0);  expect(t2.forecast).toBe(80); expect(t2.variancePct).toBeCloseTo(-100, 6);
  });

  test("variancePct is null when forecast is 0 (no divide-by-zero noise)", () => {
    const rows = computeVarianceRows(
      [{ accountId: "A", entityId: "E", timeId: "T", value: 5 }],
      [{ accountId: "A", entityId: "E", timeId: "T", value: 0 }],
    );
    expect(rows[0].variancePct).toBeNull();
    expect(rows[0].direction).toBe("pos");
  });

  test("direction is 'flat' when variance is within epsilon", () => {
    const rows = computeVarianceRows(
      [{ accountId: "A", entityId: "E", timeId: "T", value: 100 }],
      [{ accountId: "A", entityId: "E", timeId: "T", value: 100 }],
    );
    expect(rows[0].direction).toBe("flat");
    expect(rows[0].variance).toBe(0);
    expect(rows[0].variancePct).toBeCloseTo(0, 6);
  });

  test("aggregates duplicate (acc|ent|time) rows by summing — handles double-postings cleanly", () => {
    const actuals = [
      { accountId: "A", entityId: "E", timeId: "T", value: 30 },
      { accountId: "A", entityId: "E", timeId: "T", value: 20 },
    ];
    const forecasts = [{ accountId: "A", entityId: "E", timeId: "T", value: 40 }];
    const rows = computeVarianceRows(actuals, forecasts);
    expect(rows).toHaveLength(1);
    expect(rows[0].actual).toBe(50);
    expect(rows[0].variance).toBe(10);
  });

  test("output sort is deterministic by (acc, ent, time)", () => {
    const actuals = [
      { accountId: "A2", entityId: "E1", timeId: "T1", value: 1 },
      { accountId: "A1", entityId: "E1", timeId: "T2", value: 2 },
      { accountId: "A1", entityId: "E1", timeId: "T1", value: 3 },
    ];
    const rows = computeVarianceRows(actuals, []);
    expect(rows.map(r => `${r.accountId}|${r.entityId}|${r.timeId}`)).toEqual([
      "A1|E1|T1", "A1|E1|T2", "A2|E1|T1",
    ]);
  });

  test("unfav variance produces negative direction", () => {
    const rows = computeVarianceRows(
      [{ accountId: "A", entityId: "E", timeId: "T", value: 90 }],
      [{ accountId: "A", entityId: "E", timeId: "T", value: 100 }],
    );
    expect(rows[0].direction).toBe("neg");
    expect(rows[0].variance).toBe(-10);
    expect(rows[0].variancePct).toBeCloseTo(-10, 6);
  });
});

describe("computeVarianceTotals", () => {
  test("sums actual + forecast across all rows", () => {
    const rows = computeVarianceRows(
      [
        { accountId: "A1", entityId: "E1", timeId: "T1", value: 100 },
        { accountId: "A2", entityId: "E1", timeId: "T1", value: 200 },
      ],
      [
        { accountId: "A1", entityId: "E1", timeId: "T1", value:  90 },
        { accountId: "A2", entityId: "E1", timeId: "T1", value: 210 },
      ],
    );
    const t = computeVarianceTotals(rows);
    expect(t.actual).toBe(300);
    expect(t.forecast).toBe(300);
    expect(t.variance).toBe(0);
    expect(t.variancePct).toBeCloseTo(0, 6);
    expect(t.rowCount).toBe(2);
  });

  test("variancePct is null when total forecast is 0", () => {
    const rows = computeVarianceRows(
      [{ accountId: "A", entityId: "E", timeId: "T", value: 50 }],
      [],
    );
    const t = computeVarianceTotals(rows);
    expect(t.forecast).toBe(0);
    expect(t.variancePct).toBeNull();
  });
});

// Sprint W.3 — account-type-aware favorability
describe("classifyFavorability", () => {
  test("REVENUE: positive variance = favorable (beat plan)", () => {
    expect(classifyFavorability("REVENUE", 50)).toBe("favorable");
  });

  test("REVENUE: negative variance = unfavorable (missed plan)", () => {
    expect(classifyFavorability("REVENUE", -50)).toBe("unfavorable");
  });

  test("EXPENSE: positive variance = unfavorable (overspent)", () => {
    expect(classifyFavorability("EXPENSE", 50)).toBe("unfavorable");
  });

  test("EXPENSE: negative variance = favorable (came in under budget)", () => {
    expect(classifyFavorability("EXPENSE", -50)).toBe("favorable");
  });

  test("ASSET / LIABILITY / EQUITY: always neutral, regardless of sign", () => {
    expect(classifyFavorability("ASSET", 50)).toBe("neutral");
    expect(classifyFavorability("LIABILITY", -50)).toBe("neutral");
    expect(classifyFavorability("EQUITY", 25)).toBe("neutral");
  });

  test("null / undefined account type: neutral", () => {
    expect(classifyFavorability(null, 50)).toBe("neutral");
    expect(classifyFavorability(undefined, 50)).toBe("neutral");
  });

  test("variance within epsilon: flat regardless of account type", () => {
    expect(classifyFavorability("REVENUE", 0)).toBe("flat");
    expect(classifyFavorability("EXPENSE", 0)).toBe("flat");
    expect(classifyFavorability(null, 0)).toBe("flat");
    expect(classifyFavorability("REVENUE", 1e-9)).toBe("flat");
  });
});

describe("applyFavorability", () => {
  test("tags each row with favorability + accountType using the lookup map", () => {
    const baseRows = computeVarianceRows(
      [
        { accountId: "REV1", entityId: "E1", timeId: "T1", value: 110 }, // beat
        { accountId: "EXP1", entityId: "E1", timeId: "T1", value: 130 }, // overspent
        { accountId: "BS1",  entityId: "E1", timeId: "T1", value: 500 }, // balance sheet
      ],
      [
        { accountId: "REV1", entityId: "E1", timeId: "T1", value: 100 },
        { accountId: "EXP1", entityId: "E1", timeId: "T1", value: 100 },
        { accountId: "BS1",  entityId: "E1", timeId: "T1", value: 450 },
      ],
    );
    const typeMap = new Map<string, AccountTypeForFav | null>([
      ["REV1", "REVENUE"],
      ["EXP1", "EXPENSE"],
      ["BS1",  "ASSET"],
    ]);
    const tagged = applyFavorability(baseRows, typeMap);

    const rev = tagged.find(r => r.accountId === "REV1")!;
    const exp = tagged.find(r => r.accountId === "EXP1")!;
    const bs  = tagged.find(r => r.accountId === "BS1")!;

    expect(rev.favorability).toBe("favorable");
    expect(rev.accountType).toBe("REVENUE");
    expect(exp.favorability).toBe("unfavorable");
    expect(exp.accountType).toBe("EXPENSE");
    expect(bs.favorability).toBe("neutral");
    expect(bs.accountType).toBe("ASSET");
  });

  test("accounts missing from the typeMap are tagged neutral (or flat if variance ~0)", () => {
    const baseRows = computeVarianceRows(
      [
        { accountId: "UNKNOWN1", entityId: "E", timeId: "T", value: 50 },
        { accountId: "UNKNOWN2", entityId: "E", timeId: "T", value: 100 },
      ],
      [
        { accountId: "UNKNOWN1", entityId: "E", timeId: "T", value: 30 },
        { accountId: "UNKNOWN2", entityId: "E", timeId: "T", value: 100 },
      ],
    );
    const tagged = applyFavorability(baseRows, new Map());
    const u1 = tagged.find(r => r.accountId === "UNKNOWN1")!;
    const u2 = tagged.find(r => r.accountId === "UNKNOWN2")!;
    expect(u1.favorability).toBe("neutral");
    expect(u1.accountType).toBeNull();
    expect(u2.favorability).toBe("flat");
    expect(u2.accountType).toBeNull();
  });

  test("does not mutate the input row array", () => {
    const baseRows = computeVarianceRows(
      [{ accountId: "REV1", entityId: "E1", timeId: "T1", value: 110 }],
      [{ accountId: "REV1", entityId: "E1", timeId: "T1", value: 100 }],
    );
    const before = JSON.stringify(baseRows);
    applyFavorability(baseRows, new Map([["REV1", "REVENUE"]]));
    expect(JSON.stringify(baseRows)).toBe(before);
  });
});

describe("computeFavorabilityTotals", () => {
  test("counts buckets and computes net favorable impact", () => {
    const baseRows = computeVarianceRows(
      [
        { accountId: "REV1", entityId: "E1", timeId: "T1", value: 150 }, // +50 favorable
        { accountId: "EXP1", entityId: "E1", timeId: "T1", value: 140 }, // +40 unfavorable
        { accountId: "BS1",  entityId: "E1", timeId: "T1", value: 500 }, // neutral
        { accountId: "REV2", entityId: "E1", timeId: "T1", value: 100 }, // flat
      ],
      [
        { accountId: "REV1", entityId: "E1", timeId: "T1", value: 100 },
        { accountId: "EXP1", entityId: "E1", timeId: "T1", value: 100 },
        { accountId: "BS1",  entityId: "E1", timeId: "T1", value: 450 },
        { accountId: "REV2", entityId: "E1", timeId: "T1", value: 100 },
      ],
    );
    const tagged = applyFavorability(
      baseRows,
      new Map<string, AccountTypeForFav | null>([
        ["REV1", "REVENUE"],
        ["REV2", "REVENUE"],
        ["EXP1", "EXPENSE"],
        ["BS1",  "ASSET"],
      ]),
    );
    const t = computeFavorabilityTotals(tagged);
    expect(t.favorable).toBe(1);
    expect(t.unfavorable).toBe(1);
    expect(t.flat).toBe(1);
    expect(t.neutral).toBe(1);
    // |50| from favorable revenue minus |40| from unfavorable expense = +10 net favorable
    expect(t.netFavorableImpact).toBeCloseTo(10, 6);
  });

  test("rows without favorability tags are counted as neutral", () => {
    const rows = computeVarianceRows(
      [{ accountId: "A", entityId: "E", timeId: "T", value: 5 }],
      [{ accountId: "A", entityId: "E", timeId: "T", value: 0 }],
    );
    // no applyFavorability — rows are untagged
    const t = computeFavorabilityTotals(rows);
    expect(t.neutral).toBe(1);
    expect(t.favorable).toBe(0);
    expect(t.unfavorable).toBe(0);
    expect(t.netFavorableImpact).toBe(0);
  });
});
