"use client";

// usePovDefaults — single source of truth for global POV defaults.
//
// Fetches /api/settings on first call, caches in module-level state,
// returns {periodCode, scenarioCode, compareScenarioCode, entityCode}.
//
// Every page that has a POV uses this as INITIAL state — user can still
// override per-page, but defaults come from App Settings.

import { useEffect, useState } from "react";

export interface PovDefaults {
  periodCode:          string | null;
  scenarioCode:        string | null;
  compareScenarioCode: string | null;
  entityCode:          string | null;
}

const EMPTY: PovDefaults = { periodCode: null, scenarioCode: null, compareScenarioCode: null, entityCode: null };

// Module-level cache so multiple pages don't re-fetch
let _cache: PovDefaults | null = null;
let _inFlight: Promise<PovDefaults> | null = null;

async function fetchOnce(): Promise<PovDefaults> {
  if (_cache) return _cache;
  if (_inFlight) return _inFlight;
  _inFlight = (async () => {
    try {
      const r = await fetch("/api/settings", { credentials: "include" });
      const j = await r.json();
      const d = j?.data?.defaultPov ?? EMPTY;
      _cache = {
        periodCode:          d.periodCode          ?? null,
        scenarioCode:        d.scenarioCode        ?? null,
        compareScenarioCode: d.compareScenarioCode ?? null,
        entityCode:          d.entityCode          ?? null,
      };
      return _cache;
    } catch {
      _cache = EMPTY;
      return _cache;
    } finally { _inFlight = null; }
  })();
  return _inFlight;
}

/** Hook — returns `{defaults, loading}`. Re-renders once defaults arrive. */
export function usePovDefaults(): { defaults: PovDefaults; loading: boolean } {
  const [defaults, setDefaults] = useState<PovDefaults>(_cache ?? EMPTY);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    if (_cache) { setDefaults(_cache); setLoading(false); return; }
    fetchOnce().then(d => { setDefaults(d); setLoading(false); });
  }, []);

  return { defaults, loading };
}

/** Force a refresh — call after saving defaults from Settings UI. */
export function invalidatePovDefaults() {
  _cache = null;
}
