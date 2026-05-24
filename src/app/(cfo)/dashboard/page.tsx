"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TimePOVPicker } from "@/components/reports/TimePOVPicker";

/* ─────────────────────────────────────────────────────────────────────────────
   The Executive Brief — Atelier (Direction A)
   Pixel-matched to the prototype at /design-prototype/direction-a.html.
   Reads live data from /api/v2/dashboard/summary, /api/settings, /api/v2/members/*.
   Has a full POV filter bar (Scenario / Compare / Period / Entities) styled
   as editorial pills. The right-rail panel formerly "Lyra" is now an AI Copilot
   panel that posts to /api/v2/copilot/chat to describe the FY data.
   ───────────────────────────────────────────────────────────────────────────── */

type Member = { id: string; code: string; name: string };
type Kpi = { value: number; deltaPct: number | null };
type Summary = {
  kpis: Record<string, Kpi> & { grossMargin: number; netMargin: number };
  monthly: { code: string; revenue: number; expense: number; budget: number; netIncome: number }[];
  byEntity: { id: string; code: string; name: string; value: number }[];
  byCategory: { name: string; actual: number; budget: number }[];
  topVariances: { code: string; name: string; type: string | null; actual: number; budget: number; variance: number; variancePct: number }[];
  cashTrend: { code: string; value: number }[];
  meta: { scenarioId: string; yearCode: string; entityCount: number; hasCompare: boolean; factsRead: number };
};

const ENTITY_PALETTE = ["#5B5BD6", "#2E8F6B", "#C44545", "#2BB1C4", "#b08d3a", "#7a2030", "#1a1612"];

async function fetchMembers(slug: string): Promise<Member[]> {
  const r = await fetch(`/api/v2/members/${slug}?pageSize=500`, { credentials: "include" });
  const j = await r.json().catch(() => null);
  return (j?.data?.data ?? []).filter((m: any) => m.isActive).map((m: any) => ({
    id: m.id, code: m.memberCode, name: m.memberName,
  }));
}

