"use client";
import { CFOHeader } from "@/components/cfo/Header";
import { CFOBadge } from "@/components/cfo/Badge";
import { closeTasks, activityFeed } from "@/lib/cfo-data";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Clock, AlertCircle, ChevronRight, Plus } from "lucide-react";

const statusConfig = {
  "complete":    { icon: CheckCircle2, color: "text-[var(--color-success-600)]", badge: "success" as const, label: "Complete"     },
  "in-progress": { icon: Clock,        color: "text-[var(--color-brand-500)]",   badge: "info"    as const, label: "In Progress"  },
  "not-started": { icon: Circle,       color: "text-[var(--text-tertiary)]",     badge: "neutral" as const, label: "Not Started"  },
  "blocked":     { icon: AlertCircle,  color: "text-[var(--color-danger-500)]",  badge: "danger"  as const, label: "Blocked"      },
};

const categories = ["Reconciliation", "Revenue", "Journal Entries", "Consolidation", "Review"];

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

export default function MonthlyClosePage() {
  const done = closeTasks.filter(t => t.status === "complete").length;
  const pct = Math.round((done / closeTasks.length) * 100);

  return (
    <>
      <CFOHeader title="Monthly Close" subtitle="May 2026 · Due May 26"
        actions={
          <button className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-700)] transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add Task
          </button>
        }
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
          <div className="xl:col-span-3 space-y-5">
            {categories.map(cat => {
              const tasks = closeTasks.filter(t => t.category === cat);
              if (!tasks.length) return null;
              return (
                <div key={cat} className="bg-white rounded-xl border border-[var(--border-default)] overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-default)] bg-[var(--bg-surface-sunken)]">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{cat}</h3>
                    <span className="text-xs text-[var(--text-tertiary)]">{tasks.filter(t => t.status === "complete").length}/{tasks.length}</span>
                  </div>
                  <div className="divide-y divide-[var(--border-default)]">
                    {tasks.map(task => {
                      const cfg = statusConfig[task.status as keyof typeof statusConfig];
                      const Icon = cfg.icon;
                      return (
                        <div key={task.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--bg-surface-sunken)] cursor-pointer group transition-colors">
                          <Icon className={cn("shrink-0", cfg.color)} style={{ width: 18, height: 18 }} />
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-sm font-medium", task.status === "complete" ? "line-through text-[var(--text-tertiary)]" : "text-[var(--text-primary)]")}>{task.title}</p>
                            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{task.owner} · Due {task.dueDate}</p>
                          </div>
                          <CFOBadge variant={cfg.badge}>{cfg.label}</CFOBadge>
                          <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-[var(--border-default)] p-5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Close Progress</h3>
              <div className="flex justify-center mb-4"><ProgressRing pct={pct} /></div>
              <div className="space-y-2">
                {Object.entries(statusConfig).map(([k, v]) => {
                  const count = closeTasks.filter(t => t.status === k).length;
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
                { label: "Days Remaining",       value: "6",        alert: false },
                { label: "Overdue Tasks",         value: "0",        alert: false },
                { label: "Blocked Tasks",         value: "1",        alert: true  },
                { label: "Avg. Completion Time",  value: "~2.3 days",alert: false },
              ].map(({ label, value, alert }) => (
                <div key={label} className="flex justify-between items-center py-1.5 border-b border-[var(--border-default)] last:border-0">
                  <span className="text-xs text-[var(--text-secondary)]">{label}</span>
                  <span className={cn("text-xs font-semibold tabular", alert ? "text-[var(--color-danger-600)]" : "text-[var(--text-primary)]")}>{value}</span>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-[var(--border-default)] p-5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Recent Activity</h3>
              <div className="space-y-3">
                {activityFeed.map(a => (
                  <div key={a.id} className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-white font-bold text-[9px]">{a.avatar}</span>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-primary)]">
                        <span className="font-medium">{a.user}</span> {a.action} <span className="text-[var(--color-brand-600)]">{a.task}</span>
                      </p>
                      <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{a.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
