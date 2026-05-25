import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const rows = await (prisma as any).entityOwnership.findMany({
    where: { tenantId: auth.tid }, orderBy: [{ updatedAt: "desc" }], take: 500,
  });
  return apiResponse({ data: rows });
}

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const body = await req.json().catch(() => null);
  if (!body?.parentEntityId || !body?.childEntityId || body?.pctOwned === undefined) {
    return apiError("parentEntityId, childEntityId, pctOwned required", 400);
  }
  const pct = Number(body.pctOwned);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return apiError("pctOwned must be 0..100", 400);
  if (body.parentEntityId === body.childEntityId) return apiError("Parent and child must differ", 400);

  const row = await (prisma as any).entityOwnership.upsert({
    where: { tenantId_parentEntityId_childEntityId: { tenantId: auth.tid, parentEntityId: body.parentEntityId, childEntityId: body.childEntityId }},
    update: { pctOwned: pct, method: body.method ?? "FULL", notes: body.notes ?? null },
    create: { tenantId: auth.tid, parentEntityId: body.parentEntityId, childEntityId: body.childEntityId,
              pctOwned: pct, method: body.method ?? "FULL", notes: body.notes ?? null,
              createdBy: auth.sub },
  });
  return apiResponse(row, 201);
}
