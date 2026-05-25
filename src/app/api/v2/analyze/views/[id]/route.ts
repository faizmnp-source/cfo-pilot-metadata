import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

async function load(tenantId: string, id: string) {
  return (prisma as any).adHocView.findFirst({ where: { id, tenantId }});
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const { id } = await ctx.params;
  const row = await load(auth.tid, id);
  if (!row) return apiError("Not found", 404);
  if (!row.isShared && row.ownerId !== auth.sub) return apiError("Not found", 404);
  // Bump lastOpenedAt
  await (prisma as any).adHocView.update({ where: { id }, data: { lastOpenedAt: new Date() }});
  return apiResponse({ ...row, mine: row.ownerId === auth.sub });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const { id } = await ctx.params;
  const row = await load(auth.tid, id);
  if (!row || row.ownerId !== auth.sub) return apiError("Not found or not yours", 404);
  const body = await req.json().catch(() => null);
  if (!body) return apiError("Invalid JSON", 400);
  const updated = await (prisma as any).adHocView.update({
    where: { id },
    data: {
      name: body.name ?? row.name,
      description: body.description ?? row.description,
      isShared: body.isShared ?? row.isShared,
      spec: body.spec ?? row.spec,
    },
  });
  return apiResponse(updated);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const { id } = await ctx.params;
  const row = await load(auth.tid, id);
  if (!row || row.ownerId !== auth.sub) return apiError("Not found or not yours", 404);
  await (prisma as any).adHocView.delete({ where: { id }});
  return apiResponse({ deleted: true });
}
