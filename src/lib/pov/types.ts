/*
 * Canonical Point-Of-View (POV) shape used across every module.
 * One type, one mental model: every API accepts this, every UI renders this.
 *
 * Background: today different modules use slightly different POV shapes
 * (some take scenarioId + yearCode, some take scenarioCode + periodCode,
 * some take entityIds[] vs entityCode). This file standardises:
 *
 *   - codes everywhere on the wire (human-readable, hash-stable)
 *   - one optional compareScenario for variance views
 *   - entityCodes[] is always a LIST — single entity = list of one
 *   - ud1..ud8 are sparse — only present when the tenant uses them
 *
 * Resolution to IDs happens in API handlers via /src/lib/pov/resolve.ts.
 */

export type PovSpec = {
  scenarioCode:        string;
  periodCode:          string;                      // "FY2026" | "2026Q2" | "2026M04"
  compareScenarioCode?: string | null;              // for variance views
  entityCodes?:        string[];                    // empty/undefined = all leaves
  currencyCode?:       string;                      // defaults to tenant reporting
  icpCode?:            string | null;
  ud1Code?: string | null; ud2Code?: string | null; ud3Code?: string | null; ud4Code?: string | null;
  ud5Code?: string | null; ud6Code?: string | null; ud7Code?: string | null; ud8Code?: string | null;
};

/** Stable hash for caching purposes — same POV → same cache key. */
export function povHashKey(p: PovSpec): string {
  const k = (p.entityCodes ?? []).slice().sort().join(",");
  return [
    p.scenarioCode, p.periodCode, p.compareScenarioCode ?? "",
    k, p.currencyCode ?? "", p.icpCode ?? "",
    p.ud1Code ?? "", p.ud2Code ?? "", p.ud3Code ?? "", p.ud4Code ?? "",
    p.ud5Code ?? "", p.ud6Code ?? "", p.ud7Code ?? "", p.ud8Code ?? "",
  ].join("|");
}

/** Merge a partial override into a base POV (used by per-page picker overrides). */
export function mergePov(base: PovSpec, override: Partial<PovSpec>): PovSpec {
  return { ...base, ...override };
}

/** Validate a POV — returns null if OK, error string otherwise. */
export function validatePov(p: any): string | null {
  if (!p || typeof p !== "object") return "POV must be an object";
  if (typeof p.scenarioCode !== "string" || !p.scenarioCode) return "scenarioCode is required";
  if (typeof p.periodCode !== "string"   || !p.periodCode)   return "periodCode is required";
  if (p.entityCodes !== undefined && !Array.isArray(p.entityCodes)) return "entityCodes must be an array";
  return null;
}
