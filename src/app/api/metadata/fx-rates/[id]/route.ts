import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const FxRateUpdateSchema = z.object({
  rate:      z.number().positive().optional(),
  source:    z.enum(["MANUAL", "MARKET", "IMPORTED"]).optional(),
  isActive:  z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "currency", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const record = await prisma.fxRate.findFirst({ where: { id: params.id, tenantId: auth.tid } });
  if (!record) return apiError("FX rate not found", 404);
  return apiResponse(record);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "currency", "update");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.fxRate.findFirst({ where: { id: params.id, tenantId: auth.tid } });
  if (!existing) return apiError("FX rate not found", 404);

  const body   = await req.json();
  const parsed = FxRateUpdateSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  const updated = await prisma.fxRate.update({ where: { id: params.id }, data: parsed.data });

  await writeAuditLog({
    tenantId:  auth.tid,
    tableName: "fx_rates",
    recordId:  params.id,
    action:    "UPDATE",
    oldValue:  existing as unknown as Record<string, unknown>,
    newValue:  updated  as unknown as Record<string, unknown>,
    userId:    auth.sub,
    userName:  auth.name,
    userEmail: auth.email,
    userRole:  auth.role,
  });

  return apiResponse(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "currency", "delete");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.fxRate.findFirst({ where: { id: params.id, tenantId: auth.tid } });
  if (!existing) return apiError("FX rate not found", 404);

  await prisma.fxRate.delete({ where: { id: params.id } });

  await writeAuditLog({
    tenantId:  auth.tid,
    tableName: "fx_rates",
    recordId:  params.id,
    action:    "DELETE",
    oldValue:  existing as unknown as Record<string, unknown>,
    userId:    auth.sub,
    userName:  auth.name,
    userEmail: auth.email,
    userRole:  auth.role,
  });

  return apiResponse({ deleted: true });
}
