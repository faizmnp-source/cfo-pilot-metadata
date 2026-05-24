// GET /api/v2/process-runs?kind=CONSOLIDATION&limit=20
// Lists recent ProcessRun rows for the tenant. Powers the run-history
// tables on /process/consolidation and /data/load/facts-import.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiResponse } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const url = new URL(req.url);
  const kind  = url.searchParams.get("kind") ?? undefined;
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);

  const where: any = { tenantId: auth.tid };
  if (kind) where.kind = kind;

  const runs = await prisma.processRun.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true, kind: true, status: true, params: true, summary: true,
      startedAt: true, finishedAt: true,
      rowsRead: true, rowsWritten: true, rowsErrored: true,
      error: true, startedBy: true,
    },
  });

  return apiResponse({
    data: runs.map((r: any) => ({
      ...r,
      durationMs: r.startedAt && r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null,
    })),
    total: runs.length,
  });
}
