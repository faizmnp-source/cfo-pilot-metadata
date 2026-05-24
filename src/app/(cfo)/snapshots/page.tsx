"use client";

// Snapshots — point-in-time backups of fact_rows.
//
// List view + Capture-snapshot modal + per-row detail drawer + soft delete.
// Restore (Origin=Snapshot rematerialisation) ships in a follow-up.

import { useEffect, useState } from "react";
import {
  Camera, Plus, RefreshCw, Loader2, Trash2, FileText, X, Database, ShieldCheck,
} from "lucide-react";

type SnapshotRow = {
  id: string;
  label: string;
  description?: string | null;
  scope: any;
  scenarioCode?: string | null;
  periodHint?: string | null;
  factCount: number;
  payloadBytes: number;
  status: string;
  createdById: string;
  createdAt: string;
  restoredAt?: string | null;
  restoredById?: string | null;
};

export default function SnapshotsPage() {
  const [rows, setRows] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [selected, setSelected] = useState<SnapshotRow | null>(null);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    setLoading(true);
    try {
      const r = await fetch("/api/v2/snapshots", { credentials: "include" });
      const j = await r.json();
      setRows(j?.data?.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function softDelete(id: string) {
    if (!confirm("Soft-delete this snapshot? It will be hidden from the list but the payload is kept.")) return;
    await fetch(`/api/v2/snapshots/${id}`, { method: "DELETE", credentials: "include" });
    refresh();
  }

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden">
      <div className="flex-1 min-w-0 overflow-y-auto">
        <header className="border-b border-stone-200 px-6 py-4 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur z-10">
          <div>
            <h1 className="text-lg font-bold text-stone-900 flex items-center gap-2">
              <Camera className="w-5 h-5 text-amber-600" />
              Snapshots &amp; Backups
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">
              Capture point-in-time copies of fact data. Reviewable, immutable, restore-ready (restore lands in v2).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-stone-600 hover:bg-stone-100">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button
              onClick={() => setShowCapture(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700">
              <Plus className="w-3.5 h-3.5" /> Capture snapshot
            </button>
          </div>
        </header>

        <div className="p-6">
          {rows.length === 0 && !loading && <EmptyState onCreate={() => setShowCapture(true)} />}
          {rows.length > 0 && <SnapshotsTable rows={rows} onSelect={setSelected} onDelete={softDelete} />}
        </div>
      </div>

      {showCapture && (
        <CaptureModal
          onClose={() => setShowCapture(false)}
          onCreated={() => { setShowCapture(false); refresh(); }}
        />
      )}
      {selected && (
        <DetailDrawer
          snapshot={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-gradient-to-br from-amber-50/50 to-stone-50 p-10 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-3">
        <Camera className="w-6 h-6 text-amber-600" />
      </div>
      <h3 className="text-sm font-semibold text-stone-900">No snapshots yet</h3>
      <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
        Capture a point-in-time copy of your fact data before a close, a restate, or a big metadata change.
        Snapshots are stored as immutable payloads with full POV lineage.
      </p>
      <button
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700">
        <Plus className="w-3.5 h-3.5" /> Capture first snapshot
      </button>
    </div>
  );
}

function SnapshotsTable({
  rows, onSelect, onDelete,
}: { rows: SnapshotRow[]; onSelect: (s: SnapshotRow) => void; onDelete: (id: string) => void }) {
  return (
    <div className="rounded-lg border border-stone-200 overflow-hidden bg-white">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 border-b border-stone-200">
          <tr className="text-left text-[11px] uppercase tracking-wider text-stone-500">
            <th className="px-4 py-2 font-semibold">Label</th>
            <th className="px-4 py-2 font-semibold">Scope</th>
            <th className="px-4 py-2 font-semibold text-right">Facts</th>
            <th className="px-4 py-2 font-semibold text-right">Size</th>
            <th className="px-4 py-2 font-semibold">Status</th>
            <th className="px-4 py-2 font-semibold">Created</th>
            <th className="px-4 py-2 font-semibold w-12"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(s => (
            <tr key={s.id} className="border-b border-stone-100 hover:bg-stone-50/60 cursor-pointer"
                onClick={() => onSelect(s)}>
              <td className="px-4 py-2.5">
                <div className="font-medium text-stone-900">{s.label}</div>
                {s.description && <div className="text-xs text-stone-500 truncate max-w-md">{s.description}</div>}
              </td>
              <td className="px-4 py-2.5 text-xs text-stone-600">
                {s.scenarioCode && <span className="inline-block px-1.5 py-0.5 rounded bg-stone-100 mr-1">{s.scenarioCode}</span>}
                {s.periodHint && <span className="inline-block px-1.5 py-0.5 rounded bg-stone-100">{s.periodHint}</span>}
                {!s.scenarioCode && !s.periodHint && <span className="text-stone-400">full tenant</span>}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-xs">{s.factCount.toLocaleString()}</td>
              <td className="px-4 py-2.5 text-right font-mono text-xs text-stone-500">{formatBytes(s.payloadBytes)}</td>
              <td className="px-4 py-2.5">
                <StatusBadge status={s.status} />
              </td>
              <td className="px-4 py-2.5 text-xs text-stone-500">{new Date(s.createdAt).toLocaleString()}</td>
              <td className="px-4 py-2.5 text-right">
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                  className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                  title="Soft-delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    READY:    "bg-emerald-100 text-emerald-700",
    RESTORED: "bg-sky-100 text-sky-700",
    DELETED:  "bg-stone-200 text-stone-600",
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${map[status] ?? "bg-stone-100 text-stone-600"}`}>
      {status}
    </span>
  );
}

function CaptureModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [scenarioCode, setScenarioCode] = useState("");
  const [periodCodes, setPeriodCodes] = useState("");
  const [entityCodes, setEntityCodes] = useState("");
  const [accountCodes, setAccountCodes] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const scope: any = {};
      if (scenarioCode.trim()) scope.scenarioCode = scenarioCode.trim();
      if (periodCodes.trim())  scope.periodCodes  = periodCodes.split(",").map(s => s.trim()).filter(Boolean);
      if (entityCodes.trim())  scope.entityCodes  = entityCodes.split(",").map(s => s.trim()).filter(Boolean);
      if (accountCodes.trim()) scope.accountCodes = accountCodes.split(",").map(s => s.trim()).filter(Boolean);

      const r = await fetch("/api/v2/snapshots", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, description: description || undefined, scope }),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setErr(j?.error ?? `HTTP ${r.status}`);
        return;
      }
      onCreated();
    } catch (e: any) {
      setErr(e?.message ?? "Capture failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
            <Camera className="w-4 h-4 text-amber-600" /> Capture snapshot
          </h2>
          <button type="button" onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <Field label="Label" required>
          <input
            type="text" value={label} onChange={e => setLabel(e.target.value)} required maxLength={120}
            placeholder="e.g. Q1 2026 close — pre-restate"
            className="w-full px-3 py-2 rounded-md border border-stone-300 text-sm focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500" />
        </Field>
        <Field label="Description (optional)">
          <textarea
            value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={500}
            placeholder="Why are you taking this snapshot? Helpful for audit later."
            className="w-full px-3 py-2 rounded-md border border-stone-300 text-sm focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500" />
        </Field>

        <div className="border-t border-stone-200 pt-3">
          <p className="text-xs text-stone-500 mb-2">
            <strong>Scope filters</strong> — leave blank to snapshot the full tenant.
            Comma-separated member codes. Max 50,000 rows per snapshot.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Scenario code">
              <input
                type="text" value={scenarioCode} onChange={e => setScenarioCode(e.target.value)}
                placeholder="ACTUAL"
                className="w-full px-3 py-1.5 rounded-md border border-stone-300 text-sm" />
            </Field>
            <Field label="Period codes (any)">
              <input
                type="text" value={periodCodes} onChange={e => setPeriodCodes(e.target.value)}
                placeholder="FY2026, 2026Q1, 2026-04"
                className="w-full px-3 py-1.5 rounded-md border border-stone-300 text-sm" />
            </Field>
            <Field label="Entity codes">
              <input
                type="text" value={entityCodes} onChange={e => setEntityCodes(e.target.value)}
                placeholder="US_HQ, UK_OPS"
                className="w-full px-3 py-1.5 rounded-md border border-stone-300 text-sm" />
            </Field>
            <Field label="Account codes">
              <input
                type="text" value={accountCodes} onChange={e => setAccountCodes(e.target.value)}
                placeholder="REVENUE, COGS"
                className="w-full px-3 py-1.5 rounded-md border border-stone-300 text-sm" />
            </Field>
          </div>
        </div>

        {err && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-md">{err}</div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs text-stone-600 hover:bg-stone-100">
            Cancel
          </button>
          <button type="submit" disabled={loading || !label.trim()}
            className="px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50 inline-flex items-center gap-1.5">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            Capture
          </button>
        </div>
      </form>
    </div>
  );
}

function DetailDrawer({ snapshot, onClose }: { snapshot: SnapshotRow; onClose: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/v2/snapshots/${snapshot.id}?preview=25`, { credentials: "include" });
        const j = await r.json();
        setDetail(j?.data ?? null);
      } finally { setLoading(false); }
    })();
  }, [snapshot.id]);

  const preview = detail?.payloadPreview ?? [];

  return (
    <div className="fixed inset-0 z-20 bg-black/30 flex justify-end" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl">
        <header className="border-b border-stone-200 px-6 py-4 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-600" />
              {snapshot.label}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">{snapshot.description ?? "No description"}</p>
          </div>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Facts captured" value={snapshot.factCount.toLocaleString()} icon={Database} />
            <Stat label="Payload size" value={formatBytes(snapshot.payloadBytes)} icon={ShieldCheck} />
            <Stat label="Status" value={snapshot.status} icon={Camera} />
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Scope</h3>
            <pre className="text-xs bg-stone-50 border border-stone-200 rounded-md p-3 overflow-x-auto">
{JSON.stringify(snapshot.scope ?? {}, null, 2)}
            </pre>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
              Payload preview ({preview.length} of {snapshot.factCount} rows)
            </h3>
            {loading && <Loader2 className="w-4 h-4 animate-spin text-stone-400" />}
            {!loading && preview.length === 0 && <p className="text-xs text-stone-400">No rows.</p>}
            {!loading && preview.length > 0 && (
              <div className="rounded-md border border-stone-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-stone-50 border-b border-stone-200">
                    <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500">
                      <th className="px-2 py-1.5">Scenario</th>
                      <th className="px-2 py-1.5">Period</th>
                      <th className="px-2 py-1.5">Entity</th>
                      <th className="px-2 py-1.5">Account</th>
                      <th className="px-2 py-1.5 text-right">Value (txn)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r: any, i: number) => (
                      <tr key={i} className="border-b border-stone-100">
                        <td className="px-2 py-1 font-mono text-[11px]">{r.scenarioCode ?? "—"}</td>
                        <td className="px-2 py-1 font-mono text-[11px]">{r.periodCode ?? "—"}</td>
                        <td className="px-2 py-1 font-mono text-[11px]">{r.entityCode ?? "—"}</td>
                        <td className="px-2 py-1 font-mono text-[11px]">{r.accountCode ?? "—"}</td>
                        <td className="px-2 py-1 text-right font-mono text-[11px]">{Number(r.valueTxn).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-md border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600 space-y-1">
            <p><strong>Snapshot ID:</strong> <span className="font-mono">{snapshot.id}</span></p>
            <p><strong>Created:</strong> {new Date(snapshot.createdAt).toLocaleString()}</p>
            <p className="text-stone-400 italic">Restore (Origin=Snapshot rematerialisation) ships in the next release.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-stone-700 mb-1">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="rounded-lg border border-stone-200 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-stone-500">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="text-base font-bold text-stone-900 mt-0.5">{value}</div>
    </div>
  );
}

function formatBytes(n: number) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
