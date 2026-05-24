// GET /api/cron/automation
//
// Sprint S — autopilot for AutomationJobs whose `schedule != "manual"`.
//
// Authentication:
//   - Authorization: Bearer <CRON_SECRET>
//   - When CRON_SECRET is unset (local dev), the endpoint refuses to do
//     anything destructive — it returns a 503 with the list of jobs that
//     WOULD have fired. This makes local testing safe.
//
// Algorithm:
//   1. Find all enabled jobs across ALL tenants where:
//        - schedule != "manual"
//        - nextRunAt is NULL  (job has never been seeded)
//        OR nextRunAt <= now()
//   2. For each due job:
//        - Compute nextRunAt = nextRunFrom(schedule, now)
//        - Execute via executor (cron path — no session cookie)
//        - Persist nextRunAt
//   3. Return summary of fired jobs.
//
// Idempotency / overlap:
//   - Vercel cron can technically double-invoke; we serialize per-job by
//     reading job.nextRunAt fresh inside a transaction, advancing it BEFORE
//     execution. A second concurrent invocation will see the advanced
//     nextRunAt and skip.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, apiResponse } from "@/lib/utils";
import { executeJob } from "@/lib/automation/executor";
import { nextRunFrom } from "@/lib/automation/cron-parser";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel max for hobby plan

const BASE_URL_INTERNAL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3001";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  const now = new Date();

  // ?dry=1 returns due jobs without executing them. STILL requires the
  // CRON_SECRET bearer — we don't want to leak job metadata to anyone
  // who can probe public endpoints.
  const dryRun = req.nextUrl.searchParams.get("dry") === "1";

  if (!authorized(req)) {
    return apiError("Unauthorized", 401, {
      hint: "Set CRON_SECRET env var and call with Authorization: Bearer <secret>. Use ?dry=1 (still requires auth) to inspect due jobs without executing.",
    });
  }

  // Pull candidate jobs — anything enabled and not 'manual'.
  // We filter nextRunAt due-ness in JS (small N; Postgres index covers
  // {tenantId, enabled}).
  const candidates = await prisma.automationJob.findMany({
    where: {
      enabled: true,
      NOT: { schedule: "manual" },
    },
    select: {
      id: true,
      tenantId: true,
      code: true,
      name: true,
      kind: true,
      schedule: true,
      nextRunAt: true,
    },
  });

  const due = candidates.filter(j => j.nextRunAt === null || j.nextRunAt <= now);

  if (dryRun) {
    return apiResponse({
      now: now.toISOString(),
      mode: "dry-run",
      candidateCount: candidates.length,
      dueCount: due.length,
      due: due.map(j => ({
        id: j.id,
        tenantId: j.tenantId,
        code: j.code,
        name: j.name,
        kind: j.kind,
        schedule: j.schedule,
        nextRunAt: j.nextRunAt?.toISOString() ?? null,
        plannedNextRunAt: nextRunFrom(j.schedule, now)?.toISOString() ?? null,
      })),
    });
  }

  const fired: any[] = [];
  const skipped: any[] = [];
  const errors: any[] = [];

  for (const job of due) {
    // Advance nextRunAt FIRST (inside a conditional update — atomic).
    // The condition guarantees that if two cron invokes race, only one
    // will get the OK row update and proceed to execute.
    const planned = nextRunFrom(job.schedule, now);
    const upd = await prisma.automationJob.updateMany({
      where: {
        id: job.id,
        OR: [
          { nextRunAt: null },
          { nextRunAt: { lte: now }},
        ],
      },
      data: { nextRunAt: planned },
    });
    if (upd.count === 0) {
      skipped.push({ id: job.id, code: job.code, reason: "lost-race" });
      continue;
    }

    try {
      const result = await executeJob(job.id, {
        tenantId: job.tenantId,
        triggeredBy: "cron",
        baseUrl: BASE_URL_INTERNAL,
        sessionCookie: "",
      });
      fired.push({
        id: job.id, code: job.code, kind: job.kind,
        status: result.status,
        nextRunAt: planned?.toISOString() ?? null,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        errorMessage: result.errorMessage,
      });
    } catch (e: any) {
      errors.push({ id: job.id, code: job.code, error: e?.message ?? String(e) });
    }
  }

  return apiResponse({
    now: now.toISOString(),
    mode: "executed",
    candidateCount: candidates.length,
    dueCount: due.length,
    firedCount: fired.length,
    skippedCount: skipped.length,
    errorCount: errors.length,
    fired,
    skipped,
    errors,
  });
}
