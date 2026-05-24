import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;

  const url = new URL(req.url);
  const where: Record<string, any> = { tenantId: auth.tid };

  const scenarioId = url.searchParams.get("scenarioId");
  const timeId     = url.searchParams.get("timeId");
  const entityId   = url.searchParams.get("entityId");
  const accountId  = url.searchParams.get("accountId");
  if (!scenarioId || !timeId || !entityId || !accountId) {
    return apiError("scenarioId, timeId, entityId, accountId are required", 400);
  }
  where.scenarioId = scenarioId;
  where.timeId     = timeId;
  where.entityId   = entityId;
  where.accountId  = accountId;

  for (const k of ["icpId","ud1Id","ud2Id","ud3Id","ud4Id","ud5Id","ud6Id","ud7Id","ud8Id"]) {
    const v = url.searchParams.get(k);
    if (v !== null) where[k] = v === "" ? null : v;
  }

  const facts = await prisma.factRow.findMany({
    where, orderBy: [{ version: "desc" }, { postedAt: "desc" }], take: 50,
  });
  if (facts.length === 0) {
    return apiResponse({ intersection: where, timeline: [], origins: [], authors: [], loadBatches: [], calcRuleRuns: [], processRuns: [], notes: [], summary: { versionCount: 0, currentVersion: null, firstPostedAt: null, lastPostedAt: null }});
  }

  const originIds     = Array.from(new Set(facts.map(f => f.originId).filter(Boolean)));
  const authorIds     = Array.from(new Set(facts.map(f => f.postedBy).filter(Boolean)));
  const loadBatchIds  = Array.from(new Set(facts.map(f => f.loadBatchId).filter(Boolean) as string[]));
  const calcRunIds    = Array.from(new Set(facts.map(f => (f as any).calcRunId).filter(Boolean) as string[]));
  const processRunIds = Array.from(new Set(facts.map(f => (f as any).processRunId).filter(Boolean) as string[]));

  const [origins, authors, loadBatches, calcRuleRuns, processRuns, notes] = await Promise.all([
    originIds.length ? prisma.dimensionMember.findMany({ where: { id: { in: originIds }}, select: { id: true, memberCode: true, memberName: true }}) : Promise.resolve([]),
    authorIds.length ? prisma.user.findMany({ where: { id: { in: authorIds }}, select: { id: true, email: true, name: true }}) : Promise.resolve([]),
    loadBatchIds.length ? prisma.loadBatch.findMany({ where: { id: { in: loadBatchIds }, tenantId: auth.tid }}) : Promise.resolve([]),
    calcRunIds.length ? prisma.calcRuleRun.findMany({ where: { id: { in: calcRunIds }, tenantId: auth.tid }, include: { rule: { select: { id: true, code: true, name: true, kind: true }}}}) : Promise.resolve([]),
    processRunIds.length ? prisma.processRun.findMany({ where: { id: { in: processRunIds }, tenantId: auth.tid }}) : Promise.resolve([]),
    (prisma as any).lineageNote.findMany({
      where: { tenantId: auth.tid, scenarioId,
        OR: [{ timeId: null }, { timeId }],
        AND: [{ OR: [{ entityId: null }, { entityId }]}, { OR: [{ accountId: null }, { accountId }]}],
        isArchived: false },
      orderBy: { createdAt: "desc" }, take: 20,
    }).catch(() => []),
  ]);

  const timeline = facts.map(f => ({
    id: f.id.toString(), version: f.version, isCurrent: f.isCurrent,
    valueTxn: Number(f.valueTxn), valueLocal: Number(f.valueLocal), valueReporting: Number(f.valueReporting),
    currencyId: f.currencyId, originId: f.originId, loadBatchId: f.loadBatchId,
    calcRunId: (f as any).calcRunId ?? null, processRunId: (f as any).processRunId ?? null, prevVersionId: (f as any).prevVersionId ?? null,
    postedBy: f.postedBy, postedAt: f.postedAt, updatedAt: f.updatedAt,
  }));

  return apiResponse({
    intersection: where, timeline, origins, authors, loadBatches, calcRuleRuns, processRuns, notes,
    summary: {
      versionCount: facts.length,
      currentVersion: facts.find(f => f.isCurrent)?.version ?? null,
      firstPostedAt: facts[facts.length - 1]?.postedAt ?? null,
      lastPostedAt: facts[0]?.postedAt ?? null,
    },
  });
}
