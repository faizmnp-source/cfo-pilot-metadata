// Idempotently seed the Origin dimension's default member ('Import').
//
// Origin is the OneStream-style data-source dim — every fact_row carries an
// originId so we can filter by where the data came from. V1 seeds 'Import'
// only; admins extend the dim later (Form, AI, Calc, Elim, Consol,
// Translation, Allocation, Journal).
//
// Unlike sync-icp, Origin members are user-editable — we just guarantee
// 'Import' always exists. Call this from any route that GETs the Origin dim
// for the first time, plus from data-load endpoints that need a default.

import { prisma } from "./prisma";
import { ensureDimension } from "./ensure-dimension";

export const IMPORT_ORIGIN_CODE = "Import";

/**
 * Returns the dimension_member.id of the 'Import' origin row for this
 * tenant, creating it if missing. Safe to call on every data-load request.
 */
export async function ensureImportOriginMember(
  tenantId: string,
  userId: string,
): Promise<string> {
  const dim = await ensureDimension(tenantId, "ORIGIN" as any);

  const existing = await prisma.dimensionMember.findFirst({
    where: { tenantId, dimensionId: dim.id, memberCode: IMPORT_ORIGIN_CODE },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.dimensionMember.create({
    data: {
      tenantId,
      dimensionId: dim.id,
      memberCode:  IMPORT_ORIGIN_CODE,
      memberName:  "Import",
      description: "Facts loaded from an external file (TB, GL, journal export)",
      isActive:    true,
      sortOrder:   0,
      properties:  { origin_type: "IMPORT", is_system: true } as any,
      createdBy:   userId,
      updatedBy:   userId,
    },
    select: { id: true },
  });
  return created.id;
}
