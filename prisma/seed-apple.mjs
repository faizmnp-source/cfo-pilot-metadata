// ═══════════════════════════════════════════════════════════════════
// Seed: Apple Inc — comprehensive multi-entity multi-currency tenant
// for end-to-end CFO Pilot validation.
//
//   Login:  admin@apple.com / admin123
//   Slug:   apple-inc
//
//   What you get:
//     • 5 entities: AAPL_GROUP (parent) + 4 regional subs
//     • 6 currencies: USD (base), EUR, CNY, JPY, INR, GBP
//     • ~60 accounts (P&L + Balance Sheet, GAAP-style)
//     • 3 product lines × 3 channels (UD1 + UD2)
//     • 3 scenarios: Actual, Budget, Forecast
//     • 24 months: Jan 2025 – Dec 2026 (calendar FY)
//     • ~40K–60K facts with realistic seasonality + variance
//     • FX rates for every (currency, period) pair
//     • EntityOwnership edges (100% sub-ownership)
//     • Sample MappingRules (Tally → Account)
//     • Sample DataForms (P&L Input, Variance Review)
//     • Sample CalcRule (15% bonus accrual)
//     • Sample AutomationJob (monthly close)
//     • Sample CloseRun for 2026M05 (T-2 → T+5 task list)
//
//   Run:  npm run seed:apple
//         (against whichever DATABASE_URL is in .env / .env.local)
//
//   Idempotent: re-running upserts everything in place.
// ═══════════════════════════════════════════════════════════════════

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TENANT_ID = "apple-inc-tenant-0001";
const ADMIN_HASH = "$2a$10$I.VRZOP2XIVBxjtcsbjpLu8TWL0hgUNz2/Df0vtYnpW9qkNG001pG"; // admin123

// ─── Helpers ────────────────────────────────────────────────────

async function upsertDim(kind, code, label, isCustom = false) {
  return prisma.dimension.upsert({
    where: { tenantId_kind: { tenantId: TENANT_ID, kind } },
    update: { code, label, isEnabled: true, isCustom },
    create: { tenantId: TENANT_ID, kind, code, label, isEnabled: true, isCustom },
  });
}

async function upsertMember(dimensionId, memberCode, memberName, properties = {}, extras = {}) {
  return prisma.dimensionMember.upsert({
    where: {
      tenantId_dimensionId_memberCode: { tenantId: TENANT_ID, dimensionId, memberCode },
    },
    update: { memberName, properties, isActive: true, ...extras },
    create: {
      tenantId: TENANT_ID, dimensionId, memberCode, memberName,
      isActive: true, properties, ...extras,
    },
  });
}

async function getOrCreateHierarchy(dimensionId, code = "default") {
  const existing = await prisma.hierarchy.findFirst({
    where: { tenantId: TENANT_ID, dimensionId, code },
  });
  if (existing) return existing;
  return prisma.hierarchy.create({
    data: {
      tenantId: TENANT_ID, dimensionId, code, name: code === "default" ? "Default" : code,
      isPrimary: code === "default", isActive: true,
    },
  });
}

async function addEdge(hierarchyId, parentMemberId, childMemberId, operator = "ADD") {
  const exists = await prisma.hierarchyEdge.findFirst({
    where: { tenantId: TENANT_ID, hierarchyId, parentMemberId, childMemberId },
  });
  if (exists) return exists;
  return prisma.hierarchyEdge.create({
    data: { tenantId: TENANT_ID, hierarchyId, parentMemberId, childMemberId, operator, weight: 1 },
  });
}

const pad = (n) => String(n).padStart(2, "0");

// ─── Calendar time (Jan-Dec FY) ─────────────────────────────────

function buildCalendarFy(fy /* e.g. 2025 means FY2025 = Jan-Dec 2025 */) {
  const yearCode = `FY${fy}`;
  const yearNode = {
    code: yearCode, name: `FY${fy}`,
    properties: {
      period_type: "YEAR", fiscal_year: fy,
      start_date: `${fy}-01-01`, end_date: `${fy}-12-31`,
    },
  };
  const quarters = [];
  const months = [];
  for (let q = 1; q <= 4; q++) {
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = q * 3;
    quarters.push({
      code: `${fy}Q${q}`, name: `Q${q} ${fy}`, parentCode: yearCode,
      properties: {
        period_type: "QUARTER", fiscal_year: fy, quarter_index: q,
        start_date: `${fy}-${pad(startMonth)}-01`,
        end_date: `${fy}-${pad(endMonth)}-${pad(new Date(fy, endMonth, 0).getDate())}`,
      },
    });
    for (let mIdx = 0; mIdx < 3; mIdx++) {
      const m = startMonth + mIdx;
      months.push({
        code: `${fy}M${pad(m)}`,
        name: `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m-1]} ${fy}`,
        parentCode: `${fy}Q${q}`,
        properties: {
          period_type: "MONTH", fiscal_year: fy, quarter_index: q, month_index: m,
          start_date: `${fy}-${pad(m)}-01`,
          end_date: `${fy}-${pad(m)}-${pad(new Date(fy, m, 0).getDate())}`,
        },
      });
    }
  }
  return { year: yearNode, quarters, months };
}

// ─── Chart of accounts (Apple-style GAAP) ────────────────────────

