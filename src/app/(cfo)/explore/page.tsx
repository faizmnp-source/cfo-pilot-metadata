"use client";
/*
 * /explore — a minimal data-explorer page that demonstrates the
 * UnifiedPovPicker + resolvePov pattern end-to-end. Tenants can use
 * this as a quick "what are the numbers right now" surface for any
 * POV without going through the full Executive Brief layout.
 *
 * Stack:
 *   <UnifiedPovPicker value={pov} onChange={setPov} />  ← codes-only state
 *   resolvePov(pov)                                     ← cached codes→IDs
 *   GET /api/v2/dashboard/summary                       ← existing API
 *
 * Once this pattern is proven, W2.3 swaps /dashboard, /reports/*,
 * /forecasting to the same plumbing.
 */
import { useEffect, useState } from "react";
import { UnifiedPovPicker } from "@/components/pov/UnifiedPovPicker";
import { KpiDrillDrawer } from "@/components/explore/KpiDrillDrawer";
import { LineageTrigger } from "@/components/lineage/LineageDrawer";
import { RisksTile } from "@/components/dashboard/RisksTile";
import { RecommendedActionsTile } from "@/components/dashboard/RecommendedActionsTile";
import { resolvePov } from "@/lib/pov/resolve-client";
import type { PovSpec } from "@/lib/pov/types";

type Summary = {
  kpis: { revenue: { value: number }; grossProfit: { value: number };
    opex: { value: number }; netIncome: { value: number }; cash: { value: number };
    grossMargin: number; netMargin: number };
  monthly: { code: string; revenue: number; expense: number }[];
  byEntity: { id: string; code: string; name: string; value: number }[];
  topVariances: { code: string; name: string; actual: number; budget: number; variance: number }[];
  meta: { factsRead: number };
};