export default function DashboardAtelier() {
  // ── POV state ───────────────────────────────────────────────────
  const [scenarios, setScenarios] = useState<Member[]>([]);
  const [entities,  setEntities]  = useState<Member[]>([]);
  const [scenarioId, setScenarioId] = useState<string>("");
  const [compareScenarioId, setCompareScenarioId] = useState<string>("");
  const [yearCode, setYearCode] = useState<string>("");
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [ccy, setCcy] = useState("INR");
  const [tenantName, setTenantName] = useState<string>("");

  // ── Data state ──────────────────────────────────────────────────
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Bootstrap once ──────────────────────────────────────────────
  useEffect(() => {
    document.body.classList.add("atelier-theme");
    (async () => {
      try {
        const [scns, ents, times, settings] = await Promise.all([
          fetchMembers("scenario"), fetchMembers("entity"), fetchMembers("time"),
          fetch("/api/settings", { credentials: "include" }).then(r => r.json()).catch(() => null),
        ]);
        setScenarios(scns);
        setEntities(ents);
        setCcy(settings?.data?.reportingCurrency ?? "INR");
        setTenantName(settings?.data?.tenantName ?? "");

        const pov = settings?.data?.defaultPov ?? {};
        const act = (pov.scenarioCode && scns.find(s => s.code === pov.scenarioCode))
                 ?? scns.find(s => /^(ACT|Actual)/i.test(s.code)) ?? scns[0];
        const bud = (pov.compareScenarioCode && scns.find(s => s.code === pov.compareScenarioCode))
                 ?? scns.find(s => /^(BUD|Budget)/i.test(s.code));
        if (act) setScenarioId(act.id);
        if (bud) setCompareScenarioId(bud.id);

        // Period
        if (pov.periodCode) {
          setYearCode(pov.periodCode);
        } else {
          const fy = times.find(t => /^FY\d{4}$/.test(t.code));
          if (fy) setYearCode(fy.code);
        }

        // Entities: expand parent → leaves if needed; else all
        if (pov.entityCode) {
          try {
            const r = await fetch(`/api/v2/members/entity/descendants?parentCode=${encodeURIComponent(pov.entityCode)}&onlyLeaves=true`, { credentials: "include" });
            const j = await r.json();
            const ids = (j?.data?.descendants ?? []).map((d: any) => d.id);
            setSelectedEntityIds(ids);
          } catch { setSelectedEntityIds([]); }
        } else {
          setSelectedEntityIds([]);   // empty = all leaves (API default)
        }
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
    return () => { document.body.classList.remove("atelier-theme"); };
  }, []);

  // ── Fetch summary on POV change ─────────────────────────────────
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
      setData(j.data as Summary);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [scenarioId, compareScenarioId, yearCode, selectedEntityIds]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  // ── Derived labels ──────────────────────────────────────────────
  const scenarioLabel = useMemo(() => scenarios.find(s => s.id === scenarioId)?.code ?? "—", [scenarios, scenarioId]);
  const compareLabel  = useMemo(() => scenarios.find(s => s.id === compareScenarioId)?.code ?? "(none)", [scenarios, compareScenarioId]);
  const entityLabel   = useMemo(() => {
    if (selectedEntityIds.length === 0) return `All ${entities.length || data?.meta?.entityCount || 0} entities`;
    if (selectedEntityIds.length === 1) return entities.find(e => e.id === selectedEntityIds[0])?.name ?? "1 entity";
    return `${selectedEntityIds.length} entities`;
  }, [selectedEntityIds, entities, data]);

  // ── Formatters ──────────────────────────────────────────────────
  const sym = ccy === "INR" ? "₹" : ccy === "USD" ? "$" : ccy === "GBP" ? "£" : ccy === "EUR" ? "€" : ccy + " ";
  const fmt = useCallback((n: number, withUnit = true) => {
    if (!Number.isFinite(n) || n === 0) return "—";
    const abs = Math.abs(n);
    let body: string;
    if (abs >= 1e9) body = (abs / 1e9).toFixed(1) + "B";
    else if (abs >= 1e6) body = (abs / 1e6).toFixed(1) + "M";
    else if (abs >= 1e3) body = (abs / 1e3).toFixed(0) + "K";
    else body = abs.toFixed(0);
    return (withUnit ? sym : "") + body;
  }, [sym]);
  const signedPct = (p: number | null) => (p === null || !Number.isFinite(p)) ? "" : `${p >= 0 ? "▲" : "▼"} ${Math.abs(p).toFixed(1)}%`;

  const ni  = data?.kpis?.netIncome?.value ?? 0;
  const rev = data?.kpis?.revenue?.value ?? 0;
  const gp  = data?.kpis?.grossProfit?.value ?? 0;
  const ox  = data?.kpis?.opex?.value ?? 0;
  const cash = data?.kpis?.cash?.value ?? 0;
  const niMargin = data?.kpis?.netMargin ?? 0;

  const monthly = data?.monthly ?? [];
  const entitiesByRev = (data?.byEntity ?? []).filter(e => e.value !== 0).slice(0, 6);
  const totalRev = entitiesByRev.reduce((s, e) => s + e.value, 0) || 1;

  return (
    <main className="flex-1 overflow-y-auto" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      {/* MASTHEAD */}
      <header className="px-14 pt-7 pb-5 border-b flex items-end justify-between" style={{ borderColor: "var(--ink)" }}>
        <div>
          <div className="atelier-eyebrow" style={{ fontSize: 11, letterSpacing: "0.26em" }}>
            Volume IV · No. 12 · {yearCode || "—"} Edition
          </div>
          <h1 className="atelier-serif" style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1, marginTop: 6 }}>
            The Executive Brief
          </h1>
          <p className="atelier-serif italic mt-2" style={{ fontSize: 13, color: "var(--ink-3)" }}>
            {tenantName || "Apollo Hospitals"} · {entityLabel} · {yearCode || "—"} · {ccy} · {(data?.meta?.factsRead ?? 0).toLocaleString()} facts of record
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={fetchSummary} className="atelier-pill" disabled={loading} title="Refresh">
            {loading ? "…" : "↻"} Refresh
          </button>
          <button className="atelier-pill">Export</button>
          <a href="/copilot" className="atelier-pill atelier-pill-dark">⌘ Ask AI Copilot</a>
        </div>
      </header>

      {/* POV FILTER PILLS — interactive */}
      <div className="px-14 py-4 border-b flex flex-wrap gap-3 items-center" style={{ borderColor: "var(--rule)" }}>
        <PillSelect
          label="Scenario"
          value={scenarioId}
          onChange={setScenarioId}
          options={scenarios.map(s => ({ value: s.id, label: s.code }))}
        />
        <span className="atelier-eyebrow" style={{ fontSize: 10, color: "var(--ink-4)" }}>vs</span>
        <PillSelect
          label="Compare"
          value={compareScenarioId}
          onChange={setCompareScenarioId}
          options={[{ value: "", label: "(none)" }, ...scenarios.filter(s => s.id !== scenarioId).map(s => ({ value: s.id, label: s.code }))]}
        />
        <PillWrapper label="Period">
          <TimePOVPicker value={yearCode} onChange={setYearCode} label="" />
        </PillWrapper>
        <EntityMultiSelect entities={entities} selected={selectedEntityIds} onChange={setSelectedEntityIds} />
        {error && (
          <span className="ml-auto atelier-serif italic" style={{ color: "var(--accent)", fontSize: 12 }}>
            ⚠ {error}
          </span>
        )}
      </div>

      {/* SUMMARY ROW (read-only echo of pickers — keeps editorial look) */}
      <div className="px-14 py-3 border-b flex gap-8 items-center" style={{ borderColor: "var(--rule)", fontSize: 12.5, color: "var(--ink-3)" }}>
        <span><b style={{ color: "var(--ink)" }}>Scenario</b> · {scenarioLabel}</span>
        <span><b style={{ color: "var(--ink)" }}>vs</b> {compareLabel}</span>
        <span><b style={{ color: "var(--ink)" }}>Period</b> · {yearCode || "—"}</span>
        <span><b style={{ color: "var(--ink)" }}>Entities</b> · {entityLabel}</span>
        <span className="ml-auto italic">{loading ? "Refreshing…" : "Last refreshed just now"}</span>
      </div>

      {/* CONTENT GRID */}
      <div className="grid" style={{ gridTemplateColumns: "1.55fr 1fr", gap: 0 }}>
        {/* LEFT COLUMN */}
        <div className="px-14 py-9">
          {/* HERO */}
          <section className="grid" style={{ gridTemplateColumns: "1.4fr 1fr", gap: 48, alignItems: "start" }}>
            <div>
              <div className="atelier-eyebrow" style={{ color: "var(--accent)", fontWeight: 600 }}>
                The headline · Net Income
              </div>
              <div className="atelier-serif tnum"
                style={{ fontSize: 110, fontWeight: 400, letterSpacing: "-0.04em", lineHeight: 0.9, margin: "8px 0 8px", color: "var(--ink)" }}>
                {!data ? (
                  <span style={{ color: "var(--ink-4)" }}>—</span>
                ) : ni < 0 ? (
                  <>
                    <span style={{ color: "var(--accent)" }}>(</span>
                    {fmt(ni)}
                    <span style={{ color: "var(--accent)" }}>)</span>
                  </>
                ) : (
                  fmt(ni)
                )}
              </div>
              <p className="atelier-serif italic" style={{ fontSize: 17, color: "var(--ink-2)", lineHeight: 1.35, maxWidth: 460 }}>
                {!data ? "Loading the ledger…"
                  : ni >= 0
                    ? `A profit of ${niMargin.toFixed(1)}% on ${fmt(rev)} of revenue — in line with the FY plan the Board approved.`
                    : `A loss of ${Math.abs(niMargin).toFixed(1)}% on ${fmt(rev)} of revenue — heavier than budgeted but in line with the H1 investment ramp.`}
              </p>
            </div>

            <div className="flex flex-col">
              {[
                { l: "Revenue",       v: rev,  d: data?.kpis?.revenue?.deltaPct      ?? null, neg: false },
                { l: "Gross Profit",  v: gp,   d: data?.kpis?.grossProfit?.deltaPct  ?? null, neg: false },
                { l: "OpEx",          v: ox,   d: data?.kpis?.opex?.deltaPct         ?? null, neg: true  },
                { l: "Cash Position", v: cash, d: data?.kpis?.cash?.deltaPct         ?? null, neg: false },
              ].map((row, i) => (
                <div key={i} className="flex justify-between items-baseline py-2 border-t"
                  style={{ borderColor: "var(--rule)", borderBottom: i === 3 ? "1px solid var(--rule)" : undefined }}
                >
                  <span className="atelier-eyebrow" style={{ fontSize: 12, letterSpacing: "0.12em" }}>{row.l}</span>
                  <span>
                    <span className="atelier-serif tnum" style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em" }}>
                      {fmt(row.v)}
                    </span>
                    <span className="ml-2 tnum" style={{
                      fontSize: 11,
                      color: row.d === null ? "var(--ink-4)" : row.neg ? "var(--accent)" : "var(--ink-3)",
                    }}>
                      {signedPct(row.d)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* TREND CHART */}
          <div className="flex justify-between items-baseline mt-10 mb-3">
            <h2 className="atelier-serif" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
              Revenue, Expenses &amp; the Quarterly Rhythm
            </h2>
            <span className="atelier-serif italic" style={{ fontSize: 12, color: "var(--ink-3)" }}>
              Monthly · {yearCode || "—"} · in {ccy}
            </span>
          </div>
          <TrendChart monthly={monthly} sym={sym} />
          <div className="flex gap-5 mt-1" style={{ fontSize: 12, color: "var(--ink-3)" }}>
            <span className="flex items-center gap-2">
              <i style={{ width: 8, height: 8, borderRadius: 999, background: "#2E8F6B", display: "inline-block" }} /> Revenue
            </span>
            <span className="flex items-center gap-2">
              <i style={{ width: 8, height: 8, borderRadius: 999, background: "var(--accent)", display: "inline-block" }} /> Expenses
            </span>
            <span className="ml-auto atelier-serif italic">Hover the chart to scrub the month</span>
          </div>

          {/* REVENUE BY ENTITY */}
          <div className="flex justify-between items-baseline mt-10 mb-3">
            <h2 className="atelier-serif" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
              Revenue by Entity
            </h2>
            <span className="atelier-serif italic" style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {entitiesByRev.length} operating unit{entitiesByRev.length === 1 ? "" : "s"}
            </span>
          </div>
          <div>
            {entitiesByRev.map((e, i) => {
              const pct = (e.value / totalRev) * 100;
              const color = ENTITY_PALETTE[i % ENTITY_PALETTE.length];
              return (
                <div key={e.id}
                  className="grid items-center py-3 border-t"
                  style={{ gridTemplateColumns: "16px 1fr auto auto", columnGap: 12, borderColor: "var(--rule)", borderBottom: i === entitiesByRev.length - 1 ? "1px solid var(--rule)" : undefined }}
                >
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: color, display: "inline-block" }} />
                  <span className="atelier-serif" style={{ fontSize: 18, fontWeight: 500 }}>
                    {e.name}
                    <span className="ml-2" style={{ fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)", fontSize: 10.5, color: "var(--ink-3)", letterSpacing: "0.04em" }}>
                      {e.code}
                    </span>
                  </span>
                  <span className="atelier-serif tnum" style={{ fontSize: 20, fontWeight: 500, textAlign: "right" }}>{fmt(e.value)}</span>
                  <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink-3)", textAlign: "right", minWidth: 50 }}>{pct.toFixed(1)}%</span>
                  <div style={{ gridColumn: "1 / -1", height: 2, background: "var(--rule-soft, #e6dcc6)", marginTop: 6, position: "relative", overflow: "hidden" }}>
                    <i style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, pct)}%`, background: color, opacity: 0.9 }} />
                  </div>
                </div>
              );
            })}
            {entitiesByRev.length === 0 && !loading && (
              <div className="atelier-serif italic py-6" style={{ color: "var(--ink-3)" }}>
                No revenue facts loaded for this scenario / period. Try a different selection above.
              </div>
            )}
          </div>

          {/* VARIANCE WATCH */}
          {data?.topVariances && data.topVariances.length > 0 && (
            <>
              <div className="flex justify-between items-baseline mt-10 mb-3">
                <h2 className="atelier-serif" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
                  The Variance Watch · Top Movements
                </h2>
                <span className="atelier-serif italic" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {scenarioLabel} vs {compareLabel} · by absolute delta
                </span>
              </div>
              <div>
                {data.topVariances.slice(0, 6).map((v, i) => (
                  <div key={i} className="grid items-baseline py-3 border-t"
                    style={{ gridTemplateColumns: "1.4fr auto auto auto", columnGap: 24, borderColor: "var(--rule)", borderBottom: i === Math.min(5, data.topVariances.length - 1) ? "1px solid var(--rule)" : undefined }}
                  >
                    <div>
                      <div className="atelier-serif" style={{ fontSize: 16, fontWeight: 500 }}>{v.name}</div>
                      <div className="atelier-eyebrow" style={{ fontSize: 10.5, marginTop: 2 }}>{v.code} · {v.type ?? "—"}</div>
                    </div>
                    <div className="tnum atelier-serif" style={{ fontSize: 15, textAlign: "right" }}>{fmt(v.actual)}</div>
                    <div className="tnum atelier-serif" style={{ fontSize: 15, color: "var(--ink-3)", textAlign: "right" }}>{fmt(v.budget)}</div>
                    <div className="tnum" style={{ fontSize: 14, fontWeight: 600, textAlign: "right", color: v.variance > 0 ? "var(--accent)" : "var(--ink)" }}>
                      {v.variance > 0 ? "+" : ""}{fmt(v.variance, false)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* RIGHT COLUMN — AI COPILOT PANEL (formerly Lyra) */}
        <aside className="px-10 py-9 border-l" style={{ borderColor: "var(--rule)", background: "linear-gradient(180deg, rgba(176,141,58,0.04), transparent 40%)" }}>
          <AiCopilotBrief
            ready={!loading && !!data}
            tenantName={tenantName || "Apollo Hospitals"}
            scenarioLabel={scenarioLabel}
            periodLabel={yearCode || "—"}
            ccy={ccy}
            summary={data}
            fmt={fmt}
          />
        </aside>
      </div>
    </main>
  );
}

/* ─── ATELIER PILL CONTROLS ───────────────────────────────────────────────── */

function PillWrapper({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center h-9 px-3 rounded-full border" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
      <span className="atelier-eyebrow" style={{ fontSize: 10, color: "var(--ink-3)", marginRight: 10 }}>{label}</span>
      {children}
    </div>
  );
}

function PillSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <PillWrapper label={label}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-transparent atelier-serif outline-none cursor-pointer"
        style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600 }}
      >
        {options.map(o => <option key={o.value || "_empty"} value={o.value}>{o.label}</option>)}
      </select>
    </PillWrapper>
  );
}

function EntityMultiSelect({ entities, selected, onChange }: {
  entities: Member[]; selected: string[]; onChange: (ids: string[]) => void;
}) {
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
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 h-9 px-3 rounded-full border"
        style={{ borderColor: "var(--ink)", background: open ? "var(--ink)" : "var(--paper)", color: open ? "var(--paper)" : "var(--ink)" }}
      >
        <span className="atelier-eyebrow" style={{ fontSize: 10, color: open ? "var(--paper)" : "var(--ink-3)" }}>Entities</span>
        <span className="atelier-serif" style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-2 w-72 max-h-80 overflow-y-auto"
          style={{ background: "var(--paper)", border: "1px solid var(--ink)", boxShadow: "0 6px 18px -8px rgba(26,22,18,0.2)" }}
        >
          <button
            onClick={() => onChange([])}
            className="w-full text-left px-3 py-2.5 border-b atelier-serif"
            style={{ fontSize: 13, fontWeight: 600, borderColor: "var(--rule)", background: selected.length === 0 ? "var(--paper-2)" : "transparent" }}
          >
            All entities {selected.length === 0 ? "✓" : ""}
          </button>
          {entities.map(e => {
            const isSelected = selected.includes(e.id);
            return (
              <button
                key={e.id}
                onClick={() => onChange(isSelected ? selected.filter(x => x !== e.id) : [...selected, e.id])}
                className="w-full text-left px-3 py-2 flex items-center gap-2 atelier-serif"
                style={{ fontSize: 13 }}
              >
                <span
                  className="inline-flex items-center justify-center"
                  style={{ width: 14, height: 14, border: "1.5px solid var(--ink)", background: isSelected ? "var(--ink)" : "transparent", color: "var(--paper)", fontSize: 10 }}
                >
                  {isSelected ? "✓" : ""}
                </span>
                <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10.5, color: "var(--ink-3)", width: 56 }}>{e.code}</span>
                <span style={{ color: "var(--ink-2)" }}>{e.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── TREND CHART ──────────────────────────────────────────────────────────── */

function TrendChart({ monthly, sym }: { monthly: { code: string; revenue: number; expense: number }[]; sym: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setW(Math.max(360, e.contentRect.width));
    });
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const months = monthly.map(m => m.code);
  const rev = monthly.map(m => Math.abs(m.revenue));
  const exp = monthly.map(m => Math.abs(m.expense));
  const H = 320, padL = 56, padR = 18, padT = 24, padB = 36;
  const n = Math.max(months.length, 1);
  const innerW = w - padL - padR;
  const sx = (i: number) => padL + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const maxV = Math.max(1, ...rev, ...exp);
  const niceMax = niceCeil(maxV);
  const sy = (v: number) => padT + (1 - v / niceMax) * (H - padT - padB);
  const ticks = [0, niceMax / 4, niceMax / 2, (3 * niceMax) / 4, niceMax];

  const path = (arr: number[]) => {
    if (arr.length === 0) return "";
    let d = `M ${sx(0).toFixed(1)} ${sy(arr[0]).toFixed(1)}`;
    for (let i = 1; i < arr.length; i++) {
      const x0 = sx(i - 1), x1 = sx(i);
      const y0 = sy(arr[i - 1]), y1 = sy(arr[i]);
      const cx = (x0 + x1) / 2;
      d += ` C ${cx.toFixed(1)} ${y0.toFixed(1)}, ${cx.toFixed(1)} ${y1.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    return d;
  };

  const peakI = exp.length ? exp.indexOf(Math.max(...exp)) : -1;
  const bestRevI = rev.length ? rev.indexOf(Math.max(...rev)) : -1;

  const [hover, setHover] = useState<{ i: number } | null>(null);
  const onMove = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < padL || x > w - padR) { setHover(null); return; }
    const i = Math.round(((x - padL) / innerW) * (n - 1));
    setHover({ i: Math.max(0, Math.min(n - 1, i)) });
  };

  const fmtShort = (v: number) => {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
    return v.toFixed(0);
  };

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)} onMouseMove={onMove} style={{ minHeight: H }}>
      <svg width={w} height={H} style={{ display: "block" }}>
        <defs>
          <linearGradient id="aRevA" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#1f5d4a" stopOpacity=".18" />
            <stop offset="100%" stopColor="#1f5d4a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="aExpA" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7a2030" stopOpacity=".14" />
            <stop offset="100%" stopColor="#7a2030" stopOpacity="0" />
          </linearGradient>
          <filter id="handA"><feTurbulence baseFrequency="0.9" numOctaves="2" seed="3" /><feDisplacementMap in="SourceGraphic" scale="0.6" /></filter>
        </defs>

        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={sy(t)} y2={sy(t)} stroke="var(--rule)" strokeWidth={0.7} strokeDasharray={i === 0 ? "" : "2 4"} />
            <text x={padL - 8} y={sy(t)} fill="var(--ink-3)" fontSize="11" textAnchor="end" dominantBaseline="middle" fontFamily="JetBrains Mono, monospace">
              {sym}{fmtShort(t)}
            </text>
          </g>
        ))}

        {months.map((m, i) => (
          <text key={i} x={sx(i)} y={H - 8} fill="var(--ink-3)" fontSize="10.5" textAnchor="middle" fontFamily="JetBrains Mono, monospace" letterSpacing="0.04em">
            {m.replace(/^\d+M0?/, "M")}
          </text>
        ))}

        {exp.length > 0 && (<>
          <path d={`${path(exp)} L ${sx(exp.length - 1)} ${sy(0)} L ${sx(0)} ${sy(0)} Z`} fill="url(#aExpA)" />
          <path d={path(exp)} fill="none" stroke="var(--accent)" strokeWidth="1.6" filter="url(#handA)" />
        </>)}

        {rev.length > 0 && (<>
          <path d={`${path(rev)} L ${sx(rev.length - 1)} ${sy(0)} L ${sx(0)} ${sy(0)} Z`} fill="url(#aRevA)" />
          <path d={path(rev)} fill="none" stroke="#2E8F6B" strokeWidth="1.8" filter="url(#handA)" />
        </>)}

        {peakI >= 0 && (
          <g>
            <line x1={sx(peakI)} x2={sx(peakI)} y1={sy(exp[peakI])} y2={sy(exp[peakI]) - 32} stroke="var(--ink)" strokeWidth="0.7" />
            <circle cx={sx(peakI)} cy={sy(exp[peakI])} r="3" fill="var(--accent)" />
            <text x={sx(peakI) + 6} y={sy(exp[peakI]) - 30} fontSize="11" fill="var(--ink)" fontStyle="italic" fontFamily="Newsreader, serif">
              peak burn · M{peakI + 1}
            </text>
          </g>
        )}
        {bestRevI >= 0 && bestRevI !== peakI && (
          <g>
            <line x1={sx(bestRevI)} x2={sx(bestRevI)} y1={sy(rev[bestRevI])} y2={sy(rev[bestRevI]) - 40} stroke="var(--ink)" strokeWidth="0.7" />
            <circle cx={sx(bestRevI)} cy={sy(rev[bestRevI])} r="3" fill="#2E8F6B" />
            <text x={sx(bestRevI) + 6} y={sy(rev[bestRevI]) - 32} fontSize="11" fill="var(--ink)" fontStyle="italic" fontFamily="Newsreader, serif">
              best revenue · M{bestRevI + 1}
            </text>
          </g>
        )}

        {hover && (
          <g>
            <line x1={sx(hover.i)} x2={sx(hover.i)} y1={padT} y2={H - padB} stroke="var(--ink)" strokeWidth="0.8" strokeDasharray="2 3" />
            <circle cx={sx(hover.i)} cy={sy(rev[hover.i] ?? 0)} r="5" fill="var(--paper)" stroke="#2E8F6B" strokeWidth="1.8" />
            <circle cx={sx(hover.i)} cy={sy(exp[hover.i] ?? 0)} r="5" fill="var(--paper)" stroke="var(--accent)" strokeWidth="1.8" />
          </g>
        )}
      </svg>

      {hover && months[hover.i] && (
        <div className="absolute atelier-serif"
          style={{
            left: sx(hover.i),
            top: sy(Math.max(rev[hover.i] ?? 0, exp[hover.i] ?? 0)),
            transform: "translate(-50%, -120%)",
            background: "var(--paper)",
            border: "1px solid var(--ink)",
            padding: "6px 10px",
            fontSize: 12,
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ fontWeight: 600 }}>{months[hover.i]}</div>
          <div style={{ color: "#2E8F6B" }}>Revenue {sym}{fmtShort(rev[hover.i] ?? 0)}</div>
          <div style={{ color: "var(--accent)" }}>Expenses {sym}{fmtShort(exp[hover.i] ?? 0)}</div>
        </div>
      )}
    </div>
  );
}

