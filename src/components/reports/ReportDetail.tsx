"use client";

// Shared report-detail page. Wires POV → API call → ReportLayout chrome + ReportBody.

import { useCallback, useState } from "react";
import { ReportLayout } from "./ReportLayout";
import { ReportBody } from "./ReportBody";

type Kind = "trial-balance" | "income-statement" | "balance-sheet" | "cash-flow";

interface Props { kind: Kind; title: string; subtitle?: string; }

export function ReportDetail({ kind, title, subtitle }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      onLoad={onLoad}
      loading={loading}
      meta={data?.meta}
      totals={data?.totals}
    >
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-xs text-red-800 mb-4">⚠ {error}</div>
      )}
      {data?.sections && <ReportBody sections={data.sections} />}
    </ReportLayout>
  );
}
