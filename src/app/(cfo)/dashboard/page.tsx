"use client";

// Executive Dashboard — top-class data-first design.
// Inspired by Linear / Stripe / Cube Cloud. Subtle, dense, accent-key-coded.
//
// Layout: POV filters → 6 KPI hero cards → main monthly chart →
// 2-col (revenue by entity donut + expense by category stacked bar) →
// 2-col (top variances list + cash trajectory) → refresh footer.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CFOHeader } from "@/components/cfo/Header";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, RefreshCw, Loader2, Download, Sparkles,
  ChevronDown, AlertTriangle, Globe, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Member = { id: string; code: string; name: string };

interface SummaryData {
  kpis: {
    revenue:     { value: number; deltaPct: number | null };
    cogs:        { value: number; deltaPct: number | null };
    grossProfit: { value: number; deltaPct: number | null };
    opex:        { value: number; deltaPct: number | null };
    netIncome:   { value: number; deltaPct: number | null };
    cash:        { value: number; deltaPct: number | null };
    grossMargin: number;
    netMargin:   number;
  };
  monthly: { code: string; revenue: number; expense: number; budget: number; netIncome: number }[];
  byEntity: { id: string; code: string; name: string; value: number }[];
  byCategory: { name: string; actual: number; budget: number }[];
  topVariances: { code: string; name: string; type: string | null; actual: number; budget: number; variance: number; variancePct: number }[];
  cashTrend: { code: string; value: number }[];
  meta: { scenarioId: string; yearCode: string; entityCount: number; hasCompare: boolean; factsRead: number };
}

// Tokens — keep these consistent across the dashboard
const C = {
  bg:        "#FAFAF7",
  card:      "#FFFFFF",
  ink:       "#0E0F12",
  inkSoft:   "#3F4147",
  inkDim:    "#9095A0",
  rule:      "#E8E8E5",
  ruleSoft:  "#F0F0EC",
  positive:  "#0E9462",
  negative:  "#C92A2A",
  accent:    "#4F46E5",
  revenue:   "#0E9462",
  expense:   "#C92A2A",
  budget:    "#9095A0",
  netIncome: "#4F46E5",
  cash:      "#06B6D4",
  donutPalette: ["#4F46E5", "#0E9462", "#C92A2A", "#06B6D4", "#F59E0B", "#8B5CF6"],
};

