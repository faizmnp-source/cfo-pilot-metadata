// Snapshot list + capture.
//
// GET  /api/v2/snapshots                  — list (excluding heavy payload)
// POST /api/v2/snapshots                  — capture a new snapshot
//   body: { label, description?, scope?: { scenarioCode?, entityCodes?, periodCodes?, accountCodes? }}
//
// Restore endpoint (Origin=Snapshot rematerialisation) ships in a follow-up.
// Pattern: payload is a JSON array of fact-row projections. No fact_rows
// constraint surgery needed; snapshots are fully independent of live data.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

// Hard cap to keep payload size sane. ~50K rows × ~250 bytes JSON each
// ≈ 12.5 MB JSON, comfortable for postgres JSONB and Vercel response size.
const MAX_SNAPSHOT_ROWS = 50_000;

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "100")));

  const rows = await prisma.snapshot.findMany({
    where: { tenantId: auth.tid, status: { not: "DELETED" }},
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    select: {
      id: true, label: true, description: true, scope: true,
      scenarioCode: true, periodHint: true,
      factCount: true, payloadBytes: true, status: true,
      createdById: true, createdAt: true,
      restoredAt: true, restoredById: true,
    },
  });

  return apiResponse({ data: rows });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  let body: any;
  try { body = await req.json(); } catch { return apiError("Invalid JSON", 400); }

  const label = String(body.label ?? "").trim();
  if (!label) return apiError("label is required", 400);
  const description = body.description != null ? String(body.description) : null;
  const scope = (body.scope && typeof body.scope === "object") ? body.scope : {};

  // Resolve scope codes -> ids
  const scenarioCode: string | undefined = scope.scenarioCode || undefined;
  const entityCodes: string[]            = Array.isArray(scope.entityCodes)   ? scope.entityCodes   : [];
  const periodCodes: string[]            = Array.isArray(scope.periodCodes)   ? scope.periodCodes   : [];
  const accountCodes: string[]           = Array.isArray(scope.accountCodes)  ? scope.accountCodes  : [];

  // Resolve scenario
  let scenarioId: string | undefined;
  if (scenarioCode) {
    const scn = await prisma.dimensionMember.findFirst({
      where: { tenantId: auth.tid, dimension: { kind: "SCENARIO" }, memberCode: scenarioCode },
      select: { id: true },
    });
    if (!scn) return apiError(`Scenario '${scenarioCode}' not found`, 400);
    scenarioId = scn.id;
  }

  // Resolve entities
  let entityIds: string[] | undefined;
  if (entityCodes.length) {
    const ents = await prisma.dimensionMember.findMany({
      where: { tenantId: auth.tid, dimension: { kind: "ENTITY" }, memberCode: { in: entityCodes }},
      select: { id: true, memberCode: true },
    });
    entityIds = ents.map(e => e.id);
    if (entityIds.length !== entityCodes.length) {
      const missing = entityCodes.filter(c => !ents.find(e => e.memberCode === c));
      return apiError(`Entities not found: ${missing.join(", ")}`, 400);
    }
  }

  // Resolve period codes -> time ids (these are leaf months; rollups not snapshotted)
  let timeIds: string[] | undefined;
  if (periodCodes.length) {
    // Support year/quarter codes via the universal time resolver
    const allLeafIds = new Set<string>();
    for (const code of periodCodes) {
      try {
        const { resolveTimeMembersToLeafMonths } = await import("@/lib/reports/time-resolver");
        const { leafMonthIds } = await resolveTimeMembersToLeafMonths(auth.tid, code);
        leafMonthIds.forEach(id => allLeafIds.add(id));
      } catch {
        // ignore resolver miss; fall through to exact memberCode match
      }
    }
    if (allLeafIds.size === 0) {
      // exact match fallback
      const tm = await prisma.dimensionMember.findMany({
        where: { tenantId: auth.tid, dimension: { kind: "TIME" }, memberCode: { in: periodCodes }},
        select: { id: true },
      });
      tm.forEach(t => allLeafIds.add(t.id));
    }
    timeIds = Array.from(allLeafIds);
    if (timeIds.length === 0) return apiError(`No time members resolved from periodCodes`, 400);
  }

  // Resolve accounts
  let accountIds: string[] | undefined;
  if (accountCodes.length) {
    const accs = await prisma.dimensionMember.findMany({
      where: { tenantId: auth.tid, dimension: { kind: "ACCOUNT" }, memberCode: { in: accountCodes }},
      select: { id: true, memberCode: true },
    });
    accountIds = accs.map(a => a.id);
    if (accountIds.length !== accountCodes.length) {
      const missing = accountCodes.filter(c => !accs.find(a => a.memberCode === c));
      return apiError(`Accounts not found: ${missing.join(", ")}`, 400);
    }
  }

  // Count first to decide whether to bail
  const where: any = { tenantId: auth.tid, isCurrent: true };
  if (scenarioId)        where.scenarioId = scenarioId;
  if (entityIds?.length) where.entityId   = { in: entityIds };
  if (timeIds?.length)   where.timeId     = { in: timeIds };
  if (accountIds?.length) where.accountId = { in: accountIds };

  const count = await prisma.factRow.count({ where });
  if (count > MAX_SNAPSHOT_ROWS) {
    return apiError(`Scope captures ${count} rows, exceeds ${MAX_SNAPSHOT_ROWS} limit. Narrow scope (scenarioCode / periodCodes / entityCodes).`, 413);
  }
  if (count === 0) {
    return apiError("Scope captures 0 rows. Nothing to snapshot.", 400);
  }

  // Pull facts
  const facts = await prisma.factRow.findMany({
    where,
    select: {
      scenarioId: true, timeId: true, entityId: true, accountId: true,
      currencyId: true, icpId: true, originId: true,
      ud1Id: true, ud2Id: true, ud3Id: true, ud4Id: true,
      ud5Id: true, ud6Id: true, ud7Id: true, ud8Id: true,
      valueTxn: true, valueLocal: true, valueReporting: true,
      postedBy: true, postedAt: true,
    },
  });

  // Resolve member codes for the dims that matter (for human-readable UI later)
  // Cheap: only ids that appear in the payload.
  const memberIds = new Set<string>();
  facts.forEach(f => {
    memberIds.add(f.scenarioId); memberIds.add(f.timeId);
    memberIds.add(f.entityId);   memberIds.add(f.accountId);
  });
  const members = await prisma.dimensionMember.findMany({
    where: { id: { in: Array.from(memberIds) }},
    select: { id: true, memberCode: true, dimension: { select: { kind: true }}},
  });
  const codeMap = new Map(members.map(m => [m.id, { code: m.memberCode, kind: m.dimension.kind }]));

  const payload = facts.map(f => ({
    scenarioId:   f.scenarioId,
    timeId:       f.timeId,
    entityId:     f.entityId,
    accountId:    f.accountId,
    currencyId:   f.currencyId,
    icpId:        f.icpId,
    originId:     f.originId,
    ud1Id: f.ud1Id, ud2Id: f.ud2Id, ud3Id: f.ud3Id, ud4Id: f.ud4Id,
    ud5Id: f.ud5Id, ud6Id: f.ud6Id, ud7Id: f.ud7Id, ud8Id: f.ud8Id,
    valueTxn:       f.valueTxn.toString(),
    valueLocal:     f.valueLocal.toString(),
    valueReporting: f.valueReporting.toString(),
    scenarioCode: codeMap.get(f.scenarioId)?.code ?? null,
    periodCode:   codeMap.get(f.timeId)?.code ?? null,
    entityCode:   codeMap.get(f.entityId)?.code ?? null,
    accountCode:  codeMap.get(f.accountId)?.code ?? null,
  }));

  const payloadJson = JSON.stringify(payload);
  const payloadBytes = Buffer.byteLength(payloadJson, "utf8");

  // Derive a period hint for sorting (most common periodCode in payload)
  const periodHistogram = new Map<string, number>();
  payload.forEach(p => {
    if (p.periodCode) periodHistogram.set(p.periodCode, (periodHistogram.get(p.periodCode) ?? 0) + 1);
  });
  const periodHint = Array.from(periodHistogram.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const snap = await prisma.snapshot.create({
    data: {
      tenantId:     auth.tid,
      label, description,
      scope:        scope,
      scenarioCode: scenarioCode ?? null,
      periodHint,
      payload:      payload as any,
      factCount:    payload.length,
      payloadBytes,
      status:       "READY",
      createdById:  auth.sub,
    },
    select: {
      id: true, label: true, description: true, scope: true,
      scenarioCode: true, periodHint: true,
      factCount: true, payloadBytes: true, status: true,
      createdById: true, createdAt: true,
    },
  });

  return apiResponse(snap, 201);
}
