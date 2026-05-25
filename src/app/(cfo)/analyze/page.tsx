"use client";
/*
 * /analyze — Ad Hoc Analysis MVP (Section 8).
 * Pick rowDim + colDim + POV → see a pivot. Click any cell to drill
 * into the underlying fact rows via FactDetailDrawer.
 *
 * No drag-drop yet — Wk3 Day 2 adds it. Today: working pivot.
 */
import { useEffect, useState } from "react";
import { UnifiedPovPicker } from "@/components/pov/UnifiedPovPicker";
import { resolvePov, type ResolvedIds } from "@/lib/pov/resolve-client";
import { FactDetailDrawer } from "@/components/explore/FactDetailDrawer";
import type { PovSpec } from "@/lib/pov/types";

const DIM_OPTIONS = [
  { code: "account",  label: "Account" },
  { code: "entity",   label: "Entity" },
  { code: "time",     label: "Time (month)" },
  { code: "scenario", label: "Scenario" },
  { code: "icp",      label: "ICP" },
];

type PivotResult = {
  rows: Array<{ memberId: string; code: string; name: string }>;
  cols: Array<{ memberId: string; code: string; name: string }>;
  cells: number[][];
  totals: { byRow: number[]; byCol: number[]; grand: number };
  meta: { rowDim: string; colDim: string; aggregator: string; factsRead: number };
};

