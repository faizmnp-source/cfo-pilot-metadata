"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { CFOHeader } from "@/components/cfo/Header";
import { CFOBadge } from "@/components/cfo/Badge";
import { cn } from "@/lib/utils";
import {
  CLOSE_CATEGORIES,
  CLOSE_CATEGORY_LABELS,
  CLOSE_STATUSES,
} from "@/lib/close-management/default-playbook";
import {
  CheckCircle2, Circle, Clock, AlertCircle, MinusCircle,
  Lock, Unlock, RefreshCw, Calendar,
} from "lucide-react";
import { AiCloseSummaryPanel } from "@/components/close/AiCloseSummaryPanel";

type CloseTask = {
  id: string;
  closeRunId: string;
  dayOffset: number;
  category: string;
  title: string;
  description: string | null;
  status: string;
  owner: string | null;
  dueDate: string | null;
  completedAt: string | null;
  completedBy: string | null;
  notes: string | null;
  autoStatusOrigin: string | null;
  sortOrder: number;
};

type CloseRun = {
  id: string;
  tenantId: string;
  periodCode: string;
  status: string;
  startedAt: string;
  closedAt: string | null;
  createdBy: string;
  closedBy: string | null;
  notes: string | null;
};

type Stats = {
  total: number;
  pending: number;
  inProgress: number;
  done: number;
  blocked: number;
  skipped: number;
  pctComplete: number;
};

const statusConfig: Record<string, { icon: typeof Circle; color: string; badge: "success"|"info"|"neutral"|"danger"; label: string }> = {
  DONE:         { icon: CheckCircle2, color: "text-[var(--color-success-600)]", badge: "success", label: "Done"        },
  IN_PROGRESS:  { icon: Clock,        color: "text-[var(--color-brand-500)]",   badge: "info",    label: "In Progress" },
  PENDING:      { icon: Circle,       color: "text-[var(--text-tertiary)]",     badge: "neutral", label: "Pending"     },
  BLOCKED:      { icon: AlertCircle,  color: "text-[var(--color-danger-500)]",  badge: "danger",  label: "Blocked"     },
  SKIPPED:      { icon: MinusCircle,  color: "text-[var(--text-tertiary)]",     badge: "neutral", label: "Skipped"     },
};

function ProgressRing({ pct }: { pct: number }) {
  const r = 52, c = 2 * Math.PI * r, offset = c - (pct / 100) * c;
  return (
    <svg width="128" height="128" viewBox="0 0 128 128">
      <circle cx="64" cy="64" r={r} fill="none" stroke="#F3F4F6" strokeWidth="10" />
      <circle cx="64" cy="64" r={r} fill="none" stroke="#3B82F6" strokeWidth="10"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 64 64)" style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      <text x="64" y="58" textAnchor="middle" fontSize="22" fontWeight="700" fill="#1A1A1A">{pct}%</text>
      <text x="64" y="76" textAnchor="middle" fontSize="11" fill="#9CA3AF">Complete</text>
    </svg>
  );
}

// Default period = current YYYY M MM
function defaultPeriod() {
  const d = new Date();
  return `${d.getFullYear()}M${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const PERIOD_OPTIONS = (() => {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}M${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
})();

function formatPeriod(p: string) {
  const m = p.match(/^(\d{4})M(\d{1,2})$/);
  if (!m) return p;
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${monthNames[parseInt(m[2]) - 1]} ${m[1]}`;
}

