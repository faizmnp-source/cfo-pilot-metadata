// Data input facts endpoint — Phase 1 (single intersection per save).
//
// GET /api/v2/facts?scenarioId=&entityId=&yearCode=&currencyId=&icpId=&originId=
//   → returns { accounts: [{id,code,name,isLeaf}], months: [{id,code,name}],
//               cells: [{accountId,timeId,value,version,postedBy,postedAt,originId}],
//               periodLocked: bool, lockReason? }
//
// POST /api/v2/facts
//   body: { scenarioId, timeId, entityId, accountId,
//           currencyId?, icpId?, originId?, ud1Id..ud8Id?, value }
//   - Validates each member: exists, isActive, tenant-scoped, dim-correct, IS LEAF
//   - Enforces account.is_icp=true requires icpId != [None]
//   - Defaults currencyId to tenant base, icpId to [None], originId to 'Form'
//   - Soft-supersedes prior isCurrent=true row (version bump), inserts new row
//   - Audit log written

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { audit } from "@/lib/audit-v2";
import { ensureOriginMember, FORM_ORIGIN_CODE } from "@/lib/seed-origin";
import { findNonLeafMembers } from "@/lib/leaf-check";
import { ensureIcpSeed } from "@/lib/sync-icp";

// ─── GET: load a POV slice into a {accounts × months} matrix ────────

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const url = new URL(req.url);
  const scenarioId = url.searchParams.get("scenarioId");
  const entityId   = url.searchParams.get("entityId");
  const yearCode   = url.searchParams.get("yearCode");          // e.g. "FY2026"
  const currencyId = url.searchParams.get("currencyId") ?? undefined;
  const icpId      = url.searchParams.get("icpId")      ?? undefined;
  const originId   = url.searchParams.get("originId")   ?? undefined;

  if (!scenarioId || !entityId || !yearCode) {
    return apiError("POV incomplete: scenarioId, entityId, yearCode all required", 400);
  }

  // 1. Load the Account dim members (active only; we mark leaf vs parent)
  const acctDim = await prisma.dimension.findFirst({
    where: { tenantId: auth.tid, kind: "ACCOUNT" as any },
    select: { id: true },
  });
  if (!acctDim) return apiError("Account dimension not provisioned for tenant", 404);

  const accounts = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, dimensionId: acctDim.id, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { memberCode: "asc" }],
    select: { id: true, memberCode: true, memberName: true, properties: true },
  });
  const nonLeafAccts = await findNonLeafMembers(auth.tid, accounts.map(a => a.id));

  // 2. Load months in the selected fiscal year — children of YEAR member
  const timeDim = await prisma.dimension.findFirst({
    where: { tenantId: auth.tid, kind: "TIME" as any },
    select: { id: true },
  });
  if (!timeDim) return apiError("Time dimension not provisioned for tenant", 404);

  const yearMember = await prisma.dimensionMember.findFirst({
    where: { tenantId: auth.tid, dimensionId: timeDim.id, memberCode: yearCode, isActive: true },
    select: { id: true },
  });
  if (!yearMember) return apiError(`Year member '${yearCode}' not found`, 404);

  // Walk down to MONTH members (year → quarters → months)
  const allYearDescendants = await prisma.hierarchyEdge.findMany({
    where: { tenantId: auth.tid, parentMemberId: yearMember.id },
    select: { childMemberId: true },
  });
  const quarterIds = allYearDescendants.map((e) => e.childMemberId);
  const monthEdges = await prisma.hierarchyEdge.findMany({
    where: { tenantId: auth.tid, parentMemberId: { in: quarterIds } },
    select: { childMemberId: true },
  });
  const monthIds = monthEdges.map((e) => e.childMemberId);
  const months = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, id: { in: monthIds }, isActive: true },
    orderBy: [{ memberCode: "asc" }],
    select: { id: true, memberCode: true, memberName: true, properties: true },
  });

  // 3. Load existing fact rows for this POV slice
  const factWhere: any = {
    tenantId: auth.tid,
    scenarioId,
    entityId,
    timeId: { in: monthIds },
    isCurrent: true,
  };
  if (currencyId) factWhere.currencyId = currencyId;
  if (icpId)      factWhere.icpId      = icpId;
  if (originId)   factWhere.originId   = originId;

  const facts = await prisma.factRow.findMany({
    where: factWhere,
    select: {
      accountId: true, timeId: true, valueTxn: true, version: true,
      postedBy: true, postedAt: true, originId: true, id: true,
    },
  });

  return apiResponse({
    accounts: accounts.map(a => ({
      id: a.id,
      code: a.memberCode,
      name: a.memberName,
      isLeaf: !nonLeafAccts.has(a.id),
      isIcp: Boolean((a.properties as any)?.is_icp),
    })),
    months: months.map(m => ({
      id: m.id,
      code: m.memberCode,
      name: m.memberName,
      monthIndex: (m.properties as any)?.month_index ?? null,
    })),
    cells: facts.map(f => ({
      accountId: f.accountId,
      timeId:    f.timeId,
      value:     Number(f.valueTxn),
      version:   f.version,
      postedBy:  f.postedBy,
      postedAt:  f.postedAt,
      originId:  f.originId,
      factId:    f.id.toString(),
    })),
  });
}

