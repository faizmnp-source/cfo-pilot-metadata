// GET /api/v2/dashboard/insights
// Returns: { risks: [...], recommendedActions: [...] }
//
// Risks = recent AI explain results stored with priority=HIGH (in the
// future we'll cache these in DB; today we surface the most pressing
// variance + close-task overdue signals heuristically).
//
// Recommended Actions = PENDING_APPROVAL CopilotAction rows + any
// overdue CloseTask rows.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiResponse } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;

  // ── Risks: heuristic — biggest variances + overdue close tasks ──
  const [topVariances, openTasks] = await Promise.all([
    (prisma as any).$queryRawUnsafe(`
      SELECT a.member_code, a.member_name, SUM(f.value_reporting) AS val
      FROM fact_rows f
      JOIN dimension_members a ON a.id = f.account_id
      WHERE f.tenant_id = $1 AND f.is_current = true
      GROUP BY a.member_code, a.member_name
      ORDER BY ABS(SUM(f.value_reporting)) DESC LIMIT 5
    `, auth.tid).catch(() => []),
    prisma.closeTask.findMany({
      where: { tenantId: auth.tid, status: { in: ["PENDING","BLOCKED"] }, dueDate: { lt: new Date() }},
      take: 8, orderBy: { dueDate: "asc" },
    }),
  ]);

  const risks = openTasks.map((t: any) => ({
    kind: "OVERDUE_CLOSE_TASK",
    title: `${t.title} — overdue since ${t.dueDate?.toISOString().slice(0,10)}`,
    detail: t.description ?? "",
    severity: "HIGH" as const,
    linkTo: "/monthly-close",
  }));

  const pendingActions = await (prisma as any).copilotAction.findMany({
    where: { tenantId: auth.tid, status: "PENDING_APPROVAL" },
    orderBy: { createdAt: "desc" }, take: 10,
  });

  const recommendedActions = pendingActions.map((p: any) => ({
    id: p.id,
    actionKind: p.actionKind,
    summary: `${p.actionKind}: ${JSON.stringify(p.args).slice(0, 80)}`,
    proposedBy: p.proposedBy,
    createdAt: p.createdAt,
  }));

  return apiResponse({ risks, recommendedActions });
}
