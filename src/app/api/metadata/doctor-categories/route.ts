import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission, getPaginationParams } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const DoctorCategorySchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  specialty: z.string().min(1).max(100),
  billableRate: z.number().min(0).optional().nullable(),
  currency: z.string().length(3).default("USD"),
  department: z.string().max(100).optional().nullable(),
  isActive: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "doctor", "read");
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
        { specialty: { contains: p.search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    prisma.doctorCategory.findMany({
      where,
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      orderBy: { [sortBy]: p.sortOrder },
    }),
    prisma.doctorCategory.count({ where }),
  ]);

  return apiResponse({ data, total, page: p.page, pageSize: p.pageSize, totalPages: Math.ceil(total / p.pageSize) });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "doctor", "create");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const body = await req.json();
  const parsed = DoctorCategorySchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  const exists = await prisma.doctorCategory.findUnique({
    where: { tenantId_code: { tenantId: auth.tid, code: parsed.data.code } },
  });
  if (exists) return apiError("Doctor category code already exists", 409);

  const doctorCategory = await prisma.doctorCategory.create({
    data: {
      ...parsed.data,
      tenantId: auth.tid,
    },
  });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "doctor_categories",
    recordId: doctorCategory.id,
    dimensionType: "DOCTOR_CATEGORY",
    action: "CREATE",
    newValue: doctorCategory as Record<string, unknown>,
    userId: auth.sub,
    userName: auth.name,
    userEmail: auth.email,
    userRole: auth.role,
  });

  return apiResponse(doctorCategory, 201);
}
