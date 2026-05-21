/**
 * Prisma seed script — CFO Pilot Metadata Module
 * Run: npx prisma db seed
 *
 * Seeds: tenant, users, accounts, entities, departments, cost centres,
 *        currencies (all world), FX rates (to INR), time hierarchy (OneStream 2025-2026),
 *        scenarios, tenant settings
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ─── World currencies with approximate INR rates (May 2026) ──────────────────
const CURRENCIES: Array<{
  code: string;
  name: string;
  symbol: string;
  rateToINR: number;
  isBase?: boolean;
}> = [
  { code: "INR", name: "Indian Rupee",           symbol: "₹",   rateToINR: 1,         isBase: true },
  { code: "USD", name: "US Dollar",               symbol: "$",   rateToINR: 84.50      },
  { code: "EUR", name: "Euro",                    symbol: "€",   rateToINR: 91.20      },
  { code: "GBP", name: "British Pound",           symbol: "£",   rateToINR: 106.80     },
  { code: "JPY", name: "Japanese Yen",            symbol: "¥",   rateToINR: 0.565      },
  { code: "CNY", name: "Chinese Yuan",            symbol: "¥",   rateToINR: 11.65      },
  { code: "AUD", name: "Australian Dollar",       symbol: "A$",  rateToINR: 55.20      },
  { code: "CAD", name: "Canadian Dollar",         symbol: "C$",  rateToINR: 62.10      },
  { code: "CHF", name: "Swiss Franc",             symbol: "Fr",  rateToINR: 96.50      },
  { code: "SGD", name: "Singapore Dollar",        symbol: "S$",  rateToINR: 63.40      },
  { code: "HKD", name: "Hong Kong Dollar",        symbol: "HK$", rateToINR: 10.82      },
  { code: "NZD", name: "New Zealand Dollar",      symbol: "NZ$", rateToINR: 50.60      },
  { code: "SEK", name: "Swedish Krona",           symbol: "kr",  rateToINR: 8.15       },
  { code: "NOK", name: "Norwegian Krone",         symbol: "kr",  rateToINR: 8.10       },
  { code: "DKK", name: "Danish Krone",            symbol: "kr",  rateToINR: 12.35      },
  { code: "KRW", name: "South Korean Won",        symbol: "₩",   rateToINR: 0.0615     },
  { code: "THB", name: "Thai Baht",               symbol: "฿",   rateToINR: 2.42       },
  { code: "MYR", name: "Malaysian Ringgit",       symbol: "RM",  rateToINR: 19.20      },
  { code: "IDR", name: "Indonesian Rupiah",       symbol: "Rp",  rateToINR: 0.00530    },
  { code: "PHP", name: "Philippine Peso",         symbol: "₱",   rateToINR: 1.49       },
  { code: "VND", name: "Vietnamese Dong",         symbol: "₫",   rateToINR: 0.00333    },
  { code: "TWD", name: "Taiwan Dollar",           symbol: "NT$", rateToINR: 2.62       },
  { code: "BDT", name: "Bangladeshi Taka",        symbol: "৳",   rateToINR: 0.77       },
  { code: "PKR", name: "Pakistani Rupee",         symbol: "₨",   rateToINR: 0.30       },
  { code: "LKR", name: "Sri Lankan Rupee",        symbol: "Rs",  rateToINR: 0.29       },
  { code: "NPR", name: "Nepalese Rupee",          symbol: "Rs",  rateToINR: 0.63       },
  { code: "AED", name: "UAE Dirham",              symbol: "د.إ", rateToINR: 23.00      },
  { code: "SAR", name: "Saudi Riyal",             symbol: "﷼",   rateToINR: 22.53      },
  { code: "QAR", name: "Qatari Riyal",            symbol: "﷼",   rateToINR: 23.22      },
  { code: "KWD", name: "Kuwaiti Dinar",           symbol: "KD",  rateToINR: 275.50     },
  { code: "BHD", name: "Bahraini Dinar",          symbol: "BD",  rateToINR: 224.20     },
  { code: "OMR", name: "Omani Rial",              symbol: "ر.ع", rateToINR: 219.75     },
  { code: "JOD", name: "Jordanian Dinar",         symbol: "JD",  rateToINR: 119.20     },
  { code: "EGP", name: "Egyptian Pound",          symbol: "E£",  rateToINR: 1.73       },
  { code: "ZAR", name: "South African Rand",      symbol: "R",   rateToINR: 4.62       },
  { code: "NGN", name: "Nigerian Naira",          symbol: "₦",   rateToINR: 0.056      },
  { code: "KES", name: "Kenyan Shilling",         symbol: "Ksh", rateToINR: 0.66       },
  { code: "GHS", name: "Ghanaian Cedi",           symbol: "₵",   rateToINR: 5.63       },
  { code: "BRL", name: "Brazilian Real",          symbol: "R$",  rateToINR: 15.80      },
  { code: "MXN", name: "Mexican Peso",            symbol: "$",   rateToINR: 4.42       },
  { code: "ARS", name: "Argentine Peso",          symbol: "$",   rateToINR: 0.094      },
  { code: "CLP", name: "Chilean Peso",            symbol: "$",   rateToINR: 0.092      },
  { code: "COP", name: "Colombian Peso",          symbol: "$",   rateToINR: 0.020      },
  { code: "PEN", name: "Peruvian Sol",            symbol: "S/",  rateToINR: 22.60      },
  { code: "TRY", name: "Turkish Lira",            symbol: "₺",   rateToINR: 2.48       },
  { code: "RUB", name: "Russian Ruble",           symbol: "₽",   rateToINR: 0.95       },
  { code: "PLN", name: "Polish Zloty",            symbol: "zł",  rateToINR: 21.50      },
  { code: "CZK", name: "Czech Koruna",            symbol: "Kč",  rateToINR: 3.75       },
  { code: "HUF", name: "Hungarian Forint",        symbol: "Ft",  rateToINR: 0.23       },
  { code: "RON", name: "Romanian Leu",            symbol: "lei", rateToINR: 18.60      },
  { code: "UAH", name: "Ukrainian Hryvnia",       symbol: "₴",   rateToINR: 2.03       },
  { code: "ILS", name: "Israeli Shekel",          symbol: "₪",   rateToINR: 22.50      },
];

// ─── OneStream-style time hierarchy builder ──────────────────────────────────
type TimeSeed = {
  code: string;
  name: string;
  periodType: string;
  fiscalYear: number;
  fiscalPeriod: number | null;
  startDate: Date;
  endDate: Date;
  sortOrder: number;
  parentCode: string | null;
};

function buildTimeHierarchy(year: number): TimeSeed[] {
  const periods: TimeSeed[] = [];

  // Year
  periods.push({
    code: `${year}`,
    name: `${year}`,
    periodType: "YEAR",
    fiscalYear: year,
    fiscalPeriod: null,
    startDate: new Date(`${year}-01-01`),
    endDate:   new Date(`${year}-12-31`),
    sortOrder: 0,
    parentCode: null,
  });

  // Half-Years
  const halves = [
    { code: `${year}HY1`, name: `${year}HY1`, start: `${year}-01-01`, end: `${year}-06-30`, sort: 1 },
    { code: `${year}HY2`, name: `${year}HY2`, start: `${year}-07-01`, end: `${year}-12-31`, sort: 2 },
  ];
  halves.forEach((hy) => {
    periods.push({
      code: hy.code,
      name: hy.name,
      periodType: "HALFYEAR",
      fiscalYear: year,
      fiscalPeriod: null,
      startDate: new Date(hy.start),
      endDate:   new Date(hy.end),
      sortOrder: hy.sort,
      parentCode: `${year}`,
    });
  });

  // Quarters
  const quarters = [
    { code: `${year}Q1`, name: `${year}Q1`, start: `${year}-01-01`, end: `${year}-03-31`, sort: 1, parentHY: `${year}HY1`, qNum: 1 },
    { code: `${year}Q2`, name: `${year}Q2`, start: `${year}-04-01`, end: `${year}-06-30`, sort: 2, parentHY: `${year}HY1`, qNum: 2 },
    { code: `${year}Q3`, name: `${year}Q3`, start: `${year}-07-01`, end: `${year}-09-30`, sort: 3, parentHY: `${year}HY2`, qNum: 3 },
    { code: `${year}Q4`, name: `${year}Q4`, start: `${year}-10-01`, end: `${year}-12-31`, sort: 4, parentHY: `${year}HY2`, qNum: 4 },
  ];
  quarters.forEach((q) => {
    periods.push({
      code: q.code,
      name: q.name,
      periodType: "QUARTER",
      fiscalYear: year,
      fiscalPeriod: q.qNum,
      startDate: new Date(q.start),
      endDate:   new Date(q.end),
      sortOrder: q.sort,
      parentCode: q.parentHY,
    });
  });

  // Months
  const MONTH_NAMES = ["January","February","March","April","May","June",
                        "July","August","September","October","November","December"];
  const quarterMonths: Record<string, number[]> = {
    [`${year}Q1`]: [1,2,3],
    [`${year}Q2`]: [4,5,6],
    [`${year}Q3`]: [7,8,9],
    [`${year}Q4`]: [10,11,12],
  };
  for (const [qCode, monthNums] of Object.entries(quarterMonths)) {
    monthNums.forEach((m, idx) => {
      const mm = String(m).padStart(2, "0");
      const lastDay = new Date(year, m, 0).getDate();
      periods.push({
        code: `${year}M${m}`,
        name: MONTH_NAMES[m - 1],           // e.g. "January"
        periodType: "MONTH",
        fiscalYear: year,
        fiscalPeriod: m,
        startDate: new Date(`${year}-${mm}-01`),
        endDate:   new Date(`${year}-${mm}-${String(lastDay).padStart(2, "0")}`),
        sortOrder: idx + 1,
        parentCode: qCode,
      });
    });
  }

  return periods;
}

async function main() {
  console.log("🌱 Seeding database...");

  // ── Tenant ────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      id:   "tenant-demo-001",
      name: "Demo Hospital Group",
      slug: "demo",
      plan: "PROFESSIONAL",
    },
  });
  console.log(`✅ Tenant: ${tenant.name}`);

  // ── Users ─────────────────────────────────────────────────────────────────
  const users = [
    { email: "admin@cfopilot.com",   name: "Admin User",       role: "ADMIN",           password: "admin123"   },
    { email: "manager@cfopilot.com", name: "Finance Manager",  role: "FINANCE_MANAGER", password: "manager123" },
    { email: "user@cfopilot.com",    name: "Finance User",     role: "FINANCE_USER",    password: "user123"    },
    { email: "viewer@cfopilot.com",  name: "Read Only Viewer", role: "VIEWER",          password: "viewer123"  },
  ];
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where:  { tenantId_email: { tenantId: tenant.id, email: u.email } },
      update: {},
      create: { email: u.email, name: u.name, passwordHash: hash, role: u.role as any, tenantId: tenant.id, isActive: true },
    });
  }
  console.log(`✅ Users: ${users.length} created`);

  // ── Chart of Accounts (hospital) ──────────────────────────────────────────
  type AccSeed = { accountCode: string; accountName: string; accountType: string; parentCode: string | null; reportingGroup?: string };
  const accounts: AccSeed[] = [
    { accountCode: "1000", accountName: "Assets",                          accountType: "ASSET",     parentCode: null,   reportingGroup: "Balance Sheet"      },
    { accountCode: "1100", accountName: "Current Assets",                  accountType: "ASSET",     parentCode: "1000", reportingGroup: "Balance Sheet"      },
    { accountCode: "1110", accountName: "Cash and Cash Equivalents",       accountType: "ASSET",     parentCode: "1100", reportingGroup: "Current Assets"     },
    { accountCode: "1120", accountName: "Accounts Receivable - Patients",  accountType: "ASSET",     parentCode: "1100", reportingGroup: "Current Assets"     },
    { accountCode: "1130", accountName: "Medical Supplies Inventory",      accountType: "ASSET",     parentCode: "1100", reportingGroup: "Current Assets"     },
    { accountCode: "1200", accountName: "Non-Current Assets",              accountType: "ASSET",     parentCode: "1000", reportingGroup: "Balance Sheet"      },
    { accountCode: "1210", accountName: "Medical Equipment",               accountType: "ASSET",     parentCode: "1200", reportingGroup: "Fixed Assets"       },
    { accountCode: "1220", accountName: "Buildings and Facilities",        accountType: "ASSET",     parentCode: "1200", reportingGroup: "Fixed Assets"       },
    { accountCode: "2000", accountName: "Liabilities",                     accountType: "LIABILITY", parentCode: null,   reportingGroup: "Balance Sheet"      },
    { accountCode: "2100", accountName: "Current Liabilities",             accountType: "LIABILITY", parentCode: "2000", reportingGroup: "Balance Sheet"      },
    { accountCode: "2110", accountName: "Accounts Payable - Suppliers",    accountType: "LIABILITY", parentCode: "2100", reportingGroup: "Current Liabilities" },
    { accountCode: "2120", accountName: "Accrued Staff Salaries",          accountType: "LIABILITY", parentCode: "2100", reportingGroup: "Current Liabilities" },
    { accountCode: "3000", accountName: "Equity",                          accountType: "EQUITY",    parentCode: null,   reportingGroup: "Balance Sheet"      },
    { accountCode: "3100", accountName: "Retained Earnings",               accountType: "EQUITY",    parentCode: "3000", reportingGroup: "Equity"             },
    { accountCode: "4000", accountName: "Revenue",                         accountType: "REVENUE",   parentCode: null,   reportingGroup: "Income Statement"   },
    { accountCode: "4100", accountName: "Inpatient Revenue",               accountType: "REVENUE",   parentCode: "4000", reportingGroup: "Clinical Revenue"   },
    { accountCode: "4200", accountName: "Outpatient Revenue",              accountType: "REVENUE",   parentCode: "4000", reportingGroup: "Clinical Revenue"   },
    { accountCode: "4300", accountName: "Emergency Revenue",               accountType: "REVENUE",   parentCode: "4000", reportingGroup: "Clinical Revenue"   },
    { accountCode: "4400", accountName: "Ancillary Services Revenue",      accountType: "REVENUE",   parentCode: "4000", reportingGroup: "Clinical Revenue"   },
    { accountCode: "4500", accountName: "Non-Clinical Revenue",            accountType: "REVENUE",   parentCode: "4000", reportingGroup: "Other Revenue"      },
    { accountCode: "5000", accountName: "Expenses",                        accountType: "EXPENSE",   parentCode: null,   reportingGroup: "Income Statement"   },
    { accountCode: "5100", accountName: "Salaries and Benefits",           accountType: "EXPENSE",   parentCode: "5000", reportingGroup: "Staff Costs"        },
    { accountCode: "5110", accountName: "Physician Salaries",              accountType: "EXPENSE",   parentCode: "5100", reportingGroup: "Staff Costs"        },
    { accountCode: "5120", accountName: "Nursing Staff Salaries",          accountType: "EXPENSE",   parentCode: "5100", reportingGroup: "Staff Costs"        },
    { accountCode: "5130", accountName: "Administrative Staff",            accountType: "EXPENSE",   parentCode: "5100", reportingGroup: "Staff Costs"        },
    { accountCode: "5200", accountName: "Medical Supplies",                accountType: "EXPENSE",   parentCode: "5000", reportingGroup: "Clinical Expenses"  },
    { accountCode: "5300", accountName: "Facility Costs",                  accountType: "EXPENSE",   parentCode: "5000", reportingGroup: "Overhead"           },
    { accountCode: "5400", accountName: "Technology and IT",               accountType: "EXPENSE",   parentCode: "5000", reportingGroup: "Overhead"           },
  ];

  const codeToId = new Map<string, string>();
  for (const acc of accounts.filter((a) => !a.parentCode)) {
    const r = await prisma.account.upsert({
      where:  { tenantId_accountCode: { tenantId: tenant.id, accountCode: acc.accountCode } },
      update: {},
      create: { accountCode: acc.accountCode, accountName: acc.accountName, accountType: acc.accountType as any, reportingGroup: acc.reportingGroup, tenantId: tenant.id },
    });
    codeToId.set(acc.accountCode, r.id);
  }
  for (const acc of accounts.filter((a) => a.parentCode)) {
    const parentId = codeToId.get(acc.parentCode!) ?? null;
    const r = await prisma.account.upsert({
      where:  { tenantId_accountCode: { tenantId: tenant.id, accountCode: acc.accountCode } },
      update: {},
      create: { accountCode: acc.accountCode, accountName: acc.accountName, accountType: acc.accountType as any, reportingGroup: acc.reportingGroup, parentId, tenantId: tenant.id },
    });
    codeToId.set(acc.accountCode, r.id);
  }
  console.log(`✅ Accounts: ${accounts.length} created`);

  // ── Entities ──────────────────────────────────────────────────────────────
  type EntSeed = { entityCode: string; entityName: string; baseCurrency: string; country?: string; parentCode: string | null };
  const entities: EntSeed[] = [
    { entityCode: "GROUP",  entityName: "Hospital Group HQ",   baseCurrency: "USD", country: "IN", parentCode: null     },
    { entityCode: "IN-HQ",  entityName: "India Main Hospital", baseCurrency: "INR", country: "IN", parentCode: "GROUP"  },
    { entityCode: "IN-DEL", entityName: "Delhi Branch",        baseCurrency: "INR", country: "IN", parentCode: "IN-HQ"  },
    { entityCode: "IN-MUM", entityName: "Mumbai Branch",       baseCurrency: "INR", country: "IN", parentCode: "IN-HQ"  },
    { entityCode: "SG-HQ",  entityName: "Singapore Clinic",    baseCurrency: "SGD", country: "SG", parentCode: "GROUP"  },
    { entityCode: "AE-HQ",  entityName: "Dubai Office",        baseCurrency: "AED", country: "AE", parentCode: "GROUP"  },
  ];
  const entityMap = new Map<string, string>();
  for (const ent of entities) {
    const parentId = ent.parentCode ? entityMap.get(ent.parentCode) ?? null : null;
    const r = await prisma.entity.upsert({
      where:  { tenantId_entityCode: { tenantId: tenant.id, entityCode: ent.entityCode } },
      update: {},
      create: { entityCode: ent.entityCode, entityName: ent.entityName, baseCurrency: ent.baseCurrency, country: ent.country ?? null, parentId, tenantId: tenant.id },
    });
    entityMap.set(ent.entityCode, r.id);
  }
  console.log(`✅ Entities: ${entities.length} created`);

  // ── Departments ───────────────────────────────────────────────────────────
  type DeptSeed = { departmentCode: string; departmentName: string; parentCode: string | null };
  const departments: DeptSeed[] = [
    { departmentCode: "CORP",      departmentName: "Corporate",              parentCode: null        },
    { departmentCode: "CLINICAL",  departmentName: "Clinical Operations",    parentCode: "CORP"      },
    { departmentCode: "IPD",       departmentName: "Inpatient Department",   parentCode: "CLINICAL"  },
    { departmentCode: "OPD",       departmentName: "Outpatient Department",  parentCode: "CLINICAL"  },
    { departmentCode: "ER",        departmentName: "Emergency Room",         parentCode: "CLINICAL"  },
    { departmentCode: "ICU",       departmentName: "Intensive Care Unit",    parentCode: "CLINICAL"  },
    { departmentCode: "OT",        departmentName: "Operating Theatre",      parentCode: "CLINICAL"  },
    { departmentCode: "ADMIN",     departmentName: "Administration",         parentCode: "CORP"      },
    { departmentCode: "FIN",       departmentName: "Finance & Accounting",   parentCode: "ADMIN"     },
    { departmentCode: "HR",        departmentName: "Human Resources",        parentCode: "ADMIN"     },
    { departmentCode: "IT",        departmentName: "Information Technology", parentCode: "ADMIN"     },
    { departmentCode: "ANCILLARY", departmentName: "Ancillary Services",     parentCode: "CORP"      },
    { departmentCode: "LAB",       departmentName: "Laboratory",             parentCode: "ANCILLARY" },
    { departmentCode: "RADIOLOGY", departmentName: "Radiology",              parentCode: "ANCILLARY" },
    { departmentCode: "PHARMACY",  departmentName: "Pharmacy",               parentCode: "ANCILLARY" },
  ];
  const deptMap = new Map<string, string>();
  for (const dept of departments) {
    const parentId = dept.parentCode ? deptMap.get(dept.parentCode) ?? null : null;
    const r = await prisma.department.upsert({
      where:  { tenantId_departmentCode: { tenantId: tenant.id, departmentCode: dept.departmentCode } },
      update: {},
      create: { departmentCode: dept.departmentCode, departmentName: dept.departmentName, parentId, tenantId: tenant.id },
    });
    deptMap.set(dept.departmentCode, r.id);
  }
  console.log(`✅ Departments: ${departments.length} created`);

  // ── Cost Centers ──────────────────────────────────────────────────────────
  type CCSeed = { costCenterCode: string; costCenterName: string; parentCode: string | null };
  const costCenters: CCSeed[] = [
    { costCenterCode: "CC-0000", costCenterName: "Corporate Overhead",        parentCode: null       },
    { costCenterCode: "CC-1000", costCenterName: "Clinical Cost Centers",     parentCode: "CC-0000"  },
    { costCenterCode: "CC-1100", costCenterName: "Inpatient Services",        parentCode: "CC-1000"  },
    { costCenterCode: "CC-1200", costCenterName: "Outpatient Services",       parentCode: "CC-1000"  },
    { costCenterCode: "CC-1300", costCenterName: "Emergency Services",        parentCode: "CC-1000"  },
    { costCenterCode: "CC-2000", costCenterName: "Administrative Cost Ctrs",  parentCode: "CC-0000"  },
    { costCenterCode: "CC-2100", costCenterName: "Finance Department",        parentCode: "CC-2000"  },
    { costCenterCode: "CC-2200", costCenterName: "HR Department",             parentCode: "CC-2000"  },
    { costCenterCode: "CC-3000", costCenterName: "Ancillary Cost Centers",    parentCode: "CC-0000"  },
    { costCenterCode: "CC-3100", costCenterName: "Laboratory Services",       parentCode: "CC-3000"  },
    { costCenterCode: "CC-3200", costCenterName: "Radiology Services",        parentCode: "CC-3000"  },
  ];
  const ccMap = new Map<string, string>();
  for (const cc of costCenters) {
    const parentId = cc.parentCode ? ccMap.get(cc.parentCode) ?? null : null;
    const r = await prisma.costCenter.upsert({
      where:  { tenantId_costCenterCode: { tenantId: tenant.id, costCenterCode: cc.costCenterCode } },
      update: {},
      create: { costCenterCode: cc.costCenterCode, costCenterName: cc.costCenterName, parentId, tenantId: tenant.id },
    });
    ccMap.set(cc.costCenterCode, r.id);
  }
  console.log(`✅ Cost Centers: ${costCenters.length} created`);

  // ── Currencies ────────────────────────────────────────────────────────────
  for (const cur of CURRENCIES) {
    await prisma.currency.upsert({
      where:  { tenantId_code: { tenantId: tenant.id, code: cur.code } },
      update: { exchangeRate: cur.rateToINR },
      create: {
        code: cur.code, name: cur.name, symbol: cur.symbol,
        exchangeRate: cur.rateToINR, isBase: cur.isBase ?? false,
        isActive: true, tenantId: tenant.id,
      },
    });
  }
  console.log(`✅ Currencies: ${CURRENCIES.length} loaded`);

  // ── FX Rates (all currencies → INR, effective 2026-05-01) ─────────────────
  const effectiveDate = new Date("2026-05-01");
  let fxCount = 0;
  for (const cur of CURRENCIES.filter((c) => c.code !== "INR")) {
    await prisma.fxRate.upsert({
      where: {
        tenantId_fromCurrency_toCurrency_effectiveDate: {
          tenantId: tenant.id, fromCurrency: cur.code, toCurrency: "INR", effectiveDate,
        },
      },
      update: { rate: cur.rateToINR },
      create: { tenantId: tenant.id, fromCurrency: cur.code, toCurrency: "INR", rate: cur.rateToINR, effectiveDate, source: "MARKET", isActive: true },
    });
    await prisma.fxRate.upsert({
      where: {
        tenantId_fromCurrency_toCurrency_effectiveDate: {
          tenantId: tenant.id, fromCurrency: "INR", toCurrency: cur.code, effectiveDate,
        },
      },
      update: { rate: +(1 / cur.rateToINR).toFixed(8) },
      create: { tenantId: tenant.id, fromCurrency: "INR", toCurrency: cur.code, rate: +(1 / cur.rateToINR).toFixed(8), effectiveDate, source: "MARKET", isActive: true },
    });
    fxCount += 2;
  }
  console.log(`✅ FX Rates: ${fxCount} pairs seeded (to/from INR @ 2026-05-01)`);

  // ── Time Dimension — 2025 and 2026 OneStream hierarchy ─────────────────────
  for (const year of [2025, 2026]) {
    const timePeriods = buildTimeHierarchy(year);
    const timeCodeToId = new Map<string, string>();
    for (const tp of timePeriods) {
      const parentId = tp.parentCode ? timeCodeToId.get(tp.parentCode) ?? null : null;
      const r = await prisma.timePoint.upsert({
        where:  { tenantId_code: { tenantId: tenant.id, code: tp.code } },
        update: {},
        create: {
          code: tp.code, name: tp.name, periodType: tp.periodType,
          fiscalYear: tp.fiscalYear, fiscalPeriod: tp.fiscalPeriod ?? null,
          startDate: tp.startDate, endDate: tp.endDate,
          parentId, sortOrder: tp.sortOrder, isActive: true, tenantId: tenant.id,
        },
      });
      timeCodeToId.set(tp.code, r.id);
    }
    console.log(`✅ Time ${year}: ${timePeriods.length} periods (Year → HY → Q → Month)`);
  }

  // ── Scenarios ─────────────────────────────────────────────────────────────
  const scenarios = [
    { scenarioCode: "ACTUAL",    scenarioName: "Actual",           scenarioType: "ACTUAL",   fiscalYear: 2026 },
    { scenarioCode: "BUDGET26",  scenarioName: "Budget 2026",      scenarioType: "BUDGET",   fiscalYear: 2026 },
    { scenarioCode: "FCST26Q2",  scenarioName: "Forecast 2026 Q2", scenarioType: "FORECAST", fiscalYear: 2026 },
    { scenarioCode: "ACTUAL25",  scenarioName: "Actual 2025",      scenarioType: "ACTUAL",   fiscalYear: 2025 },
    { scenarioCode: "BUDGET25",  scenarioName: "Budget 2025",      scenarioType: "BUDGET",   fiscalYear: 2025 },
  ];
  for (const sc of scenarios) {
    await prisma.scenario.upsert({
      where:  { tenantId_scenarioCode: { tenantId: tenant.id, scenarioCode: sc.scenarioCode } },
      update: {},
      create: { ...sc, tenantId: tenant.id, isActive: true },
    });
  }
  console.log(`✅ Scenarios: ${scenarios.length} created`);

  // ── Tenant Settings ───────────────────────────────────────────────────────
  await prisma.tenantSettings.upsert({
    where:  { tenantId: tenant.id },
    update: {},
    create: {
      tenantId:          tenant.id,
      appName:           "CFO Pilot — Demo",
      reportingCurrency: "INR",
      fiscalYearStart:   4,              // April (Indian FY)
      dateFormat:        "DD-MM-YYYY",
      numberFormat:      "1,23,456.78", // Indian notation
      timezone:          "Asia/Kolkata",
      primaryColor:      "#6366f1",
      isSetupComplete:   true,
    },
  });
  console.log("✅ Tenant Settings: configured (INR reporting, April FY start)");

  console.log("\n✨ Seed complete!");
  console.log("\n🔑 Login credentials:");
  users.forEach((u) => console.log(`   ${u.role}: ${u.email} / ${u.password}`));
}

main()
  .catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
