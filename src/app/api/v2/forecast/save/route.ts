// POST /api/v2/forecast/save
// Body: {
//   scenarioCode: string,         // target scenario (e.g. "Forecast")
//   accountCode:  string,
//   entityCode:   string,
//   periodCodes:  string[],       // one per value, in order (e.g. ["2026M07","2026M08",...])
//   values:       number[],       // forecast values, same length as periodCodes
//   methodHint?:  string,         // e.g. "HOLT_WINTERS" — stored in notes
//   note?:        string,
// }
// Writes one FactRow per (period × supplied entity × account) with
// origin=Forecast (fallback to Calc). Marks prior current versions as
// isCurrent=false. Returns rowsWritten.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const body = await req.json().catch(() => null);
  if (!body?.scenarioCode || !body?.accountCode || !body?.entityCode ||
      !Array.isArray(body.periodCodes) || !Array.isArray(body.values) ||
      body.periodCodes.length !== body.values.length || body.periodCodes.length === 0) {
    return apiError("scenarioCode, accountCode, entityCode, periodCodes[], values[] required (matching length)", 400);
  }

  // Resolve all dim members in one query each
  const [scn, acc, ent] = await Promise.all([
    prisma.dimensionMember.findFirst({ where: { tenantId: auth.tid, dimension: { code: "scenario" }, memberCode: body.scenarioCode }, select: { id: true }}),
    prisma.dimensionMember.findFirst({ where: { tenantId: auth.tid, dimension: { code: "account" },  memberCode: body.accountCode  }, select: { id: true }}),
    prisma.dimensionMember.findFirst({ where: { tenantId: auth.tid, dimension: { code: "entity" },   memberCode: body.entityCode   }, select: { id: true }}),
  ]);
  if (!scn) return apiError(`Scenario "${body.scenarioCode}" not found`, 404);
  if (!acc) return apiError(`Account "${body.accountCode}" not found`, 404);
  if (!ent) return apiError(`Entity "${body.entityCode}" not found`, 404);

  const times = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, dimension: { code: "time" }, memberCode: { in: body.periodCodes }},
    select: { id: true, memberCode: true },
  });
  const timeIdByCode = new Map(times.map(t => [t.memberCode, t.id]));
  const missingPeriods = body.periodCodes.filter((c: string) => !timeIdByCode.has(c));
  if (missingPeriods.length) return apiError(`Time periods not found: ${missingPeriods.join(", ")}`, 404);

  // Origin: Forecast > Calc fallback
  const origin = await prisma.dimensionMember.findFirst({
    where: { tenantId: auth.tid, dimension: { code: "origin" }, memberCode: { in: ["Forecast","FORECAST","Calc","CALC"] }},
    orderBy: { memberCode: "asc" },
  });
  if (!origin) return apiError("No suitable ORIGIN dim member (need Forecast or Calc)", 500);

  // Currency: Reporting (single-currency default)
  const reporting = await prisma.dimensionMember.findFirst({
    where: { tenantId: auth.tid, dimension: { code: "currency" }, memberCode: { in: ["Reporting","REPORTING"] }},
  });
  if (!reporting) return apiError("No Reporting currency member", 500);

  const icpNone = await prisma.dimensionMember.findFirst({
    where: { tenantId: auth.tid, dimension: { code: "icp" }, memberCode: { in: ["None","NONE","[None]"]}},
  });

  let written = 0;
  for (let i = 0; i < body.periodCodes.length; i++) {
    const timeId = timeIdByCode.get(body.periodCodes[i])!;
    const value  = Number(body.values[i]);
    if (!Number.isFinite(value)) continue;

    // Mark prior current versions at this exact intersection isCurrent=false
    await prisma.factRow.updateMany({
      where: {
        tenantId: auth.tid,
        scenarioId: scn.id, timeId, entityId: ent.id, accountId: acc.id,
        icpId: icpNone?.id ?? "", originId: origin.id,
        isCurrent: true,
      },
      data: { isCurrent: false },
    });

    await prisma.factRow.create({
      data: {
        tenantId: auth.tid,
        scenarioId: scn.id, timeId, entityId: ent.id, accountId: acc.id,
        currencyId: reporting.id,
        icpId: icpNone?.id ?? "",
        originId: origin.id,
        valueTxn: value, valueLocal: value, valueReporting: value,
        postedBy: auth.sub,
      },
    });
    written++;
  }

  return apiResponse({
    rowsWritten: written,
    method: body.methodHint ?? null,
    note: body.note ?? null,
  });
}
