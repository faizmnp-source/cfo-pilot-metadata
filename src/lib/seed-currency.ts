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

// Only seed Local + Reporting placeholders by default. The actual ISO base
// currency is set by the tenant admin via App Settings → /api/v2/tenant-features
// `reporting_currency` flag. Previously this hardcoded USD on every seed,
// which forced multi-currency tenants to manually flip is_base on a different
// member after first use. Now: no auto-base, admin picks.
function seedSpecs(): SeedSpec[] {
  return [
    { code: LOCAL_CURRENCY_CODE,     name: "Local",      description: "Each entity's own base currency. Resolved at read time.", properties: { is_local: true, is_system: true }, sortOrder: 0 },
    { code: REPORTING_CURRENCY_CODE, name: "Reporting",  description: "Tenant reporting currency. Resolves to the is_base=true ISO currency.", properties: { is_reporting: true, is_system: true }, sortOrder: 1 },
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

  // Caller asks for a specific code — return it, else fall back to whatever
  // is flagged is_base=true (admin-picked base), else any active currency.
  const picked = idByCode.get(pickCode);
  if (picked) return picked;
  const baseMember = await prisma.dimensionMember.findFirst({
    where: {
      tenantId, dimensionId: dim.id, isActive: true,
      properties: { path: ["is_base"], equals: true } as any,
    },
    select: { id: true },
  });
  if (baseMember) return baseMember.id;
  // Last resort — return any active currency member
  const anyActive = await prisma.dimensionMember.findFirst({
    where: { tenantId, dimensionId: dim.id, isActive: true },
    select: { id: true },
  });
  if (!anyActive) {
    throw new Error("No currency configured. Admin: set Reporting Currency in App Settings.");
  }
  return anyActive.id;
}

/** Returns the tenant's reporting currency member id. */
export async function ensureBaseCurrencyMember(
  tenantId: string,
  userId:   string,
): Promise<string> {
  return ensureCurrencySeed(tenantId, userId, REPORTING_CURRENCY_CODE);
}

/**
 * Resolve a "semantic" currency pick (Local / Reporting) to a concrete ISO
 * currency member id for fact storage + filtering.
 *
 *   Local      → entity.properties.base_currency (e.g. "INR" → INR member id)
 *   Reporting  → the tenant's is_base=true currency member
 *   Anything else (an actual ISO member) is returned unchanged.
 *
 * Why this exists: facts are stored at a concrete currency (USD, INR, EUR).
 * Local / Reporting are POV conveniences — they have their own
 * DimensionMember rows so the POV dropdown can show them, but no FactRow is
 * ever stored against those ids. Without this resolution, a user who picks
 * "Local" in the POV would filter facts by Local's UUID and see zero rows.
 *
 * Returns null if resolution failed (e.g. Local picked but entity has no
 * base_currency, or no matching ISO member exists). Callers should treat
 * null as "skip the currency filter" rather than "no data".
 */
export async function resolveSemanticCurrency(
  tenantId:   string,
  currencyId: string,
  entityId:   string | null,
): Promise<string | null> {
  const member = await prisma.dimensionMember.findFirst({
    where: { tenantId, id: currencyId },
    select: { id: true, properties: true, dimensionId: true },
  });
  if (!member) return null;

  const props = (member.properties as any) ?? {};
  // Already a concrete ISO currency — nothing to resolve.
  if (!props.is_local && !props.is_reporting) return currencyId;

  // Reporting → tenant base (is_base=true ISO member)
  if (props.is_reporting) {
    const base = await prisma.dimensionMember.findFirst({
      where: {
        tenantId,
        dimensionId: member.dimensionId,
        isActive: true,
        properties: { path: ["is_base"], equals: true } as any,
      },
      select: { id: true },
    });
    return base?.id ?? null;
  }

  // Local → entity.base_currency
  if (props.is_local) {
    if (!entityId) return null;
    const entity = await prisma.dimensionMember.findFirst({
      where: { tenantId, id: entityId },
      select: { properties: true },
    });
    const iso = (entity?.properties as any)?.base_currency;
    if (!iso || typeof iso !== "string") return null;

    const isoMember = await prisma.dimensionMember.findFirst({
      where: {
        tenantId,
        dimensionId: member.dimensionId,
        isActive: true,
        properties: { path: ["iso_code"], equals: iso } as any,
      },
      select: { id: true },
    });
    return isoMember?.id ?? null;
  }

  return currencyId;
}
