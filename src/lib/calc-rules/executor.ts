// CalcRule executor — runs a saved rule's spec against fact_rows.
//
// v1 supports PERCENTAGE + SUM kinds — most common ad-hoc calcs. Other
// kinds throw with a clear message so user knows they're Phase 2.
//
// Writes output fact_rows tagged with the rule's output.origin.
// Uses createMany for batch insert (like consolidation v2).

import { prisma } from "@/lib/prisma";
import type { RuleSpec, RuleRunResult } from "./types";

const BATCH_SIZE = 500;

interface ExecutorContext {
  tenantId: string;
  triggeredBy: string;
}

export async function executeRule(
  ruleId: string,
  spec: RuleSpec,
  ctx: ExecutorContext
): Promise<RuleRunResult> {
  const startedAt = new Date();

  // Create run record (RUNNING)
  const run = await prisma.calcRuleRun.create({
    data: {
      tenantId: ctx.tenantId,
      ruleId,
      status: "RUNNING",
      triggeredBy: ctx.triggeredBy,
    },
  });

  try {
    // ─── Resolve filters → fact_row where clause ──────────────────────
    const where: any = { tenantId: ctx.tenantId };
    const f = spec.filters ?? {};

    if (f.scenarioId)  where.scenarioId  = f.scenarioId;
    if (f.entityIds?.length)  where.entityId  = { in: f.entityIds };
    if (f.accountIds?.length) where.accountId = { in: f.accountIds };
    if (f.periodCodes?.length) {
      // Period filter via Time member code lookup
      const periods = await prisma.dimensionMember.findMany({
        where: { tenantId: ctx.tenantId, dimension: { kind: "TIME" }, memberCode: { in: f.periodCodes }},
        select: { id: true },
      });
      where.timeId = { in: periods.map(p => p.id) };
    }

    // Account-type prefix filter (e.g. "4" for all revenue accounts)
    if (f.accountTypePrefix) {
      const accounts = await prisma.dimensionMember.findMany({
        where: { tenantId: ctx.tenantId, dimension: { kind: "ACCOUNT" }, memberCode: { startsWith: f.accountTypePrefix }},
        select: { id: true },
      });
      where.accountId = where.accountId
        ? { in: (where.accountId.in as string[]).filter(id => accounts.some(a => a.id === id)) }
        : { in: accounts.map(a => a.id) };
    }

    // ─── Read source facts ─────────────────────────────────────────────
    const sourceFacts = await prisma.factRow.findMany({
      where,
      take: 50_000,   // safety cap
    });

    // ─── Apply formula ─────────────────────────────────────────────────
    const outputAccountId = await resolveOutputAccountId(spec.output, ctx.tenantId);
    const outputScenarioId = await resolveOutputScenarioId(spec.output, ctx.tenantId);

    const origin = await prisma.dimensionMember.findFirst({
      where: { tenantId: ctx.tenantId, dimension: { kind: "ORIGIN" }, memberCode: spec.output.origin },
      select: { id: true },
    });
    if (!origin) throw new Error(`Origin '${spec.output.origin}' not seeded — run /api/__reset/origins`);

    const toWrite: any[] = [];
    for (const src of sourceFacts) {
      const newValue = applyFormula(spec.formula, Number(src.valueReporting));
      if (newValue === null) continue;

      toWrite.push({
        tenantId:     ctx.tenantId,
        accountId:    outputAccountId ?? src.accountId,
        entityId:     src.entityId,
        scenarioId:   outputScenarioId ?? src.scenarioId,
        timeId:       src.timeId,
        currencyId:   src.currencyId,
        icpId:        src.icpId,
        ud1Id:        src.ud1Id, ud2Id: src.ud2Id, ud3Id: src.ud3Id, ud4Id: src.ud4Id,
        ud5Id:        src.ud5Id, ud6Id: src.ud6Id, ud7Id: src.ud7Id, ud8Id: src.ud8Id,
        originId:     origin.id,
        valueTxn:       newValue,
        valueLocal:     newValue,
        valueReporting: newValue,   // assume same ccy; FX_CONVERT specialises later
        version:        1,
        isCurrent:      true,
        postedBy:       ctx.triggeredBy,
      });
    }

    // ─── Optional overwrite — delete prior same-origin same-output rows ─
    if (spec.output.overwriteExisting && toWrite.length) {
      const delWhere: any = { tenantId: ctx.tenantId, originId: origin.id };
      if (outputAccountId)  delWhere.accountId  = outputAccountId;
      if (outputScenarioId) delWhere.scenarioId = outputScenarioId;
      if (f.entityIds?.length)   delWhere.entityId = { in: f.entityIds };
      if (f.periodCodes?.length) {
        const periods = await prisma.dimensionMember.findMany({
          where: { tenantId: ctx.tenantId, dimension: { kind: "TIME" }, memberCode: { in: f.periodCodes }},
          select: { id: true },
        });
        delWhere.timeId = { in: periods.map(p => p.id) };
      }
      await prisma.factRow.deleteMany({ where: delWhere });
    }

    // ─── Batch insert ──────────────────────────────────────────────────
    let written = 0;
    for (let i = 0; i < toWrite.length; i += BATCH_SIZE) {
      const batch = toWrite.slice(i, i + BATCH_SIZE);
      const r = await prisma.factRow.createMany({ data: batch, skipDuplicates: false });
      written += r.count;
    }

    const finishedAt = new Date();
    await prisma.calcRuleRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCEEDED",
        finishedAt,
        rowsRead: sourceFacts.length,
        rowsWritten: written,
      },
    });
    await prisma.calcRule.update({
      where: { id: ruleId },
      data: { lastRunAt: finishedAt, lastRunBy: ctx.triggeredBy, runCount: { increment: 1 }},
    });

    return {
      status:      "SUCCEEDED",
      rowsRead:    sourceFacts.length,
      rowsWritten: written,
      startedAt:   startedAt.toISOString(),
      finishedAt:  finishedAt.toISOString(),
      message:     `Read ${sourceFacts.length}, wrote ${written}.`,
    };
  } catch (e: any) {
    const finishedAt = new Date();
    await prisma.calcRuleRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt, errorMessage: e?.message ?? String(e) },
    });
    return {
      status:       "FAILED",
      rowsRead:     0,
      rowsWritten:  0,
      startedAt:    startedAt.toISOString(),
      finishedAt:   finishedAt.toISOString(),
      errorMessage: e?.message ?? String(e),
    };
  }
}

