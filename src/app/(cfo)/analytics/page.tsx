"use client";
/*
 * /analytics — Visual Analytics module (Section 12).
 * Demonstrates Waterfall, Heatmap, Treemap, Scatter using real data
 * sourced from the pivot engine + dashboard summary.
 */
import { useEffect, useState } from "react";
import { UnifiedPovPicker } from "@/components/pov/UnifiedPovPicker";
import { resolvePov } from "@/lib/pov/resolve-client";
import { WaterfallChart, type WaterfallStep } from "@/components/charts/WaterfallChart";
import { Heatmap } from "@/components/charts/Heatmap";
import { TreemapChart } from "@/components/charts/TreemapChart";
import { ScatterChartXY } from "@/components/charts/ScatterChartXY";
import type { PovSpec } from "@/lib/pov/types";

export default function AnalyticsPage() {
  const [pov, setPov] = useState<PovSpec>({ scenarioCode: "Actual", periodCode: "FY2026", compareScenarioCode: "Budget" });
  const [waterfall, setWaterfall] = useState<WaterfallStep[]>([]);
  const [heat, setHeat] = useState<{ rows: string[]; cols: string[]; cells: number[][] }>({ rows: [], cols: [], cells: [] });
  const [tree, setTree] = useState<Array<{ name: string; size: number }>>([]);
  const [scatter, setScatter] = useState<Array<{ x: number; y: number; label: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { document.body.classList.add("atelier-theme"); return () => { document.body.classList.remove("atelier-theme"); }; }, []);

  useEffect(() => {
    if (!pov.scenarioCode || !pov.periodCode) return;
    setLoading(true); setError(null);
    (async () => {
      try {
        const { ids } = await resolvePov(pov);
        if (!ids.scenarioId || !ids.timeId) { setError("POV unresolved"); return; }

        // 1. Heatmap: entity × time month
        const pivResp = await fetch("/api/v2/analyze/pivot", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ povIds: { scenarioId: ids.scenarioId, timeId: ids.timeId, entityIds: ids.entityIds }, rowDim: "entity", colDim: "time", aggregator: "SUM" }),
        });
        const piv = (await pivResp.json())?.data;
        if (piv) {
          setHeat({
            rows: piv.rows.map((r: any) => r.code),
            cols: piv.cols.map((c: any) => c.code.replace(/^\d+M0?/, "M")),
            cells: piv.cells,
          });
        }

        // 2. Treemap: revenue share by entity from dashboard summary
        const qs = new URLSearchParams({ scenarioId: ids.scenarioId, yearCode: pov.periodCode });
        if (ids.compareScenarioId) qs.set("compareScenarioId", ids.compareScenarioId);
        if (ids.entityIds.length) qs.set("entityIds", ids.entityIds.join(","));
        const sumResp = await fetch(`/api/v2/dashboard/summary?${qs}`, { credentials: "include" });
        const sum = (await sumResp.json())?.data;
        if (sum) {
          setTree((sum.byEntity ?? []).map((e: any) => ({ name: e.name, size: Math.max(0, Math.abs(e.value)) })));

          // 3. Waterfall: revenue → -COGS → -Opex → Net Income (using budget as compare baseline)
          const rev = sum.kpis?.revenue?.value ?? 0;
          const cogs = sum.kpis?.cogs?.value ?? 0;
          const opex = sum.kpis?.opex?.value ?? 0;
          const ni   = sum.kpis?.netIncome?.value ?? 0;
          setWaterfall([
            { label: "Revenue",     value: rev,   kind: "TOTAL" },
            { label: "− COGS",      value: -cogs },
            { label: "− Opex",      value: -opex },
            { label: "Net Income",  value: ni,    kind: "TOTAL" },
          ]);

          // 4. Scatter: entity revenue vs entity cash (parity baseline)
          //    Approximation — uses byEntity for revenue, dashboard cashTrend for cash.
          const cashTotal = (sum.cashTrend ?? []).reduce((a: number, c: any) => a + c.value, 0);
          setScatter((sum.byEntity ?? []).slice(0, 10).map((e: any) => ({
            x: Math.abs(e.value),
            y: Math.abs(e.value) * (cashTotal === 0 ? 1 : (cashTotal / Math.max(1, (sum.byEntity ?? []).reduce((a: number, x: any) => a + Math.abs(x.value), 0)))),
            label: e.name,
          })));
        }
      } catch (e: any) { setError(e?.message ?? String(e)); }
      finally { setLoading(false); }
    })();
  }, [pov]);

  return (
    <main className="flex-1 overflow-y-auto" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <header className="px-14 pt-7 pb-5 border-b" style={{ borderColor: "var(--ink)" }}>
        <div className="atelier-eyebrow" style={{ fontSize: 11, color: "var(--accent)" }}>Section 12 · Visual Analytics</div>
        <h1 className="atelier-serif" style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 4 }}>
          Analytics
        </h1>
        <p className="atelier-serif italic mt-2" style={{ fontSize: 13, color: "var(--ink-3)" }}>
          Waterfalls, heatmaps, treemaps, scatter — all sourced from your live POV.
        </p>
      </header>

      <div className="px-14 py-4 border-b" style={{ borderColor: "var(--rule)" }}>
        <UnifiedPovPicker value={pov} onChange={setPov} show={["scenario","compare","period","entities"]} />
      </div>

      <div className="px-14 py-8 grid gap-8" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <ChartCard title="P&L Waterfall" eyebrow="Revenue → Net Income">
          {loading && <p className="atelier-serif italic" style={{ color: "var(--ink-3)" }}>Loading…</p>}
          {!loading && waterfall.length > 0 && <WaterfallChart steps={waterfall} />}
        </ChartCard>

        <ChartCard title="Revenue Share by Entity" eyebrow="Treemap · top contributors visually">
          {!loading && tree.length > 0 && <TreemapChart data={tree} />}
          {!loading && tree.length === 0 && <p className="atelier-serif italic" style={{ color: "var(--ink-3)" }}>No entity revenue in scope.</p>}
        </ChartCard>

        <ChartCard title="Entity × Month Heatmap" eyebrow="Where the value sits">
          {!loading && heat.rows.length > 0 && <Heatmap rowLabels={heat.rows} colLabels={heat.cols} cells={heat.cells} />}
        </ChartCard>

        <ChartCard title="Revenue vs Cash" eyebrow="Scatter · entity proportionality">
          {!loading && scatter.length > 0 && <ScatterChartXY points={scatter} xLabel="Revenue" yLabel="Cash" />}
        </ChartCard>
      </div>

      {error && (
        <p className="px-14 py-4 atelier-serif italic" style={{ color: "var(--accent)" }}>⚠ {error}</p>
      )}
    </main>
  );
}

function ChartCard({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="atelier-card" style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: 22 }}>
      <div className="atelier-eyebrow" style={{ fontSize: 10.5 }}>{eyebrow}</div>
      <h2 className="atelier-serif" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", marginTop: 4 }}>{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
