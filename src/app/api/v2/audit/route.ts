import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiResponse } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;

  const url = new URL(req.url);
  const page     = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "50")));
  const entityType = url.searchParams.get("entityType") ?? undefined;
  const entityId   = url.searchParams.get("entityId") ?? undefined;
  const userId     = url.searchParams.get("userId") ?? undefined;
  const action     = url.searchParams.get("action") ?? undefined;
  const from       = url.searchParams.get("from");
  const to         = url.searchParams.get("to");

  const where: any = { tenantId: auth.tid };
  if (entityType) where.entityType = entityType;
  if (entityId)   where.entityId = entityId;
  if (userId)     where.userId = userId;
  if (action)     where.action = action;
  if (from || to) where.createdAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.auditLog.count({ where }),
  ]);

  const userIds = Array.from(new Set(rows.map(r => r.userId).filter(Boolean) as string[]));
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds }}, select: { id: true, email: true, name: true }}) : [];

  return apiResponse({ data: rows, users, page, pageSize, total });
}