function niceCeil(x: number): number {
  if (x <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(x)));
  const r = x / exp;
  let nice: number;
  if (r <= 1) nice = 1;
  else if (r <= 2) nice = 2;
  else if (r <= 2.5) nice = 2.5;
  else if (r <= 5) nice = 5;
  else nice = 10;
  return nice * exp;
}

/* ─── AI COPILOT BRIEF (replaces Lyra panel) ──────────────────────────────── */

type BriefProps = {
  ready: boolean;
  tenantName: string;
  scenarioLabel: string;
  periodLabel: string;
  ccy: string;
  summary: Summary | null;
  fmt: (n: number, withUnit?: boolean) => string;
};

function AiCopilotBrief({ ready, tenantName, scenarioLabel, periodLabel, ccy, summary, fmt }: BriefProps) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [narrative, setNarrative] = useState<string>("");
  const [pullQuote, setPullQuote] = useState<string>("");
  const [error, setError] = useState<string>("");
  const askedFor = useRef<string>("");

  useEffect(() => {
    if (!ready || !summary) return;
    const sig = `${scenarioLabel}|${periodLabel}|${summary.meta.factsRead}|${summary.kpis.netIncome.value}`;
    if (askedFor.current === sig) return;
    askedFor.current = sig;

    setState("loading"); setNarrative(""); setPullQuote(""); setError("");

    const ni = summary.kpis.netIncome.value;
    const rev = summary.kpis.revenue.value;
    const gp  = summary.kpis.grossProfit.value;
    const ox  = summary.kpis.opex.value;
    const cash = summary.kpis.cash.value;
    const niMargin = summary.kpis.netMargin;
    const topEnt = summary.byEntity.slice(0, 3).map(e => `${e.name} (${e.code}) ${fmt(e.value)}`).join(", ");
    const topVar = summary.topVariances.slice(0, 3)
      .map(v => `${v.name} ${fmt(v.actual)} vs ${fmt(v.budget)} (${v.variance > 0 ? "+" : ""}${fmt(v.variance, false)})`)
      .join("; ");

    const prompt = `You are the AI Copilot for ${tenantName}, writing a one-paragraph editorial brief for the CFO's morning Executive Brief. Reporting in ${ccy}.

The ${periodLabel} ${scenarioLabel} numbers:
- Net Income: ${fmt(ni)} (${niMargin.toFixed(1)}% margin)
- Revenue: ${fmt(rev)}, Gross Profit: ${fmt(gp)}, OpEx: ${fmt(ox)}, Cash: ${fmt(cash)}
- Top entities by revenue: ${topEnt || "n/a"}
- Top variances (vs Budget): ${topVar || "n/a"}

Write in two parts, separated by the marker "—PULL—":

PART 1 (before marker): A single editorial paragraph (~90 words) in plain English that a CFO would actually want to read. Lead with the most important thing. Name the entity or account driving the result. Reference the numbers above only (no fabrications). Tone: confident, specific, dry. No headers, no lists, no markdown.

PART 2 (after marker): One short pull-quote sentence (max 15 words) that captures the single most important insight. Plain text only.`;

    fetch("/api/v2/copilot/chat", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt, model: "haiku-4.5" }),
    })
      .then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? "Copilot request failed");
        const text: string = j?.data?.response?.content ?? "";
        const [body, pull] = text.split(/—\s*PULL\s*—/i);
        setNarrative((body ?? text).trim());
        setPullQuote((pull ?? "").trim().replace(/^["“]|["”]$/g, ""));
        setState("ready");
      })
      .catch(e => { setError(String(e?.message ?? e)); setState("error"); });
  }, [ready, summary, scenarioLabel, periodLabel, ccy, tenantName, fmt]);

  const fallback = useMemo(() => {
    if (!summary) return "";
    const ni = summary.kpis.netIncome.value;
    const rev = summary.kpis.revenue.value;
    const lead = summary.byEntity[0];
    const lossOrProfit = ni >= 0 ? "a profit" : "a loss";
    const margin = summary.kpis.netMargin;
    return `${tenantName} closed ${periodLabel} at ${fmt(ni)} — ${lossOrProfit} of ${Math.abs(margin).toFixed(1)}% on ${fmt(rev)} of revenue. ${lead ? `${lead.name} contributed ${fmt(lead.value)} of top-line, the largest share among the operating units.` : ""} ${summary.topVariances[0] ? `The biggest movement vs Budget is ${summary.topVariances[0].name} at ${fmt(summary.topVariances[0].variance, false)} ${summary.topVariances[0].variance > 0 ? "above" : "below"} plan.` : ""}`.trim();
  }, [summary, tenantName, periodLabel, fmt]);

  const body = state === "ready" && narrative ? narrative : fallback;
  const quote = state === "ready" && pullQuote
    ? pullQuote
    : (summary && summary.kpis.netIncome.value < 0
        ? "The expense block is the pressure point — investigate before the next close."
        : "The trajectory is favourable — protect it through Q3.");

  return (
    <div className="atelier-card" style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: 26, boxShadow: "0 1px 0 var(--rule), 0 8px 18px -16px rgba(26,22,18,0.18)" }}>
      <div className="flex items-center gap-3 pb-3 border-b" style={{ borderColor: "var(--ink)" }}>
        <span className="atelier-serif italic"
          style={{ fontWeight: 600, fontSize: 14, border: "1.5px solid var(--ink)", borderRadius: "50%", width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
        >
          ✦
        </span>
        <div>
          <p className="atelier-serif italic" style={{ fontWeight: 600, fontSize: 16 }}>AI Copilot</p>
          <p className="atelier-eyebrow" style={{ fontSize: 10.5 }}>Morning Brief · {periodLabel}</p>
        </div>
        <div className="ml-auto atelier-serif italic" style={{ fontSize: 12, color: "var(--ink-3)" }}>
          {state === "loading" ? "writing…" : new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </div>
      </div>

      <h3 className="atelier-serif mt-4" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.15, letterSpacing: "-0.01em" }}>
        {summary && summary.kpis.netIncome.value < 0
          ? "Net loss this year — the pressure is on expenses."
          : summary
            ? "Profitable year — protect the trajectory into Q3."
            : "Reading the ledger…"}
      </h3>

      <div className="atelier-serif mt-3" style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink-2)" }}>
        {!ready && <p>Loading the FY numbers…</p>}
        {ready && body && (
          <p style={{ textAlign: "justify" }}>
            <span className="atelier-serif"
              style={{ float: "left", fontSize: 60, lineHeight: 0.85, padding: "4px 8px 0 0", fontWeight: 600, color: "var(--ink)" }}
            >
              {body.charAt(0)}
            </span>
            {body.slice(1)}
          </p>
        )}
        {ready && !body && state === "loading" && <p className="italic" style={{ color: "var(--ink-3)" }}>Composing the brief…</p>}
        {state === "error" && (
          <p className="italic" style={{ color: "var(--accent)", fontSize: 13 }}>
            Copilot is offline. {error}. Showing deterministic summary above.
          </p>
        )}
      </div>

      {quote && (
        <p className="mt-4 atelier-serif italic" style={{ color: "var(--accent)", fontSize: 16, lineHeight: 1.35 }}>
          “{quote}”
        </p>
      )}

      <div className="flex gap-2 mt-5 pt-4 border-t" style={{ borderColor: "var(--rule)" }}>
        <a href="/copilot" className="atelier-pill atelier-pill-dark" style={{ fontSize: 11.5, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          Open Copilot
        </a>
        <a href="/reports/income-statement" className="atelier-pill" style={{ fontSize: 11.5, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          Open IS
        </a>
        <span className="ml-auto atelier-eyebrow" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
          {summary ? `${summary.meta.factsRead.toLocaleString()} facts read` : ""}
        </span>
      </div>
    </div>
  );
}
