// Auto-seed a base currency for a tenant.
//
// The Data Input save flow needs SOME currency to attach the fact row to.
// If the tenant hasn't configured currencies yet, we seed USD as the base
// and use it. Admins can rename/extend later via the Library.
//
// Idempotent: returns the existing base member if there is one, otherwise
// the first currency member, otherwise creates USD as is_base=true.

import { prisma } from "./prisma";
import { ensureDimension } from "./ensure-dimension";

export async function ensureBaseCurrencyMember(
  tenantId: string,
  userId:   string,
): Promise<string> {
  const dim = await ensureDimension(tenantId, "CURRENCY" as any);

  // Prefer the explicit base, then any active currency
  const explicit = await prisma.dimensionMember.findFirst({
    where: {
      tenantId, dimensionId: dim.id, isActive: true,
      properties: { path: ["is_base"], equals: true },
    },
    select: { id: true },
  });
  if (explicit) return explicit.id;

  const anyActive = await prisma.dimensionMember.findFirst({
    where: { tenantId, dimensionId: dim.id, isActive: true },
    select: { id: true },
  });
  if (anyActive) return anyActive.id;

  // None exist — seed USD as base
  const created = await prisma.dimensionMember.create({
    data: {
      tenantId,
      dimensionId: dim.id,
      memberCode:  "USD",
      memberName:  "US Dollar",
      description: "Auto-seeded base currency. Rename or extend via Library.",
      isActive:    true,
      sortOrder:   0,
      properties:  { iso_code: "USD", is_base: true } as any,
      createdBy:   userId,
      updatedBy:   userId,
    },
    select: { id: true },
  });
  return created.id;
}
