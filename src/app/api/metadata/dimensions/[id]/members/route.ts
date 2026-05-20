import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission, getPaginationParams } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const DimensionMemberCreateSchema = z.object({
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  parentId: z.string().uuid().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  properties: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuthAndPermission(req, "dimension", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  // Verify dimension belongs to tenant
  const dimension = await prisma.dimensionDefinition.findFirst({
    where: { id: params.id, tenantId: auth.tid },
  });
  if (!dimension) return apiError("Dimension definition not found", 404);

  const p = getPaginationParams(req.nextUrl.searchParams);
  const where: Record<string, unknown> = {
    tenantId: auth.tid,
    dimensionId: params.id,
    ...(p.isActive !== undefined && { isActive: p.isActive }),
    ...(p.search && {
      OR: [
        { code: { contains: p.search, mode: "insensitive" } },
        { name: { contains: p.search, mode: "insensitive" } },
        { description: { contains: p.search, mode: "insensitive" } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    prisma.dimensionMember.findMany({
      where,
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      orderBy: { [p.sortBy]: p.sortOrder },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        _count: { select: { children: true } },
      },
    }),
    prisma.dimensionMember.count({ where }),
  ]);

  return apiResponse({
    data,
    total,
    page: p.page,
    pageSize: p.pageSize,
    totalPages: Math.ceil(total / p.pageSize),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuthAndPermission(req, "dimension", "create");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  // Verify dimension belongs to tenant
  const dimension = await prisma.dimensionDefinition.findFirst({
    where: { id: params.id, tenantId: auth.tid },
  });
  if (!dimension) return apiError("Dimension definition not found", 404);

  const body = await req.json();
  const parsed = DimensionMemberCreateSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  // Validate code uniqueness within (tenantId, dimensionId)
  const codeConflict = await prisma.dimensionMember.findUnique({
    where: {
      tenantId_dimensionId_code: {
        tenantId: auth.tid,
        dimensionId: params.id,
        code: parsed.data.code,
      },
    },
  });
  if (codeConflict) return apiError(`Code '${parsed.data.code}' already exists in this dimension`, 409);

  // Validate parent exists in same dimension
  if (parsed.data.parentId) {
    const parentMember = await prisma.dimensionMember.findFirst({
      where: {
        id: parsed.data.parentId,
        tenantId: auth.tid,
        dimensionId: params.id,
      },
    });
    if (!parentMember) return apiError("Parent member not found in this dimension", 400);
  }

  const record = await prisma.dimensionMember.create({
    data: {
      ...parsed.data,
      tenantId: auth.tid,
      dimensionId: params.id,
    },
  });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "dimension_members",
    recordId: record.id,
    dimensionType: "USER_DEFINED",
    action: "CREATE",
    newValue: record as unknown as Record<string, unknown>,
    userId: auth.sub,
    userName: auth.name,
    userEmail: auth.email,
    userRole: auth.role,
  });

  return apiResponse(record, 201);
}
