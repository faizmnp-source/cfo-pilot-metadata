"use client";

// Sprint Y — Board Pack v1
//
// Replaces the /reporting placeholder with a working AI-generated
// executive summary for the board.
//
// Flow:
//   1. POV picker (Scenario / Entity / Period). Defaults from /api/settings.
//   2. Fetches /api/v2/reports/income-statement + /api/v2/reports/balance-sheet
//      in parallel.
//   3. Composes a board-pack payload (KPIs + section totals + cash).
//   4. POSTs /api/v2/ai/explain with kind="board-pack" (skill prompt
//      already inlined in the gateway: 1-page exec summary ≤500 words).
//   5. Renders the returned markdown as a clean printable document.
//   6. Print/PDF via window.print() — CSS @media print rules included.
//
// No new API endpoints, no schema changes. Pure UI assembly over
// existing v2 reports + AI gateway. Touches only this one file.

import { useCallback, useEffect, useMemo, useState } from "react";
import { CFOHeader } from "@/components/cfo/Header";
import { TimePOVPicker } from "@/components/reports/TimePOVPicker";
import { usePovDefaults } from "@/hooks/usePovDefaults";
import {
  Sparkles, Loader2, RefreshCw, Printer, FileText, BarChart3,
  AlertTriangle, ChevronDown,
} from "lucide-react";

type Member = { id: string; code: string; name: string };

interface AiResponse {
  text:        string;
  model:       string;
  cached:      boolean;
  promptTokens?:  number;
  outputTokens?:  number;
  costInr:     number;
  latencyMs:   number;
  stub:        boolean;
  capExceeded?: boolean;
}

async function fetchMembers(slug: string, limit = 500): Promise<Member[]> {
  const r = await fetch(`/api/v2/members/${slug}?pageSize=${limit}`, { credentials: "include" });
  const j = await r.json().catch(() => null);
  return (j?.data?.data ?? [])
    .filter((m: any) => m.isActive)
    .map((m: any) => ({ id: m.id, code: m.memberCode, name: m.memberName }));
}

function fmtMoney(v: number | null | undefined, ccy: string) {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const s = new Intl.NumberFormat("en-US", {
    style: "currency", currency: ccy || "USD",
    maximumFractionDigits: 0, minimumFractionDigits: 0,
  }).format(abs);
  return v < 0 ? `(${s})` : s;
}

