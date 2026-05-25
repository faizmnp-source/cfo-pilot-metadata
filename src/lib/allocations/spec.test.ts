// Pin computeAllocationRows() — pure-math allocation primitive.
//
// Pinned because spec.ts powers every allocation in the system
// (used by /api/v2/allocations/run and the Allocation library UI).
// Any drift in weight math silently changes every allocation result.
//
// Pure additive: no source change in spec.ts. Companion to (future)
// integration tests on /api/v2/allocations/run; this file pins the
// math primitive directly.

import {
  computeAllocationRows,
  type AllocationSpec,
  type AllocationRowToWrite,
} from "./spec";

// ── helpers ──────────────────────────────────────────────────────────────

function baseSpec(overrides: Partial<AllocationSpec> = {}): AllocationSpec {
  return {
    sourceAccountCode:  "6300",
    sourceEntityCode:   "APOLLO_GRP",
    sourceScenarioCode: "Actual",
    sourcePeriodCode:   "2026M04",
    targetDim:          "ENTITY",
    targetEntityCodes:  ["IN_OPS", "US_HQ"],
    driver:             { kind: "EQUAL" },
    reverseSource:      false,
    ...overrides,
  };
}

function sumOfValues(rows: AllocationRowToWrite[]): number {
  return rows.reduce((a, r) => a + r.value, 0);
}

// ── shape & return type ──────────────────────────────────────────────────

describe("computeAllocationRows — return shape", () => {
  test("returns an array", () => {
    const rows = computeAllocationRows(baseSpec(), 100, {});
    expect(Array.isArray(rows)).toBe(true);
  });

  test("each row has the 6 required fields", () => {
    const rows = computeAllocationRows(baseSpec(), 100, {});
    for (const r of rows) {
      expect(typeof r.scenarioCode).toBe("string");
      expect(typeof r.periodCode).toBe("string");
      expect(typeof r.entityCode).toBe("string");
      expect(typeof r.accountCode).toBe("string");
      expect(typeof r.value).toBe("number");
      expect(typeof r.reason).toBe("string");
    }
  });

  test("returns exactly N rows for N targets (no reverseSource)", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A", "B", "C", "D"] }), 100, {}
    );
    expect(rows).toHaveLength(4);
  });

  test("returns N+1 rows when reverseSource is true (N target rows + 1 offset)", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A", "B", "C"], reverseSource: true }), 100, {}
    );
    expect(rows).toHaveLength(4);
  });
});

// ── empty targets short-circuit ──────────────────────────────────────────

describe("computeAllocationRows — empty targetEntityCodes", () => {
  test("returns [] when targetEntityCodes is empty (EQUAL)", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: [] }), 1000, {}
    );
    expect(rows).toEqual([]);
  });

  test("returns [] when targetEntityCodes is empty even with reverseSource=true", () => {
    // Early return short-circuits before the offset row is ever appended.
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: [], reverseSource: true }), 1000, {}
    );
    expect(rows).toEqual([]);
  });

  test("returns [] when targetEntityCodes is empty for FIXED_PCT", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: [], driver: { kind: "FIXED_PCT", pcts: { A: 100 } } }),
      1000, {},
    );
    expect(rows).toEqual([]);
  });

  test("returns [] when targetEntityCodes is empty for FACT_BASED", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: [], driver: { kind: "FACT_BASED", factAccountCode: "BEDS" } }),
      1000, { A: 100 },
    );
    expect(rows).toEqual([]);
  });
});

// ── EQUAL driver math ────────────────────────────────────────────────────

