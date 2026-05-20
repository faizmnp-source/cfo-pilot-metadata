import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthAndPermission, getPaginationParams } from "@/lib/api-helpers";
import { apiResponse } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "auditLog", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;
  const p = getPaginationParams(req.nextUrl.searchParams);
  const tableName = req.nextUrl.searchParams.get("table");
  const action = req.nextUrl.searchParams.get("action");
  const userId = req.nextUrl.searchParams.get("userId");
  const where = {
    tenantId: auth.tid,
    ...(tableName && { tableName }),
    ...(action && { action: action as any }),
    ...(userId && { userId }),
    ...(p.search && { OR: [{ tableName: { contains: p.search, mode: "insensitive" as const } }, { userName: { contains: p.search, mode: "insensitive" as const } }] }),
  };
  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({ where, skip: (p.page-1)*p.pageSize, take: p.pageSize, orderBy: { createdAt: "desc" } }),
    prisma.auditLog.count({ where }),
  ]);
  return apiResponse({ data, total, page: p.page, pageSize: p.pageSize, totalPages: Math.ceil(total/p.pageSize) });
}
