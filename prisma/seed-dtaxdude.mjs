// Seed: Dtaxdude & Co — Chartered Accountant firm tenant.
// Single-currency (INR), 4 offices, April-March fiscal year, 3 years of time.
// Login: admin@dtaxdude.com / admin123
//
// Run: node prisma/seed-dtaxdude.mjs

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TENANT_ID = "dtaxdude-tenant-0001";
const ADMIN_HASH = "$2a$10$I.VRZOP2XIVBxjtcsbjpLu8TWL0hgUNz2/Df0vtYnpW9qkNG001pG"; // admin123

// ─── Helpers ────────────────────────────────────────────────────

async function upsertDim(kind, code, label) {
  return prisma.dimension.upsert({
    where: { tenantId_kind: { tenantId: TENANT_ID, kind } },
    update: { label, isEnabled: true },
    create: {
      tenantId: TENANT_ID, kind, code, label, isEnabled: true, isCustom: false,
    },
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
  // Idempotent
  const exists = await prisma.hierarchyEdge.findFirst({
    where: { tenantId: TENANT_ID, hierarchyId, parentMemberId, childMemberId },
  });
  if (exists) return exists;
  return prisma.hierarchyEdge.create({
    data: { tenantId: TENANT_ID, hierarchyId, parentMemberId, childMemberId, operator, weight: 1 },
  });
}

const MONTH_NAMES = ["April","May","June","July","August","September","October","November","December","January","February","March"];
const MONTH_NUMS  = [4,5,6,7,8,9,10,11,12,1,2,3];

function daysInMonth(year, monthIdx0) {
  return new Date(year, monthIdx0 + 1, 0).getDate();
}
const pad = (n) => String(n).padStart(2, "0");

function buildFiscalYear(fy /* e.g. 2024 means FY2024 = Apr 2024 -> Mar 2025 */) {
  const yearCode = `FY${fy}`;
  const yearNode = {
    code: yearCode, name: `FY ${fy}`,
    properties: {
      period_type: "YEAR", fiscal_year: fy,
      start_date: `${fy}-04-01`,
      end_date: `${fy + 1}-03-${pad(daysInMonth(fy + 1, 2))}`,
    },
  };
  const quarters = [];
  const months = [];
  for (let q = 1; q <= 4; q++) {
    const qMonthIdxStart = (q - 1) * 3;
    const qStartMonthNum = MONTH_NUMS[qMonthIdxStart];
    const qEndMonthNum   = MONTH_NUMS[qMonthIdxStart + 2];
    const qStartYear     = qStartMonthNum >= 4 ? fy : fy + 1;
    const qEndYear       = qEndMonthNum   >= 4 ? fy : fy + 1;
    quarters.push({
      code: `Q${q}-FY${fy}`, name: `Q${q} FY${fy}`, parentCode: yearCode,
      properties: {
        period_type: "QUARTER", fiscal_year: fy, quarter_index: q,
        start_date: `${qStartYear}-${pad(qStartMonthNum)}-01`,
        end_date: `${qEndYear}-${pad(qEndMonthNum)}-${pad(daysInMonth(qEndYear, qEndMonthNum - 1))}`,
      },
    });
    for (let m = 0; m < 3; m++) {
      const mNum = MONTH_NUMS[qMonthIdxStart + m];
      const calYear = mNum >= 4 ? fy : fy + 1;
      months.push({
        code: `${calYear}M${pad(mNum)}`,
        name: `${MONTH_NAMES[qMonthIdxStart + m]} ${calYear}`,
        parentCode: `Q${q}-FY${fy}`,
        properties: {
          period_type: "MONTH", fiscal_year: fy,
          month_index: mNum - 1, quarter_index: q,
          start_date: `${calYear}-${pad(mNum)}-01`,
          end_date: `${calYear}-${pad(mNum)}-${pad(daysInMonth(calYear, mNum - 1))}`,
        },
      });
    }
  }
  return { year: yearNode, quarters, months };
}

// ─── Account chart (CA firm) ────────────────────────────────────

const ACCOUNTS = [
  // Revenue root
  { code: "4000", name: "Total Revenue", account_type: "REVENUE", parent: null },
  { code: "4100", name: "Audit Fees",                 account_type: "REVENUE", parent: "4000" },
  { code: "4200", name: "Tax Consulting Fees",        account_type: "REVENUE", parent: "4000" },
  { code: "4300", name: "Compliance & Filing Fees",   account_type: "REVENUE", parent: "4000" },
  { code: "4400", name: "Advisory Fees",              account_type: "REVENUE", parent: "4000" },
  { code: "4900", name: "Other Income",               account_type: "REVENUE", parent: "4000" },

  // Expenses root
  { code: "5000", name: "Total Expenses",             account_type: "EXPENSE", parent: null },

  // Personnel
  { code: "5100", name: "Personnel Costs",            account_type: "EXPENSE", parent: "5000" },
  { code: "5110", name: "Salaries",                   account_type: "EXPENSE", parent: "5100" },
  { code: "5120", name: "Bonuses",                    account_type: "EXPENSE", parent: "5100" },
  { code: "5130", name: "PF & ESI",                   account_type: "EXPENSE", parent: "5100" },

  // Operations
  { code: "5200", name: "Operations",                 account_type: "EXPENSE", parent: "5000" },
  { code: "5210", name: "Office Rent",                account_type: "EXPENSE", parent: "5200" },
  { code: "5220", name: "Utilities",                  account_type: "EXPENSE", parent: "5200" },
  { code: "5230", name: "Internet & Phone",           account_type: "EXPENSE", parent: "5200" },

  // Professional
  { code: "5300", name: "Professional",               account_type: "EXPENSE", parent: "5000" },
  { code: "5310", name: "Software Subscriptions",     account_type: "EXPENSE", parent: "5300" },
  { code: "5320", name: "Training",                   account_type: "EXPENSE", parent: "5300" },
  { code: "5330", name: "Library & Publications",     account_type: "EXPENSE", parent: "5300" },

  // G&A
  { code: "5400", name: "General & Administrative",   account_type: "EXPENSE", parent: "5000" },
  { code: "5410", name: "Travel",                     account_type: "EXPENSE", parent: "5400" },
  { code: "5420", name: "Marketing",                  account_type: "EXPENSE", parent: "5400" },
  { code: "5430", name: "Office Supplies",            account_type: "EXPENSE", parent: "5400" },
];

const ENTITIES = [
  { code: "DTX",     name: "Dtaxdude Group",         parent: null },
  { code: "DTX-HQ",  name: "Dtaxdude HQ (Jaora)",    parent: "DTX" },
  { code: "DTX-PUN", name: "Dtaxdude Pune",          parent: "DTX" },
  { code: "DTX-BLR", name: "Dtaxdude Bangalore",     parent: "DTX" },
  { code: "DTX-JAI", name: "Dtaxdude Jaipur",        parent: "DTX" },
];

const SCENARIOS = [
  { code: "ACTUAL",   name: "Actual",   scenario_type: "ACTUAL"   },
  { code: "BUDGET",   name: "Budget",   scenario_type: "BUDGET"   },
  { code: "FORECAST", name: "Forecast", scenario_type: "FORECAST" },
];

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log("=== Seeding Dtaxdude & Co tenant ===");

  // 1) Tenant
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: { isActive: true, name: "Dtaxdude & Co", slug: "dtaxdude" },
    create: { id: TENANT_ID, name: "Dtaxdude & Co", slug: "dtaxdude", isActive: true },
  });
  console.log("✅ tenant: Dtaxdude & Co");

  // 2) Admin user
  const existing = await prisma.user.findFirst({
    where: { email: "admin@dtaxdude.com", tenantId: TENANT_ID },
  });
  const adminId = existing?.id ?? undefined;
  let admin;
  if (existing) {
    admin = await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: ADMIN_HASH, role: "ADMIN", isActive: true, name: "Dtaxdude Admin" },
    });
  } else {
    admin = await prisma.user.create({
      data: {
        tenantId: TENANT_ID, email: "admin@dtaxdude.com", name: "Dtaxdude Admin",
        passwordHash: ADMIN_HASH, role: "ADMIN", isActive: true,
      },
    });
  }
  console.log("✅ admin: admin@dtaxdude.com / admin123");

  // 3) Feature flags
  const flags = [
    { featureKey: "multi_entity_enabled",        isEnabled: true  },
    { featureKey: "multi_currency_enabled",      isEnabled: false },
    { featureKey: "intercompany_enabled",        isEnabled: false },
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
  console.log("✅ feature flags set (multi_entity=true, intercompany=false, multi_currency=false)");

  // 4) Dimensions (5 always-on + 2 configured user dims for a CA firm)
  const dimAccount  = await upsertDim("ACCOUNT",  "account",  "Account");
  const dimEntity   = await upsertDim("ENTITY",   "entity",   "Entity");
  const dimScenario = await upsertDim("SCENARIO", "scenario", "Scenario");
  const dimTime     = await upsertDim("TIME",     "time",     "Time Period");
  const dimCurrency = await upsertDim("CURRENCY", "currency", "Currency");
  // User-defined dims — renamed for the CA firm context
  const dimUd1      = await prisma.dimension.upsert({
    where: { tenantId_kind: { tenantId: TENANT_ID, kind: "UD1" } },
    update: { code: "service_line", label: "Service Line", isCustom: true, isEnabled: true },
    create: { tenantId: TENANT_ID, kind: "UD1", code: "service_line", label: "Service Line", isCustom: true, isEnabled: true },
  });
  const dimUd2      = await prisma.dimension.upsert({
    where: { tenantId_kind: { tenantId: TENANT_ID, kind: "UD2" } },
    update: { code: "client_type",  label: "Client Type",  isCustom: true, isEnabled: true },
    create: { tenantId: TENANT_ID, kind: "UD2", code: "client_type",  label: "Client Type",  isCustom: true, isEnabled: true },
  });
  console.log("✅ 5 always-on dimensions + 2 user dims (Service Line, Client Type)");

  // Hierarchies
  const hAccount  = await getOrCreateHierarchy(dimAccount.id);
  const hEntity   = await getOrCreateHierarchy(dimEntity.id);
  const hTime     = await getOrCreateHierarchy(dimTime.id);

  // 5) Currency: INR (base) — also seed USD as inactive reference
  await upsertMember(dimCurrency.id, "INR", "Indian Rupee", { iso_code: "INR", is_base: true });
  console.log("✅ currency: INR (base)");

  // 6) Scenarios
  for (const s of SCENARIOS) {
    await upsertMember(dimScenario.id, s.code, s.name, {
      scenario_type: s.scenario_type, is_frozen: false, version: "v1",
    });
  }
  console.log("✅ 3 scenarios: Actual, Budget, Forecast");

  // 7) Entities (with hierarchy)
  const entityByCode = {};
  for (const e of ENTITIES) {
    const member = await upsertMember(dimEntity.id, e.code, e.name, {
      base_currency: "INR",
      consolidation_method: "FULL",
      ownership_pct: 100,
      icp_enabled: false,
      country: "IN",
    });
    entityByCode[e.code] = member;
  }
  for (const e of ENTITIES) {
    if (e.parent) {
      await addEdge(hEntity.id, entityByCode[e.parent].id, entityByCode[e.code].id);
    }
  }
  console.log(`✅ ${ENTITIES.length} entities + ${ENTITIES.filter(e=>e.parent).length} edges`);

  // 8) Time periods (Apr-Mar × 3 years)
  let timeCount = 0;
  let edgeCount = 0;
  for (const fy of [2024, 2025, 2026]) {
    const built = buildFiscalYear(fy);
    const yearMember = await upsertMember(dimTime.id, built.year.code, built.year.name, built.year.properties);
    timeCount++;
    for (const q of built.quarters) {
      const qMember = await upsertMember(dimTime.id, q.code, q.name, q.properties);
      await addEdge(hTime.id, yearMember.id, qMember.id);
      edgeCount++; timeCount++;
    }
    for (const m of built.months) {
      const mMember = await upsertMember(dimTime.id, m.code, m.name, m.properties);
      // m.parentCode is the quarter code
      const qMember = await prisma.dimensionMember.findFirst({
        where: { tenantId: TENANT_ID, dimensionId: dimTime.id, memberCode: m.parentCode },
      });
      if (qMember) await addEdge(hTime.id, qMember.id, mMember.id);
      edgeCount++; timeCount++;
    }
  }
  console.log(`✅ ${timeCount} time members + ${edgeCount} edges (FY24-FY26, Apr-Mar)`);

  // 8b) Sample members for the configured user dims
  const hUd1 = await getOrCreateHierarchy(dimUd1.id);
  const hUd2 = await getOrCreateHierarchy(dimUd2.id);

  const SERVICE_LINES = [
    { code: "SL-AUDIT",    name: "Audit",       parent: null },
    { code: "SL-TAX",      name: "Tax",         parent: null },
    { code: "SL-COMPLY",   name: "Compliance",  parent: null },
    { code: "SL-ADVISORY", name: "Advisory",    parent: null },
  ];
  const slByCode = {};
  for (const s of SERVICE_LINES) {
    slByCode[s.code] = await upsertMember(dimUd1.id, s.code, s.name, { category: "service_line" });
  }
  console.log(`✅ ${SERVICE_LINES.length} service lines`);

  const CLIENT_TYPES = [
    { code: "CT-CORP",       name: "Corporate"          },
    { code: "CT-SME",        name: "SME"                },
    { code: "CT-INDIVIDUAL", name: "Individual"         },
    { code: "CT-NPO",        name: "Non-Profit / Trust" },
  ];
  for (const c of CLIENT_TYPES) {
    await upsertMember(dimUd2.id, c.code, c.name, { category: "client_type" });
  }
  console.log(`✅ ${CLIENT_TYPES.length} client types`);

  // 9) Accounts (with hierarchy)
  const accByCode = {};
  for (const a of ACCOUNTS) {
    const member = await upsertMember(dimAccount.id, a.code, a.name, {
      account_type: a.account_type,
      time_balance: "FLOW",
      switch_sign: false,
      storage_type: "STORED",
      calculation_type: "INPUT",
      variance_type: a.account_type === "EXPENSE" ? "EXPENSE" : "NON_EXPENSE",
      currency_behavior: "TRANSACTIONAL",
      allow_input: true,
      is_consolidated: true,
    });
    accByCode[a.code] = member;
  }
  for (const a of ACCOUNTS) {
    if (a.parent) {
      await addEdge(hAccount.id, accByCode[a.parent].id, accByCode[a.code].id);
    }
  }
  console.log(`✅ ${ACCOUNTS.length} accounts + ${ACCOUNTS.filter(a=>a.parent).length} edges`);

  console.log("");
  console.log("================================================");
  console.log("  DONE — Dtaxdude tenant is ready");
  console.log("  Login: admin@dtaxdude.com / admin123");
  console.log("  Slug:  dtaxdude");
  console.log("================================================");
}

main()
  .catch((e) => { console.error("❌ seed failed:", e); process.exit(1); })
  .finally(async () => prisma.$disconnect());