describe("computeAllocationRows — EQUAL driver", () => {
  test("1-target → 100% to that target", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A"] }), 1000, {}
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].entityCode).toBe("A");
    expect(rows[0].value).toBe(1000);
  });

  test("2-target → 500 / 500", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A", "B"] }), 1000, {}
    );
    expect(rows[0].value).toBe(500);
    expect(rows[1].value).toBe(500);
  });

  test("4-target → 250 / 250 / 250 / 250", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A", "B", "C", "D"] }), 1000, {}
    );
    expect(rows.map(r => r.value)).toEqual([250, 250, 250, 250]);
  });

  test("3-target → 1/3 each (float)", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A", "B", "C"] }), 300, {}
    );
    expect(rows[0].value).toBeCloseTo(100, 9);
    expect(rows[1].value).toBeCloseTo(100, 9);
    expect(rows[2].value).toBeCloseTo(100, 9);
  });

  test("sum of EQUAL targets reconstructs sourceValue (3-target, 999)", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A", "B", "C"] }), 999, {}
    );
    expect(sumOfValues(rows)).toBeCloseTo(999, 9);
  });

  test("EQUAL on sourceValue=0 → all zeros", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A", "B"] }), 0, {}
    );
    expect(rows.every(r => r.value === 0)).toBe(true);
  });

  test("EQUAL on negative sourceValue → equal negative shares", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A", "B"] }), -200, {}
    );
    expect(rows[0].value).toBe(-100);
    expect(rows[1].value).toBe(-100);
  });

  test("EQUAL ignores driverValues argument entirely", () => {
    const rowsWithDrivers = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A", "B"] }), 1000, { A: 999, B: 1 }
    );
    const rowsEmpty = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A", "B"] }), 1000, {}
    );
    expect(rowsWithDrivers.map(r => r.value)).toEqual(rowsEmpty.map(r => r.value));
  });

  test("EQUAL output rows preserve targetEntityCodes order", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["Z", "A", "M"] }), 300, {}
    );
    expect(rows.map(r => r.entityCode)).toEqual(["Z", "A", "M"]);
  });
});

// ── FIXED_PCT driver math ────────────────────────────────────────────────

