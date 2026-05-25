/*
 * Unit tests for the Time-dimension generator used to seed every tenant's
 * Time hierarchy.
 *
 * Covers:
 *   - generateTimePeriods(fiscalYearStartMonth, startFY, numYears)
 *   - FISCAL_YEAR_START_OPTIONS shape
 *
 * No DB, no I/O. This function decides FY layout, quarter boundaries, and
 * month codes for every tenant — a regression here silently shifts every
 * downstream report. Pin the shape now so future edits to fiscal-year math
 * can't drift without a test failure.
 */

import {
  generateTimePeriods,
  FISCAL_YEAR_START_OPTIONS,
  type TimePeriodNode,
} from "./time-periods";

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

function byCode(nodes: TimePeriodNode[], code: string): TimePeriodNode | undefined {
  return nodes.find((n) => n.code === code);
}

function only(
  nodes: TimePeriodNode[],
  type: "YEAR" | "QUARTER" | "MONTH",
): TimePeriodNode[] {
  return nodes.filter((n) => n.type === type);
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe("generateTimePeriods — input validation", () => {
  test("rejects fiscalYearStartMonth < 1", () => {
    expect(() => generateTimePeriods(0, 2026, 1)).toThrow(
      "fiscalYearStartMonth must be 1..12",
    );
  });

  test("rejects fiscalYearStartMonth > 12", () => {
    expect(() => generateTimePeriods(13, 2026, 1)).toThrow(
      "fiscalYearStartMonth must be 1..12",
    );
  });

  test("rejects numYears < 1", () => {
    expect(() => generateTimePeriods(1, 2026, 0)).toThrow(
      "numYears must be 1..30",
    );
  });

  test("rejects numYears > 30", () => {
    expect(() => generateTimePeriods(1, 2026, 31)).toThrow(
      "numYears must be 1..30",
    );
  });

  test("accepts boundary values fiscalYearStartMonth=1, 12", () => {
    expect(() => generateTimePeriods(1, 2026, 1)).not.toThrow();
    expect(() => generateTimePeriods(12, 2026, 1)).not.toThrow();
  });

  test("accepts boundary values numYears=1, 30", () => {
    expect(() => generateTimePeriods(1, 2026, 1)).not.toThrow();
    expect(() => generateTimePeriods(1, 2026, 30)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Output shape — calendar year (fiscalYearStartMonth=1)
// ---------------------------------------------------------------------------

describe("generateTimePeriods — calendar year (FY start = Jan)", () => {
  const nodes = generateTimePeriods(1, 2026, 1);

  test("returns exactly 1 + 4 + 12 = 17 nodes for one year", () => {
    expect(nodes).toHaveLength(17);
  });

  test("emits exactly 1 YEAR, 4 QUARTER, 12 MONTH nodes", () => {
    expect(only(nodes, "YEAR")).toHaveLength(1);
    expect(only(nodes, "QUARTER")).toHaveLength(4);
    expect(only(nodes, "MONTH")).toHaveLength(12);
  });

  test("YEAR node has expected shape", () => {
    const y = byCode(nodes, "FY2026")!;
    expect(y).toMatchObject({
      code: "FY2026",
      name: "FY 2026",
      type: "YEAR",
      parentCode: null,
      fiscalYear: 2026,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    // YEAR nodes have no quarter/month indices
    expect(y.monthIndex).toBeUndefined();
    expect(y.quarterIndex).toBeUndefined();
  });

  test("Q1 covers Jan–Mar with parentCode=FY2026", () => {
    const q1 = byCode(nodes, "Q1-FY2026")!;
    expect(q1).toMatchObject({
      type: "QUARTER",
      parentCode: "FY2026",
      fiscalYear: 2026,
      quarterIndex: 1,
      startDate: "2026-01-01",
      endDate: "2026-03-31",
    });
  });

  test("Q4 covers Oct–Dec and ends on Dec-31", () => {
    const q4 = byCode(nodes, "Q4-FY2026")!;
    expect(q4.startDate).toBe("2026-10-01");
    expect(q4.endDate).toBe("2026-12-31");
    expect(q4.quarterIndex).toBe(4);
  });

  test("January month code is 2026M01 with parent Q1-FY2026", () => {
    const jan = byCode(nodes, "2026M01")!;
    expect(jan).toMatchObject({
      type: "MONTH",
      name: "January 2026",
      parentCode: "Q1-FY2026",
      monthIndex: 0,
      quarterIndex: 1,
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
  });

  test("December month code is 2026M12 with parent Q4-FY2026", () => {
    const dec = byCode(nodes, "2026M12")!;
    expect(dec).toMatchObject({
      name: "December 2026",
      parentCode: "Q4-FY2026",
      monthIndex: 11,
      quarterIndex: 4,
      startDate: "2026-12-01",
      endDate: "2026-12-31",
    });
  });

  test("February 2026 (non-leap) has 28 days", () => {
    const feb = byCode(nodes, "2026M02")!;
    expect(feb.endDate).toBe("2026-02-28");
  });

  test("month-of-30 (April) ends on the 30th", () => {
    const apr = byCode(nodes, "2026M04")!;
    expect(apr.endDate).toBe("2026-04-30");
  });

  test("all month codes are zero-padded 2-digit month", () => {
    const months = only(nodes, "MONTH").map((m) => m.code);
    // every month code must match /^\d{4}M(0[1-9]|1[0-2])$/
    for (const code of months) {
      expect(code).toMatch(/^\d{4}M(0[1-9]|1[0-2])$/);
    }
  });
});

// ---------------------------------------------------------------------------
// Leap year handling
// ---------------------------------------------------------------------------

describe("generateTimePeriods — leap year handling", () => {
  test("February 2024 (leap, div 4 not 100) has 29 days", () => {
    const nodes = generateTimePeriods(1, 2024, 1);
    expect(byCode(nodes, "2024M02")!.endDate).toBe("2024-02-29");
  });

  test("February 2025 (non-leap) has 28 days", () => {
    const nodes = generateTimePeriods(1, 2025, 1);
    expect(byCode(nodes, "2025M02")!.endDate).toBe("2025-02-28");
  });

  test("February 2100 (div 100 not 400, NON-leap) has 28 days", () => {
    const nodes = generateTimePeriods(1, 2100, 1);
    expect(byCode(nodes, "2100M02")!.endDate).toBe("2100-02-28");
  });

  test("February 2000 (div 400, leap) has 29 days", () => {
    const nodes = generateTimePeriods(1, 2000, 1);
    expect(byCode(nodes, "2000M02")!.endDate).toBe("2000-02-29");
  });

  test("April-start FY ending in Feb-2029 (non-leap) has 28-day endDate on FY2028", () => {
    // FY2028 starts Apr 2028, ends Mar 2029. Q4 is Jan–Mar 2029.
    const nodes = generateTimePeriods(4, 2028, 1);
    const feb2029 = byCode(nodes, "2029M02")!;
    expect(feb2029.endDate).toBe("2029-02-28");
  });

  test("April-start FY ending in Feb-2028 (leap) has 29-day endDate on Feb 2028 month", () => {
    // FY2027 starts Apr 2027, ends Mar 2028. Q4 is Jan–Mar 2028.
    const nodes = generateTimePeriods(4, 2027, 1);
    const feb2028 = byCode(nodes, "2028M02")!;
    expect(feb2028.endDate).toBe("2028-02-29");
  });
});

// ---------------------------------------------------------------------------
// Fiscal year start = April (India standard)
// ---------------------------------------------------------------------------

describe("generateTimePeriods — April-start FY (India)", () => {
  const nodes = generateTimePeriods(4, 2026, 1);

  test("FY2026 spans Apr 2026 → Mar 2027", () => {
    const y = byCode(nodes, "FY2026")!;
    expect(y.startDate).toBe("2026-04-01");
    expect(y.endDate).toBe("2027-03-31");
  });

  test("Q1 of FY2026 is Apr–Jun 2026", () => {
    const q1 = byCode(nodes, "Q1-FY2026")!;
    expect(q1.startDate).toBe("2026-04-01");
    expect(q1.endDate).toBe("2026-06-30");
  });

  test("Q4 of FY2026 is Jan–Mar 2027 (crosses calendar year)", () => {
    const q4 = byCode(nodes, "Q4-FY2026")!;
    expect(q4.startDate).toBe("2027-01-01");
    expect(q4.endDate).toBe("2027-03-31");
    expect(q4.quarterIndex).toBe(4);
  });

  test("April 2026 belongs to fiscal Q1 with monthIndex=3 (April is calendar idx 3)", () => {
    const apr = byCode(nodes, "2026M04")!;
    expect(apr).toMatchObject({
      type: "MONTH",
      name: "April 2026",
      parentCode: "Q1-FY2026",
      monthIndex: 3,
      quarterIndex: 1,
      fiscalYear: 2026,
    });
  });

  test("March 2027 belongs to fiscal Q4 and carries fiscalYear=2026", () => {
    const mar = byCode(nodes, "2027M03")!;
    expect(mar.parentCode).toBe("Q4-FY2026");
    expect(mar.fiscalYear).toBe(2026);
    expect(mar.monthIndex).toBe(2);
  });

  test("12 months produced, codes span 2026M04 → 2027M03", () => {
    const months = only(nodes, "MONTH");
    expect(months).toHaveLength(12);
    expect(months[0].code).toBe("2026M04");
    expect(months[11].code).toBe("2027M03");
  });
});

// ---------------------------------------------------------------------------
// Fiscal year start = July
// ---------------------------------------------------------------------------

describe("generateTimePeriods — July-start FY", () => {
  const nodes = generateTimePeriods(7, 2026, 1);

  test("FY2026 spans Jul 2026 → Jun 2027", () => {
    const y = byCode(nodes, "FY2026")!;
    expect(y.startDate).toBe("2026-07-01");
    expect(y.endDate).toBe("2027-06-30");
  });

  test("July 2026 is in Q1 with monthIndex=6", () => {
    const jul = byCode(nodes, "2026M07")!;
    expect(jul).toMatchObject({
      parentCode: "Q1-FY2026",
      monthIndex: 6,
      quarterIndex: 1,
    });
  });

  test("June 2027 is in Q4 with monthIndex=5 and fiscalYear=2026", () => {
    const jun = byCode(nodes, "2027M06")!;
    expect(jun.parentCode).toBe("Q4-FY2026");
    expect(jun.monthIndex).toBe(5);
    expect(jun.fiscalYear).toBe(2026);
  });
});

// ---------------------------------------------------------------------------
// Fiscal year start = October (US federal)
// ---------------------------------------------------------------------------

describe("generateTimePeriods — October-start FY (US federal)", () => {
  const nodes = generateTimePeriods(10, 2026, 1);

  test("FY2026 spans Oct 2026 → Sep 2027", () => {
    const y = byCode(nodes, "FY2026")!;
    expect(y.startDate).toBe("2026-10-01");
    expect(y.endDate).toBe("2027-09-30");
  });

  test("October 2026 is the first month with monthIndex=9", () => {
    const oct = byCode(nodes, "2026M10")!;
    expect(oct.monthIndex).toBe(9);
    expect(oct.parentCode).toBe("Q1-FY2026");
  });

  test("September 2027 is the last month with monthIndex=8 and fiscalYear=2026", () => {
    const sep = byCode(nodes, "2027M09")!;
    expect(sep.monthIndex).toBe(8);
    expect(sep.fiscalYear).toBe(2026);
    expect(sep.parentCode).toBe("Q4-FY2026");
  });
});

// ---------------------------------------------------------------------------
// Multi-year generation
// ---------------------------------------------------------------------------

describe("generateTimePeriods — multi-year", () => {
  test("3 calendar years → 51 nodes (17 × 3)", () => {
    const nodes = generateTimePeriods(1, 2024, 3);
    expect(nodes).toHaveLength(51);
  });

  test("emits one YEAR per year in startFY..startFY+n-1", () => {
    const nodes = generateTimePeriods(1, 2024, 3);
    const years = only(nodes, "YEAR").map((y) => y.fiscalYear).sort();
    expect(years).toEqual([2024, 2025, 2026]);
  });

  test("each year has its own 4 quarters with parent = own FY", () => {
    const nodes = generateTimePeriods(1, 2024, 3);
    for (const fy of [2024, 2025, 2026]) {
      const qs = nodes.filter(
        (n) => n.type === "QUARTER" && n.fiscalYear === fy,
      );
      expect(qs).toHaveLength(4);
      for (const q of qs) {
        expect(q.parentCode).toBe(`FY${fy}`);
      }
    }
  });

  test("month codes across years remain unique", () => {
    const nodes = generateTimePeriods(1, 2024, 3);
    const months = only(nodes, "MONTH").map((m) => m.code);
    expect(new Set(months).size).toBe(months.length);
    expect(months).toHaveLength(36);
  });

  test("April-start 2-year span produces correct boundary handoff", () => {
    const nodes = generateTimePeriods(4, 2026, 2);
    // FY2026 ends Mar 2027 (2027M03), FY2027 starts Apr 2027 (2027M04)
    expect(byCode(nodes, "2027M03")!.fiscalYear).toBe(2026);
    expect(byCode(nodes, "2027M04")!.fiscalYear).toBe(2027);
    expect(byCode(nodes, "2027M04")!.parentCode).toBe("Q1-FY2027");
  });
});

// ---------------------------------------------------------------------------
// Structural invariants
// ---------------------------------------------------------------------------

describe("generateTimePeriods — structural invariants", () => {
  test("every QUARTER's parent resolves to a YEAR in the same set", () => {
    const nodes = generateTimePeriods(4, 2025, 2);
    const yearCodes = new Set(only(nodes, "YEAR").map((y) => y.code));
    for (const q of only(nodes, "QUARTER")) {
      expect(q.parentCode).not.toBeNull();
      expect(yearCodes.has(q.parentCode as string)).toBe(true);
    }
  });

  test("every MONTH's parent resolves to a QUARTER in the same set", () => {
    const nodes = generateTimePeriods(7, 2025, 2);
    const qCodes = new Set(only(nodes, "QUARTER").map((q) => q.code));
    for (const m of only(nodes, "MONTH")) {
      expect(m.parentCode).not.toBeNull();
      expect(qCodes.has(m.parentCode as string)).toBe(true);
    }
  });

  test("YEAR nodes always have parentCode=null", () => {
    const nodes = generateTimePeriods(10, 2026, 2);
    for (const y of only(nodes, "YEAR")) {
      expect(y.parentCode).toBeNull();
    }
  });

  test("every MONTH has monthIndex in 0..11 and quarterIndex in 1..4", () => {
    const nodes = generateTimePeriods(4, 2026, 1);
    for (const m of only(nodes, "MONTH")) {
      expect(m.monthIndex).toBeGreaterThanOrEqual(0);
      expect(m.monthIndex).toBeLessThanOrEqual(11);
      expect(m.quarterIndex).toBeGreaterThanOrEqual(1);
      expect(m.quarterIndex).toBeLessThanOrEqual(4);
    }
  });

  test("startDate < endDate for every node, across all start months", () => {
    for (const fsm of [1, 4, 7, 10]) {
      const nodes = generateTimePeriods(fsm, 2026, 1);
      for (const n of nodes) {
        expect(
          new Date(n.startDate).getTime(),
        ).toBeLessThan(new Date(n.endDate).getTime());
      }
    }
  });

  test("a YEAR's startDate matches its Q1.startDate and its endDate matches Q4.endDate", () => {
    for (const fsm of [1, 4, 7, 10]) {
      const nodes = generateTimePeriods(fsm, 2026, 1);
      const y = byCode(nodes, "FY2026")!;
      const q1 = byCode(nodes, "Q1-FY2026")!;
      const q4 = byCode(nodes, "Q4-FY2026")!;
      expect(y.startDate).toBe(q1.startDate);
      expect(y.endDate).toBe(q4.endDate);
    }
  });

  test("a QUARTER's first/last month dates match the quarter's start/end", () => {
    const nodes = generateTimePeriods(4, 2026, 1);
    // Q1-FY2026 (Apr 2026 = 2026M04, Jun 2026 = 2026M06)
    const q1 = byCode(nodes, "Q1-FY2026")!;
    const apr = byCode(nodes, "2026M04")!;
    const jun = byCode(nodes, "2026M06")!;
    expect(q1.startDate).toBe(apr.startDate);
    expect(q1.endDate).toBe(jun.endDate);
  });

  test("calendar-year FY2026 generated is identical regardless of startFY position in a 3-year span", () => {
    // generating just FY2026, vs generating 2024-2026 then filtering, should
    // yield the same FY2026 sub-tree.
    const single = generateTimePeriods(1, 2026, 1);
    const triple = generateTimePeriods(1, 2024, 3).filter(
      (n) => n.fiscalYear === 2026,
    );
    // Order may differ; compare as sets of codes + by-code shape
    expect(new Set(single.map((n) => n.code))).toEqual(
      new Set(triple.map((n) => n.code)),
    );
    for (const a of single) {
      const b = triple.find((x) => x.code === a.code)!;
      expect(b).toEqual(a);
    }
  });
});

// ---------------------------------------------------------------------------
// FISCAL_YEAR_START_OPTIONS — UI constant sanity
// ---------------------------------------------------------------------------

describe("FISCAL_YEAR_START_OPTIONS", () => {
  test("exposes the 4 supported start months: 1, 4, 7, 10", () => {
    const values = FISCAL_YEAR_START_OPTIONS.map((o) => o.value).sort(
      (a, b) => a - b,
    );
    expect(values).toEqual([1, 4, 7, 10]);
  });

  test("every option has non-empty label and description", () => {
    for (const o of FISCAL_YEAR_START_OPTIONS) {
      expect(typeof o.label).toBe("string");
      expect(o.label.length).toBeGreaterThan(0);
      expect(typeof o.description).toBe("string");
      expect(o.description.length).toBeGreaterThan(0);
    }
  });

  test("every option.value is a valid input to generateTimePeriods", () => {
    for (const o of FISCAL_YEAR_START_OPTIONS) {
      expect(() => generateTimePeriods(o.value, 2026, 1)).not.toThrow();
    }
  });
});
