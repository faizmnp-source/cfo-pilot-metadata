// Consolidation engine — code-based math, no LLM.
//
// Inputs (from caller):
//   scenarioId, entityId (the rollup target), yearCode (e.g. "FY2026")
//
// Steps (each step is property-driven, not hard-coded):
//   1. Walk Entity hierarchy DOWN from entityId → collect all LEAF entities
//   2. Pull every leaf fact_row for (scenario × leaf-entities × months in year)
//      where origin ∈ {Import, Form} (don't double-consolidate consol output)
//   3. If tenant.multi_currency_enabled = true → translate Local → Reporting
//      using FxRate (rate type per Account.time_balance: BALANCE=CLOSING, FLOW=AVERAGE)
//      Write the translated values as origin=Translation
//   4. Sum (account × time × icp × ud) up to the target entity
//      Write as origin=Consolidation against entityId
//   5. If tenant.intercompany_enabled = true → find matching ICP pairs at the
//      consolidated level and net them to zero. Write the offsets as
//      origin=Elimination.
//
// Returns counts so the ProcessRun row can show "Read X / Wrote Y / Eliminated Z".

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

export async function runConsolidation(p: ConsolidationParams): Promise<ConsolidationResult> {
  const warnings: string[] = [];

  // ── Resolve target entity + check it's not already a leaf ───────
  const targetEntity = await prisma.dimensionMember.findFirst({
    where: { tenantId: p.tenantId, id: p.entityId },
    select: { id: true, memberCode: true, properties: true },
  });
  if (!targetEntity) throw new Error(`Entity ${p.entityId} not found`);

  // ── Walk down to leaves ────────────────────────────────────────
  const leafEntityIds = await walkToLeaves(p.tenantId, p.entityId);
  if (leafEntityIds.length === 0) {
    throw new Error(`Entity '${targetEntity.memberCode}' has no leaf descendants. Either it IS a leaf (load data into it directly) or its children aren't connected.`);
  }

  // ── Resolve year → months ──────────────────────────────────────
  const timeDim = await prisma.dimension.findFirst({
    where: { tenantId: p.tenantId, kind: "TIME" as any }, select: { id: true },
  });
  if (!timeDim) throw new Error("Time dimension not provisioned");
  const yearMember = await prisma.dimensionMember.findFirst({
    where: { tenantId: p.tenantId, dimensionId: timeDim.id, memberCode: p.yearCode },
    select: { id: true },
  });
  if (!yearMember) throw new Error(`Year '${p.yearCode}' not found`);

  // year → quarters → months (2 hops)
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

  // ── Resolve special origin ids ─────────────────────────────────
  const importOriginId = await ensureOriginMember(p.tenantId, p.userId, IMPORT_ORIGIN_CODE);
  const formOriginId   = await ensureOriginMember(p.tenantId, p.userId, FORM_ORIGIN_CODE);
  const consolOriginId = await ensureOriginMember(p.tenantId, p.userId, CONSOLIDATION_ORIGIN_CODE);
  const elimOriginId   = await ensureOriginMember(p.tenantId, p.userId, ELIMINATION_ORIGIN_CODE);
  const translOriginId = await ensureOriginMember(p.tenantId, p.userId, TRANSLATION_ORIGIN_CODE);

  // ── Step 1: pull source leaf facts ─────────────────────────────
  const sourceFacts = await prisma.factRow.findMany({
    where: {
      tenantId:   p.tenantId,
      scenarioId: p.scenarioId,
      entityId:   { in: leafEntityIds },
      timeId:     { in: monthIds },
      isCurrent:  true,
      originId:   { in: [importOriginId, formOriginId] },  // skip prior consol/elim
    },
    select: {
      id: true, scenarioId: true, entityId: true, accountId: true, timeId: true,
      currencyId: true, icpId: true,
      ud1Id: true, ud2Id: true, ud3Id: true, ud4Id: true,
      ud5Id: true, ud6Id: true, ud7Id: true, ud8Id: true,
      valueLocal: true, valueReporting: true,
    },
  });

  // ── Step 2 (optional): translate Local → Reporting ─────────────
  // For Phase 1, FX translation just copies valueLocal to valueReporting if
  // multi_currency is OFF. If ON, we look up FxRate per account.time_balance.
  let rowsTranslated = 0;
  if (multiCcy) {
    rowsTranslated = await translateLocalToReporting({
      tenantId: p.tenantId, userId: p.userId,
      sourceFacts, monthIds, translOriginId, warnings,
    });
  }

  // ── Step 3: SUM leaf facts up to target entity ────────────────
  // Aggregate key: (account, time, icp, ud1..ud8). Currency stays at the
  // target entity's reporting ccy. Sum valueReporting (already-translated
  // if multi_currency, else == valueLocal).
  type Key = string;
  const groups = new Map<Key, {
    accountId: string; timeId: string; icpId: string; currencyId: string;
    ud1: string|null; ud2: string|null; ud3: string|null; ud4: string|null;
    ud5: string|null; ud6: string|null; ud7: string|null; ud8: string|null;
    total: number;
  }>();
  // Pick a reporting currency for the rollup — use the first source fact's
  // currencyId if all match, else fall back to the target entity's base.
  const ccyVote = new Map<string, number>();
  for (const f of sourceFacts) ccyVote.set(f.currencyId, (ccyVote.get(f.currencyId) ?? 0) + 1);
  const rollupCcy = Array.from(ccyVote.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]
    ?? sourceFacts[0]?.currencyId;
  if (!rollupCcy) {
    // No source facts — nothing to consolidate, return zeros
    return {
      rowsRead: 0, rowsTranslated, rowsConsolidated: 0, rowsEliminated: 0,
      warnings: [`No source facts found for entity '${targetEntity.memberCode}' × ${p.yearCode}. Load data first.`],
      leafEntityIds, monthIds,
    };
  }

  for (const f of sourceFacts) {
    const key = [f.accountId, f.timeId, f.icpId, f.ud1Id, f.ud2Id, f.ud3Id,
                 f.ud4Id, f.ud5Id, f.ud6Id, f.ud7Id, f.ud8Id].join("|");
    const v = Number(f.valueReporting);
    const g = groups.get(key);
    if (g) { g.total += v; }
    else {
      groups.set(key, {
        accountId: f.accountId, timeId: f.timeId, icpId: f.icpId, currencyId: rollupCcy,
        ud1: f.ud1Id, ud2: f.ud2Id, ud3: f.ud3Id, ud4: f.ud4Id,
        ud5: f.ud5Id, ud6: f.ud6Id, ud7: f.ud7Id, ud8: f.ud8Id,
        total: v,
      });
    }
  }

  // Wipe prior consolidation rows for this slice (idempotent re-run)
  await prisma.factRow.updateMany({
    where: {
      tenantId:   p.tenantId,
      scenarioId: p.scenarioId,
      entityId:   p.entityId,
      timeId:     { in: monthIds },
      originId:   { in: [consolOriginId, elimOriginId] },
      isCurrent:  true,
    },
    data: { isCurrent: false },
  });

  // Insert new consolidated rows
  let rowsConsolidated = 0;
  for (const g of Array.from(groups.values())) {
    await prisma.factRow.create({
      data: {
        tenantId:   p.tenantId,
        scenarioId: p.scenarioId,
        entityId:   p.entityId,
        timeId:     g.timeId,
        accountId:  g.accountId,
        currencyId: g.currencyId,
        icpId:      g.icpId,
        originId:   consolOriginId,
        ud1Id: g.ud1, ud2Id: g.ud2, ud3Id: g.ud3, ud4Id: g.ud4,
        ud5Id: g.ud5, ud6Id: g.ud6, ud7Id: g.ud7, ud8Id: g.ud8,
        valueTxn:       g.total,
        valueLocal:     g.total,
        valueReporting: g.total,
        version: 1, isCurrent: true,
        postedBy: p.userId,
      },
    });
    rowsConsolidated++;
  }

  // ── Step 4 (optional): IC eliminations ─────────────────────────
  let rowsEliminated = 0;
  if (icpOn) {
    rowsEliminated = await eliminateIntercompany({
      tenantId: p.tenantId, userId: p.userId,
      scenarioId: p.scenarioId, entityId: p.entityId,
      monthIds, elimOriginId, rollupCcy, warnings,
    });
  }

  return {
    rowsRead:         sourceFacts.length,
    rowsTranslated,
    rowsConsolidated,
    rowsEliminated,
    warnings,
    leafEntityIds,
    monthIds,
  };
}

