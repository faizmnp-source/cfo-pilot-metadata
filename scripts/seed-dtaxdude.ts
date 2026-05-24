// scripts/seed-dtaxdude.ts
//
// Seeds the Dtaxdude test tenant per the BRD:
//   - 5 entities (GRP parent + 4 leaves: US_HQ/UK_OPS/IN_OPS/AE_OPS)
//   - ~60 accounts (Revenue, COGS, Opex, Other I/E, Tax, BS, IC) properly tagged
//   - 4 currencies (USD base + GBP, INR, AED) + Local + Reporting placeholders
//   - FY2026 time hierarchy (year → quarters → months)
//   - 2 scenarios (ACTUAL, BUDGET)
//   - 2 UDs (Department, CostCenter) + members
//   - FX rates: 3 pairs × 12 months × 2 rate types = 72 rows
//   - 4 sample Data Forms (Revenue Input, Opex Input, BS Input, IC Recon)
//   - ~14k fact rows for FY2026 at leaf entities (realistic seasonal patterns)
//
// Usage from cfo-pilot-metadata:
//   npx tsx scripts/seed-dtaxdude.ts                    # default tenant 'dtaxdude'
//   npx tsx scripts/seed-dtaxdude.ts --tenant=<id>      # specific tenant
//   npx tsx scripts/seed-dtaxdude.ts --wipe             # wipe data first (preserves Dimension defs)
//   npx tsx scripts/seed-dtaxdude.ts --skip-facts       # skip the heavy fact-generation
//
// Idempotent — re-running upserts everything.

import { PrismaClient } from "@prisma/client";
import { ensureTenant, ensureUser } from "../src/lib/ensure-dimension";

const prisma = new PrismaClient();

// ─── CLI args ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const TENANT_ID = args.find(a => a.startsWith("--tenant="))?.split("=")[1] ?? "dtaxdude";
const WIPE      = args.includes("--wipe");
const SKIP_FACTS = args.includes("--skip-facts");

// User stamp for createdBy/updatedBy on every row
const SEED_USER_ID = "seed-script";

// ─── Master config ────────────────────────────────────────────────

const COMPANY_NAME = "Dtaxdude Group";
const BASE_CURRENCY = "USD";   // tenant reporting currency

const CURRENCIES = [
  { code: "USD", name: "US Dollar",       iso: "USD", isBase: true,  isLocal: false, isReporting: false },
  { code: "GBP", name: "British Pound",   iso: "GBP", isBase: false, isLocal: false, isReporting: false },
  { code: "INR", name: "Indian Rupee",    iso: "INR", isBase: false, isLocal: false, isReporting: false },
  { code: "AED", name: "UAE Dirham",      iso: "AED", isBase: false, isLocal: false, isReporting: false },
  { code: "Local",     name: "Local",     iso: "",    isBase: false, isLocal: true,  isReporting: false },
  { code: "Reporting", name: "Reporting", iso: "",    isBase: false, isLocal: false, isReporting: true  },
];

const ENTITIES = [
  { code: "GRP",    name: "Dtaxdude Group",   parent: null,   baseCcy: "USD", country: "USA",         icpEnabled: false },
  { code: "US_HQ",  name: "Dtaxdude LLC",     parent: "GRP",  baseCcy: "USD", country: "USA",         icpEnabled: true  },
  { code: "UK_OPS", name: "Dtaxdude UK Ltd",  parent: "GRP",  baseCcy: "GBP", country: "United Kingdom", icpEnabled: true },
  { code: "IN_OPS", name: "Dtaxdude India Pvt",parent: "GRP", baseCcy: "INR", country: "India",       icpEnabled: true  },
  { code: "AE_OPS", name: "Dtaxdude FZ-LLC",  parent: "GRP",  baseCcy: "AED", country: "United Arab Emirates", icpEnabled: true },
];

// ─── Chart of Accounts ───────────────────────────────────────────
// Mirrors the BRD §3. Every leaf has account_type + time_balance.
// Parents have only memberCode/name + children below them (no facts).

type AcctSpec = {
  code: string; name: string;
  type?: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  timeBalance?: "FLOW" | "LAST";
  isIcp?: boolean;
  cfCategory?: "OPERATING" | "INVESTING" | "FINANCING";
  parent?: string | null;
};