describe("computeAllocationRows — FIXED_PCT driver", () => {
  test("60/40 split exact", () => {
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        driver: { kind: "FIXED_PCT", pcts: { A: 60, B: 40 } },
      }), 1000, {}
    );
    expect(rows[0].value).toBeCloseTo(600, 9);
    expect(rows[1].value).toBeCloseTo(400, 9);
  });

  test("50/30/20 split sums to sourceValue", () => {
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B", "C"],
        driver: { kind: "FIXED_PCT", pcts: { A: 50, B: 30, C: 20 } },
      }), 1000, {}
    );
    expect(rows[0].value).toBeCloseTo(500, 9);
    expect(rows[1].value).toBeCloseTo(300, 9);
    expect(rows[2].value).toBeCloseTo(200, 9);
    expect(sumOfValues(rows)).toBeCloseTo(1000, 9);
  });

  test("pcts that don't sum to 100 are normalized by their total", () => {
    // pcts sum to 200; A's weight = 100/200 = 0.5
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        driver: { kind: "FIXED_PCT", pcts: { A: 100, B: 100 } },
      }), 1000, {}
    );
    expect(rows[0].value).toBeCloseTo(500, 9);
    expect(rows[1].value).toBeCloseTo(500, 9);
  });

  test("pcts summing to 50 still allocate proportionally (full sourceValue)", () => {
    // total=50; A weight=30/50=0.6, B weight=20/50=0.4
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        driver: { kind: "FIXED_PCT", pcts: { A: 30, B: 20 } },
      }), 1000, {}
    );
    expect(rows[0].value).toBeCloseTo(600, 9);
    expect(rows[1].value).toBeCloseTo(400, 9);
    expect(sumOfValues(rows)).toBeCloseTo(1000, 9);
  });

  test("target missing from pcts gets weight 0", () => {
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B", "C"],
        driver: { kind: "FIXED_PCT", pcts: { A: 100 } },
      }), 1000, {}
    );
    // total=100; A=100/100=1.0; B,C absent → 0
    expect(rows[0].value).toBeCloseTo(1000, 9);
    expect(rows[1].value).toBe(0);
    expect(rows[2].value).toBe(0);
  });

  test("pcts containing non-target entities still count toward total (leaks)", () => {
    // total = 100+50+50 = 200; A's weight = 100/200 = 0.5; sum of target rows = 500
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A"],
        driver: { kind: "FIXED_PCT", pcts: { A: 100, GHOST_X: 50, GHOST_Y: 50 } },
      }), 1000, {}
    );
    expect(rows[0].value).toBeCloseTo(500, 9);
  });

  test("undefined pcts → total=0 → '|| 1' fallback → every weight is 0", () => {
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        driver: { kind: "FIXED_PCT" },  // no pcts
      }), 1000, {}
    );
    expect(rows[0].value).toBe(0);
    expect(rows[1].value).toBe(0);
  });

  test("empty pcts → fallback → every weight is 0", () => {
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        driver: { kind: "FIXED_PCT", pcts: {} },
      }), 1000, {}
    );
    expect(rows[0].value).toBe(0);
    expect(rows[1].value).toBe(0);
  });

  test("all-zero pcts → fallback → every weight is 0", () => {
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        driver: { kind: "FIXED_PCT", pcts: { A: 0, B: 0 } },
      }), 1000, {}
    );
    expect(rows[0].value).toBe(0);
    expect(rows[1].value).toBe(0);
  });

  test("negative pcts allowed (mathematically — no clamp)", () => {
    // total = 100 + (-50) = 50; A weight = 100/50 = 2.0; B weight = -50/50 = -1.0
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        driver: { kind: "FIXED_PCT", pcts: { A: 100, B: -50 } },
      }), 1000, {}
    );
    expect(rows[0].value).toBeCloseTo(2000, 9);
    expect(rows[1].value).toBeCloseTo(-1000, 9);
    expect(sumOfValues(rows)).toBeCloseTo(1000, 9);
  });

  test("FIXED_PCT ignores driverValues argument entirely", () => {
    const a = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        driver: { kind: "FIXED_PCT", pcts: { A: 60, B: 40 } },
      }), 1000, { A: 999, B: 1 }
    );
    const b = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        driver: { kind: "FIXED_PCT", pcts: { A: 60, B: 40 } },
      }), 1000, {}
    );
    expect(a.map(r => r.value)).toEqual(b.map(r => r.value));
  });
});

// ── FACT_BASED driver math ───────────────────────────────────────────────

describe("computeAllocationRows — FACT_BASED driver", () => {
  test("driver values 100/200/300 → weights .167/.333/.500", () => {
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B", "C"],
        driver: { kind: "FACT_BASED", factAccountCode: "BEDS" },
      }), 600, { A: 100, B: 200, C: 300 }
    );
    expect(rows[0].value).toBeCloseTo(100, 9);  // 600 * 100/600
    expect(rows[1].value).toBeCloseTo(200, 9);
    expect(rows[2].value).toBeCloseTo(300, 9);
    expect(sumOfValues(rows)).toBeCloseTo(600, 9);
  });

  test("equal driver values → equal allocation", () => {
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B", "C"],
        driver: { kind: "FACT_BASED", factAccountCode: "BEDS" },
      }), 900, { A: 50, B: 50, C: 50 }
    );
    expect(rows[0].value).toBeCloseTo(300, 9);
    expect(rows[1].value).toBeCloseTo(300, 9);
    expect(rows[2].value).toBeCloseTo(300, 9);
  });

  test("target missing from driverValues gets weight 0", () => {
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        driver: { kind: "FACT_BASED", factAccountCode: "BEDS" },
      }), 100, { A: 100 }
    );
    expect(rows[0].value).toBeCloseTo(100, 9);  // 100 * 100/100
    expect(rows[1].value).toBe(0);
  });

  test("driverValues with non-target entries still count toward total (leak)", () => {
    // total = 100+50 = 150; A's weight = 100/150 ≈ 0.667
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A"],
        driver: { kind: "FACT_BASED", factAccountCode: "BEDS" },
      }), 600, { A: 100, GHOST: 50 }
    );
    expect(rows[0].value).toBeCloseTo(400, 9);
  });

  test("empty driverValues → total=0 → '|| 1' fallback → every weight is 0", () => {
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        driver: { kind: "FACT_BASED", factAccountCode: "BEDS" },
      }), 1000, {}
    );
    expect(rows[0].value).toBe(0);
    expect(rows[1].value).toBe(0);
  });

  test("all-zero driverValues → fallback → every weight is 0", () => {
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        driver: { kind: "FACT_BASED", factAccountCode: "BEDS" },
      }), 1000, { A: 0, B: 0 }
    );
    expect(rows[0].value).toBe(0);
    expect(rows[1].value).toBe(0);
  });

  test("negative driverValues allowed (no clamp)", () => {
    // total = 100 + (-50) = 50; A weight = 100/50 = 2.0
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        driver: { kind: "FACT_BASED", factAccountCode: "BEDS" },
      }), 1000, { A: 100, B: -50 }
    );
    expect(rows[0].value).toBeCloseTo(2000, 9);
    expect(rows[1].value).toBeCloseTo(-1000, 9);
  });

  test("FACT_BASED ignores driver.pcts entirely", () => {
    const a = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        driver: { kind: "FACT_BASED", factAccountCode: "BEDS", pcts: { A: 99, B: 1 } } as any,
      }), 100, { A: 50, B: 50 }
    );
    expect(a[0].value).toBeCloseTo(50, 9);
    expect(a[1].value).toBeCloseTo(50, 9);
  });
});

