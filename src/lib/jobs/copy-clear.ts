/*
 * Enterprise job executors (Section 18): COPY_DATA + CLEAR_DATA.
 * Pure functions returning prisma-write plans.  Routes call these,
 * persist a JobRun + AuditLog entry, and write/delete FactRows.
 *
 * COPY_DATA:
 *   - Read source slice (scenario, time leaves, entity leaves, account scope)
 *   - Write to target slice with origin=Copy, version+=1, isCurrent=true
 *   - Mark prior current versions at target as isCurrent=false
 *   - Optional value transform: { multiplyBy: 1.08 } seeds a 8% growth view
 *
 * CLEAR_DATA:
 *   - Mark all current facts at the target slice isCurrent=false
 *     (soft-clear: history preserved, lineage still resolvable).
 *   - Optional hardDelete:true wipes the rows entirely.
 */

import type { PrismaClient } from "@prisma/client";

export type CopyArgs = {
  sourceScenarioCode: string;
  sourcePeriodCode:   string;                       // FY/QTR/MONTH
  sourceEntityCodes?: string[];                     // empty/undef = all leaves
  sourceAccountCodes?: string[];                    // empty/undef = all accounts
  targetScenarioCode: string;
  targetPeriodCode?:   string;                      // optional override; defaults to source
  transform?: { multiplyBy?: number; addPercent?: number };
};

export type ClearArgs = {
  scenarioCode: string;
  periodCode:   string;
  entityCodes?: string[];
  accountCodes?: string[];
  hardDelete?: boolean;
};

export type JobResult = { rowsRead: number; rowsWritten: number; warnings: string[] };

export async function executeCopyJob(prisma: PrismaClient, tenantId: string, userId: string, args: CopyArgs): Promise<JobResult> {
  const warnings: string[] = [];
  const { resolveTimeMembersToLeafMonths } = await import("@/lib/reports/time-resolver");

  // Resolve members
  const srcScn = await prisma.dimensionMember.findFirst({ where: { tenantId, dimension: { code: "scenario" }, memberCode: args.sourceScenarioCode }});
  const tgtScn = await prisma.dimensionMember.findFirst({ where: { tenantId, dimension: { code: "scenario" }, memberCode: args.targetScenarioCode }});
  if (!srcScn || !tgtScn) throw new Error("Source or target scenario code not found");

  const { leafMonthIds: srcLeaves } = await resolveTimeMembersToLeafMonths(tenantId, args.sourcePeriodCode);
  const tgtCode = args.targetPeriodCode ?? args.sourcePeriodCode;
  const { leafMonthIds: tgtLeaves } = await resolveTimeMembersToLeafMonths(tenantId, tgtCode);
  if (srcLeaves.length === 0 || tgtLeaves.length === 0) throw new Error("Time period resolved to zero leaves");
  if (srcLeaves.length !== tgtLeaves.length) warnings.push(`Source has ${srcLeaves.length} leaves but target has ${tgtLeaves.length} — copying by ordered position.`);
  const tgtByIdx = (i: number) => tgtLeaves[Math.min(i, tgtLeaves.length - 1)];

  // Entity filter
  let entityIds: string[] | undefined;
  if (args.sourceEntityCodes?.length) {
    const ents = await prisma.dimensionMember.findMany({
      where: { tenantId, dimension: { code: "entity" }, memberCode: { in: args.sourceEntityCodes }},
      select: { id: true },
    });
    entityIds = ents.map(e => e.id);
  }
  // Account filter
  let accountIds: string[] | undefined;
  if (args.sourceAccountCodes?.length) {
    const accs = await prisma.dimensionMember.findMany({
      where: { tenantId, dimension: { code: "account" }, memberCode: { in: args.sourceAccountCodes }},
      select: { id: true },
    });
    accountIds = accs.map(a => a.id);
  }

  // Origin = "Copy" (fallback Calc)
  const origin = await prisma.dimensionMember.findFirst({
    where: { tenantId, dimension: { code: "origin" }, memberCode: { in: ["Copy","COPY","Calc","CALC"] }},
    orderBy: { memberCode: "asc" },
  });
  if (!origin) throw new Error("No suitable ORIGIN member found (Copy or Calc)");

  const facts = await prisma.factRow.findMany({
    where: {
      tenantId, scenarioId: srcScn.id, timeId: { in: srcLeaves },
      ...(entityIds ? { entityId: { in: entityIds }} : {}),
      ...(accountIds ? { accountId: { in: accountIds }} : {}),
      isCurrent: true,
    },
  });

  const mult = args.transform?.multiplyBy ?? (args.transform?.addPercent !== undefined ? 1 + args.transform.addPercent / 100 : 1);

  let written = 0;
  // Mark prior current rows at target slice as isCurrent=false (per row)
  for (const f of facts) {
    const srcIdx = srcLeaves.indexOf(f.timeId);
    const tgtTimeId = tgtByIdx(srcIdx);

    await prisma.factRow.updateMany({
      where: {
        tenantId, scenarioId: tgtScn.id, timeId: tgtTimeId,
        entityId: f.entityId, accountId: f.accountId, icpId: f.icpId, originId: origin.id, isCurrent: true,
      },
      data: { isCurrent: false },
    });
    await prisma.factRow.create({
      data: {
        tenantId, scenarioId: tgtScn.id, timeId: tgtTimeId, entityId: f.entityId, accountId: f.accountId,
        currencyId: f.currencyId, icpId: f.icpId, originId: origin.id,
        valueTxn: Number(f.valueTxn) * mult, valueLocal: Number(f.valueLocal) * mult, valueReporting: Number(f.valueReporting) * mult,
        ud1Id: f.ud1Id, ud2Id: f.ud2Id, ud3Id: f.ud3Id, ud4Id: f.ud4Id,
        ud5Id: f.ud5Id, ud6Id: f.ud6Id, ud7Id: f.ud7Id, ud8Id: f.ud8Id,
        postedBy: userId,
      },
    });
    written++;
  }
  return { rowsRead: facts.length, rowsWritten: written, warnings };
}

