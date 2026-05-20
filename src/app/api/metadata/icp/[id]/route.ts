import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const ICPUpdateSchema = z.object({
  icpCode: z.string().min(1).max(50).regex(/^[A-Z0-9\-_.]+$/i, "Code must be alphanumeric").optional(),
  icpName: z.string().min(1).max(200).optional(),
  entityId: z.string().uuid().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuthAndPermission(req, "icp", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const record = await prisma.iCP.findFirst({
    where: { id: params.id, tenantId: auth.tid },
  });
  if (!record) return apiError("ICP not found", 404);

  return apiResponse(record);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuthAndPermission(req, "icp", "update");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.iCP.findFirst({
    where: { id: params.id, tenantId: auth.tid },
  });
  if (!existing) return apiError("ICP not found", 404);

  const body = await req.json();
  const parsed = ICPUpdateSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  // If code is being changed, ensure uniqueness
  if (parsed.data.icpCode && parsed.data.icpCode !== existing.icpCode) {
    const conflict = await prisma.iCP.findUnique({
      where: { tenantId_icpCode: { tenantId: auth.tid, icpCode: parsed.data.icpCode } },
    });
    if (conflict) return apiError(`ICP code '${parsed.data.icpCode}' already exists`, 409);
  }

  const updated = await prisma.iCP.update({
    where: { id: params.id },
    data: parsed.data,
  });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "icps",
    recordId: params.id,
    dimensionType: "ICP",
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
  const authResult = await requireAuthAndPermission(req, "icp", "delete");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.iCP.findFirst({
    where: { id: params.id, tenantId: auth.tid },
  });
  if (!existing) return apiError("ICP not found", 404);

  await prisma.iCP.delete({ where: { id: params.id } });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "icps",
    recordId: params.id,
    dimensionType: "ICP",
    action: "DELETE",
    oldValue: existing as unknown as Record<string, unknown>,
    userId: auth.sub,
    userName: auth.name,
    userEmail: auth.email,
    userRole: auth.role,
  });

  return apiResponse({ deleted: true });
}
