/*
 * Executive Intelligence — auto-KPI surfacing.
 * Given dashboard summary data + COA metadata, derive the standard
 * exec KPIs without any per-tenant configuration. Returns each KPI
 * with value, prior-period comparison (if available), and a category
 * tag so the UI can group them.
 */

export type KpiCategory =
  | "PROFITABILITY" | "GROWTH" | "EFFICIENCY"
  | "LIQUIDITY"     | "WORKFORCE" | "OTHER";

export type Kpi = {
  key:        string;
  label:      string;
  value:      number;
  unit:       "CURRENCY" | "PCT" | "DAYS" | "COUNT" | "RATIO";
  deltaPct?:  number | null;       // vs compare (Budget or Prior)
  trend?:     "UP" | "DOWN" | "FLAT";
  favourable?: "GOOD" | "BAD" | "NEUTRAL";
  category:   KpiCategory;
  formula?:   string;              // human-readable, for the storyteller
  source?:    string;              // account codes used
};

export type SummaryShape = {
  revenue: number;     cogs: number;     opex: number;
  grossProfit: number; netIncome: number;
  cash: number;
  revenueBudget?:    number; cogsBudget?: number; opexBudget?: number;
  grossProfitBudget?: number; netIncomeBudget?: number; cashBudget?: number;
  ebitda?: number;     ebitdaBudget?: number;
  ar?: number;         ap?: number;
  workingCapital?: number;
  headcount?: number;
  daysInPeriod?: number;   // for DSO / DPO
};

function pct(num: number, den: number) {
  return den === 0 || !Number.isFinite(den) ? null : (num / den) * 100;
}

function delta(actual: number, budget?: number | null) {
  if (budget == null || budget === 0) return null;
  return ((actual - budget) / Math.abs(budget)) * 100;
}

function trend(d: number | null): "UP"|"DOWN"|"FLAT" {
  if (d == null || Math.abs(d) < 0.5) return "FLAT";
  return d > 0 ? "UP" : "DOWN";
}

export function autoKpis(s: SummaryShape): Kpi[] {
  const out: Kpi[] = [];
  const days = s.daysInPeriod ?? 30;

  // Profitability
  out.push({
    key: "REVENUE", label: "Revenue", value: s.revenue, unit: "CURRENCY",
    deltaPct: delta(s.revenue, s.revenueBudget), category: "GROWTH",
    favourable: "GOOD", trend: trend(delta(s.revenue, s.revenueBudget)),
    source: "all REVENUE accounts",
  });

  if (s.revenue !== 0) {
    out.push({
      key: "GROSS_MARGIN_PCT", label: "Gross Margin %",
      value: (s.grossProfit / s.revenue) * 100, unit: "PCT",
      category: "PROFITABILITY", favourable: "GOOD",
      formula: "(Revenue − COGS) / Revenue",
      source: "REVENUE − COGS accounts",
    });
  }

  if (s.ebitda !== undefined) {
    out.push({
      key: "EBITDA", label: "EBITDA", value: s.ebitda, unit: "CURRENCY",
      deltaPct: delta(s.ebitda, s.ebitdaBudget), category: "PROFITABILITY",
      favourable: "GOOD", trend: trend(delta(s.ebitda, s.ebitdaBudget)),
    });
    if (s.revenue !== 0) {
      out.push({
        key: "EBITDA_MARGIN_PCT", label: "EBITDA Margin %",
        value: (s.ebitda / s.revenue) * 100, unit: "PCT",
        category: "PROFITABILITY", favourable: "GOOD",
        formula: "EBITDA / Revenue",
      });
    }
  }

  out.push({
    key: "NET_INCOME", label: "Net Income", value: s.netIncome, unit: "CURRENCY",
    deltaPct: delta(s.netIncome, s.netIncomeBudget), category: "PROFITABILITY",
    favourable: s.netIncome >= 0 ? "GOOD" : "BAD",
    trend: trend(delta(s.netIncome, s.netIncomeBudget)),
  });

  // Liquidity
  out.push({
    key: "CASH_POSITION", label: "Cash Position", value: s.cash, unit: "CURRENCY",
    deltaPct: delta(s.cash, s.cashBudget), category: "LIQUIDITY",
    favourable: "GOOD", trend: trend(delta(s.cash, s.cashBudget)),
  });

  if (s.ar !== undefined && s.revenue !== 0) {
    out.push({
      key: "DSO", label: "DSO (days sales outstanding)",
      value: (s.ar / s.revenue) * days, unit: "DAYS",
      category: "EFFICIENCY", favourable: "BAD",  // lower DSO = better
      formula: "(AR / Revenue) × days_in_period",
    });
  }
  if (s.ap !== undefined && s.cogs !== 0) {
    out.push({
      key: "DPO", label: "DPO (days payable outstanding)",
      value: (s.ap / s.cogs) * days, unit: "DAYS",
      category: "EFFICIENCY", favourable: "GOOD",   // higher DPO = better cash retention
      formula: "(AP / COGS) × days_in_period",
    });
  }
  if (s.workingCapital !== undefined) {
    out.push({
      key: "WORKING_CAPITAL", label: "Working Capital",
      value: s.workingCapital, unit: "CURRENCY", category: "LIQUIDITY",
      favourable: "GOOD", formula: "Current Assets − Current Liabilities",
    });
  }

  // Workforce
  if (s.headcount !== undefined) {
    out.push({
      key: "HEADCOUNT", label: "Headcount", value: s.headcount, unit: "COUNT",
      category: "WORKFORCE", favourable: "NEUTRAL",
    });
    if (s.headcount > 0) {
      out.push({
        key: "REVENUE_PER_EMPLOYEE", label: "Revenue / Employee",
        value: s.revenue / s.headcount, unit: "CURRENCY",
        category: "EFFICIENCY", favourable: "GOOD",
      });
    }
  }

  // Budget variance — only if we have any budget data
  if (s.netIncomeBudget !== undefined) {
    out.push({
      key: "BUDGET_VARIANCE_NI_PCT", label: "Net Income vs Budget",
      value: (delta(s.netIncome, s.netIncomeBudget) ?? 0),
      unit: "PCT", category: "GROWTH",
      favourable: "GOOD", trend: trend(delta(s.netIncome, s.netIncomeBudget)),
    });
  }

  return out;
}