const ACCOUNTS = [
  // ── Income Statement: Revenue ─────────────────────
  { code: "4000", name: "Total Net Sales",               account_type: "REVENUE", parent: null },
  { code: "4100", name: "Products Net Sales",            account_type: "REVENUE", parent: "4000" },
  { code: "4110", name: "iPhone",                        account_type: "REVENUE", parent: "4100", leaf: true },
  { code: "4120", name: "Mac",                           account_type: "REVENUE", parent: "4100", leaf: true },
  { code: "4130", name: "iPad",                          account_type: "REVENUE", parent: "4100", leaf: true },
  { code: "4140", name: "Wearables, Home & Accessories", account_type: "REVENUE", parent: "4100", leaf: true },
  { code: "4200", name: "Services Net Sales",            account_type: "REVENUE", parent: "4000" },
  { code: "4210", name: "App Store",                     account_type: "REVENUE", parent: "4200", leaf: true },
  { code: "4220", name: "iCloud",                        account_type: "REVENUE", parent: "4200", leaf: true },
  { code: "4230", name: "Apple Music",                   account_type: "REVENUE", parent: "4200", leaf: true },
  { code: "4240", name: "AppleCare",                     account_type: "REVENUE", parent: "4200", leaf: true },
  { code: "4250", name: "Advertising",                   account_type: "REVENUE", parent: "4200", leaf: true },

  // ── COGS ──────────────────────────────────────────
  { code: "5000", name: "Total Cost of Sales",           account_type: "EXPENSE", parent: null },
  { code: "5100", name: "Products COGS",                 account_type: "EXPENSE", parent: "5000" },
  { code: "5110", name: "iPhone COGS",                   account_type: "EXPENSE", parent: "5100", leaf: true },
  { code: "5120", name: "Mac COGS",                      account_type: "EXPENSE", parent: "5100", leaf: true },
  { code: "5130", name: "iPad COGS",                     account_type: "EXPENSE", parent: "5100", leaf: true },
  { code: "5140", name: "Wearables COGS",                account_type: "EXPENSE", parent: "5100", leaf: true },
  { code: "5200", name: "Services COGS",                 account_type: "EXPENSE", parent: "5000", leaf: true },

  // ── Operating Expense ─────────────────────────────
  { code: "6000", name: "Total Operating Expenses",      account_type: "EXPENSE", parent: null },
  { code: "6100", name: "Research & Development",        account_type: "EXPENSE", parent: "6000" },
  { code: "6110", name: "R&D Salaries",                  account_type: "EXPENSE", parent: "6100", leaf: true },
  { code: "6120", name: "R&D Stock Comp",                account_type: "EXPENSE", parent: "6100", leaf: true },
  { code: "6130", name: "R&D Facilities",                account_type: "EXPENSE", parent: "6100", leaf: true },
  { code: "6140", name: "R&D Other",                     account_type: "EXPENSE", parent: "6100", leaf: true },
  { code: "6200", name: "Selling, General & Administrative", account_type: "EXPENSE", parent: "6000" },
  { code: "6210", name: "SG&A Salaries",                 account_type: "EXPENSE", parent: "6200", leaf: true },
  { code: "6220", name: "SG&A Stock Comp",               account_type: "EXPENSE", parent: "6200", leaf: true },
  { code: "6230", name: "Marketing & Advertising",       account_type: "EXPENSE", parent: "6200", leaf: true },
  { code: "6240", name: "Professional Services",         account_type: "EXPENSE", parent: "6200", leaf: true },
  { code: "6250", name: "Facilities & IT",               account_type: "EXPENSE", parent: "6200", leaf: true },
  { code: "6260", name: "Travel",                        account_type: "EXPENSE", parent: "6200", leaf: true },

  // ── Other / below-line ─────────────────────────────
  { code: "7100", name: "Interest Income",               account_type: "REVENUE", parent: null, leaf: true },
  { code: "7200", name: "Interest Expense",              account_type: "EXPENSE", parent: null, leaf: true },
  { code: "7300", name: "FX Gains / Losses",             account_type: "EXPENSE", parent: null, leaf: true },
  { code: "7900", name: "Provision for Income Taxes",    account_type: "EXPENSE", parent: null, leaf: true },

  // ── Balance Sheet: Assets ──────────────────────────
  { code: "1000", name: "Total Assets",                  account_type: "ASSET", parent: null },
  { code: "1100", name: "Current Assets",                account_type: "ASSET", parent: "1000" },
  { code: "1110", name: "Cash & Cash Equivalents",       account_type: "ASSET", parent: "1100", leaf: true },
  { code: "1120", name: "Marketable Securities (current)", account_type: "ASSET", parent: "1100", leaf: true },
  { code: "1130", name: "Accounts Receivable",           account_type: "ASSET", parent: "1100", leaf: true },
  { code: "1140", name: "Inventory",                     account_type: "ASSET", parent: "1100", leaf: true },
  { code: "1150", name: "Vendor Non-Trade Receivables",  account_type: "ASSET", parent: "1100", leaf: true },
  { code: "1190", name: "Other Current Assets",          account_type: "ASSET", parent: "1100", leaf: true },
  { code: "1200", name: "Non-Current Assets",            account_type: "ASSET", parent: "1000" },
  { code: "1210", name: "Marketable Securities (long-term)", account_type: "ASSET", parent: "1200", leaf: true },
  { code: "1220", name: "Property, Plant & Equipment",   account_type: "ASSET", parent: "1200", leaf: true },
  { code: "1290", name: "Other Non-Current Assets",      account_type: "ASSET", parent: "1200", leaf: true },

  // ── Balance Sheet: Liabilities ─────────────────────
  { code: "2000", name: "Total Liabilities",             account_type: "LIABILITY", parent: null },
  { code: "2100", name: "Current Liabilities",           account_type: "LIABILITY", parent: "2000" },
  { code: "2110", name: "Accounts Payable",              account_type: "LIABILITY", parent: "2100", leaf: true },
  { code: "2120", name: "Accrued Expenses",              account_type: "LIABILITY", parent: "2100", leaf: true },
  { code: "2130", name: "Deferred Revenue (current)",    account_type: "LIABILITY", parent: "2100", leaf: true },
  { code: "2140", name: "Commercial Paper",              account_type: "LIABILITY", parent: "2100", leaf: true },
  { code: "2150", name: "Term Debt (current)",           account_type: "LIABILITY", parent: "2100", leaf: true },
  { code: "2200", name: "Non-Current Liabilities",       account_type: "LIABILITY", parent: "2000" },
  { code: "2210", name: "Term Debt (long-term)",         account_type: "LIABILITY", parent: "2200", leaf: true },
  { code: "2220", name: "Deferred Revenue (long-term)",  account_type: "LIABILITY", parent: "2200", leaf: true },
  { code: "2290", name: "Other Non-Current Liabilities", account_type: "LIABILITY", parent: "2200", leaf: true },

  // ── Equity ─────────────────────────────────────────
  { code: "3000", name: "Total Stockholders Equity",     account_type: "EQUITY", parent: null },
  { code: "3100", name: "Common Stock",                  account_type: "EQUITY", parent: "3000", leaf: true },
  { code: "3200", name: "Retained Earnings",             account_type: "EQUITY", parent: "3000", leaf: true },
  { code: "3300", name: "Accumulated Other Comprehensive Income", account_type: "EQUITY", parent: "3000", leaf: true },

  // ── Statistical / Headcount (for workforce) ────────
  { code: "9100", name: "Headcount",                     account_type: "STATISTICAL", parent: null, leaf: true },
];

