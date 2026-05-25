// GET  /api/v2/analyze/views          — list mine + shared
// POST /api/v2/analyze/views          — create
// Body for POST: { name, description?, isShared?, spec: {...} }
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const views = await (prisma as any).adHocView.findMany({
    where: { tenantId: auth.tid, OR: [{ ownerId: auth.sub }, { isShared: true }]},
    orderBy: [{ lastOpenedAt: "desc" }, { updatedAt: "desc" }],
    take: 100,
  });
  return apiResponse({ data: views.map((v: any) => ({ ...v, mine: v.ownerId === auth.sub })) });
}

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.spec) return apiError("name and spec are required", 400);
  const row = await (prisma as any).adHocView.create({
    data: {
      tenantId: auth.tid, ownerId: auth.sub,
      name: body.name, description: body.description ?? null,
      isShared: !!body.isShared,
      spec: body.spec,
      lastOpenedAt: new Date(),
    },
  });
  return apiResponse(row, 201);
}
