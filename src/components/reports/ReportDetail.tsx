"use client";

// Shared report-detail page. Wires POV → API call → ReportLayout chrome + ReportBody.

import { useCallback, useEffect, useState } from "react";
import { ReportLayout, formatMoney } from "./ReportLayout";
import { ReportBody } from "./ReportBody";
import { MethodologyCard } from "./MethodologyCard";
import { AiNarrativePanel } from "./AiNarrativePanel";

type Kind = "trial-balance" | "income-statement" | "balance-sheet" | "cash-flow";

interface Props { kind: Kind; title: string; subtitle?: string; }

export function ReportDetail({ kind, title, subtitle }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ccy, setCcy] = useState<string>("USD");

  // Resolve tenant reporting currency once for display
  useEffect(() => {
    fetch("/api/settings", { credentials: "include" })
      .then(r => r.json())
      .then(j => { if (j?.data?.reportingCurrency) setCcy(j.data.reportingCurrency); })
      .catch(() => {});
  }, []);

  const onLoad = useCallback(async (p: { scenarioId: string; entityId: string; yearCode: string }) => {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams(p);
      const r = await fetch(`/api/v2/reports/${kind}?${qs}`, { credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setData(j.data);
    } catch (e: any) {
      setError(e.message ?? String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [kind]);

  return (
    <ReportLayout
      title={title}
      subtitle={subtitle}
      reportKind={kind}
      ccy={ccy}
      onLoad={onLoad}
      loading={loading}
      meta={data?.meta}
      totals={data?.totals}
    >
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-xs text-red-800 mb-4">⚠ {error}</div>
      )}
      {data && <MethodologyCard kind={kind} meta={{
        scenarioId: data.meta?.scenarioId ?? "",
        entityId:   data.meta?.entityId ?? "",
        yearCode:   data.meta?.yearCode ?? "",
        rowsRead:   data.meta?.rowsRead ?? 0,
        generatedAt: data.meta?.generatedAt ?? new Date().toISOString(),
      }} ccy={ccy} />}
      {data?.sections && (kind === "income-statement" || kind === "balance-sheet") && (
        <KpiStripFromSections sections={data.sections} totals={data.totals} ccy={ccy} kind={kind} />
      )}
      {data && <AiNarrativePanel kind={kind} report={data} ccy={ccy} />}
      {data?.sections && <ReportBody sections={data.sections} ccy={ccy} />}
    </ReportLayout>
  );
}

// KPI strip — sits above the line items. Shows totals at a glance with
// margin %. Only meaningful on IS / BS (TB and CF have their own structure).
function KpiStripFromSections({ sections, totals, ccy, kind }: { sections: any[]; totals: any; ccy: string; kind: string }) {
  const sectionByType = new Map<string, number>();
  for (const s of sections) {
    if (s.subtotal) sectionByType.set(s.type ?? s.title, s.subtotal.value);
  }
  if (kind === "income-statement") {
    const rev = sectionByType.get("REVENUE") ?? 0;
    const exp = sectionByType.get("EXPENSE") ?? 0;
    const ni  = rev - exp;
    const margin = rev === 0 ? 0 : (ni / rev) * 100;
    return (
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StripCell label="Revenue"      value={rev} ccy={ccy} accent="emerald" />
        <StripCell label="Expenses"     value={exp} ccy={ccy} accent="rose" />
        <StripCell label="Net Income"   value={ni}  ccy={ccy} accent={ni < 0 ? "rose" : "violet"} sub={`${margin.toFixed(1)}% margin`} highlight />
      </div>
    );
  }
  if (kind === "balance-sheet") {
    const a = sectionByType.get("ASSET")     ?? 0;
    const l = sectionByType.get("LIABILITY") ?? 0;
    const e = sectionByType.get("EQUITY")    ?? 0;
    const diff = a - (l + e);
    return (
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StripCell label="Total Assets"           value={a} ccy={ccy} accent="sky" />
        <StripCell label="Total Liabilities"      value={l} ccy={ccy} accent="amber" />
        <StripCell label="Total Equity"           value={e} ccy={ccy} accent="violet" sub={`Check: ${formatMoney(diff, { ccy })} diff`} highlight={Math.abs(diff) < 100} />
      </div>
    );
  }
  return null;
}

function StripCell({ label, value, ccy, accent, sub, highlight }: { label: string; value: number; ccy: string; accent: "emerald"|"rose"|"violet"|"sky"|"amber"; sub?: string; highlight?: boolean }) {
  const palette = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-900", dot: "bg-emerald-500", ring: "ring-emerald-200" },
    rose:    { bg: "bg-rose-50",    text: "text-rose-900",    dot: "bg-rose-500",    ring: "ring-rose-200" },
    violet:  { bg: "bg-violet-50",  text: "text-violet-900",  dot: "bg-violet-500",  ring: "ring-violet-200" },
    sky:     { bg: "bg-sky-50",     text: "text-sky-900",     dot: "bg-sky-500",     ring: "ring-sky-200" },
    amber:   { bg: "bg-amber-50",   text: "text-amber-900",   dot: "bg-amber-500",   ring: "ring-amber-200" },
  }[accent];
  return (
    <div className={`relative rounded-lg ${palette.bg} p-4 border border-stone-200/60 ${highlight ? `ring-2 ${palette.ring}` : ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-1.5 h-1.5 rounded-full ${palette.dot}`} />
        <span className={`text-[10px] uppercase tracking-widest font-bold ${palette.text}`}>{label}</span>
      </div>
      <p className={`text-[22px] font-extrabold tabular-nums leading-none ${value < 0 ? "text-rose-700" : palette.text}`}>{formatMoney(value, { ccy })}</p>
      {sub && <p className={`text-[10px] mt-1.5 font-medium ${palette.text} opacity-70`}>{sub}</p>}
    </div>
  );
}
