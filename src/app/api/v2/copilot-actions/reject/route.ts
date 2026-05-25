import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const body = await req.json().catch(() => null);
  if (!body?.actionId) return apiError("actionId is required", 400);

  const row = await (prisma as any).copilotAction.findFirst({ where: { id: body.actionId, tenantId: auth.tid }});
  if (!row) return apiError("Action not found", 404);
  if (row.status !== "PENDING_APPROVAL") return apiError(`Action status is ${row.status}, cannot reject`, 409);

  await (prisma as any).copilotAction.update({
    where: { id: row.id },
    data: { status: "REJECTED", rejectedBy: auth.sub, rejectedAt: new Date(), rejectionReason: body.reason ?? null },
  });
  return apiResponse({ actionId: row.id, status: "REJECTED" });
}