function applyFormula(formula: RuleSpec["formula"], srcValue: number): number | null {
  switch (formula.kind) {
    case "percentage": {
      const base = formula.basis === "abs" ? Math.abs(srcValue) : srcValue;
      return base * formula.factor;
    }
    case "sum":
      return srcValue;     // SUM just passes through; aggregation happens implicitly
    case "fx_convert":
    case "allocation":
    case "comp_build":
    case "custom":
      throw new Error(`Formula kind '${formula.kind}' not yet supported in v1 executor.`);
    default:
      return null;
  }
}

async function resolveOutputAccountId(out: RuleSpec["output"], tenantId: string): Promise<string | null> {
  if (out.accountId) return out.accountId;
  if (out.accountCode) {
    const m = await prisma.dimensionMember.findFirst({
      where: { tenantId, dimension: { kind: "ACCOUNT" }, memberCode: out.accountCode },
      select: { id: true },
    });
    return m?.id ?? null;
  }
  return null;
}

async function resolveOutputScenarioId(out: RuleSpec["output"], tenantId: string): Promise<string | null> {
  if (out.scenarioId) return out.scenarioId;
  if (out.scenarioCode) {
    const m = await prisma.dimensionMember.findFirst({
      where: { tenantId, dimension: { kind: "SCENARIO" }, memberCode: out.scenarioCode },
      select: { id: true },
    });
    return m?.id ?? null;
  }
  return null;
}
