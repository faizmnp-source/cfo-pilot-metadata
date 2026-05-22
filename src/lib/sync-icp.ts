// Auto-derive ICP members from Entity members.
//
// Per EPM-architect call: ICP is a system-managed dimension, not user-edited.
// Whenever an Entity is created/updated with icp_enabled=true, a matching ICP
// member is upserted. When icp_enabled goes false (or the Entity is deleted),
// the ICP member is soft-deactivated.
//
// The [None] member is also seeded once per tenant. Fact-load validators
// reject rows where Account.is_icp=true AND ICP=[None] — see EntityProperties
// and AccountProperties in dim-schemas.ts.
//
// All writes are wrapped in try/catch by callers; ICP sync failures NEVER
// block the underlying Entity write — the worst case is a stale ICP member
// that we'll heal on the next entity update.

import { prisma } from "./prisma";
import { ensureDimension } from "./ensure-dimension";

const NONE_CODE = "None";

/**
 * Idempotently seed the [None] member in the ICP dimension for a tenant.
 * Safe to call repeatedly — no-op if it already exists.
 */
export async function ensureIcpSeed(tenantId: string, userId: string): Promise<void> {
  const icpDim = await ensureDimension(tenantId, "ICP" as any);

  const noneExists = await prisma.dimensionMember.findFirst({
    where: { tenantId, dimensionId: icpDim.id, memberCode: NONE_CODE },
    select: { id: true },
  });
  if (noneExists) return;

  await prisma.dimensionMember.create({
    data: {
      tenantId,
      dimensionId: icpDim.id,
      memberCode:  NONE_CODE,
      memberName:  "[None]",
      description: "Placeholder for facts with no intercompany partner",
      isActive:    true,
      sortOrder:   0,
      // No entity_id — this is the system fallback row. IcpPropertiesSchema
      // permits entity_id to be omitted (see dim-schemas.ts).
      properties:  { is_system: true } as any,
      createdBy:   userId,
      updatedBy:   userId,
    },
  });
}

type EntityMemberLite = {
  id:         string;
  memberCode: string;
  memberName: string;
  properties: Record<string, any> | null;
};

/**
 * Sync an ICP member to match the state of an Entity member.
 *
 * - On create/update with icp_enabled=true → upsert ICP_<entityCode>
 * - On create/update with icp_enabled=false → deactivate matching ICP member
 * - On delete                              → deactivate matching ICP member
 *
 * The ICP member's properties.entity_id always points back to the Entity row
 * — so we can rename / re-find the ICP member even if the Entity's code
 * changes later (we look up by entity_id, not by code).
 */
export async function syncIcpFromEntity(args: {
  tenantId: string;
  userId:   string;
  entity:   EntityMemberLite;
  op:       "create" | "update" | "delete";
}): Promise<void> {
  const { tenantId, userId, entity, op } = args;
  const icpDim = await ensureDimension(tenantId, "ICP" as any);

  // Always make sure [None] exists — cheap, idempotent
  await ensureIcpSeed(tenantId, userId);

  // Find existing ICP member that references this entity
  const allIcps = await prisma.dimensionMember.findMany({
    where: { tenantId, dimensionId: icpDim.id },
    select: { id: true, memberCode: true, properties: true, isActive: true },
  });
  const existing = allIcps.find((m) => {
    const p = (m.properties as any) ?? {};
    return p.entity_id === entity.id;
  });

  const icpEnabled = Boolean(entity.properties?.icp_enabled);

  // ── Case 1: entity deleted OR icp_enabled toggled off → deactivate ──
  if (op === "delete" || !icpEnabled) {
    if (existing && existing.isActive) {
      await prisma.dimensionMember.update({
        where: { id: existing.id },
        data:  { isActive: false, updatedBy: userId },
      });
    }
    return;
  }

  // ── Case 2: icp_enabled=true → upsert ──
  const targetCode = `ICP_${entity.memberCode}`;
  const targetName = `ICP — ${entity.memberName}`;
  const targetProps = {
    entity_id:        entity.id,
    source_entity:    entity.memberCode,
    auto_derived:     true,
  };

  if (existing) {
    // Update (re-activate if previously deactivated; re-sync code/name)
    await prisma.dimensionMember.update({
      where: { id: existing.id },
      data: {
        memberCode: targetCode,
        memberName: targetName,
        isActive:   true,
        properties: targetProps as any,
        updatedBy:  userId,
      },
    });
    return;
  }

  // No existing → create. Guard against memberCode collision (some other
  // ICP row already has the same code, e.g. from a previous re-key).
  const codeClash = allIcps.find((m) => m.memberCode === targetCode);
  if (codeClash) {
    await prisma.dimensionMember.update({
      where: { id: codeClash.id },
      data: {
        memberName: targetName,
        isActive:   true,
        properties: targetProps as any,
        updatedBy:  userId,
      },
    });
    return;
  }

  await prisma.dimensionMember.create({
    data: {
      tenantId,
      dimensionId: icpDim.id,
      memberCode:  targetCode,
      memberName:  targetName,
      isActive:    true,
      sortOrder:   100,  // System rows sort below [None] (sortOrder=0)
      properties:  targetProps as any,
      createdBy:   userId,
      updatedBy:   userId,
    },
  });
}
