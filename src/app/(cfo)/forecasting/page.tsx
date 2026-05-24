"use client";

// Forecast Engine v1 — driver-based forecasting over fact_rows.
//
// 3 methods (covers ~80% of mid-market FP&A needs per panel):
//   - RUN_RATE     — avg last N months × project forward
//   - GROWTH_PCT   — apply growth rate (compound) to last actual
//   - LINEAR_TREND — least-squares regression over history
//
// Flow: pick accounts + entities + history periods + future periods + method
//       → POST /api/v2/forecast/run → AI-origin facts written to target scenario
//       → results shown inline (sample of forecast values + basis).

import { useEffect, useState } from "react";
import { TrendingUp, Loader2, Play, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { TimePOVPicker } from "@/components/reports/TimePOVPicker";

type Member = { id: string; memberCode: string; memberName: string; isActive?: boolean };

export default function ForecastingPage() {
  const [accounts, setAccounts] = useState<Member[]>([]);
  const [entities, setEntities] = useState<Member[]>([]);
  const [scenarios, setScenarios] = useState<Member[]>([]);
  const [periods, setPeriods] = useState<Member[]>([]);

  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [historyScenario, setHistoryScenario] = useState("ACTUAL");
  const [targetScenario,  setTargetScenario]  = useState("FORECAST");
  // Time POV: pick ANY Time member (FY2026 / FY2026H1 / FY2026Q3 / 2026-04)
  const [historyTimeCode, setHistoryTimeCode] = useState("FY2026H1");
  const [futureTimeCode,  setFutureTimeCode]  = useState("FY2026H2");
  const [method, setMethod] = useState<"RUN_RATE" | "GROWTH_PCT" | "LINEAR_TREND">("RUN_RATE");
  const [growthPct, setGrowthPct] = useState(0.05);
  const [basisN, setBasisN] = useState(3);
  const [overwrite, setOverwrite] = useState(true);

  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [result,  setResult]  = useState<any>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/v2/members/account?pageSize=500",  { credentials: "include" }).then(r => r.json()),
      fetch("/api/v2/members/entity?pageSize=500",   { credentials: "include" }).then(r => r.json()),
      fetch("/api/v2/members/scenario?pageSize=100", { credentials: "include" }).then(r => r.json()),
      fetch("/api/v2/members/time?pageSize=500",     { credentials: "include" }).then(r => r.json()),
    ]).then(([a, e, s, t]) => {
      setAccounts(((a?.data?.data ?? []) as any[]).filter(m => m.isActive));
      setEntities(((e?.data?.data ?? []) as any[]).filter(m => m.isActive));
      setScenarios(((s?.data?.data ?? []) as any[]).filter(m => m.isActive));
      setPeriods(((t?.data?.data ?? []) as any[]).filter(m => m.isActive && /^\d{4}-\d{2}$/.test(m.memberCode)).sort((x, y) => x.memberCode.localeCompare(y.memberCode)));
    }).catch(e => setError(String(e)));
  }, []);

  async function runForecast() {
    setError(null); setResult(null); setRunning(true);
    try {
      if (!historyTimeCode || !futureTimeCode) throw new Error("Pick history + future Time POV");
      if (!selectedAccounts.length) throw new Error("Pick at least one account");
      if (!selectedEntities.length) throw new Error("Pick at least one entity");

      const r = await fetch("/api/v2/forecast/run", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountIds: selectedAccounts, entityIds: selectedEntities,
          historyScenarioCode: historyScenario, targetScenarioCode: targetScenario,
          historyTimeCode, futureTimeCode,    // server resolves each to leaf months
          method,
          params: method === "GROWTH_PCT" ? { pct: growthPct } : method === "RUN_RATE" ? { basisN } : {},
          overwriteExisting: overwrite,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setResult(j.data);
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setRunning(false); }
  }

  return (
    <div className="flex flex-1 min-w-0 overflow-y-auto">
      <div className="flex-1 min-w-0 p-6 max-w-6xl mx-auto">
        <header className="mb-5">
          <h1 className="text-lg font-bold text-stone-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-sky-600" /> Forecasting
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">Project future periods from history. Pick accounts + method, run, write to target scenario.</p>
        </header>

        <div className="grid grid-cols-2 gap-5">
          <section className="bg-white rounded-lg border border-stone-200 p-5">
            <h2 className="text-xs font-bold text-stone-700 uppercase tracking-wide mb-3">1. Source — what to learn from</h2>
            <div className="space-y-3">
              <PickerMulti label="Accounts" items={accounts.map(a => ({ id: a.id, label: `${a.memberCode} — ${a.memberName}` }))} selected={selectedAccounts} onChange={setSelectedAccounts} placeholder="Select accounts to forecast…" />
              <PickerMulti label="Entities" items={entities.map(e => ({ id: e.id, label: `${e.memberCode} — ${e.memberName}` }))} selected={selectedEntities} onChange={setSelectedEntities} placeholder="Select entities…" />
              <div>
                <label className="text-[10px] uppercase font-bold text-stone-500 tracking-wide">History scenario</label>
                <select value={historyScenario} onChange={e => setHistoryScenario(e.target.value)} className="w-full mt-1 border border-stone-200 rounded p-2 text-sm">
                  {scenarios.map(s => <option key={s.id} value={s.memberCode}>{s.memberCode} — {s.memberName}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-stone-500 tracking-wide block mb-1">History period (any Time level)</label>
                <TimePOVPicker value={historyTimeCode} onChange={setHistoryTimeCode} label="" />
                <p className="text-[10px] text-stone-400 mt-1 italic">Pick FY2026H1 for first-half history, or 2026-04 for a single month</p>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-lg border border-stone-200 p-5">
            <h2 className="text-xs font-bold text-stone-700 uppercase tracking-wide mb-3">2. Method &amp; Target</h2>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-stone-500 tracking-wide">Method</label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {(["RUN_RATE", "GROWTH_PCT", "LINEAR_TREND"] as const).map(m => (
                    <button key={m} onClick={() => setMethod(m)} className={`px-2 py-2 rounded text-[11px] font-semibold border-2 transition ${method === m ? "bg-sky-50 border-sky-400 text-sky-900" : "bg-white border-stone-200 text-stone-600 hover:border-sky-200"}`}>
                      {m.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-stone-500 mt-1 italic">
                  {method === "RUN_RATE"     && `Avg of last ${basisN} months × project flat into future.`}
                  {method === "GROWTH_PCT"   && `Apply ${(growthPct * 100).toFixed(1)}% growth compounding each period from last actual.`}
                  {method === "LINEAR_TREND" && `Fit linear regression to history, project the line forward.`}
                </p>
              </div>
              {method === "GROWTH_PCT" && (
                <div>
                  <label className="text-[10px] uppercase font-bold text-stone-500 tracking-wide">Growth % per period</label>
                  <input type="number" step="0.01" value={growthPct} onChange={e => setGrowthPct(parseFloat(e.target.value || "0"))} className="w-full mt-1 border border-stone-200 rounded p-2 text-sm" />
                  <p className="text-[10px] text-stone-400 mt-1">0.05 = 5% per period</p>
                </div>
              )}
              {method === "RUN_RATE" && (
                <div>
                  <label className="text-[10px] uppercase font-bold text-stone-500 tracking-wide">Basis months (avg of last N)</label>
                  <input type="number" min={1} max={24} value={basisN} onChange={e => setBasisN(parseInt(e.target.value || "3"))} className="w-full mt-1 border border-stone-200 rounded p-2 text-sm" />
                </div>
              )}
              <div>
                <label className="text-[10px] uppercase font-bold text-stone-500 tracking-wide">Target scenario (where the forecast lands)</label>
                <select value={targetScenario} onChange={e => setTargetScenario(e.target.value)} className="w-full mt-1 border border-stone-200 rounded p-2 text-sm">
                  {scenarios.map(s => <option key={s.id} value={s.memberCode}>{s.memberCode} — {s.memberName}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-stone-500 tracking-wide block mb-1">Future period (any Time level)</label>
                <TimePOVPicker value={futureTimeCode} onChange={setFutureTimeCode} label="" />
                <p className="text-[10px] text-stone-400 mt-1 italic">Pick FY2026H2 to forecast second half, or FY2026Q4 for one quarter</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-stone-700">
                <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} />
                Overwrite existing rows in target intersection
              </label>
            </div>
          </section>
        </div>

        <div className="mt-5 bg-white rounded-lg border border-stone-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-stone-700 uppercase tracking-wide">3. Run forecast</h2>
            <button onClick={runForecast} disabled={running} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:opacity-40">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Run {method.replace(/_/g, " ")}
            </button>
          </div>
          {error && (<div className="px-3 py-2 rounded bg-rose-50 text-rose-800 text-xs flex items-center gap-2"><AlertCircle className="w-3.5 h-3.5" /> {error}</div>)}
          {result && (
            <div className="space-y-3">
              <div className="px-3 py-2 rounded bg-emerald-50 text-emerald-900 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Wrote <b>&nbsp;{result.rowsWritten}&nbsp;</b> forecast rows across <b>&nbsp;{result.accountCount}&nbsp;</b> accounts × <b>&nbsp;{result.entityCount}&nbsp;</b> entities × <b>&nbsp;{result.futurePeriodCount}&nbsp;</b> future periods. Read {result.rowsRead} history rows.
              </div>
              {result.sample?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase font-bold text-stone-500 tracking-wide mb-2">Sample (first 3 series)</p>
                  <div className="space-y-2">
                    {result.sample.map((s: any, i: number) => (
                      <div key={i} className="border border-stone-200 rounded p-3 text-xs">
                        <p className="font-mono text-[10px] text-stone-400">account {s.accountId.slice(0,8)} · entity {s.entityId.slice(0,8)}</p>
                        <div className="mt-1 grid grid-cols-2 gap-3">
                          <div><p className="text-[10px] uppercase text-stone-500">History</p><p className="font-mono">[{s.history.map((v: number) => v.toFixed(0)).join(", ")}]</p></div>
                          <div><p className="text-[10px] uppercase text-stone-500">Forecast</p><p className="font-mono text-sky-700">[{s.forecast.map((v: number) => v.toFixed(0)).join(", ")}]</p></div>
                        </div>
                        <p className="text-[10px] text-stone-400 mt-1">mean={s.basis.historyMean.toFixed(1)} · last={s.basis.historyLast.toFixed(1)} · count={s.basis.historyCount}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="mt-5 text-xs text-stone-500 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-violet-500" /> Tip: ask AI Copilot — "forecast US_HQ revenue for FY2026 H2 using growth method" — it can pre-fill this.
        </p>
      </div>
    </div>
  );
}

function PeriodPicker({ label, value, onChange, periods }: { label: string; value: string; onChange: (s: string) => void; periods: Member[] }) {
  return (
    <div>
      <label className="text-[10px] uppercase font-bold text-stone-500 tracking-wide">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full mt-1 border border-stone-200 rounded p-2 text-sm">
        <option value="">— pick a month —</option>
        {periods.map(p => <option key={p.id} value={p.memberCode}>{p.memberCode}</option>)}
      </select>
    </div>
  );
}

function PickerMulti({ label, items, selected, onChange, placeholder }: { label: string; items: { id: string; label: string }[]; selected: string[]; onChange: (s: string[]) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const filtered = q ? items.filter(i => i.label.toLowerCase().includes(q.toLowerCase())) : items;
  function toggle(id: string) { onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]); }
  return (
    <div>
      <label className="text-[10px] uppercase font-bold text-stone-500 tracking-wide flex items-center justify-between">
        <span>{label}</span><span className="text-stone-400 normal-case">{selected.length} selected</span>
      </label>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} className="w-full mt-1 border border-stone-200 rounded p-2 text-sm" />
      <div className="max-h-40 overflow-y-auto border border-stone-200 border-t-0 rounded-b -mt-px">
        {filtered.slice(0, 50).map(i => (
          <button key={i.id} onClick={() => toggle(i.id)} className={`w-full text-left text-xs px-2 py-1.5 hover:bg-stone-50 ${selected.includes(i.id) ? "bg-sky-50 text-sky-900 font-semibold" : "text-stone-700"}`}>
            {selected.includes(i.id) ? "✓ " : "  "}{i.label}
          </button>
        ))}
        {filtered.length === 0 && <p className="px-2 py-2 text-[11px] text-stone-400 italic">No matches</p>}
      </div>
    </div>
  );
}