function fmt(n: number, ccy: string, compact = true): string {
  if (n === 0 || !Number.isFinite(n)) return "—";
  const sym: Record<string, string> = { USD: "$", GBP: "£", EUR: "€", INR: "₹", AED: "د.إ" };
  const s = sym[ccy] ?? ccy + " ";
  const abs = Math.abs(n);
  let body: string;
  if (compact) {
    if (abs >= 1e9) body = (abs / 1e9).toFixed(abs >= 1e10 ? 0 : 1) + "B";
    else if (abs >= 1e6) body = (abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1) + "M";
    else if (abs >= 1e3) body = (abs / 1e3).toFixed(abs >= 1e4 ? 0 : 1) + "K";
    else body = abs.toFixed(0);
  } else {
    body = abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return n < 0 ? `(${s}${body})` : `${s}${body}`;
}

function fmtPct(n: number | null, opts: { signed?: boolean; positiveGreen?: boolean } = {}): { text: string; cls: string } {
  if (n === null || !Number.isFinite(n)) return { text: "—", cls: "text-stone-400" };
  const txt = `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
  const cls = n > 0
    ? (opts.positiveGreen === false ? "text-rose-700" : "text-emerald-700")
    : n < 0
      ? (opts.positiveGreen === false ? "text-emerald-700" : "text-rose-700")
      : "text-stone-500";
  return { text: txt, cls };
}

async function fetchMembers(slug: string): Promise<Member[]> {
  const r = await fetch(`/api/v2/members/${slug}?pageSize=500`, { credentials: "include" });
  const j = await r.json().catch(() => null);
  return (j?.data?.data ?? []).filter((m: any) => m.isActive).map((m: any) => ({ id: m.id, code: m.memberCode, name: m.memberName }));
}

export default function DashboardPage() {
  // ── POV state ───────────────────────────────────────────────────
  const [scenarios, setScenarios] = useState<Member[]>([]);
  const [entities,  setEntities]  = useState<Member[]>([]);
  const [years,     setYears]     = useState<Member[]>([]);
  const [scenarioId, setScenarioId] = useState<string>("");
  const [compareScenarioId, setCompareScenarioId] = useState<string>("");
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [yearCode, setYearCode] = useState<string>("");
  const [ccy, setCcy] = useState<string>("USD");

  // ── Data state ──────────────────────────────────────────────────
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // ── Initial bootstrap ───────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [scns, ents, times, settings] = await Promise.all([
          fetchMembers("scenario"), fetchMembers("entity"), fetchMembers("time"),
          fetch("/api/settings", { credentials: "include" }).then(r => r.json()),
        ]);
        setScenarios(scns);
        setEntities(ents);
        setYears(times.filter(t => /^FY\d{4}$/.test(t.code)));
        setCcy(settings?.data?.reportingCurrency ?? "USD");
        // Defaults
        const act = scns.find(s => /^(ACT|ACTUAL)/i.test(s.code)) ?? scns[0];
        const bud = scns.find(s => /^(BUD|BUDGET)/i.test(s.code));
        const fy  = times.find(t => /^FY\d{4}$/.test(t.code));
        if (act) setScenarioId(act.id);
        if (bud) setCompareScenarioId(bud.id);
        if (fy) setYearCode(fy.code);
        setSelectedEntityIds([]);   // empty = all leaves
      } catch (e: any) { setError(e.message); }
    })();
  }, []);

  // ── Fetch summary when POV changes ──────────────────────────────
  const fetchSummary = useCallback(async () => {
    if (!scenarioId || !yearCode) return;
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({ scenarioId, yearCode });
      if (compareScenarioId) qs.set("compareScenarioId", compareScenarioId);
      if (selectedEntityIds.length > 0) qs.set("entityIds", selectedEntityIds.join(","));
      const r = await fetch(`/api/v2/dashboard/summary?${qs}`, { credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setData(j.data as SummaryData);
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setLoading(false); }
  }, [scenarioId, compareScenarioId, yearCode, selectedEntityIds]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  // ── Derived ──────────────────────────────────────────────────────
  const entityName = useMemo(() => {
    if (selectedEntityIds.length === 0) return `All ${entities.length || ""} entities`.trim();
    if (selectedEntityIds.length === 1) return entities.find(e => e.id === selectedEntityIds[0])?.name ?? "1 entity";
    return `${selectedEntityIds.length} entities`;
  }, [selectedEntityIds, entities]);

  const chartData = useMemo(() => (data?.monthly ?? []).map(m => ({
    month: m.code.slice(-3).replace("M0", "M"),
    Revenue: m.revenue,
    Expenses: m.expense,
    "Net Income": m.netIncome,
    Budget: m.budget,
  })), [data]);

  return (
    <>
      <CFOHeader
        title="Executive Dashboard"
        subtitle={data ? `${entityName} · ${yearCode} · ${ccy} · ${data.meta.factsRead.toLocaleString()} facts` : "Loading…"}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={fetchSummary} disabled={loading}
              className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-sunken)]">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
            </button>
            <button className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-sunken)]">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <button className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-violet-600 text-white hover:bg-violet-700">
              <Sparkles className="w-3.5 h-3.5" /> AI Insights · soon
            </button>
          </div>
        }
      />

      <main className="flex-1 overflow-y-auto" style={{ background: C.bg }}>
        {/* POV filter bar — sticky */}
        <div className="sticky top-0 z-10 backdrop-blur-md" style={{ background: "rgba(250,250,247,0.85)", borderBottom: `1px solid ${C.rule}` }}>
          <div className="px-6 py-3 flex flex-wrap items-center gap-3">
            <FilterChip label="Scenario" icon={Calendar}>
              <select value={scenarioId} onChange={e => setScenarioId(e.target.value)} className="bg-transparent text-xs font-semibold outline-none cursor-pointer">
                {scenarios.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
              </select>
            </FilterChip>
            <span className="text-[10px] uppercase tracking-wider text-stone-400">vs</span>
            <FilterChip label="Compare">
              <select value={compareScenarioId} onChange={e => setCompareScenarioId(e.target.value)} className="bg-transparent text-xs font-semibold outline-none cursor-pointer">
                <option value="">(none)</option>
                {scenarios.filter(s => s.id !== scenarioId).map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
              </select>
            </FilterChip>
            <FilterChip label="Year" icon={Calendar}>
              <select value={yearCode} onChange={e => setYearCode(e.target.value)} className="bg-transparent text-xs font-semibold outline-none cursor-pointer">
                {years.map(y => <option key={y.id} value={y.code}>{y.code}</option>)}
              </select>
            </FilterChip>
            <EntityMultiSelect entities={entities} selected={selectedEntityIds} onChange={setSelectedEntityIds} />
            {error && <span className="ml-auto text-xs text-rose-700">⚠ {error}</span>}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* KPI Hero Strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <KpiCard label="Revenue"      value={data?.kpis.revenue.value      ?? 0} delta={data?.kpis.revenue.deltaPct      ?? null} ccy={ccy} accent={C.revenue}   loading={!data} />
            <KpiCard label="COGS"         value={data?.kpis.cogs.value         ?? 0} delta={data?.kpis.cogs.deltaPct         ?? null} ccy={ccy} accent={C.expense}  loading={!data} positiveGreen={false} />
            <KpiCard label="Gross Profit" value={data?.kpis.grossProfit.value  ?? 0} delta={data?.kpis.grossProfit.deltaPct  ?? null} ccy={ccy} accent={C.netIncome} loading={!data} subValue={data ? `${data.kpis.grossMargin.toFixed(1)}% margin` : ""} />
            <KpiCard label="Opex"         value={data?.kpis.opex.value         ?? 0} delta={data?.kpis.opex.deltaPct         ?? null} ccy={ccy} accent={C.expense}  loading={!data} positiveGreen={false} />
            <KpiCard label="Net Income"   value={data?.kpis.netIncome.value    ?? 0} delta={data?.kpis.netIncome.deltaPct    ?? null} ccy={ccy} accent={C.netIncome} loading={!data} subValue={data ? `${data.kpis.netMargin.toFixed(1)}% margin` : ""} highlight />
            <KpiCard label="Cash Position" value={data?.kpis.cash.value        ?? 0} delta={data?.kpis.cash.deltaPct         ?? null} ccy={ccy} accent={C.cash}     loading={!data} />
          </div>

          {/* Main monthly trend chart */}
          <Card title="Revenue, Expenses & Net Income" eyebrow="MONTHLY TREND" subtitle={`${yearCode} · in ${ccy}`}>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor={C.revenue} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={C.revenue} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor={C.expense} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={C.expense} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={C.ruleSoft} vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} stroke={C.inkDim} fontSize={11} />
                  <YAxis axisLine={false} tickLine={false} stroke={C.inkDim} fontSize={11} tickFormatter={v => fmt(v, ccy, true)} width={60} />
                  <Tooltip
                    contentStyle={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 8, fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}
                    formatter={(v: any) => fmt(Number(v), ccy, false)}
                  />
                  <Area type="monotone" dataKey="Revenue"   stroke={C.revenue} strokeWidth={2} fill="url(#gRev)" />
                  <Area type="monotone" dataKey="Expenses"  stroke={C.expense} strokeWidth={2} fill="url(#gExp)" />
                  <Line type="monotone" dataKey="Net Income" stroke={C.netIncome} strokeWidth={2} dot={false} />
                  {data?.meta.hasCompare && <Line type="monotone" dataKey="Budget" stroke={C.budget} strokeWidth={1.5} strokeDasharray="3 3" dot={false} />}
                  <Legend iconType="line" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Revenue by Entity + Expense by Category */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Card title="Revenue by Entity" eyebrow="GEOGRAPHIC MIX" subtitle={`${data?.byEntity.length ?? 0} entities`}>
              <div className="flex items-center gap-6" style={{ height: 240 }}>
                <ResponsiveContainer width="55%" height="100%">
                  <PieChart>
                    <Pie data={data?.byEntity ?? []} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="88%" paddingAngle={2}>
                      {(data?.byEntity ?? []).map((_, i) => <Cell key={i} fill={C.donutPalette[i % C.donutPalette.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => fmt(Number(v), ccy, false)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2 text-xs">
                  {(data?.byEntity ?? []).map((e, i) => {
                    const total = (data?.byEntity ?? []).reduce((s, x) => s + x.value, 0);
                    const pct = total > 0 ? (e.value / total) * 100 : 0;
                    return (
                      <div key={e.id} className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.donutPalette[i % C.donutPalette.length] }} />
                        <span className="font-medium text-stone-700 truncate flex-1">{e.code}</span>
                        <span className="font-mono tabular-nums text-stone-900">{fmt(e.value, ccy)}</span>
                        <span className="font-mono tabular-nums text-stone-500 w-12 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>

            <Card title="Expenses by Category" eyebrow="ACTUAL vs BUDGET" subtitle={data?.meta.hasCompare ? "Side-by-side" : "Actual only"}>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.byCategory ?? []} margin={{ top: 5, right: 5, left: -10, bottom: 0 }} barCategoryGap="22%">
                    <CartesianGrid stroke={C.ruleSoft} vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} stroke={C.inkDim} fontSize={10} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis axisLine={false} tickLine={false} stroke={C.inkDim} fontSize={11} tickFormatter={v => fmt(v, ccy, true)} width={60} />
                    <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => fmt(Number(v), ccy, false)} />
                    <Bar dataKey="actual" fill={C.expense} radius={[3, 3, 0, 0]} name="Actual" />
                    {data?.meta.hasCompare && <Bar dataKey="budget" fill={C.budget} radius={[3, 3, 0, 0]} name="Budget" />}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Top Variances + Cash Trend */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Card title="Top Variances" eyebrow="ACTUAL vs BUDGET" subtitle={data?.meta.hasCompare ? "Largest absolute" : "Set Budget scenario in Compare to see"}>
              {!data?.meta.hasCompare ? (
                <div className="py-10 text-center text-sm text-stone-500">Add a Compare scenario in the POV bar to view variances.</div>
              ) : (
                <div className="space-y-1">
                  {(data?.topVariances ?? []).map(v => {
                    const isFav  = v.type === "REVENUE" ? v.variance >= 0 : v.variance <= 0;
                    const cls    = isFav ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50";
                    return (
                      <div key={v.code} className="flex items-center gap-3 py-2 border-b border-stone-100 last:border-b-0">
                        <span className="font-mono text-[10px] text-stone-400 w-12">{v.code}</span>
                        <span className="text-sm text-stone-800 flex-1 truncate">{v.name}</span>
                        <span className="font-mono text-[12px] tabular-nums text-stone-700 w-20 text-right">{fmt(v.actual, ccy)}</span>
                        <span className="font-mono text-[12px] tabular-nums text-stone-400 w-20 text-right">vs {fmt(v.budget, ccy)}</span>
                        <span className={cn("font-mono text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-md w-20 text-right", cls)}>
                          {v.variance > 0 ? "+" : ""}{v.variancePct.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                  {(data?.topVariances ?? []).length === 0 && <p className="text-sm text-stone-500 py-6 text-center">No variances.</p>}
                </div>
              )}
            </Card>

            <Card title="Cash Trajectory" eyebrow="MONTH-END CLOSING" subtitle={`${data?.cashTrend.length ?? 0} months`}>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={(data?.cashTrend ?? []).map(c => ({ month: c.code.slice(-3).replace("M0", "M"), Cash: c.value }))} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gCash" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.cash} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={C.cash} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={C.ruleSoft} vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} stroke={C.inkDim} fontSize={11} />
                    <YAxis axisLine={false} tickLine={false} stroke={C.inkDim} fontSize={11} tickFormatter={v => fmt(v, ccy, true)} width={60} />
                    <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => fmt(Number(v), ccy, false)} />
                    <Line type="monotone" dataKey="Cash" stroke={C.cash} strokeWidth={2.5} dot={{ fill: C.cash, r: 3 }} fillOpacity={1} fill="url(#gCash)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────

function KpiCard({ label, value, delta, ccy, accent, loading, subValue, highlight, positiveGreen = true }: {
  label: string; value: number; delta: number | null; ccy: string; accent: string;
  loading?: boolean; subValue?: string; highlight?: boolean; positiveGreen?: boolean;
}) {
  const d = fmtPct(delta, { positiveGreen });
  return (
    <div
      className={cn(
        "relative rounded-lg p-3.5 transition-all border bg-white hover:-translate-y-0.5",
        highlight ? "border-violet-200 ring-1 ring-violet-100" : "border-stone-200/80"
      )}
      style={{ boxShadow: highlight ? "0 4px 20px rgba(79,70,229,0.08)" : "0 1px 2px rgba(0,0,0,0.02)" }}
    >
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-lg" style={{ background: accent, opacity: highlight ? 1 : 0.5 }} />
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] uppercase tracking-widest font-semibold text-stone-500">{label}</span>
      </div>
      {loading ? (
        <div className="h-7 w-20 rounded bg-stone-100 animate-pulse" />
      ) : (
        <p className="text-[26px] font-bold tabular-nums leading-none" style={{ color: value < 0 ? "#C92A2A" : "#0E0F12" }}>
          {fmt(value, ccy)}
        </p>
      )}
      {subValue && <p className="text-[10px] text-stone-500 mt-1.5 font-medium">{subValue}</p>}
      {delta !== null && (
        <div className={cn("inline-flex items-center gap-1 mt-2 px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums", d.cls.replace("text-", "bg-").replace("-700", "-50") + " " + d.cls)}>
          {delta > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
          {d.text}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, icon: Icon, children }: { label: string; icon?: any; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-stone-200 bg-white">
      {Icon && <Icon className="w-3 h-3 text-stone-400" />}
      <span className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">{label}</span>
      {children}
    </div>
  );
}

function EntityMultiSelect({ entities, selected, onChange }: { entities: Member[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as any)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const label = selected.length === 0
    ? `All ${entities.length} entities`
    : selected.length <= 2
      ? selected.map(id => entities.find(e => e.id === id)?.code).filter(Boolean).join(", ")
      : `${selected.length} entities`;

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-stone-200 bg-white hover:bg-stone-50">
        <Globe className="w-3 h-3 text-stone-400" />
        <span className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">Entities</span>
        <span className="text-xs font-semibold text-stone-900">{label}</span>
        <ChevronDown className={cn("w-3 h-3 text-stone-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-64 rounded-md border border-stone-200 bg-white shadow-lg max-h-72 overflow-y-auto">
          <button onClick={() => onChange([])} className="w-full text-left px-3 py-2 text-xs hover:bg-stone-50 border-b border-stone-100 font-medium">
            All entities {selected.length === 0 ? "✓" : ""}
          </button>
          {entities.map(e => {
            const isSelected = selected.includes(e.id);
            return (
              <button key={e.id}
                onClick={() => onChange(isSelected ? selected.filter(x => x !== e.id) : [...selected, e.id])}
                className="w-full text-left px-3 py-2 text-xs hover:bg-stone-50 flex items-center gap-2"
              >
                <span className={cn("w-3 h-3 rounded border flex items-center justify-center", isSelected ? "bg-violet-600 border-violet-600" : "border-stone-300")}>
                  {isSelected && <span className="text-white text-[10px]">✓</span>}
                </span>
                <span className="font-mono text-[10px] text-stone-500 w-12">{e.code}</span>
                <span className="text-stone-800">{e.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Card({ title, eyebrow, subtitle, children }: { title: string; eyebrow?: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white border border-stone-200/80 p-5" style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          {eyebrow && <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-stone-500 mb-1">{eyebrow}</p>}
          <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
          {subtitle && <p className="text-[11px] text-stone-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
