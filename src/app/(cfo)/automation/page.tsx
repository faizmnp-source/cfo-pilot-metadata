"use client";

// Automation — recurring jobs and one-off tasks.
//
// 6 job kinds (3 active in v1):
//   - EXPORT_FACTS        (Phase 2)
//   - EXPORT_METADATA     ✓
//   - RUN_CONSOLIDATION   ✓
//   - RUN_CALC_RULE       ✓
//   - SEND_REPORT         (Phase 2)
//   - RUN_PIPELINE        (Phase 2)
//
// Schedule: manual or cron string. Cron firing is Phase 2 (Vercel cron handler).

import { useEffect, useState } from "react";
import { Zap, Plus, Play, Loader2, RefreshCw, ChevronRight, AlertCircle, CheckCircle2, X, Database, GitBranch, Sparkles, FileSpreadsheet, FileText, Network } from "lucide-react";

type Job = {
  id: string; code: string; name: string; description?: string;
  kind: string; params: any; schedule: string; timezone: string;
  enabled: boolean; createdAt: string; updatedAt: string;
  lastRunAt?: string; lastRunStatus?: string;
  nextRunAt?: string; runCount: number;
  _count?: { runs: number };
};

const KIND_META: Record<string, { icon: any; label: string; supported: boolean; tone: string }> = {
  EXPORT_METADATA:   { icon: Database,        label: "Export Metadata",   supported: true,  tone: "bg-sky-50 text-sky-700"        },
  RUN_CONSOLIDATION: { icon: GitBranch,       label: "Run Consolidation", supported: true,  tone: "bg-emerald-50 text-emerald-700" },
  RUN_CALC_RULE:     { icon: Sparkles,        label: "Run Calc Rule",     supported: true,  tone: "bg-violet-50 text-violet-700"   },
  EXPORT_FACTS:      { icon: FileSpreadsheet, label: "Export Facts",      supported: false, tone: "bg-stone-100 text-stone-500"    },
  SEND_REPORT:       { icon: FileText,        label: "Send Report",       supported: false, tone: "bg-stone-100 text-stone-500"    },
  RUN_PIPELINE:      { icon: Network,         label: "Run Pipeline",      supported: false, tone: "bg-stone-100 text-stone-500"    },
};

export default function AutomationPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Job | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/v2/automation/jobs", { credentials: "include" });
      const j = await r.json();
      setJobs(j?.data?.data ?? []);
    } finally { setLoading(false); }
  }

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden">
      <div className="flex-1 min-w-0 overflow-y-auto">
        <header className="border-b border-stone-200 px-6 py-4 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur z-10">
          <div>
            <h1 className="text-lg font-bold text-stone-900 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Automation
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">Repeatable jobs — backups, exports, calc runs, consolidations. Manual or scheduled.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} disabled={loading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-stone-600 hover:bg-stone-100">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600">
              <Plus className="w-3.5 h-3.5" /> New job
            </button>
          </div>
        </header>

        <div className="p-6 space-y-3">
          {jobs.length === 0 && !loading && <EmptyState onCreate={() => setShowCreate(true)} />}
          {jobs.map(j => <JobCard key={j.id} job={j} onSelect={() => setSelected(j)} onChanged={refresh} />)}
        </div>
      </div>

      {selected && <JobDetailDrawer job={selected} onClose={() => setSelected(null)} onChanged={() => { refresh(); setSelected(null); }} />}
      {showCreate && <CreateJobModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refresh(); }} />}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="max-w-md mx-auto py-10 text-center">
      <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 items-center justify-center mb-4 shadow-lg shadow-amber-200/60">
        <Zap className="w-6 h-6 text-white" />
      </div>
      <h2 className="text-lg font-bold text-stone-900 mb-1">No automation jobs yet</h2>
      <p className="text-sm text-stone-500 mb-5">Save tasks you do regularly — backups, exports, consolidations, calc-rule runs — and re-run them with one click.</p>
      <button onClick={onCreate}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600">
        <Plus className="w-4 h-4" /> Create your first job
      </button>
    </div>
  );
}

