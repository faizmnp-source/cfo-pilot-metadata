// Shared CFO-Pilot demo data — used by all three directions so numbers match.
window.CFO_DATA = (() => {
  // Monthly trend for FY2026 (M1..M12) — revenue and expenses (USD millions)
  // shape mirrors the original screenshot: humped early, dip mid, climb back at end
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const revenue  = [54, 62, 73, 36, 32, 31, 30, 32, 41, 36, 35, 38];   // sums close to 440 with rounding
  const expenses = [62, 78, 96, 40, 35, 32, 31, 34, 50, 41, 38, 42];   // expenses run above
  // Scale so the sums hit exactly the headline numbers.
  const scaleTo = (arr, target) => {
    const s = arr.reduce((a,b)=>a+b,0);
    return arr.map(v => +(v * target / s).toFixed(1));
  };
  const rev = scaleTo(revenue, 440);
  const exp = scaleTo(expenses, 512); // 440 + 208 = 648; expenses ≈ 512 to leave net income at -208 after COGS

  // Entities — must sum to ~440 (revenue mix)
  const entities = [
    { code: 'US_HQ',  name: 'United States HQ',     revenue: 227, pct: 51.5, color: '#5B5BD6', flag: '🇺🇸' },
    { code: 'UK_OPS', name: 'United Kingdom Ops',   revenue: 150, pct: 34.0, color: '#2E8F6B', flag: '🇬🇧' },
    { code: 'IN_OPS', name: 'India Ops',            revenue: 37,  pct:  8.4, color: '#C44545', flag: '🇮🇳' },
    { code: 'AE_OPS', name: 'UAE Ops',              revenue: 26,  pct:  6.0, color: '#2BB1C4', flag: '🇦🇪' },
  ];

  // Variance (Actual vs Budget) — top items
  const variances = [
    { account: 'Cloud Infrastructure',  entity: 'US_HQ',  actual: 84.2, budget: 62.0, delta: +22.2, severity: 'high',   reason: 'AI workload surge in Q2 — autoscaling exceeded plan' },
    { account: 'R&D Headcount',         entity: 'US_HQ',  actual: 138.5,budget: 122.0,delta: +16.5, severity: 'med',    reason: '12 net new hires above plan; mostly senior ML eng' },
    { account: 'Marketing — Paid',      entity: 'UK_OPS', actual: 38.7, budget: 28.0, delta: +10.7, severity: 'med',    reason: 'Brand campaign pulled forward from Q3' },
    { account: 'Travel & Entertainment',entity: 'US_HQ',  actual: 11.9, budget: 7.5,  delta:  +4.4, severity: 'low',    reason: 'Sales kickoff + 3 customer summits' },
    { account: 'SaaS Subscriptions',    entity: 'IN_OPS', actual: 6.1,  budget: 9.4,  delta:  -3.3, severity: 'good',   reason: 'Consolidated tooling — Notion replaced 4 SKUs' },
    { account: 'Office & Facilities',   entity: 'AE_OPS', actual: 4.2,  budget: 7.8,  delta:  -3.6, severity: 'good',   reason: 'Dubai lease renegotiated' },
  ];

  // Expenses by category — bar chart (Actual vs Budget)
  const expenseCats = [
    { cat: 'Operating Expenses',      actual: 417, budget: 312 },
    { cat: 'COGS',                    actual: 95,  budget: 79  },
    { cat: 'Other Income / Expense',  actual: 41,  budget: 36  },
    { cat: 'Tax',                     actual: 0,   budget: 14  },
  ];

  // Forecast — next 6 months projection with bands
  const forecast = {
    months: ['Jan +1','Feb +2','Mar +3','Apr +4','May +5','Jun +6'],
    base:   [42, 47, 53, 58, 64, 71],
    upper:  [46, 53, 61, 69, 78, 88],
    lower:  [38, 41, 45, 47, 50, 54],
  };

  // Cash trajectory — cumulative cash position by month
  const cash = [
    { m: 'M1',  v: 240 }, { m: 'M2',  v: 218 }, { m: 'M3',  v: 195 },
    { m: 'M4',  v: 188 }, { m: 'M5',  v: 184 }, { m: 'M6',  v: 181 },
    { m: 'M7',  v: 183 }, { m: 'M8',  v: 187 }, { m: 'M9',  v: 192 },
    { m: 'M10', v: 195 }, { m: 'M11', v: 194 }, { m: 'M12', v: 195 },
  ];

  // AI Copilot — narrative insights, written like a senior FP&A analyst
  const insights = [
    {
      kind: 'risk',
      tag: 'CASH RUNWAY',
      headline: 'At current burn, runway extends 17 months — not the 11 you modeled in May.',
      body: 'Net income is ($208M) for FY26 but cash position only fell $45M because of the $163M factoring agreement signed in M3. Strip that out and runway is 11 months.',
      sources: ['Cash Trajectory', 'Factoring Schedule v3'],
    },
    {
      kind: 'opportunity',
      tag: 'MARGIN',
      headline: 'UK_OPS gross margin (82.1%) is 3.7pts above HQ — replicable.',
      body: 'UK\'s SaaS-heavy mix and lower support overhead suggest a structural advantage. If US_HQ matched UK margin we add $8.4M to FY26 GP.',
      sources: ['Entity P&L · UK_OPS', 'Entity P&L · US_HQ'],
    },
    {
      kind: 'anomaly',
      tag: 'VARIANCE',
      headline: 'Cloud infra is $22.2M over budget — entirely M2–M3 spike.',
      body: 'Autoscaling exceeded plan when the Llama-class training run started M2. M4 onwards is back at budget. Re-baseline or treat as one-time?',
      sources: ['GL · 6210 Cloud', 'AWS bill M1-M12'],
    },
    {
      kind: 'forecast',
      tag: 'FORECAST',
      headline: 'Q1 FY27 base case: $147M revenue (+33% YoY). 80% interval: $128–$172M.',
      body: 'Pipeline coverage at 2.4× and the Acme renewal closes M+2. The 80% band is wide because two enterprise deals (~$11M ARR) are in late-stage but unsigned.',
      sources: ['Pipeline · Salesforce', 'Forecast Model v12'],
    },
  ];

  return { months, rev, exp, entities, variances, expenseCats, forecast, cash, insights,
    headline: {
      revenue: 440, cogs: 95, grossProfit: 345, opex: 417, netIncome: -208, cash: 195,
      revGrowth: 23.0, cogsGrowth: 20.7, gpGrowth: 23.6, opexGrowth: 22.0, niGrowth: -18.4, cashGrowth: 19.2,
      gpMargin: 78.4, niMargin: -47.3, factCount: 18841, entityCount: 5, period: 'FY2026',
    }
  };
})();