// ── Unknown driver kind ──────────────────────────────────────────────────

describe("computeAllocationRows — unknown driver kind", () => {
  test("throws on unknown driver kind", () => {
    expect(() =>
      computeAllocationRows(
        baseSpec({ driver: { kind: "ASDF" as any } }), 100, {}
      )
    ).toThrow(/Unknown driver kind/);
  });

  test("error message includes the unknown kind for debugability", () => {
    expect(() =>
      computeAllocationRows(
        baseSpec({ driver: { kind: "BAD" as any } }), 100, {}
      )
    ).toThrow(/BAD/);
  });

  test("does not throw for any valid kind (smoke)", () => {
    expect(() => computeAllocationRows(baseSpec({ driver: { kind: "EQUAL" } }), 100, {})).not.toThrow();
    expect(() => computeAllocationRows(
      baseSpec({ driver: { kind: "FIXED_PCT", pcts: { IN_OPS: 100 } } }), 100, {}
    )).not.toThrow();
    expect(() => computeAllocationRows(
      baseSpec({ driver: { kind: "FACT_BASED", factAccountCode: "X" } }),
      100, { IN_OPS: 10 }
    )).not.toThrow();
  });
});

// ── destAccountCode fallback ─────────────────────────────────────────────

describe("computeAllocationRows — destAccountCode resolution", () => {
  test("uses destAccountCode when set", () => {
    const rows = computeAllocationRows(
      baseSpec({ destAccountCode: "7000" }), 100, {}
    );
    for (const r of rows) expect(r.accountCode).toBe("7000");
  });

  test("falls back to sourceAccountCode when destAccountCode is undefined", () => {
    const rows = computeAllocationRows(
      baseSpec({ sourceAccountCode: "6300" }), 100, {}
    );
    for (const r of rows) expect(r.accountCode).toBe("6300");
  });

  test("offset row also uses destAccountCode (not sourceAccountCode when both set)", () => {
    const rows = computeAllocationRows(
      baseSpec({
        sourceAccountCode: "6300",
        destAccountCode:   "7000",
        reverseSource:     true,
      }), 100, {}
    );
    const offset = rows[rows.length - 1];
    expect(offset.accountCode).toBe("7000");
  });

  test("offset row uses sourceAccountCode when destAccountCode is undefined", () => {
    const rows = computeAllocationRows(
      baseSpec({ sourceAccountCode: "6300", reverseSource: true }), 100, {}
    );
    expect(rows[rows.length - 1].accountCode).toBe("6300");
  });
});