export default function MonthlyClosePage() {
  const [period, setPeriod] = useState(defaultPeriod);
  const [closeRun, setCloseRun] = useState<CloseRun | null>(null);
  const [tasks, setTasks] = useState<CloseTask[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/v2/close-runs?period=${encodeURIComponent(period)}`, { credentials: "include" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? `HTTP ${r.status}`);
      setCloseRun(j.data.closeRun);
      setTasks(j.data.tasks ?? []);
      setStats(j.data.stats);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load close run");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  const updateTaskStatus = useCallback(async (task: CloseTask, nextStatus: string) => {
    if (!closeRun) return;
    setUpdatingId(task.id);
    // Optimistic update.
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: nextStatus } : t));
    try {
      const r = await fetch(`/api/v2/close-runs/${closeRun.id}/tasks/${task.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? `HTTP ${r.status}`);
      // Refresh stats by reloading the run.
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update task");
      void load(); // revert
    } finally {
      setUpdatingId(null);
    }
  }, [closeRun, load]);

  const lockOrReopen = useCallback(async () => {
    if (!closeRun) return;
    const nextStatus = closeRun.status === "LOCKED" ? "REOPENED" : "LOCKED";
    const confirmMsg = nextStatus === "LOCKED"
      ? "Lock this close period? All task edits will be blocked until re-opened."
      : "Re-open this locked close period?";
    if (!window.confirm(confirmMsg)) return;
    try {
      const r = await fetch(`/api/v2/close-runs?id=${closeRun.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? `HTTP ${r.status}`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update close run");
    }
  }, [closeRun, load]);

  const grouped = useMemo(() => {
    return CLOSE_CATEGORIES.map(cat => ({
      category: cat,
      label:    CLOSE_CATEGORY_LABELS[cat] ?? cat,
      tasks:    tasks.filter(t => t.category === cat),
    })).filter(g => g.tasks.length > 0);
  }, [tasks]);

  const locked = closeRun?.status === "LOCKED";

  return (
    <>
      <CFOHeader
        title="Monthly Close"
        subtitle={closeRun
          ? `${formatPeriod(closeRun.periodCode)} · ${closeRun.status}${closeRun.closedAt ? ` · Locked ${new Date(closeRun.closedAt).toLocaleDateString()}` : ""}`
          : `${formatPeriod(period)} · Loading…`}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowPeriodPicker(v => !v)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-[var(--border-default)] hover:bg-[var(--bg-surface-sunken)] transition-colors"
              >
                <Calendar className="w-3.5 h-3.5" />
                {formatPeriod(period)}
              </button>
              {showPeriodPicker && (
                <div className="absolute right-0 top-9 z-40 w-44 rounded-md border border-[var(--border-default)] bg-white shadow-lg overflow-hidden">
                  {PERIOD_OPTIONS.map(p => (
                    <button
                      key={p}
                      onClick={() => { setPeriod(p); setShowPeriodPicker(false); }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-surface-sunken)] transition-colors",
                        p === period && "bg-[var(--bg-surface-sunken)] font-semibold"
                      )}
                    >
                      {formatPeriod(p)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-[var(--border-default)] hover:bg-[var(--bg-surface-sunken)] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              Refresh
            </button>
            {closeRun && (
              <button
                onClick={lockOrReopen}
                className={cn(
                  "flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-white transition-colors",
                  locked
                    ? "bg-[var(--color-warning-600,#d97706)] hover:opacity-90"
                    : "bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)]"
                )}
              >
                {locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                {locked ? "Re-open" : "Lock period"}
              </button>
            )}
          </div>
        }
      />
      <main className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 p-3 rounded-md border border-[var(--color-danger-500)]/30 bg-[var(--color-danger-500)]/5 text-xs text-[var(--color-danger-700,#b91c1c)]">
            {error}
          </div>
        )}
        {locked && (
          <div className="mb-4 p-3 rounded-md border border-[var(--color-warning-500,#f59e0b)]/30 bg-[var(--color-warning-500,#f59e0b)]/5 text-xs text-[var(--text-secondary)]">
            <strong>Period locked.</strong> Click <strong>Re-open</strong> in the header to edit tasks.
          </div>
        )}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
          <div className="xl:col-span-3 space-y-5">
            {loading && grouped.length === 0 && (
              <div className="bg-white rounded-xl border border-[var(--border-default)] p-8 text-center text-xs text-[var(--text-tertiary)]">
                Loading close playbook…
              </div>
            )}
            {!loading && grouped.length === 0 && (
              <div className="bg-white rounded-xl border border-[var(--border-default)] p-8 text-center text-xs text-[var(--text-tertiary)]">
                No tasks yet. The default playbook is seeded on first load — try refreshing.
              </div>
            )}
            {grouped.map(group => (
              <div key={group.category} className="bg-white rounded-xl border border-[var(--border-default)] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-default)] bg-[var(--bg-surface-sunken)]">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{group.label}</h3>
                  <span className="text-xs text-[var(--text-tertiary)]">
                    {group.tasks.filter(t => t.status === "DONE").length}/{group.tasks.length}
                  </span>
                </div>
                <div className="divide-y divide-[var(--border-default)]">
                  {group.tasks.map(task => {
                    const cfg = statusConfig[task.status] ?? statusConfig.PENDING;
                    const Icon = cfg.icon;
                    const isUpdating = updatingId === task.id;
                    return (
                      <div key={task.id} className="px-5 py-3.5 hover:bg-[var(--bg-surface-sunken)] group transition-colors">
                        <div className="flex items-start gap-4">
                          <button
                            onClick={() => {
                              if (locked || isUpdating) return;
                              const next = task.status === "DONE" ? "PENDING" : "DONE";
                              void updateTaskStatus(task, next);
                            }}
                            disabled={locked || isUpdating}
                            className={cn("shrink-0 mt-0.5", !locked && "cursor-pointer hover:scale-110 transition-transform")}
                            title={locked ? "Period locked" : "Toggle done"}
                          >
                            <Icon className={cn(cfg.color, isUpdating && "animate-pulse")} style={{ width: 18, height: 18 }} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "text-sm font-medium",
                              task.status === "DONE"
                                ? "line-through text-[var(--text-tertiary)]"
                                : "text-[var(--text-primary)]",
                            )}>
                              {task.title}
                            </p>
                            {task.description && (
                              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{task.description}</p>
                            )}
                            <p className="text-[10px] text-[var(--text-tertiary)] mt-1 tabular">
                              Day {task.dayOffset >= 0 ? `T+${task.dayOffset}` : `T${task.dayOffset}`}
                              {task.owner && ` · ${task.owner}`}
                              {task.autoStatusOrigin && ` · auto: ${task.autoStatusOrigin}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <CFOBadge variant={cfg.badge}>{cfg.label}</CFOBadge>
                            {!locked && (
                              <select
                                value={task.status}
                                onChange={(e) => void updateTaskStatus(task, e.target.value)}
                                disabled={isUpdating}
                                className="text-[10px] border border-[var(--border-default)] rounded-md px-1.5 py-1 bg-white hover:bg-[var(--bg-surface-sunken)] cursor-pointer disabled:opacity-50"
                              >
                                {CLOSE_STATUSES.map(s => (
                                  <option key={s} value={s}>{statusConfig[s]?.label ?? s}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <AiCloseSummaryPanel
              closeRun={closeRun ? { id: closeRun.id, periodCode: closeRun.periodCode, status: closeRun.status } : null}
              tasks={tasks.map(t => ({ title: t.title, status: t.status, dayOffset: t.dayOffset, category: t.category, owner: t.owner }))}
              stats={stats}
            />
            <div className="bg-white rounded-xl border border-[var(--border-default)] p-5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Close Progress</h3>
              <div className="flex justify-center mb-4">
                <ProgressRing pct={stats?.pctComplete ?? 0} />
              </div>
              <div className="space-y-2">
                {Object.entries(statusConfig).map(([k, v]) => {
                  const count = stats
                    ? k === "DONE"        ? stats.done
                    : k === "IN_PROGRESS" ? stats.inProgress
                    : k === "PENDING"     ? stats.pending
                    : k === "BLOCKED"     ? stats.blocked
                    : k === "SKIPPED"     ? stats.skipped
                    : 0
                    : 0;
                  return (
                    <div key={k} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <v.icon className={cn("w-3.5 h-3.5", v.color)} />
                        <span className="text-xs text-[var(--text-secondary)]">{v.label}</span>
                      </div>
                      <span className="text-xs font-semibold tabular text-[var(--text-primary)]">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[var(--border-default)] p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Close Stats</h3>
              {[
                { label: "Total Tasks",     value: stats?.total ?? 0,     alert: false },
                { label: "Done",            value: stats?.done  ?? 0,     alert: false },
                { label: "Blocked",         value: stats?.blocked ?? 0,   alert: (stats?.blocked ?? 0) > 0 },
                { label: "Period Status",   value: closeRun?.status ?? "—", alert: closeRun?.status === "LOCKED" },
              ].map(({ label, value, alert }) => (
                <div key={label} className="flex justify-between items-center py-1.5 border-b border-[var(--border-default)] last:border-0">
                  <span className="text-xs text-[var(--text-secondary)]">{label}</span>
                  <span className={cn(
                    "text-xs font-semibold tabular",
                    alert ? "text-[var(--color-danger-600)]" : "text-[var(--text-primary)]",
                  )}>{value}</span>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-[var(--border-default)] p-5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">About this close</h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Tasks are seeded from the standard 5-day playbook (T-2 → T+5). Click the icon to toggle Done, or use the dropdown to set Pending / In Progress / Blocked / Skipped. Tasks marked with <strong>auto</strong> will auto-complete when a matching FactRow origin is posted.
              </p>
              {closeRun?.startedAt && (
                <p className="text-[10px] text-[var(--text-tertiary)] mt-3 tabular">
                  Started {new Date(closeRun.startedAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
