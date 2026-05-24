"use client";

// AI narrative panel — single ✨ button on every report.
//
// Calls /api/v2/ai/explain with the right kind based on report type:
//   income-statement → income-narrative (CFO-grade MD&A)
//   balance-sheet    → balance-narrative
//   trial-balance    → not offered (raw data, no story to tell)
//   cash-flow        → cash-flow-narrative (Phase 2)
//
// Caches client-side until POV changes. Shows cost + model + cache status
// so users see what AI cost them.

import { useState, useEffect } from "react";
import { Sparkles, Loader2, RefreshCcw, ChevronDown, Info } from "lucide-react";

type Kind = "trial-balance" | "income-statement" | "balance-sheet" | "cash-flow";

interface Props { kind: Kind; report: any; ccy: string; }

interface AiResponse {
  text:        string;
  model:       string;
  cached:      boolean;
  promptTokens:  number;
  outputTokens:  number;
  costInr:     number;
  latencyMs:   number;
  stub:        boolean;
  capExceeded: boolean;
}

const KIND_TO_AI: Partial<Record<Kind, string>> = {
  "income-statement": "income-narrative",
  "balance-sheet":    "balance-narrative",
};

const KIND_LABEL: Partial<Record<Kind, string>> = {
  "income-statement": "Generate MD&A",
  "balance-sheet":    "Generate BS commentary",
};

export function AiNarrativePanel({ kind, report, ccy }: Props) {
  const aiKind = KIND_TO_AI[kind];
  const label  = KIND_LABEL[kind];
  const [resp, setResp] = useState<AiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Clear AI panel when report POV changes (different meta means different request)
  useEffect(() => {
    setResp(null); setError(null); setOpen(false);
  }, [report?.meta?.scenarioId, report?.meta?.entityId, report?.meta?.yearCode]);

  if (!aiKind) return null;

  async function run(bypassCache = false) {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/v2/ai/explain", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: aiKind, bypassCache,
          payload: {
            scenario: report.meta?.scenarioId?.slice(0, 8),
            entity:   report.meta?.entityId?.slice(0, 8),
            year:     report.meta?.yearCode,
            currency: ccy,
            sections: report.sections?.map((s: any) => ({
              title: s.title, type: s.type,
              lines: s.lines?.map((l: any) => ({ code: l.code, name: l.name, value: l.value })),
              subtotal: s.subtotal,
            })),
            totals: report.totals,
          },
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setResp(j.data as AiResponse);
      setOpen(true);
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setLoading(false); }
  }

  return (
    <div className="mb-5 rounded-lg border border-violet-200 bg-gradient-to-br from-violet-50/60 to-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-violet-600" />
          <span className="text-xs font-bold uppercase tracking-wider text-violet-900">AI Narrative</span>
          {resp && (
            <span className="text-[10px] text-stone-500 ml-2">
              · {resp.cached ? "from cache" : resp.stub ? "stub mode (add ANTHROPIC_API_KEY)" : `${resp.model} · ₹${resp.costInr.toFixed(2)} · ${resp.latencyMs}ms`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!resp ? (
            <button
              onClick={() => run(false)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {label}
            </button>
          ) : (
            <>
              <button onClick={() => run(true)} disabled={loading} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-violet-700 hover:bg-violet-100">
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />} Regenerate
              </button>
              <button onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-violet-700 hover:bg-violet-100">
                <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
                {open ? "Hide" : "Show"}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 text-xs text-rose-700 bg-rose-50 border-t border-rose-100">
          ⚠ {error}
        </div>
      )}

      {resp && open && (
        <div className="px-5 py-4 border-t border-violet-100 bg-white">
          {resp.capExceeded && (
            <div className="mb-3 px-3 py-2 rounded bg-amber-50 text-amber-800 text-xs flex items-center gap-2">
              <Info className="w-3.5 h-3.5" /> Daily AI cost cap reached. Resets at midnight UTC.
            </div>
          )}
          {resp.stub && (
            <div className="mb-3 px-3 py-2 rounded bg-stone-100 text-stone-700 text-xs flex items-center gap-2">
              <Info className="w-3.5 h-3.5" /> Stub mode — ANTHROPIC_API_KEY not configured on the server. Set it via Vercel env to enable real AI narrative.
            </div>
          )}
          <div className="prose prose-sm max-w-none text-stone-800 whitespace-pre-wrap text-[13px] leading-relaxed">
            {resp.text}
          </div>
        </div>
      )}
    </div>
  );
}
