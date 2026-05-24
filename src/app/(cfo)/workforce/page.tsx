"use client";

// Workforce Planning v1 — shared fact_rows table, Position dim slot (UD3),
// STATISTICAL accounts for headcount, COMP_* accounts for compensation.
//
// v1 layout: KPI strip + position table + comp-build trigger.
//   - Total Headcount (sum of HEADCOUNT_FTE across all positions)
//   - Total Compensation (sum of base + benefits + bonus)
//   - Position-level table — code, name, monthly base, status
//   - "Build comp" button → triggers COMP_BUILD CalcRule
//
// v2 will add: org chart, hire/term timeline, comp roll-forward.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Plus, TrendingUp, DollarSign, Briefcase, RefreshCw, Loader2, Sparkles, Calculator, ChevronRight } from "lucide-react";

type Position = { id: string; memberCode: string; memberName: string; properties: any };

export default function WorkforcePage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [stats, setStats] = useState<{ totalHc: number; totalComp: number; avgComp: number; periods: number } | null>(null);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    setLoading(true); setError(null);
    try {
      // Position dim is UD3 by convention; if not yet provisioned the API returns []
      const r = await fetch("/api/v2/members/ud3?pageSize=500", { credentials: "include" });
      const j = await r.json();
      const items = ((j?.data?.data ?? []) as Position[]).filter(p => (p as any).isActive);
      setPositions(items);
      // Fetch stats (HEADCOUNT_FTE + comp accounts summed) — best-effort
      await loadStats();
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setLoading(false); }
  }

  async function loadStats() {
    try {
      // Sum HEADCOUNT_FTE × periods across all positions (uses /api/v2/facts which respects RLS)
      const params = new URLSearchParams({ accountCodes: "HEADCOUNT_FTE,BASE_SALARY,BENEFITS,BONUS" });
      const r = await fetch(`/api/v2/facts?${params}`, { credentials: "include" });
      const j = await r.json();
      const rows = j?.data?.data ?? j?.data ?? [];
      let totalHc = 0, totalComp = 0;
      const periods = new Set<string>();
      for (const f of rows) {
        const code = f.account?.memberCode ?? f.accountCode;
        const v = Number(f.value ?? f.valueReporting ?? 0);
        if (code === "HEADCOUNT_FTE") totalHc += v;
        else if (["BASE_SALARY", "BENEFITS", "BONUS"].includes(code)) totalComp += v;
        if (f.time?.memberCode) periods.add(f.time.memberCode);
      }
      setStats({ totalHc, totalComp, avgComp: totalHc > 0 ? totalComp / totalHc : 0, periods: periods.size });
    } catch { setStats(null); }
  }

  return (
    <div className="flex flex-1 min-w-0 overflow-y-auto">
      <div className="flex-1 min-w-0 p-6 max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-lg font-bold text-stone-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" /> Workforce Planning
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">Positions (UD3) × Headcount (STATISTICAL) × Compensation (BASE_SALARY/BENEFITS/BONUS) — all in one fact table.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} disabled={loading} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-stone-600 hover:bg-stone-100">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700">
              <Plus className="w-3.5 h-3.5" /> Add position
            </button>
          </div>
        </header>

        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <Kpi label="Positions" value={positions.length.toString()} icon={Briefcase} tone="emerald" />
          <Kpi label="Total HC (FTE)" value={(stats?.totalHc ?? 0).toFixed(1)} icon={Users} tone="sky" />
          <Kpi label="Total Comp" value={(stats?.totalComp ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} icon={DollarSign} tone="violet" />
          <Kpi label="Avg / HC" value={(stats?.avgComp ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} icon={TrendingUp} tone="amber" />
        </div>

        {error && <div className="px-3 py-2 mb-3 rounded bg-rose-50 text-rose-800 text-xs">⚠ {error}</div>}

        {/* Positions list */}
        <section className="bg-white rounded-lg border border-stone-200">
          <header className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
            <h2 className="text-xs font-bold text-stone-700 uppercase tracking-wide">Positions</h2>
            <p className="text-[10px] text-stone-400">Stored in UD3 dimension — also editable in Metadata → Dimension Library</p>
          </header>
          {positions.length === 0 && !loading && (
            <EmptyState onAdd={() => setShowAdd(true)} />
          )}
          {positions.length > 0 && (
            <ul className="divide-y divide-stone-100">
              {positions.map(p => (
                <li key={p.id}>
                  <Link href={`/workforce/${p.id}`} className="px-4 py-3 hover:bg-stone-50 flex items-center gap-3 group">
                    <Briefcase className="w-4 h-4 text-stone-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-900 group-hover:text-emerald-700">{p.memberName}</p>
                      <p className="text-[11px] text-stone-500 font-mono">{p.memberCode} {p.properties?.department && `· ${p.properties.department}`} {p.properties?.level && `· ${p.properties.level}`}</p>
                    </div>
                    {p.properties?.baseSalary && (
                      <span className="text-xs text-stone-700 font-semibold">{Number(p.properties.baseSalary).toLocaleString()} base</span>
                    )}
                    <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-emerald-500" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Tip: vibe a comp build rule */}
        <section className="mt-5 bg-gradient-to-br from-violet-50 to-fuchsia-50 border border-violet-200 rounded-lg p-4">
          <h3 className="text-sm font-bold text-violet-900 flex items-center gap-2 mb-1">
            <Calculator className="w-4 h-4" /> Comp builder (Calc Rule)
          </h3>
          <p className="text-xs text-violet-800 mb-3">
            Total comp = Base × (1 + Σmultipliers). Spin up a COMP_BUILD rule with one prompt — e.g.
            <em> "Build total comp from BASE_SALARY with 20% benefits, 10% bonus, 15% taxes."</em>
          </p>
          <a href="/rules" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700">
            <Sparkles className="w-3.5 h-3.5" /> Vibe a comp rule →
          </a>
        </section>

        <p className="mt-5 text-xs text-stone-500 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-violet-500" /> Tip: ask AI Copilot — "what's our total comp by department for FY2026?" — it'll query workforce facts directly.
        </p>
      </div>

      {showAdd && <AddPositionModal onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); refresh(); }} />}
    </div>
  );
}

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone: "emerald"|"sky"|"violet"|"amber" }) {
  const palette = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-900", icon: "text-emerald-500" },
    sky:     { bg: "bg-sky-50",     text: "text-sky-900",     icon: "text-sky-500" },
    violet:  { bg: "bg-violet-50",  text: "text-violet-900",  icon: "text-violet-500" },
    amber:   { bg: "bg-amber-50",   text: "text-amber-900",   icon: "text-amber-500" },
  }[tone];
  return (
    <div className={`rounded-lg ${palette.bg} p-4 border border-stone-200/60`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-3.5 h-3.5 ${palette.icon}`} />
        <span className={`text-[10px] uppercase tracking-widest font-bold ${palette.text}`}>{label}</span>
      </div>
      <p className={`text-xl font-extrabold tabular-nums leading-none ${palette.text}`}>{value}</p>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="px-4 py-10 text-center">
      <Briefcase className="w-8 h-8 text-stone-300 mx-auto mb-3" />
      <p className="text-sm font-semibold text-stone-700">No positions yet</p>
      <p className="text-xs text-stone-500 mt-1 mb-4">Add positions to UD3 (Position dim) to start workforce planning.</p>
      <button onClick={onAdd} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700">
        <Plus className="w-3.5 h-3.5" /> Add position
      </button>
    </div>
  );
}

function AddPositionModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [dept, setDept] = useState("");
  const [level, setLevel] = useState("");
  const [location, setLocation] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [managerCode, setManagerCode] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [termDate, setTermDate] = useState("");
  const [employmentType, setEmploymentType] = useState("full-time");
  const [base, setBase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!code.trim() || !name.trim()) { setError("Code and name required"); return; }
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/v2/members/ud3", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberCode: code, memberName: name,
          properties: {
            department:      dept || undefined,
            level:           level || undefined,
            location:        location || undefined,
            employee_id:     employeeId || undefined,
            manager_position_code: managerCode || undefined,
            hire_date:       hireDate || undefined,
            term_date:       termDate || undefined,
            employment_type: employmentType,
            baseSalary:      base ? parseFloat(base) : undefined,
          },
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      onAdded();
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2 mb-4">
          <Briefcase className="w-4 h-4 text-emerald-600" /> Add position
        </h2>
        <p className="text-[11px] text-stone-500 mb-4">A position = one seat. People (employees) sit inside via the employee_id property. One seat may turn over multiple people over time.</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Position code" value={code} onChange={setCode} placeholder="ENG-001" />
            <Field label="Position name" value={name} onChange={setName} placeholder="Senior Engineer" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Department" value={dept} onChange={setDept} placeholder="Engineering" />
            <Field label="Level" value={level} onChange={setLevel} placeholder="L4" />
            <Field label="Location" value={location} onChange={setLocation} placeholder="Bangalore" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Current employee ID" value={employeeId} onChange={setEmployeeId} placeholder="E-12345 (blank = open req)" />
            <Field label="Manager position code" value={managerCode} onChange={setManagerCode} placeholder="ENG-MGR-001" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Hire date" value={hireDate} onChange={setHireDate} placeholder="2026-01-15" type="date" />
            <Field label="Term date (if applicable)" value={termDate} onChange={setTermDate} placeholder="" type="date" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase font-semibold text-stone-500 tracking-wide">Employment type</label>
              <select value={employmentType} onChange={e => setEmploymentType(e.target.value)} className="w-full mt-1 border border-stone-200 rounded p-2 text-sm">
                {["full-time","part-time","contractor","intern","fractional"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <Field label="Base salary (monthly, local ccy)" value={base} onChange={setBase} placeholder="500000" />
          </div>
          {error && <p className="text-xs text-rose-700 bg-rose-50 px-3 py-2 rounded">⚠ {error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-stone-100">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-xs text-stone-600 hover:bg-stone-100">Cancel</button>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-40">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add position
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (s: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="text-[10px] uppercase font-semibold text-stone-500 tracking-wide">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full mt-1 border border-stone-200 rounded p-2 text-sm focus:outline-none focus:border-emerald-400" />
    </div>
  );
}
