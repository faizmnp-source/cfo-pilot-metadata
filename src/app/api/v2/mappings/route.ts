import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? undefined;
  const sourceSystem = url.searchParams.get("sourceSystem") ?? undefined;
  const isActive = url.searchParams.get("isActive") !== "false";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "50")));
  const where: any = { tenantId: auth.tid, isActive };
  if (kind) where.kind = kind;
  if (sourceSystem) where.sourceSystem = sourceSystem;
  const [rows, total] = await Promise.all([
    (prisma as any).mappingRule.findMany({ where, orderBy: [{ hitCount: "desc" }, { lastSeenAt: "desc" }], skip: (page-1)*pageSize, take: pageSize }),
    (prisma as any).mappingRule.count({ where }),
  ]);
  return apiResponse({ data: rows, page, pageSize, total });
}

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const body = await req.json().catch(() => null);
  if (!body) return apiError("Invalid JSON", 400);
  const { kind, sourceSystem = null, sourceKey, sourceContext = null, targetMemberId = null, targetField = null, confidence = 100, approve = false } = body;
  if (!kind || !sourceKey) return apiError("kind, sourceKey are required", 400);

  const existing = await (prisma as any).mappingRule.findFirst({
    where: { tenantId: auth.tid, kind, sourceSystem, sourceKey, targetMemberId },
  });

  let row;
  if (existing) {
    row = await (prisma as any).mappingRule.update({
      where: { id: existing.id },
      data: {
        confidence, targetField, sourceContext,
        approvedBy: approve ? auth.sub : existing.approvedBy,
        approvedAt: approve ? new Date() : existing.approvedAt,
        hitCount: { increment: 1 }, lastSeenAt: new Date(), isActive: true,
      },
    });
  } else {
    row = await (prisma as any).mappingRule.create({
      data: {
        tenantId: auth.tid, kind, sourceSystem, sourceKey, sourceContext,
        targetMemberId, targetField, confidence,
        authoredBy: auth.sub,
        approvedBy: approve ? auth.sub : null,
        approvedAt: approve ? new Date() : null,
      },
    });
  }
  return apiResponse(row, existing ? 200 : 201);
}