// ── reverseSource flag ───────────────────────────────────────────────────

describe("computeAllocationRows — reverseSource flag", () => {
  test("reverseSource=false → no offset row (length matches target count)", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A", "B"], reverseSource: false }), 100, {}
    );
    expect(rows).toHaveLength(2);
  });

  test("reverseSource=true → adds exactly one extra row at the end", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A", "B"], reverseSource: true }), 100, {}
    );
    expect(rows).toHaveLength(3);
  });

  test("offset row's entityCode is sourceEntityCode", () => {
    const rows = computeAllocationRows(
      baseSpec({
        sourceEntityCode:  "APOLLO_GRP",
        targetEntityCodes: ["A", "B"],
        reverseSource:     true,
      }), 1000, {}
    );
    expect(rows[rows.length - 1].entityCode).toBe("APOLLO_GRP");
  });

  test("offset row's value is exactly -sourceValue", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A", "B"], reverseSource: true }), 1000, {}
    );
    expect(rows[rows.length - 1].value).toBe(-1000);
  });

  test("offset row's reason has a distinct identifier", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A"], reverseSource: true }), 500, {}
    );
    expect(rows[rows.length - 1].reason).toMatch(/offset/i);
    expect(rows[rows.length - 1].reason).not.toMatch(/Allocated from/);
  });

  test("with reverseSource, targets + offset sum to 0 (balanced posting)", () => {
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B", "C"],
        reverseSource:     true,
        driver: { kind: "FIXED_PCT", pcts: { A: 50, B: 30, C: 20 } },
      }), 1000, {}
    );
    expect(sumOfValues(rows)).toBeCloseTo(0, 9);
  });

  test("with reverseSource and EQUAL, sum is zero too", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A", "B"], reverseSource: true }), 900, {}
    );
    expect(sumOfValues(rows)).toBeCloseTo(0, 9);
  });

  test("with reverseSource and 0% pcts fallback, offset still posts -sourceValue", () => {
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        reverseSource:     true,
        driver: { kind: "FIXED_PCT", pcts: {} },
      }), 1000, {}
    );
    // Targets all 0; offset = -1000; sum = -1000 (UNBALANCED — pinned so a
    // future "skip offset if targets sum to 0" optimization is conscious).
    expect(rows[0].value).toBe(0);
    expect(rows[1].value).toBe(0);
    expect(rows[2].value).toBe(-1000);
    expect(sumOfValues(rows)).toBe(-1000);
  });
});

// ── scenario / period passthrough ────────────────────────────────────────

describe("computeAllocationRows — scenario/period passthrough", () => {
  test("every target row has scenarioCode = spec.sourceScenarioCode", () => {
    const rows = computeAllocationRows(
      baseSpec({ sourceScenarioCode: "Budget", targetEntityCodes: ["A", "B"] }), 100, {}
    );
    for (const r of rows) expect(r.scenarioCode).toBe("Budget");
  });

  test("every target row has periodCode = spec.sourcePeriodCode", () => {
    const rows = computeAllocationRows(
      baseSpec({ sourcePeriodCode: "FY2026", targetEntityCodes: ["A", "B"] }), 100, {}
    );
    for (const r of rows) expect(r.periodCode).toBe("FY2026");
  });

  test("offset row inherits scenarioCode and periodCode from source", () => {
    const rows = computeAllocationRows(
      baseSpec({
        sourceScenarioCode: "Forecast",
        sourcePeriodCode:   "2026M07",
        reverseSource:      true,
        targetEntityCodes:  ["A"],
      }), 100, {}
    );
    const offset = rows[rows.length - 1];
    expect(offset.scenarioCode).toBe("Forecast");
    expect(offset.periodCode).toBe("2026M07");
  });

  test("FACT_BASED driver does NOT use factScenarioCode/factPeriodCode for row scenario/period", () => {
    // factScenarioCode/factPeriodCode are caller hints for the driver lookup;
    // the resulting allocation rows ALWAYS post to the SOURCE scenario/period.
    const rows = computeAllocationRows(
      baseSpec({
        sourceScenarioCode: "Actual",
        sourcePeriodCode:   "2026M04",
        targetEntityCodes:  ["A"],
        driver: {
          kind: "FACT_BASED",
          factAccountCode:  "BEDS",
          factScenarioCode: "GHOST",   // should be ignored by the writer
          factPeriodCode:   "FY1999",  // should be ignored by the writer
        },
      }), 100, { A: 1 }
    );
    expect(rows[0].scenarioCode).toBe("Actual");
    expect(rows[0].periodCode).toBe("2026M04");
  });
});

