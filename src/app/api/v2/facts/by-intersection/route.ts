// POST /api/v2/facts/by-intersection
// Body: { scenarioId, timeId, entityId, accountId, includeAllVersions?: boolean }
//   timeId can be a parent (FY/QTR) — we resolve to its leaf months.
// Returns: { facts: Array<{...full FactRow + origin/postedBy labels}>, total }
//
// Powers the third drill level on /explore — drill from KPI →
// top contributors → individual fact rows with full metadata.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const body = await req.json().catch(() => null);
  if (!body?.scenarioId || !body?.timeId || !body?.entityId || !body?.accountId) {
    return apiError("scenarioId, timeId, entityId, accountId are required", 400);
  }

  // Resolve time leaves (so a FY click expands to 12 months)
  const { resolveTimeMembersToLeafMonths } = await import("@/lib/reports/time-resolver");
  const yearCode = (await prisma.dimensionMember.findFirst({
    where: { id: body.timeId, tenantId: auth.tid },
    select: { memberCode: true },
  }))?.memberCode;
  const leafIds: string[] = yearCode
    ? (await resolveTimeMembersToLeafMonths(auth.tid, yearCode)).leafMonthIds
    : [body.timeId];

  const facts = await prisma.factRow.findMany({
    where: {
      tenantId: auth.tid,
      scenarioId: body.scenarioId,
      entityId: body.entityId,
      accountId: body.accountId,
      timeId: { in: leafIds },
      isCurrent: body.includeAllVersions ? undefined : true,
    },
    orderBy: [{ timeId: "asc" }, { version: "desc" }],
    take: 500,
  });

  // Hydrate origin + user + time labels
  const originIds = Array.from(new Set(facts.map(f => f.originId)));
  const userIds   = Array.from(new Set(facts.map(f => f.postedBy)));
  const timeIds   = Array.from(new Set(facts.map(f => f.timeId)));
  const icpIds    = Array.from(new Set(facts.map(f => f.icpId).filter(Boolean) as string[]));
  const [origins, users, times, icps] = await Promise.all([
    originIds.length ? prisma.dimensionMember.findMany({ where: { id: { in: originIds }}, select: { id: true, memberCode: true, memberName: true }}) : Promise.resolve([]),
    userIds.length   ? prisma.user.findMany({ where: { id: { in: userIds }}, select: { id: true, email: true, name: true }}) : Promise.resolve([]),
    timeIds.length   ? prisma.dimensionMember.findMany({ where: { id: { in: timeIds }}, select: { id: true, memberCode: true }}) : Promise.resolve([]),
    icpIds.length    ? prisma.dimensionMember.findMany({ where: { id: { in: icpIds }}, select: { id: true, memberCode: true, memberName: true }}) : Promise.resolve([]),
  ]);

  const originById = new Map(origins.map(o => [o.id, o]));
  const userById   = new Map(users.map(u   => [u.id, u]));
  const timeById   = new Map(times.map(t   => [t.id, t]));
  const icpById    = new Map(icps.map(i    => [i.id, i]));

  return apiResponse({
    facts: facts.map(f => ({
      id: f.id.toString(),
      scenarioId: f.scenarioId, accountId: f.accountId, entityId: f.entityId,
      timeId: f.timeId, timeCode: timeById.get(f.timeId)?.memberCode ?? "?",
      currencyId: f.currencyId,
      icpId: f.icpId, icpCode: icpById.get(f.icpId)?.memberCode ?? null,
      originId: f.originId, originCode: originById.get(f.originId)?.memberCode ?? "?",
      originName: originById.get(f.originId)?.memberName ?? "?",
      version: f.version, isCurrent: f.isCurrent,
      valueTxn: Number(f.valueTxn), valueLocal: Number(f.valueLocal), valueReporting: Number(f.valueReporting),
      postedBy: f.postedBy,
      postedByLabel: userById.get(f.postedBy)?.name ?? userById.get(f.postedBy)?.email ?? "?",
      postedAt: f.postedAt,
      loadBatchId: f.loadBatchId,
      calcRunId: (f as any).calcRunId ?? null,
      processRunId: (f as any).processRunId ?? null,
    })),
    total: facts.length,
  });
}