export async function executeClearJob(prisma: PrismaClient, tenantId: string, userId: string, args: ClearArgs): Promise<JobResult> {
  const warnings: string[] = [];
  const { resolveTimeMembersToLeafMonths } = await import("@/lib/reports/time-resolver");
  const scn = await prisma.dimensionMember.findFirst({ where: { tenantId, dimension: { code: "scenario" }, memberCode: args.scenarioCode }});
  if (!scn) throw new Error("Scenario not found");
  const { leafMonthIds } = await resolveTimeMembersToLeafMonths(tenantId, args.periodCode);

  const where: any = { tenantId, scenarioId: scn.id, timeId: { in: leafMonthIds }, isCurrent: true };
  if (args.entityCodes?.length) {
    const ents = await prisma.dimensionMember.findMany({ where: { tenantId, dimension: { code: "entity" }, memberCode: { in: args.entityCodes }}, select: { id: true }});
    where.entityId = { in: ents.map(e => e.id) };
  }
  if (args.accountCodes?.length) {
    const accs = await prisma.dimensionMember.findMany({ where: { tenantId, dimension: { code: "account" }, memberCode: { in: args.accountCodes }}, select: { id: true }});
    where.accountId = { in: accs.map(a => a.id) };
  }

  const rowsRead = await prisma.factRow.count({ where });
  if (args.hardDelete) {
    const del = await prisma.factRow.deleteMany({ where });
    return { rowsRead, rowsWritten: del.count, warnings: ["HARD DELETE — rows removed permanently"] };
  }
  const upd = await prisma.factRow.updateMany({ where, data: { isCurrent: false }});
  return { rowsRead, rowsWritten: upd.count, warnings };
}
