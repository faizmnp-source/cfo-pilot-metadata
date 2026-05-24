"use client";

// Calc Rules — vibe-coded calculation rules.
//
// Layout: rule list + "Create with AI" button → modal where user types
// natural language; AI generates a spec; user reviews + promotes to ACTIVE
// → can run.

import { useEffect, useState } from "react";
import { Sparkles, Plus, Play, Loader2, CheckCircle2, AlertCircle, Pencil, FileText, ChevronRight, RefreshCw } from "lucide-react";

type Rule = {
  id: string; code: string; name: string; description?: string;
  spec: any; kind: string; status: string; source: string;
  vibePrompt?: string; vibeModel?: string;
  createdAt: string; updatedAt: string;
  lastRunAt?: string; runCount: number;
  _count?: { runs: number };
};

export default function CalcRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [showVibe, setShowVibe] = useState(false);
  const [selected, setSelected] = useState<Rule | null>(null);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/v2/calc-rules", { credentials: "include" });
      const j = await r.json();
      setRules(j?.data?.data ?? []);
    } finally { setLoading(false); }
  }

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden">
      <div className="flex-1 min-w-0 overflow-y-auto">
        <header className="border-b border-stone-200 px-6 py-4 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur z-10">
          <div>
            <h1 className="text-lg font-bold text-stone-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-600" />
              Calc Rules
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">Vibe-code calculations in plain English. AI generates the spec, you review, the engine runs it deterministically.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} disabled={loading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-stone-600 hover:bg-stone-100">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button onClick={() => setShowVibe(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700">
              <Sparkles className="w-3.5 h-3.5" /> Create with AI
            </button>
          </div>
        </header>

        <div className="p-6">
          {rules.length === 0 && !loading && <EmptyState onCreate={() => setShowVibe(true)} />}
          {rules.length > 0 && (
            <div className="grid grid-cols-1 gap-2">
              {rules.map(rule => (
                <RuleCard key={rule.id} rule={rule} onSelect={() => setSelected(rule)} onChanged={refresh} />
              ))}
            </div>
          )}
        </div>
      </div>

      {selected && <RuleDetailDrawer rule={selected} onClose={() => setSelected(null)} onChanged={() => { refresh(); setSelected(null); }} />}
      {showVibe && <VibeCreateModal onClose={() => setShowVibe(false)} onCreated={r => { setShowVibe(false); refresh(); setSelected(r); }} />}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="max-w-md mx-auto py-10 text-center">
      <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 items-center justify-center mb-4 shadow-lg shadow-violet-200/60">
        <Sparkles className="w-6 h-6 text-white" />
      </div>
      <h2 className="text-lg font-bold text-stone-900 mb-1">No calc rules yet</h2>
      <p className="text-sm text-stone-500 mb-5">Describe a calculation in plain English. AI generates a structured rule. You review, you run.</p>
      <button onClick={onCreate}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700">
        <Sparkles className="w-4 h-4" /> Create your first rule with AI
      </button>
      <div className="mt-6 text-left text-xs text-stone-500 bg-stone-50 rounded-lg p-4 border border-stone-200">
        <p className="font-semibold mb-2 text-stone-700">Try prompts like:</p>
        <ul className="space-y-1.5">
          <li>• "Apply 10% Indian tax on US_HQ revenue accounts for FY2026 actuals"</li>
          <li>• "Allocate IT_OVERHEAD account to all entities by headcount"</li>
          <li>• "Sum all marketing expenses (account prefix 612) into TOTAL_MARKETING"</li>
          <li>• "Convert UK_OPS local-currency facts to USD using FY2026 average rates"</li>
        </ul>
      </div>
    </div>
  );
}

