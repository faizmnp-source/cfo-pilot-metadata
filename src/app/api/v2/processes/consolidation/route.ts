// POST /api/v2/processes/consolidation
// Body: { scenarioId, entityId, yearCode }
// Runs the consolidation engine synchronously, creates a ProcessRun row,
// returns { processRunId, status, summary, counts }.

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { audit } from "@/lib/audit-v2";
import { runConsolidation } from "@/lib/consolidation-engine";

const InputSchema = z.object({
  scenarioId: z.string().uuid(),
  entityId:   z.string().uuid(),
  yearCode:   z.string().regex(/^FY\d{4}$/, "Year code must be FYxxxx (e.g. FY2026)"),
});

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  if (auth.role === "VIEWER") return apiError("Viewer role cannot run processes", 403);

  let body: any;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Validation failed", 422, { issues: parsed.error.issues });
  }
  const input = parsed.data;

  // Create the ProcessRun row up front so the run is visible in history
  // even if it crashes mid-flight.
  const run = await prisma.processRun.create({
    data: {
      tenantId: auth.tid,
      kind:     "CONSOLIDATION",
      params:   input as any,
      status:   "RUNNING",
      startedAt: new Date(),
      startedBy: auth.sub,
    },
  });

  try {
    const result = await runConsolidation({
      tenantId:   auth.tid,
      userId:     auth.sub,
      scenarioId: input.scenarioId,
      entityId:   input.entityId,
      yearCode:   input.yearCode,
    });

    const summary = [
      `Consolidated ${result.leafEntityIds.length} leaf entities`,
      `across ${result.monthIds.length} months`,
      `(read ${result.rowsRead}, wrote ${result.rowsConsolidated}`,
      result.rowsTranslated ? `, translated ${result.rowsTranslated}` : ``,
      result.rowsEliminated ? `, eliminated ${result.rowsEliminated}` : ``,
      `)`,
    ].filter(Boolean).join(" ");

    const updated = await prisma.processRun.update({
      where: { id: run.id },
      data: {
        status:      "SUCCEEDED",
        finishedAt:  new Date(),
        rowsRead:    result.rowsRead,
        rowsWritten: result.rowsConsolidated + result.rowsEliminated,
        rowsErrored: 0,
        summary,
        metadataSnapshot: { warnings: result.warnings, leafCount: result.leafEntityIds.length } as any,
      },
    });

    try {
      await audit({
        tenantId:   auth.tid,
        userId:     auth.sub,
        action:     "BULK_UPDATE",
        entityType: "fact_row",
        entityId:   run.id,
        metadata:   { op: "consolidation", ...input, summary } as any,
      });
    } catch { /* ignore */ }

    return apiResponse({
      processRunId: updated.id,
      status:       updated.status,
      summary:      updated.summary,
      counts: {
        rowsRead:        result.rowsRead,
        rowsConsolidated: result.rowsConsolidated,
        rowsTranslated:  result.rowsTranslated,
        rowsEliminated:  result.rowsEliminated,
      },
      warnings: result.warnings,
    });
  } catch (e: any) {
    await prisma.processRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: String(e?.message ?? e) },
    });
    return apiError(`Consolidation failed: ${e?.message ?? e}`, 500, { processRunId: run.id });
  }
}