const ENTITIES = [
  { code: "AAPL_GROUP", name: "Apple Inc (Consolidated)", parent: null, ccy: "USD", country: "US" },
  { code: "AAPL_US",    name: "Apple US Operations",      parent: "AAPL_GROUP", ccy: "USD", country: "US" },
  { code: "AAPL_EU",    name: "Apple Europe (Ireland)",   parent: "AAPL_GROUP", ccy: "EUR", country: "IE" },
  { code: "AAPL_CN",    name: "Apple Greater China",      parent: "AAPL_GROUP", ccy: "CNY", country: "CN" },
  { code: "AAPL_APAC",  name: "Apple Japan & APAC",       parent: "AAPL_GROUP", ccy: "JPY", country: "JP" },
];

const SCENARIOS = [
  { code: "Actual",   name: "Actual",   scenario_type: "ACTUAL"   },
  { code: "Budget",   name: "Budget",   scenario_type: "BUDGET"   },
  { code: "Forecast", name: "Forecast", scenario_type: "FORECAST" },
];

const CURRENCIES = [
  { code: "USD", name: "US Dollar",       is_base: true,  symbol: "$"  },
  { code: "EUR", name: "Euro",            is_base: false, symbol: "€"  },
  { code: "CNY", name: "Chinese Yuan",    is_base: false, symbol: "¥"  },
  { code: "JPY", name: "Japanese Yen",    is_base: false, symbol: "¥"  },
  { code: "INR", name: "Indian Rupee",    is_base: false, symbol: "₹"  },
  { code: "GBP", name: "British Pound",   is_base: false, symbol: "£"  },
  // Special meta-currencies used by translation engine
  { code: "Local",     name: "Local Currency",      is_base: false, symbol: ""  },
  { code: "Reporting", name: "Reporting Currency",  is_base: false, symbol: "$" },
];

const PRODUCTS = [
  { code: "P-IPHONE",    name: "iPhone"         },
  { code: "P-MAC",       name: "Mac"            },
  { code: "P-IPAD",      name: "iPad"           },
  { code: "P-WEARABLES", name: "Wearables"      },
  { code: "P-SERVICES",  name: "Services"       },
];

const CHANNELS = [
  { code: "CH-RETAIL",       name: "Apple Retail Stores" },
  { code: "CH-ONLINE",       name: "Apple Online Store"  },
  { code: "CH-CARRIER",      name: "Carrier / Reseller"  },
  { code: "CH-EDUCATION",    name: "Education"           },
  { code: "CH-ENTERPRISE",   name: "Enterprise / B2B"    },
];

// FX rates — 1 unit foreign = rate USD. Set roughly to 2026 levels.
const FX_BASE = {
  USD: 1.0,
  EUR: 1.08,
  CNY: 0.139,
  JPY: 0.0067,
  INR: 0.0119,
  GBP: 1.27,
};

// ─── Deterministic pseudo-random (so re-runs match) ─────────────
let RNG_SEED = 42;
function rng() {
  RNG_SEED = (RNG_SEED * 1664525 + 1013904223) >>> 0;
  return RNG_SEED / 0xffffffff;
}
function seedReset(s = 42) { RNG_SEED = s; }

// Seasonal multiplier (Q4 spikes for product launches & holidays)
function seasonality(monthNum) {
  // Jan(1)..Dec(12). Apple's Q1 fiscal = Oct-Dec (calendar Q4), huge holiday boost
  const factors = [0.82, 0.78, 0.95, 0.88, 0.92, 0.98, 0.95, 0.96, 1.05, 1.10, 1.15, 1.40];
  return factors[monthNum - 1];
}

