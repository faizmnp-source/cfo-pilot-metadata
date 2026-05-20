import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const DimensionDefinitionUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  pluralName: z.string().max(120).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  iconName: z.string().max(100).optional(),
  color: z.string().max(100).optional(),
  bgColor: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuthAndPermission(req, "dimension", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const record = await prisma.dimensionDefinition.findFirst({
    where: { id: params.id, tenantId: auth.tid },
    include: {
      _count: { select: { members: true } },
    },
  });
  if (!record) return apiError("Dimension definition not found", 404);

  return apiResponse(record);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuthAndPermission(req, "dimension", "update");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.dimensionDefinition.findFirst({
    where: { id: params.id, tenantId: auth.tid },
  });
  if (!existing) return apiError("Dimension definition not found", 404);

  const body = await req.json();
  const parsed = DimensionDefinitionUpdateSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  const updated = await prisma.dimensionDefinition.update({
    where: { id: params.id },
    data: parsed.data,
  });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "dimension_definitions",
    recordId: params.id,
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
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuthAndPermission(req, "dimension", "delete");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.dimensionDefinition.findFirst({
    where: { id: params.id, tenantId: auth.tid },
    include: { _count: { select: { members: true } } },
  });
  if (!existing) return apiError("Dimension definition not found", 404);

  if (existing._count.members > 0) {
    return apiError(
      `Cannot delete dimension: it has ${existing._count.members} member(s). Remove all members first.`,
      409
    );
  }

  await prisma.dimensionDefinition.delete({ where: { id: params.id } });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "dimension_definitions",
    recordId: params.id,
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
