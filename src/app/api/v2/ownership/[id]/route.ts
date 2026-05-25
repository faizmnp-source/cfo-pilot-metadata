import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const { id } = await ctx.params;
  const row = await (prisma as any).entityOwnership.findFirst({ where: { id, tenantId: auth.tid }});
  if (!row) return apiError("Not found", 404);
  await (prisma as any).entityOwnership.delete({ where: { id }});
  return apiResponse({ deleted: true });
}