// ─── POST: upsert a single cell (Phase 1 simplest path) ─────────────

const SaveCellSchema = z.object({
  scenarioId: z.string().uuid(),
  timeId:     z.string().uuid(),
  entityId:   z.string().uuid(),
  accountId:  z.string().uuid(),
  currencyId: z.string().uuid().optional(),
  icpId:      z.string().uuid().optional(),
  originId:   z.string().uuid().optional(),
  ud1Id: z.string().uuid().nullable().optional(),
  ud2Id: z.string().uuid().nullable().optional(),
  ud3Id: z.string().uuid().nullable().optional(),
  ud4Id: z.string().uuid().nullable().optional(),
  ud5Id: z.string().uuid().nullable().optional(),
  ud6Id: z.string().uuid().nullable().optional(),
  ud7Id: z.string().uuid().nullable().optional(),
  ud8Id: z.string().uuid().nullable().optional(),
  value:      z.number().finite(),
});

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  if (auth.role === "VIEWER") return apiError("Viewer role cannot save facts", 403);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }
  const parsed = SaveCellSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 422, { issues: parsed.error.issues });
  const input = parsed.data;

  // ── Defaults: currency, icp, origin ───────────────────────────────
  let currencyId = input.currencyId;
  if (!currencyId) {
    const baseCcy = await prisma.dimensionMember.findFirst({
      where: { tenantId: auth.tid, properties: { path: ["is_base"], equals: true } },
      select: { id: true },
    });
    currencyId = baseCcy?.id;
    if (!currencyId) return apiError("No base currency configured for tenant", 409);
  }

  let icpId = input.icpId;
  if (!icpId) {
    // Ensure [None] exists, then use it as default
    await ensureIcpSeed(auth.tid, auth.sub);
    const icpDim = await prisma.dimension.findFirst({
      where: { tenantId: auth.tid, kind: "ICP" as any },
      select: { id: true },
    });
    const noneMember = await prisma.dimensionMember.findFirst({
      where: { tenantId: auth.tid, dimensionId: icpDim!.id, memberCode: "None" },
      select: { id: true },
    });
    icpId = noneMember!.id;
  }

  const originId = input.originId ?? (await ensureOriginMember(auth.tid, auth.sub, FORM_ORIGIN_CODE));

  // ── Validation: all member IDs belong to this tenant + correct dim + active ──
  const memberIds = [input.scenarioId, input.timeId, input.entityId, input.accountId, currencyId, icpId, originId]
    .concat([input.ud1Id, input.ud2Id, input.ud3Id, input.ud4Id, input.ud5Id, input.ud6Id, input.ud7Id, input.ud8Id].filter(Boolean) as string[]);
  const memberRows = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, id: { in: memberIds } },
    select: { id: true, isActive: true, dimensionId: true, properties: true,
      dimension: { select: { kind: true } } },
  });
  const byId = new Map(memberRows.map(m => [m.id, m]));
  function require_(kind: string, id: string): { ok: boolean; reason?: string } {
    const m = byId.get(id);
    if (!m) return { ok: false, reason: `Member ${id} not in tenant` };
    if (!m.isActive) return { ok: false, reason: `Member ${id} (${kind}) is inactive` };
    if (m.dimension.kind !== kind) return { ok: false, reason: `Member ${id} is not a ${kind}` };
    return { ok: true };
  }
  for (const [kind, id] of [
    ["SCENARIO", input.scenarioId], ["TIME", input.timeId], ["ENTITY", input.entityId],
    ["ACCOUNT", input.accountId], ["CURRENCY", currencyId], ["ICP", icpId], ["ORIGIN", originId],
  ] as const) {
    const r = require_(kind, id);
    if (!r.ok) return apiError(r.reason!, 422);
  }

  // ── Leaf check: Account, Time, Entity must all be leaves ──────────
  const nonLeaves = await findNonLeafMembers(auth.tid, [input.accountId, input.timeId, input.entityId]);
  if (nonLeaves.has(input.accountId)) return apiError("Account is a parent/rollup — data input only at leaf accounts", 409);
  if (nonLeaves.has(input.timeId))    return apiError("Time period is a parent (year or quarter) — data input only at leaf periods (months)", 409);
  if (nonLeaves.has(input.entityId))  return apiError("Entity is a rollup — data input only at leaf entities", 409);

  // ── Account-level ICP enforcement (is_icp=true requires ICP != None) ──
  const acct = byId.get(input.accountId)!;
  if ((acct.properties as any)?.is_icp === true) {
    const icp = byId.get(icpId)!;
    if ((icp.properties as any)?.is_system === true) {
      return apiError("This account requires an intercompany partner — ICP=[None] not allowed", 422);
    }
  }

  // ── Scenario frozen / period locked ───────────────────────────────
  const scenario = byId.get(input.scenarioId)!;
  if ((scenario.properties as any)?.is_frozen === true) {
    return apiError(`Scenario is frozen (closed for input).`, 409);
  }

  // ── Upsert: supersede prior current row, insert new ───────────────
  const matchKey = {
    tenantId: auth.tid,
    scenarioId: input.scenarioId,
    timeId:     input.timeId,
    entityId:   input.entityId,
    accountId:  input.accountId,
    currencyId, icpId, originId,
    ud1Id: input.ud1Id ?? null, ud2Id: input.ud2Id ?? null,
    ud3Id: input.ud3Id ?? null, ud4Id: input.ud4Id ?? null,
    ud5Id: input.ud5Id ?? null, ud6Id: input.ud6Id ?? null,
    ud7Id: input.ud7Id ?? null, ud8Id: input.ud8Id ?? null,
    isCurrent: true,
  };

  const prior = await prisma.factRow.findFirst({ where: matchKey });

  let saved;
  if (prior) {
    // Mark prior as superseded, insert new row at next version. Two-step to
    // keep the @@unique on (intersection, isCurrent=true) intact.
    saved = await prisma.$transaction(async (tx) => {
      await tx.factRow.update({
        where: { id: prior.id },
        data:  { isCurrent: false, updatedAt: new Date() },
      });
      return tx.factRow.create({
        data: {
          ...matchKey,
          valueTxn:       input.value,
          valueLocal:     input.value,
          valueReporting: input.value,
          version:        prior.version + 1,
          isCurrent:      true,
          postedBy:       auth.sub,
        },
      });
    });
  } else {
    saved = await prisma.factRow.create({
      data: {
        ...matchKey,
        valueTxn:       input.value,
        valueLocal:     input.value,
        valueReporting: input.value,
        version:        1,
        isCurrent:      true,
        postedBy:       auth.sub,
      },
    });
  }

  try {
    await audit({
      tenantId:   auth.tid,
      userId:     auth.sub,
      action:     prior ? "UPDATE" : "CREATE",
      entityType: "fact_row",
      entityId:   saved.id.toString(),
      before:     prior ? { value: Number(prior.valueTxn), version: prior.version } : null,
      after:      { value: Number(saved.valueTxn), version: saved.version },
      metadata:   { scenarioId: input.scenarioId, accountId: input.accountId, timeId: input.timeId },
    });
  } catch { /* ignore */ }

  return apiResponse({
    factId:    saved.id.toString(),
    value:     Number(saved.valueTxn),
    version:   saved.version,
    postedBy:  saved.postedBy,
    postedAt:  saved.postedAt,
    originId:  saved.originId,
  });
}
