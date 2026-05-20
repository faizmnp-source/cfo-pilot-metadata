import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission, getPaginationParams } from "@/lib/api-helpers";
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

export async function GET(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "time", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;
  const p = getPaginationParams(req.nextUrl.searchParams);
  const sortBy = p.sortBy === "createdAt" ? "code" : p.sortBy;

  const where = {
    tenantId: auth.tid,
    ...(p.isActive !== undefined && { isActive: p.isActive }),
    ...(p.search && {
      OR: [
        { code: { contains: p.search, mode: "insensitive" as const } },
        { name: { contains: p.search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    prisma.timePoint.findMany({
      where,
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      orderBy: { [sortBy]: p.sortOrder },
      include: {
        parent: { select: { code: true, name: true } },
        _count: { select: { children: true } },
      },
    }),
    prisma.timePoint.count({ where }),
  ]);

  return apiResponse({ data, total, page: p.page, pageSize: p.pageSize, totalPages: Math.ceil(total / p.pageSize) });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "time", "create");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const body = await req.json();
  const parsed = TimePointSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  const exists = await prisma.timePoint.findUnique({
    where: { tenantId_code: { tenantId: auth.tid, code: parsed.data.code } },
  });
  if (exists) return apiError("Time period code already exists", 409);

  if (parsed.data.parentId) {
    const parent = await prisma.timePoint.findFirst({ where: { id: parsed.data.parentId, tenantId: auth.tid } });
    if (!parent) return apiError("Parent time period not found", 404);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createData: any = {
    ...parsed.data,
    tenantId: auth.tid,
    startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : new Date(),
    endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : new Date(),
    sortOrder: parsed.data.sortOrder ?? 0,
  };

  const timePoint = await prisma.timePoint.create({ data: crea