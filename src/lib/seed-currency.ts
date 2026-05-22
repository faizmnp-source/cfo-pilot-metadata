// Currency dimension seeding — OneStream-style currency context.
//
// Every tenant gets THREE system currency members on first Currency access:
//   - 'Local'     — semantic placeholder; resolved at save/read to each
//                   Entity's base_currency (e.g. IN_HQ → INR, US_HQ → USD).
//                   Used by default for leaf-entity input.
//   - 'Reporting' — semantic placeholder; resolves to the tenant's base
//                   currency. Used by default for parent/rollup views and
//                   single-currency apps.
//   - Tenant base (USD by default) — the actual ISO 4217 currency the tenant
//                   reports in. is_base=true. Reporting points at this.
//
// Admins can add more ISO currencies (INR, EUR, ...) via the Library — those
// get is_local=false, is_reporting=false. Tenants can flip is_base to another
// currency.

import { prisma } from "./prisma";
import { ensureDimension } from "./ensure-dimension";

export const LOCAL_CURRENCY_CODE     = "Local";
export const REPORTING_CURRENCY_CODE = "Reporting";

type SeedSpec = {
  code:        string;
  name:        string;
  description: string;
  properties:  Record<string, any>;
  sortOrder:   number;
};

function seedSpecs(baseIso: string = "USD"): SeedSpec[] {
  return [
    { code: LOCAL_CURRENCY_CODE,     name: "Local",      description: "Each entity's own base currency. Resolved at read time.", properties: { is_local: true, is_system: true }, sortOrder: 0 },
    { code: REPORTING_CURRENCY_CODE, name: "Reporting",  description: "Tenant reporting currency. Resolves to the is_base=true ISO currency.", properties: { is_reporting: true, is_system: true }, sortOrder: 1 },
    { code: baseIso,                 name: "US Dollar",  description: "Tenant base currency. Rename or flip is_base in the Library.", properties: { iso_code: baseIso, is_base: true }, sortOrder: 2 },
  ];
}

/**
 * Idempotently seed Local / Reporting / base currency members for a tenant.
 * Returns the dimension_member.id of the requested code (defaults to base).
 */
export async function ensureCurrencySeed(
  tenantId: string,
  userId:   string,
  pickCode: string = REPORTING_CURRENCY_CODE,
): Promise<string> {
  const dim = await ensureDimension(tenantId, "CURRENCY" as any);
  const specs = seedSpecs();

  const existing = await prisma.dimensionMember.findMany({
    where: {
      tenantId, dimensionId: dim.id,
      memberCode: { in: specs.map(s => s.code) },
    },
    select: { id: true, memberCode: true },
  });
  const haveCodes = new Set(existing.map(m => m.memberCode));
  const idByCode  = new Map(existing.map(m => [m.memberCode, m.id]));

  for (const s of specs) {
    if (haveCodes.has(s.code)) continue;
    const created = await prisma.dimensionMember.create({
      data: {
        tenantId, dimensionId: dim.id,
        memberCode: s.code, memberName: s.name, description: s.description,
        isActive: true, sortOrder: s.sortOrder,
        properties: s.properties as any,
        createdBy: userId, updatedBy: userId,
      },
      select: { id: true },
    });
    idByCode.set(s.code, created.id);
  }

  // Caller asks for a specific code — return it, else fall back to base.
  const picked = idByCode.get(pickCode);
  if (picked) return picked;
  const baseId = idByCode.get("USD");
  if (baseId) return baseId;
  // Last resort — return any active currency member
  const anyActive = await prisma.dimensionMember.findFirst({
    where: { tenantId, dimensionId: dim.id, isActive: true },
    select: { id: true },
  });
  return anyActive!.id;
}

/** Returns the tenant's reporting currency member id. */
export async function ensureBaseCurrencyMember(
  tenantId: string,
  userId:   string,
): Promise<string> {
  return ensureCurrencySeed(tenantId, userId, REPORTING_CURRENCY_CODE);
}
