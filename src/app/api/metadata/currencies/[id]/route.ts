import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const CurrencySchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1).max(200),
  symbol: z.string().min(1).max(10),
  exchangeRate: z.number().positive(),
  isBase: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "currency", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const currency = await prisma.currency.findFirst({
    where: { id: params.id, tenantId: auth.tid },
  });
  if (!currency) return apiError("Currency not found", 404);
  return apiResponse(currency);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "currency", "update");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.currency.findFirst({ where: { id: params.id, tenantId: auth.tid } });
  if (!existing) return apiError("Currency not found", 404);

  const body = await req.json();
  const parsed = CurrencySchema.partial().safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  const updated = await prisma.currency.update({
    where: { id: params.id },
    data: {
      ...parsed.data,
    },
  });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "currencies",
    recordId: params.id,
    dimensionType: "CURRENCY",
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
  const authResult = await requireAuthAndPermission(req, "currency", "delete");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.currency.findFirst({ where: { id: params.id, tenantId: auth.tid } });
  if (!existing) return apiError("Currency not found", 404);

  await prisma.currency.delete({ where: { id: params.id } });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "currencies",
    recordId: params.id,
    dimensionType: "CURRENCY",
    action: "DELETE",
    oldValue: existing as Record<string, unknown>,
    userId: auth.sub,
    userName: auth.name,
    userEmail: auth.email,
    userRole: auth.role,
  });

  return apiResponse({ deleted: true });
}