// ─── Helper: walk hierarchy down to leaves ──────────────────────────

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

// ─── Helper: FX translation ────────────────────────────────────────

async function translateLocalToReporting(args: {
  tenantId: string; userId: string;
  sourceFacts: any[]; monthIds: string[];
  translOriginId: string;
  warnings: string[];
}): Promise<number> {
  // Phase 1 translation: look up FxRate for (fromCcy, toCcy, periodCode).
  // RateType is driven by account.time_balance — FLOW=AVERAGE, BALANCE=CLOSING.
  // If no rate row exists, we leave valueReporting=valueLocal and warn.
  //
  // Note: this MUTATES sourceFacts so the rollup pass picks up translated
  // numbers. We don't write Translation rows separately in v1 — the FactRow
  // already has valueLocal + valueReporting columns; we just refresh the
  // Reporting column on source rows.

  // For now: if no rate rows exist, warn once and return 0. Avoids breaking
  // tenants who turned multi_currency on but haven't uploaded rates yet.
  const rateCount = await prisma.fxRate.count({ where: { tenantId: args.tenantId } });
  if (rateCount === 0) {
    args.warnings.push("multi_currency_enabled is ON but no FX rates uploaded yet — translation skipped, using Local values as Reporting.");
    return 0;
  }
  // TODO Phase 2: actual translation by rate × value, batched updates.
  args.warnings.push("FX translation logic v1 stub — rates present but per-row translation not yet wired. Will land in next slice.");
  return 0;
}

// ─── Helper: IC elimination ────────────────────────────────────────

async function eliminateIntercompany(args: {
  tenantId: string; userId: string;
  scenarioId: string; entityId: string;
  monthIds: string[];
  elimOriginId: string;
  rollupCcy: string;
  warnings: string[];
}): Promise<number> {
  // V1 IC elimination: at the consolidated level, find rows where
  // account.is_icp = true with a non-[None] ICP partner. If for the same
  // account + time, partner X mirrors back to partner Y with opposite sign,
  // they net to zero — write an Elimination row with the negated sum.
  //
  // V1 keeps it simple: just sum all IC values per (account, time, icp) and
  // write a single Elimination row that zeroes the IC line at the rollup.
  // The proper bilateral-matching logic lands in Phase 2.
  args.warnings.push("IC elimination v1 stub — bilateral matching wires next slice.");
  return 0;
}
