// Monthly-Close API.
//
// GET   /api/v2/close-runs?period=2026M04
//   → returns the CloseRun for the period (auto-creates with default playbook if missing).
//   Response: { closeRun, tasks, stats }
//
// GET   /api/v2/close-runs
//   → returns recent close runs (history, no auto-create).
//
// PATCH /api/v2/close-runs?id=<runId>
//   → body: { status?: "OPEN"|"LOCKED"|"REOPENED", notes?: string }
//   → updates CloseRun. Lock action stamps closedAt + closedBy.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { DEFAULT_CLOSE_PLAYBOOK } from "@/lib/close-management/default-playbook";

function isValidPeriod(period: string) {
  // e.g. 2026M04 or 2026Q1 or 2026 — keep permissive
  return /^[0-9]{4}([MQ][0-9]{1,2})?$/.test(period);
}

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const url = new URL(req.url);
  const period = url.searchParams.get("period");

  // Listing mode — no period → return recent close runs.
  if (!period) {
    const runs = await prisma.closeRun.findMany({
      where: { tenantId: auth.tid },
      orderBy: { startedAt: "desc" },
      take: 24,
      include: { _count: { select: { tasks: true }}},
    });
    return apiResponse({ data: runs });
  }

  if (!isValidPeriod(period)) {
    return apiError("Invalid period format (expected e.g. 2026M04)", 400);
  }

  // Detail mode — fetch or auto-seed.
  let closeRun = await prisma.closeRun.findUnique({
    where: { tenantId_periodCode: { tenantId: auth.tid, periodCode: period }},
  });

  if (!closeRun) {
    // Seed the default playbook.
    closeRun = await prisma.closeRun.create({
      data: {
        tenantId:   auth.tid,
        periodCode: period,
        status:     "OPEN",
        createdBy:  auth.sub,
        tasks: {
          create: DEFAULT_CLOSE_PLAYBOOK.map(t => ({
            tenantId:         auth.tid,
            dayOffset:        t.dayOffset,
            category:         t.category,
            title:            t.title,
            description:      t.description,
            autoStatusOrigin: t.autoStatusOrigin ?? null,
            sortOrder:        t.sortOrder,
          })),
        },
      },
    });
  }

  const tasks = await prisma.closeTask.findMany({
    where: { closeRunId: closeRun.id, tenantId: auth.tid },
    orderBy: [{ dayOffset: "asc" }, { sortOrder: "asc" }],
  });

  // Stats roll-up.
  const stats = {
    total:       tasks.length,
    pending:     tasks.filter(t => t.status === "PENDING").length,
    inProgress:  tasks.filter(t => t.status === "IN_PROGRESS").length,
    done:        tasks.filter(t => t.status === "DONE").length,
    blocked:     tasks.filter(t => t.status === "BLOCKED").length,
    skipped:     tasks.filter(t => t.status === "SKIPPED").length,
    pctComplete: tasks.length
      ? Math.round((tasks.filter(t => t.status === "DONE").length / tasks.length) * 100)
      : 0,
  };

  return apiResponse({ closeRun, tasks, stats });
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return apiError("?id=<closeRunId> required", 400);

  let body: { status?: string; notes?: string };
  try { body = await req.json(); } catch { return apiError("Invalid JSON", 400); }

  const existing = await prisma.closeRun.findFirst({ where: { id, tenantId: auth.tid }});
  if (!existing) return apiError("CloseRun not found", 404);

  const update: Record<string, unknown> = {};
  if (body.notes !== undefined) update.notes = body.notes;

  if (body.status) {
    const next = body.status.toUpperCase();
    if (!["OPEN", "LOCKED", "REOPENED"].includes(next)) {
      return apiError("status must be OPEN | LOCKED | REOPENED", 400);
    }
    update.status = next;
    if (next === "LOCKED") {
      update.closedAt = new Date();
      update.closedBy = auth.sub;
    } else if (next === "REOPENED") {
      update.closedAt = null;
      update.closedBy = null;
    }
  }

  const updated = await prisma.closeRun.update({ where: { id }, data: update });
  return apiResponse(updated);
}
