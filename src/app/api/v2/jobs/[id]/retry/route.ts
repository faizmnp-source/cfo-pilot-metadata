// POST /api/v2/jobs/[id]/retry
// Re-runs the most recent JobRun (or a specific runId if supplied).
// Creates a fresh JobRun with status=RETRYING + incremented retryCount.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const { id: jobId } = await ctx.params;
  const job = await prisma.automationJob.findFirst({ where: { id: jobId, tenantId: auth.tid }});
  if (!job) return apiError("Job not found", 404);

  const lastRun = await prisma.jobRun.findFirst({
    where: { tenantId: auth.tid, jobId }, orderBy: { startedAt: "desc" },
  });
  const retryCount = ((lastRun as any)?.retryCount ?? 0) + 1;
  // Exponential backoff: 60s → 2m → 4m → 8m (capped at 30m)
  const baseBackoff = (lastRun as any)?.retryBackoffMs ?? 60000;
  const nextBackoff = Math.min(30 * 60_000, baseBackoff * 2);

  const newRun = await prisma.jobRun.create({
    data: {
      tenantId: auth.tid, jobId,
      status: "RETRYING",
      triggeredBy: `retry:${auth.sub}`,
      ...(({ retryCount, retryBackoffMs: nextBackoff }) as any),
    },
  });
  return apiResponse({ runId: newRun.id, retryCount, nextBackoffMs: nextBackoff });
}