const ACCOUNTS: AcctSpec[] = [
  // === Balance Sheet ===
  { code: "1000", name: "Current Assets", parent: null },
  { code: "1100", name: "Cash & Bank",                parent: "1000", type: "ASSET", timeBalance: "LAST", cfCategory: "OPERATING" },
  { code: "1200", name: "Accounts Receivable",        parent: "1000", type: "ASSET", timeBalance: "LAST", cfCategory: "OPERATING" },
  { code: "1250", name: "IC Receivable",              parent: "1000", type: "ASSET", timeBalance: "LAST", isIcp: true,  cfCategory: "OPERATING" },
  { code: "1300", name: "Prepaid Expenses",           parent: "1000", type: "ASSET", timeBalance: "LAST", cfCategory: "OPERATING" },
  { code: "1400", name: "Other Current Assets",       parent: "1000", type: "ASSET", timeBalance: "LAST", cfCategory: "OPERATING" },

  { code: "1500", name: "Fixed Assets", parent: null },
  { code: "1510", name: "Office Equipment",           parent: "1500", type: "ASSET", timeBalance: "LAST", cfCategory: "INVESTING" },
  { code: "1520", name: "Computers",                  parent: "1500", type: "ASSET", timeBalance: "LAST", cfCategory: "INVESTING" },
  { code: "1590", name: "Accumulated Depreciation",   parent: "1500", type: "ASSET", timeBalance: "LAST", cfCategory: "INVESTING" },

  { code: "2000", name: "Current Liabilities", parent: null },
  { code: "2100", name: "Accounts Payable",           parent: "2000", type: "LIABILITY", timeBalance: "LAST", cfCategory: "OPERATING" },
  { code: "2150", name: "IC Payable",                 parent: "2000", type: "LIABILITY", timeBalance: "LAST", isIcp: true, cfCategory: "OPERATING" },
  { code: "2200", name: "Accrued Liabilities",        parent: "2000", type: "LIABILITY", timeBalance: "LAST", cfCategory: "OPERATING" },
  { code: "2300", name: "Tax Payable",                parent: "2000", type: "LIABILITY", timeBalance: "LAST", cfCategory: "OPERATING" },
  { code: "2400", name: "Deferred Revenue",           parent: "2000", type: "LIABILITY", timeBalance: "LAST", cfCategory: "OPERATING" },

  { code: "2500", name: "Long-term Liabilities", parent: null },
  { code: "2510", name: "Loans Payable",              parent: "2500", type: "LIABILITY", timeBalance: "LAST", cfCategory: "FINANCING" },

  { code: "3000", name: "Equity", parent: null },
  { code: "3100", name: "Share Capital",              parent: "3000", type: "EQUITY", timeBalance: "LAST", cfCategory: "FINANCING" },
  { code: "3200", name: "Retained Earnings",          parent: "3000", type: "EQUITY", timeBalance: "LAST", cfCategory: "FINANCING" },
  { code: "3300", name: "Current Year P/L",           parent: "3000", type: "EQUITY", timeBalance: "LAST", cfCategory: "FINANCING" },

  // === Income Statement ===
  { code: "4000", name: "Revenue", parent: null },
  { code: "4100", name: "Tax Returns Revenue",        parent: "4000", type: "REVENUE", timeBalance: "FLOW", cfCategory: "OPERATING" },
  { code: "4200", name: "Audit Support Revenue",      parent: "4000", type: "REVENUE", timeBalance: "FLOW", cfCategory: "OPERATING" },
  { code: "4300", name: "Transfer Pricing Revenue",   parent: "4000", type: "REVENUE", timeBalance: "FLOW", cfCategory: "OPERATING" },
  { code: "4400", name: "Other Advisory Revenue",     parent: "4000", type: "REVENUE", timeBalance: "FLOW", cfCategory: "OPERATING" },
  { code: "4500", name: "IC Service Revenue",         parent: "4000", type: "REVENUE", timeBalance: "FLOW", isIcp: true, cfCategory: "OPERATING" },

  { code: "5000", name: "COGS", parent: null },
  { code: "5100", name: "Direct Labour",              parent: "5000", type: "EXPENSE", timeBalance: "FLOW", cfCategory: "OPERATING" },
  { code: "5200", name: "Subcontracted Specialists",  parent: "5000", type: "EXPENSE", timeBalance: "FLOW", cfCategory: "OPERATING" },
  { code: "5500", name: "IC Service Charges",         parent: "5000", type: "EXPENSE", timeBalance: "FLOW", isIcp: true, cfCategory: "OPERATING" },

  { code: "6000", name: "Operating Expenses", parent: null },
  { code: "6100", name: "Salaries",                   parent: "6000", type: "EXPENSE", timeBalance: "FLOW", cfCategory: "OPERATING" },
  { code: "6200", name: "Rent",                       parent: "6000", type: "EXPENSE", timeBalance: "FLOW", cfCategory: "OPERATING" },
  { code: "6300", name: "Utilities",                  parent: "6000", type: "EXPENSE", timeBalance: "FLOW", cfCategory: "OPERATING" },
  { code: "6400", name: "Tech & SaaS",                parent: "6000", type: "EXPENSE", timeBalance: "FLOW", cfCategory: "OPERATING" },
  { code: "6500", name: "Marketing",                  parent: "6000", type: "EXPENSE", timeBalance: "FLOW", cfCategory: "OPERATING" },
  { code: "6600", name: "Travel",                     parent: "6000", type: "EXPENSE", timeBalance: "FLOW", cfCategory: "OPERATING" },
  { code: "6700", name: "Professional Fees",          parent: "6000", type: "EXPENSE", timeBalance: "FLOW", cfCategory: "OPERATING" },
  { code: "6800", name: "Insurance",                  parent: "6000", type: "EXPENSE", timeBalance: "FLOW", cfCategory: "OPERATING" },
  { code: "6900", name: "Other Opex",                 parent: "6000", type: "EXPENSE", timeBalance: "FLOW", cfCategory: "OPERATING" },

  { code: "7000", name: "Other Income / Expense", parent: null },
  { code: "7100", name: "FX Gain/Loss",               parent: "7000", type: "EXPENSE", timeBalance: "FLOW", cfCategory: "OPERATING" },
  { code: "7200", name: "Interest Income",            parent: "7000", type: "REVENUE", timeBalance: "FLOW", cfCategory: "FINANCING" },
  { code: "7300", name: "Interest Expense",           parent: "7000", type: "EXPENSE", timeBalance: "FLOW", cfCategory: "FINANCING" },

  { code: "8000", name: "Tax", parent: null },
  { code: "8100", name: "Corporate Tax",              parent: "8000", type: "EXPENSE", timeBalance: "FLOW", cfCategory: "OPERATING" },
];

