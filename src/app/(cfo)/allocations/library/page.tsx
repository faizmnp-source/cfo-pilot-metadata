"use client";
/*
 * /allocations/library — Section 19: prebuilt allocation patterns.
 * Each card pre-fills an AllocationSpec; user just confirms the codes
 * and clicks Run. Calls /api/v2/allocations/run.
 */
import { useEffect, useState } from "react";

type Template = {
  key: string; title: string; blurb: string; driverKind: "EQUAL" | "FIXED_PCT" | "FACT_BASED"; driverFactCode?: string;
  defaultSourceAccount: string; defaultDestAccount?: string; defaultReverseSource: boolean;
};

const TEMPLATES: Template[] = [
  { key: "revenue_allocation",  title: "Revenue Allocation",       blurb: "Allocate a central revenue line across operating entities in proportion to each entity's revenue contribution.",
    driverKind: "FACT_BASED", driverFactCode: "4000", defaultSourceAccount: "4000", defaultReverseSource: false },
  { key: "headcount_alloc",     title: "Headcount Allocation",     blurb: "Spread shared overhead by entity headcount (FTE).",
    driverKind: "FACT_BASED", driverFactCode: "HEADCOUNT", defaultSourceAccount: "6100", defaultReverseSource: true },
  { key: "cost_allocation",     title: "Cost Allocation",          blurb: "Allocate a cost pool across targets by direct-cost weights.",
    driverKind: "FACT_BASED", driverFactCode: "6900", defaultSourceAccount: "6900", defaultReverseSource: true },
  { key: "shared_services",     title: "Shared Services",          blurb: "Equal split of corporate-shared services across operating entities.",
    driverKind: "EQUAL", defaultSourceAccount: "6800", defaultReverseSource: true },
  { key: "occupancy",           title: "Occupancy / Rent",         blurb: "Allocate rent by floor-space (UD2 driver).",
    driverKind: "FACT_BASED", driverFactCode: "FLOOR_SPACE", defaultSourceAccount: "6300", defaultReverseSource: true },
  { key: "it_allocation",       title: "IT Allocation",            blurb: "Allocate IT by users (or compute) — pick driver fact code.",
    driverKind: "FACT_BASED", driverFactCode: "IT_USERS", defaultSourceAccount: "6500", defaultReverseSource: true },
  { key: "hr_allocation",       title: "HR Allocation",            blurb: "HR by headcount, identical to Headcount but for HR-cost pool.",
    driverKind: "FACT_BASED", driverFactCode: "HEADCOUNT", defaultSourceAccount: "6400", defaultReverseSource: true },
  { key: "marketing_alloc",     title: "Marketing Allocation",     blurb: "Marketing by revenue contribution to entity.",
    driverKind: "FACT_BASED", driverFactCode: "4000", defaultSourceAccount: "6200", defaultReverseSource: true },
];

export default function AllocationLibraryPage() {
  const [open, setOpen] = useState<Template | null>(null);
  useEffect(() => { document.body.classList.add("atelier-theme"); return () => { document.body.classList.remove("atelier-theme"); }; }, []);
  return (
    <main className="flex-1 overflow-y-auto" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <header className="px-14 pt-7 pb-5 border-b" style={{ borderColor: "var(--ink)" }}>
        <div className="atelier-eyebrow" style={{ fontSize: 11, color: "var(--accent)" }}>Section 19 · Allocation library</div>
        <h1 className="atelier-serif" style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 4 }}>Allocations</h1>
        <p className="atelier-serif italic mt-2" style={{ fontSize: 13, color: "var(--ink-3)" }}>
          Pick a pattern, fill in the codes, run. Each writes facts with origin=Allocation.
        </p>
      </header>
      <div className="px-14 py-8 grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {TEMPLATES.map(t => (
          <div key={t.key} className="atelier-card" style={{ background: "var(--paper)", border: "1px solid var(--rule)", padding: 22 }}>
            <div className="atelier-eyebrow" style={{ fontSize: 10.5 }}>{t.driverKind}</div>
            <h2 className="atelier-serif mt-1" style={{ fontSize: 17, fontWeight: 600 }}>{t.title}</h2>
            <p className="atelier-serif italic mt-2" style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.4 }}>{t.blurb}</p>
            <button onClick={() => setOpen(t)} className="atelier-pill mt-4">Run →</button>
          </div>
        ))}
      </div>
      {open && <RunModal template={open} onClose={() => setOpen(null)} />}
    </main>
  );
}

