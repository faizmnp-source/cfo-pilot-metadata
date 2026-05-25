"use client";
/*
 * <CommentaryPanel /> — wraps any KPI or analysis with the AI
 * Storyteller narrative (Phase 5 intelligence/explain endpoint).
 * Atelier-themed, collapsible. Returns deterministic fallback when
 * ANTHROPIC_API_KEY isn't set on the server.
 *
 * Props:
 *   kpi:     the KPI object (label, value, deltaPct, favourable, ...).
 *   context: supporting data the storyteller can reference (top entities,
 *            top variances, prior, period, tenantName).
 *   variant: "card" (default; full panel with header) | "inline" (no header).
 */
import { useState } from "react";

type CommentaryResult = {
  what: string; why: string; impact: string; action: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  _error?: string; _raw?: string;
};

export function CommentaryPanel({ kpi, context, variant = "card" }: { kpi: any; context?: any; variant?: "card" | "inline" }) {
  const [open, setOpen]   = useState(false);
  const [data, setData]   = useState<CommentaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    if (data) { setOpen(o => !o); return; }
    setOpen(true);
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/v2/intelligence/explain", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kpiKey: kpi.key ?? kpi.label, kpi, context: context ?? {} }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setData(j.data as CommentaryResult);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setLoading(false); }
  };

  if (variant === "inline") {
    return (
      <div className="mt-2">
        <button onClick={ask} className="atelier-eyebrow underline" style={{ fontSize: 10, color: "var(--accent)" }}>
          {open ? "▾ hide commentary" : data ? "▸ show commentary" : "▸ generate commentary"}
        </button>
        {open && <CommentaryBody data={data} loading={loading} error={error} />}
      </div>
    );
  }

  return (
    <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--rule)" }}>
      <button onClick={ask} className="flex items-center gap-2 atelier-eyebrow" style={{ fontSize: 10.5, color: "var(--accent)" }}>
        <span>✦ Commentary</span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>{open ? "hide ▾" : "generate ▸"}</span>
      </button>
      {open && <CommentaryBody data={data} loading={loading} error={error} />}
    </div>
  );
}

function CommentaryBody({ data, loading, error }: { data: CommentaryResult | null; loading: boolean; error: string | null }) {
  if (loading) return <p className="atelier-serif italic mt-2" style={{ fontSize: 12, color: "var(--ink-3)" }}>Composing…</p>;
  if (error)   return <p className="atelier-serif italic mt-2" style={{ fontSize: 12, color: "var(--accent)" }}>⚠ {error}</p>;
  if (!data)   return null;
  const priColor = data.priority === "HIGH" ? "var(--accent)" : data.priority === "MEDIUM" ? "var(--ink-2)" : "var(--ink-3)";
  return (
    <div className="mt-2 grid gap-2" style={{ fontSize: 13, lineHeight: 1.5 }}>
      <div>
        <span className="atelier-eyebrow mr-2" style={{ fontSize: 9, color: priColor }}>{data.priority}</span>
        <span className="atelier-serif" style={{ color: "var(--ink)", fontWeight: 600 }}>{data.what}</span>
      </div>
      <p className="atelier-serif" style={{ color: "var(--ink-2)" }}>{data.why}</p>
      <p className="atelier-serif italic" style={{ color: "var(--ink-3)" }}>Impact — {data.impact}</p>
      <p className="atelier-serif" style={{ color: "var(--accent)", fontWeight: 500 }}>↪ {data.action}</p>
      {data._error && <p className="atelier-eyebrow" style={{ fontSize: 9, color: "var(--ink-4)" }}>fallback used: {data._error}</p>}
    </div>
  );
}
