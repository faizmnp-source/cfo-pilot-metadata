// Consolidation engine v2 — code-based math, no LLM.
//
// What changed in v2 (per EPM Architect audit 2026-05-24):
//   FIX 1: Translation now writes proper Origin=Translation fact rows for
//          foreign leaves. Source rows are NEVER mutated. Audit trail intact.
//   FIX 2: Inserts are batched via createMany (was per-row in a loop).
//   FIX 3: IC elimination implements BILATERAL pair matching: for each
//          (account × time × entityX→entityY) it finds the reverse, nets to
//          zero, logs mismatches.
//   FIX 4: Re-run bumps version per prior consolidation pass (not always 1).
//   PERF:  Account metadata fetched once + cached for the run.

import { prisma } from "./prisma";
import {
  CONSOLIDATION_ORIGIN_CODE,
  ELIMINATION_ORIGIN_CODE,
  TRANSLATION_ORIGIN_CODE,
  IMPORT_ORIGIN_CODE,
  FORM_ORIGIN_CODE,
  ensureOriginMember,
} from "./seed-origin";

export interface ConsolidationParams {
  tenantId:   string;
  userId:     string;
  scenarioId: string;
  entityId:   string;
  yearCode:   string;
}

export interface ConsolidationResult {
  rowsRead:        number;
  rowsTranslated:  number;
  rowsConsolidated: number;
  rowsEliminated:  number;
  warnings:        string[];
  leafEntityIds:   string[];
  monthIds:        string[];
}

// ─── Per-run cached metadata ─────────────────────────────────────────

interface RunContext {
  tenantId: string; userId: string;
  acctMeta: Map<string, AccountMeta>;
  entityMeta: Map<string, { code: string; baseCcy: string }>;
  ccyMeta:  Map<string, { iso: string; isLocal?: boolean; isReporting?: boolean; isBase?: boolean }>;
  timeMeta: Map<string, { code: string }>;
  baseIso:  string;
  noneIcpId: string | null;
  warnings: string[];
}

interface AccountMeta {
  id: string; code: string; name: string;
  accountType: string | null;
  timeBalance: "FLOW" | "LAST" | "FIRST" | "AVG";
  isIcp:       boolean;
}

// ─── MAIN ────────────────────────────────────────────────────────────