function RunModal({ template, onClose }: { template: Template; onClose: () => void }) {
  const [form, setForm] = useState({
    sourceScenarioCode: "Actual", sourcePeriodCode: "FY2026", sourceEntityCode: "APOLLO_GRP",
    sourceAccountCode: template.defaultSourceAccount, targetEntityCodes: "IN_OPS, US_HQ, UK_OPS, AE_OPS",
    factPeriodCode: "", factAccountCode: template.driverFactCode ?? "",
    dryRun: true,
  });
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true); setError(null); setResult(null);
    const spec: any = {
      sourceScenarioCode: form.sourceScenarioCode, sourcePeriodCode: form.sourcePeriodCode,
      sourceEntityCode: form.sourceEntityCode, sourceAccountCode: form.sourceAccountCode,
      targetDim: "ENTITY",
      targetEntityCodes: form.targetEntityCodes.split(",").map((x: string) => x.trim()).filter(Boolean),
      driver: { kind: template.driverKind },
      reverseSource: template.defaultReverseSource,
    };
    if (template.driverKind === "FACT_BASED") {
      spec.driver.factAccountCode  = form.factAccountCode || template.driverFactCode;
      if (form.factPeriodCode) spec.driver.factPeriodCode = form.factPeriodCode;
    }
    try {
      const r = await fetch("/api/v2/allocations/run", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec, dryRun: form.dryRun }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setResult(j.data);
    } catch (e: any) { setError(e?.message ?? String(e)); }
    finally { setRunning(false); }
  };

  const F = (name: string, label: string, placeholder?: string) => (
    <div className="mb-3">
      <label className="atelier-eyebrow block mb-1" style={{ fontSize: 10 }}>{label}</label>
      <input value={(form as any)[name] ?? ""} onChange={(e) => setForm({ ...form, [name]: e.target.value })} placeholder={placeholder}
        className="w-full text-sm px-3 py-2 rounded-md border atelier-serif"
        style={{ borderColor: "var(--ink-4)", background: "var(--paper)" }} />
    </div>
  );

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,22,18,0.42)", zIndex: 50 }} />
      <aside style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(560px, 100vw)", background: "var(--paper)", borderLeft: "1px solid var(--ink)", boxShadow: "-12px 0 32px -16px rgba(26,22,18,0.4)", zIndex: 51, overflowY: "auto" }}>
        <header className="px-7 pt-7 pb-4 border-b" style={{ borderColor: "var(--ink)" }}>
          <div className="atelier-eyebrow" style={{ color: "var(--accent)", fontSize: 10.5 }}>Run · {template.driverKind}</div>
          <h2 className="atelier-serif" style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>{template.title}</h2>
          <button onClick={onClose} style={{ position: "absolute", top: 18, right: 22, fontSize: 18, background: "transparent", border: "none", cursor: "pointer" }}>✕</button>
        </header>
        <div className="px-7 py-5">
          {F("sourceScenarioCode", "Source scenario", "Actual")}
          {F("sourcePeriodCode", "Source period", "FY2026")}
          {F("sourceEntityCode", "Source entity (pool holder)", "APOLLO_GRP")}
          {F("sourceAccountCode", "Source account (pool)", template.defaultSourceAccount)}
          {F("targetEntityCodes", "Target entities (comma)", "IN_OPS, US_HQ, UK_OPS, AE_OPS")}
          {template.driverKind === "FACT_BASED" && (<>
            {F("factAccountCode", "Driver fact account (weights)", template.driverFactCode)}
            {F("factPeriodCode",  "Driver fact period (optional, defaults to source)", "")}
          </>)}
          <label className="flex items-center gap-2 mt-2"><input type="checkbox" checked={form.dryRun} onChange={(e) => setForm({ ...form, dryRun: e.target.checked })} /><span className="atelier-serif" style={{ fontSize: 13 }}>Dry-run (preview only)</span></label>

          <button onClick={run} disabled={running} className="atelier-pill atelier-pill-dark mt-4">{running ? "Running…" : "Run allocation"}</button>

          {error && <p className="atelier-serif italic mt-4" style={{ color: "var(--accent)", fontSize: 13 }}>⚠ {error}</p>}
          {result && (
            <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--rule)" }}>
              <div className="atelier-eyebrow" style={{ fontSize: 10 }}>{result.persisted ? "Result" : "Dry-run preview"}</div>
              {result.persisted ? (
                <p className="atelier-serif tnum mt-2" style={{ fontSize: 22, fontWeight: 600 }}>Wrote {result.rowsWritten?.toLocaleString() ?? 0} rows · source {result.sourceValue?.toLocaleString() ?? 0}</p>
              ) : (
                <>
                  <p className="atelier-serif" style={{ fontSize: 13 }}>Source: {result.sourceValue?.toLocaleString() ?? 0}</p>
                  <ul className="mt-2 space-y-1">
                    {(result.rowsToWrite ?? []).map((r: any, i: number) => (
                      <li key={i} className="atelier-serif" style={{ fontSize: 12 }}>
                        {r.entityCode} → {r.accountCode}: <span className="tnum">{r.value?.toLocaleString()}</span>
                        <span className="atelier-eyebrow ml-2" style={{ fontSize: 9 }}>{r.reason}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
