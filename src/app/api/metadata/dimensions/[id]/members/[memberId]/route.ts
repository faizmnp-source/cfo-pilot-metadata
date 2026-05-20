import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const DimensionMemberUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  parentId: z.string().uuid().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  properties: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

/**
 * Walk up the parent chain to detect circular references.
 * Returns true if `ancestorCandidateId` is already an ancestor of `memberId`.
 */
async function wouldCreateCycle(
  memberId: string,
  newParentId: string,
  tenantId: string,
  dimensionId: string
): Promise<boolean> {
  let currentId: string | null = newParentId;
  const visited = new Set<string>();

  while (currentId !== null) {
    if (currentId === memberId) return true;
    if (visited.has(currentId)) return true; // safety: existing cycle guard
    visited.add(currentId);

    const node = await prisma.dimensionMember.findFirst({
      where: { id: currentId, tenantId, dimensionId },
      select: { parentId: true },
    });
    if (!node) break;
    currentId = node.parentId;
  }
  return false;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  const authResult = await requireAuthAndPermission(req, "dimension", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const record = await prisma.dimensionMember.findFirst({
    where: {
      id: params.memberId,
      tenantId: auth.tid,
      dimensionId: params.id,
    },
    include: {
      parent: { select: { id: true, code: true, name: true } },
      children: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, code: true, name: true, isActive: true, sortOrder: true },
      },
    },
  });
  if (!record) return apiError("Dimension member not found", 404);

  return apiResponse(record);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  const authResult = await requireAuthAndPermission(req, "dimension", "update");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.dimensionMember.findFirst({
    where: {
      id: params.memberId,
      tenantId: auth.tid,
      dimensionId: params.id,
    },
  });
  if (!existing) return apiError("Dimension member not found", 404);

  const body = await req.json();
  const parsed = DimensionMemberUpdateSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  // Prevent self-parent
  if (parsed.data.parentId === params.memberId) {
    return apiError("A member cannot be its own parent", 400);
  }

  // Validate new parent exists in same dimension and check for cycles
  if (parsed.data.parentId !== undefined && parsed.data.parentId !== null) {
    const parentMember = await prisma.dimensionMember.findFirst({
      where: {
        id: parsed.data.parentId,
        tenantId: auth.tid,
        dimensionId: params.id,
      },
    });
    if (!parentMember) return apiError("Parent member not found in this dimension", 400);

    const cycle = await wouldCreateCycle(
      params.memberId,
      parsed.data.parentId,
      auth.tid,
      params.id
    );
    if (cycle) return apiError("Setting this parent would create a circular hierarchy", 400);
  }

  const updated = await prisma.dimensionMember.update({
    where: { id: params.memberId },
    data: parsed.data,
  });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "dimension_members",
    recordId: params.memberId,
    dimensionType: "USER_DEFINED",
    action: "UPDATE",
    oldValue: existing as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
    userId: auth.sub,
    userName: auth.name,
    userEmail: auth.email,
    userRole: auth.role,
  });

  return apiResponse(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  const authResult = await requireAuthAndPermission(req, "dimension", "delete");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.dimensionMember.findFirst({
    where: {
      id: params.memberId,
      tenantId: auth.tid,
      dimensionId: params.id,
    },
    include: { _count: { select: { children: true } } },
  });
  if (!existing) return apiError("Dimension member not found", 404);

  if (existing._count.children > 0) {
    return apiError(
      `Cannot delete member: it has ${existing._count.children} child member(s). Remove children first.`,
      409
    );
  }

  await prisma.dimensionMember.delete({ where: { id: params.memberId } });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "dimension_members",
    recordId: params.memberId,
    dimensionType: "USER_DEFINED",
    action: "DELETE",
    oldValue: existing as unknown as Record<string, unknown>,
    userId: auth.sub,
    userName: auth.name,
    userEmail: auth.email,
    userRole: auth.role,
  });

  return apiResponse({ deleted: true });
}
