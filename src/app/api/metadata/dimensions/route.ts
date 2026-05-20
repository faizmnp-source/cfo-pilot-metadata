import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission, getPaginationParams } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const DimensionDefinitionSchema = z.object({
  slot: z
    .string()
    .regex(/^UD([1-9]|10)$/, "Slot must be UD1 through UD10"),
  name: z.string().min(1).max(100),
  pluralName: z.string().max(120).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  iconName: z.string().max(100).default("Layers"),
  color: z.string().max(100).default("text-gray-600"),
  bgColor: z.string().max(100).default("bg-gray-50"),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export async function GET(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "dimension", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const p = getPaginationParams(req.nextUrl.searchParams);
  const where: Record<string, unknown> = {
    tenantId: auth.tid,
    ...(p.isActive !== undefined && { isActive: p.isActive }),
    ...(p.search && {
      OR: [
        { name: { contains: p.search, mode: "insensitive" } },
        { slot: { contains: p.search, mode: "insensitive" } },
        { description: { contains: p.search, mode: "insensitive" } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    prisma.dimensionDefinition.findMany({
      where,
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      orderBy: { [p.sortBy]: p.sortOrder },
      include: {
        _count: { select: { members: true } },
      },
    }),
    prisma.dimensionDefinition.count({ where }),
  ]);

  return apiResponse({
    data,
    total,
    page: p.page,
    pageSize: p.pageSize,
    totalPages: Math.ceil(total / p.pageSize),
  });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "dimension", "create");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const body = await req.json();
  const parsed = DimensionDefinitionSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  // Check for slot uniqueness within tenant
  const existing = await prisma.dimensionDefinition.findUnique({
    where: { tenantId_slot: { tenantId: auth.tid, slot: parsed.data.slot } },
  });
  if (existing) return apiError(`Slot ${parsed.data.slot} is already in use`, 409);

  const record = await prisma.dimensionDefinition.create({
    data: { ...parsed.data, tenantId: auth.tid },
  });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "dimension_definitions",
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
