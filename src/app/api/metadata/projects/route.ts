import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission, getPaginationParams } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const ProjectCreateSchema = z.object({
  projectCode: z.string().min(1).max(50).regex(/^[A-Z0-9\-_.]+$/i, "Code must be alphanumeric"),
  projectName: z.string().min(1).max(200),
  parentId: z.string().uuid().optional().nullable(),
  entityId: z.string().uuid().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  budget: z.number().optional().nullable(),
  currency: z.string().length(3).default("USD"),
  status: z
    .enum(["ACTIVE", "INACTIVE", "COMPLETED", "ON_HOLD", "CANCELLED"])
    .default("ACTIVE"),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export async function GET(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "project", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const p = getPaginationParams(req.nextUrl.searchParams);
  const statusFilter = req.nextUrl.searchParams.get("status");

  const where: Record<string, unknown> = {
    tenantId: auth.tid,
    ...(p.isActive !== undefined && { isActive: p.isActive }),
    ...(statusFilter && { status: statusFilter }),
    ...(p.search && {
      OR: [
        { projectCode: { contains: p.search, mode: "insensitive" } },
        { projectName: { contains: p.search, mode: "insensitive" } },
        { description: { contains: p.search, mode: "insensitive" } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    prisma.project.findMany({
      where,
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      orderBy: { [p.sortBy]: p.sortOrder },
      include: {
        parent: { select: { id: true, projectCode: true, projectName: true } },
        _count: { select: { children: true } },
      },
    }),
    prisma.project.count({ where }),
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
  const authResult = await requireAuthAndPermission(req, "project", "create");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const body = await req.json();
  const parsed = ProjectCreateSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  // Check code uniqueness
  const existing = await prisma.project.findUnique({
    where: {
      tenantId_projectCode: { tenantId: auth.tid, projectCode: parsed.data.projectCode },
    },
  });
  if (existing) return apiError(`Project code '${parsed.data.projectCode}' already exists`, 409);

  // Validate parent belongs to same tenant
  if (parsed.data.parentId) {
    const parentProject = await prisma.project.findFirst({
      where: { id: parsed.data.parentId, tenantId: auth.tid },
    });
    if (!parentProject) return apiError("Parent project not found", 400);
  }

  const { startDate, endDate, ...rest } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createData: any = {
    ...rest,
    tenantId: auth.tid,
    createdBy: auth.sub,
    updatedBy: auth.sub,
    ...(startDate != null && { startDate: new Date(startDate) }),
    ...(endDate != null && { endDate: new Date(endDate) }),
  };

  const record = await prisma.project.create({ data: createData });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "projects",
    recordId: record.id,
    dimensionType: "PROJECT",
    action: "CREATE",
    newValue: record as unknown as Record<string, unknown>,
    userId: auth.sub,
    userName: auth.name,
    userEmail