import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { DepartmentSchema } from "@/lib/validations";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission, getPaginationParams } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const client = (prisma as any).department;

export async function GET(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "department", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;
  const p = getPaginationParams(req.nextUrl.searchParams);
  const where: Record<string, unknown> = {
    tenantId: auth.tid,
    ...(p.isActive !== undefined && { isActive: p.isActive }),
    ...(p.search && { OR: [{ departmentCode: { contains: p.search, mode: "insensitive" } }, { departmentName: { contains: p.search, mode: "insensitive" } }] }),
  };
  const [data, total] = await Promise.all([
    client.findMany({ where, skip: (p.page-1)*p.pageSize, take: p.pageSize,
      orderBy: { [p.sortBy]: p.sortOrder },
      include: { parent: { select: { id:true, departmentCode:true, departmentName:true } }, _count: { select: { children: true } } }
    }),
    client.count({ where }),
  ]);
  return apiResponse({ data, total, page: p.page, pageSize: p.pageSize, totalPages: Math.ceil(total/p.pageSize) });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "department", "create");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;
  const body = await req.json();
  const parsed = DepartmentSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());
  const record = await client.create({ data: { ...parsed.data, tenantId: auth.tid, createdBy: auth.sub, updatedBy: auth.sub } });
  await writeAuditLog({ tenantId: auth.tid, tableName: "departments", recordId: record.id, dimensionType: "DEPARTMENT", action: "CREATE", newValue: record, userId: auth.sub, userName: auth.name, userEmail: auth.email, userRole: auth.role });
  return apiResponse(record, 201);
}
