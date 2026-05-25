"use client";
/*
 * /jobs/library — Section 18: prebuilt enterprise jobs.
 * Pick a pattern, fill in the codes, click Run. Tiny modal collects
 * the args, calls /api/v2/jobs/copy or /jobs/clear, shows result.
 */
import { useState } from "react";

type JobPattern = {
  key:        string;
  category:   "COPY" | "CLEAR" | "SEED" | "ROLLFWD";
  title:      string;
  blurb:      string;
  endpoint:   string;
  fields:     Array<{ name: string; label: string; placeholder?: string; type?: "text"|"number"|"checkbox" }>;
  buildBody?: (form: Record<string, any>) => any;
};

const PATTERNS: JobPattern[] = [
  {
    key: "actual_to_forecast", category: "COPY",
    title: "Copy Actual → Forecast (current FY)",
    blurb: "Seed your forecast scenario with the latest actuals so users override what changed instead of typing the whole year.",
    endpoint: "/api/v2/jobs/copy",
    fields: [
      { name: "sourceScenarioCode", label: "From scenario", placeholder: "Actual" },
      { name: "sourcePeriodCode",   label: "Source period", placeholder: "FY2026" },
      { name: "targetScenarioCode", label: "To scenario",   placeholder: "Forecast" },
    ],
  },
  {
    key: "budget_to_forecast", category: "COPY",
    title: "Copy Budget → Forecast",
    blurb: "Start the rolling forecast from the latest approved budget.",
    endpoint: "/api/v2/jobs/copy",
    fields: [
      { name: "sourceScenarioCode", label: "From",           placeholder: "Budget" },
      { name: "sourcePeriodCode",   label: "Source period",  placeholder: "FY2026" },
      { name: "targetScenarioCode", label: "To",             placeholder: "Forecast" },
    ],
  },
  {
    key: "prior_to_current_growth", category: "SEED",
    title: "Seed FY26 Budget = FY25 Actual × 1.08",
    blurb: "Quick anchor for next year's budget: copy prior year and apply 8% growth.",
    endpoint: "/api/v2/jobs/copy",
    fields: [
      { name: "sourceScenarioCode", label: "Source scenario", placeholder: "Actual" },
      { name: "sourcePeriodCode",   label: "Source period",   placeholder: "FY2025" },
      { name: "targetScenarioCode", label: "Target scenario", placeholder: "Budget" },
      { name: "targetPeriodCode",   label: "Target period",   placeholder: "FY2026" },
    ],
    buildBody: (f) => ({ ...f, transform: { multiplyBy: 1.08 } }),
  },
  {
    key: "scenario_copy_generic", category: "COPY",
    title: "Generic Scenario Copy",
    blurb: "Copy any scenario to any other scenario, optionally across periods.",
    endpoint: "/api/v2/jobs/copy",
    fields: [
      { name: "sourceScenarioCode", label: "Source scenario", placeholder: "Actual" },
      { name: "sourcePeriodCode",   label: "Source period",   placeholder: "FY2026" },
      { name: "targetScenarioCode", label: "Target scenario", placeholder: "WhatIf" },
      { name: "targetPeriodCode",   label: "Target period (opt)", placeholder: "FY2026" },
    ],
  },
  {
    key: "period_clear", category: "CLEAR",
    title: "Clear period in scenario",
    blurb: "Soft-clear all current facts at the chosen scenario + period.  Prior versions preserved.",
    endpoint: "/api/v2/jobs/clear",
    fields: [
      { name: "scenarioCode", label: "Scenario", placeholder: "Forecast" },
      { name: "periodCode",   label: "Period",   placeholder: "FY2026" },
      { name: "hardDelete",   label: "HARD DELETE (irreversible)", type: "checkbox" },
    ],
  },
  {
    key: "entity_clear", category: "CLEAR",
    title: "Clear one entity",
    blurb: "Soft-clear current facts for a specific entity + period + scenario.",
    endpoint: "/api/v2/jobs/clear",
    fields: [
      { name: "scenarioCode", label: "Scenario",   placeholder: "Forecast" },
      { name: "periodCode",   label: "Period",     placeholder: "FY2026" },
      { name: "entityCodes",  label: "Entity codes (comma)", placeholder: "IN_OPS, US_HQ" },
    ],
  },
  {
    key: "intersection_clear", category: "CLEAR",
    title: "Clear intersection (scenario × period × entity × account)",
    blurb: "Surgical clear when you want to re-seed just one slice.",
    endpoint: "/api/v2/jobs/clear",
    fields: [
      { name: "scenarioCode", label: "Scenario",  placeholder: "Forecast" },
      { name: "periodCode",   label: "Period",    placeholder: "2026M04" },
      { name: "entityCodes",  label: "Entities (comma)", placeholder: "IN_OPS" },
      { name: "accountCodes", label: "Accounts (comma)", placeholder: "6100, 6300" },
    ],
  },
];

