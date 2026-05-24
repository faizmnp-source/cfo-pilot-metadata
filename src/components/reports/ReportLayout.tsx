"use client";

// Shared report chrome — POV bar, action buttons, page title, render-time footer.
// Design intent: financial-document feel. Cream-white background, slate-900 ink,
// hairline borders, monospace tabular numbers, generous whitespace.
//
// The actual report body is passed as children — usually a series of
// <ReportSection> + <ReportLine> components.

import { useEffect, useState } from "react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { Download, RefreshCw, Loader2, Sparkles } from "lucide-react";

type Member = { id: string; code: string; name: string };

interface ReportLayoutProps {
  title:      string;
  subtitle?:  string;
  reportKind: "trial-balance" | "income-statement" | "balance-sheet" | "cash-flow";
  ccy?:       string;
  onLoad?:    (params: { scenarioId: string; entityId: string; yearCode: string }) => void;
  loading?:   boolean;
  meta?:      { generatedAt: string; rowsRead: number; entity?: string; scenario?: string; year?: string };
  totals?:    { label: string; value: number };
  children:   React.ReactNode;
}

async function fetchMembers(slug: string, limit = 500): Promise<Member[]> {
  const r = await fetch(`/api/v2/members/${slug}?pageSize=${limit}`, { credentials: "include" });
  const j = await r.json().catch(() => null);
  return (j?.data?.data ?? [])
    .filter((m: any) => m.isActive)
    .map((m: any) => ({ id: m.id, code: m.memberCode, name: m.memberName }));
}

export function ReportLayout({ title, subtitle, reportKind, ccy = "USD", onLoad, loading, meta, totals, children }: ReportLayoutProps) {
  const [scenarios, setScenarios] = useState<Member[]>([]);
  const [entities,  setEntities]  = useState<Member[]>([]);
  const [years,     setYears]     = useState<Member[]>([]);

  const [scenarioId, setScenarioId] = useState("");
  const [entityId,   setEntityId]   = useState("");
  const [yearCode,   setYearCode]   = useState("");

  useEffect(() => {
    (async () => {
      const [scns, ents, all_times] = await Promise.all([
        fetchMembers("scenario"), fetchMembers("entity"), fetchMembers("time"),
      ]);
      setScenarios(scns);
      setEntities(ents);
      setYears(all_times.filter(t => /^FY\d{4}$/.test(t.code)));
      if (scns[0]) setScenarioId(scns[0].id);
      if (ents[0]) setEntityId(ents[0].id);
      const fy = all_times.find(t => /^FY\d{4}$/.test(t.code));
      if (fy) setYearCode(fy.code);
    })();
  }, []);

  useEffect(() => {
    if (scenarioId && entityId && yearCode && onLoad) {
      onLoad({ scenarioId, entityId, yearCode });
    }
  }, [scenarioId, entityId, yearCode, onLoad]);

  return (
    <>
      <MetadataHeader title={title} subtitle={subtitle} />
      <main className="flex-1 overflow-y-auto bg-[#FAF9F6] p-6">
        {/* POV bar */}
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <Pov label="Scenario" value={scenarioId} options={scenarios} onChange={setScenarioId} />
            <Pov label="Entity"   value={entityId}   options={entities}  onChange={setEntityId} />
            <Pov label="Year"     value={yearCode}   options={years}     onChange={setYearCode} useCode />
            <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-700">
              <Sparkles className="h-3 w-3" /> AI Narrative · soon
            </span>
            <button
              onClick={() => scenarioId && entityId && yearCode && onLoad?.({ scenarioId, entityId, yearCode })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-stone-900 text-white hover:bg-stone-800"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-stone-200 text-stone-700 hover:bg-stone-50">
              <Download className="h-3 w-3" /> Export
            </button>
          </div>
        </div>

        {/* Report card — the document */}
        <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
          {/* Document header */}
          <div className="px-8 pt-7 pb-5 border-b border-stone-100">
            <div className="flex items-end justify-between">
              <div>
                <h1 className="text-xl font-semibold text-stone-900 tracking-tight">{title}</h1>
                <p className="text-[11px] text-stone-500 mt-1">
                  {meta ? `${meta.entity ?? entityId.slice(0,8)} · ${meta.scenario ?? scenarioId.slice(0,8)} · ${meta.year ?? yearCode} · in ${ccy}` : "Loading…"}
                </p>
              </div>
              {meta && (
                <p className="text-[10px] text-stone-400">
                  Generated {new Date(meta.generatedAt).toLocaleString()} · {meta.rowsRead} rows read
                </p>
              )}
            </div>
          </div>

          {/* Body */}
          {loading ? (
            <div className="px-8 py-16 text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-stone-400" />
              <p className="mt-3 text-sm text-stone-500">Building report…</p>
            </div>
          ) : (
            <div className="px-8 py-6">{children}</div>
          )}

          {/* Footer totals — bigger, bolder, signed */}
          {totals && !loading && (
            <div className={`px-8 py-5 border-t-2 ${totals.value < 0 ? "bg-rose-50 border-rose-200" : "bg-stone-900 border-stone-900"} flex items-center justify-between`}>
              <span className={`text-sm font-bold uppercase tracking-wider ${totals.value < 0 ? "text-rose-900" : "text-white"}`}>{totals.label}</span>
              <span className={`text-2xl font-mono font-extrabold tabular-nums ${totals.value < 0 ? "text-rose-700" : "text-white"}`}>{formatMoney(totals.value, { ccy })}</span>
            </div>
          )}
        </div>

        <p className="mt-3 text-center text-[10px] text-stone-400">CFO Pilot · {reportKind} · v1</p>
      </main>
    </>
  );
}

function Pov({ label, value, options, onChange, useCode }: { label: string; value: string; options: Member[]; onChange: (v: string) => void; useCode?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-stone-500">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-stone-200 px-2.5 py-1.5 text-xs font-medium bg-white text-stone-900 focus:border-stone-900 focus:ring-2 focus:ring-stone-100 focus:outline-none"
      >
        <option value="">— pick —</option>
        {options.map(o => (
          <option key={o.id} value={useCode ? o.code : o.id}>{o.code} · {o.name}</option>
        ))}
      </select>
    </label>
  );
}

// Currency symbols by ISO. Falls back to ISO code for anything not listed.
const CCY_SYMBOL: Record<string, string> = {
  USD: "$", GBP: "£", EUR: "€", INR: "₹", AED: "د.إ",
  JPY: "¥", CNY: "¥", CHF: "Fr", AUD: "A$", CAD: "C$",
};

/**
 * Money formatting for reports.
 *   - Negatives shown in parentheses (accounting style): (1,234)
 *   - Zero shows as em-dash for cleaner sparse tables
 *   - Compact mode (M/B suffix) for large numbers in dashboard cards
 *   - Currency symbol prefix when ccy is provided
 */
export function formatMoney(n: number, opts: { ccy?: string; compact?: boolean } = {}): string {
  if (n === 0 || !Number.isFinite(n)) return "—";
  const symbol = opts.ccy ? (CCY_SYMBOL[opts.ccy] ?? opts.ccy + " ") : "";
  const abs = Math.abs(n);
  let body: string;
  if (opts.compact) {
    if (abs >= 1_000_000_000) body = (abs / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1) + "B";
    else if (abs >= 1_000_000) body = (abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1) + "M";
    else if (abs >= 1_000)     body = (abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1) + "K";
    else                       body = abs.toFixed(0);
  } else {
    body = abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return n < 0 ? `(${symbol}${body})` : `${symbol}${body}`;
}
