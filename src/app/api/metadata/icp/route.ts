import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission, getPaginationParams } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const ICPSchema = z.object({
  icpCode: z.string().min(1).max(50).regex(/^[A-Z0-9\-_.]+$/i, "Code must be alphanumeric"),
  icpName: z.string().min(1).max(200),
  entityId: z.string().uuid().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export async function GET(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "icp", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const p = getPaginationParams(req.nextUrl.searchParams);
  const where: Record<string, unknown> = {
    tenantId: auth.tid,
    ...(p.isActive !== undefined && { isActive: p.isActive }),
    ...(p.search && {
      OR: [
        { icpCode: { contains: p.search, mode: "insensitive" } },
        { icpName: { contains: p.search, mode: "insensitive" } },
        { description: { contains: p.search, mode: "insensitive" } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    prisma.iCP.findMany({
      where,
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      orderBy: { [p.sortBy]: p.sortOrder },
    }),
    prisma.iCP.count({ where }),
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
  const authResult = await requireAuthAndPermission(req, "icp", "create");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const body = await req.json();
  const parsed = ICPSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  // Check code uniqueness
  const existing = await prisma.iCP.findUnique({
    where: { tenantId_icpCode: { tenantId: auth.tid, icpCode: parsed.data.icpCode } },
  });
  if (existing) return apiError(`ICP code '${parsed.data.icpCode}' already exists`, 409);

  const record = await prisma.iCP.create({
    data: { ...parsed.data, tenantId: auth.tid },
  });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "icps",
    recordId: record.id,
    dimensionType: "ICP",
    action: "CREATE",
    newValue: record as unknown as Record<string, unknown>,
    userId: auth.sub,
    userName: auth.name,
    userEmail: auth.email,
    userRole: auth.role,
  });

  return apiResponse(record, 201);
}