function fmtPct(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function summarize(report: any) {
  // Returns {sectionByType: Map<type, subtotal>, lineCount}
  const byType = new Map<string, number>();
  let lines = 0;
  for (const s of (report?.sections ?? [])) {
    if (s?.subtotal) byType.set(s.type ?? s.title, s.subtotal.value);
    lines += (s?.lines?.length ?? 0);
  }
  return { byType, lines };
}

// Tiny markdown → JSX renderer. Handles **bold**, headings (#, ##), bullets,
// blank lines as paragraph breaks. Sized for board-pack output (≤500 words).
function renderMarkdown(text: string) {
  const blocks: React.ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let buf: string[] = [];
  const flushPara = () => {
    if (!buf.length) return;
    const joined = buf.join(" ").trim();
    if (joined) blocks.push(
      <p key={`p-${blocks.length}`} className="text-sm text-stone-700 leading-7 mb-3">
        {inline(joined)}
      </p>
    );
    buf = [];
  };
  let listBuf: string[] = [];
  const flushList = () => {
    if (!listBuf.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc pl-5 mb-3 space-y-1">
        {listBuf.map((l, i) => (
          <li key={i} className="text-sm text-stone-700 leading-6">{inline(l)}</li>
        ))}
      </ul>
    );
    listBuf = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("# ")) {
      flushPara(); flushList();
      blocks.push(<h2 key={`h-${blocks.length}`} className="text-lg font-semibold text-stone-900 mt-5 mb-2 tracking-tight">{line.slice(2)}</h2>);
    } else if (line.startsWith("## ")) {
      flushPara(); flushList();
      blocks.push(<h3 key={`h-${blocks.length}`} className="text-sm font-bold uppercase tracking-wider text-stone-600 mt-4 mb-2">{line.slice(3)}</h3>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      flushPara();
      listBuf.push(line.slice(2));
    } else if (line === "") {
      flushPara(); flushList();
    } else {
      flushList();
      buf.push(line);
    }
  }
  flushPara(); flushList();
  return blocks;
}

function inline(s: string) {
  // **bold** support; everything else passes through. Splits to preserve order.
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i} className="text-stone-900 font-semibold">{p.slice(2, -2)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}

export default function ReportingPage() {
  // ─── POV ─────────────────────────────────────────────────────────────────
  const { defaults: povDef } = usePovDefaults();
  const [scenarios, setScenarios] = useState<Member[]>([]);
  const [entities,  setEntities]  = useState<Member[]>([]);
  const [scenarioId, setScenarioId] = useState("");
  const [entityId,   setEntityId]   = useState("");
  const [yearCode,   setYearCode]   = useState("");
  const [ccy, setCcy] = useState<string>("USD");

  // ─── Data ────────────────────────────────────────────────────────────────
  const [is_,   setIs]   = useState<any>(null);   // Income statement
  const [bs,    setBs]   = useState<any>(null);   // Balance sheet
  const [loadingData, setLoadingData] = useState(false);
  const [dataError,   setDataError]   = useState<string | null>(null);

  // ─── AI ──────────────────────────────────────────────────────────────────
  const [ai, setAi] = useState<AiResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(true);

  // ─── Bootstrap currency + dim members ────────────────────────────────────
  useEffect(() => {
    fetch("/api/settings", { credentials: "include" })
      .then(r => r.json())
      .then(j => { if (j?.data?.reportingCurrency) setCcy(j.data.reportingCurrency); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const [scns, ents] = await Promise.all([fetchMembers("scenario"), fetchMembers("entity")]);
      setScenarios(scns);
      setEntities(ents);
      const scn = (povDef.scenarioCode && scns.find(s => s.code === povDef.scenarioCode)) || scns[0];
      const ent = (povDef.entityCode   && ents.find(e => e.code === povDef.entityCode))   || ents[0];
      if (scn) setScenarioId(scn.id);
      if (ent) setEntityId(ent.id);
      if (povDef.periodCode) setYearCode(povDef.periodCode);
    })();
  }, [povDef.scenarioCode, povDef.entityCode, povDef.periodCode]);

  // ─── Load IS + BS together when POV resolves ─────────────────────────────
  const loadData = useCallback(async () => {
    if (!scenarioId || !entityId || !yearCode) return;
    setLoadingData(true); setDataError(null);
    setAi(null); setAiError(null);
    try {
      const qs = new URLSearchParams({ scenarioId, entityId, yearCode });
      const [isRes, bsRes] = await Promise.all([
        fetch(`/api/v2/reports/income-statement?${qs}`, { credentials: "include" }),
        fetch(`/api/v2/reports/balance-sheet?${qs}`,    { credentials: "include" }),
      ]);
      const [isJ, bsJ] = await Promise.all([isRes.json(), bsRes.json()]);
      if (!isRes.ok) throw new Error(isJ?.error ?? `IS HTTP ${isRes.status}`);
      if (!bsRes.ok) throw new Error(bsJ?.error ?? `BS HTTP ${bsRes.status}`);
      setIs(isJ.data); setBs(bsJ.data);
    } catch (e: any) {
      setDataError(e?.message ?? String(e));
      setIs(null); setBs(null);
    } finally { setLoadingData(false); }
  }, [scenarioId, entityId, yearCode]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── KPI strip derived from IS + BS ──────────────────────────────────────
  const kpis = useMemo(() => {
    const i = summarize(is_);
    const b = summarize(bs);
    const revenue = i.byType.get("REVENUE") ?? null;
    const grossProfit = i.byType.get("GROSS_PROFIT") ?? null;
    const operatingIncome = i.byType.get("OPERATING_INCOME") ?? null;
    const netIncome = is_?.totals?.value ?? null;
    const assets = b.byType.get("ASSETS") ?? null;
    const liabilities = b.byType.get("LIABILITIES") ?? null;
    const equity = b.byType.get("EQUITY") ?? null;
    // Heuristic cash: section line where code contains CASH or name contains "cash"
    let cash: number | null = null;
    for (const s of (bs?.sections ?? [])) {
      for (const l of (s.lines ?? [])) {
        const code = (l.code ?? "").toUpperCase();
        const name = (l.name ?? "").toLowerCase();
        if (code.includes("CASH") || name.includes("cash and cash equivalents") || name === "cash") {
          cash = (cash ?? 0) + (l.value ?? 0);
        }
      }
    }
    const gmPct = revenue && grossProfit != null ? grossProfit / revenue : null;
    const opMargin = revenue && operatingIncome != null ? operatingIncome / revenue : null;
    const niMargin = revenue && netIncome != null ? netIncome / revenue : null;
    return { revenue, grossProfit, operatingIncome, netIncome, assets, liabilities, equity, cash, gmPct, opMargin, niMargin };
  }, [is_, bs]);

  // ─── Generate the board pack ─────────────────────────────────────────────
  async function generate(bypassCache = false) {
    if (!is_ || !bs) { setAiError("Income Statement and Balance Sheet must load first."); return; }
    setAiLoading(true); setAiError(null);
    try {
      const payload = {
        scenario: is_.meta?.scenarioId?.slice(0, 8),
        entity:   is_.meta?.entityId?.slice(0, 8),
        period:   is_.meta?.yearCode,
        currency: ccy,
        kpis: {
          revenue:         kpis.revenue,
          grossProfit:     kpis.grossProfit,
          grossMarginPct:  kpis.gmPct,
          operatingIncome: kpis.operatingIncome,
          operatingMarginPct: kpis.opMargin,
          netIncome:       kpis.netIncome,
          netMarginPct:    kpis.niMargin,
          totalAssets:     kpis.assets,
          totalLiabilities: kpis.liabilities,
          totalEquity:     kpis.equity,
          cashPosition:    kpis.cash,
        },
        incomeStatement: {
          sections: (is_.sections ?? []).map((s: any) => ({
            title: s.title, type: s.type,
            subtotal: s.subtotal?.value ?? null,
            topLines: (s.lines ?? []).slice(0, 5).map((l: any) => ({ code: l.code, name: l.name, value: l.value })),
          })),
          netIncome: is_.totals,
        },
        balanceSheet: {
          sections: (bs.sections ?? []).map((s: any) => ({
            title: s.title, type: s.type,
            subtotal: s.subtotal?.value ?? null,
            topLines: (s.lines ?? []).slice(0, 5).map((l: any) => ({ code: l.code, name: l.name, value: l.value })),
          })),
          totals: bs.totals,
        },
      };
      const r = await fetch("/api/v2/ai/explain", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "board-pack", payload, bypassCache }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setAi(j.data as AiResponse); setAiOpen(true);
    } catch (e: any) {
      setAiError(e?.message ?? String(e));
    } finally { setAiLoading(false); }
  }

  const ready = !!(is_ && bs && !loadingData);

  return (
    <>
      <CFOHeader title="Board Pack" subtitle="AI-generated executive summary · Income Statement + Balance Sheet + KPIs" />
      <main className="flex-1 overflow-y-auto bg-[#FAF9F6] p-6">
        {/* Print styles: hide chrome, show document only */}
        <style>{`
          @media print {
            body { background: white !important; }
            .no-print { display: none !important; }
            .print-document {
              box-shadow: none !important;
              border: none !important;
              max-width: 100% !important;
            }
          }
        `}</style>

        {/* POV bar */}
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm mb-5 no-print">
          <div className="flex flex-wrap items-center gap-3">
            <Pov label="Scenario" value={scenarioId} options={scenarios} onChange={setScenarioId} />
            <Pov label="Entity"   value={entityId}   options={entities}  onChange={setEntityId} />
            <TimePOVPicker value={yearCode} onChange={setYearCode} label="Period" />
            <button
              onClick={loadData}
              disabled={loadingData}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              {loadingData ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
            </button>
            <button
              onClick={() => window.print()}
              disabled={!ai}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              title={ai ? "Print or save as PDF" : "Generate the board pack first"}
            >
              <Printer className="h-3 w-3" /> Print / PDF
            </button>
          </div>
        </div>

        {dataError && (
          <div className="no-print rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-xs text-red-800 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" /> Could not load reports: {dataError}
          </div>
        )}

        {/* KPI strip — at-a-glance numbers behind the narrative */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <Kpi label="Revenue"          value={fmtMoney(kpis.revenue, ccy)} sub={kpis.gmPct != null ? `GM ${fmtPct(kpis.gmPct)}` : "—"} loading={loadingData} />
          <Kpi label="Operating Income" value={fmtMoney(kpis.operatingIncome, ccy)} sub={kpis.opMargin != null ? `Op margin ${fmtPct(kpis.opMargin)}` : "—"} loading={loadingData} />
          <Kpi label="Net Income"       value={fmtMoney(kpis.netIncome, ccy)} sub={kpis.niMargin != null ? `Net margin ${fmtPct(kpis.niMargin)}` : "—"} loading={loadingData} />
          <Kpi label="Cash Position"    value={fmtMoney(kpis.cash, ccy)} sub={kpis.assets != null ? `Assets ${fmtMoney(kpis.assets, ccy)}` : "—"} loading={loadingData} />
        </div>

        {/* AI generate CTA — sticky panel */}
        <div className="no-print rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/60 to-white shadow-sm mb-5 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-violet-600" />
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-violet-900">AI Board Pack</div>
                <div className="text-[11px] text-stone-600 mt-0.5">≤500-word executive summary · finance:financial-statements + variance-analysis + close-management methodologies</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {ai && (
                <span className="text-[10px] text-stone-500 mr-2">
                  {ai.cached ? "from cache" : ai.stub ? "stub mode (add ANTHROPIC_API_KEY)" : `${ai.model} · ₹${ai.costInr.toFixed(2)} · ${ai.latencyMs}ms`}
                </span>
              )}
              <button
                onClick={() => generate(false)}
                disabled={aiLoading || !ready}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {ai ? "Regenerate" : "Generate"}
              </button>
              {ai && (
                <button
                  onClick={() => generate(true)}
                  disabled={aiLoading}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-medium border border-violet-200 text-violet-700 hover:bg-violet-50"
                  title="Bypass cache"
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
          {aiError && (
            <div className="bg-red-50 border-t border-red-100 px-4 py-2 text-[11px] text-red-800">
              ⚠ {aiError}
            </div>
          )}
        </div>

        {/* The document — printable */}
        <div className="print-document rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden max-w-3xl mx-auto">
          <div className="px-8 pt-7 pb-4 border-b border-stone-100">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500 mb-1">Board Pack · Executive Summary</div>
                <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">
                  {is_?.meta?.yearCode ?? yearCode ?? "—"} <span className="text-stone-400 font-normal">·</span> {scenarios.find(s => s.id === scenarioId)?.name ?? scenarios.find(s => s.id === scenarioId)?.code ?? "—"}
                </h1>
                <p className="text-[12px] text-stone-500 mt-1">
                  {entities.find(e => e.id === entityId)?.name ?? "—"} · in {ccy}
                </p>
              </div>
              <FileText className="w-5 h-5 text-stone-300" />
            </div>
          </div>
          <div className="px-8 py-6 min-h-[300px]">
            {!ai && !aiLoading && (
              <div className="text-center py-16">
                <BarChart3 className="w-10 h-10 mx-auto mb-3 text-stone-300" />
                <p className="text-sm text-stone-500">
                  {ready ? "Click " : "Loading reports… "}
                  {ready && <span className="font-medium text-violet-700">Generate</span>}
                  {ready && " to draft the board pack."}
                </p>
              </div>
            )}
            {aiLoading && (
              <div className="text-center py-16">
                <Loader2 className="w-6 h-6 mx-auto mb-3 text-violet-500 animate-spin" />
                <p className="text-sm text-stone-500">Drafting executive summary…</p>
              </div>
            )}
            {ai && aiOpen && (
              <div className="board-pack-prose">
                {renderMarkdown(ai.text || "(no content returned)")}
              </div>
            )}
          </div>
          {ai && (
            <div className="px-8 pb-5 pt-2 border-t border-stone-100 flex items-center justify-between">
              <button onClick={() => setAiOpen(o => !o)} className="text-[10px] text-stone-500 hover:text-stone-700 inline-flex items-center gap-1">
                <ChevronDown className={`w-3 h-3 transition-transform ${aiOpen ? "rotate-180" : ""}`} />
                {aiOpen ? "Hide" : "Show"} narrative
              </button>
              <div className="text-[10px] text-stone-400">
                Generated {new Date().toLocaleString()} · {ai.stub ? "stub" : ai.cached ? "cached" : ai.model} · {ai.outputTokens ?? "—"} output tokens
              </div>
            </div>
          )}
        </div>

        <p className="text-[10px] text-stone-400 text-center mt-4 no-print">
          AI narrative is a first draft — review and approve before circulating to the board.
        </p>
      </main>
    </>
  );
}

// ─── Small helper components ───────────────────────────────────────────────

function Pov({ label, value, options, onChange }: { label: string; value: string; options: Member[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-xs border border-stone-200 rounded-md px-2 py-1.5 bg-white text-stone-800 focus:outline-none focus:ring-2 focus:ring-violet-300 min-w-[140px]"
      >
        {options.map(o => (
          <option key={o.id} value={o.id}>{o.name || o.code}</option>
        ))}
      </select>
    </div>
  );
}

function Kpi({ label, value, sub, loading }: { label: string; value: string; sub?: string; loading?: boolean }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">{label}</div>
      <div className="text-xl font-semibold tabular-nums text-stone-900 mt-1">
        {loading ? <span className="inline-block h-5 w-20 rounded bg-stone-100 animate-pulse" /> : value}
      </div>
      {sub && <div className="text-[11px] text-stone-500 mt-1 tabular-nums">{sub}</div>}
    </div>
  );
}
