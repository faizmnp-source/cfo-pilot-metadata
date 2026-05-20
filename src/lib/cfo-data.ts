export const kpiData = {
  revenue:  { value: 24300000, delta: 8.2,  trend: "up"      as const, sparkline: [18,20,19,22,21,23,24] },
  ebitda:   { value: 4100000,  delta: 3.1,  trend: "up"      as const, sparkline: [3.2,3.4,3.1,3.5,3.8,4.0,4.1] },
  cash:     { value: 8700000,  delta: 0.0,  trend: "neutral" as const, sparkline: [8.5,8.9,8.7,8.8,8.6,8.7,8.7] },
  burnRate: { value: 1200000,  delta: -4.1, trend: "up"      as const, sparkline: [1.5,1.4,1.3,1.35,1.28,1.22,1.2] },
};

export const revenueChartData = [
  { month: "Jul", actual: 18200000, budget: 17500000, forecast: 17800000 },
  { month: "Aug", actual: 19800000, budget: 19000000, forecast: 19200000 },
  { month: "Sep", actual: 20100000, budget: 20500000, forecast: 20000000 },
  { month: "Oct", actual: 21500000, budget: 21000000, forecast: 21300000 },
  { month: "Nov", actual: 22800000, budget: 22000000, forecast: 22500000 },
  { month: "Dec", actual: 21900000, budget: 23500000, forecast: 22000000 },
  { month: "Jan", actual: 23100000, budget: 23000000, forecast: 23000000 },
  { month: "Feb", actual: 23800000, budget: 24000000, forecast: 23800000 },
  { month: "Mar", actual: 24300000, budget: 24500000, forecast: 24200000 },
  { month: "Apr", actual: null,     budget: 25000000, forecast: 25100000 },
  { month: "May", actual: null,     budget: 25500000, forecast: 25800000 },
  { month: "Jun", actual: null,     budget: 26000000, forecast: 26400000 },
];

export const departmentData = [
  { name: "Sales & Revenue",  budget: 2100000, actual: 2400000, variance: 300000,  variancePct: 14.3,  headcount: 34, status: "over"     },
  { name: "Engineering",      budget: 1800000, actual: 1700000, variance: -100000, variancePct: -5.6,  headcount: 28, status: "under"    },
  { name: "Marketing",        budget: 950000,  actual: 1020000, variance: 70000,   variancePct: 7.4,   headcount: 12, status: "over"     },
  { name: "G&A",              budget: 900000,  actual: 920000,  variance: 20000,   variancePct: 2.2,   headcount: 18, status: "on-track" },
  { name: "Customer Success", budget: 620000,  actual: 580000,  variance: -40000,  variancePct: -6.5,  headcount: 15, status: "under"    },
  { name: "Product",          budget: 740000,  actual: 760000,  variance: 20000,   variancePct: 2.7,   headcount: 10, status: "on-track" },
];

export const closeTasks = [
  { id: 1,  title: "Bank Reconciliation",         owner: "Sarah K.", dueDate: "May 21", status: "complete",    category: "Reconciliation"  },
  { id: 2,  title: "Accounts Receivable Aging",   owner: "Mike T.",  dueDate: "May 21", status: "complete",    category: "Reconciliation"  },
  { id: 3,  title: "Accounts Payable Review",     owner: "Sarah K.", dueDate: "May 22", status: "in-progress", category: "Reconciliation"  },
  { id: 4,  title: "Revenue Recognition",         owner: "James L.", dueDate: "May 22", status: "in-progress", category: "Revenue"         },
  { id: 5,  title: "Deferred Revenue Schedule",   owner: "James L.", dueDate: "May 22", status: "not-started", category: "Revenue"         },
  { id: 6,  title: "Payroll Journal Entry",       owner: "Dana P.",  dueDate: "May 23", status: "complete",    category: "Journal Entries" },
  { id: 7,  title: "Prepaid Amortization",        owner: "Dana P.",  dueDate: "May 23", status: "not-started", category: "Journal Entries" },
  { id: 8,  title: "Fixed Assets Depreciation",   owner: "Mike T.",  dueDate: "May 23", status: "not-started", category: "Journal Entries" },
  { id: 9,  title: "Intercompany Eliminations",   owner: "James L.", dueDate: "May 24", status: "blocked",     category: "Consolidation"   },
  { id: 10, title: "Flux Analysis",               owner: "Sarah K.", dueDate: "May 25", status: "not-started", category: "Review"          },
  { id: 11, title: "Management Reporting Package",owner: "Sarah K.", dueDate: "May 26", status: "not-started", category: "Review"          },
];

