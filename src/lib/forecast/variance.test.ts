import { computeVarianceRows, computeVarianceTotals } from "./variance";

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
