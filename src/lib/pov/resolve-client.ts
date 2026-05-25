/*
 * Tiny client-side wrapper around POST /api/v2/pov/resolve.
 * Cache last result by povHashKey to avoid duplicate calls.
 */
import { povHashKey, type PovSpec } from "./types";

export type ResolvedIds = {
  scenarioId:        string | null;
  compareScenarioId: string | null;
  timeId:            string | null;
  entityIds:         string[];
  currencyId:        string | null;
  icpId:             string | null;
};

const cache = new Map<string, { ids: ResolvedIds; unresolved: string[] }>();

export async function resolvePov(pov: PovSpec): Promise<{ ids: ResolvedIds; unresolved: string[] }> {
  const key = povHashKey(pov);
  const hit = cache.get(key);
  if (hit) return hit;
  const r = await fetch("/api/v2/pov/resolve", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pov),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
  const out = j.data as { ids: ResolvedIds; unresolved: string[] };
  cache.set(key, out);
  return out;
}

export function clearPovCache() { cache.clear(); }
