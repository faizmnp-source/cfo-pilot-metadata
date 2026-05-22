// v2 seed — minimal bootstrap for the metadata engine.
// Run: `node prisma/seed-v2.mjs`
//
// Creates:
//   • Tenant 'CFO Pilot Demo' (slug: cfopilot)
//   • Admin user admin@cfopilot.com / admin123
//   • The 5 always-on Dimension rows (Account, Entity, Scenario, Time, Currency)
//   • A default feature flag set (department on, others off)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TENANT_ID = "a1b2c3d4-0000-0000-0000-000000000001";

// bcrypt('admin123', 10) — pre-computed so we don't need to import bcrypt
const ADMIN_HASH = "$2a$10$I.VRZOP2XIVBxjtcsbjpLu8TWL0hgUNz2/Df0vtYnpW9qkNG001pG";

const CORE_DIMS = [
  { kind: "ACCOUNT",  code: "account",  label: "Account" },
  { kind: "ENTITY",   code: "entity",   label: "Entity" },
  { kind: "SCENARIO", code: "scenario", label: "Scenario" },
  { kind: "TIME",     code: "time",     label: "Time Period" },
  { kind: "CURRENCY", code: "currency", label: "Currency" },
];

const DEFAULT_FEATURES = [
  { featureKey: "multi_entity_enabled",        isEnabled: false },
  { featureKey: "multi_currency_enabled",      isEnabled: false },
  { featureKey: "intercompany_enabled",        isEnabled: false },
  { featureKey: "alternate_hierarchy_enabled", isEnabled: true  },
  { featureKey: "department_enabled",          isEnabled: true  },
  { featureKey: "cost_center_enabled",         isEnabled: false },
  { featureKey: "project_enabled",             isEnabled: false },
];

async function main() {
  console.log("=== v2 seed ===");

  // 1) Tenant
  const tenant = await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: { isActive: true, name: "CFO Pilot Demo", slug: "cfopilot" },
    create: { id: TENANT_ID, name: "CFO Pilot Demo", slug: "cfopilot", isActive: true },
  });
  console.log("✅ tenant:", tenant.id);

  // 2) Admin user (upsert by email within tenant)
  const existing = await prisma.user.findFirst({
    where: { email: "admin@cfopilot.com", tenantId: tenant.id },
  });
  let admin;
  if (existing) {
    admin = await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: ADMIN_HASH, isActive: true, role: "ADMIN" },
    });
    console.log("✅ admin user (updated):", admin.email);
  } else {
    admin = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: "admin@cfopilot.com",
        name: "Admin User",
        passwordHash: ADMIN_HASH,
        role: "ADMIN",
        isActive: true,
      },
    });
    console.log("✅ admin user (created):", admin.email);
  }

  // 3) Core dimensions
  for (const d of CORE_DIMS) {
    await prisma.dimension.upsert({
      where: { tenantId_kind: { tenantId: tenant.id, kind: d.kind } },
      update: { label: d.label, isEnabled: true },
      create: {
        tenantId: tenant.id,
        kind: d.kind,
        code: d.code,
        label: d.label,
        isEnabled: true,
        isCustom: false,
      },
    });
    console.log("✅ dimension:", d.kind);
  }

  // 4) Feature flags
  for (const f of DEFAULT_FEATURES) {
    await prisma.tenantFeature.upsert({
      where: { tenantId_featureKey: { tenantId: tenant.id, featureKey: f.featureKey } },
      update: { isEnabled: f.isEnabled },
      create: { tenantId: tenant.id, featureKey: f.featureKey, isEnabled: f.isEnabled,
                enabledAt: f.isEnabled ? new Date() : null, enabledBy: admin.id },
    });
    console.log("✅ feature:", f.featureKey, "=", f.isEnabled);
  }

  console.log("");
  console.log("================================================");
  console.log("  DONE.  Login: admin@cfopilot.com / admin123");
  console.log("================================================");
}

main()
  .catch((e) => { console.error("❌ seed failed:", e); process.exit(1); })
  .finally(async () => prisma.$disconnect());