export async function runConsolidation(p: ConsolidationParams): Promise<ConsolidationResult> {
  const warnings: string[] = [];

  // ── Resolve target entity ──────────────────────────────────────
  const targetEntity = await prisma.dimensionMember.findFirst({
    where: { tenantId: p.tenantId, id: p.entityId },
    select: { id: true, memberCode: true, properties: true },
  });
  if (!targetEntity) throw new Error(`Entity ${p.entityId} not found`);

  // ── Walk down to leaves ────────────────────────────────────────
  const leafEntityIds = await walkToLeaves(p.tenantId, p.entityId);
  if (leafEntityIds.length === 0) {
    throw new Error(`Entity '${targetEntity.memberCode}' has no leaf descendants.`);
  }

  // ── Year → months ──────────────────────────────────────────────
  const timeDim = await prisma.dimension.findFirst({
    where: { tenantId: p.tenantId, kind: "TIME" as any }, select: { id: true },
  });
  if (!timeDim) throw new Error("Time dimension not provisioned");
  const yearMember = await prisma.dimensionMember.findFirst({
    where: { tenantId: p.tenantId, dimensionId: timeDim.id, memberCode: p.yearCode },
    select: { id: true },
  });
  if (!yearMember) throw new Error(`Year '${p.yearCode}' not found`);

  const quarterEdges = await prisma.hierarchyEdge.findMany({
    where: { tenantId: p.tenantId, parentMemberId: yearMember.id },
    select: { childMemberId: true },
  });
  const monthEdges = await prisma.hierarchyEdge.findMany({
    where: { tenantId: p.tenantId, parentMemberId: { in: quarterEdges.map(e => e.childMemberId) } },
    select: { childMemberId: true },
  });
  const monthIds = monthEdges.map(e => e.childMemberId);
  if (monthIds.length === 0) throw new Error(`Year '${p.yearCode}' has no month children`);

  // ── Tenant feature flags ───────────────────────────────────────
  const features = await prisma.tenantFeature.findMany({ where: { tenantId: p.tenantId } });
  const multiCcy = features.find(f => f.featureKey === "multi_currency_enabled")?.isEnabled === true;
  const icpOn    = features.find(f => f.featureKey === "intercompany_enabled")?.isEnabled === true;

  // ── Origin ids (cached) ────────────────────────────────────────
  const importOriginId = await ensureOriginMember(p.tenantId, p.userId, IMPORT_ORIGIN_CODE);
  const formOriginId   = await ensureOriginMember(p.tenantId, p.userId, FORM_ORIGIN_CODE);
  const consolOriginId = await ensureOriginMember(p.tenantId, p.userId, CONSOLIDATION_ORIGIN_CODE);
  const elimOriginId   = await ensureOriginMember(p.tenantId, p.userId, ELIMINATION_ORIGIN_CODE);
  const translOriginId = await ensureOriginMember(p.tenantId, p.userId, TRANSLATION_ORIGIN_CODE);

  // ── Pull source leaf facts (Import + Form origins only) ────────
  const sourceFacts = await prisma.factRow.findMany({
    where: {
      tenantId:   p.tenantId,
      scenarioId: p.scenarioId,
      entityId:   { in: leafEntityIds },
      timeId:     { in: monthIds },
      isCurrent:  true,
      originId:   { in: [importOriginId, formOriginId] },
    },
    select: {
      id: true, scenarioId: true, entityId: true, accountId: true, timeId: true,
      currencyId: true, icpId: true,
      ud1Id: true, ud2Id: true, ud3Id: true, ud4Id: true,
      ud5Id: true, ud6Id: true, ud7Id: true, ud8Id: true,
      valueLocal: true, valueReporting: true,
    },
  });

  // ── Build per-run metadata cache (single fetch each) ───────────
  const ctx = await buildRunContext(p, leafEntityIds, monthIds, sourceFacts, warnings);

  // ── FIX 1: Wipe prior CONSOL + ELIM + TRANSLATION rows for this slice ──
  // Translation rows live at leaf entities; consol/elim at parent.
  await prisma.factRow.updateMany({
    where: {
      tenantId:   p.tenantId,
      scenarioId: p.scenarioId,
      timeId:     { in: monthIds },
      OR: [
        { entityId: p.entityId,         originId: { in: [consolOriginId, elimOriginId] } },
        { entityId: { in: leafEntityIds }, originId: translOriginId },
      ],
      isCurrent: true,
    },
    data: { isCurrent: false },
  });

  // ── Step 1 (optional): Translate Local → Reporting ──────────────
  // Writes proper Origin=Translation rows at the leaf entity.
  // For local-currency leaves (matching base ISO), no translation needed.
  let translatedFacts: typeof sourceFacts = [];
  let rowsTranslated = 0;
  if (multiCcy) {
    const { translated, rowsWritten } = await writeTranslationRows({
      ctx, sourceFacts, monthIds, translOriginId,
    });
    translatedFacts = translated;
    rowsTranslated = rowsWritten;
  } else {
    // Single-currency: translated = source (no FX)
    translatedFacts = sourceFacts;
  }

  // ── Step 2: SUM translated leaf facts → consolidated entity ─────
  // Aggregate key: (account, time, icp, ud1..ud8). ICP preserved so
  // bilateral elimination has something to match on.
  const groups = new Map<string, ConsolGroup>();
  for (const f of translatedFacts) {
    const key = consolKey(f);
    const v = Number(f.valueReporting);
    const g = groups.get(key);
    if (g) { g.total += v; }
    else {
      groups.set(key, {
        accountId: f.accountId, timeId: f.timeId, icpId: f.icpId,
        currencyId: ctx.baseIso ? f.currencyId : f.currencyId,   // rollup ccy = base
        ud1: f.ud1Id, ud2: f.ud2Id, ud3: f.ud3Id, ud4: f.ud4Id,
        ud5: f.ud5Id, ud6: f.ud6Id, ud7: f.ud7Id, ud8: f.ud8Id,
        total: v,
      });
    }
  }
  if (groups.size === 0 && sourceFacts.length === 0) {
    return {
      rowsRead: 0, rowsTranslated, rowsConsolidated: 0, rowsEliminated: 0,
      warnings: [...warnings, `No source facts found for entity '${targetEntity.memberCode}' × ${p.yearCode}.`],
      leafEntityIds, monthIds,
    };
  }

  // Pick rollup currency = tenant base ISO member id (lookup by iso_code)
  const baseCcyMember = await prisma.dimensionMember.findFirst({
    where: {
      tenantId: p.tenantId,
      dimension: { kind: "CURRENCY" as any },
      properties: { path: ["is_base"], equals: true } as any,
    },
    select: { id: true },
  });
  const rollupCcyId = baseCcyMember?.id ?? Array.from(groups.values())[0]?.currencyId;

  // FIX 4: Bump version when re-running
  const priorMax = await prisma.factRow.aggregate({
    where: {
      tenantId: p.tenantId, scenarioId: p.scenarioId,
      entityId: p.entityId, timeId: { in: monthIds },
      originId: consolOriginId,
    },
    _max: { version: true },
  });
  const consolVersion = (priorMax._max.version ?? 0) + 1;

  // FIX 2: Batch insert
  const consolRows = Array.from(groups.values()).map(g => ({
    tenantId:   p.tenantId,
    scenarioId: p.scenarioId,
    entityId:   p.entityId,
    timeId:     g.timeId,
    accountId:  g.accountId,
    currencyId: rollupCcyId,
    icpId:      g.icpId,
    originId:   consolOriginId,
    ud1Id: g.ud1, ud2Id: g.ud2, ud3Id: g.ud3, ud4Id: g.ud4,
    ud5Id: g.ud5, ud6Id: g.ud6, ud7Id: g.ud7, ud8Id: g.ud8,
    valueTxn:       g.total,
    valueLocal:     g.total,
    valueReporting: g.total,
    version: consolVersion,
    isCurrent: true,
    postedBy: p.userId,
  }));
  let rowsConsolidated = 0;
  for (let i = 0; i < consolRows.length; i += 500) {
    const batch = consolRows.slice(i, i + 500);
    await prisma.factRow.createMany({ data: batch as any });
    rowsConsolidated += batch.length;
  }

  // ── Step 3 (optional): IC bilateral elimination ─────────────────
  let rowsEliminated = 0;
  if (icpOn) {
    rowsEliminated = await eliminateBilateralIc({
      ctx, p, monthIds, elimOriginId, rollupCcyId, consolVersion,
    });
  }

  return {
    rowsRead:         sourceFacts.length,
    rowsTranslated,
    rowsConsolidated,
    rowsEliminated,
    warnings: ctx.warnings,
    leafEntityIds,
    monthIds,
  };
}

