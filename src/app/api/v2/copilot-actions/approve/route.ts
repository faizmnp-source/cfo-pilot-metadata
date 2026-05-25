// POST /api/v2/copilot-actions/approve
// Body: { actionId }
// Approves the action, executes it inline, returns the result.
// Executor lives in src/lib/packaging/copilot-actions.ts.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { executeAction } from "@/lib/packaging/copilot-actions";

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const body = await req.json().catch(() => null);
  if (!body?.actionId) return apiError("actionId is required", 400);

  const row = await (prisma as any).copilotAction.findFirst({ where: { id: body.actionId, tenantId: auth.tid }});
  if (!row) return apiError("Action not found", 404);
  if (row.status !== "PENDING_APPROVAL") return apiError(`Action status is ${row.status}, cannot approve`, 409);

  // Mark approved
  await (prisma as any).copilotAction.update({
    where: { id: row.id },
    data: { status: "APPROVED", approvedBy: auth.sub, approvedAt: new Date() },
  });

  // Execute
  try {
    const result = await executeAction(row.actionKind, row.args, { tenantId: auth.tid, userId: auth.sub });
    await (prisma as any).copilotAction.update({
      where: { id: row.id },
      data: { status: "EXECUTED", executedAt: new Date(), executionResult: result },
    });
    return apiResponse({ actionId: row.id, status: "EXECUTED", result });
  } catch (e: any) {
    await (prisma as any).copilotAction.update({
      where: { id: row.id },
      data: { status: "FAILED", executionError: String(e?.message ?? e) },
    });
    return apiError(`Execution failed: ${e?.message ?? e}`, 500);
  }
}
