// PATCH /api/v2/close-runs/[id]/tasks/[taskId]
//   body: { status?, owner?, notes?, dueDate? }
// Returns updated task.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { CLOSE_STATUSES } from "@/lib/close-management/default-playbook";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; taskId: string }},
) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  // Verify the close run belongs to this tenant.
  const run = await prisma.closeRun.findFirst({
    where: { id: params.id, tenantId: auth.tid },
  });
  if (!run) return apiError("CloseRun not found", 404);
  if (run.status === "LOCKED") {
    return apiError("Cannot modify tasks on a LOCKED close run. Re-open first.", 409);
  }

  const task = await prisma.closeTask.findFirst({
    where: { id: params.taskId, closeRunId: params.id, tenantId: auth.tid },
  });
  if (!task) return apiError("Task not found", 404);

  let body: { status?: string; owner?: string | null; notes?: string; dueDate?: string | null };
  try { body = await req.json(); } catch { return apiError("Invalid JSON", 400); }

  const update: Record<string, unknown> = {};

  if (body.status !== undefined) {
    const next = body.status.toUpperCase();
    if (!(CLOSE_STATUSES as readonly string[]).includes(next)) {
      return apiError(`status must be one of: ${CLOSE_STATUSES.join(", ")}`, 400);
    }
    update.status = next;
    if (next === "DONE") {
      update.completedAt = new Date();
      update.completedBy = auth.sub;
    } else if (task.status === "DONE" && next !== "DONE") {
      // Un-completing — clear stamps.
      update.completedAt = null;
      update.completedBy = null;
    }
  }

  if (body.owner !== undefined)  update.owner  = body.owner;
  if (body.notes !== undefined)  update.notes  = body.notes;
  if (body.dueDate !== undefined) {
    update.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  }

  const updated = await prisma.closeTask.update({
    where: { id: params.taskId },
    data: update,
  });

  return apiResponse(updated);
}
