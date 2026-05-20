import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { AccountSchema } from "@/lib/validations";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "account", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;
  const account = await prisma.account.findFirst({
    where: { id: params.id, tenantId: auth.tid },
    include: { parent: true, children: { orderBy: { accountCode: "asc" } } },
  });
  if (!account) return apiError("Account not found", 404);
  return apiResponse(account);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "account", "update");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.account.findFirst({ where: { id: params.id, tenantId: auth.tid } });
  if (!existing) return apiError("Account not found", 404);

  const body = await req.json();
  const parsed = AccountSchema.partial().safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  if (parsed.data.parentId === params.id) return apiError("Account cannot be its own parent", 400);

  const updated = await prisma.account.update({
    where: { id: params.id },
    data: { ...parsed.data, updatedBy: auth.sub },
  });
  await writeAuditLog({ tenantId: auth.tid, tableName: "accounts", recordId: params.id, dimensionType: "ACCOUNT", action: "UPDATE", oldValue: existing as Record<string, unknown>, newValue: updated as Record<string, unknown>, userId: auth.sub, userName: auth.name, userEmail: auth.email, userRole: auth.role });
  return apiResponse(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "account", "delete");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.account.findFirst({ where: { id: params.id, tenantId: auth.tid }, include: { _count: { select: { children: true } } } });
  if (!existing) return apiError("Account not found", 404);
  if (existing._count.children > 0) return apiError("Cannot delete account with child accounts. Remove or re-parent children first.", 409);

  await prisma.account.delete({ where: { id: params.id } });
  await writeAuditLog({ tenantId: auth.tid, tableName: "accounts", recordId: params.id, dimensionType: "ACCOUNT", action: "DELETE", oldValue: existing as Record<string, unknown>, userId: auth.sub, userName: auth.name, userEmail: auth.email, userRole: auth.role });
  return apiResponse({ deleted: true });
}
