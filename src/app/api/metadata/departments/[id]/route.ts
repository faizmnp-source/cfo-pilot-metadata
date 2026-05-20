import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { DepartmentSchema } from "@/lib/validations";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const client = (prisma as any).department;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "department", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;
  const record = await client.findFirst({ where: { id: params.id, tenantId: auth.tid }, include: { parent: true, children: { orderBy: { departmentCode: "asc" } } } });
  if (!record) return apiError("Department not found", 404);
  return apiResponse(record);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "department", "update");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;
  const existing = await client.findFirst({ where: { id: params.id, tenantId: auth.tid } });
  if (!existing) return apiError("Department not found", 404);
  const body = await req.json();
  const parsed = DepartmentSchema.partial().safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());
  if (parsed.data.parentId === params.id) return apiError("Department cannot be its own parent", 400);
  const updated = await client.update({ where: { id: params.id }, data: { ...parsed.data, updatedBy: auth.sub } });
  await writeAuditLog({ tenantId: auth.tid, tableName: "departments", recordId: params.id, dimensionType: "DEPARTMENT", action: "UPDATE", oldValue: existing, newValue: updated, userId: auth.sub, userName: auth.name, userEmail: auth.email, userRole: auth.role });
  return apiResponse(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "department", "delete");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;
  const existing = await client.findFirst({ where: { id: params.id, tenantId: auth.tid }, include: { _count: { select: { children: true } } } });
  if (!existing) return apiError("Department not found", 404);
  if (existing._count.children > 0) return apiError("Cannot delete Department with children", 409);
  await client.delete({ where: { id: params.id } });
  await writeAuditLog({ tenantId: auth.tid, tableName: "departments", recordId: params.id, dimensionType: "DEPARTMENT", action: "DELETE", oldValue: existing, userId: auth.sub, userName: auth.name, userEmail: auth.email, userRole: auth.role });
  return apiResponse({ deleted: true });
}