export default function JobsLibraryPage() {
  const [open, setOpen] = useState<JobPattern | null>(null);

  return (
    <main className="flex-1 overflow-y-auto" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <header className="px-14 pt-7 pb-5 border-b" style={{ borderColor: "var(--ink)" }}>
        <div className="atelier-eyebrow" style={{ fontSize: 11, color: "var(--accent)" }}>Section 18 · Enterprise jobs</div>
        <h1 className="atelier-serif" style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 4 }}>Jobs Library</h1>
        <p className="atelier-serif italic mt-2" style={{ fontSize: 13, color: "var(--ink-3)" }}>
          One-click copy, clear, and seed patterns. Pick a card, fill the codes, run.
        </p>
      </header>

      <div className="px-14 py-8 grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {PATTERNS.map(p => (
          <div key={p.key} className="atelier-card" style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: 22 }}>
            <div className="atelier-eyebrow" style={{ fontSize: 10.5, color: p.category === "CLEAR" ? "var(--accent)" : "var(--ink-3)" }}>{p.category}</div>
            <h2 className="atelier-serif mt-1" style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>{p.title}</h2>
            <p className="atelier-serif italic mt-2" style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.4 }}>{p.blurb}</p>
            <button onClick={() => setOpen(p)} className="atelier-pill mt-4">Run →</button>
          </div>
        ))}
      </div>

      {open && <RunModal pattern={open} onClose={() => setOpen(null)} />}
    </main>
  );
}

function RunModal({ pattern, onClose }: { pattern: JobPattern; onClose: () => void }) {
  const [form, setForm] = useState<Record<string, any>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState<any>(null);
  const [error, setError]     = useState<string | null>(null);

  const run = async () => {
    setRunning(true); setError(null); setResult(null);
    try {
      // Convert comma-list strings into arrays for *Codes fields
      const body: any = pattern.buildBody ? pattern.buildBody(form) : { ...form };
      for (const k of Object.keys(body)) {
        if (k.endsWith("Codes") && typeof body[k] === "string") {
          body[k] = body[k].split(",").map((x: string) => x.trim()).filter(Boolean);
        }
      }
      const r = await fetch(pattern.endpoint, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setResult(j.data);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setRunning(false); }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,22,18,0.42)", zIndex: 50 }} />
      <aside style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(520px, 100vw)", background: "var(--paper)", borderLeft: "1px solid var(--ink)", boxShadow: "-12px 0 32px -16px rgba(26,22,18,0.4)", zIndex: 51, overflowY: "auto" }}>
        <header className="px-7 pt-7 pb-4 border-b" style={{ borderColor: "var(--ink)" }}>
          <div className="atelier-eyebrow" style={{ color: "var(--accent)", fontSize: 10.5 }}>Run · {pattern.category}</div>
          <h2 className="atelier-serif" style={{ fontSize: 22, fontWeight: 600, marginTop: 4, letterSpacing: "-0.01em" }}>{pattern.title}</h2>
          <p className="atelier-serif italic mt-2" style={{ fontSize: 12, color: "var(--ink-3)" }}>{pattern.blurb}</p>
          <button onClick={onClose} style={{ position: "absolute", top: 18, right: 22, fontSize: 18, background: "transparent", border: "none", cursor: "pointer" }}>✕</button>
        </header>
        <div className="px-7 py-5">
          {pattern.fields.map(f => (
            <div key={f.name} className="mb-3">
              <label className="atelier-eyebrow block mb-1" style={{ fontSize: 10 }}>{f.label}</label>
              {f.type === "checkbox" ? (
                <input type="checkbox" checked={!!form[f.name]} onChange={(e) => setForm({ ...form, [f.name]: e.target.checked })} />
              ) : (
                <input
                  type={f.type ?? "text"} value={form[f.name] ?? ""} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                  placeholder={f.placeholder}
                  className="w-full text-sm px-3 py-2 rounded-md border atelier-serif"
                  style={{ borderColor: "var(--ink-4)", background: "var(--paper)" }}
                />
              )}
            </div>
          ))}

          <button onClick={run} disabled={running} className="atelier-pill atelier-pill-dark mt-2">
            {running ? "Running…" : "Run job"}
          </button>

          {error && <p className="atelier-serif italic mt-4" style={{ color: "var(--accent)", fontSize: 13 }}>⚠ {error}</p>}
          {result && (
            <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--rule)" }}>
              <div className="atelier-eyebrow" style={{ fontSize: 10 }}>Result</div>
              <p className="atelier-serif tnum mt-1" style={{ fontSize: 22, fontWeight: 600 }}>
                Read {result.rowsRead?.toLocaleString() ?? 0} · Wrote {result.rowsWritten?.toLocaleString() ?? 0}
              </p>
              {result.warnings?.length > 0 && (
                <ul className="atelier-serif italic mt-2" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {result.warnings.map((w: string, i: number) => <li key={i}>· {w}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
