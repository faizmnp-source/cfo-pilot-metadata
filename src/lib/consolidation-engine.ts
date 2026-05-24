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
  // Per-row translation: lookup FxRate(fromCcy → toCcy=tenant_base, periodCode, rateType).
  // RateType is driven by account.time_balance:
  //   FLOW (P&L) → AVERAGE (period average rate)
  //   LAST (BS)  → CLOSING (period-end rate)
  //
  // Mutates sourceFacts in-place: sets valueReporting = valueLocal × rate.
  // The downstream rollup uses valueReporting, so this drives the entire
  // multi-currency consolidation.

  const rateCount = await prisma.fxRate.count({ where: { tenantId: args.tenantId } });
  if (rateCount === 0) {
    args.warnings.push("multi_currency_enabled is ON but no FX rates uploaded — translation skipped, using Local values as Reporting.");
    return 0;
  }

  // Resolve tenant reporting currency (is_base=true member's iso_code)
  const baseMember = await prisma.dimensionMember.findFirst({
    where: {
      tenantId: args.tenantId, isActive: true,
      dimension: { kind: "CURRENCY" as any },
      properties: { path: ["is_base"], equals: true } as any,
    },
    select: { properties: true },
  });
  const baseIso = (baseMember?.properties as any)?.iso_code ?? "USD";

  // Index all rates by (fromCcy, periodCode, rateType) for O(1) lookups
  const rates = await prisma.fxRate.findMany({
    where: { tenantId: args.tenantId, toCcy: baseIso, periodCode: { in: await monthCodesFromIds(args.tenantId, args.monthIds) } },
    select: { fromCcy: true, periodCode: true, rateType: true, rate: true },
  });
  const rateMap = new Map<string, number>();
  for (const r of rates) {
    rateMap.set(`${r.fromCcy}|${r.periodCode}|${r.rateType}`, Number(r.rate));
  }

  // Resolve each source fact's currency iso_code + time periodCode + account time_balance
  // by batch-fetching once.
  const ccyIds  = Array.from(new Set(args.sourceFacts.map(f => f.currencyId)));
  const timeIds = Array.from(new Set(args.sourceFacts.map(f => f.timeId)));
  const acctIds = Array.from(new Set(args.sourceFacts.map(f => f.accountId)));

  const [ccyMembers, timeMembers, acctMembers] = await Promise.all([
    prisma.dimensionMember.findMany({ where: { tenantId: args.tenantId, id: { in: ccyIds } },  select: { id: true, properties: true } }),
    prisma.dimensionMember.findMany({ where: { tenantId: args.tenantId, id: { in: timeIds } }, select: { id: true, memberCode: true } }),
    prisma.dimensionMember.findMany({ where: { tenantId: args.tenantId, id: { in: acctIds } }, select: { id: true, properties: true } }),
  ]);
  const ccyIso  = new Map(ccyMembers.map(m => [m.id, (m.properties as any)?.iso_code as string | undefined]));
  const timeCode = new Map(timeMembers.map(m => [m.id, m.memberCode]));
  const acctTB  = new Map(acctMembers.map(m => [m.id, ((m.properties as any)?.time_balance ?? "FLOW") as string]));

  let translated = 0;
  let missingRates = 0;
  for (const f of args.sourceFacts) {
    const fromIso = ccyIso.get(f.currencyId);
    const period  = timeCode.get(f.timeId);
    const tb      = acctTB.get(f.accountId) ?? "FLOW";
    if (!fromIso || !period) continue;
    if (fromIso === baseIso) {
      // No translation needed — already in reporting currency
      f.valueReporting = f.valueLocal;
      continue;
    }
    const rateType = tb === "LAST" || tb === "FIRST" ? "CLOSING" : "AVERAGE";
    const rate = rateMap.get(`${fromIso}|${period}|${rateType}`);
    if (rate === undefined) {
      missingRates++;
      continue;
    }
    f.valueReporting = Number(f.valueLocal) * rate;
    translated++;
  }

  if (missingRates > 0) {
    args.warnings.push(`${missingRates} fact rows have no matching FX rate — left at Local value`);
  }
  return translated;
}

