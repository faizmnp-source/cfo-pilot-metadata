// Workforce headcount + comp write API.
//
// GET  /api/v2/workforce/headcount?positionId=&timeCode=
//   → returns HEADCOUNT_FTE + BASE_SALARY + BENEFITS + BONUS facts
//     for that position × period (or all positions if positionId omitted)
//
// POST /api/v2/workforce/headcount
//   body: { positionId, entityId, scenarioCode, periodCode,
//           headcountFte?, baseSalary?, benefits?, bonus? }
//   → upserts per-account facts (one per metric the user provided)
//   → tags Origin=Form
//
// Smart conveniences:
// - Auto-resolves account by code (HEADCOUNT_FTE, BASE_SALARY etc.) — caller doesn't pass account IDs
// - Auto-resolves scenario + time by code
// - Uses the entity's base_currency for the currency dim

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

// Standard workforce accounts (autoseed if not present)
const WORKFORCE_ACCOUNTS = ["HEADCOUNT_FTE", "BASE_SALARY", "BENEFITS", "BONUS"];

interface ResolvedRefs {
  positionId:    string;
  entityId:      string;
  scenarioId:    string;
  timeId:        string;
  currencyId:    string;
  originId:      string;
  accountIds:    Record<string, string>;   // code → id
}

async function resolveRefs(
  tenantId: string,
  body: any
): Promise<{ ok: ResolvedRefs } | { error: string; status: number }> {
  // Position (UD3)
  const position = await prisma.dimensionMember.findFirst({
    where: { tenantId, id: body.positionId, isActive: true },
    include: { dimension: true },
  });
  if (!position) return { error: "positionId not found or inactive", status: 404 };

  // Entity (we need its base_currency)
  const entity = await prisma.dimensionMember.findFirst({
    where: { tenantId, id: body.entityId, isActive: true },
  });
  if (!entity) return { error: "entityId not found or inactive", status: 404 };
  const baseCcyCode = (entity.properties as any)?.base_currency ?? "USD";

  // Scenario by code
  const scenario = await prisma.dimensionMember.findFirst({
    where: { tenantId, dimension: { kind: "SCENARIO" }, memberCode: body.scenarioCode ?? "ACTUAL" },
  });
  if (!scenario) return { error: `scenario ${body.scenarioCode} not found`, status: 404 };

  // Time by code (must be a leaf month YYYY-MM)
  const time = await prisma.dimensionMember.findFirst({
    where: { tenantId, dimension: { kind: "TIME" }, memberCode: body.periodCode },
  });
  if (!time) return { error: `period ${body.periodCode} not found (must exist in Time dim)`, status: 404 };

  // Currency by ISO code
  const currency = await prisma.dimensionMember.findFirst({
    where: { tenantId, dimension: { kind: "CURRENCY" }, memberCode: baseCcyCode },
  });
  if (!currency) return { error: `currency ${baseCcyCode} not seeded`, status: 500 };

  // Origin=Form
  const origin = await prisma.dimensionMember.findFirst({
    where: { tenantId, dimension: { kind: "ORIGIN" }, memberCode: "Form" },
  });
  if (!origin) return { error: "Origin 'Form' not seeded", status: 500 };

  // Workforce accounts (by code)
  const accs = await prisma.dimensionMember.findMany({
    where: { tenantId, dimension: { kind: "ACCOUNT" }, memberCode: { in: WORKFORCE_ACCOUNTS }, isActive: true },
    select: { id: true, memberCode: true },
  });
  const accountIds: Record<string, string> = {};
  for (const a of accs) accountIds[a.memberCode] = a.id;

  return {
    ok: {
      positionId: position.id,
      entityId:   entity.id,
      scenarioId: scenario.id,
      timeId:     time.id,
      currencyId: currency.id,
      originId:   origin.id,
      accountIds,
    },
  };
}

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const url = new URL(req.url);
  const positionId = url.searchParams.get("positionId");
  const timeCode   = url.searchParams.get("timeCode");      // any Time member

  // Resolve account IDs (read-only, no error if not seeded — return empty)
  const accs = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, dimension: { kind: "ACCOUNT" }, memberCode: { in: WORKFORCE_ACCOUNTS }, isActive: true },
    select: { id: true, memberCode: true },
  });
  const accountIdToCode = new Map(accs.map(a => [a.id, a.memberCode]));
  if (accs.length === 0) {
    return apiResponse({ facts: [], note: "No workforce accounts seeded yet (HEADCOUNT_FTE, BASE_SALARY, BENEFITS, BONUS)." });
  }

  // Build where clause
  const where: any = {
    tenantId:  auth.tid,
    accountId: { in: accs.map(a => a.id) },
    isCurrent: true,
  };
  if (positionId) where.ud3Id = positionId;
  if (timeCode) {
    // Use the universal time resolver to support FY/Q/H/Month
    const { resolveTimeMembersToLeafMonths } = await import("@/lib/reports/time-resolver");
    const { leafMonthIds } = await resolveTimeMembersToLeafMonths(auth.tid, timeCode);
    if (leafMonthIds.length) where.timeId = { in: leafMonthIds };
  }

  const facts = await prisma.factRow.findMany({
    where,
    select: {
      id: true, accountId: true, entityId: true, scenarioId: true, timeId: true,
      ud3Id: true, valueReporting: true,
    },
    take: 5000,
  });

  // Resolve referenced dim member codes in one batch each
  const allIds = (sel: (f: typeof facts[number]) => string) => Array.from(new Set(facts.map(sel)));
  const [accLookup, entLookup, scnLookup, tmLookup] = await Promise.all([
    prisma.dimensionMember.findMany({ where: { id: { in: allIds(f => f.accountId) }}, select: { id: true, memberCode: true }}),
    prisma.dimensionMember.findMany({ where: { id: { in: allIds(f => f.entityId)  }}, select: { id: true, memberCode: true, memberName: true }}),
    prisma.dimensionMember.findMany({ where: { id: { in: allIds(f => f.scenarioId)}}, select: { id: true, memberCode: true }}),
    prisma.dimensionMember.findMany({ where: { id: { in: allIds(f => f.timeId)    }}, select: { id: true, memberCode: true }}),
  ]);
  const byId = <T extends { id: string }>(arr: T[]) => new Map(arr.map(x => [x.id, x]));
  const accMap = byId(accLookup); const entMap = byId(entLookup);
  const scnMap = byId(scnLookup); const tmMap  = byId(tmLookup);

  return apiResponse({
    facts: facts.map(f => ({
      id: f.id.toString(),
      positionId: f.ud3Id,
      entity:     entMap.get(f.entityId)?.memberCode,
      entityName: entMap.get(f.entityId)?.memberName,
      scenario:   scnMap.get(f.scenarioId)?.memberCode,
      period:     tmMap.get(f.timeId)?.memberCode,
      account:    accMap.get(f.accountId)?.memberCode,
      value:      Number(f.valueReporting),
    })),
    accountsSeeded: accs.map(a => a.memberCode),
  });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  let body: any;
  try { body = await req.json(); } catch { return apiError("Invalid JSON", 400); }

  if (!body.positionId || !body.entityId || !body.periodCode) {
    return apiError("positionId, entityId, periodCode required", 400);
  }

  const res = await resolveRefs(auth.tid, body);
  if ("error" in res) return apiError(res.error, res.status);
  const refs = res.ok;

  // Build per-account fact writes for each metric the caller provided
  const metricInputs: { code: string; value: number }[] = [];
  if (body.headcountFte !== undefined) metricInputs.push({ code: "HEADCOUNT_FTE", value: Number(body.headcountFte) });
  if (body.baseSalary  !== undefined) metricInputs.push({ code: "BASE_SALARY",   value: Number(body.baseSalary) });
  if (body.benefits    !== undefined) metricInputs.push({ code: "BENEFITS",       value: Number(body.benefits) });
  if (body.bonus       !== undefined) metricInputs.push({ code: "BONUS",          value: Number(body.bonus) });

  if (metricInputs.length === 0) {
    return apiError("Provide at least one of: headcountFte, baseSalary, benefits, bonus", 400);
  }

  // Auto-seed missing workforce accounts so first-time writes don't fail
  const missing = metricInputs.filter(m => !refs.accountIds[m.code]);
  if (missing.length) {
    const accDim = await prisma.dimension.findFirst({ where: { tenantId: auth.tid, kind: "ACCOUNT" }});
    if (!accDim) return apiError("ACCOUNT dim not provisioned", 500);

    const ICP_NONE_ID = ""; // not needed for member creation
    const NAMES: Record<string, string> = {
      HEADCOUNT_FTE: "Headcount (FTE)",
      BASE_SALARY:   "Base Salary",
      BENEFITS:      "Benefits Expense",
      BONUS:         "Bonus Expense",
    };
    const TYPES: Record<string, string> = {
      HEADCOUNT_FTE: "STATISTICAL",
      BASE_SALARY:   "EXPENSE",
      BENEFITS:      "EXPENSE",
      BONUS:         "EXPENSE",
    };
    for (const m of missing) {
      const created = await prisma.dimensionMember.create({
        data: {
          tenantId: auth.tid,
          dimensionId: accDim.id,
          memberCode: m.code,
          memberName: NAMES[m.code],
          isActive: true,
          properties: { account_type: TYPES[m.code], time_balance: m.code === "HEADCOUNT_FTE" ? "LAST" : "FLOW" },
          createdBy: auth.sub,
        },
      });
      refs.accountIds[m.code] = created.id;
    }
  }

  // ICP=None (required for fact_rows)
  const icpNone = await prisma.dimensionMember.findFirst({
    where: { tenantId: auth.tid, dimension: { kind: "ICP" }, memberCode: "None" },
    select: { id: true },
  });
  if (!icpNone) return apiError("ICP 'None' not seeded", 500);

  // Upsert each metric — delete prior isCurrent=true row for the exact intersection, insert new
  const written: any[] = [];
  for (const m of metricInputs) {
    const accountId = refs.accountIds[m.code];
    // Mark existing current rows non-current (preserves history)
    await prisma.factRow.updateMany({
      where: {
        tenantId:   auth.tid,
        accountId,
        entityId:   refs.entityId,
        scenarioId: refs.scenarioId,
        timeId:     refs.timeId,
        ud3Id:      refs.positionId,
        isCurrent:  true,
      },
      data: { isCurrent: false },
    });
    const row = await prisma.factRow.create({
      data: {
        tenantId:   auth.tid,
        accountId,
        entityId:   refs.entityId,
        scenarioId: refs.scenarioId,
        timeId:     refs.timeId,
        currencyId: refs.currencyId,
        icpId:      icpNone.id,
        originId:   refs.originId,
        ud3Id:      refs.positionId,
        valueTxn:       m.value,
        valueLocal:     m.value,
        valueReporting: m.value,
        version:        1,
        isCurrent:      true,
        postedBy:       auth.sub,
      },
    });
    written.push({ account: m.code, value: m.value, factId: row.id.toString() });
  }

  return apiResponse({
    positionId: refs.positionId,
    entityId:   refs.entityId,
    periodCode: body.periodCode,
    written,
  });
}