// ── reason text contract ─────────────────────────────────────────────────

describe("computeAllocationRows — `reason` text", () => {
  test("target reason references the source entity code", () => {
    const rows = computeAllocationRows(
      baseSpec({ sourceEntityCode: "APOLLO_GRP", targetEntityCodes: ["A"] }),
      100, {},
    );
    expect(rows[0].reason).toMatch(/APOLLO_GRP/);
  });

  test("target reason includes 'Allocated from'", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A"] }), 100, {}
    );
    expect(rows[0].reason).toMatch(/^Allocated from/);
  });

  test("target reason includes the driver kind", () => {
    const eq = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A"], driver: { kind: "EQUAL" } }), 100, {}
    );
    const fp = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A"], driver: { kind: "FIXED_PCT", pcts: { A: 100 } } }),
      100, {},
    );
    const fb = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A"], driver: { kind: "FACT_BASED", factAccountCode: "X" } }),
      100, { A: 1 },
    );
    expect(eq[0].reason).toMatch(/EQUAL/);
    expect(fp[0].reason).toMatch(/FIXED_PCT/);
    expect(fb[0].reason).toMatch(/FACT_BASED/);
  });

  test("target reason embeds the weight percentage with .1 precision and a % sign", () => {
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        driver: { kind: "FIXED_PCT", pcts: { A: 75, B: 25 } },
      }), 100, {}
    );
    expect(rows[0].reason).toMatch(/\(75\.0%\)/);
    expect(rows[1].reason).toMatch(/\(25\.0%\)/);
  });

  test("EQUAL on 3 targets formats weight as 33.3%", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A", "B", "C"] }), 300, {}
    );
    expect(rows[0].reason).toMatch(/\(33\.3%\)/);
  });

  test("offset row reason is a distinct fixed string (no source-entity / driver markers)", () => {
    const rows = computeAllocationRows(
      baseSpec({
        sourceEntityCode:  "APOLLO_GRP",
        targetEntityCodes: ["A"],
        reverseSource:     true,
      }), 100, {}
    );
    const offset = rows[rows.length - 1];
    expect(offset.reason).toBe("Allocation offset — original cost reversed at source entity");
  });
});

// ── purity & input-mutation safety ───────────────────────────────────────

