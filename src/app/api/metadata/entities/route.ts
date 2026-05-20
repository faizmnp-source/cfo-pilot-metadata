import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { EntitySchema } from "@/lib/validations";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission, getPaginationParams } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "entity", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;
  const p = getPaginationParams(req.nextUrl.searchParams);
  const where = {
    tenantId: auth.tid,
    ...(p.isActive !== undefined && { isActive: p.isActive }),
    ...(p.search && { OR: [{ entityCode: { contains: p.search, mode: "insensitive" as const } }, { entityName: { contains: p.search, mode: "insensitive" as const } }] }),
  };
  const [data, total] = await Promise.all([
    prisma.entity.findMany({ where, skip: (p.page-1)*p.pageSize, take: p.pageSize, orderBy: { [p.sortBy]: p.sortOrder }, include: { parent: { select: { entityCode:true, entityName:true } }, _count: { select: { children:true, departments:true } } } }),
    prisma.entity.count({ where }),
  ]);
  return apiResponse({ data, total, page: p.page, pageSize: p.pageSize, totalPages: Math.ceil(total/p.pageSize) });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "entity", "create");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;
  const body = await req.json();
  const parsed = EntitySchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());
  const exists = await prisma.entity.findUnique({ where: { tenantId_entityCode: { tenantId: auth.tid, entityCode: parsed.data.entityCode } } });
  if (exists) return apiError("Entity code already exists", 409);
  const entity = await prisma.entity.create({ data: { ...parsed.data, tenantId: auth.tid, createdBy: auth.sub, updatedBy: auth.sub } });
  await writeAuditLog({ tenantId: auth.tid, tableName: "entities", recordId: entity.id, dimensionType: "ENTITY", action: "CREATE", newValue: entity as Record<string, unknown>, userId: auth.sub, userName: auth.name, userEmail: auth.email, userRole: auth.role });
  return apiResponse(entity, 201);
}