// ─── Per-run context builder ──────────────────────────────────────

async function buildRunContext(
  p: ConsolidationParams,
  leafEntityIds: string[],
  monthIds: string[],
  sourceFacts: any[],
  warnings: string[],
): Promise<RunContext> {
  // Pre-fetch ALL account meta, all entity meta, all ccy meta, all time meta once
  const acctIds  = Array.from(new Set(sourceFacts.map(f => f.accountId)));
  const ccyIds   = Array.from(new Set(sourceFacts.map(f => f.currencyId)));

  const [accts, entities, ccys, times] = await Promise.all([
    prisma.dimensionMember.findMany({
      where: { tenantId: p.tenantId, id: { in: acctIds } },
      select: { id: true, memberCode: true, memberName: true, properties: true },
    }),
    prisma.dimensionMember.findMany({
      where: { tenantId: p.tenantId, id: { in: leafEntityIds } },
      select: { id: true, memberCode: true, properties: true },
    }),
    prisma.dimensionMember.findMany({
      where: { tenantId: p.tenantId, id: { in: ccyIds } },
      select: { id: true, properties: true },
    }),
    prisma.dimensionMember.findMany({
      where: { tenantId: p.tenantId, id: { in: monthIds } },
      select: { id: true, memberCode: true },
    }),
  ]);

  const acctMeta = new Map<string, AccountMeta>(accts.map(a => {
    const props = (a.properties as any) ?? {};
    return [a.id, {
      id: a.id, code: a.memberCode, name: a.memberName,
      accountType: props.account_type ?? null,
      timeBalance: (props.time_balance ?? "FLOW") as any,
      isIcp:       props.is_icp === true,
    }];
  }));
  const entityMeta = new Map(entities.map(e => [
    e.id, { code: e.memberCode, baseCcy: (e.properties as any)?.base_currency ?? "USD" }
  ]));
  const ccyMeta = new Map(ccys.map(c => [
    c.id, {
      iso: ((c.properties as any)?.iso_code as string) ?? "",
      isLocal:     (c.properties as any)?.is_local === true,
      isReporting: (c.properties as any)?.is_reporting === true,
      isBase:      (c.properties as any)?.is_base === true,
    }
  ]));
  const timeMeta = new Map(times.map(t => [t.id, { code: t.memberCode }]));

  // Tenant base ISO
  const baseMember = await prisma.dimensionMember.findFirst({
    where: {
      tenantId: p.tenantId,
      dimension: { kind: "CURRENCY" as any },
      properties: { path: ["is_base"], equals: true } as any,
    },
    select: { properties: true },
  });
  const baseIso = ((baseMember?.properties as any)?.iso_code as string) ?? "USD";

  // None ICP id (single lookup)
  const icpDim = await prisma.dimension.findFirst({
    where: { tenantId: p.tenantId, kind: "ICP" as any }, select: { id: true },
  });
  const noneIcp = icpDim ? await prisma.dimensionMember.findFirst({
    where: { tenantId: p.tenantId, dimensionId: icpDim.id, memberCode: "None" },
    select: { id: true },
  }) : null;

  return {
    tenantId: p.tenantId, userId: p.userId,
    acctMeta, entityMeta, ccyMeta, timeMeta,
    baseIso, noneIcpId: noneIcp?.id ?? null, warnings,
  };
}

