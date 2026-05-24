"use client";

// Forecast Variance Scorecard — Sprint W.2.
//
// Compares ACTUAL vs FORECAST facts on (account × entity × period) and shows
// the variance, variance %, and aggregate totals. Pure read-only — does not
// write facts.

import { useEffect, useMemo, useState } from "react";
import { Scale, Loader2, Play, AlertCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { TimePOVPicker } from "@/components/reports/TimePOVPicker";
import { HierarchyMemberPicker } from "@/components/pickers/HierarchyMemberPicker";

type Member = { id: string; memberCode: string; memberName: string; isActive?: boolean };
type VarianceRow = {
  accountId: string; entityId: string; timeId: string;
  actual: number; forecast: number; variance: number; variancePct: number | null;
  direction: "pos" | "neg" | "flat";
  accountCode?: string; accountName?: string;
  entityCode?: string;  entityName?: string;
  periodCode?: string;  periodName?: string;
};
type VarianceResult = {
  actualScenarioCode: string;
  forecastScenarioCode: string;
  rows: VarianceRow[];
  totals: { actual: number; forecast: number; variance: number; variancePct: number | null; rowCount: number };
  periodCount: number;
  accountCount: number;
  entityCount: number;
};

export default function ForecastVariancePage() {
  const [accounts,  setAccounts]  = useState<Member[]>([]);
  const [scenarios, setScenarios] = useState<Member[]>([]);

  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [actualScenario,   setActualScenario]   = useState("");
  const [forecastScenario, setForecastScenario] = useState("");
  const [timeCode,         setTimeCode]         = useState("FY2026H2");

  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [result,  setResult]  = useState<VarianceResult | null>(null);
  const [sortKey, setSortKey] = useState<"variance" | "variancePct" | "accountCode" | "periodCode">("variance");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  useEffect(() => {
    Promise.all([
      fetch("/api/v2/members/account?pageSize=500",  { credentials: "include" }).then(r => r.json()),
      fetch("/api/v2/members/scenario?pageSize=100", { credentials: "include" }).then(r => r.json()),
    ]).then(([a, s]) => {
      setAccounts(((a?.data?.data ?? []) as any[]).filter(m => m.isActive));
      const scns = ((s?.data?.data ?? []) as any[]).filter(m => m.isActive);
      setScenarios(scns);
      const findScn = (rxp: RegExp) => scns.find((x: any) => rxp.test(x.memberCode))?.memberCode;
      setActualScenario(findScn(/^actual$/i)   ?? findScn(/act/i)              ?? scns[0]?.memberCode ?? "");
      setForecastScenario(findScn(/^forecast$/i) ?? findScn(/^fcst$/i) ?? findScn(/forecast|fcst/i) ?? scns.find((x: any) => x.memberCode !== (findScn(/^actual$/i) ?? ""))?.memberCode ?? "");
    }).catch(e => setError(String(e)));
  }, []);

  async function runVariance() {
    setError(null); setResult(null); setRunning(true);
    try {
      if (!selectedAccounts.length) throw new Error("Pick at least one account");
      if (!selectedEntities.length) throw new Error("Pick at least one entity");
      if (!timeCode) throw new Error("Pick a Time POV");
      if (!actualScenario || !forecastScenario) throw new Error("Pick actual + forecast scenarios");

      const r = await fetch("/api/v2/forecast/variance", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountIds: selectedAccounts,
          entityIds:  selectedEntities,
          actualScenarioCode:   actualScenario,
          forecastScenarioCode: forecastScenario,
          timeCode,
          enrich: true,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setResult(j.data as VarianceResult);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setRunning(false);
    }
  }

  const sortedRows = useMemo(() => {
    if (!result?.rows) return [];
    const rows = [...result.rows];
    const dir = sortDir === "desc" ? -1 : 1;
    rows.sort((a, b) => {
      let va: any, vb: any;
      switch (sortKey) {
        case "variance":    va = a.variance;    vb = b.variance; break;
        case "variancePct": va = a.variancePct ?? -Infinity; vb = b.variancePct ?? -Infinity; break;
        case "accountCode": va = a.accountCode ?? ""; vb = b.accountCode ?? ""; break;
        case "periodCode":  va = a.periodCode  ?? ""; vb = b.periodCode  ?? ""; break;
      }
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
    return rows;
  }, [result, sortKey, sortDir]);

  function toggleSort(k: typeof sortKey) {
    if (sortKey === k) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  }

  return (
    <div className="flex flex-1 min-w-0 overflow-y-auto">
      <div className="flex-1 min-w-0 p-6 max-w-7xl mx-auto">
        <header className="mb-5">
          <h1 className="text-lg font-bold text-stone-900 flex items-center gap-2">
            <Scale className="w-5 h-5 text-amber-600" /> Forecast Variance Scorecard
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">Compare ACTUAL vs FORECAST per account × entity × period. Sprint W.2.</p>
        </header>

        <section className="bg-white rounded-lg border border-stone-200 p-5 mb-5">
          <h2 className="text-xs font-bold text-stone-700 uppercase tracking-wide mb-3">1. Scope</h2>
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-3">
              <PickerMulti
                label="Accounts"
                items={accounts.map(a => ({ id: a.id, label: `${a.memberCode} — ${a.memberName}` }))}
                selected={selectedAccounts}
                onChange={setSelectedAccounts}
                placeholder="Select accounts…"
              />
              <HierarchyMemberPicker slug="entity" selectedIds={selectedEntities} onChange={setSelectedEntities} label="Entities (pick parent + 'all' for descendants)" />
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-stone-500 tracking-wide">Actual scenario</label>
                <select value={actualScenario} onChange={e => setActualScenario(e.target.value)} className="w-full mt-1 border border-stone-200 rounded p-2 text-sm">
                  {scenarios.map(s => <option key={s.id} value={s.memberCode}>{s.memberCode} — {s.memberName}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-stone-500 tracking-wide">Forecast scenario</label>
                <select value={forecastScenario} onChange={e => setForecastScenario(e.target.value)} className="w-full mt-1 border border-stone-200 rounded p-2 text-sm">
                  {scenarios.map(s => <option key={s.id} value={s.memberCode}>{s.memberCode} — {s.memberName}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-stone-500 tracking-wide block mb-1">Time POV</label>
                <TimePOVPicker value={timeCode} onChange={setTimeCode} label="" />
                <p className="text-[10px] text-stone-400 mt-1 italic">Pick FY2026H2 to scorecard second half, or 2026M07 for one month.</p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end">
            <button
              onClick={runVariance}
              disabled={running}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-40"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Run variance
            </button>
          </div>
        </section>

        {error && (
          <div className="mb-5 px-3 py-2 rounded bg-rose-50 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </div>
        )}

        {result && (
          <>
            <section className="bg-white rounded-lg border border-stone-200 p-5 mb-5">
              <h2 className="text-xs font-bold text-stone-700 uppercase tracking-wide mb-3">2. Totals</h2>
              <div className="grid grid-cols-4 gap-4">
                <KPI label="Actual"        value={fmt(result.totals.actual)}        sub={result.actualScenarioCode} />
                <KPI label="Forecast"      value={fmt(result.totals.forecast)}      sub={result.forecastScenarioCode} />
                <KPI
                  label="Variance"
                  value={fmt(result.totals.variance)}
                  sub={result.totals.variance >= 0 ? "Actual ↑ above forecast" : "Actual ↓ below forecast"}
                  tone={result.totals.variance > 0 ? "pos" : result.totals.variance < 0 ? "neg" : "flat"}
                />
                <KPI
                  label="Variance %"
                  value={result.totals.variancePct == null ? "—" : `${result.totals.variancePct.toFixed(1)}%`}
                  sub={`${result.totals.rowCount} rows`}
                  tone={(result.totals.variancePct ?? 0) > 0 ? "pos" : (result.totals.variancePct ?? 0) < 0 ? "neg" : "flat"}
                />
              </div>
            </section>

            <section className="bg-white rounded-lg border border-stone-200 p-5">
              <h2 className="text-xs font-bold text-stone-700 uppercase tracking-wide mb-3">3. Per-row breakdown ({sortedRows.length})</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase font-bold text-stone-500 tracking-wide border-b border-stone-200">
                      <Th onClick={() => toggleSort("accountCode")} active={sortKey === "accountCode"} dir={sortDir}>Account</Th>
                      <th className="px-2 py-2">Entity</th>
                      <Th onClick={() => toggleSort("periodCode")} active={sortKey === "periodCode"} dir={sortDir}>Period</Th>
                      <th className="px-2 py-2 text-right">Actual</th>
                      <th className="px-2 py-2 text-right">Forecast</th>
                      <Th onClick={() => toggleSort("variance")}    active={sortKey === "variance"}    dir={sortDir} alignRight>Variance</Th>
                      <Th onClick={() => toggleSort("variancePct")} active={sortKey === "variancePct"} dir={sortDir} alignRight>Variance %</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((r, i) => (
                      <tr key={i} className="border-b border-stone-100 hover:bg-stone-50">
                        <td className="px-2 py-1.5 font-mono text-[11px]">{r.accountCode ?? r.accountId.slice(0,8)}</td>
                        <td className="px-2 py-1.5 font-mono text-[11px]">{r.entityCode  ?? r.entityId.slice(0,8)}</td>
                        <td className="px-2 py-1.5 font-mono text-[11px]">{r.periodCode  ?? r.timeId.slice(0,8)}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{fmt(r.actual)}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{fmt(r.forecast)}</td>
                        <td className={`px-2 py-1.5 text-right font-mono ${r.direction === "pos" ? "text-emerald-700" : r.direction === "neg" ? "text-rose-700" : "text-stone-500"}`}>
                          <span className="inline-flex items-center gap-1 justify-end">
                            {r.direction === "pos" ? <TrendingUp className="w-3 h-3" /> : r.direction === "neg" ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                            {fmt(r.variance)}
                          </span>
                        </td>
                        <td className={`px-2 py-1.5 text-right font-mono ${r.direction === "pos" ? "text-emerald-700" : r.direction === "neg" ? "text-rose-700" : "text-stone-500"}`}>
                          {r.variancePct == null ? "—" : `${r.variancePct.toFixed(1)}%`}
                        </td>
                      </tr>
                    ))}
                    {sortedRows.length === 0 && (
                      <tr><td colSpan={7} className="px-2 py-6 text-center text-stone-400 italic">No facts found in the chosen intersection.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Th({ children, onClick, active, dir, alignRight }: { children: React.ReactNode; onClick: () => void; active: boolean; dir: "asc" | "desc"; alignRight?: boolean }) {
  return (
    <th onClick={onClick} className={`px-2 py-2 cursor-pointer select-none hover:text-stone-700 ${alignRight ? "text-right" : ""} ${active ? "text-stone-900" : ""}`}>
      {children}{active ? (dir === "desc" ? " ▼" : " ▲") : ""}
    </th>
  );
}

function KPI({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "pos" | "neg" | "flat" }) {
  const toneCls = tone === "pos" ? "text-emerald-700" : tone === "neg" ? "text-rose-700" : "text-stone-900";
  return (
    <div className="border border-stone-200 rounded p-3">
      <p className="text-[10px] uppercase font-bold text-stone-500 tracking-wide">{label}</p>
      <p className={`text-lg font-bold mt-0.5 font-mono ${toneCls}`}>{value}</p>
      {sub && <p className="text-[10px] text-stone-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function fmt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

function PickerMulti({ label, items, selected, onChange, placeholder }: { label: string; items: { id: string; label: string }[]; selected: string[]; onChange: (s: string[]) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const filtered = q ? items.filter(i => i.label.toLowerCase().includes(q.toLowerCase())) : items;
  function toggle(id: string) { onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]); }
  return (
    <div>
      <label className="text-[10px] uppercase font-bold text-stone-500 tracking-wide block mb-1">{label} ({selected.length})</label>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder ?? "Filter…"} className="w-full border border-stone-200 rounded p-2 text-sm mb-1" />
      <div className="max-h-32 overflow-y-auto border border-stone-100 rounded">
        {filtered.slice(0, 200).map(i => (
          <label key={i.id} className="flex items-center gap-2 px-2 py-1 hover:bg-stone-50 cursor-pointer text-xs">
            <input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggle(i.id)} />
            <span className="truncate">{i.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