const SCENARIOS = [
  { code: "ACTUAL", name: "Actual",   type: "ACTUAL"   as const, isFrozen: false },
  { code: "BUDGET", name: "Budget",   type: "BUDGET"   as const, isFrozen: false },
];

const DEPARTMENTS = [
  { code: "TAX",  name: "Tax Returns" },
  { code: "AUD",  name: "Audit Support" },
  { code: "TP",   name: "Transfer Pricing" },
  { code: "ADV",  name: "Other Advisory" },
  { code: "ADMIN", name: "Administration" },
];
const COST_CENTERS = [
  { code: "CC100", name: "Partners" },
  { code: "CC200", name: "Managers" },
  { code: "CC300", name: "Staff" },
  { code: "CC400", name: "Support" },
];

// FX rates — month-end CLOSING + monthly AVERAGE for each currency vs USD.
// Numbers approximately realistic for FY2026.
const FX_BASE = {
  GBP: { closing: 1.27,  avg: 1.27  },  // 1 GBP = 1.27 USD
  INR: { closing: 0.012, avg: 0.012 },  // 1 INR = 0.012 USD
  AED: { closing: 0.272, avg: 0.272 },  // 1 AED = 0.272 USD (pegged)
};

const MONTHS = [
  "2026M01","2026M02","2026M03","2026M04","2026M05","2026M06",
  "2026M07","2026M08","2026M09","2026M10","2026M11","2026M12",
];

// ─── Helpers ────────────────────────────────────────────────────

async function ensureDim(kind: string, label: string, code: string) {
  const existing = await prisma.dimension.findFirst({ where: { tenantId: TENANT_ID, kind: kind as any } });
  if (existing) return existing;
  return prisma.dimension.create({
    data: { tenantId: TENANT_ID, kind: kind as any, code, label, isEnabled: true, isCustom: kind.startsWith("UD") },
  });
}

