import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { computeAllocationRows, type AllocationSpec } from "@/lib/allocations/spec";

async function resolveCodes(tenantId: string, codes: { scenario?: string; period?: string; entity?: string; account?: string }) {
  const where = (dimCode: string, memberCode: string) => ({
    tenantId, memberCode, isActive: true, dimension: { code: dimCode },
  });
  const out: any = {};
  if (codes.scenario) out.scenarioId = (await prisma.dimensionMember.findFirst({ where: where("scenario", codes.scenario)}))?.id ?? null;
  if (codes.period)   out.timeId     = (await prisma.dimensionMember.findFirst({ where: where("time",     codes.period)  }))?.id ?? null;
  if (codes.entity)   out.entityId   = (await prisma.dimensionMember.findFirst({ where: where("entity",   codes.entity)  }))?.id ?? null;
  if (codes.account)  out.accountId  = (await prisma.dimensionMember.findFirst({ where: where("account",  codes.account) }))?.id ?? null;
  return out;
}

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;

  const body = await req.json().catch(() => null);
  if (!body?.spec) return apiError("spec is required", 400);
  const spec: AllocationSpec = body.spec;
  const dryRun = Boolean(body.dryRun);

  const src = await resolveCodes(auth.tid, {
    scenario: spec.sourceScenarioCode, period: spec.sourcePeriodCode,
    entity: spec.sourceEntityCode, account: spec.sourceAccountCode,
  });
  if (!src.scenarioId || !src.timeId || !src.entityId || !src.accountId) {
    return apiError("Source intersection couldn't be resolved — check codes", 400);
  }

  const srcFact = await prisma.factRow.findFirst({
    where: { tenantId: auth.tid, scenarioId: src.scenarioId, timeId: src.timeId, entityId: src.entityId, accountId: src.accountId, isCurrent: true },
    orderBy: { version: "desc" },
  });
  const sourceValue = srcFact ? Number(srcFact.valueReporting) : 0;

  const driverValues: Record<string, number> = {};
  if (spec.driver.kind === "FACT_BASED" && spec.driver.factAccountCode) {
    const driverPeriod   = spec.driver.factPeriodCode   ?? spec.sourcePeriodCode;
    const driverScenario = spec.driver.factScenarioCode ?? spec.sourceScenarioCode;
    for (const ec of spec.targetEntityCodes) {
      const ids = await resolveCodes(auth.tid, { scenario: driverScenario, period: driverPeriod, entity: ec, account: spec.driver.factAccountCode });
      if (!ids.scenarioId || !ids.timeId || !ids.entityId || !ids.accountId) { driverValues[ec] = 0; continue; }
      const f = await prisma.factRow.findFirst({
        where: { tenantId: auth.tid, scenarioId: ids.scenarioId, timeId: ids.timeId, entityId: ids.entityId, accountId: ids.accountId, isCurrent: true },
      });
      driverValues[ec] = f ? Number(f.valueReporting) : 0;
    }
  }

  const computed = computeAllocationRows(spec, sourceValue, driverValues);

  if (dryRun) {
    return apiResponse({ rowsToWrite: computed, sourceValue, driverValues, persisted: false });
  }

  const origin = await prisma.dimensionMember.findFirst({
    where: { tenantId: auth.tid, dimension: { code: "origin" }, memberCode: { in: ["Allocation","ALLOCATION","Calc","CALC"] }},
    orderBy: { memberCode: "asc" },
  });
  if (!origin) return apiError("No suitable ORIGIN dim member found (need Allocation or Calc)", 500);

  const icpNone = await prisma.dimensionMember.findFirst({
    where: { tenantId: auth.tid, dimension: { code: "icp" }, memberCode: { in: ["None","NONE","[None]"]}},
  });

  let written = 0;
  for (const r of computed) {
    const ids = await resolveCodes(auth.tid, { scenario: r.scenarioCode, period: r.periodCode, entity: r.entityCode, account: r.accountCode });
    if (!ids.scenarioId || !ids.timeId || !ids.entityId || !ids.accountId) continue;

    const reporting = await prisma.dimensionMember.findFirst({
      where: { tenantId: auth.tid, dimension: { code: "currency" }, memberCode: "Reporting" },
    });
    if (!reporting) continue;

    await prisma.factRow.updateMany({
      where: { tenantId: auth.tid, scenarioId: ids.scenarioId, timeId: ids.timeId, entityId: ids.entityId, accountId: ids.accountId,
               icpId: icpNone?.id ?? "", originId: origin.id, isCurrent: true },
      data: { isCurrent: false },
    });

    await prisma.factRow.create({
      data: {
        tenantId: auth.tid,
        scenarioId: ids.scenarioId, timeId: ids.timeId, entityId: ids.entityId, accountId: ids.accountId,
        currencyId: reporting.id,
        icpId: icpNone?.id ?? "",
        originId: origin.id,
        valueTxn: r.value, valueLocal: r.value, valueReporting: r.value,
        postedBy: auth.sub,
      },
    });
    written++;
  }

  return apiResponse({ rowsWritten: written, rows: computed, sourceValue, driverValues, persisted: true });
}
