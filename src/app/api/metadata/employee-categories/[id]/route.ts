import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const EmployeeCategorySchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  categoryType: z.string().min(1).max(100),
  payGrade: z.string().max(50).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "employee", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const employeeCategory = await prisma.employeeCategory.findFirst({
    where: { id: params.id, tenantId: auth.tid },
  });
  if (!employeeCategory) return apiError("Employee category not found", 404);
  return apiResponse(employeeCategory);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "employee", "update");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.employeeCategory.findFirst({ where: { id: params.id, tenantId: auth.tid } });
  if (!existing) return apiError("Employee category not found", 404);

  const body = await req.json();
  const parsed = EmployeeCategorySchema.partial().safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  const updated = await prisma.employeeCategory.update({
    where: { id: params.id },
    data: { ...parsed.data },
  });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "employee_categories",
    recordId: params.id,
    dimensionType: "EMPLOYEE_CATEGORY",
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
  const authResult = await requireAuthAndPermission(req, "employee", "delete");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.employeeCategory.findFirst({ where: { id: params.id, tenantId: auth.tid } });
  if (!existing) return apiError("Employee category not found", 404);

  await prisma.employeeCategory.delete({ where: { id: params.id } });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "employee_categories",
    recordId: params.id,
    dimensionType: "EMPLOYEE_CATEGORY",
    action: "DELETE",
    oldValue: existing as Record<string, unknown>,
    userId: auth.sub,
    userName: auth.name,
    userEmail: auth.email,
    userRole: auth.role,
  });

  return apiResponse({ deleted: true });
}
