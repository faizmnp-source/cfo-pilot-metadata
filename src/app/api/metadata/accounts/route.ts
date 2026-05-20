import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { AccountSchema } from "@/lib/validations";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission, getPaginationParams } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "account", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;
  const p = getPaginationParams(req.nextUrl.searchParams);

  const where = {
    tenantId: auth.tid,
    ...(p.isActive !== undefined && { isActive: p.isActive }),
    ...(p.search && {
      OR: [
        { accountCode: { contains: p.search, mode: "insensitive" as const } },
        { accountName: { contains: p.search, mode: "insensitive" as const } },
        { reportingGroup: { contains: p.search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    prisma.account.findMany({
      where, skip: (p.page - 1) * p.pageSize, take: p.pageSize,
      orderBy: { [p.sortBy]: p.sortOrder },
      include: { parent: { select: { accountCode:true, accountName:true } }, _count: { select: { children:true } } },
    }),
    prisma.account.count({ where }),
  ]);

  return apiResponse({ data, total, page: p.page, pageSize: p.pageSize, totalPages: Math.ceil(total / p.pageSize) });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "account", "create");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const body = await req.json();
  const parsed = AccountSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  const exists = await prisma.account.findUnique({ where: { tenantId_accountCode: { tenantId: auth.tid, accountCode: parsed.data.accountCode } } });
  if (exists) return apiError("Account code already exists", 409);

  if (parsed.data.parentId) {
    const parent = await prisma.account.findFirst({ where: { id: parsed.data.parentId, tenantId: auth.tid } });
    if (!parent) return apiError("Parent account not found", 404);
  }

  const account = await prisma.account.create({
    data: { ...parsed.data, tenantId: auth.tid, createdBy: auth.sub, updatedBy: auth.sub },
  });

  await writeAuditLog({ tenantId: auth.tid, tableName: "accounts", recordId: account.id, dimensionType: "ACCOUNT", action: "CREATE", newValue: account as Record<string, unknown>, userId: auth.sub, userName: auth.name, userEmail: auth.email, userRole: auth.role });
  return apiResponse(account, 201);
}
