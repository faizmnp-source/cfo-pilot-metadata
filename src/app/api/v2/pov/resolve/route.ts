// POST /api/v2/pov/resolve
// Body: PovSpec (codes)
// Returns: { ids: { scenarioId, compareScenarioId?, timeId, entityIds[], currencyId?, ... } , unresolved: string[] }
//
// One place to convert a PovSpec into the IDs that downstream APIs expect.
// Every page using UnifiedPovPicker calls this once on POV change and then
// passes the IDs to whatever data endpoint it needs (/dashboard/summary,
// /reports/*, /forecast/v2, etc.).
//
// Reports unresolved codes back to the caller for UX. Performs no writes.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { validatePov, type PovSpec } from "@/lib/pov/types";

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;

  const body = (await req.json().catch(() => null)) as PovSpec | null;
  const err = validatePov(body);
  if (err) return apiError(err, 400);
  const pov = body!;

  // One bulk fetch of any relevant member by (dimCode, memberCode)
  type Needed = { dim: string; code: string };
  const needed: Needed[] = [
    { dim: "scenario", code: pov.scenarioCode },
    { dim: "time",     code: pov.periodCode },
  ];
  if (pov.compareScenarioCode) needed.push({ dim: "scenario", code: pov.compareScenarioCode });
  if (pov.currencyCode)        needed.push({ dim: "currency", code: pov.currencyCode });
  if (pov.icpCode)             needed.push({ dim: "icp",      code: pov.icpCode });
  for (const c of pov.entityCodes ?? []) needed.push({ dim: "entity", code: c });
  for (const ud of [pov.ud1Code, pov.ud2Code, pov.ud3Code, pov.ud4Code, pov.ud5Code, pov.ud6Code, pov.ud7Code, pov.ud8Code]) {
    // (UD dimension codes are tenant-defined; without knowing them up-front
    //  we punt — callers using UD codes must resolve them themselves.)
    void ud;
  }

  // Bulk pull all members that match any (dim, code)
  const codes = Array.from(new Set(needed.map(n => n.code)));
  const dims  = Array.from(new Set(needed.map(n => n.dim)));
  const members = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, isActive: true, memberCode: { in: codes }, dimension: { code: { in: dims }}},
    select: { id: true, memberCode: true, dimension: { select: { code: true }}},
  });
  const lookup = new Map<string, string>();      // `${dim}|${code}` → id
  for (const m of members as any[]) lookup.set(`${m.dimension.code}|${m.memberCode}`, m.id);

  const lk = (dim: string, code?: string | null) => (code ? lookup.get(`${dim}|${code}`) ?? null : null);
  const unresolved: string[] = [];
  const must = (dim: string, code: string | undefined | null) => {
    const id = lk(dim, code);
    if (!id && code) unresolved.push(`${dim}=${code}`);
    return id;
  };

  const entityIds: string[] = [];
  for (const c of pov.entityCodes ?? []) {
    const id = lk("entity", c);
    if (id) entityIds.push(id);
    else unresolved.push(`entity=${c}`);
  }

  return apiResponse({
    ids: {
      scenarioId:        must("scenario", pov.scenarioCode),
      compareScenarioId: lk("scenario",   pov.compareScenarioCode ?? null),
      timeId:            must("time",     pov.periodCode),
      entityIds,
      currencyId:        lk("currency",   pov.currencyCode ?? null),
      icpId:             lk("icp",        pov.icpCode ?? null),
    },
    unresolved,
  });
}