describe("computeAllocationRows — purity / no mutation", () => {
  test("does not mutate spec.targetEntityCodes array", () => {
    const targets = ["A", "B", "C"];
    const before = [...targets];
    computeAllocationRows(baseSpec({ targetEntityCodes: targets }), 300, {});
    expect(targets).toEqual(before);
  });

  test("does not mutate spec.driver.pcts object", () => {
    const pcts = { A: 60, B: 40 };
    const before = { ...pcts };
    computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        driver: { kind: "FIXED_PCT", pcts },
      }), 1000, {}
    );
    expect(pcts).toEqual(before);
  });

  test("does not mutate driverValues object", () => {
    const drivers = { A: 100, B: 200 };
    const before = { ...drivers };
    computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        driver: { kind: "FACT_BASED", factAccountCode: "X" },
      }), 1000, drivers
    );
    expect(drivers).toEqual(before);
  });

  test("works with Object.frozen pcts", () => {
    const pcts = Object.freeze({ A: 60, B: 40 });
    expect(() =>
      computeAllocationRows(
        baseSpec({
          targetEntityCodes: ["A", "B"],
          driver: { kind: "FIXED_PCT", pcts },
        }), 1000, {}
      )
    ).not.toThrow();
  });

  test("works with Object.frozen driverValues", () => {
    const dv = Object.freeze({ A: 100, B: 200 });
    expect(() =>
      computeAllocationRows(
        baseSpec({
          targetEntityCodes: ["A", "B"],
          driver: { kind: "FACT_BASED", factAccountCode: "X" },
        }), 1000, dv
      )
    ).not.toThrow();
  });

  test("returns a fresh array per call (no shared reference)", () => {
    const spec = baseSpec({ targetEntityCodes: ["A", "B"] });
    const r1 = computeAllocationRows(spec, 100, {});
    const r2 = computeAllocationRows(spec, 100, {});
    expect(r1).not.toBe(r2);
    expect(r1).toEqual(r2);
  });

  test("returns fresh row objects per call (mutations don't leak)", () => {
    const spec = baseSpec({ targetEntityCodes: ["A"] });
    const r1 = computeAllocationRows(spec, 100, {});
    r1[0].value = 9999;
    const r2 = computeAllocationRows(spec, 100, {});
    expect(r2[0].value).toBe(100);
  });
});

// ── determinism ──────────────────────────────────────────────────────────

describe("computeAllocationRows — determinism", () => {
  test("same input → same output (deep equality, 5 runs)", () => {
    const spec = baseSpec({
      targetEntityCodes: ["A", "B", "C"],
      driver: { kind: "FIXED_PCT", pcts: { A: 50, B: 30, C: 20 } },
    });
    const out = computeAllocationRows(spec, 1000, {});
    for (let i = 0; i < 4; i++) {
      expect(computeAllocationRows(spec, 1000, {})).toEqual(out);
    }
  });

  test("EQUAL determinism on same spec", () => {
    const spec = baseSpec({ targetEntityCodes: ["X", "Y", "Z"] });
    expect(computeAllocationRows(spec, 300, {}))
      .toEqual(computeAllocationRows(spec, 300, {}));
  });

  test("FACT_BASED determinism on same driverValues", () => {
    const spec = baseSpec({
      targetEntityCodes: ["A", "B"],
      driver: { kind: "FACT_BASED", factAccountCode: "BEDS" },
    });
    const drivers = { A: 100, B: 200 };
    expect(computeAllocationRows(spec, 300, drivers))
      .toEqual(computeAllocationRows(spec, 300, drivers));
  });
});

// ── floating-point precision pins ────────────────────────────────────────

describe("computeAllocationRows — floating point at depth", () => {
  test("EQUAL on 7-target × 100 has float remainder (sum reconciles within epsilon)", () => {
    const rows = computeAllocationRows(
      baseSpec({ targetEntityCodes: ["A", "B", "C", "D", "E", "F", "G"] }), 100, {}
    );
    expect(sumOfValues(rows)).toBeCloseTo(100, 9);
    // Each row ≈ 14.2857...
    expect(rows[0].value).toBeCloseTo(14.285714285, 6);
  });

  test("FIXED_PCT 1/3 each × 1000 reconciles within float epsilon", () => {
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B", "C"],
        driver: { kind: "FIXED_PCT", pcts: { A: 33.3333, B: 33.3333, C: 33.3334 } },
      }), 1000, {}
    );
    expect(sumOfValues(rows)).toBeCloseTo(1000, 6);
  });

  test("very small sourceValue still distributes proportionally", () => {
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        driver: { kind: "FIXED_PCT", pcts: { A: 60, B: 40 } },
      }), 0.01, {}
    );
    expect(rows[0].value).toBeCloseTo(0.006, 9);
    expect(rows[1].value).toBeCloseTo(0.004, 9);
  });

  test("very large sourceValue does not overflow / clamp", () => {
    const big = 1e15;
    const rows = computeAllocationRows(
      baseSpec({
        targetEntityCodes: ["A", "B"],
        driver: { kind: "FIXED_PCT", pcts: { A: 50, B: 50 } },
      }), big, {}
    );
    expect(rows[0].value).toBe(big / 2);
    expect(rows[1].value).toBe(big / 2);
  });
});