// Pretty rounded magnitude for an account leaf
// Returns USD millions (we'll scale to USD before storing)
function baseAmountForAccount(code) {
  // Revenue (in USD millions per month, average across entities)
  if (code === "4110") return 6_500;  // iPhone
  if (code === "4120") return 1_500;  // Mac
  if (code === "4130") return 1_000;  // iPad
  if (code === "4140") return 1_200;  // Wearables
  if (code === "4210") return 1_800;  // App Store
  if (code === "4220") return    600; // iCloud
  if (code === "4230") return    400; // Apple Music
  if (code === "4240") return    700; // AppleCare
  if (code === "4250") return    300; // Advertising

  // COGS — ~62% of products revenue, ~30% of services
  if (code === "5110") return -3_900;
  if (code === "5120") return -1_050;
  if (code === "5130") return  -650;
  if (code === "5140") return  -800;
  if (code === "5200") return -1_100;

  // OpEx
  if (code === "6110") return  -650; if (code === "6120") return  -380;
  if (code === "6130") return  -120; if (code === "6140") return   -50;
  if (code === "6210") return  -450; if (code === "6220") return  -250;
  if (code === "6230") return  -350; if (code === "6240") return  -120;
  if (code === "6250") return  -180; if (code === "6260") return   -65;

  // Below-line
  if (code === "7100") return    240;
  if (code === "7200") return   -270;
  if (code === "7300") return    -25;
  if (code === "7900") return -1_350;

  // BS — broadly Apple-scaled (USD M)
  if (code === "1110") return  29_000; if (code === "1120") return  35_000;
  if (code === "1130") return  29_500; if (code === "1140") return   7_300;
  if (code === "1150") return  31_500; if (code === "1190") return  14_800;
  if (code === "1210") return 105_000; if (code === "1220") return  43_700;
  if (code === "1290") return  64_700;

  if (code === "2110") return  62_600; if (code === "2120") return  58_900;
  if (code === "2130") return   8_300; if (code === "2140") return   6_000;
  if (code === "2150") return   9_800; if (code === "2210") return  95_300;
  if (code === "2220") return   8_000; if (code === "2290") return  45_200;

  if (code === "3100") return  73_800; if (code === "3200") return  -1_700;
  if (code === "3300") return    -700;

  // Statistical
  if (code === "9100") return    164;  // ~164K headcount

  return 0;
}

// Apportion an amount across entities by entity weight
const ENTITY_WEIGHT = {
  AAPL_US: 0.42, AAPL_EU: 0.24, AAPL_CN: 0.20, AAPL_APAC: 0.14,
};

