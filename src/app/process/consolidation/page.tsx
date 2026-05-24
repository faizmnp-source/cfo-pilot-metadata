"use client";

// Consolidation launcher + run history.
// Top: form to pick Scenario, Entity, Year and trigger /api/v2/processes/consolidation
// Bottom: table of recent ProcessRun rows (kind=CONSOLIDATION) with status, summary, counts.

import { useEffect, useState } from "react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { GitBranch, Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, Play } from "lucide-react";

type Member = { id: string; code: string; name: string };
type Run = {
  id: string; kind: string; status: string; summary: string | null;
  params: { scenarioId?: string; entityId?: string; yearCode?: string };
  startedAt: string; finishedAt: string | null;
  rowsRead: number | null; rowsWritten: number | null;
  error: string | null; durationMs: number | null;
};

async function fetchMembers(slug: string): Promise<Member[]> {
  const r = await fetch(`/api/v2/members/${slug}?pageSize=500`, { credentials: "include" });
  const j = await r.json().catch(() => null);
  return (j?.data?.data ?? [])
    .filter((m: any) => m.isActive)
    .map((m: any) => ({ id: m.id, code: m.memberCode, name: m.memberName }));
}

export default function ConsolidationPage() {
  const [scenarios, setScenarios] = useState<Member[]>([]);
  const [entities,  setEntities]  = useState<Member[]>([]);
  const [years,     setYears]     = useState<Member[]>([]);

  const [scenarioId, setScenarioId] = useState("");
  const [entityId,   setEntityId]   = useState("");
  const [yearCode,   setYearCode]   = useState("");

  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<any>(null);
  const [error,   setError]   = useState<string | null>(null);

  const [runs, setRuns] = useState<Run[]>([]);

  // Load POV options + run history on mount
  useEffect(() => {
    (async () => {
      const [scns, ents, allTimes] = await Promise.all([
        fetchMembers("scenario"), fetchMembers("entity"), fetchMembers("time"),
      ]);
      setScenarios(scns);
      setEntities(ents);
      setYears(allTimes.filter(m => /^FY\d{4}$/.test(m.code)));
      if (scns[0])     setScenarioId(scns[0].id);
      if (ents[0])     setEntityId(ents[0].id);
      const fy = allTimes.find(m => /^FY\d{4}$/.test(m.code));
      if (fy) setYearCode(fy.code);
      await refreshRuns();
    })().catch(e => setError(String(e)));
  }, []);

  async function refreshRuns() {
    const r = await fetch("/api/v2/process-runs?kind=CONSOLIDATION&limit=20", { credentials: "include" });
    const j = await r.json().catch(() => null);
    setRuns((j?.data?.data ?? []) as Run[]);
  }

  async function runConsolidation() {
    if (!scenarioId || !entityId || !yearCode) return;
    setRunning(true); setError(null); setLastRun(null);
    try {
      const r = await fetch("/api/v2/processes/consolidation", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, entityId, yearCode }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setLastRun(j.data);
      await refreshRuns();
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setRunning(false); }
  }

  const entityById = new Map(entities.map(e => [e.id, e]));
  const scenarioById = new Map(scenarios.map(s => [s.id, s]));

  return (
    <>
      <MetadataHeader
        title="Consolidation"
        subtitle="Roll up leaf entities to a parent, apply FX + IC eliminations based on tenant settings"
      />
      <main className="flex-1 overflow-y-auto bg-background p-6">
        {/* Launcher */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="rounded-lg bg-violet-50 p-2"><GitBranch className="h-4 w-4 text-violet-700" /></div>
            <h3 className="text-sm font-semibold">Run Consolidation</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Scenario">
              <select value={scenarioId} onChange={e => setScenarioId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-100 focus:outline-none">
                <option value="">— pick —</option>
                {scenarios.map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
              </select>
            </Field>
            <Field label="Parent Entity">
              <select value={entityId} onChange={e => setEntityId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-100 focus:outline-none">
                <option value="">— pick —</option>
                {entities.map(e => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}
              </select>
            </Field>
            <Field label="Year">
              <select value={yearCode} onChange={e => setYearCode(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-100 focus:outline-none">
                <option value="">— pick —</option>
                {years.map(y => <option key={y.id} value={y.code}>{y.code}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex items-center justify-between mt-4">
            <p className="text-[11px] text-muted-foreground">Engine reads leaf facts under the parent entity for every month in the year, sums them up, writes Consolidation origin rows.</p>
            <button
              onClick={runConsolidation}
              disabled={running || !scenarioId || !entityId || !yearCode}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                running || !scenarioId || !entityId || !yearCode
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-violet-600 text-white hover:bg-violet-700"
              }`}
            >
              {running ? (<><Loader2 className="h-4 w-4 animate-spin" /> Running…</>) : (<><Play className="h-4 w-4" /> Run Consolidation</>)}
            </button>
          </div>
        </div>

        {/* Last run banner */}
        {lastRun && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mb-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-sm text-emerald-900">Consolidation complete</h4>
                <p className="text-xs text-emerald-700 mt-1">{lastRun.summary}</p>
                {lastRun.warnings?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {lastRun.warnings.map((w: string, i: number) => (
                      <p key={i} className="text-[11px] text-amber-700 flex items-start gap-1.5"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {w}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-xs text-red-800 mb-6">
            ⚠ {error}
          </div>
        )}

        {/* Run history */}
        <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-4 py-2.5 border-b border-border flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Run History</h3>
            <button onClick={refreshRuns} className="text-[11px] text-muted-foreground hover:text-foreground">Refresh</button>
          </div>
          {runs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No runs yet — kick off your first consolidation above.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50/50">
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="px-4 py-2 w-24">Status</th>
                  <th className="px-4 py-2">Inputs</th>
                  <th className="px-4 py-2">Summary</th>
                  <th className="px-4 py-2 text-right w-20">Read</th>
                  <th className="px-4 py-2 text-right w-20">Wrote</th>
                  <th className="px-4 py-2 w-24">Duration</th>
                  <th className="px-4 py-2 w-32">When</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(r => {
                  const scn = r.params.scenarioId ? scenarioById.get(r.params.scenarioId) : null;
                  const ent = r.params.entityId   ? entityById.get(r.params.entityId)     : null;
                  return (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                      <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-2 text-[12px]">
                        <span className="font-mono">{ent?.code ?? r.params.entityId?.slice(0, 6)}</span>
                        <span className="text-muted-foreground"> · </span>
                        <span className="font-mono">{scn?.code ?? r.params.scenarioId?.slice(0, 6)}</span>
                        <span className="text-muted-foreground"> · </span>
                        <span className="font-mono">{r.params.yearCode}</span>
                      </td>
                      <td className="px-4 py-2 text-[12px] text-gray-700">{r.summary ?? (r.error ? <span className="text-red-700">{r.error}</span> : "—")}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-[12px]">{r.rowsRead?.toLocaleString() ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-[12px]">{r.rowsWritten?.toLocaleString() ?? "—"}</td>
                      <td className="px-4 py-2 text-[11px] text-muted-foreground">{r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                      <td className="px-4 py-2 text-[11px] text-muted-foreground">{new Date(r.startedAt).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "SUCCEEDED") return <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium"><CheckCircle2 className="h-3 w-3" /> Success</span>;
  if (status === "FAILED")    return <span className="inline-flex items-center gap-1 text-[11px] text-red-700 font-medium"><XCircle className="h-3 w-3" /> Failed</span>;
  if (status === "RUNNING")   return <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium"><Loader2 className="h-3 w-3 animate-spin" /> Running</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 font-medium"><Clock className="h-3 w-3" /> {status}</span>;
}