function RuleCard({ rule, onSelect, onChanged }: { rule: Rule; onSelect: () => void; onChanged: () => void }) {
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  async function runNow(e: React.MouseEvent) {
    e.stopPropagation();
    setRunning(true); setRunResult(null);
    try {
      const r = await fetch(`/api/v2/calc-rules/${rule.id}/run`, { method: "POST", credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setRunResult(j?.data?.message ?? "Done");
      onChanged();
    } catch (e: any) {
      setRunResult(`❌ ${e.message}`);
    } finally { setRunning(false); }
  }

  const statusColor = {
    DRAFT:    "bg-amber-100 text-amber-800",
    ACTIVE:   "bg-emerald-100 text-emerald-800",
    DISABLED: "bg-stone-200 text-stone-600",
    ARCHIVED: "bg-stone-100 text-stone-500",
  }[rule.status] ?? "bg-stone-100";

  return (
    <button onClick={onSelect}
      className="w-full text-left bg-white rounded-lg border border-stone-200 hover:border-violet-300 hover:shadow-sm p-4 transition group">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm font-semibold text-stone-900 truncate">{rule.name}</h3>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusColor}`}>{rule.status}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-violet-50 text-violet-700">{rule.kind}</span>
            {rule.source === "vibe" && <span className="text-[10px] text-violet-500 inline-flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" />vibe</span>}
          </div>
          <p className="text-xs text-stone-600 line-clamp-1">{rule.description ?? "—"}</p>
          <p className="text-[10px] text-stone-400 mt-1 font-mono">{rule.code} · {rule.runCount} runs{rule.lastRunAt && ` · last ${new Date(rule.lastRunAt).toLocaleString()}`}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {rule.status === "ACTIVE" && (
            <button onClick={runNow} disabled={running}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
              {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Run
            </button>
          )}
          <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-violet-500" />
        </div>
      </div>
      {runResult && <p className={`text-[11px] mt-1 ${runResult.startsWith("❌") ? "text-rose-600" : "text-emerald-600"}`}>{runResult}</p>}
    </button>
  );
}

function VibeCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (r: Rule) => void }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!prompt.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/v2/calc-rules/vibe-create", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      onCreated(j.data.rule);
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-violet-600" /> Vibe a new calc rule
        </h2>
        <p className="text-xs text-stone-500 mb-4">Describe the calculation. AI builds the spec. You review + activate.</p>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={5}
          placeholder="e.g. Apply 10% Indian tax on US_HQ revenue accounts for FY2026 actuals"
          className="w-full border border-stone-200 rounded-lg p-3 text-sm focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100"
        />
        {error && <p className="mt-2 text-xs text-rose-700 bg-rose-50 px-3 py-2 rounded">⚠ {error}</p>}
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-xs text-stone-600 hover:bg-stone-100">Cancel</button>
          <button onClick={generate} disabled={busy || !prompt.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-40">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Generate spec
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleDetailDrawer({ rule, onClose, onChanged }: { rule: Rule; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(newStatus: string) {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/v2/calc-rules", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, status: newStatus }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      onChanged();
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setBusy(false); }
  }

  async function del() {
    if (!confirm(`Delete rule '${rule.name}'? Run history will also be removed.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/v2/calc-rules?id=${rule.id}`, { method: "DELETE", credentials: "include" });
      onChanged();
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setBusy(false); }
  }

  return (
    <aside className="w-[480px] shrink-0 border-l border-stone-200 bg-white overflow-y-auto">
      <header className="border-b border-stone-200 px-5 py-4 flex items-center justify-between">
        <h3 className="font-bold text-stone-900 truncate">{rule.name}</h3>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-lg">×</button>
      </header>
      <div className="p-5 space-y-4">
        <div>
          <label className="text-[10px] uppercase font-semibold text-stone-500 tracking-wide">Status</label>
          <div className="flex items-center gap-1.5 mt-1">
            {["DRAFT", "ACTIVE", "DISABLED", "ARCHIVED"].map(s => (
              <button key={s} onClick={() => setStatus(s)} disabled={busy || rule.status === s}
                className={`px-2 py-1 rounded text-[11px] font-semibold ${
                  rule.status === s ? "bg-violet-600 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                } disabled:opacity-60`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {rule.vibePrompt && (
          <div>
            <label className="text-[10px] uppercase font-semibold text-stone-500 tracking-wide">Original vibe prompt</label>
            <p className="text-xs italic text-stone-600 bg-violet-50/50 border border-violet-100 rounded px-3 py-2 mt-1">"{rule.vibePrompt}"</p>
            <p className="text-[10px] text-stone-400 mt-1">Generated by {rule.vibeModel}</p>
          </div>
        )}

        <div>
          <label className="text-[10px] uppercase font-semibold text-stone-500 tracking-wide">Description</label>
          <p className="text-sm text-stone-700 mt-1">{rule.description ?? "—"}</p>
        </div>

        <div>
          <label className="text-[10px] uppercase font-semibold text-stone-500 tracking-wide">Spec (JSON)</label>
          <pre className="text-[10px] font-mono bg-stone-50 border border-stone-200 rounded p-3 mt-1 overflow-x-auto">{JSON.stringify(rule.spec, null, 2)}</pre>
        </div>

        {error && <p className="text-xs text-rose-700 bg-rose-50 px-3 py-2 rounded">⚠ {error}</p>}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
          <button onClick={del} disabled={busy} className="px-3 py-1.5 rounded text-[11px] text-rose-600 hover:bg-rose-50">Delete</button>
        </div>
      </div>
    </aside>
  );
}
