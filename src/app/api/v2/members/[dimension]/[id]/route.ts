// Single-member read / update / soft-delete for any dimension.
// Slice 1.1 of the Metadata Engine implementation plan.
//
// URL shape:
//   GET    /api/v2/members/account/<uuid>
//   PUT    /api/v2/members/account/<uuid>   { partial fields }
//   DELETE /api/v2/members/account/<uuid>?hard=false   (default soft)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse as apiSuccess } from "@/lib/utils";
import { audit } from "@/lib/audit-v2";
import {
  UpdateMemberInputByDim,
  resolveDimKind,
} from "@/lib/dim-schemas";
import { syncIcpFromEntity } from "@/lib/sync-icp";

// ─── GET ─────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  ctx: { params: { dimension: string; id: string } }
) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const kind = resolveDimKind(ctx.params.dimension);
  if (!kind) return apiError(`Unknown dimension: ${ctx.params.dimension}`, 400);

  const member = await prisma.dimensionMember.findFirst({
    where: { id: ctx.params.id, tenantId: auth.tid },
    include: { dimension: { select: { kind: true, code: true, label: true } } },
  });
  if (!member) return apiError("Not found", 404);
  if (member.dimension.kind !== kind) {
    return apiError("Member does not belong to this dimension", 400);
  }

  return apiSuccess(member);
}

// ─── PUT (update) ────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  ctx: { params: { dimension: string; id: string } }
) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const kind = resolveDimKind(ctx.params.dimension);
  if (!kind) return apiError(`Unknown dimension: ${ctx.params.dimension}`, 400);

  // ICP is system-managed (derived from Entity.icp_enabled).
  if (kind === "ICP") {
    return apiError(
      "ICP members are system-managed. Toggle icp_enabled on the source Entity instead.",
      409,
    );
  }

  const existing = await prisma.dimensionMember.findFirst({
    where: { id: ctx.params.id, tenantId: auth.tid },
    include: { dimension: { select: { kind: true } } },
  });
  if (!existing) return apiError("Not found", 404);
  if (existing.dimension.kind !== kind) {
    return apiError("Member does not belong to this dimension", 400);
  }

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const schema = UpdateMemberInputByDim[kind];
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiError("Validation failed", 422, { issues: parsed.error.issues });
  }
  const input = parsed.data as any;

  // If memberCode is changing, ensure uniqueness
  if (input.memberCode && input.memberCode !== existing.memberCode) {
    const duplicate = await prisma.dimensionMember.findFirst({
      where: {
        tenantId: auth.tid,
        dimensionId: existing.dimensionId,
        memberCode: input.memberCode,
        NOT: { id: existing.id },
      },
      select: { id: true },
    });
    if (duplicate) {
      return apiError(`Member code '${input.memberCode}' already exists in this dimension`, 409);
    }
  }

  // Merge `properties` rather than overwrite — partial PUT semantics
  const mergedProperties =
    input.properties !== undefined
      ? { ...(existing.properties as Record<string, unknown> ?? {}), ...input.properties }
      : existing.properties;

  const updated = await prisma.dimensionMember.update({
    where: { id: existing.id },
    data: {
      memberCode:      input.memberCode ?? existing.memberCode,
      memberName:      input.memberName ?? existing.memberName,
      description:     input.description !== undefined ? input.description : existing.description,
      isActive:        input.isActive ?? existing.isActive,
      sortOrder:       input.sortOrder ?? existing.sortOrder,
      storageType:     input.storageType !== undefined ? input.storageType : existing.storageType,
      calculationType: input.calculationType !== undefined ? input.calculationType : existing.calculationType,
      formula:         input.formula !== undefined ? input.formula : existing.formula,
      properties:      mergedProperties as any,
      updatedBy:       auth.sub,
    },
  });

  try {
    await audit({
      tenantId: auth.tid,
      userId: auth.sub,
      action: "UPDATE",
      entityType: "dimension_member",
      entityId: existing.id,
      before: existing,
      after: updated,
      metadata: { dimension: kind },
    });
  } catch { /* ignore */ }

  // Entity icp_enabled toggled? Re-sync ICP. Cheap and idempotent —
  // we don't bother detecting whether icp_enabled actually changed.
  if (kind === "ENTITY") {
    try {
      await syncIcpFromEntity({
        tenantId: auth.tid,
        userId:   auth.sub,
        op:       "update",
        entity: {
          id:         updated.id,
          memberCode: updated.memberCode,
          memberName: updated.memberName,
          properties: (updated.properties as any) ?? null,
        },
      });
    } catch (e) { console.error("[sync-icp] update failed:", e); }
  }

  return apiSuccess(updated);
}

// ─── DELETE (soft by default, ?hard=true for permanent) ──────────

export async function DELETE(
  req: NextRequest,
  ctx: { params: { dimension: string; id: string } }
) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const kind = resolveDimKind(ctx.params.dimension);
  if (!kind) return apiError(`Unknown dimension: ${ctx.params.dimension}`, 400);

  // ICP is system-managed; deletes happen via Entity flips, not directly.
  if (kind === "ICP") {
    return apiError(
      "ICP members are system-managed. Toggle icp_enabled off on the source Entity to deactivate.",
      409,
    );
  }

  const existing = await prisma.dimensionMember.findFirst({
    where: { id: ctx.params.id, tenantId: auth.tid },
    include: { dimension: { select: { kind: true } } },
  });
  if (!existing) return apiError("Not found", 404);
  if (existing.dimension.kind !== kind) {
    return apiError("Member does not belong to this dimension", 400);
  }

  // Block delete if member has hierarchy children
  const hasChildren = await prisma.hierarchyEdge.findFirst({
    where: { tenantId: auth.tid, parentMemberId: existing.id },
    select: { id: true },
  });
  if (hasChildren) {
    return apiError(
      "Cannot delete — member has child members in one or more hierarchies. Remove children first.",
      409,
    );
  }

  const url = new URL(req.url);
  const hard = url.searchParams.get("hard") === "true";

  if (hard) {
    await prisma.dimensionMember.delete({ where: { id: existing.id } });
  } else {
    await prisma.dimensionMember.update({
      where: { id: existing.id },
      data: { isActive: false, updatedBy: auth.sub },
    });
  }

  try {
    await audit({
      tenantId: auth.tid,
      userId: auth.sub,
      action: "DELETE",
      entityType: "dimension_member",
      entityId: existing.id,
      before: existing,
      metadata: { dimension: kind, hard },
    });
  } catch { /* ignore */ }

  // Entity deleted → deactivate matching ICP member
  if (kind === "ENTITY") {
    try {
      await syncIcpFromEntity({
        tenantId: auth.tid,
        userId:   auth.sub,
        op:       "delete",
        entity: {
          id:         existing.id,
          memberCode: existing.memberCode,
          memberName: existing.memberName,
          properties: (existing.properties as any) ?? null,
        },
      });
    } catch (e) { console.error("[sync-icp] delete failed:", e); }
  }

  return apiSuccess({ id: existing.id, deleted: true, hard });
}
