"use client";

// FX Rates management — pivot view per (currency × period × rateType).
// Admin can edit rates inline. Used by Consolidation engine for translation.

import { useEffect, useMemo, useState } from "react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { Loader2, Save, RefreshCw, Plus, Download, Upload } from "lucide-react";

interface FxRate {
  id: string;
  fromCcy: string; toCcy: string;
  periodCode: string;
  rateType: string;
  rate: number;
  source?: string | null;
  uploadedAt: string;
}

export default function FxRatesPage() {
  const [rates, setRates] = useState<FxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ fromCcy: string; rateType: string }>({ fromCcy: "", rateType: "CLOSING" });
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ committed: number; errors: string[] } | null>(null);

  async function uploadFile(file: File) {
    setUploading(true); setError(null); setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/v2/fx-rates/import", { method: "POST", credentials: "include", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setUploadResult({ committed: j.data.rowsCommitted, errors: j.data.errors ?? [] });
      await refresh();
    } catch (e: any) { setError(e.message); }
    finally { setUploading(false); }
  }

  async function refresh() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filter.fromCcy) qs.set("fromCcy", filter.fromCcy);
      const r = await fetch(`/api/v2/fx-rates?${qs}`, { credentials: "include" });
      const j = await r.json();
      setRates((j?.data?.data ?? []) as FxRate[]);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, []);

  async function saveRate(r: FxRate, newRate: number) {
    if (Math.abs(newRate - r.rate) < 1e-12) return;
    setSaving(r.id); setError(null);
    try {
      const resp = await fetch("/api/v2/fx-rates", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromCcy: r.fromCcy, toCcy: r.toCcy, periodCode: r.periodCode,
          rateType: r.rateType, rate: newRate, source: "manual",
        }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j?.error ?? `HTTP ${resp.status}`);
      setRates(rs => rs.map(x => x.id === r.id ? { ...x, rate: newRate, source: "manual" } : x));
    } catch (e: any) { setError(e.message); }
    finally { setSaving(null); }
  }

  // Group rates: (fromCcy × periodCode), filtered by rateType
  const filtered = useMemo(() => rates.filter(r => r.rateType === filter.rateType && (!filter.fromCcy || r.fromCcy === filter.fromCcy)), [rates, filter]);
  const currencies = useMemo(() => Array.from(new Set(rates.map(r => r.fromCcy))).sort(), [rates]);
  const periods    = useMemo(() => Array.from(new Set(filtered.map(r => r.periodCode))).sort(), [filtered]);
  const byKey      = useMemo(() => {
    const m = new Map<string, FxRate>();
    for (const r of filtered) m.set(`${r.fromCcy}|${r.periodCode}`, r);
    return m;
  }, [filtered]);

  return (
    <>
      <MetadataHeader title="FX Rates" subtitle="Currency conversion rates per period for consolidation" />
      <main className="flex-1 overflow-y-auto bg-[#FAF9F6] p-6">
        {/* Filters */}
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs">
              <span className="text-stone-500">Currency:</span>
              <select value={filter.fromCcy} onChange={e => setFilter(f => ({ ...f, fromCcy: e.target.value }))}
                className="rounded-md border border-stone-200 px-2.5 py-1.5 text-xs font-medium bg-white">
                <option value="">All</option>
                {currencies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span className="text-stone-500">Rate Type:</span>
              <select value={filter.rateType} onChange={e => setFilter(f => ({ ...f, rateType: e.target.value }))}
                className="rounded-md border border-stone-200 px-2.5 py-1.5 text-xs font-medium bg-white">
                <option value="CLOSING">Closing</option>
                <option value="AVERAGE">Average</option>
                <option value="OPENING">Opening</option>
                <option value="HISTORICAL">Historical</option>
              </select>
            </label>
            <a
              href="/api/v2/fx-rates/import"
              download="fx-rates-template.xlsx"
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-stone-200 text-stone-700 hover:bg-stone-50"
            >
              <Download className="h-3 w-3" /> Download Template
            </a>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-stone-200 text-stone-700 hover:bg-stone-50 cursor-pointer">
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              Upload Excel
              <input
                type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }}
                disabled={uploading}
              />
            </label>
            <button onClick={refresh} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-stone-900 text-white hover:bg-stone-800">
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Refresh
            </button>
          </div>
          {uploadResult && (
            <div className={`mt-3 rounded-md px-3 py-2 text-xs ${uploadResult.errors.length === 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
              ✓ Uploaded <strong>{uploadResult.committed}</strong> rates
              {uploadResult.errors.length > 0 && <span> · {uploadResult.errors.length} skipped rows: {uploadResult.errors.slice(0, 3).join("; ")}</span>}
            </div>
          )}
        </div>

        {error && <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-xs text-red-800 mb-4">⚠ {error}</div>}

        {/* Pivot table */}
        <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50">
                <tr className="border-b border-stone-200">
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-stone-600 w-28">Currency</th>
                  {periods.map(p => (
                    <th key={p} className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-stone-600 w-24">{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currencies.filter(c => !filter.fromCcy || c === filter.fromCcy).map(ccy => (
                  <tr key={ccy} className="border-t border-stone-100 hover:bg-stone-50/40">
                    <td className="px-4 py-2 font-mono text-[12px] font-semibold text-stone-900">{ccy} → USD</td>
                    {periods.map(p => {
                      const r = byKey.get(`${ccy}|${p}`);
                      return (
                        <td key={p} className="px-2 py-1 text-right">
                          {r ? (
                            <RateInput
                              rate={r}
                              saving={saving === r.id}
                              onSave={(v) => saveRate(r, v)}
                            />
                          ) : <span className="text-stone-300">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {currencies.length === 0 && !loading && (
                  <tr><td className="px-4 py-8 text-center text-sm text-stone-500" colSpan={periods.length + 1}>No FX rates yet. Run the seed or upload via API.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-[11px] text-stone-500">
          Rates are 1 unit of source currency in USD. Closing rates apply to balance-sheet accounts at period end. Average rates apply to P&L accounts for flow during the period.
        </p>
      </main>
    </>
  );
}

function RateInput({ rate, saving, onSave }: { rate: FxRate; saving: boolean; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(rate.rate));
  useEffect(() => { setV(String(rate.rate)); }, [rate.rate]);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={v}
      disabled={saving}
      onChange={e => setV(e.target.value)}
      onBlur={() => { const n = Number(v); if (Number.isFinite(n) && n > 0) onSave(n); }}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={`w-20 rounded border px-1.5 py-1 text-right text-[12px] font-mono tabular-nums transition-all ${
        saving ? "border-amber-300 bg-amber-50" : "border-transparent bg-white hover:border-stone-200 focus:border-stone-900 focus:ring-2 focus:ring-stone-100 focus:outline-none"
      }`}
    />
  );
}
