// Idempotently seed the Origin dimension's default member ('Import').
//
// Origin is the OneStream-style data-source dim — every fact_row carries an
// originId so we can filter by where the data came from. V1 seeds 'Import'
// only; admins extend the dim later (Form, AI, Calc, Elim, Consol,
// Translation, Allocation, Journal).
//
// Unlike sync-icp, Origin members are user-editable — we just guarantee
// 'Import' always exists. Call this from any route that GETs the Origin dim
// for the first time, plus from data-load endpoints that need a default.

import { prisma } from "./prisma";
import { ensureDimension } from "./ensure-dimension";

export const IMPORT_ORIGIN_CODE       = "Import";
export const FORM_ORIGIN_CODE         = "Form";
export const CONSOLIDATION_ORIGIN_CODE = "Consolidation";
export const ELIMINATION_ORIGIN_CODE   = "Elimination";
export const TRANSLATION_ORIGIN_CODE   = "Translation";

type SeedSpec = {
  code:        string;
  name:        string;
  description: string;
  origin_type: string;
};

const SEED_ORIGINS: SeedSpec[] = [
  { code: IMPORT_ORIGIN_CODE,        name: "Import",        description: "Facts loaded from an external file (TB, GL, journal export)", origin_type: "IMPORT" },
  { code: FORM_ORIGIN_CODE,          name: "Form",          description: "Facts entered directly through the Data Input form",          origin_type: "FORM" },
  { code: CONSOLIDATION_ORIGIN_CODE, name: "Consolidation", description: "Rollup facts written by the Consolidation process",            origin_type: "CONSOL" },
  { code: ELIMINATION_ORIGIN_CODE,   name: "Elimination",   description: "Intercompany elimination netting written during consolidation", origin_type: "ELIM" },
  { code: TRANSLATION_ORIGIN_CODE,   name: "Translation",   description: "FX-translated facts (Local → Reporting) written during consolidation", origin_type: "TRANSLATION" },
];

/**
 * Returns the dimension_member.id of the named origin row for this tenant,
 * creating it (and any other system origins) if missing. Safe to call on
 * every data-load / data-input request.
 */
export async function ensureOriginMember(
  tenantId: string,
  userId:   string,
  code:     string = IMPORT_ORIGIN_CODE,
): Promise<string> {
  const dim = await ensureDimension(tenantId, "ORIGIN" as any);

  // Seed all known system origins in one pass (idempotent)
  const existing = await prisma.dimensionMember.findMany({
    where: { tenantId, dimensionId: dim.id, memberCode: { in: SEED_ORIGINS.map(s => s.code) } },
    select: { id: true, memberCode: true },
  });
  const haveCodes = new Set(existing.map(m => m.memberCode));
  const idByCode  = new Map(existing.map(m => [m.memberCode, m.id]));

  for (const s of SEED_ORIGINS) {
    if (haveCodes.has(s.code)) continue;
    const created = await prisma.dimensionMember.create({
      data: {
        tenantId,
        dimensionId: dim.id,
        memberCode:  s.code,
        memberName:  s.name,
        description: s.description,
        isActive:    true,
        sortOrder:   SEED_ORIGINS.findIndex(o => o.code === s.code),
        properties:  { origin_type: s.origin_type, is_system: true } as any,
        createdBy:   userId,
        updatedBy:   userId,
      },
      select: { id: true },
    });
    idByCode.set(s.code, created.id);
  }

  const id = idByCode.get(code);
  if (id) return id;
  // Caller asked for a non-system origin code that doesn't exist — fall
  // back to Import so data-load never fails on missing origin.
  return idByCode.get(IMPORT_ORIGIN_CODE)!;
}

/** Legacy alias — kept so older callers keep working. */
export const ensureImportOriginMember = (tenantId: string, userId: string) =>
  ensureOriginMember(tenantId, userId, IMPORT_ORIGIN_CODE);
