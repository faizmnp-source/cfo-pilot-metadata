"use client";

// AI close summary panel — sidebar widget on /monthly-close.
//
// Calls /api/v2/ai/explain with kind="close-summary" and renders a 3-paragraph
// status note (overall posture · blockers · next-24h recommendation).
//
// Mirrors AiNarrativePanel's UX:
//   · sparkles button to generate
//   · regenerate button (bypasses cache)
//   · cached / stub / cost label
//   · auto-clears when period or run id changes
//
// Sidebar-sized variant — smaller padding, no collapsible header.

import { useEffect, useState } from "react";
import { Sparkles, Loader2, RefreshCcw, Info } from "lucide-react";

interface CloseTaskMin {
  title:       string;
  status:      string;
  dayOffset:   number;
  category:    string;
  owner:       string | null;
}

interface CloseRunMin {
  id:          string;
  periodCode:  string;
  status:      string;
}

interface StatsMin {
  total:       number;
  done:        number;
  blocked:     number;
  pending:     number;
  inProgress:  number;
  pctComplete: number;
}

interface AiResponse {
  text:         string;
  model:        string;
  cached:       boolean;
  promptTokens: number;
  outputTokens: number;
  costInr:      number;
  latencyMs:    number;
  stub:         boolean;
  capExceeded:  boolean;
}

interface Props {
  closeRun: CloseRunMin | null;
  tasks:    CloseTaskMin[];
  stats:    StatsMin | null;
}

export function AiCloseSummaryPanel({ closeRun, tasks, stats }: Props) {
  const [resp, setResp]       = useState<AiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Clear when period changes — different close, different story.
  useEffect(() => {
    setResp(null);
    setError(null);
  }, [closeRun?.id, closeRun?.status]);

  async function run(bypassCache = false) {
    if (!closeRun || !stats) return;
    setLoading(true);
    setError(null);
    try {
      // Trim task payload to keep prompt small — top blockers + top in-progress are enough.
      const trimmed = tasks.map(t => ({
        title:     t.title,
        status:    t.status,
        dayOffset: t.dayOffset,
        category:  t.category,
        owner:     t.owner,
      }));
      const r = await fetch("/api/v2/ai/explain", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind:        "close-summary",
          bypassCache,
          payload: {
            periodCode:  closeRun.periodCode,
            runStatus:   closeRun.status,
            pctComplete: stats.pctComplete,
            total:       stats.total,
            done:        stats.done,
            blocked:     stats.blocked,
            pending:     stats.pending,
            inProgress:  stats.inProgress,
            tasks:       trimmed,
          },
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setResp(j.data as AiResponse);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading || !closeRun || !stats;

  return (
    <div className="bg-white rounded-xl border border-violet-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-br from-violet-50/70 to-white border-b border-violet-100">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-violet-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-violet-900">AI Close Note</h3>
        </div>
        {!resp ? (
          <button
            onClick={() => run(false)}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Generate
          </button>
        ) : (
          <button
            onClick={() => run(true)}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-violet-700 hover:bg-violet-100 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
            Regenerate
          </button>
        )}
      </div>
      <div className="px-5 py-4">
        {error && (
          <div className="mb-2 px-2.5 py-2 rounded bg-rose-50 text-rose-700 text-[11px]">
            ⚠ {error}
          </div>
        )}
        {!resp && !loading && !error && (
          <p className="text-xs text-stone-500 leading-relaxed">
            Click <strong>Generate</strong> to get a CFO-grade status note on this close — overall posture, blockers, and what to do next.
          </p>
        )}
        {loading && !resp && (
          <p className="text-xs text-stone-500 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Drafting…
          </p>
        )}
        {resp && (
          <>
            {resp.capExceeded && (
              <div className="mb-2 px-2.5 py-2 rounded bg-amber-50 text-amber-800 text-[11px] flex items-center gap-2">
                <Info className="w-3 h-3" /> Daily AI cost cap reached.
              </div>
            )}
            {resp.stub && (
              <div className="mb-2 px-2.5 py-2 rounded bg-stone-100 text-stone-700 text-[11px] flex items-center gap-2">
                <Info className="w-3 h-3" /> Stub mode — add ANTHROPIC_API_KEY.
              </div>
            )}
            <div className="prose prose-sm max-w-none text-stone-800 whitespace-pre-wrap text-[12px] leading-relaxed">
              {resp.text}
            </div>
            <p className="mt-3 text-[10px] text-stone-400 tabular">
              {resp.cached
                ? "from cache"
                : resp.stub
                  ? "stub mode"
                  : `${resp.model} · ₹${resp.costInr.toFixed(2)} · ${resp.latencyMs}ms`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