async function upsertMember(args: {
  dimensionId: string;
  code: string;
  name: string;
  properties?: Record<string, any>;
  sortOrder?: number;
}) {
  // Use the composite unique key (tenantId, dimensionId, memberCode) for a
  // race-free upsert. The findFirst-then-create pattern could double-create
  // members during a seed re-run if wipe didn't fully clear (e.g. leftover
  // members from a different dimension definition for the same kind).
  return prisma.dimensionMember.upsert({
    where: { tenantId_dimensionId_memberCode: { tenantId: TENANT_ID, dimensionId: args.dimensionId, memberCode: args.code } },
    update: { memberName: args.name, properties: (args.properties ?? {}) as any, sortOrder: args.sortOrder ?? 0, isActive: true, updatedBy: SEED_USER_ID },
    create: {
      tenantId: TENANT_ID, dimensionId: args.dimensionId,
      memberCode: args.code, memberName: args.name,
      properties: (args.properties ?? {}) as any,
      sortOrder: args.sortOrder ?? 0, isActive: true,
      createdBy: SEED_USER_ID, updatedBy: SEED_USER_ID,
    },
  });
}

async function ensureEdge(parentId: string, childId: string, hierarchyId: string) {
  const existing = await prisma.hierarchyEdge.findFirst({
    where: { tenantId: TENANT_ID, hierarchyId, parentMemberId: parentId, childMemberId: childId },
  });
  if (existing) return existing;
  return prisma.hierarchyEdge.create({
    data: {
      tenantId: TENANT_ID, hierarchyId,
      parentMemberId: parentId, childMemberId: childId,
      operator: "ADD",
    },
  });
}

async function ensureHierarchy(dimensionId: string): Promise<string> {
  const existing = await prisma.hierarchy.findFirst({
    where: { tenantId: TENANT_ID, dimensionId, code: "default" },
  });
  if (existing) return existing.id;
  const h = await prisma.hierarchy.create({
    data: { tenantId: TENANT_ID, dimensionId, code: "default", name: "Default", isPrimary: true },
  });
  return h.id;
}

// Deterministic-ish "random" so re-runs produce identical numbers
function seededRand(seed: number) {
  let state = seed;
  return () => { state = (state * 9301 + 49297) % 233280; return state / 233280; };
}