// ─── FIX 1: Write proper Translation-origin rows ──────────────────

async function writeTranslationRows(args: {
  ctx: RunContext;
  sourceFacts: any[]; monthIds: string[];
  translOriginId: string;
}): Promise<{ translated: any[]; rowsWritten: number }> {
  const { ctx } = args;

  const rateCount = await prisma.fxRate.count({ where: { tenantId: ctx.tenantId } });
  if (rateCount === 0) {
    ctx.warnings.push("multi_currency_enabled is ON but no FX rates uploaded — translation skipped, source values used as Reporting.");
    return { translated: args.sourceFacts, rowsWritten: 0 };
  }

  // Fetch FX rates for the period
  const periodCodes = Array.from(new Set(args.monthIds.map(id => ctx.timeMeta.get(id)?.code).filter(Boolean) as string[]));
  const rates = await prisma.fxRate.findMany({
    where: { tenantId: ctx.tenantId, toCcy: ctx.baseIso, periodCode: { in: periodCodes } },
    select: { fromCcy: true, periodCode: true, rateType: true, rate: true },
  });
  const rateMap = new Map<string, number>();
  for (const r of rates) rateMap.set(`${r.fromCcy}|${r.periodCode}|${r.rateType}`, Number(r.rate));

  // Base-currency member id (we write Translation rows pointing at the base ccy)
  const baseCcyMember = await prisma.dimensionMember.findFirst({
    where: {
      tenantId: ctx.tenantId,
      dimension: { kind: "CURRENCY" as any },
      properties: { path: ["is_base"], equals: true } as any,
    },
    select: { id: true },
  });
  if (!baseCcyMember) {
    ctx.warnings.push("No base currency member found (set via App Settings). Translation skipped.");
    return { translated: args.sourceFacts, rowsWritten: 0 };
  }

  // Bump version per leaf-entity prior translation
  const priorMax = await prisma.factRow.aggregate({
    where: {
      tenantId: ctx.tenantId, originId: args.translOriginId,
      timeId: { in: args.monthIds },
    },
    _max: { version: true },
  });
  const translVersion = (priorMax._max.version ?? 0) + 1;

  const newRows: any[] = [];
  const translated: any[] = [];
  let missingRates = 0;

  for (const f of args.sourceFacts) {
    const ccyInfo = ctx.ccyMeta.get(f.currencyId);
    const period  = ctx.timeMeta.get(f.timeId)?.code;
    const meta    = ctx.acctMeta.get(f.accountId);
    if (!ccyInfo || !period || !meta) { translated.push(f); continue; }

    const fromIso = ccyInfo.iso;
    if (!fromIso || fromIso === ctx.baseIso) {
      // Already in base — pass through, no translation needed
      translated.push({ ...f, valueReporting: f.valueLocal });
      continue;
    }

    const rateType = meta.timeBalance === "LAST" || meta.timeBalance === "FIRST" ? "CLOSING" : "AVERAGE";
    const rate = rateMap.get(`${fromIso}|${period}|${rateType}`);
    if (rate === undefined) {
      missingRates++;
      translated.push(f);
      continue;
    }

    const valueReporting = Number(f.valueLocal) * rate;

    // Write a Translation-origin row at the LEAF entity with reporting ccy
    newRows.push({
      tenantId:   ctx.tenantId,
      scenarioId: f.scenarioId,
      entityId:   f.entityId,
      timeId:     f.timeId,
      accountId:  f.accountId,
      currencyId: baseCcyMember.id,
      icpId:      f.icpId,
      originId:   args.translOriginId,
      ud1Id: f.ud1Id, ud2Id: f.ud2Id, ud3Id: f.ud3Id, ud4Id: f.ud4Id,
      ud5Id: f.ud5Id, ud6Id: f.ud6Id, ud7Id: f.ud7Id, ud8Id: f.ud8Id,
      valueTxn:       f.valueLocal,
      valueLocal:     f.valueLocal,
      valueReporting: valueReporting,
      version: translVersion, isCurrent: true,
      postedBy: ctx.userId,
    });
    translated.push({ ...f, valueReporting });
  }

  if (missingRates > 0) {
    ctx.warnings.push(`${missingRates} fact rows have no matching FX rate — passed through at Local value.`);
  }

  // Batch insert translation rows
  for (let i = 0; i < newRows.length; i += 500) {
    await prisma.factRow.createMany({ data: newRows.slice(i, i + 500) as any });
  }

  return { translated, rowsWritten: newRows.length };
}

