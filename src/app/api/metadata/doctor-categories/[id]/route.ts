import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const DoctorCategorySchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  specialty: z.string().min(1).max(100),
  billableRate: z.number().min(0).optional().nullable(),
  currency: z.string().length(3).default("USD"),
  department: z.string().max(100).optional().nullable(),
  isActive: z.boolean().default(true),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "doctor", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const doctorCategory = await prisma.doctorCategory.findFirst({
    where: { id: params.id, tenantId: auth.tid },
  });
  if (!doctorCategory) return apiError("Doctor category not found", 404);
  return apiResponse(doctorCategory);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "doctor", "update");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.doctorCategory.findFirst({ where: { id: params.id, tenantId: auth.tid } });
  if (!existing) return apiError("Doctor category not found", 404);

  const body = await req.json();
  const parsed = DoctorCategorySchema.partial().safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  const updated = await prisma.doctorCategory.update({
    where: { id: params.id },
    data: { ...parsed.data, updatedBy: auth.sub },
  });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "doctor_categories",
    recordId: params.id,
    dimensionType: "DOCTOR_CATEGORY",
    action: "UPDATE",
    oldValue: existing as Record<string, unknown>,
    newValue: updated as Record<string, unknown>,
    userId: auth.sub,
    userName: auth.name,
    userEmail: auth.email,
    userRole: auth.role,
  });

  return apiResponse(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "doctor", "delete");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.doctorCategory.findFirst({ where: { id: params.id, tenantId: auth.tid } });
  if (!existing) return apiError("Doctor category not found", 404);

  await prisma.doctorCategory.delete({ where: { id: params.id } });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "doctor_categories",
    recordId: params.id,
    dimensionType: "DOCTOR_CATEGORY",
    action: "DELETE",
    oldValue: existing as Record<string, unknown>,
    userId: auth.sub,
    userName: auth.name,
    userEmail: auth.email,
    userRole: auth.role,
  });

  return apiResponse({ deleted: true });
}