// ─── MAIN ───────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Dtaxdude seed ===`);
  console.log(`tenant: ${TENANT_ID}`);
  console.log(`wipe:   ${WIPE}`);
  console.log(`facts:  ${SKIP_FACTS ? "SKIP" : "load"}`);

  await ensureTenant(TENANT_ID);
  await ensureUser({
    id: SEED_USER_ID, tenantId: TENANT_ID,
    email: "seed@dtaxdude.demo", name: "Seed Script",
    role: "ADMIN", password: "seedSeed123",
  });

  // ── WIPE (optional) ──────────────────────────────────────────
  if (WIPE) {
    console.log(`\n[wipe] purging tenant data (Dimension defs preserved)…`);
    const t = TENANT_ID;
    await prisma.factRow.deleteMany({ where: { tenantId: t } });
    await prisma.loadBatch.deleteMany({ where: { tenantId: t } });
    await prisma.processRun.deleteMany({ where: { tenantId: t } });
    await prisma.dataForm.deleteMany({ where: { tenantId: t } });
    await prisma.fxRate.deleteMany({ where: { tenantId: t } });
    await prisma.hierarchyEdge.deleteMany({ where: { tenantId: t } });
    await prisma.hierarchy.deleteMany({ where: { tenantId: t } });
    await prisma.dimensionMember.deleteMany({ where: { tenantId: t } });
    console.log(`[wipe] done`);
  }

  // ── Dimensions ───────────────────────────────────────────────
  console.log(`\n[dims] ensuring 9 dims…`);
  const dAcct = await ensureDim("ACCOUNT",  "Account",  "account");
  const dEnt  = await ensureDim("ENTITY",   "Entity",   "entity");
  const dScn  = await ensureDim("SCENARIO", "Scenario", "scenario");
  const dTime = await ensureDim("TIME",     "Time",     "time");
  const dCcy  = await ensureDim("CURRENCY", "Currency", "currency");
  const dIcp  = await ensureDim("ICP",      "Intercompany Partner", "icp");
  const dOrg  = await ensureDim("ORIGIN",   "Origin",   "origin");
  const dUd1  = await ensureDim("UD1",      "Department", "department");
  const dUd2  = await ensureDim("UD2",      "Cost Center", "cost_center");

  // ── Currencies ───────────────────────────────────────────────
  console.log(`[ccy] seeding currencies…`);
  const ccyByCode = new Map<string, string>();
  for (const c of CURRENCIES) {
    const m = await upsertMember({
      dimensionId: dCcy.id, code: c.code, name: c.name,
      properties: {
        iso_code:     c.iso || undefined,
        is_base:      c.isBase,
        is_local:     c.isLocal,
        is_reporting: c.isReporting,
        is_system:    c.isLocal || c.isReporting,
      },
    });
    ccyByCode.set(c.code, m.id);
  }

  // ── Scenarios ───────────────────────────────────────────────
  console.log(`[scn] seeding scenarios…`);
  const scnByCode = new Map<string, string>();
  for (const s of SCENARIOS) {
    const m = await upsertMember({
      dimensionId: dScn.id, code: s.code, name: s.name,
      properties: { scenario_type: s.type, is_frozen: s.isFrozen, version: "v1" },
    });
    scnByCode.set(s.code, m.id);
  }

  // ── Time hierarchy (FY2026 → Q1..Q4 → M01..M12) ──────────────
  console.log(`[time] seeding FY2026 hierarchy…`);
  const timeHier = await ensureHierarchy(dTime.id);
  const fy = await upsertMember({
    dimensionId: dTime.id, code: "FY2026", name: "FY 2026",
    properties: { period_type: "YEAR", fiscal_year: 2026, start_date: "2026-01-01", end_date: "2026-12-31" },
  });
  const quarters = [
    { code: "2026Q1", months: ["2026M01","2026M02","2026M03"], qi: 1 },
    { code: "2026Q2", months: ["2026M04","2026M05","2026M06"], qi: 2 },
    { code: "2026Q3", months: ["2026M07","2026M08","2026M09"], qi: 3 },
    { code: "2026Q4", months: ["2026M10","2026M11","2026M12"], qi: 4 },
  ];
  const monthIdByCode = new Map<string, string>();
  for (const q of quarters) {
    const qm = await upsertMember({
      dimensionId: dTime.id, code: q.code, name: q.code,
      properties: { period_type: "QUARTER", fiscal_year: 2026, start_date: `2026-${String((q.qi-1)*3+1).padStart(2,"0")}-01`, end_date: `2026-${String(q.qi*3).padStart(2,"0")}-28`, quarter_index: q.qi },
    });
    await ensureEdge(fy.id, qm.id, timeHier);
    for (let i = 0; i < q.months.length; i++) {
      const mcode = q.months[i];
      const monthIndex = (q.qi - 1) * 3 + i;
      const mm = await upsertMember({
        dimensionId: dTime.id, code: mcode, name: mcode,
        properties: {
          period_type: "MONTH", fiscal_year: 2026,
          start_date: `2026-${String(monthIndex+1).padStart(2,"0")}-01`,
          end_date:   `2026-${String(monthIndex+1).padStart(2,"0")}-28`,
          month_index: monthIndex, quarter_index: q.qi,
        },
      });
      await ensureEdge(qm.id, mm.id, timeHier);
      monthIdByCode.set(mcode, mm.id);
    }
  }

  // ── Entities + hierarchy + ICP auto-derive ───────────────────
  console.log(`[ent] seeding entities…`);
  const entHier = await ensureHierarchy(dEnt.id);
  const entByCode = new Map<string, string>();
  for (const e of ENTITIES) {
    const m = await upsertMember({
      dimensionId: dEnt.id, code: e.code, name: e.name,
      properties: {
        base_currency: e.baseCcy,
        consolidation_method: "FULL",
        ownership_pct: 100,
        icp_enabled: e.icpEnabled,
        country: e.country,
      },
    });
    entByCode.set(e.code, m.id);
  }
  for (const e of ENTITIES) {
    if (!e.parent) continue;
    const p = entByCode.get(e.parent);
    const c = entByCode.get(e.code);
    if (p && c) await ensureEdge(p, c, entHier);
  }

  // Auto-derive ICP members for each icp_enabled entity
  console.log(`[icp] auto-deriving ICP members…`);
  await upsertMember({ dimensionId: dIcp.id, code: "None", name: "[None]", properties: { is_system: true } });
  for (const e of ENTITIES) {
    if (!e.icpEnabled) continue;
    await upsertMember({
      dimensionId: dIcp.id,
      code: e.code,
      name: `ICP - ${e.name}`,
      properties: { entity_id: entByCode.get(e.code), source_entity: e.code, auto_derived: true },
    });
  }

  // ── Origin members ──────────────────────────────────────────
  console.log(`[origin] seeding origin members…`);
  const originByCode = new Map<string, string>();
  for (const o of [
    { code: "Import",        name: "Import",        type: "IMPORT" },
    { code: "Form",          name: "Form",          type: "FORM" },
    { code: "Consolidation", name: "Consolidation", type: "CONSOL" },
    { code: "Elimination",   name: "Elimination",   type: "ELIM" },
    { code: "Translation",   name: "Translation",   type: "TRANSLATION" },
  ]) {
    const m = await upsertMember({
      dimensionId: dOrg.id, code: o.code, name: o.name,
      properties: { origin_type: o.type, is_system: true },
    });
    originByCode.set(o.code, m.id);
  }

  // ── UD members ──────────────────────────────────────────────
  console.log(`[ud] seeding Department + CostCenter…`);
  const deptByCode = new Map<string, string>();
  for (const d of DEPARTMENTS) {
    const m = await upsertMember({ dimensionId: dUd1.id, code: d.code, name: d.name });
    deptByCode.set(d.code, m.id);
  }
  const ccByCode = new Map<string, string>();
  for (const c of COST_CENTERS) {
    const m = await upsertMember({ dimensionId: dUd2.id, code: c.code, name: c.name });
    ccByCode.set(c.code, m.id);
  }

  // ── Accounts + hierarchy ────────────────────────────────────
  console.log(`[acct] seeding accounts…`);
  const acctHier = await ensureHierarchy(dAcct.id);
  const acctByCode = new Map<string, string>();
  for (const a of ACCOUNTS) {
    const m = await upsertMember({
      dimensionId: dAcct.id, code: a.code, name: a.name,
      properties: {
        account_type:      a.type ?? "STATISTICAL",
        time_balance:      a.timeBalance ?? "FLOW",
        switch_sign:       false,
        storage_type:      "STORED",
        calculation_type:  "INPUT",
        variance_type:     a.type === "EXPENSE" ? "EXPENSE" : a.type === "REVENUE" ? "NON_EXPENSE" : "NEUTRAL",
        currency_behavior: "TRANSACTIONAL",
        allow_input:       a.parent !== null,
        is_consolidated:   true,
        is_icp:            a.isIcp ?? false,
        cash_flow_category: a.cfCategory,
      },
    });
    acctByCode.set(a.code, m.id);
  }
  for (const a of ACCOUNTS) {
    if (!a.parent) continue;
    const p = acctByCode.get(a.parent);
    const c = acctByCode.get(a.code);
    if (p && c) await ensureEdge(p, c, acctHier);
  }

  // ── FX rates ────────────────────────────────────────────────
  console.log(`[fx] seeding ${MONTHS.length * 3 * 2} rates…`);
  for (const m of MONTHS) {
    for (const [fromCcy, base] of Object.entries(FX_BASE)) {
      // Tiny per-month drift so AVG vs CLOSING differ slightly
      const drift = (parseInt(m.slice(-2)) - 6) * 0.005;
      for (const rateType of ["CLOSING", "AVERAGE"] as const) {
        const rate = rateType === "CLOSING" ? base.closing * (1 + drift) : base.avg * (1 + drift / 2);
        await prisma.fxRate.upsert({
          where: { fx_rate_key: { tenantId: TENANT_ID, fromCcy, toCcy: "USD", periodCode: m, rateType } },
          update: { rate, uploadedBy: SEED_USER_ID, source: "seed" },
          create: { tenantId: TENANT_ID, fromCcy, toCcy: "USD", periodCode: m, rateType, rate, uploadedBy: SEED_USER_ID, source: "seed" },
        });
      }
    }
  }

  // ── Sample Data Forms ───────────────────────────────────────
  console.log(`[forms] creating 4 sample forms…`);
  const acctRevenue = acctByCode.get("4000")!;
  const acctOpex    = acctByCode.get("6000")!;
  const acctBS      = acctByCode.get("1000")!;
  const acctICRec   = acctByCode.get("1250")!;
  const scnAct      = scnByCode.get("ACTUAL")!;
  const scnBud      = scnByCode.get("BUDGET")!;
  const ent_us      = entByCode.get("US_HQ")!;
  const ccyLocal    = ccyByCode.get("Local")!;
  const noneIcp     = (await prisma.dimensionMember.findFirst({ where: { tenantId: TENANT_ID, dimensionId: dIcp.id, memberCode: "None" } }))!.id;

  const FORMS = [
    {
      code: "revenue_input", name: "Revenue Input", description: "Monthly revenue entry by service line",
      layoutType: "STANDARD",
      rowSelection: { kind: "children_of", parentMemberId: acctRevenue },
      scenarioIds: [scnAct],
      povDefaults: { SCENARIO: scnAct, ENTITY: ent_us, CURRENCY: ccyLocal, ICP: noneIcp },
    },
    {
      code: "opex_input", name: "Opex Input", description: "Monthly operating expenses",
      layoutType: "STANDARD",
      rowSelection: { kind: "children_of", parentMemberId: acctOpex },
      scenarioIds: [scnAct],
      povDefaults: { SCENARIO: scnAct, ENTITY: ent_us, CURRENCY: ccyLocal, ICP: noneIcp },
    },
    {
      code: "bs_input", name: "Balance Sheet Input", description: "Month-end balance sheet positions",
      layoutType: "STANDARD",
      rowSelection: { kind: "children_of", parentMemberId: acctBS },
      scenarioIds: [scnAct],
      povDefaults: { SCENARIO: scnAct, ENTITY: ent_us, CURRENCY: ccyLocal, ICP: noneIcp },
    },
    {
      code: "ic_recon", name: "IC Reconciliation", description: "Actual vs Budget for intercompany accounts",
      layoutType: "VARIANCE",
      rowSelection: { kind: "manual", memberIds: [
        acctByCode.get("1250")!, acctByCode.get("2150")!, acctByCode.get("4500")!, acctByCode.get("5500")!,
      ] },
      scenarioIds: [scnAct, scnBud],
      povDefaults: { SCENARIO: scnAct, ENTITY: ent_us, CURRENCY: ccyLocal, ICP: noneIcp },
    },
  ];

  for (const f of FORMS) {
    const existing = await prisma.dataForm.findFirst({ where: { tenantId: TENANT_ID, code: f.code } });
    if (existing) {
      await prisma.dataForm.update({
        where: { id: existing.id },
        data: {
          name: f.name, description: f.description,
          layoutType: f.layoutType as any,
          rowSelection: f.rowSelection as any,
          scenarioIds: f.scenarioIds,
          povDefaults: f.povDefaults as any,
          updatedBy: SEED_USER_ID,
        },
      });
    } else {
      await prisma.dataForm.create({
        data: {
          tenantId: TENANT_ID, code: f.code, name: f.name, description: f.description,
          layoutType: f.layoutType as any,
          rowDimKind: "ACCOUNT", rowSelection: f.rowSelection as any,
          colDimKind: "TIME",    colSelection: { kind: "all_leaves" } as any,
          scenarioIds: f.scenarioIds,
          povDefaults: f.povDefaults as any,
          isActive: true, isDefault: f.code === "revenue_input",
          createdBy: SEED_USER_ID,
        },
      });
    }
  }

  // ── Facts ───────────────────────────────────────────────────
  if (!SKIP_FACTS) {
    console.log(`[facts] generating + loading FY2026 facts…`);
    const leafEntities = ENTITIES.filter(e => e.parent !== null);
    const leafAccounts = ACCOUNTS.filter(a => a.parent !== null);

    // Per-entity scale so reports look real (US is biggest, others scaled down)
    const ENTITY_SCALE: Record<string, number> = { US_HQ: 1.0, UK_OPS: 0.55, IN_OPS: 0.32, AE_OPS: 0.18 };
    // Seasonality: tax firms peak Mar (US filing) + Sep (extensions) + Dec (year-end)
    const MONTH_SEASON = [1.4, 1.6, 2.2, 1.0, 0.9, 0.85, 0.9, 1.0, 1.5, 1.1, 1.0, 1.8];

    const rng = seededRand(42);
    let inserted = 0;

    // Wipe existing facts first if we didn't already wipe
    if (!WIPE) {
      await prisma.factRow.deleteMany({ where: { tenantId: TENANT_ID } });
    }

    // BATCH inserts for speed
    const batch: any[] = [];
    const flushBatch = async () => {
      if (batch.length === 0) return;
      await prisma.factRow.createMany({ data: batch.splice(0, batch.length) });
    };

    // For richer data, emit each leaf-account × month at MULTIPLE
    // (Department × CostCenter) combos. Each combo gets its own row.
    // ~50 leaves × 4 entities × 12 months × 4 combos = ~9,600 facts.
    const COMBOS_PER_CELL = 4;

    for (const e of leafEntities) {
      const entId   = entByCode.get(e.code)!;
      const entCcy  = ccyByCode.get(e.baseCcy)!;
      const entIcpNone = noneIcp;
      const entScale = ENTITY_SCALE[e.code] ?? 0.5;

      // Pick a counter-entity for IC pairs (round-robin across other leaves)
      const otherLeaves = leafEntities.filter(o => o.code !== e.code).map(o => o.code);

      for (const a of leafAccounts) {
        const acctId = acctByCode.get(a.code)!;
        const acctType = a.type ?? "STATISTICAL";

        // Base monthly figure by account type (in entity's local currency, in lakhs/M)
        let baseMonthly = 0;
        if (acctType === "REVENUE") baseMonthly = 15_00_000 * entScale;       // 15L base
        else if (acctType === "EXPENSE") baseMonthly = 8_00_000 * entScale;
        else if (acctType === "ASSET")  baseMonthly = 40_00_000 * entScale;    // BS account balance
        else if (acctType === "LIABILITY") baseMonthly = 20_00_000 * entScale;
        else if (acctType === "EQUITY") baseMonthly = 25_00_000 * entScale;

        // Specific tweaks for IC accounts (smaller magnitudes)
        if (a.isIcp) baseMonthly = baseMonthly * 0.15;

        for (let mi = 0; mi < MONTHS.length; mi++) {
          const mcode = MONTHS[mi];
          const monthId = monthIdByCode.get(mcode)!;
          const season = a.timeBalance === "LAST" ? 1 : MONTH_SEASON[mi];
          const noise = 0.85 + rng() * 0.3;  // ±15%
          let value = baseMonthly * season * noise;

          // BS accounts drift across months, not seasonal
          if (a.timeBalance === "LAST") {
            value = baseMonthly * (1 + (mi * 0.012)) * noise;
          }

          // ICP picks
          let icpId = entIcpNone;
          if (a.isIcp) {
            const partner = otherLeaves[mi % otherLeaves.length];
            const icpMember = await prisma.dimensionMember.findFirst({
              where: { tenantId: TENANT_ID, dimensionId: dIcp.id, memberCode: partner },
              select: { id: true },
            });
            if (icpMember) icpId = icpMember.id;
          }

          // Emit N (department × costcenter) combos per cell. Each combo is
          // a distinct intersection — the share of the cell value is split
          // across combos with slight per-combo noise so totals sum.
          for (let k = 0; k < COMBOS_PER_CELL; k++) {
            const dept = DEPARTMENTS[(a.code.charCodeAt(1) + mi + k) % DEPARTMENTS.length];
            const cc   = COST_CENTERS[(a.code.charCodeAt(2) + mi + k * 3) % COST_CENTERS.length];

            // Split the value across combos (each combo ~25% of the cell value)
            const comboShare = (1 / COMBOS_PER_CELL) * (0.8 + rng() * 0.4);
            const subValue = Math.round((value * comboShare) / 100) * 100;

            // ACTUAL row
            batch.push({
              tenantId: TENANT_ID,
              scenarioId: scnAct,
              entityId: entId,
              timeId: monthId,
              accountId: acctId,
              currencyId: entCcy,
              icpId,
              originId: originByCode.get("Import")!,
              ud1Id: deptByCode.get(dept.code)!,
              ud2Id: ccByCode.get(cc.code)!,
              ud3Id: null, ud4Id: null, ud5Id: null, ud6Id: null, ud7Id: null, ud8Id: null,
              valueTxn: subValue,
              valueLocal: subValue,
              valueReporting: subValue,
              version: 1,
              isCurrent: true,
              postedBy: SEED_USER_ID,
            });

            // Only k=0 emits BUDGET (so BUDGET stays as a leaner comparison set, ~2,400 rows)
            if (k === 0) {
              const bDelta = 0.95 + rng() * 0.15;
              const bValue = Math.round((value * bDelta) / 100) * 100;
              batch.push({
                tenantId: TENANT_ID,
                scenarioId: scnBud,
                entityId: entId,
                timeId: monthId,
                accountId: acctId,
                currencyId: entCcy,
                icpId: entIcpNone,
                originId: originByCode.get("Import")!,
                ud1Id: deptByCode.get(dept.code)!,
                ud2Id: ccByCode.get(cc.code)!,
                ud3Id: null, ud4Id: null, ud5Id: null, ud6Id: null, ud7Id: null, ud8Id: null,
                valueTxn: bValue,
                valueLocal: bValue,
                valueReporting: bValue,
                version: 1,
                isCurrent: true,
                postedBy: SEED_USER_ID,
              });
              inserted += 1;
            }
            inserted += 1;

            if (batch.length >= 500) {
              await flushBatch();
              process.stdout.write(`.`);
            }
          }
        }
      }
    }
    await flushBatch();
    console.log(`\n[facts] inserted ${inserted} rows`);
  }

  console.log(`\n=== seed complete ===\n`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Seed failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