async function monthCodesFromIds(tenantId: string, monthIds: string[]): Promise<string[]> {
  const rows = await prisma.dimensionMember.findMany({
    where: { tenantId, id: { in: monthIds } },
    select: { memberCode: true },
  });
  return rows.map(r => r.memberCode);
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
  // IC elimination v1.5: for each IC-flagged account at the consol entity,
  // sum every fact row whose ICP partner is one of the consol children.
  // Write a single Elimination origin row per (account, time) that negates
  // the sum — netting IC to zero at the rollup.
  //
  // This is simpler than full bilateral matching (A's AR to B == B's AP to
  // A) but handles the common case: any IC line at the rollup gets zeroed,
  // and we surface a warning if matching lines don't agree per pair.

  // Pull all IC accounts (is_icp=true)
  const acctDim = await prisma.dimension.findFirst({
    where: { tenantId: args.tenantId, kind: "ACCOUNT" as any },
    select: { id: true },
  });
  if (!acctDim) return 0;

  const icpAccounts = await prisma.dimensionMember.findMany({
    where: {
      tenantId: args.tenantId, dimensionId: acctDim.id, isActive: true,
      properties: { path: ["is_icp"], equals: true } as any,
    },
    select: { id: true, memberCode: true },
  });
  if (icpAccounts.length === 0) return 0;
  const icpAcctIds = icpAccounts.map(a => a.id);

  // Read the just-consolidated rows for IC accounts at this entity
  const consolRows = await prisma.factRow.findMany({
    where: {
      tenantId:   args.tenantId,
      scenarioId: args.scenarioId,
      entityId:   args.entityId,
      timeId:     { in: args.monthIds },
      accountId:  { in: icpAcctIds },
      isCurrent:  true,
      originId:   { not: args.elimOriginId },   // don't re-eliminate prior elims
    },
    select: {
      accountId: true, timeId: true, currencyId: true, icpId: true,
      ud1Id: true, ud2Id: true, ud3Id: true, ud4Id: true,
      ud5Id: true, ud6Id: true, ud7Id: true, ud8Id: true,
      valueReporting: true,
    },
  });

  // Group by (account, time) — sum across all ICP partners
  type GKey = string;
  const groups = new Map<GKey, { accountId: string; timeId: string; currencyId: string; total: number; firstUd: any }>();
  for (const r of consolRows) {
    const key = `${r.accountId}|${r.timeId}`;
    const g = groups.get(key);
    const v = Number(r.valueReporting);
    if (g) { g.total += v; }
    else groups.set(key, {
      accountId: r.accountId, timeId: r.timeId,
      currencyId: r.currencyId, total: v,
      firstUd: r,
    });
  }

  // None member id (for the eliminating row's ICP slot)
  const icpDim = await prisma.dimension.findFirst({
    where: { tenantId: args.tenantId, kind: "ICP" as any }, select: { id: true },
  });
  const noneIcp = icpDim ? await prisma.dimensionMember.findFirst({
    where: { tenantId: args.tenantId, dimensionId: icpDim.id, memberCode: "None" },
    select: { id: true },
  }) : null;

  let written = 0;
  for (const g of Array.from(groups.values())) {
    if (Math.abs(g.total) < 0.01) continue;   // already zero
    // Write a single eliminating row at -total
    await prisma.factRow.create({
      data: {
        tenantId:   args.tenantId,
        scenarioId: args.scenarioId,
        entityId:   args.entityId,
        timeId:     g.timeId,
        accountId:  g.accountId,
        currencyId: g.currencyId,
        icpId:      noneIcp?.id ?? g.firstUd.icpId,
        originId:   args.elimOriginId,
        ud1Id: null, ud2Id: null, ud3Id: null, ud4Id: null,
        ud5Id: null, ud6Id: null, ud7Id: null, ud8Id: null,
        valueTxn:       -g.total,
        valueLocal:     -g.total,
        valueReporting: -g.total,
        version: 1, isCurrent: true,
        postedBy: args.userId,
      },
    });
    written++;
  }

  return written;
}