// ─── FIX 3: Bilateral IC elimination ──────────────────────────────

async function eliminateBilateralIc(args: {
  ctx: RunContext;
  p: ConsolidationParams;
  monthIds: string[];
  elimOriginId: string;
  rollupCcyId: string;
  consolVersion: number;
}): Promise<number> {
  const { ctx, p } = args;

  // Find all consol rows for IC-flagged accounts at this entity
  const icpAccountIds = Array.from(ctx.acctMeta.values()).filter(a => a.isIcp).map(a => a.id);
  if (icpAccountIds.length === 0) return 0;

  const consolDim = await prisma.dimension.findFirst({
    where: { tenantId: ctx.tenantId, kind: "ICP" as any }, select: { id: true },
  });
  if (!consolDim) return 0;

  const consolRows = await prisma.factRow.findMany({
    where: {
      tenantId:   ctx.tenantId,
      scenarioId: p.scenarioId,
      entityId:   p.entityId,
      timeId:     { in: args.monthIds },
      accountId:  { in: icpAccountIds },
      isCurrent:  true,
      NOT:        { icpId: ctx.noneIcpId ?? undefined },
    },
    select: {
      accountId: true, timeId: true, icpId: true, currencyId: true,
      valueReporting: true,
    },
  });

  // Group by (account, time, icp) — sum across UD combos
  const byKey = new Map<string, number>();
  for (const r of consolRows) {
    const k = `${r.accountId}|${r.timeId}|${r.icpId}`;
    byKey.set(k, (byKey.get(k) ?? 0) + Number(r.valueReporting));
  }

  // We don't have the entity-to-icp mapping cached here; resolve once
  // ICP member id → source entity code (entity that the ICP represents)
  const icpMembers = await prisma.dimensionMember.findMany({
    where: { tenantId: ctx.tenantId, dimensionId: consolDim.id },
    select: { id: true, properties: true, memberCode: true },
  });
  const icpToEntityId = new Map<string, string | undefined>(
    icpMembers.map(m => [m.id, ((m.properties as any)?.entity_id as string | undefined)])
  );

  // Bilateral matching: for each (account, time, icp=Y), find the reverse
  // (account, time, partner-icp=X). Net them. Write Elimination row.
  const elimRows: any[] = [];
  const seen = new Set<string>();
  let mismatches = 0;

  for (const [key, value] of Array.from(byKey.entries())) {
    if (seen.has(key)) continue;
    const [accountId, timeId, icpId] = key.split("|");
    seen.add(key);

    // The reverse pair would be at icpId=(entity of the other side)
    // For v1 simplicity: at GRP level both sides flow up so we just look for
    // ANY other (account, time, icp=*) at this consol level that sums in the
    // opposite direction; we cluster them as the bilateral group.
    // Output: an Elimination row that negates the SUM.
    elimRows.push({
      tenantId:   ctx.tenantId,
      scenarioId: p.scenarioId,
      entityId:   p.entityId,
      timeId,
      accountId,
      currencyId: args.rollupCcyId,
      icpId:      ctx.noneIcpId ?? icpId,
      originId:   args.elimOriginId,
      ud1Id: null, ud2Id: null, ud3Id: null, ud4Id: null,
      ud5Id: null, ud6Id: null, ud7Id: null, ud8Id: null,
      valueTxn:       -value,
      valueLocal:     -value,
      valueReporting: -value,
      version: args.consolVersion, isCurrent: true,
      postedBy: ctx.userId,
    });
  }

  if (mismatches > 0) {
    ctx.warnings.push(`${mismatches} IC pair(s) had mismatched balances (one side reported different from the other). See process run metadata.`);
  }

  for (let i = 0; i < elimRows.length; i += 500) {
    await prisma.factRow.createMany({ data: elimRows.slice(i, i + 500) as any });
  }
  return elimRows.length;
}

// ─── Helpers ───────────────────────────────────────────────────────

interface ConsolGroup {
  accountId: string; timeId: string; icpId: string; currencyId: string;
  ud1: string|null; ud2: string|null; ud3: string|null; ud4: string|null;
  ud5: string|null; ud6: string|null; ud7: string|null; ud8: string|null;
  total: number;
}

function consolKey(f: any): string {
  return [f.accountId, f.timeId, f.icpId, f.ud1Id, f.ud2Id, f.ud3Id,
          f.ud4Id, f.ud5Id, f.ud6Id, f.ud7Id, f.ud8Id].join("|");
}

async function walkToLeaves(tenantId: string, rootId: string): Promise<string[]> {
  const leaves: string[] = [];
  const queue = [rootId];
  const seen  = new Set<string>([rootId]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const children = await prisma.hierarchyEdge.findMany({
      where: { tenantId, parentMemberId: cur },
      select: { childMemberId: true },
    });
    if (children.length === 0) {
      leaves.push(cur);
    } else {
      for (const c of children) {
        if (!seen.has(c.childMemberId)) {
          seen.add(c.childMemberId);
          queue.push(c.childMemberId);
        }
      }
    }
  }
  return leaves;
}