function JobCard({ job, onSelect, onChanged }: { job: Job; onSelect: () => void; onChanged: () => void }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const meta = KIND_META[job.kind] ?? { icon: Zap, label: job.kind, supported: false, tone: "" };
  const Icon = meta.icon;

  async function runNow(e: React.MouseEvent) {
    e.stopPropagation();
    setRunning(true); setResult(null);
    try {
      const r = await fetch(`/api/v2/automation/jobs/${job.id}/run`, { method: "POST", credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setResult(`✓ ${j?.data?.output?.kind ?? "Done"}`);
      onChanged();
    } catch (e: any) {
      setResult(`❌ ${e.message}`);
    } finally { setRunning(false); }
  }

  return (
    <button onClick={onSelect}
      className="w-full text-left bg-white rounded-lg border border-stone-200 hover:border-amber-300 hover:shadow-sm p-4 transition group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 flex items-start gap-3">
          <div className={`shrink-0 w-9 h-9 rounded-md flex items-center justify-center ${meta.tone}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-sm font-semibold text-stone-900 truncate">{job.name}</h3>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${job.enabled ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>
                {job.enabled ? "enabled" : "disabled"}
              </span>
              <span className="text-[10px] text-stone-500">{meta.label}</span>
              {!meta.supported && <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 rounded">phase 2</span>}
            </div>
            <p className="text-xs text-stone-600 line-clamp-1">{job.description ?? "—"}</p>
            <p className="text-[10px] text-stone-400 mt-1 font-mono">
              {job.code} · {job.schedule} · {job.runCount} runs
              {job.lastRunAt && ` · last ${new Date(job.lastRunAt).toLocaleString()}`}
              {job.lastRunStatus && ` (${job.lastRunStatus})`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {job.enabled && meta.supported && (
            <button onClick={runNow} disabled={running}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100">
              {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Run
            </button>
          )}
          <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-amber-500" />
        </div>
      </div>
      {result && <p className={`text-[11px] mt-2 pl-12 ${result.startsWith("❌") ? "text-rose-600" : "text-emerald-600"}`}>{result}</p>}
    </button>
  );
}

function CreateJobModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("EXPORT_METADATA");
  const [description, setDescription] = useState("");
  const [paramsText, setParamsText] = useState("{}");
  const [schedule, setSchedule] = useState("manual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!code.trim() || !name.trim()) { setError("code and name required"); return; }
    let params;
    try { params = JSON.parse(paramsText || "{}"); }
    catch { setError("params must be valid JSON"); return; }

    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/v2/automation/jobs", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, kind, description, params, schedule }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      onCreated();
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setBusy(false); }
  }

  const paramHints: Record<string, string> = {
    EXPORT_METADATA:   "{}",
    RUN_CONSOLIDATION: '{ "scenarioId": "uuid", "entityId": "uuid", "yearCode": "FY2026" }',
    RUN_CALC_RULE:     '{ "ruleId": "uuid" }',
    EXPORT_FACTS:      "{}  (Phase 2)",
    SEND_REPORT:       "{}  (Phase 2)",
    RUN_PIPELINE:      "{}  (Phase 2)",
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" /> New automation job</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code (url-safe)" value={code} onChange={setCode} placeholder="nightly-metadata-dump" />
            <Field label="Name"             value={name} onChange={setName} placeholder="Nightly Metadata Dump" />
          </div>
          <div>
            <label className="text-[10px] uppercase font-semibold text-stone-500 tracking-wide">Kind</label>
            <select value={kind} onChange={e => setKind(e.target.value)}
              className="w-full mt-1 border border-stone-200 rounded p-2 text-sm">
              {Object.entries(KIND_META).map(([k, m]) => (
                <option key={k} value={k}>{m.label} {!m.supported && "(phase 2)"}</option>
              ))}
            </select>
          </div>
          <Field label="Description" value={description} onChange={setDescription} placeholder="What does this job do?" />
          <div>
            <label className="text-[10px] uppercase font-semibold text-stone-500 tracking-wide">Params (JSON)</label>
            <p className="text-[10px] text-stone-400 mb-1 font-mono">Hint: {paramHints[kind]}</p>
            <textarea value={paramsText} onChange={e => setParamsText(e.target.value)} rows={3}
              className="w-full border border-stone-200 rounded p-2 text-xs font-mono focus:outline-none focus:border-amber-400" />
          </div>
          <Field label="Schedule (cron or 'manual')" value={schedule} onChange={setSchedule} placeholder="manual  OR  '0 6 * * *' for daily 6am" />
          {error && <p className="text-xs text-rose-700 bg-rose-50 px-3 py-2 rounded">⚠ {error}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-stone-100">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-xs text-stone-600 hover:bg-stone-100">Cancel</button>
          <button onClick={create} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 disabled:opacity-40">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Create
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (s: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-[10px] uppercase font-semibold text-stone-500 tracking-wide">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full mt-1 border border-stone-200 rounded p-2 text-sm focus:outline-none focus:border-amber-400" />
    </div>
  );
}

function JobDetailDrawer({ job, onClose, onChanged }: { job: Job; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<any>(job);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/v2/automation/jobs?id=${job.id}`, { credentials: "include" })
      .then(r => r.json()).then(j => setDetail(j?.data ?? job));
  }, [job.id]);

  async function toggleEnabled() {
    setBusy(true);
    try {
      await fetch("/api/v2/automation/jobs", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, enabled: !job.enabled }),
      });
      onChanged();
    } finally { setBusy(false); }
  }

  async function del() {
    if (!confirm(`Delete job '${job.name}'? Run history will be removed too.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/v2/automation/jobs?id=${job.id}`, { method: "DELETE", credentials: "include" });
      onChanged();
    } finally { setBusy(false); }
  }

  return (
    <aside className="w-[480px] shrink-0 border-l border-stone-200 bg-white overflow-y-auto">
      <header className="border-b border-stone-200 px-5 py-4 flex items-center justify-between">
        <h3 className="font-bold text-stone-900 truncate">{job.name}</h3>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-lg">×</button>
      </header>
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={toggleEnabled} disabled={busy}
            className={`px-2.5 py-1 rounded text-[11px] font-semibold ${job.enabled ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-700"}`}>
            {job.enabled ? "Disable" : "Enable"}
          </button>
          <button onClick={del} disabled={busy} className="px-2.5 py-1 rounded text-[11px] text-rose-600 hover:bg-rose-50 ml-auto">Delete</button>
        </div>

        <div>
          <label className="text-[10px] uppercase font-semibold text-stone-500 tracking-wide">Kind</label>
          <p className="text-sm text-stone-900 mt-1">{KIND_META[job.kind]?.label ?? job.kind}</p>
        </div>

        <div>
          <label className="text-[10px] uppercase font-semibold text-stone-500 tracking-wide">Params</label>
          <pre className="text-[10px] font-mono bg-stone-50 border border-stone-200 rounded p-3 mt-1 overflow-x-auto">{JSON.stringify(job.params, null, 2)}</pre>
        </div>

        <div>
          <label className="text-[10px] uppercase font-semibold text-stone-500 tracking-wide">Recent runs</label>
          {detail?.runs?.length ? (
            <div className="mt-1 space-y-1">
              {detail.runs.map((r: any) => (
                <div key={r.id} className="text-[11px] flex items-center gap-2 px-2 py-1 rounded border border-stone-100">
                  {r.status === "SUCCEEDED" ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <AlertCircle className="w-3 h-3 text-rose-600" />}
                  <span className="text-stone-600">{new Date(r.startedAt).toLocaleString()}</span>
                  <span className="text-stone-400">·</span>
                  <span className="font-mono text-stone-500">{r.triggeredBy}</span>
                  {r.errorMessage && <span className="text-rose-600 truncate">{r.errorMessage}</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-stone-400 italic mt-1">No runs yet</p>
          )}
        </div>
      </div>
    </aside>
  );
}
