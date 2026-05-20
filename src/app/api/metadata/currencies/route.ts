import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission, getPaginationParams } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const CurrencySchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1).max(200),
  symbol: z.string().min(1).max(10),
  exchangeRate: z.number().positive(),
  isBase: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "currency", "read");
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
    prisma.currency.findMany({
      where,
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      orderBy: { [sortBy]: p.sortOrder },
    }),
    prisma.currency.count({ where }),
  ]);

  return apiResponse({ data, total, page: p.page, pageSize: p.pageSize, totalPages: Math.ceil(total / p.pageSize) });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "currency", "create");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const body = await req.json();
  const parsed = CurrencySchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  const exists = await prisma.currency.findUnique({
    where: { tenantId_code: { tenantId: auth.tid, code: parsed.data.code } },
  });
  if (exists) return apiError("Currency code already exists", 409);

  const currency = await prisma.currency.create({
    data: {
      ...parsed.data,
      exchangeRate: parsed.data.exchangeRate,
      tenantId: auth.tid,
    },
  });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "currencies",
    recordId: currency.id,
    dimensionType: "CURRENCY",
    action: "CREATE",
    newValue: currency as Record<string, unknown>,
    userId: auth.sub,
    userName: auth.name,
    userEmail: auth.email,
    userRole: auth.role,
  });

  return apiResponse(currency, 201);
}
