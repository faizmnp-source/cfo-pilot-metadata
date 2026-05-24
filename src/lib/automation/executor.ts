// Automation job executor.
//
// v1 handles 3 of 6 job kinds:
//   - RUN_CONSOLIDATION  → triggers /api/v2/processes/consolidation
//   - RUN_CALC_RULE      → triggers /api/v2/calc-rules/[id]/run
//   - EXPORT_METADATA    → dumps all dim members to JSON (returned as output)
//
// Other kinds (EXPORT_FACTS, SEND_REPORT, RUN_PIPELINE) throw with clear msg
// so user knows they're Phase 2.
//
// Each run creates a JobRun row. Status: RUNNING → SUCCEEDED|FAILED.
// Output is stored as JSON in JobRun.output for later inspection.

import { prisma } from "@/lib/prisma";
import { executeRule } from "@/lib/calc-rules/executor";
import type { RuleSpec } from "@/lib/calc-rules/types";

interface ExecutorCtx {
  tenantId: string;
  triggeredBy: string;          // 'cron' | 'manual:<userId>'
  baseUrl: string;
  sessionCookie: string;
}

interface JobRunResult {
  status: "SUCCEEDED" | "FAILED";
  output: any;
  errorMessage?: string;
  startedAt: string;
  finishedAt: string;
}

export async function executeJob(
  jobId: string,
  ctx: ExecutorCtx
): Promise<JobRunResult> {
  const job = await prisma.automationJob.findFirst({
    where: { id: jobId, tenantId: ctx.tenantId },
  });
  if (!job) throw new Error("Job not found");

  const startedAt = new Date();
  const run = await prisma.jobRun.create({
    data: {
      tenantId: ctx.tenantId,
      jobId: job.id,
      status: "RUNNING",
      triggeredBy: ctx.triggeredBy,
    },
  });

  try {
    const params = (job.params ?? {}) as any;
    let output: any = null;

    switch (job.kind) {
      case "RUN_CONSOLIDATION": {
        const headers = { Cookie: ctx.sessionCookie, "Content-Type": "application/json" };
        const r = await fetch(`${ctx.baseUrl}/api/v2/processes/consolidation`, {
          method: "POST", headers,
          body: JSON.stringify({
            scenarioId: params.scenarioId,
            entityId:   params.entityId,
            yearCode:   params.yearCode,
          }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? `Consolidation ${r.status}`);
        output = { kind: "consolidation_result", summary: j?.data?.summary ?? j?.data ?? j };
        break;
      }

      case "RUN_CALC_RULE": {
        if (!params.ruleId) throw new Error("params.ruleId is required");
        const rule = await prisma.calcRule.findFirst({
          where: { id: params.ruleId, tenantId: ctx.tenantId },
        });
        if (!rule) throw new Error(`Calc rule ${params.ruleId} not found`);
        if (rule.status !== "ACTIVE") throw new Error(`Rule '${rule.code}' not ACTIVE (status: ${rule.status})`);

        const result = await executeRule(
          rule.id,
          rule.spec as unknown as RuleSpec,
          { tenantId: ctx.tenantId, triggeredBy: `automation:${job.id}` }
        );
        output = { kind: "calc_rule_result", ruleCode: rule.code, ...result };
        if (result.status === "FAILED") throw new Error(result.errorMessage ?? "Rule execution failed");
        break;
      }

      case "EXPORT_METADATA": {
        // Dump all active dim members (with their dimension.kind)
        const members = await prisma.dimensionMember.findMany({
          where: { tenantId: ctx.tenantId, isActive: true },
          select: {
            id: true, memberCode: true, memberName: true, properties: true,
            dimension: { select: { kind: true }},
          },
        });
        const edgeCount = await prisma.hierarchyEdge.count({ where: { tenantId: ctx.tenantId }});
        const flat = members.map(m => ({
          id: m.id, kind: m.dimension.kind, memberCode: m.memberCode,
          memberName: m.memberName, properties: m.properties,
        }));
        output = {
          kind: "metadata_export",
          exportedAt: new Date().toISOString(),
          counts: {
            members: flat.length,
            edges: edgeCount,
            byKind: flat.reduce((acc: any, m) => { acc[m.kind] = (acc[m.kind] ?? 0) + 1; return acc; }, {}),
          },
          // v1: full data not returned to UI; Phase 2 = write to S3/file
          preview: flat.slice(0, 10),
        };
        break;
      }

      case "EXPORT_FACTS":
      case "SEND_REPORT":
      case "RUN_PIPELINE":
        throw new Error(`Job kind '${job.kind}' not yet supported in v1 executor.`);

      default:
        throw new Error(`Unknown job kind: ${job.kind}`);
    }

    const finishedAt = new Date();
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: "SUCCEEDED", finishedAt, output },
    });
    await prisma.automationJob.update({
      where: { id: job.id },
      data: {
        lastRunAt: finishedAt,
        lastRunStatus: "SUCCEEDED",
        runCount: { increment: 1 },
      },
    });

    return {
      status: "SUCCEEDED",
      output,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    };
  } catch (e: any) {
    const finishedAt = new Date();
    const msg = e?.message ?? String(e);
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt, errorMessage: msg },
    });
    await prisma.automationJob.update({
      where: { id: job.id },
      data: {
        lastRunAt: finishedAt,
        lastRunStatus: "FAILED",
        runCount: { increment: 1 },
      },
    });
    return {
      status: "FAILED",
      output: null,
      errorMessage: msg,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    };
  }
}
