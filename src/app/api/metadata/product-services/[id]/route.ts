import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const ProductServiceSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  unitOfMeasure: z.string().max(50).optional().nullable(),
  unitPrice: z.number().min(0).optional().nullable(),
  currency: z.string().length(3).default("USD"),
  isActive: z.boolean().default(true),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "product", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const productService = await prisma.productService.findFirst({
    where: { id: params.id, tenantId: auth.tid },
  });
  if (!productService) return apiError("Product/service not found", 404);
  return apiResponse(productService);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "product", "update");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.productService.findFirst({ where: { id: params.id, tenantId: auth.tid } });
  if (!existing) return apiError("Product/service not found", 404);

  const body = await req.json();
  const parsed = ProductServiceSchema.partial().safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  const updated = await prisma.productService.update({
    where: { id: params.id },
    data: { ...parsed.data, updatedBy: auth.sub },
  });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "product_services",
    recordId: params.id,
    dimensionType: "PRODUCT_SERVICE",
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
  const authResult = await requireAuthAndPermission(req, "product", "delete");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.productService.findFirst({ where: { id: params.id, tenantId: auth.tid } });
  if (!existing) return apiError("Product/service not found", 404);

  await prisma.productService.delete({ where: { id: params.id } });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "product_services",
    recordId: params.id,
    dimensionType: "PRODUCT_SERVICE",
    action: "DELETE",
    oldValue: existing as Record<string, unknown>,
    userId: auth.sub,
    userName: auth.name,
    userEmail: auth.email,
    userRole: auth.role,
  });

  return apiResponse({ deleted: true });
}
