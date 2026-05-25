import { autoKpis, type Kpi, type SummaryShape, type KpiCategory } from "./kpis";

/*
 * Comprehensive pin for autoKpis(). This module is pure and ships KPIs to the
 * executive intelligence panel — drift here = exec-facing number regression
 * (e.g., "Gross Margin is wrong on the board pack"). Pinning every conditional
 * branch + math + favourable/category tagging.
 */

/** Minimum SummaryShape — only the 6 required fields populated. */
const minSummary = (overrides: Partial<SummaryShape> = {}): SummaryShape => ({
  revenue:     0,
  cogs:        0,
  opex:        0,
  grossProfit: 0,
  netIncome:   0,
  cash:        0,
  ...overrides,
});

const byKey = (kpis: Kpi[], key: string): Kpi | undefined =>
  kpis.find((k) => k.key === key);

describe("autoKpis — output shape", () => {
  it("returns an array (never null/undefined) even for an all-zero summary", () => {
    const k = autoKpis(minSummary());
    expect(Array.isArray(k)).toBe(true);
    expect(k.length).toBeGreaterThan(0);
  });

  it("every KPI has key/label/value/unit/category set", () => {
    const k = autoKpis(minSummary({ revenue: 1000, grossProfit: 600 }));
    for (const item of k) {
      expect(typeof item.key).toBe("string");
      expect(item.key.length).toBeGreaterThan(0);
      expect(typeof item.label).toBe("string");
      expect(item.label.length).toBeGreaterThan(0);
      expect(typeof item.value).toBe("number");
      expect(["CURRENCY", "PCT", "DAYS", "COUNT", "RATIO"]).toContain(item.unit);
      expect(["PROFITABILITY", "GROWTH", "EFFICIENCY", "LIQUIDITY", "WORKFORCE", "OTHER"])
        .toContain(item.category);
    }
  });

  it("keys are unique across the bundle (no dupes)", () => {
    const k = autoKpis(
      minSummary({
        revenue: 1000, cogs: 400, opex: 200, grossProfit: 600,
        netIncome: 200, cash: 500,
        ar: 100, ap: 50, workingCapital: 200, headcount: 10,
        ebitda: 300, revenueBudget: 900, netIncomeBudget: 180, cashBudget: 480,
        ebitdaBudget: 280,
      })
    );
    const keys = k.map((x) => x.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keys are UPPER_SNAKE_CASE", () => {
    const k = autoKpis(
      minSummary({
        revenue: 1000, ebitda: 100, ar: 50, ap: 30,
        workingCapital: 100, headcount: 5, netIncomeBudget: 50,
      })
    );
    for (const item of k) {
      expect(item.key).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });
});

describe("autoKpis — REVENUE KPI", () => {
  it("is always present (always pushed first)", () => {
    const k = autoKpis(minSummary({ revenue: 1234 }));
    expect(k[0]?.key).toBe("REVENUE");
  });

  it("carries revenue value verbatim", () => {
    const k = autoKpis(minSummary({ revenue: 12345.67 }));
    expect(byKey(k, "REVENUE")!.value).toBe(12345.67);
  });

  it("category is GROWTH and unit is CURRENCY", () => {
    const r = byKey(autoKpis(minSummary({ revenue: 100 })), "REVENUE")!;
    expect(r.category).toBe("GROWTH");
    expect(r.unit).toBe("CURRENCY");
  });

  it("favourable is GOOD", () => {
    const r = byKey(autoKpis(minSummary({ revenue: 100 })), "REVENUE")!;
    expect(r.favourable).toBe("GOOD");
  });

  it("deltaPct is null when no budget supplied", () => {
    const r = byKey(autoKpis(minSummary({ revenue: 100 })), "REVENUE")!;
    expect(r.deltaPct).toBeNull();
  });

  it("deltaPct computed correctly when budget supplied", () => {
    const r = byKey(
      autoKpis(minSummary({ revenue: 110, revenueBudget: 100 })),
      "REVENUE"
    )!;
    expect(r.deltaPct).toBeCloseTo(10, 5);
  });

  it("deltaPct uses Math.abs(budget) — negative budget gives positive denom", () => {
    const r = byKey(
      autoKpis(minSummary({ revenue: 0, revenueBudget: -100 })),
      "REVENUE"
    )!;
    // (0 - (-100)) / |-100| = 100/100 = 100
    expect(r.deltaPct).toBeCloseTo(100, 5);
  });

  it("deltaPct is null when budget is 0 (avoid div by zero)", () => {
    const r = byKey(
      autoKpis(minSummary({ revenue: 100, revenueBudget: 0 })),
      "REVENUE"
    )!;
    expect(r.deltaPct).toBeNull();
  });

  it("trend is FLAT when budget is undefined", () => {
    const r = byKey(autoKpis(minSummary({ revenue: 100 })), "REVENUE")!;
    expect(r.trend).toBe("FLAT");
  });

  it("trend is UP when actual > budget by >= 0.5%", () => {
    const r = byKey(
      autoKpis(minSummary({ revenue: 101, revenueBudget: 100 })),
      "REVENUE"
    )!;
    expect(r.trend).toBe("UP");
  });

  it("trend is DOWN when actual < budget by >= 0.5%", () => {
    const r = byKey(
      autoKpis(minSummary({ revenue: 99, revenueBudget: 100 })),
      "REVENUE"
    )!;
    expect(r.trend).toBe("DOWN");
  });

  it("trend is FLAT for delta within ±0.5%", () => {
    const r = byKey(
      autoKpis(minSummary({ revenue: 100.4, revenueBudget: 100 })),
      "REVENUE"
    )!;
    expect(r.trend).toBe("FLAT");
  });

  it("source attribution preserved", () => {
    const r = byKey(autoKpis(minSummary({ revenue: 100 })), "REVENUE")!;
    expect(r.source).toBe("all REVENUE accounts");
  });
});

describe("autoKpis — GROSS_MARGIN_PCT", () => {
  it("is present when revenue !== 0", () => {
    const k = autoKpis(minSummary({ revenue: 1000, grossProfit: 600 }));
    expect(byKey(k, "GROSS_MARGIN_PCT")).toBeDefined();
  });

  it("is absent when revenue === 0", () => {
    const k = autoKpis(minSummary({ revenue: 0, grossProfit: 0 }));
    expect(byKey(k, "GROSS_MARGIN_PCT")).toBeUndefined();
  });

  it("computes (grossProfit / revenue) * 100", () => {
    const gm = byKey(
      autoKpis(minSummary({ revenue: 1000, grossProfit: 600 })),
      "GROSS_MARGIN_PCT"
    )!;
    expect(gm.value).toBeCloseTo(60, 5);
  });

  it("handles fractional margin", () => {
    const gm = byKey(
      autoKpis(minSummary({ revenue: 800, grossProfit: 200 })),
      "GROSS_MARGIN_PCT"
    )!;
    expect(gm.value).toBeCloseTo(25, 5);
  });

  it("handles negative margin (grossProfit < 0)", () => {
    const gm = byKey(
      autoKpis(minSummary({ revenue: 100, grossProfit: -20 })),
      "GROSS_MARGIN_PCT"
    )!;
    expect(gm.value).toBeCloseTo(-20, 5);
  });

  it("handles negative revenue (returns/refunds)", () => {
    const gm = byKey(
      autoKpis(minSummary({ revenue: -100, grossProfit: -60 })),
      "GROSS_MARGIN_PCT"
    )!;
    expect(gm.value).toBeCloseTo(60, 5);
  });

  it("category is PROFITABILITY, unit is PCT, favourable GOOD", () => {
    const gm = byKey(
      autoKpis(minSummary({ revenue: 100, grossProfit: 60 })),
      "GROSS_MARGIN_PCT"
    )!;
    expect(gm.category).toBe("PROFITABILITY");
    expect(gm.unit).toBe("PCT");
    expect(gm.favourable).toBe("GOOD");
  });

  it("formula attribution preserved", () => {
    const gm = byKey(
      autoKpis(minSummary({ revenue: 100, grossProfit: 60 })),
      "GROSS_MARGIN_PCT"
    )!;
    expect(gm.formula).toBe("(Revenue − COGS) / Revenue");
    expect(gm.source).toBe("REVENUE − COGS accounts");
  });
});

describe("autoKpis — EBITDA + EBITDA_MARGIN_PCT", () => {
  it("EBITDA absent when ebitda undefined", () => {
    const k = autoKpis(minSummary({ revenue: 1000 }));
    expect(byKey(k, "EBITDA")).toBeUndefined();
    expect(byKey(k, "EBITDA_MARGIN_PCT")).toBeUndefined();
  });

  it("EBITDA present (and zero) when ebitda === 0 (explicitly supplied)", () => {
    const k = autoKpis(minSummary({ revenue: 100, ebitda: 0 }));
    expect(byKey(k, "EBITDA")).toBeDefined();
    expect(byKey(k, "EBITDA")!.value).toBe(0);
  });

  it("EBITDA value passes through verbatim", () => {
    const e = byKey(
      autoKpis(minSummary({ revenue: 1000, ebitda: 250 })),
      "EBITDA"
    )!;
    expect(e.value).toBe(250);
    expect(e.unit).toBe("CURRENCY");
    expect(e.category).toBe("PROFITABILITY");
    expect(e.favourable).toBe("GOOD");
  });

  it("EBITDA deltaPct computed against ebitdaBudget", () => {
    const e = byKey(
      autoKpis(minSummary({ revenue: 1000, ebitda: 220, ebitdaBudget: 200 })),
      "EBITDA"
    )!;
    expect(e.deltaPct).toBeCloseTo(10, 5);
    expect(e.trend).toBe("UP");
  });

  it("EBITDA_MARGIN_PCT present only when revenue !== 0", () => {
    const both = autoKpis(minSummary({ revenue: 1000, ebitda: 100 }));
    expect(byKey(both, "EBITDA_MARGIN_PCT")).toBeDefined();

    const noRev = autoKpis(minSummary({ revenue: 0, ebitda: 100 }));
    expect(byKey(noRev, "EBITDA")).toBeDefined();
    expect(byKey(noRev, "EBITDA_MARGIN_PCT")).toBeUndefined();
  });

  it("EBITDA_MARGIN_PCT = ebitda / revenue × 100", () => {
    const em = byKey(
      autoKpis(minSummary({ revenue: 1000, ebitda: 250 })),
      "EBITDA_MARGIN_PCT"
    )!;
    expect(em.value).toBeCloseTo(25, 5);
    expect(em.unit).toBe("PCT");
    expect(em.formula).toBe("EBITDA / Revenue");
  });

  it("EBITDA_MARGIN_PCT handles negative ebitda", () => {
    const em = byKey(
      autoKpis(minSummary({ revenue: 1000, ebitda: -100 })),
      "EBITDA_MARGIN_PCT"
    )!;
    expect(em.value).toBeCloseTo(-10, 5);
  });

  it("EBITDA appears AFTER GROSS_MARGIN_PCT and BEFORE NET_INCOME (order pin)", () => {
    const k = autoKpis(
      minSummary({ revenue: 1000, grossProfit: 600, ebitda: 200, netIncome: 100 })
    );
    const order = k.map((x) => x.key);
    expect(order.indexOf("GROSS_MARGIN_PCT")).toBeLessThan(order.indexOf("EBITDA"));
    expect(order.indexOf("EBITDA")).toBeLessThan(order.indexOf("NET_INCOME"));
  });
});

describe("autoKpis — NET_INCOME", () => {
  it("is always present", () => {
    const k = autoKpis(minSummary());
    expect(byKey(k, "NET_INCOME")).toBeDefined();
  });

  it("value passes through verbatim", () => {
    const ni = byKey(autoKpis(minSummary({ netIncome: 9999.99 })), "NET_INCOME")!;
    expect(ni.value).toBe(9999.99);
  });

  it("favourable is GOOD when netIncome >= 0", () => {
    expect(byKey(autoKpis(minSummary({ netIncome: 100 })), "NET_INCOME")!.favourable).toBe("GOOD");
    expect(byKey(autoKpis(minSummary({ netIncome: 0 })),   "NET_INCOME")!.favourable).toBe("GOOD");
  });

  it("favourable is BAD when netIncome < 0", () => {
    expect(byKey(autoKpis(minSummary({ netIncome: -1 })),     "NET_INCOME")!.favourable).toBe("BAD");
    expect(byKey(autoKpis(minSummary({ netIncome: -10000 })), "NET_INCOME")!.favourable).toBe("BAD");
  });

  it("category is PROFITABILITY", () => {
    expect(byKey(autoKpis(minSummary()), "NET_INCOME")!.category).toBe("PROFITABILITY");
  });

  it("deltaPct computed against netIncomeBudget", () => {
    const ni = byKey(
      autoKpis(minSummary({ netIncome: 90, netIncomeBudget: 100 })),
      "NET_INCOME"
    )!;
    expect(ni.deltaPct).toBeCloseTo(-10, 5);
    expect(ni.trend).toBe("DOWN");
  });
});

describe("autoKpis — CASH_POSITION", () => {
  it("is always present", () => {
    const k = autoKpis(minSummary());
    expect(byKey(k, "CASH_POSITION")).toBeDefined();
  });

  it("value passes through verbatim, even when negative (overdraft)", () => {
    expect(byKey(autoKpis(minSummary({ cash: 5000 })),  "CASH_POSITION")!.value).toBe(5000);
    expect(byKey(autoKpis(minSummary({ cash: -300 })), "CASH_POSITION")!.value).toBe(-300);
  });

  it("category is LIQUIDITY and favourable is GOOD", () => {
    const c = byKey(autoKpis(minSummary()), "CASH_POSITION")!;
    expect(c.category).toBe("LIQUIDITY");
    expect(c.favourable).toBe("GOOD");
  });

  it("deltaPct computed against cashBudget", () => {
    const c = byKey(
      autoKpis(minSummary({ cash: 540, cashBudget: 500 })),
      "CASH_POSITION"
    )!;
    expect(c.deltaPct).toBeCloseTo(8, 5);
    expect(c.trend).toBe("UP");
  });
});

describe("autoKpis — DSO (days sales outstanding)", () => {
  it("is absent when ar undefined", () => {
    const k = autoKpis(minSummary({ revenue: 1000 }));
    expect(byKey(k, "DSO")).toBeUndefined();
  });

  it("is absent when revenue === 0 (even if ar supplied)", () => {
    const k = autoKpis(minSummary({ revenue: 0, ar: 200 }));
    expect(byKey(k, "DSO")).toBeUndefined();
  });

  it("is present when ar defined AND revenue !== 0", () => {
    const k = autoKpis(minSummary({ revenue: 1000, ar: 200 }));
    expect(byKey(k, "DSO")).toBeDefined();
  });

  it("DSO = (ar / revenue) × days, defaults to 30-day period", () => {
    const d = byKey(
      autoKpis(minSummary({ revenue: 1000, ar: 200 })),
      "DSO"
    )!;
    // (200/1000) × 30 = 6
    expect(d.value).toBeCloseTo(6, 5);
  });

  it("uses daysInPeriod when supplied", () => {
    const d = byKey(
      autoKpis(minSummary({ revenue: 1000, ar: 200, daysInPeriod: 90 })),
      "DSO"
    )!;
    // (200/1000) × 90 = 18
    expect(d.value).toBeCloseTo(18, 5);
  });

  it("ar === 0 yields DSO === 0", () => {
    const d = byKey(
      autoKpis(minSummary({ revenue: 1000, ar: 0 })),
      "DSO"
    )!;
    expect(d.value).toBe(0);
  });

  it("category is EFFICIENCY and favourable BAD (lower DSO = better)", () => {
    const d = byKey(
      autoKpis(minSummary({ revenue: 1000, ar: 200 })),
      "DSO"
    )!;
    expect(d.category).toBe("EFFICIENCY");
    expect(d.favourable).toBe("BAD");
    expect(d.unit).toBe("DAYS");
  });

  it("formula attribution preserved", () => {
    const d = byKey(
      autoKpis(minSummary({ revenue: 1000, ar: 200 })),
      "DSO"
    )!;
    expect(d.formula).toBe("(AR / Revenue) × days_in_period");
  });
});

describe("autoKpis — DPO (days payable outstanding)", () => {
  it("is absent when ap undefined", () => {
    const k = autoKpis(minSummary({ cogs: 400 }));
    expect(byKey(k, "DPO")).toBeUndefined();
  });

  it("is absent when cogs === 0 (even if ap supplied)", () => {
    const k = autoKpis(minSummary({ cogs: 0, ap: 100 }));
    expect(byKey(k, "DPO")).toBeUndefined();
  });

  it("is present when ap defined AND cogs !== 0", () => {
    const k = autoKpis(minSummary({ cogs: 400, ap: 100 }));
    expect(byKey(k, "DPO")).toBeDefined();
  });

  it("DPO = (ap / cogs) × days, defaults to 30-day period", () => {
    const d = byKey(
      autoKpis(minSummary({ cogs: 400, ap: 100 })),
      "DPO"
    )!;
    // (100/400) × 30 = 7.5
    expect(d.value).toBeCloseTo(7.5, 5);
  });

  it("uses daysInPeriod when supplied", () => {
    const d = byKey(
      autoKpis(minSummary({ cogs: 400, ap: 100, daysInPeriod: 365 })),
      "DPO"
    )!;
    // (100/400) × 365 = 91.25
    expect(d.value).toBeCloseTo(91.25, 5);
  });

  it("ap === 0 yields DPO === 0", () => {
    const d = byKey(
      autoKpis(minSummary({ cogs: 400, ap: 0 })),
      "DPO"
    )!;
    expect(d.value).toBe(0);
  });

  it("category EFFICIENCY, favourable GOOD (higher DPO = better cash retention)", () => {
    const d = byKey(
      autoKpis(minSummary({ cogs: 400, ap: 100 })),
      "DPO"
    )!;
    expect(d.category).toBe("EFFICIENCY");
    expect(d.favourable).toBe("GOOD");
    expect(d.unit).toBe("DAYS");
  });

  it("formula attribution preserved", () => {
    const d = byKey(
      autoKpis(minSummary({ cogs: 400, ap: 100 })),
      "DPO"
    )!;
    expect(d.formula).toBe("(AP / COGS) × days_in_period");
  });
});

describe("autoKpis — WORKING_CAPITAL", () => {
  it("is absent when workingCapital undefined", () => {
    const k = autoKpis(minSummary());
    expect(byKey(k, "WORKING_CAPITAL")).toBeUndefined();
  });

  it("is present when workingCapital === 0 (explicitly supplied)", () => {
    const k = autoKpis(minSummary({ workingCapital: 0 }));
    expect(byKey(k, "WORKING_CAPITAL")).toBeDefined();
    expect(byKey(k, "WORKING_CAPITAL")!.value).toBe(0);
  });

  it("value passes through, even when negative", () => {
    expect(byKey(autoKpis(minSummary({ workingCapital: 1000 })),  "WORKING_CAPITAL")!.value).toBe(1000);
    expect(byKey(autoKpis(minSummary({ workingCapital: -200 })), "WORKING_CAPITAL")!.value).toBe(-200);
  });

  it("category is LIQUIDITY, favourable GOOD, unit CURRENCY", () => {
    const w = byKey(autoKpis(minSummary({ workingCapital: 200 })), "WORKING_CAPITAL")!;
    expect(w.category).toBe("LIQUIDITY");
    expect(w.favourable).toBe("GOOD");
    expect(w.unit).toBe("CURRENCY");
  });

  it("formula attribution preserved", () => {
    const w = byKey(autoKpis(minSummary({ workingCapital: 200 })), "WORKING_CAPITAL")!;
    expect(w.formula).toBe("Current Assets − Current Liabilities");
  });
});

describe("autoKpis — HEADCOUNT + REVENUE_PER_EMPLOYEE", () => {
  it("both absent when headcount undefined", () => {
    const k = autoKpis(minSummary({ revenue: 1000 }));
    expect(byKey(k, "HEADCOUNT")).toBeUndefined();
    expect(byKey(k, "REVENUE_PER_EMPLOYEE")).toBeUndefined();
  });

  it("HEADCOUNT present when headcount === 0 (explicit zero)", () => {
    const k = autoKpis(minSummary({ revenue: 100, headcount: 0 }));
    expect(byKey(k, "HEADCOUNT")).toBeDefined();
    expect(byKey(k, "HEADCOUNT")!.value).toBe(0);
  });

  it("REVENUE_PER_EMPLOYEE absent when headcount === 0 (no division)", () => {
    const k = autoKpis(minSummary({ revenue: 100, headcount: 0 }));
    expect(byKey(k, "REVENUE_PER_EMPLOYEE")).toBeUndefined();
  });

  it("REVENUE_PER_EMPLOYEE present when headcount > 0", () => {
    const k = autoKpis(minSummary({ revenue: 1_000_000, headcount: 100 }));
    expect(byKey(k, "REVENUE_PER_EMPLOYEE")).toBeDefined();
    expect(byKey(k, "REVENUE_PER_EMPLOYEE")!.value).toBeCloseTo(10_000, 5);
  });

  it("REVENUE_PER_EMPLOYEE absent when headcount is negative (guard `> 0`)", () => {
    const k = autoKpis(minSummary({ revenue: 1000, headcount: -5 }));
    expect(byKey(k, "REVENUE_PER_EMPLOYEE")).toBeUndefined();
    expect(byKey(k, "HEADCOUNT")).toBeDefined();
    expect(byKey(k, "HEADCOUNT")!.value).toBe(-5);
  });

  it("HEADCOUNT — category WORKFORCE, unit COUNT, favourable NEUTRAL", () => {
    const h = byKey(autoKpis(minSummary({ headcount: 10 })), "HEADCOUNT")!;
    expect(h.category).toBe("WORKFORCE");
    expect(h.unit).toBe("COUNT");
    expect(h.favourable).toBe("NEUTRAL");
  });

  it("REVENUE_PER_EMPLOYEE — category EFFICIENCY, favourable GOOD", () => {
    const rpe = byKey(
      autoKpis(minSummary({ revenue: 1_000_000, headcount: 50 })),
      "REVENUE_PER_EMPLOYEE"
    )!;
    expect(rpe.category).toBe("EFFICIENCY");
    expect(rpe.favourable).toBe("GOOD");
    expect(rpe.unit).toBe("CURRENCY");
  });

  it("REVENUE_PER_EMPLOYEE handles fractional results", () => {
    const rpe = byKey(
      autoKpis(minSummary({ revenue: 1000, headcount: 3 })),
      "REVENUE_PER_EMPLOYEE"
    )!;
    expect(rpe.value).toBeCloseTo(333.3333, 4);
  });
});

describe("autoKpis — BUDGET_VARIANCE_NI_PCT", () => {
  it("is absent when netIncomeBudget undefined", () => {
    const k = autoKpis(minSummary({ netIncome: 100 }));
    expect(byKey(k, "BUDGET_VARIANCE_NI_PCT")).toBeUndefined();
  });

  it("is present when netIncomeBudget === 0 (defined, even if zero)", () => {
    // delta() returns null when budget === 0, but the KPI is still emitted
    // because the condition is `netIncomeBudget !== undefined`. Value defaults to 0.
    const k = autoKpis(minSummary({ netIncome: 100, netIncomeBudget: 0 }));
    const bv = byKey(k, "BUDGET_VARIANCE_NI_PCT");
    expect(bv).toBeDefined();
    expect(bv!.value).toBe(0);
  });

  it("value = ((netIncome − budget) / |budget|) × 100", () => {
    const bv = byKey(
      autoKpis(minSummary({ netIncome: 120, netIncomeBudget: 100 })),
      "BUDGET_VARIANCE_NI_PCT"
    )!;
    expect(bv.value).toBeCloseTo(20, 5);
  });

  it("negative variance (miss) yields negative value", () => {
    const bv = byKey(
      autoKpis(minSummary({ netIncome: 80, netIncomeBudget: 100 })),
      "BUDGET_VARIANCE_NI_PCT"
    )!;
    expect(bv.value).toBeCloseTo(-20, 5);
    expect(bv.trend).toBe("DOWN");
  });

  it("category GROWTH, unit PCT, favourable GOOD", () => {
    const bv = byKey(
      autoKpis(minSummary({ netIncome: 100, netIncomeBudget: 100 })),
      "BUDGET_VARIANCE_NI_PCT"
    )!;
    expect(bv.category).toBe("GROWTH");
    expect(bv.unit).toBe("PCT");
    expect(bv.favourable).toBe("GOOD");
  });
});

describe("autoKpis — trend banding (0.5% threshold)", () => {
  it("trend FLAT for delta exactly 0%", () => {
    const r = byKey(
      autoKpis(minSummary({ revenue: 100, revenueBudget: 100 })),
      "REVENUE"
    )!;
    expect(r.trend).toBe("FLAT");
  });

  it("trend FLAT for delta == +0.49%", () => {
    const r = byKey(
      autoKpis(minSummary({ revenue: 100.49, revenueBudget: 100 })),
      "REVENUE"
    )!;
    expect(r.trend).toBe("FLAT");
  });

  it("trend UP for delta == +0.51% (just over threshold)", () => {
    const r = byKey(
      autoKpis(minSummary({ revenue: 100.51, revenueBudget: 100 })),
      "REVENUE"
    )!;
    expect(r.trend).toBe("UP");
  });

  it("trend DOWN for delta == -0.51%", () => {
    const r = byKey(
      autoKpis(minSummary({ revenue: 99.49, revenueBudget: 100 })),
      "REVENUE"
    )!;
    expect(r.trend).toBe("DOWN");
  });

  it("trend FLAT for delta == -0.49%", () => {
    const r = byKey(
      autoKpis(minSummary({ revenue: 99.51, revenueBudget: 100 })),
      "REVENUE"
    )!;
    expect(r.trend).toBe("FLAT");
  });
});

describe("autoKpis — purity / no-mutation", () => {
  it("does not mutate the input SummaryShape", () => {
    const input = minSummary({
      revenue: 1000, cogs: 400, grossProfit: 600, netIncome: 100,
      cash: 500, ebitda: 200, ar: 100, ap: 50, workingCapital: 150,
      headcount: 10, daysInPeriod: 30,
      revenueBudget: 950, netIncomeBudget: 90,
    });
    const snapshot = JSON.parse(JSON.stringify(input));
    autoKpis(input);
    expect(input).toEqual(snapshot);
  });

  it("is deterministic — same input yields same output (structural equality)", () => {
    const input = minSummary({ revenue: 1000, grossProfit: 600, netIncome: 100 });
    const a = autoKpis(input);
    const b = autoKpis(input);
    expect(a).toEqual(b);
  });

  it("returns a fresh array on each call (no shared mutable state)", () => {
    const a = autoKpis(minSummary());
    const b = autoKpis(minSummary());
    expect(a).not.toBe(b);
  });
});

describe("autoKpis — full bundle baseline (smoke)", () => {
  it("full-featured summary yields all 14 possible KPIs", () => {
    const k = autoKpis(
      minSummary({
        revenue: 1000, cogs: 400, opex: 200,
        grossProfit: 600, netIncome: 150, cash: 500,
        ebitda: 300,
        revenueBudget: 950, netIncomeBudget: 140,
        cashBudget: 480, ebitdaBudget: 280,
        ar: 200, ap: 100, workingCapital: 400,
        headcount: 25, daysInPeriod: 30,
      })
    );
    const keys = k.map((x) => x.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "REVENUE", "GROSS_MARGIN_PCT", "EBITDA", "EBITDA_MARGIN_PCT",
        "NET_INCOME", "CASH_POSITION", "DSO", "DPO", "WORKING_CAPITAL",
        "HEADCOUNT", "REVENUE_PER_EMPLOYEE", "BUDGET_VARIANCE_NI_PCT",
      ])
    );
    expect(k.length).toBe(12);
  });

  it("category distribution looks sane on the full bundle", () => {
    const k = autoKpis(
      minSummary({
        revenue: 1000, cogs: 400, grossProfit: 600, netIncome: 150,
        cash: 500, ebitda: 300, ar: 200, ap: 100,
        workingCapital: 400, headcount: 25, netIncomeBudget: 140,
      })
    );
    const cats = k.map((x) => x.category);
    const count = (c: KpiCategory) => cats.filter((x) => x === c).length;
    expect(count("PROFITABILITY")).toBeGreaterThanOrEqual(3);   // GM, EBITDA, EBITDA_M, NI
    expect(count("LIQUIDITY")).toBeGreaterThanOrEqual(2);        // CASH, WC
    expect(count("EFFICIENCY")).toBeGreaterThanOrEqual(2);       // DSO, DPO, RPE
    expect(count("WORKFORCE")).toBeGreaterThanOrEqual(1);        // HEADCOUNT
    expect(count("GROWTH")).toBeGreaterThanOrEqual(1);           // REVENUE
  });
});