export default function ExplorePage() {
  const [pov, setPov] = useState<PovSpec>({
    scenarioCode: "Actual",
    periodCode:   "FY2026",
    compareScenarioCode: "Budget",
    entityCodes:  [],
  });
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [drillKpi, setDrillKpi] = useState<{ key: "revenue"|"opex"|"netIncome"|"cash"|"grossProfit"; label: string } | null>(null);
  const [povIds, setPovIds] = useState<{ scenarioId: string|null; timeId: string|null; entityIds: string[] }>({ scenarioId: null, timeId: null, entityIds: [] });

  useEffect(() => { document.body.classList.add("atelier-theme"); return () => { document.body.classList.remove("atelier-theme"); }; }, []);

  useEffect(() => {
    if (!pov.scenarioCode || !pov.periodCode) return;
    setLoading(true); setError(null);
    (async () => {
      try {
        const { ids, unresolved } = await resolvePov(pov);
        setPovIds({ scenarioId: ids.scenarioId, timeId: ids.timeId, entityIds: ids.entityIds });
        setUnresolved(unresolved);
        if (!ids.scenarioId || !ids.timeId) { setError("Could not resolve scenario or period — check the codes above."); return; }
        const qs = new URLSearchParams({ scenarioId: ids.scenarioId, yearCode: pov.periodCode });
        if (ids.compareScenarioId) qs.set("compareScenarioId", ids.compareScenarioId);
        if (ids.entityIds.length > 0) qs.set("entityIds", ids.entityIds.join(","));
        const r = await fetch(`/api/v2/dashboard/summary?${qs}`, { credentials: "include" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        setData(j.data as Summary);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally { setLoading(false); }
    })();
  }, [pov]);

  const fmt = (n: number) => {
    if (!Number.isFinite(n) || n === 0) return "—";
    const abs = Math.abs(n);
    let s: string;
    if (abs >= 1e9) s = (abs / 1e9).toFixed(1) + "B";
    else if (abs >= 1e6) s = (abs / 1e6).toFixed(1) + "M";
    else if (abs >= 1e3) s = (abs / 1e3).toFixed(0) + "K";
    else s = abs.toFixed(0);
    return (n < 0 ? "(" : "") + "₹" + s + (n < 0 ? ")" : "");
  };

  return (
    <main className="flex-1 overflow-y-auto" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <header className="px-14 pt-7 pb-5 border-b" style={{ borderColor: "var(--ink)" }}>
        <div className="atelier-eyebrow" style={{ fontSize: 11, color: "var(--accent)" }}>Section 23 · intersection intelligence</div>
        <h1 className="atelier-serif" style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 4 }}>
          Explorer
        </h1>
        <p className="atelier-serif italic mt-2" style={{ fontSize: 13, color: "var(--ink-3)" }}>
          One picker, every dimension. Change any pill — the numbers update via the unified POV pipeline.
        </p>
      </header>

      <div className="px-14 py-5 border-b" style={{ borderColor: "var(--rule)" }}>
        <UnifiedPovPicker value={pov} onChange={setPov} show={["scenario","compare","period","entities","currency"]} />
        {unresolved.length > 0 && (
          <p className="atelier-serif italic mt-3" style={{ fontSize: 12, color: "var(--accent)" }}>
            ⚠ Unresolved codes: {unresolved.join(", ")} — check your dimension library.
          </p>
        )}
      </div>

      <div className="px-14 py-9">
        {loading && <p className="atelier-serif italic" style={{ color: "var(--ink-3)" }}>Reading the ledger…</p>}
        {error && !loading && (
          <p className="atelier-serif italic" style={{ color: "var(--accent)", fontSize: 14 }}>⚠ {error}</p>
        )}
        {data && !loading && (
          <>
            <div className="grid" style={{ gridTemplateColumns: "repeat(5, 1fr)", gap: 0 }}>
              {[
                { label: "Revenue",       v: data.kpis.revenue.value,     kpiKey: "revenue" as const },
                { label: "Gross Profit",  v: data.kpis.grossProfit.value, kpiKey: "grossProfit" as const },
                { label: "OpEx",          v: data.kpis.opex.value,        kpiKey: "opex" as const },
                { label: "Net Income",    v: data.kpis.netIncome.value,   kpiKey: "netIncome" as const },
                { label: "Cash Position", v: data.kpis.cash.value,        kpiKey: "cash" as const },
              ].map((k, i) => (
                <div key={i} className="px-4 py-4 border-r" style={{ borderColor: "var(--rule)", borderRight: i === 4 ? "none" : undefined }}>
                  <div className="flex items-center gap-1">
                    <div className="atelier-eyebrow" style={{ fontSize: 10.5 }}>{k.label}</div>
                    {k.kpiKey && (
                      <LineageTrigger onClick={() => setDrillKpi({ key: k.kpiKey as any, label: k.label })} title={`Drill into ${k.label}`} />
                    )}
                  </div>
                  <div className="atelier-serif tnum mt-1" style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em" }}>
                    {fmt(k.v)}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 40 }}>
              <div>
                <h3 className="atelier-eyebrow" style={{ fontSize: 11 }}>Revenue by Entity</h3>
                <ul className="mt-2 space-y-1.5">
                  {data.byEntity.slice(0, 8).map(e => (
                    <li key={e.id} className="atelier-serif flex justify-between" style={{ fontSize: 14 }}>
                      <span>{e.name} <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10, color: "var(--ink-3)" }}>{e.code}</span></span>
                      <span className="tnum">{fmt(e.value)}</span>
                    </li>
                  ))}
                  {data.byEntity.length === 0 && <li className="italic" style={{ color: "var(--ink-3)" }}>No data for this POV.</li>}
                </ul>
              </div>

              <div>
                <h3 className="atelier-eyebrow" style={{ fontSize: 11 }}>Top variances ({pov.scenarioCode} vs {pov.compareScenarioCode ?? "(none)"})</h3>
                <ul className="mt-2 space-y-1.5">
                  {(data.topVariances ?? []).slice(0, 8).map((v, i) => (
                    <li key={i} className="atelier-serif flex justify-between" style={{ fontSize: 14 }}>
                      <span>{v.name}</span>
                      <span className="tnum" style={{ color: v.variance > 0 ? "var(--accent)" : "var(--ink-2)" }}>
                        {v.variance > 0 ? "+" : ""}{fmt(v.variance)}
                      </span>
                    </li>
                  ))}
                  {(!data.topVariances || data.topVariances.length === 0) && <li className="italic" style={{ color: "var(--ink-3)" }}>No variance data — add a compare scenario.</li>}
                </ul>
              </div>
            </div>

            <p className="atelier-serif italic mt-8" style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {data.meta.factsRead.toLocaleString()} facts read · {data.byEntity.length} entit{data.byEntity.length === 1 ? "y" : "ies"} in scope
            </p>
          </>
        )}
      </div>
      <div className="px-14 pb-9 grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <RisksTile />
        <RecommendedActionsTile />
      </div>
      {drillKpi && (
        <KpiDrillDrawer
          open={!!drillKpi}
          onClose={() => setDrillKpi(null)}
          kpiLabel={drillKpi.label}
          kpi={drillKpi.key}
          povIds={povIds}
          currencySymbol="₹"
        />
      )}
    </main>
  );
}