// ── realistic CFO Pilot scenarios ────────────────────────────────────────

describe("computeAllocationRows — realistic CFO Pilot scenarios", () => {
  test("IT cost pushed equally across 4 ops entities + reversed at GRP", () => {
    // Classic case from /allocations/library: "Allocate IT 6300 from GRP
    // equally to IN_OPS / US_HQ / UK_OPS / AE_OPS, reverse at GRP".
    const rows = computeAllocationRows(
      baseSpec({
        sourceAccountCode:  "6300",
        sourceEntityCode:   "APOLLO_GRP",
        sourceScenarioCode: "Actual",
        sourcePeriodCode:   "2026M04",
        targetEntityCodes:  ["IN_OPS", "US_HQ", "UK_OPS", "AE_OPS"],
        driver:             { kind: "EQUAL" },
        reverseSource:      true,
      }), 4000, {}
    );
    expect(rows).toHaveLength(5);  // 4 targets + 1 offset
    for (let i = 0; i < 4; i++) expect(rows[i].value).toBe(1000);
    expect(rows[4].value).toBe(-4000);
    expect(rows[4].entityCode).toBe("APOLLO_GRP");
    expect(sumOfValues(rows)).toBe(0);
  });

  test("rent allocated by patient beds (FACT_BASED) with no offset", () => {
    // beds: IN=200, US=100, UK=100, AE=100 (total 500)
    const rows = computeAllocationRows(
      baseSpec({
        sourceAccountCode:  "6100",  // rent
        targetEntityCodes:  ["IN_OPS", "US_HQ", "UK_OPS", "AE_OPS"],
        driver: { kind: "FACT_BASED", factAccountCode: "PATIENT_BEDS" },
      }), 1_000_000, { IN_OPS: 200, US_HQ: 100, UK_OPS: 100, AE_OPS: 100 }
    );
    expect(rows).toHaveLength(4);
    expect(rows[0].value).toBeCloseTo(400_000, 6);  // 200/500
    expect(rows[1].value).toBeCloseTo(200_000, 6);
    expect(rows[2].value).toBeCloseTo(200_000, 6);
    expect(rows[3].value).toBeCloseTo(200_000, 6);
    expect(sumOfValues(rows)).toBeCloseTo(1_000_000, 6);
  });

  test("CEO comp allocated 60/30/10 (FIXED_PCT) to 3 entities, push to a different account", () => {
    const rows = computeAllocationRows(
      baseSpec({
        sourceAccountCode:  "PAYROLL",
        destAccountCode:    "ALLOCATED_PAYROLL",
        targetEntityCodes:  ["IN_OPS", "US_HQ", "UK_OPS"],
        driver: { kind: "FIXED_PCT", pcts: { IN_OPS: 60, US_HQ: 30, UK_OPS: 10 } },
        reverseSource: true,
        sourceEntityCode: "APOLLO_GRP",
      }), 200_000, {}
    );
    expect(rows).toHaveLength(4);
    expect(rows[0].value).toBeCloseTo(120_000, 6);
    expect(rows[1].value).toBeCloseTo(60_000, 6);
    expect(rows[2].value).toBeCloseTo(20_000, 6);
    for (const r of rows) expect(r.accountCode).toBe("ALLOCATED_PAYROLL");
    expect(rows[3].entityCode).toBe("APOLLO_GRP");
    expect(rows[3].value).toBe(-200_000);
    expect(sumOfValues(rows)).toBeCloseTo(0, 6);
  });
});