export const budgetLines = [
  { id: "rev",   label: "Revenue",            indent: 0, isHeader: true, jan: 23000000, feb: 23800000, mar: 24300000, budgetJan: 23000000, budgetFeb: 24000000, budgetMar: 24500000,
    children: [
      { id: "saas",      label: "SaaS Subscriptions",    indent: 1, jan: 18500000, feb: 19200000, mar: 19800000, budgetJan: 18500000, budgetFeb: 19500000, budgetMar: 20000000 },
      { id: "services",  label: "Professional Services", indent: 1, jan: 2800000,  feb: 2900000,  mar: 2900000,  budgetJan: 2800000,  budgetFeb: 2800000,  budgetMar: 2800000  },
      { id: "other-rev", label: "Other Revenue",         indent: 1, jan: 1700000,  feb: 1700000,  mar: 1600000,  budgetJan: 1700000,  budgetFeb: 1700000,  budgetMar: 1700000  },
    ]},
  { id: "cogs",  label: "Cost of Revenue",    indent: 0, isHeader: true, jan: 7200000,  feb: 7400000,  mar: 7600000,  budgetJan: 7100000,  budgetFeb: 7300000,  budgetMar: 7500000,
    children: [
      { id: "infra",    label: "Infrastructure & Hosting", indent: 1, jan: 2100000, feb: 2200000, mar: 2250000, budgetJan: 2000000, budgetFeb: 2100000, budgetMar: 2200000 },
      { id: "support",  label: "Customer Support",         indent: 1, jan: 1800000, feb: 1850000, mar: 1900000, budgetJan: 1800000, budgetFeb: 1850000, budgetMar: 1850000 },
      { id: "delivery", label: "Service Delivery",         indent: 1, jan: 3300000, feb: 3350000, mar: 3450000, budgetJan: 3300000, budgetFeb: 3350000, budgetMar: 3450000 },
    ]},
  { id: "gp",    label: "Gross Profit",       indent: 0, isHeader: true, isTotal: true, jan: 15800000, feb: 16400000, mar: 16700000, budgetJan: 15900000, budgetFeb: 16700000, budgetMar: 17000000 },
  { id: "opex",  label: "Operating Expenses", indent: 0, isHeader: true, jan: 11200000, feb: 11500000, mar: 11800000, budgetJan: 11000000, budgetFeb: 11300000, budgetMar: 11600000,
    children: [
      { id: "sales-mkt", label: "Sales & Marketing",        indent: 1, jan: 3050000, feb: 3150000, mar: 3200000, budgetJan: 3000000, budgetFeb: 3100000, budgetMar: 3200000 },
      { id: "rd",        label: "Research & Development",   indent: 1, jan: 4800000, feb: 4900000, mar: 5000000, budgetJan: 4800000, budgetFeb: 4900000, budgetMar: 5000000 },
      { id: "ga",        label: "General & Administrative", indent: 1, jan: 3350000, feb: 3450000, mar: 3600000, budgetJan: 3200000, budgetFeb: 3300000, budgetMar: 3400000 },
    ]},
  { id: "ebitda",label: "EBITDA",             indent: 0, isHeader: true, isTotal: true, jan: 4600000,  feb: 4900000,  mar: 4900000,  budgetJan: 4900000,  budgetFeb: 5400000,  budgetMar: 5400000  },
] as const;

export const forecastScenarios = [
  { month: "Jan", base: 23100000, bull: 23100000, bear: 23100000 },
  { month: "Feb", base: 23800000, bull: 23800000, bear: 23800000 },
  { month: "Mar", base: 24300000, bull: 24300000, bear: 24300000 },
  { month: "Apr", base: 25100000, bull: 26500000, bear: 23400000 },
  { month: "May", base: 25800000, bull: 27400000, bear: 23800000 },
  { month: "Jun", base: 26400000, bull: 28200000, bear: 24100000 },
  { month: "Jul", base: 27200000, bull: 29100000, bear: 24600000 },
  { month: "Aug", base: 28000000, bull: 30200000, bear: 25000000 },
  { month: "Sep", base: 28900000, bull: 31400000, bear: 25500000 },
  { month: "Oct", base: 29800000, bull: 32600000, bear: 26000000 },
  { month: "Nov", base: 30700000, bull: 33800000, bear: 26500000 },
  { month: "Dec", base: 31500000, bull: 35000000, bear: 27000000 },
];

export const aiInsights = [
  { id: 1, title: "Revenue trending +11% above forecast", body: "Enterprise segment drove $1.2M in upside vs. plan. SMB churn remains elevated at 4.1% MoM — monitor for Q3 risk.", type: "positive", action: "View breakdown" },
  { id: 2, title: "G&A overspend detected", body: "G&A is tracking $200K over budget YTD, primarily in software subscriptions (+$85K) and facilities (+$115K).", type: "warning", action: "Investigate" },
  { id: 3, title: "Cash runway extended to 28 months", body: "Based on current burn rate of $1.2M/mo and cash balance of $8.7M, plus committed ARR growth, runway has extended 3 months vs. last forecast.", type: "positive", action: "View model" },
];

export const activityFeed = [
  { id: 1, user: "Sarah K.", action: "completed",   task: "Bank Reconciliation",  time: "2 hours ago", avatar: "SK" },
  { id: 2, user: "James L.", action: "updated",     task: "Revenue Recognition",  time: "4 hours ago", avatar: "JL" },
  { id: 3, user: "Dana P.",  action: "completed",   task: "Payroll Journal Entry", time: "Yesterday",  avatar: "DP" },
  { id: 4, user: "Mike T.",  action: "commented on",task: "AR Aging",              time: "Yesterday",  avatar: "MT" },
];
