import { autoKpis } from "./kpis";

describe("autoKpis", () => {
  it("derives the standard exec KPI bundle from a minimum summary", () => {
    const k = autoKpis({
      revenue: 1000, cogs: 400, opex: 300,
      grossProfit: 600, netIncome: 100,
      cash: 500,
      revenueBudget: 900, netIncomeBudget: 80, cashBudget: 480,
    });
    const keys = k.map(x => x.key);
    expect(keys).toContain("REVENUE");
    expect(keys).toContain("GROSS_MARGIN_PCT");
    expect(keys).toContain("NET_INCOME");
    expect(keys).toContain("CASH_POSITION");
    expect(keys).toContain("BUDGET_VARIANCE_NI_PCT");
  });

  it("computes gross margin correctly", () => {
    const k = autoKpis({ revenue: 1000, cogs: 400, opex: 0, grossProfit: 600, netIncome: 600, cash: 0 });
    const gm = k.find(x => x.key === "GROSS_MARGIN_PCT")!;
    expect(gm.value).toBeCloseTo(60, 5);
  });

  it("flags negative net income as BAD favourable", () => {
    const k = autoKpis({ revenue: 100, cogs: 60, opex: 80, grossProfit: 40, netIncome: -40, cash: 0 });
    const ni = k.find(x => x.key === "NET_INCOME")!;
    expect(ni.favourable).toBe("BAD");
  });

  it("includes DSO/DPO/WC when supplied", () => {
    const k = autoKpis({ revenue: 1000, cogs: 400, opex: 0, grossProfit: 600, netIncome: 600, cash: 200, ar: 200, ap: 100, workingCapital: 350 });
    expect(k.find(x => x.key === "DSO")).toBeDefined();
    expect(k.find(x => x.key === "DPO")).toBeDefined();
    expect(k.find(x => x.key === "WORKING_CAPITAL")).toBeDefined();
  });

  it("includes Revenue/Employee when headcount given", () => {
    const k = autoKpis({ revenue: 1_000_000, cogs: 0, opex: 0, grossProfit: 0, netIncome: 0, cash: 0, headcount: 100 });
    const rpe = k.find(x => x.key === "REVENUE_PER_EMPLOYEE");
    expect(rpe).toBeDefined();
    expect(rpe!.value).toBeCloseTo(10_000, 1);
  });
});
