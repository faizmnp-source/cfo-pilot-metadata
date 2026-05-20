import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const TimePointSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  periodType: z.string().min(1).max(50),
  fiscalYear: z.number().int().min(1900).max(2200),
  fiscalPeriod: z.number().int().min(1).max(53).optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().optional().nullable(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "time", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const timePoint = await prisma.timePoint.findFirst({
    where: { id: params.id, tenantId: auth.tid },
    include: {
      parent: { select: { code: true, name: true } },
      children: { orderBy: { code: "asc" } },
    },
  });
  if (!timePoint) return apiError("Time period not found", 404);
  return apiResponse(timePoint);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "time", "update");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.timePoint.findFirst({ where: { id: params.id, tenantId: auth.tid } });
  if (!existing) return apiError("Time period not found", 404);

  const body = await req.json();
  const parsed = TimePointSchema.partial().safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  if (parsed.data.parentId === params.id) return apiError("Time period cannot be its own parent", 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = { ...parsed.data };
  if (parsed.data.startDate !== undefined) updateData.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null;
  if (parsed.data.endDate !== undefined) updateData.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;

  const updated = await prisma.timePoint.update({
    where: { id: params.id },
    data: updateData,
  });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "time_points",
    recordId: params.id,
    dimensionType: "TIME",
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
  const authResult = await requireAuthAndPermission(req, "time", "delete");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.timePoint.findFirst({
    where: { id: params.id, tenantId: auth.tid },
    include: { _count: { select: { children: true } } },
  });
  if (!existing) return apiError("Time period not found", 404);
  if (existing._count.children > 0) return apiError("Cannot delete time period with child periods. Remove or re-parent children first.", 409);

  await prisma.timePoint.delete({ where: { id: params.id } });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "time_points",
    recordId: params.id,
    dimensionType: "TIME",
    action: "DELETE",
    oldValue: existing as Record<string, unknown>,
    userId: auth.sub,
    userName: auth.name,
    userEmail: auth.email,
    userRole: auth.role,
  });

  return apiResponse({ deleted: true });
}
