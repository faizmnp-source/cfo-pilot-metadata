"use client";

// Per-position detail page.
// Shows position properties + 12-month comp grid (HEADCOUNT_FTE / BASE_SALARY /
// BENEFITS / BONUS). Inline-edit each cell → posts to /api/v2/workforce/headcount.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Briefcase, Save, Loader2, RefreshCw, Users, DollarSign, AlertCircle, CheckCircle2 } from "lucide-react";

const METRICS = [
  { code: "HEADCOUNT_FTE", label: "FTE",      tone: "text-emerald-700" },
  { code: "BASE_SALARY",   label: "Base",     tone: "text-stone-900" },
  { code: "BENEFITS",      label: "Benefits", tone: "text-stone-700" },
  { code: "BONUS",         label: "Bonus",    tone: "text-stone-700" },
];

type Position = { id: string; memberCode: string; memberName: string; properties: any };
type Entity   = { id: string; memberCode: string; memberName: string; properties: any };
type Period   = { id: string; memberCode: string };

interface Fact {
  positionId: string; entity: string; entityName: string; scenario: string;
  period: string; account: string; value: number;
}

export default function WorkforcePositionPage() {
  const params = useParams<{ positionId: string }>();
  const positionId = params?.positionId;

  const [position, setPosition] = useState<Position | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [periods,  setPeriods]  = useState<Period[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [scenarioCode, setScenarioCode] = useState("");
  const [scenarios, setScenarios] = useState<{ id: string; memberCode: string; memberName: string }[]>([]);
  const [yearFilter, setYearFilter] = useState("2026");

  const [facts, setFacts] = useState<Fact[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Edit buffer: { [periodCode]: { [account]: value } }
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => { (async () => {
    if (!positionId) return;
    try {
      const [posR, entR, timeR, scnR] = await Promise.all([
        fetch(`/api/v2/members/ud3?pageSize=500`,      { credentials: "include" }).then(r => r.json()),
        fetch(`/api/v2/members/entity?pageSize=500`,   { credentials: "include" }).then(r => r.json()),
        fetch(`/api/v2/members/time?pageSize=500`,     { credentials: "include" }).then(r => r.json()),
        fetch(`/api/v2/members/scenario?pageSize=100`, { credentials: "include" }).then(r => r.json()),
      ]);
      const pos = (posR?.data?.data ?? []).find((p: any) => p.id === positionId);
      setPosition(pos ?? null);
      setEntities(((entR?.data?.data ?? []) as any[]).filter(e => e.isActive));
      // Accept both 2026-01 and 2026M01 month conventions
      setPeriods(((timeR?.data?.data ?? []) as Period[]).filter(t => /^\d{4}[-_]?M?\d{1,2}$/i.test(t.memberCode)).sort((a, b) => a.memberCode.localeCompare(b.memberCode)));
      if ((entR?.data?.data ?? []).length) setSelectedEntityId((entR?.data?.data ?? [])[0].id);
      // Resolve scenarios + default to Actual (case-insensitive — tenants vary)
      const scns = ((scnR?.data?.data ?? []) as any[]).filter(s => s.isActive);
      setScenarios(scns);
      const actual = scns.find(s => /^actual$/i.test(s.memberCode)) ?? scns.find(s => /act/i.test(s.memberCode)) ?? scns[0];
      if (actual) setScenarioCode(actual.memberCode);
    } catch (e: any) { setError(e.message ?? String(e)); }
  })(); }, [positionId]);

  useEffect(() => { if (positionId && selectedEntityId) refresh(); }, [positionId, selectedEntityId, yearFilter]);

  async function refresh() {
    setLoading(true); setError(null);
    try {
      // Use full year as timeCode → engine returns all month leaves
      const r = await fetch(`/api/v2/workforce/headcount?positionId=${positionId}&timeCode=FY${yearFilter}`, { credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setFacts((j?.data?.facts ?? []) as Fact[]);
      setEdits({});  // clear pending edits on reload
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setLoading(false); }
  }

  const yearPeriods = useMemo(() => periods.filter(p => p.memberCode.startsWith(yearFilter)), [periods, yearFilter]);

  function currentValue(period: string, account: string): number | null {
    const e = edits[period]?.[account];
    if (e !== undefined && e !== "") return Number(e);
    const f = facts.find(f => f.period === period && f.account === account && f.entity === entities.find(en => en.id === selectedEntityId)?.memberCode);
    return f ? f.value : null;
  }

  function setEdit(period: string, account: string, value: string) {
    setEdits(prev => ({ ...prev, [period]: { ...(prev[period] ?? {}), [account]: value }}));
  }

  async function saveAll() {
    if (Object.keys(edits).length === 0) { setToast("No changes to save"); return; }
    setSaving(true); setError(null);
    try {
      let written = 0;
      for (const [period, byAcc] of Object.entries(edits)) {
        const body: any = { positionId, entityId: selectedEntityId, scenarioCode, periodCode: period };
        if (byAcc.HEADCOUNT_FTE !== undefined && byAcc.HEADCOUNT_FTE !== "") body.headcountFte = parseFloat(byAcc.HEADCOUNT_FTE);
        if (byAcc.BASE_SALARY   !== undefined && byAcc.BASE_SALARY   !== "") body.baseSalary  = parseFloat(byAcc.BASE_SALARY);
        if (byAcc.BENEFITS      !== undefined && byAcc.BENEFITS      !== "") body.benefits   = parseFloat(byAcc.BENEFITS);
        if (byAcc.BONUS         !== undefined && byAcc.BONUS         !== "") body.bonus      = parseFloat(byAcc.BONUS);
        const r = await fetch(`/api/v2/workforce/headcount`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        written += (j?.data?.written ?? []).length;
      }
      setToast(`Saved ${written} facts`);
      await refresh();
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setSaving(false); setTimeout(() => setToast(null), 4000); }
  }

  const props = (position?.properties as any) ?? {};

  return (
    <div className="flex flex-1 min-w-0 overflow-y-auto">
      <div className="flex-1 min-w-0 p-6 max-w-7xl mx-auto">
        <Link href="/workforce" className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 mb-3">
          <ArrowLeft className="w-3 h-3" /> Back to Workforce
        </Link>

        <header className="bg-white rounded-lg border border-stone-200 p-5 mb-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <Briefcase className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-stone-900">{position?.memberName ?? "Loading…"}</h1>
              <p className="text-xs text-stone-500 font-mono mt-0.5">{position?.memberCode}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {props.department && <Pill label="Department" value={props.department} />}
                {props.level      && <Pill label="Level" value={props.level} />}
                {props.location   && <Pill label="Location" value={props.location} />}
                {props.employee_id && <Pill label="Employee" value={props.employee_id} />}
                {props.hire_date   && <Pill label="Hired" value={String(props.hire_date).slice(0,10)} />}
                {props.term_date   && <Pill label="Terminated" value={String(props.term_date).slice(0,10)} tone="rose" />}
                {props.employment_type && <Pill label="Type" value={props.employment_type} />}
              </div>
            </div>
          </div>
        </header>

        {/* Controls */}
        <div className="bg-white rounded-lg border border-stone-200 p-4 mb-5 flex items-center gap-3">
          <Control label="Entity">
            <select value={selectedEntityId} onChange={e => setSelectedEntityId(e.target.value)} className="text-xs border border-stone-200 rounded px-2 py-1">
              {entities.map(e => <option key={e.id} value={e.id}>{e.memberCode} — {e.memberName}</option>)}
            </select>
          </Control>
          <Control label="Scenario">
            <select value={scenarioCode} onChange={e => setScenarioCode(e.target.value)} className="text-xs border border-stone-200 rounded px-2 py-1">
              {scenarios.map(s => <option key={s.id} value={s.memberCode}>{s.memberCode} — {s.memberName}</option>)}
            </select>
          </Control>
          <Control label="Year">
            <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="text-xs border border-stone-200 rounded px-2 py-1">
              {Array.from(new Set(periods.map(p => p.memberCode.slice(0,4)))).map(y => <option key={y} value={y}>FY{y}</option>)}
            </select>
          </Control>
          <button onClick={refresh} disabled={loading} className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-stone-600 hover:bg-stone-100">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button onClick={saveAll} disabled={saving || Object.keys(edits).length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-40">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save {Object.keys(edits).length > 0 ? `(${Object.keys(edits).length})` : ""}
          </button>
        </div>

        {error && <div className="mb-3 px-3 py-2 rounded bg-rose-50 text-rose-800 text-xs flex items-center gap-2"><AlertCircle className="w-3.5 h-3.5" /> {error}</div>}
        {toast && <div className="mb-3 px-3 py-2 rounded bg-emerald-50 text-emerald-800 text-xs flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5" /> {toast}</div>}

        {/* Grid: rows = metrics, cols = months */}
        <div className="bg-white rounded-lg border border-stone-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-stone-700 sticky left-0 bg-stone-50 z-10">Metric</th>
                  {yearPeriods.map(p => (
                    <th key={p.id} className="text-right px-2 py-2 font-mono text-stone-500 font-semibold border-l border-stone-100">{p.memberCode.slice(5)}</th>
                  ))}
                  <th className="text-right px-3 py-2 font-bold text-stone-900 border-l border-stone-200 bg-stone-100">Total</th>
                </tr>
              </thead>
              <tbody>
                {METRICS.map(m => {
                  const rowTotal = yearPeriods.reduce((s, p) => s + (currentValue(p.memberCode, m.code) ?? 0), 0);
                  return (
                    <tr key={m.code} className="border-b border-stone-100">
                      <td className={`px-3 py-2 font-semibold sticky left-0 bg-white z-10 ${m.tone}`}>{m.label}</td>
                      {yearPeriods.map(p => {
                        const v = currentValue(p.memberCode, m.code);
                        const isEdited = edits[p.memberCode]?.[m.code] !== undefined;
                        return (
                          <td key={p.id} className={`px-1 py-1 border-l border-stone-50 ${isEdited ? "bg-amber-50" : ""}`}>
                            <input
                              type="number"
                              step={m.code === "HEADCOUNT_FTE" ? "0.1" : "100"}
                              value={isEdited ? edits[p.memberCode][m.code] : (v ?? "")}
                              onChange={e => setEdit(p.memberCode, m.code, e.target.value)}
                              placeholder="—"
                              className="w-full text-right font-mono px-1.5 py-1 border border-transparent hover:border-stone-200 focus:border-emerald-400 focus:outline-none rounded bg-transparent"
                            />
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-mono font-bold text-stone-900 border-l border-stone-200 bg-stone-50">
                        {rowTotal === 0 ? "—" : rowTotal.toLocaleString(undefined, { maximumFractionDigits: m.code === "HEADCOUNT_FTE" ? 1 : 0 })}
                      </td>
                    </tr>
                  );
                })}
                {/* Computed: Total Comp row */}
                <tr className="border-t-2 border-stone-300 bg-emerald-50/40">
                  <td className="px-3 py-2 font-bold text-emerald-900 sticky left-0 bg-emerald-50/40 z-10">Total Comp</td>
                  {yearPeriods.map(p => {
                    const total = ["BASE_SALARY","BENEFITS","BONUS"].reduce((s, a) => s + (currentValue(p.memberCode, a) ?? 0), 0);
                    return (
                      <td key={p.id} className="px-2 py-2 text-right font-mono font-semibold text-emerald-900 border-l border-stone-100">
                        {total === 0 ? "—" : total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-mono font-extrabold text-emerald-900 border-l border-stone-200 bg-emerald-100">
                    {yearPeriods.reduce((s, p) => s + ["BASE_SALARY","BENEFITS","BONUS"].reduce((ss, a) => ss + (currentValue(p.memberCode, a) ?? 0), 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-[10px] text-stone-500">
          Edit cells, then click <span className="font-semibold">Save</span>. Each metric becomes a fact row (origin=Form, position=UD3, entity, period). Auto-rolls up to entity totals via consolidation.
        </p>
      </div>
    </div>
  );
}

function Pill({ label, value, tone = "stone" }: { label: string; value: string; tone?: "stone" | "rose" }) {
  const c = tone === "rose"
    ? "bg-rose-50 text-rose-800 border-rose-200"
    : "bg-stone-100 text-stone-700 border-stone-200";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border ${c}`}>
      <span className="opacity-60">{label}:</span><span className="font-semibold">{value}</span>
    </span>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold">{label}</span>
      {children}
    </div>
  );
}
