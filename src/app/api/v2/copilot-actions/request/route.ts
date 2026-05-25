// POST /api/v2/copilot-actions/request
// Body: { actionKind, args, conversationId? }
// Returns: { actionId, status: "PENDING_APPROVAL", summary }
//
// Logs the proposed write action. UI surfaces it as a confirm dialog.
// Executor runs only after approve.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { describeAction, isKnownAction } from "@/lib/packaging/copilot-actions";

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const body = await req.json().catch(() => null);
  if (!body?.actionKind) return apiError("actionKind is required", 400);
  if (!isKnownAction(body.actionKind)) return apiError(`Unknown actionKind: ${body.actionKind}`, 400);

  const row = await (prisma as any).copilotAction.create({
    data: {
      tenantId: auth.tid,
      conversationId: body.conversationId ?? null,
      actionKind: body.actionKind,
      args: body.args ?? {},
      proposedBy: auth.sub,
    },
  });

  return apiResponse({
    actionId: row.id,
    status: row.status,
    summary: describeAction(body.actionKind, body.args ?? {}),
  });
}
