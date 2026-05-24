// Single snapshot detail + delete.
//
// GET    /api/v2/snapshots/[id]              — fetch metadata + first N rows of payload
// GET    /api/v2/snapshots/[id]?full=1       — fetch with FULL payload (heavy)
// DELETE /api/v2/snapshots/[id]              — soft-delete (status=DELETED) by default
// DELETE /api/v2/snapshots/[id]?hard=1       — hard-delete row

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const { id } = await params;
  const url = new URL(req.url);
  const full = url.searchParams.get("full") === "1";
  const previewN = Math.min(500, Math.max(0, parseInt(url.searchParams.get("preview") ?? "25")));

  const snap = await prisma.snapshot.findFirst({
    where: { id, tenantId: auth.tid },
  });
  if (!snap) return apiError("Snapshot not found", 404);

  const payloadArr = Array.isArray(snap.payload) ? (snap.payload as any[]) : [];
  const out: any = {
    id: snap.id,
    label: snap.label,
    description: snap.description,
    scope: snap.scope,
    scenarioCode: snap.scenarioCode,
    periodHint: snap.periodHint,
    factCount: snap.factCount,
    payloadBytes: snap.payloadBytes,
    status: snap.status,
    createdById: snap.createdById,
    createdAt: snap.createdAt,
    restoredAt: snap.restoredAt,
    restoredById: snap.restoredById,
  };
  if (full) {
    out.payload = payloadArr;
  } else {
    out.payloadPreview = payloadArr.slice(0, previewN);
    out.payloadPreviewCount = Math.min(previewN, payloadArr.length);
  }

  return apiResponse(out);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const { id } = await params;
  const url = new URL(req.url);
  const hard = url.searchParams.get("hard") === "1";

  const snap = await prisma.snapshot.findFirst({
    where: { id, tenantId: auth.tid },
    select: { id: true, status: true },
  });
  if (!snap) return apiError("Snapshot not found", 404);

  if (hard) {
    await prisma.snapshot.delete({ where: { id }});
    return apiResponse({ deleted: true, mode: "hard" });
  }
  await prisma.snapshot.update({ where: { id }, data: { status: "DELETED" }});
  return apiResponse({ deleted: true, mode: "soft" });
}