export default function AnalyzePage() {
  const [pov, setPov] = useState<PovSpec>({ scenarioCode: "Actual", periodCode: "FY2026", entityCodes: [] });
  const [rowDim, setRowDim] = useState("account");
  const [colDim, setColDim] = useState("time");
  const [agg, setAgg]       = useState<"SUM"|"AVG"|"COUNT">("SUM");
  const [resolved, setResolved] = useState<ResolvedIds | null>(null);
  const [result, setResult] = useState<PivotResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [drill, setDrill] = useState<{ rowId: string; colId: string; label: string } | null>(null);

  useEffect(() => { document.body.classList.add("atelier-theme"); return () => { document.body.classList.remove("atelier-theme"); }; }, []);

  useEffect(() => {
    if (!pov.scenarioCode || !pov.periodCode || !rowDim || !colDim || rowDim === colDim) return;
    setLoading(true); setError(null); setResult(null);
    (async () => {
      try {
        const { ids } = await resolvePov(pov);
        setResolved(ids);
        if (!ids.scenarioId || !ids.timeId) { setError("Couldn't resolve scenario or period"); return; }
        const r = await fetch("/api/v2/analyze/pivot", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ povIds: ids, rowDim, colDim, aggregator: agg }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        setResult(j.data as PivotResult);
      } catch (e: any) { setError(e?.message ?? String(e)); }
      finally { setLoading(false); }
    })();
  }, [pov, rowDim, colDim, agg]);

  const fmt = (n: number) => {
    if (!Number.isFinite(n) || n === 0) return "—";
    const abs = Math.abs(n);
    const s = abs >= 1e9 ? (abs/1e9).toFixed(1)+"B" : abs >= 1e6 ? (abs/1e6).toFixed(1)+"M" : abs >= 1e3 ? (abs/1e3).toFixed(0)+"K" : abs.toFixed(0);
    return (n < 0 ? "(" : "") + "₹" + s + (n < 0 ? ")" : "");
  };

  // Drill-through is only meaningful when row OR col is ACCOUNT (since FactDetailDrawer needs accountId)
  const accountAxis: "row" | "col" | null = rowDim === "account" ? "row" : colDim === "account" ? "col" : null;
  const entityAxis:  "row" | "col" | null = rowDim === "entity"  ? "row" : colDim === "entity"  ? "col" : null;

  const onCellClick = (rIdx: number, cIdx: number) => {
    if (!result || !accountAxis) return;
    const accountId = accountAxis === "row" ? result.rows[rIdx].memberId : result.cols[cIdx].memberId;
    const accountName = accountAxis === "row" ? result.rows[rIdx].name   : result.cols[cIdx].name;
    // entity: prefer axis if present; else first POV entity; else skip
    let entityId: string | undefined;
    if (entityAxis === "row") entityId = result.rows[rIdx].memberId;
    else if (entityAxis === "col") entityId = result.cols[cIdx].memberId;
    else entityId = resolved?.entityIds?.[0];
    if (!entityId) { alert("Drill needs an entity in scope — add one to the POV or pick Entity as an axis."); return; }
    setDrill({ rowId: result.rows[rIdx].memberId, colId: result.cols[cIdx].memberId, label: accountName });
  };

  return (
    <main className="flex-1 overflow-y-auto" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <header className="px-14 pt-7 pb-5 border-b" style={{ borderColor: "var(--ink)" }}>
        <div className="atelier-eyebrow" style={{ fontSize: 11, color: "var(--accent)" }}>Section 8 · Ad Hoc Analysis</div>
        <h1 className="atelier-serif" style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 4 }}>
          Analyze
        </h1>
        <p className="atelier-serif italic mt-2" style={{ fontSize: 13, color: "var(--ink-3)" }}>
          Cross any two dimensions. Click a cell to drill into the underlying facts.
        </p>
      </header>

      <div className="px-14 py-4 border-b" style={{ borderColor: "var(--rule)" }}>
        <UnifiedPovPicker value={pov} onChange={setPov} show={["scenario","period","entities","currency"]} />
      </div>

      <div className="px-14 py-3 border-b flex gap-3 items-center flex-wrap" style={{ borderColor: "var(--rule)" }}>
        <Pill label="Rows"    value={rowDim} onChange={setRowDim} options={DIM_OPTIONS.map(d => ({ value: d.code, label: d.label }))} />
        <Pill label="Columns" value={colDim} onChange={setColDim} options={DIM_OPTIONS.map(d => ({ value: d.code, label: d.label }))} />
        <Pill label="Agg"     value={agg} onChange={(v) => setAgg(v as any)} options={[{ value: "SUM", label: "Sum" }, { value: "AVG", label: "Average" }, { value: "COUNT", label: "Count" }]} />
        {result && (
          <span className="ml-auto atelier-serif italic" style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {result.rows.length} × {result.cols.length} · {result.meta.factsRead.toLocaleString()} facts read
          </span>
        )}
      </div>

      <div className="px-14 py-6">
        {loading && <p className="atelier-serif italic" style={{ color: "var(--ink-3)" }}>Building the pivot…</p>}
        {error && <p className="atelier-serif italic" style={{ color: "var(--accent)" }}>⚠ {error}</p>}
        {result && (
          <div className="overflow-x-auto">
            <table className="border-collapse">
              <thead>
                <tr>
                  <th className="atelier-eyebrow text-left pr-6 pb-2 border-b" style={{ fontSize: 10, borderColor: "var(--ink)" }}>{rowDim}</th>
                  {result.cols.map(c => (
                    <th key={c.memberId} className="atelier-eyebrow text-right px-3 pb-2 border-b" style={{ fontSize: 10, borderColor: "var(--ink)" }}>
                      {c.code}
                    </th>
                  ))}
                  <th className="atelier-eyebrow text-right pl-4 pb-2 border-b border-l" style={{ fontSize: 10, borderColor: "var(--ink)", color: "var(--accent)" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, ri) => (
                  <tr key={row.memberId} className="border-b" style={{ borderColor: "var(--rule)" }}>
                    <td className="atelier-serif py-1.5 pr-6" style={{ fontSize: 13 }}>
                      {row.name} <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10, color: "var(--ink-3)" }}>{row.code}</span>
                    </td>
                    {result.cells[ri].map((v, ci) => (
                      <td key={ci} onClick={() => onCellClick(ri, ci)} className="tnum text-right px-3 py-1.5"
                          style={{ fontSize: 12.5, cursor: accountAxis ? "pointer" : "default", color: v < 0 ? "var(--accent)" : "var(--ink)" }}>
                        {fmt(v)}
                      </td>
                    ))}
                    <td className="atelier-serif tnum text-right pl-4 py-1.5 border-l" style={{ fontSize: 13, fontWeight: 600, borderColor: "var(--rule)" }}>
                      {fmt(result.totals.byRow[ri])}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2" style={{ borderColor: "var(--ink)" }}>
                  <td className="atelier-eyebrow py-2 pr-6" style={{ fontSize: 10, color: "var(--accent)" }}>Total</td>
                  {result.totals.byCol.map((v, ci) => (
                    <td key={ci} className="tnum text-right px-3 py-2" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(v)}</td>
                  ))}
                  <td className="atelier-serif tnum text-right pl-4 py-2 border-l" style={{ fontSize: 14, fontWeight: 700, borderColor: "var(--rule)" }}>
                    {fmt(result.totals.grand)}
                  </td>
                </tr>
              </tbody>
            </table>
            {accountAxis && (
              <p className="atelier-serif italic mt-4" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                Click any cell to drill into its source fact rows.
              </p>
            )}
            {!accountAxis && (
              <p className="atelier-serif italic mt-4" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                To enable drill-through, pick <b>Account</b> as either Rows or Columns.
              </p>
            )}
          </div>
        )}
      </div>

      {drill && resolved?.scenarioId && resolved?.timeId && (
        <FactDetailDrawer
          open={!!drill}
          onClose={() => setDrill(null)}
          label={drill.label}
          scenarioId={resolved.scenarioId}
          timeId={resolved.timeId}
          entityId={
            entityAxis === "row" ? drill.rowId
            : entityAxis === "col" ? drill.colId
            : resolved.entityIds[0] ?? ""
          }
          accountId={accountAxis === "row" ? drill.rowId : drill.colId}
          currencySymbol="₹"
        />
      )}
    </main>
  );
}

function Pill({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="inline-flex items-center h-9 px-3 rounded-full border" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
      <span className="atelier-eyebrow" style={{ fontSize: 10, color: "var(--ink-3)", marginRight: 10 }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent outline-none cursor-pointer atelier-serif" style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600 }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