// Variance per scenario (Budget = -3%..+3% of Actual, Forecast = +2%..+5%)
function scenarioMultiplier(scenarioCode) {
  if (scenarioCode === "Actual")   return 1.0;
  if (scenarioCode === "Budget")   return 0.94 + rng() * 0.06; // slightly under
  if (scenarioCode === "Forecast") return 1.01 + rng() * 0.05;
  return 1.0;
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log("═══ Seeding Apple Inc tenant ═══");
  const t0 = Date.now();

  // ─── 1. Tenant + admin ───────────────────────────
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {
      isActive: true, name: "Apple Inc", slug: "apple-inc",
      defaultScenarioCode: "Actual",
      defaultCompareScenarioCode: "Budget",
      defaultEntityCode: "AAPL_GROUP",
      defaultPeriodCode: "2026M04",
    },
    create: {
      id: TENANT_ID, name: "Apple Inc", slug: "apple-inc", isActive: true,
      defaultScenarioCode: "Actual",
      defaultCompareScenarioCode: "Budget",
      defaultEntityCode: "AAPL_GROUP",
      defaultPeriodCode: "2026M04",
    },
  });
  console.log("✅ tenant: Apple Inc (slug=apple-inc)");

  const existing = await prisma.user.findFirst({
    where: { email: "admin@apple.com", tenantId: TENANT_ID },
  });
  let admin;
  if (existing) {
    admin = await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: ADMIN_HASH, role: "ADMIN", isActive: true, name: "Apple Admin" },
    });
  } else {
    admin = await prisma.user.create({
      data: {
        tenantId: TENANT_ID, email: "admin@apple.com", name: "Apple Admin",
        passwordHash: ADMIN_HASH, role: "ADMIN", isActive: true,
      },
    });
  }
  console.log("✅ admin: admin@apple.com / admin123");

  // ─── 2. Feature flags ────────────────────────────
  const flags = [
    { featureKey: "multi_entity_enabled",        isEnabled: true  },
    { featureKey: "multi_currency_enabled",      isEnabled: true  },
    { featureKey: "intercompany_enabled",        isEnabled: true  },
    { featureKey: "alternate_hierarchy_enabled", isEnabled: true  },
    { featureKey: "department_enabled",          isEnabled: true  },
    { featureKey: "cost_center_enabled",         isEnabled: false },
    { featureKey: "project_enabled",             isEnabled: false },
  ];
  for (const f of flags) {
    await prisma.tenantFeature.upsert({
      where: { tenantId_featureKey: { tenantId: TENANT_ID, featureKey: f.featureKey } },
      update: { isEnabled: f.isEnabled },
      create: {
        tenantId: TENANT_ID, featureKey: f.featureKey, isEnabled: f.isEnabled,
        enabledAt: f.isEnabled ? new Date() : null, enabledBy: f.isEnabled ? admin.id : null,
      },
    });
  }
  console.log("✅ feature flags (multi-currency + intercompany ON)");

  // ─── 3. Dimensions (5 always-on + ICP + Origin + UD1/UD2) ──
  const dimAccount  = await upsertDim("ACCOUNT",  "account",  "Account");
  const dimEntity   = await upsertDim("ENTITY",   "entity",   "Entity");
  const dimScenario = await upsertDim("SCENARIO", "scenario", "Scenario");
  const dimTime     = await upsertDim("TIME",     "time",     "Time Period");
  const dimCurrency = await upsertDim("CURRENCY", "currency", "Currency");
  const dimIcp      = await upsertDim("ICP",      "icp",      "Intercompany Partner");
  const dimOrigin   = await upsertDim("ORIGIN",   "origin",   "Origin");
  const dimUd1      = await upsertDim("UD1",      "product",  "Product Line", true);
  const dimUd2      = await upsertDim("UD2",      "channel",  "Sales Channel", true);
  console.log("✅ 9 dimensions (5 core + ICP + Origin + Product + Channel)");

  const hAccount  = await getOrCreateHierarchy(dimAccount.id);
  const hEntity   = await getOrCreateHierarchy(dimEntity.id);
  const hTime     = await getOrCreateHierarchy(dimTime.id);

  // ─── 4. Currencies (8: 6 real + Local + Reporting) ──
  const currencyMembers = {};
  for (const c of CURRENCIES) {
    currencyMembers[c.code] = await upsertMember(dimCurrency.id, c.code, c.name, {
      iso_code: c.code, is_base: c.is_base, symbol: c.symbol,
    });
  }
  console.log(`✅ ${CURRENCIES.length} currencies (base=USD)`);

  // ─── 5. Origins (seeded set used by API + engines) ──
  const ORIGINS = [
    { code: "Import",      name: "Import"      },
    { code: "Form",        name: "Form Entry"  },
    { code: "Calc",        name: "Calculation" },
    { code: "AI",          name: "AI Suggested"},
    { code: "Consol",      name: "Consolidation"},
    { code: "Translation", name: "FX Translation"},
    { code: "Elim",        name: "Elimination" },
    { code: "Forecast",    name: "Forecast Engine"},
  ];
  const originMembers = {};
  for (const o of ORIGINS) {
    originMembers[o.code] = await upsertMember(dimOrigin.id, o.code, o.name, { category: "origin" });
  }
  console.log(`✅ ${ORIGINS.length} origins seeded`);

  // ─── 6. Scenarios ────────────────────────────────
  const scenarioMembers = {};
  for (const s of SCENARIOS) {
    scenarioMembers[s.code] = await upsertMember(dimScenario.id, s.code, s.name, {
      scenario_type: s.scenario_type, is_frozen: false, version: "v1",
    });
  }
  console.log(`✅ ${SCENARIOS.length} scenarios`);

  // ─── 7. Entities with hierarchy ──────────────────
  const entityMembers = {};
  for (const e of ENTITIES) {
    entityMembers[e.code] = await upsertMember(dimEntity.id, e.code, e.name, {
      base_currency: e.ccy, consolidation_method: "FULL",
      ownership_pct: 100, icp_enabled: true, country: e.country,
    });
  }
  for (const e of ENTITIES) {
    if (e.parent) {
      await addEdge(hEntity.id, entityMembers[e.parent].id, entityMembers[e.code].id);
    }
  }
  console.log(`✅ ${ENTITIES.length} entities + ${ENTITIES.filter(e=>e.parent).length} edges`);

  // ─── 8. ICP partners (mirror of subs except None) ─
  const icpMembers = {};
  icpMembers["None"] = await upsertMember(dimIcp.id, "None", "No Intercompany Partner", { category: "icp_default" });
  for (const e of ENTITIES) {
    if (!e.parent) continue;  // skip group
    icpMembers[`ICP_${e.code}`] = await upsertMember(dimIcp.id, `ICP_${e.code}`, `ICP: ${e.name}`, {
      category: "icp", mirrors_entity: e.code,
    });
  }
  console.log(`✅ ${Object.keys(icpMembers).length} ICP members (incl None)`);

  // ─── 9. Time periods (24 months Jan2025–Dec2026) ─
  let timeCount = 0, edgeCount = 0;
  const timeMembers = {};
  for (const fy of [2025, 2026]) {
    const built = buildCalendarFy(fy);
    const yearMember = await upsertMember(dimTime.id, built.year.code, built.year.name, built.year.properties);
    timeMembers[built.year.code] = yearMember; timeCount++;
    for (const q of built.quarters) {
      const qMember = await upsertMember(dimTime.id, q.code, q.name, q.properties);
      timeMembers[q.code] = qMember;
      await addEdge(hTime.id, yearMember.id, qMember.id); edgeCount++; timeCount++;
    }
    for (const m of built.months) {
      const mMember = await upsertMember(dimTime.id, m.code, m.name, m.properties);
      timeMembers[m.code] = mMember;
      const qMember = timeMembers[m.parentCode];
      if (qMember) { await addEdge(hTime.id, qMember.id, mMember.id); edgeCount++; }
      timeCount++;
    }
  }
  console.log(`✅ ${timeCount} time members + ${edgeCount} edges (FY25-FY26 cal)`);

  // ─── 10. Product + Channel UDs ───────────────────
  const productMembers = {};
  for (const p of PRODUCTS) {
    productMembers[p.code] = await upsertMember(dimUd1.id, p.code, p.name, { category: "product" });
  }
  const channelMembers = {};
  for (const c of CHANNELS) {
    channelMembers[c.code] = await upsertMember(dimUd2.id, c.code, c.name, { category: "channel" });
  }
  console.log(`✅ ${PRODUCTS.length} products + ${CHANNELS.length} channels`);

  // ─── 11. Account members + hierarchy ─────────────
  const accountMembers = {};
  for (const a of ACCOUNTS) {
    accountMembers[a.code] = await upsertMember(dimAccount.id, a.code, a.name, {
      account_type: a.account_type,
      time_balance: a.account_type === "ASSET" || a.account_type === "LIABILITY" || a.account_type === "EQUITY" ? "LAST" : "FLOW",
      switch_sign: false, storage_type: "STORED",
      calculation_type: a.leaf ? "INPUT" : "ROLLUP",
      variance_type: a.account_type === "EXPENSE" ? "EXPENSE" : "NON_EXPENSE",
      currency_behavior: a.account_type === "STATISTICAL" ? "NONE" : "TRANSACTIONAL",
      allow_input: !!a.leaf, is_consolidated: true,
    });
  }
  for (const a of ACCOUNTS) {
    if (a.parent) {
      await addEdge(hAccount.id, accountMembers[a.parent].id, accountMembers[a.code].id);
    }
  }
  console.log(`✅ ${ACCOUNTS.length} accounts + ${ACCOUNTS.filter(a=>a.parent).length} edges`);

  // ─── 12. EntityOwnership edges (100% subs) ───────
  for (const e of ENTITIES) {
    if (!e.parent) continue;
    await prisma.entityOwnership.upsert({
      where: {
        tenantId_parentEntityId_childEntityId: {
          tenantId: TENANT_ID,
          parentEntityId: entityMembers[e.parent].id,
          childEntityId: entityMembers[e.code].id,
        }
      },
      update: { pctOwned: 100, method: "FULL", notes: "Wholly-owned subsidiary" },
      create: {
        tenantId: TENANT_ID,
        parentEntityId: entityMembers[e.parent].id,
        childEntityId: entityMembers[e.code].id,
        pctOwned: 100, method: "FULL", notes: "Wholly-owned subsidiary",
        createdBy: admin.id,
      },
    });
  }
  console.log(`✅ ${ENTITIES.filter(e=>e.parent).length} ownership edges (100% FULL)`);

  // ─── 13. FX rates (every (ccy, month) pair) ──────
  await prisma.fxRate.deleteMany({ where: { tenantId: TENANT_ID } });
  const monthCodes = Object.keys(timeMembers).filter(k => /^\d{4}M\d{2}$/.test(k));
  let fxCount = 0;
  // Volatility per ccy (annualized stdev approximation)
  const VOL = { EUR: 0.06, CNY: 0.04, JPY: 0.08, INR: 0.05, GBP: 0.07 };
  seedReset(101);
  for (const ccy of ["EUR", "CNY", "JPY", "INR", "GBP"]) {
    let r = FX_BASE[ccy];
    for (const periodCode of monthCodes) {
      const drift = (rng() - 0.5) * VOL[ccy] * 0.5;
      r = r * (1 + drift);
      // CLOSING and AVERAGE rates (Closing = month-end, Average = month avg)
      for (const rateType of ["CLOSING", "AVERAGE"]) {
        await prisma.fxRate.create({
          data: {
            tenantId: TENANT_ID, fromCcy: ccy, toCcy: "USD",
            periodCode, rateType,
            rate: rateType === "CLOSING" ? r : r * (1 + (rng()-0.5) * 0.005),
            source: "seed:apple", uploadedBy: admin.id,
          },
        });
        fxCount++;
      }
    }
  }
  console.log(`✅ ${fxCount} FX rates (5 ccy × ${monthCodes.length} mo × 2 rateTypes)`);

  // ─── 14. Fact rows ─────────────────────────────
  // We seed leaf accounts only (rollups derive). One fact per
  //   (scenario × entitySub × time × accountLeaf × originActual)
  // We skip the consolidated AAPL_GROUP entity — consol engine produces those.
  // ICP = "None" by default; for Vendor Non-Trade Receivables we set ICP to mirror sister.
  console.log("");
  console.log("📊 Generating fact rows... (this is the big one)");
  await prisma.factRow.deleteMany({ where: { tenantId: TENANT_ID } });

  const leafAccounts = ACCOUNTS.filter(a => a.leaf);
  const subs = ENTITIES.filter(e => e.parent);
  const baseCcyId = currencyMembers.USD.id;
  seedReset(7);

  const factBatch = [];
  let factTotal = 0;
  const BATCH_SIZE = 1000;

  async function flushBatch() {
    if (factBatch.length === 0) return;
    await prisma.factRow.createMany({ data: factBatch, skipDuplicates: true });
    factTotal += factBatch.length;
    if (factTotal % 5000 === 0 || factTotal > 30000) {
      console.log(`   ... ${factTotal.toLocaleString()} facts written`);
    }
    factBatch.length = 0;
  }

  for (const scn of SCENARIOS) {
    for (const sub of subs) {
      const entityWeight = ENTITY_WEIGHT[sub.code] || 0.1;
      const entityCcyId = currencyMembers[sub.ccy].id;
      for (const periodCode of monthCodes) {
        const monthNum = parseInt(periodCode.slice(5), 10);
        const seasonFx = seasonality(monthNum);
        for (const acct of leafAccounts) {
          // Skip Forecast for historical months (Jan-Apr 2026 onwards is forecast)
          const isHistorical = periodCode < "2026M05";
          if (scn.code === "Forecast" && isHistorical) continue;
          // Skip Actual for future months (after 2026M04)
          if (scn.code === "Actual" && !isHistorical) continue;

          const baseUSD = baseAmountForAccount(acct.code);
          if (baseUSD === 0) continue;

          const scnMult = scenarioMultiplier(scn.code);
          const noise = 0.97 + rng() * 0.06; // ±3% noise
          const isPnl = ["REVENUE", "EXPENSE"].includes(acct.account_type);
          const periodFactor = isPnl ? seasonFx : 1.0;  // BS items don't seasonalize
          const valueUSD = baseUSD * entityWeight * periodFactor * scnMult * noise;
          // For Stat (headcount), entity-scale then no FX
          const isStat = acct.account_type === "STATISTICAL";

          // Local = native ccy, Txn = same as Local in seed, Reporting = USD
          const localValue = isStat
            ? Math.round(valueUSD * 1000)  // headcount thousand
            : valueUSD / (FX_BASE[sub.ccy] || 1);  // back into local ccy
          const reportingValue = valueUSD;
          const txnValue = localValue;

          factBatch.push({
            tenantId: TENANT_ID,
            scenarioId: scenarioMembers[scn.code].id,
            timeId: timeMembers[periodCode].id,
            entityId: entityMembers[sub.code].id,
            accountId: accountMembers[acct.code].id,
            currencyId: isStat ? baseCcyId : entityCcyId,
            icpId: icpMembers["None"].id,
            originId: scn.code === "Forecast" ? originMembers["Forecast"].id : originMembers["Import"].id,
            valueTxn: txnValue.toFixed(4),
            valueLocal: localValue.toFixed(4),
            valueReporting: reportingValue.toFixed(4),
            postedBy: admin.id,
          });

          if (factBatch.length >= BATCH_SIZE) await flushBatch();
        }
      }
    }
  }
  await flushBatch();
  console.log(`✅ ${factTotal.toLocaleString()} facts inserted`);

  // ─── 15. Sample DataForm ───────────────────────
  await prisma.dataForm.upsert({
    where: { tenantId_code: { tenantId: TENANT_ID, code: "pl_input" } },
    update: {
      name: "Monthly P&L Input",
      description: "Account on rows × Time on columns. Edit current-period actuals.",
      rowSelection: { kind: "dsl", expression: "Descendants(\"4000\") + Descendants(\"5000\") + Descendants(\"6000\")" },
      colSelection: { kind: "dsl", expression: "Children(\"2026Q2\")" },
    },
    create: {
      tenantId: TENANT_ID, code: "pl_input",
      name: "Monthly P&L Input",
      description: "Account on rows × Time on columns. Edit current-period actuals.",
      layoutType: "STANDARD",
      rowDimKind: "ACCOUNT",
      rowSelection: { kind: "dsl", expression: "Descendants(\"4000\") + Descendants(\"5000\") + Descendants(\"6000\")" },
      colDimKind: "TIME",
      colSelection: { kind: "dsl", expression: "Children(\"2026Q2\")" },
      scenarioIds: [scenarioMembers["Actual"].id],
      isDefault: true, isActive: true, createdBy: admin.id,
    },
  });
  await prisma.dataForm.upsert({
    where: { tenantId_code: { tenantId: TENANT_ID, code: "variance_review" } },
    update: {
      name: "Variance Review — Actual vs Budget",
      layoutType: "VARIANCE",
      rowSelection: { kind: "dsl", expression: "Descendants(\"4000\")" },
      colSelection: { kind: "dsl", expression: "Children(\"FY2026\")" },
      scenarioIds: [scenarioMembers["Actual"].id, scenarioMembers["Budget"].id],
    },
    create: {
      tenantId: TENANT_ID, code: "variance_review",
      name: "Variance Review — Actual vs Budget",
      layoutType: "VARIANCE",
      rowDimKind: "ACCOUNT",
      rowSelection: { kind: "dsl", expression: "Descendants(\"4000\")" },
      colDimKind: "TIME",
      colSelection: { kind: "dsl", expression: "Children(\"FY2026\")" },
      scenarioIds: [scenarioMembers["Actual"].id, scenarioMembers["Budget"].id],
      isDefault: false, isActive: true, createdBy: admin.id,
    },
  });
  console.log("✅ 2 data forms (P&L Input, Variance Review)");

  // ─── 16. Sample MappingRules (Tally → COA) ─────
  const MAPS = [
    { source: "Phone Sales",     target: "4110" },
    { source: "MacBook Pro",     target: "4120" },
    { source: "MacBook Air",     target: "4120" },
    { source: "iPad Pro Sales",  target: "4130" },
    { source: "Apple Watch",     target: "4140" },
    { source: "AirPods",         target: "4140" },
    { source: "App Store Comm",  target: "4210" },
    { source: "iCloud Subs",     target: "4220" },
    { source: "Music Subs",      target: "4230" },
    { source: "AppleCare+",      target: "4240" },
    { source: "Engineer Salary", target: "6110" },
    { source: "RSU Vest R&D",    target: "6120" },
    { source: "Ad Spend Google", target: "6230" },
    { source: "Ad Spend Meta",   target: "6230" },
    { source: "Hotel & Flight",  target: "6260" },
  ];
  let mapCount = 0;
  for (const m of MAPS) {
    await prisma.mappingRule.upsert({
      where: {
        mapping_unique: {
          tenantId: TENANT_ID, kind: "ACCOUNT", sourceSystem: "tally",
          sourceKey: m.source, targetMemberId: accountMembers[m.target].id,
        }
      },
      update: { hitCount: { increment: 1 } },
      create: {
        tenantId: TENANT_ID, kind: "ACCOUNT", sourceSystem: "tally",
        sourceKey: m.source, targetMemberId: accountMembers[m.target].id,
        confidence: 95, authoredBy: "ai", approvedBy: admin.id, approvedAt: new Date(),
        hitCount: 3 + Math.floor(rng() * 12), isActive: true,
      },
    });
    mapCount++;
  }
  console.log(`✅ ${mapCount} mapping rules (Tally → COA)`);

  // ─── 17. Sample CalcRule ──────────────────────
  await prisma.calcRule.upsert({
    where: { tenantId_code: { tenantId: TENANT_ID, code: "accrue_bonus_15pct" } },
    update: {},
    create: {
      tenantId: TENANT_ID, code: "accrue_bonus_15pct",
      name: "Accrue 15% Bonus on R&D Salaries",
      description: "Apply 15% bonus accrual to R&D Salaries, posting to Accrued Expenses.",
      kind: "PERCENTAGE",
      spec: {
        filters: { accountCode: "6110" /* R&D Salaries */ },
        formula: { kind: "percentage", rate: 0.15 },
        output: { accountCode: "2120" /* Accrued Expenses */, origin: "Calc", overwriteExisting: false },
      },
      status: "ACTIVE", source: "template",
      createdBy: admin.id,
    },
  });
  console.log("✅ 1 CalcRule (15% bonus accrual)");

  // ─── 18. Sample AutomationJob ────────────────
  await prisma.automationJob.upsert({
    where: { tenantId_code: { tenantId: TENANT_ID, code: "monthly_consol" } },
    update: {},
    create: {
      tenantId: TENANT_ID, code: "monthly_consol",
      name: "Monthly Consolidation (T+3)",
      description: "Auto-run consolidation 3 business days after month close for the open period.",
      kind: "RUN_CONSOLIDATION",
      params: { scenarioCode: "Actual", entityCode: "AAPL_GROUP", periodScope: "current-open" },
      schedule: "0 6 4 * *",  // 4th of every month at 06:00 UTC
      timezone: "America/Los_Angeles",
      enabled: true,
      createdBy: admin.id,
    },
  });
  console.log("✅ 1 AutomationJob (monthly_consol)");

  // ─── 19. Sample CloseRun for 2026M05 ─────────
  const closeRun = await prisma.closeRun.upsert({
    where: { tenantId_periodCode: { tenantId: TENANT_ID, periodCode: "2026M05" } },
    update: { status: "OPEN" },
    create: {
      tenantId: TENANT_ID, periodCode: "2026M05",
      status: "OPEN", createdBy: admin.id,
      notes: "May 2026 close — kickoff Monday following month-end.",
    },
  });
  await prisma.closeTask.deleteMany({ where: { closeRunId: closeRun.id } });

  const TASKS = [
    { d: -2, cat: "RECONCILIATION", title: "Bank reconciliation — all entities",     screen: "/process/reconciliation" },
    { d: -2, cat: "RECONCILIATION", title: "Subledger tie-out (AR, AP, Inventory)",   screen: "/process/reconciliation" },
    { d: -1, cat: "JOURNAL_ENTRIES", title: "Post depreciation & amortization JEs",   screen: "/data/input" },
    { d: -1, cat: "JOURNAL_ENTRIES", title: "Accrue 15% bonus on R&D salaries",       screen: "/calc/rules" },
    { d:  0, cat: "RECONCILIATION", title: "Intercompany matching (US ↔ EU ↔ CN)",     screen: "/process/elimination" },
    { d:  1, cat: "JOURNAL_ENTRIES", title: "Post FX revaluation entries",            screen: "/process/translation" },
    { d:  1, cat: "REVIEW",          title: "Upload monthly FX rates",                screen: "/data/load" },
    { d:  2, cat: "REVIEW",          title: "Run consolidation engine",               screen: "/process/consolidation" },
    { d:  2, cat: "REVIEW",          title: "Review Group P&L variance vs Budget",    screen: "/reports/income-statement" },
    { d:  3, cat: "REVIEW",          title: "Generate exec dashboard story",          screen: "/explore" },
    { d:  4, cat: "REVIEW",          title: "Sign-off CFO review meeting",            screen: "/close" },
    { d:  5, cat: "LOCK",            title: "Lock period & open next month",          screen: "/close" },
  ];
  for (let i = 0; i < TASKS.length; i++) {
    const t = TASKS[i];
    await prisma.closeTask.create({
      data: {
        tenantId: TENANT_ID, closeRunId: closeRun.id,
        dayOffset: t.d, category: t.cat, title: t.title,
        description: null, status: "PENDING",
        screenTarget: t.screen, sortOrder: i,
      },
    });
  }
  console.log(`✅ 1 CloseRun (2026M05) + ${TASKS.length} tasks`);

  // ─── 20. Done — print verification snapshot ─────
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("");
  console.log("═══════════════════════════════════════════════════");
  console.log("  ✅ Apple Inc tenant seeded successfully");
  console.log("═══════════════════════════════════════════════════");

  const counts = await Promise.all([
    prisma.dimension.count({ where: { tenantId: TENANT_ID } }),
    prisma.dimensionMember.count({ where: { tenantId: TENANT_ID } }),
    prisma.hierarchyEdge.count({ where: { tenantId: TENANT_ID } }),
    prisma.factRow.count({ where: { tenantId: TENANT_ID } }),
    prisma.fxRate.count({ where: { tenantId: TENANT_ID } }),
    prisma.dataForm.count({ where: { tenantId: TENANT_ID } }),
    prisma.mappingRule.count({ where: { tenantId: TENANT_ID } }),
    prisma.calcRule.count({ where: { tenantId: TENANT_ID } }),
    prisma.automationJob.count({ where: { tenantId: TENANT_ID } }),
    prisma.closeRun.count({ where: { tenantId: TENANT_ID } }),
    prisma.closeTask.count({ where: { tenantId: TENANT_ID } }),
    prisma.entityOwnership.count({ where: { tenantId: TENANT_ID } }),
  ]);
  const [dimC, memC, edgC, factC, fxC, formC, mapC, calcC, jobC, closC, taskC, ownC] = counts;
  console.log(`  Dimensions:       ${dimC}`);
  console.log(`  Members:          ${memC}`);
  console.log(`  Hierarchy edges:  ${edgC}`);
  console.log(`  Fact rows:        ${factC.toLocaleString()}`);
  console.log(`  FX rates:         ${fxC}`);
  console.log(`  Data forms:       ${formC}`);
  console.log(`  Mapping rules:    ${mapC}`);
  console.log(`  CalcRules:        ${calcC}`);
  console.log(`  Automation jobs:  ${jobC}`);
  console.log(`  Close runs:       ${closC}`);
  console.log(`  Close tasks:      ${taskC}`);
  console.log(`  Ownership edges:  ${ownC}`);
  console.log("");
  console.log(`  Login:  admin@apple.com / admin123`);
  console.log(`  Slug:   apple-inc`);
  console.log(`  Time:   ${elapsed}s`);
  console.log("═══════════════════════════════════════════════════");
}

main()
  .catch((e) => { console.error("❌ seed failed:", e); process.exit(1); })
  .finally(async () => prisma.$disconnect());
