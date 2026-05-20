/**
 * Prisma seed script — creates demo data for the CFO Pilot Metadata Module.
 * Run: npx prisma db seed
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ── Tenant ────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      id: "tenant-demo-001",
      name: "Demo Hospital Group",
      slug: "demo",
      plan: "PROFESSIONAL",
    },
  });
  console.log(`✅ Tenant: ${tenant.name}`);

  // ── Users ─────────────────────────────────────────────────────────────────
  const users = [
    { email: "admin@cfopilot.com", name: "Admin User", role: "ADMIN", password: "admin123" },
    { email: "manager@cfopilot.com", name: "Finance Manager", role: "FINANCE_MANAGER", password: "manager123" },
    { email: "user@cfopilot.com", name: "Finance User", role: "FINANCE_USER", password: "user123" },
    { email: "viewer@cfopilot.com", name: "Read Only Viewer", role: "VIEWER", password: "viewer123" },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        passwordHash: hash,
        role: u.role as any,
        tenantId: tenant.id,
        isActive: true,
      },
    });
  }
  console.log(`✅ Users: ${users.length} created`);

  // ── Chart of Accounts (hospital-specific) ─────────────────────────────────
  const accounts = [
    // Assets
    { code: "1000", name: "Assets", type: "ASSET", parentCode: null, reportingGroup: "Balance Sheet" },
    { code: "1100", name: "Current Assets", type: "ASSET", parentCode: "1000", reportingGroup: "Balance Sheet" },
    { code: "1110", name: "Cash and Cash Equivalents", type: "ASSET", parentCode: "1100", reportingGroup: "Current Assets" },
    { code: "1120", name: "Accounts Receivable - Patients", type: "ASSET", parentCode: "1100", reportingGroup: "Current Assets" },
    { code: "1130", name: "Medical Supplies Inventory", type: "ASSET", parentCode: "1100", reportingGroup: "Current Assets" },
    { code: "1200", name: "Non-Current Assets", type: "ASSET", parentCode: "1000", reportingGroup: "Balance Sheet" },
    { code: "1210", name: "Medical Equipment", type: "ASSET", parentCode: "1200", reportingGroup: "Fixed Assets" },
    { code: "1220", name: "Buildings and Facilities", type: "ASSET", parentCode: "1200", reportingGroup: "Fixed Assets" },
    // Liabilities
    { code: "2000", name: "Liabilities", type: "LIABILITY", parentCode: null, reportingGroup: "Balance Sheet" },
    { code: "2100", name: "Current Liabilities", type: "LIABILITY", parentCode: "2000", reportingGroup: "Balance Sheet" },
    { code: "2110", name: "Accounts Payable - Medical Suppliers", type: "LIABILITY", parentCode: "2100", reportingGroup: "Current Liabilities" },
    { code: "2120", name: "Accrued Staff Salaries", type: "LIABILITY", parentCode: "2100", reportingGroup: "Current Liabilities" },
    // Equity
    { code: "3000", name: "Equity", type: "EQUITY", parentCode: null, reportingGroup: "Balance Sheet" },
    { code: "3100", name: "Retained Earnings", type: "EQUITY", parentCode: "3000", reportingGroup: "Equity" },
    // Revenue
    { code: "4000", name: "Revenue", type: "REVENUE", parentCode: null, reportingGroup: "Income Statement" },
    { code: "4100", name: "Inpatient Revenue", type: "REVENUE", parentCode: "4000", reportingGroup: "Clinical Revenue" },
    { code: "4200", name: "Outpatient Revenue", type: "REVENUE", parentCode: "4000", reportingGroup: "Clinical Revenue" },
    { code: "4300", name: "Emergency Revenue", type: "REVENUE", parentCode: "4000", reportingGroup: "Clinical Revenue" },
    { code: "4400", name: "Ancillary Services Revenue", type: "REVENUE", parentCode: "4000", reportingGroup: "Clinical Revenue" },
    { code: "4500", name: "Non-Clinical Revenue", type: "REVENUE", parentCode: "4000", reportingGroup: "Other Revenue" },
    // Expenses
    { code: "5000", name: "Expenses", type: "EXPENSE", parentCode: null, reportingGroup: "Income Statement" },
    { code: "5100", name: "Salaries and Benefits", type: "EXPENSE", parentCode: "5000", reportingGroup: "Staff Costs" },
    { code: "5110", name: "Physician Salaries", type: "EXPENSE", parentCode: "5100", reportingGroup: "Staff Costs" },
    { code: "5120", name: "Nursing Staff Salaries", type: "EXPENSE", parentCode: "5100", reportingGroup: "Staff Costs" },
    { code: "5130", name: "Administrative Staff", type: "EXPENSE", parentCode: "5100", reportingGroup: "Staff Costs" },
    { code: "5200", name: "Medical Supplies", type: "EXPENSE", parentCode: "5000", reportingGroup: "Clinical Expenses" },
    { code: "5300", name: "Facility Costs", type: "EXPENSE", parentCode: "5000", reportingGroup: "Overhead" },
    { code: "5400", name: "Technology and IT", type: "EXPENSE", parentCode: "5000", reportingGroup: "Overhead" },
  ];

  // Build parent map
  const codeToId = new Map<string, string>();
  // First pass: create root accounts
  for (const acc of accounts.filter((a) => !a.parentCode)) {
    const created = await prisma.account.upsert({
      where: { code_tenantId: { code: acc.code, tenantId: tenant.id } },
      update: {},
      create: {
        code: acc.code,
        name: acc.name,
        type: acc.type as any,
        reportingGroup: acc.reportingGroup,
        tenantId: tenant.id,
      },
    });
    codeToId.set(acc.code, created.id);
  }

  // Second pass: create children
  for (const acc of accounts.filter((a) => a.parentCode)) {
    const parentId = codeToId.get(acc.parentCode!) ?? null;
    const created = await prisma.account.upsert({
      where: { code_tenantId: { code: acc.code, tenantId: tenant.id } },
      update: {},
      create: {
        code: acc.code,
        name: acc.name,
        type: acc.type as any,
        reportingGroup: acc.reportingGroup,
        parentId,
        tenantId: tenant.id,
      },
    });
    codeToId.set(acc.code, created.id);
  }
  console.log(`✅ Accounts: ${accounts.length} created`);

  // ── Entities ──────────────────────────────────────────────────────────────
  const entities = [
    { code: "GROUP", name: "Hospital Group HQ", legalName: "Demo Hospital Group Co., Ltd.", country: "TH", currency: "THB", parentCode: null },
    { code: "TH-HQ", name: "Thailand Main Hospital", legalName: "Demo Hospital Thailand Ltd.", country: "TH", currency: "THB", parentCode: "GROUP" },
    { code: "TH-BKK", name: "Bangkok Branch", country: "TH", currency: "THB", parentCode: "TH-HQ" },
    { code: "TH-CNX", name: "Chiang Mai Branch", country: "TH", currency: "THB", parentCode: "TH-HQ" },
    { code: "SG-HQ", name: "Singapore Clinic", country: "SG", currency: "SGD", parentCode: "GROUP" },
  ];

  const entityCodeToId = new Map<string, string>();
  for (const ent of entities) {
    const parentId = ent.parentCode ? entityCodeToId.get(ent.parentCode) ?? null : null;
    const created = await prisma.entity.upsert({
      where: { code_tenantId: { code: ent.code, tenantId: tenant.id } },
      update: {},
      create: {
        code: ent.code,
        name: ent.name,
        legalName: ent.legalName ?? null,
        country: ent.country ?? null,
        currency: ent.currency ?? null,
        parentId,
        tenantId: tenant.id,
      },
    });
    entityCodeToId.set(ent.code, created.id);
  }
  console.log(`✅ Entities: ${entities.length} created`);

  // ── Departments ───────────────────────────────────────────────────────────
  const departments = [
    { code: "CORP", name: "Corporate", parentCode: null },
    { code: "CLINICAL", name: "Clinical Operations", parentCode: "CORP" },
    { code: "IPD", name: "Inpatient Department", parentCode: "CLINICAL" },
    { code: "OPD", name: "Outpatient Department", parentCode: "CLINICAL" },
    { code: "ER", name: "Emergency Room", parentCode: "CLINICAL" },
    { code: "ICU", name: "Intensive Care Unit", parentCode: "CLINICAL" },
    { code: "OT", name: "Operating Theatre", parentCode: "CLINICAL" },
    { code: "ADMIN", name: "Administration", parentCode: "CORP" },
    { code: "FIN", name: "Finance & Accounting", parentCode: "ADMIN" },
    { code: "HR", name: "Human Resources", parentCode: "ADMIN" },
    { code: "IT", name: "Information Technology", parentCode: "ADMIN" },
    { code: "ANCILLARY", name: "Ancillary Services", parentCode: "CORP" },
    { code: "LAB", name: "Laboratory", parentCode: "ANCILLARY" },
    { code: "RADIOLOGY", name: "Radiology", parentCode: "ANCILLARY" },
    { code: "PHARMACY", name: "Pharmacy", parentCode: "ANCILLARY" },
  ];

  const deptCodeToId = new Map<string, string>();
  for (const dept of departments) {
    const parentId = dept.parentCode ? deptCodeToId.get(dept.parentCode) ?? null : null;
    const created = await prisma.department.upsert({
      where: { code_tenantId: { code: dept.code, tenantId: tenant.id } },
      update: {},
      create: {
        code: dept.code,
        name: dept.name,
        parentId,
        tenantId: tenant.id,
      },
    });
    deptCodeToId.set(dept.code, created.id);
  }
  console.log(`✅ Departments: ${departments.length} created`);

  // ── Cost Centers ──────────────────────────────────────────────────────────
  const costCenters = [
    { code: "CC-0000", name: "Corporate Overhead", parentCode: null },
    { code: "CC-1000", name: "Clinical Cost Centers", parentCode: "CC-0000" },
    { code: "CC-1100", name: "Inpatient Services", parentCode: "CC-1000" },
    { code: "CC-1200", name: "Outpatient Services", parentCode: "CC-1000" },
    { code: "CC-1300", name: "Emergency Services", parentCode: "CC-1000" },
    { code: "CC-2000", name: "Administrative Cost Centers", parentCode: "CC-0000" },
    { code: "CC-2100", name: "Finance Department", parentCode: "CC-2000" },
    { code: "CC-2200", name: "HR Department", parentCode: "CC-2000" },
    { code: "CC-3000", name: "Ancillary Cost Centers", parentCode: "CC-0000" },
    { code: "CC-3100", name: "Laboratory Services", parentCode: "CC-3000" },
    { code: "CC-3200", name: "Radiology Services", parentCode: "CC-3000" },
  ];

  const ccCodeToId = new Map<string, string>();
  for (const cc of costCenters) {
    const parentId = cc.parentCode ? ccCodeToId.get(cc.parentCode) ?? null : null;
    const created = await prisma.costCenter.upsert({
      where: { code_tenantId: { code: cc.code, tenantId: tenant.id } },
      update: {},
      create: {
        code: cc.code,
        name: cc.name,
        parentId,
        tenantId: tenant.id,
      },
    });
    ccCodeToId.set(cc.code, created.id);
  }
  console.log(`✅ Cost Centers: ${costCenters.length} created`);

  console.log("\n✨ Seed complete!");
  console.log("\n🔑 Login credentials:");
  users.forEach((u) => console.log(`   ${u.role}: ${u.email} / ${u.password}`));
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
