// Snapshot restore — Sprint T.3.
//
// POST /api/v2/snapshots/[id]/restore
// Body (all optional): { dryRun?: boolean, force?: boolean }
//
// Re-materialises a snapshot payload back into fact_rows. The captured
// scope (snapshot.scope) defines what to wipe; the payload defines what
// to write. Original `originId` values are preserved so lineage is
// roundtrip-faithful (Form rows restore as Form, Translation as
// Translation, etc.).
//
// Safety rails:
//   - status=DELETED         → 409 cannot restore a deleted snapshot
//   - status=RESTORED + !force → 409 already restored, pass force=true
//   - empty scope            → 400 full-tenant restore must be explicit
//                              (pass scope={} via capture; restore still blocks
//                              unless force=true AND dryRun=true confirms the
//                              wipe size). For v1 we just require force=true.
//   - dryRun=true            → preview { wouldWipe, wouldInsert } no writes
//
// Strategy: hard-delete current+superseded fact_rows inside snapshot.scope
// (so the unique constraint on (intersection,isCurrent) doesn't trip),
// then bulk-insert payload at version=1, isCurrent=true.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const { id } = await params;

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const dryRun = body.dryRun === true;
  const force  = body.force === true;

  const snap = await prisma.snapshot.findFirst({
    where: { id, tenantId: auth.tid },
  });
  if (!snap) return apiError("Snapshot not found", 404);

  if (snap.status === "DELETED") {
    return apiError("Cannot restore a deleted snapshot. Hard-delete and re-capture.", 409);
  }
  if (snap.status === "RESTORED" && !force) {
    return apiError("Snapshot already restored. Pass { force: true } to re-restore.", 409);
  }

  const payload = Array.isArray(snap.payload) ? (snap.payload as any[]) : [];
  if (payload.length === 0) {
    return apiError("Snapshot payload is empty — nothing to restore.", 400);
  }

  // ── Resolve scope filters → ids (same logic as capture) ───────────
  const scope = (snap.scope && typeof snap.scope === "object") ? (snap.scope as any) : {};
  const scenarioCode: string | undefined = scope.scenarioCode || undefined;
  const entityCodes:  string[] = Array.isArray(scope.entityCodes)  ? scope.entityCodes  : [];
  const periodCodes:  string[] = Array.isArray(scope.periodCodes)  ? scope.periodCodes  : [];
  const accountCodes: string[] = Array.isArray(scope.accountCodes) ? scope.accountCodes : [];

  const isFullTenant = !scenarioCode && !entityCodes.length && !periodCodes.length && !accountCodes.length;
  if (isFullTenant && !force) {
    return apiError("Full-tenant restore is destructive. Pass { force: true } to confirm.", 409);
  }

  let scenarioId: string | undefined;
  if (scenarioCode) {
    const scn = await prisma.dimensionMember.findFirst({
      where: { tenantId: auth.tid, dimension: { kind: "SCENARIO" }, memberCode: scenarioCode },
      select: { id: true },
    });
    if (!scn) return apiError(`Scenario '${scenarioCode}' no longer exists`, 400);
    scenarioId = scn.id;
  }

  let entityIds: string[] | undefined;
  if (entityCodes.length) {
    const ents = await prisma.dimensionMember.findMany({
      where: { tenantId: auth.tid, dimension: { kind: "ENTITY" }, memberCode: { in: entityCodes }},
      select: { id: true, memberCode: true },
    });
    entityIds = ents.map(e => e.id);
    if (entityIds.length !== entityCodes.length) {
      const missing = entityCodes.filter(c => !ents.find(e => e.memberCode === c));
      return apiError(`Entities no longer exist: ${missing.join(", ")}`, 400);
    }
  }

  let timeIds: string[] | undefined;
  if (periodCodes.length) {
    const allLeafIds = new Set<string>();
    for (const code of periodCodes) {
      try {
        const { resolveTimeMembersToLeafMonths } = await import("@/lib/reports/time-resolver");
        const { leafMonthIds } = await resolveTimeMembersToLeafMonths(auth.tid, code);
        leafMonthIds.forEach(i => allLeafIds.add(i));
      } catch { /* fall through */ }
    }
    if (allLeafIds.size === 0) {
      const tm = await prisma.dimensionMember.findMany({
        where: { tenantId: auth.tid, dimension: { kind: "TIME" }, memberCode: { in: periodCodes }},
        select: { id: true },
      });
      tm.forEach(t => allLeafIds.add(t.id));
    }
    timeIds = Array.from(allLeafIds);
    if (timeIds.length === 0) return apiError("No time members resolved from periodCodes", 400);
  }

  let accountIds: string[] | undefined;
  if (accountCodes.length) {
    const accs = await prisma.dimensionMember.findMany({
      where: { tenantId: auth.tid, dimension: { kind: "ACCOUNT" }, memberCode: { in: accountCodes }},
      select: { id: true, memberCode: true },
    });
    accountIds = accs.map(a => a.id);
    if (accountIds.length !== accountCodes.length) {
      const missing = accountCodes.filter(c => !accs.find(a => a.memberCode === c));
      return apiError(`Accounts no longer exist: ${missing.join(", ")}`, 400);
    }
  }

  // ── Build wipe scope ──────────────────────────────────────────────
  const wipeWhere: any = { tenantId: auth.tid };
  if (scenarioId)         wipeWhere.scenarioId = scenarioId;
  if (entityIds?.length)  wipeWhere.entityId   = { in: entityIds };
  if (timeIds?.length)    wipeWhere.timeId     = { in: timeIds };
  if (accountIds?.length) wipeWhere.accountId  = { in: accountIds };

  const wipeCount = await prisma.factRow.count({ where: wipeWhere });

  // ── Validate payload member-ids still exist ───────────────────────
  // Cheap pre-flight: each row references scenario/time/entity/account/icp/origin/currency
  // plus optional ud1..ud8. We check they all still exist in dimension_member.
  const refIds = new Set<string>();
  for (const r of payload) {
    refIds.add(r.scenarioId); refIds.add(r.timeId);
    refIds.add(r.entityId);   refIds.add(r.accountId);
    refIds.add(r.currencyId); refIds.add(r.icpId);
    refIds.add(r.originId);
    for (const k of ["ud1Id","ud2Id","ud3Id","ud4Id","ud5Id","ud6Id","ud7Id","ud8Id"] as const) {
      if (r[k]) refIds.add(r[k]);
    }
  }
  const known = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, id: { in: Array.from(refIds) }},
    select: { id: true },
  });
  const knownSet = new Set(known.map(k => k.id));
  const missing = Array.from(refIds).filter(i => !knownSet.has(i));
  if (missing.length) {
    return apiError(
      `${missing.length} dimension member id(s) referenced by snapshot payload no longer exist. ` +
      `Restore would fail FK constraints. (First 3: ${missing.slice(0,3).join(", ")})`,
      409,
    );
  }

  // ── Dry run: report what would happen, no writes ─────────────────
  if (dryRun) {
    return apiResponse({
      dryRun: true,
      snapshotId: snap.id,
      label:      snap.label,
      scope,
      wouldWipe:    wipeCount,
      wouldInsert:  payload.length,
      scopeIsFullTenant: isFullTenant,
    });
  }

  // ── Execute restore in a transaction ──────────────────────────────
  // Hard-delete to avoid unique-constraint collisions on (intersection,isCurrent).
  // The snapshot itself IS the historical record; we don't need supersede chains.
  let rowsInserted = 0;
  let rowsWiped = 0;
  await prisma.$transaction(async (tx) => {
    const del = await tx.factRow.deleteMany({ where: wipeWhere });
    rowsWiped = del.count;

    const restoredAt = new Date();
    const postedBy = `restore:${auth.sub}`;

    const toInsert = payload.map(r => ({
      tenantId:   auth.tid,
      scenarioId: r.scenarioId,
      timeId:     r.timeId,
      entityId:   r.entityId,
      accountId:  r.accountId,
      currencyId: r.currencyId,
      icpId:      r.icpId,
      originId:   r.originId,
      ud1Id: r.ud1Id ?? null, ud2Id: r.ud2Id ?? null,
      ud3Id: r.ud3Id ?? null, ud4Id: r.ud4Id ?? null,
      ud5Id: r.ud5Id ?? null, ud6Id: r.ud6Id ?? null,
      ud7Id: r.ud7Id ?? null, ud8Id: r.ud8Id ?? null,
      valueTxn:       String(r.valueTxn ?? "0"),
      valueLocal:     String(r.valueLocal ?? r.valueTxn ?? "0"),
      valueReporting: String(r.valueReporting ?? r.valueTxn ?? "0"),
      version:        1,
      isCurrent:      true,
      postedBy,
      postedAt:       restoredAt,
    }));

    const BATCH = 500;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const r = await tx.factRow.createMany({
        data: toInsert.slice(i, i + BATCH) as any,
        skipDuplicates: false,
      });
      rowsInserted += r.count;
    }

    await tx.snapshot.update({
      where: { id: snap.id },
      data: {
        status:       "RESTORED",
        restoredAt,
        restoredById: auth.sub,
      },
    });
  }, { timeout: 60_000 });

  return apiResponse({
    restored:    true,
    snapshotId:  snap.id,
    label:       snap.label,
    rowsWiped,
    rowsInserted,
    scope,
    restoredAt:  new Date().toISOString(),
  });
}
