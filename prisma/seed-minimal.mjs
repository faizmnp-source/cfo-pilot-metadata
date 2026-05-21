import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding minimal data...');

  // Upsert tenant
  const tenant = await prisma.tenant.upsert({
    where: { id: 'a1b2c3d4-0000-0000-0000-000000000001' },
    update: { isActive: true },
    create: {
      id: 'a1b2c3d4-0000-0000-0000-000000000001',
      name: 'CFO Pilot Demo',
      slug: 'cfopilot',
      plan: 'ENTERPRISE',
      isActive: true,
    },
  });
  console.log('Tenant OK:', tenant.id);

  // Upsert admin user — always ensure hash matches 'admin123'
  // Hash: bcrypt('admin123', 10)
  const ADMIN_HASH = '$2a$10$I.VRZOP2XIVBxjtcsbjpLu8TWL0hgUNz2/Df0vtYnpW9qkNG001pG';

  const existing = await prisma.user.findFirst({
    where: { email: 'admin@cfopilot.com', tenantId: tenant.id }
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: ADMIN_HASH, isActive: true },
    });
    console.log('User updated (hash synced):', existing.email);
  } else {
    const user = await prisma.user.create({
      data: {
        email: 'admin@cfopilot.com',
        name: 'Admin User',
        passwordHash: ADMIN_HASH,
        role: 'ADMIN',
        tenantId: tenant.id,
        isActive: true,
      },
    });
    console.log('User created:', user.email, '- role:', user.role);
  }

  // Verify
  const count = await prisma.user.count();
  const tenantCount = await prisma.tenant.count();
  console.log('Total users:', count, '| Total tenants:', tenantCount);
  console.log('Done!');
}

main()
  .catch(e => { console.error('SEED ERROR:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
