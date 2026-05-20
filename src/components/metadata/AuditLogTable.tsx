"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  User,
  Calendar,
  Tag,
  Activity,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface AuditLogEntry {
  id: string;
  action: string;
  dimensionType: string;
  recordId: string;
  recordCode?: string;
  recordName?: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  changedFields?: string[];
  ipAddress?: string;
  createdAt: string;
}

interface AuditLogTableProps {
  logs: AuditLogEntry[];
  loading?: boolean;
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
}

const ACTION_CONFIG: Record<string, { color: string; label: string }> = {
  CREATE: { color: "bg-green-100 text-green-700", label: "Created" },
  UPDATE: { color: "bg-blue-100 text-blue-700", label: "Updated" },
  DELETE: { color: "bg-red-100 text-red-700", label: "Deleted" },
  IMPORT: { color: "bg-purple-100 text-purple-700", label: "Imported" },
  EXPORT: { color: "bg-amber-100 text-amber-700", label: "Exported" },
  RESTORE: { color: "bg-teal-100 text-teal-700", label: "Restored" },
  LOGIN: { color: "bg-gray-100 text-gray-700", label: "Login" },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
  };
}

function FieldDiff({
  field,
  oldVal,
  newVal,
}: {
  field: string;
  oldVal: unknown;
  newVal: unknown;
}) {
  const fmt = (v: unknown) => {
    if (v === null || v === undefined) return <span className="italic text-muted-foreground">null</span>;
    if (typeof v === "boolean") return <span className={v ? "text-green-600" : "text-red-600"}>{String(v)}</span>;
    return <span>{String(v)}</span>;
  };

  return (
    <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/30 px-3 py-2 text-xs">
      <div>
        <span className="font-mono font-medium text-foreground">{field}</span>
      </div>
      <div className="text-red-600 line-through">{fmt(oldVal)}</div>
      <div className="text-green-600">{fmt(newVal)}</div>
    </div>
  );
}

function LogRow({ log }: { log: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const actionCfg = ACTION_CONFIG[log.action] ?? { color: "bg-muted text-muted-foreground", label: log.action };
  const { date, time } = formatDate(log.createdAt);
  const hasDetails =
    log.changedFields?.length ||
    log.oldValue ||
    log.newValue;

  return (
    <>
      <tr
        className={cn(
          "bg-white transition-colors",
          hasDetails && "cursor-pointer hover:bg-muted/20"
        )}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <td className="px-4 py-3">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-foreground">{date}</span>
            <span className="text-xs text-muted-foreground">{time}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
              actionCfg.color
            )}
          >
            {actionCfg.label}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
            {log.dimensionType}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-col">
            {log.recordCode && (
              <span className="font-mono text-xs text-muted-foreground">
                [{log.recordCode}]
              </span>
            )}
            {log.recordName && (
              <span className="text-sm text-foreground">{log.recordName}</span>
            )}
            {!log.recordCode && !log.recordName && (
              <span className="font-mono text-xs text-muted-foreground">
                {log.recordId.slice(0, 8)}...
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-col">
            <span className="text-sm text-foreground">{log.userName ?? "Unknown"}</span>
            {log.userEmail && (
              <span className="text-xs text-muted-foreground">{log.userEmail}</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          {log.changedFields?.length ? (
            <div className="flex flex-wrap gap-1">
              {log.changedFields.slice(0, 3).map((f) => (
                <code key={f} className="rounded bg-muted px-1 text-[10px] font-mono text-muted-foreground">
                  {f}
                </code>
              ))}
              {log.changedFields.length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  +{log.changedFields.length - 3}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          {hasDetails && (
            expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )
          )}
        </td>
      </tr>

      {/* Expanded diff */}
      {expanded && hasDetails && (
        <tr className="bg-muted/10">
          <td colSpan={7} className="px-6 pb-3 pt-1">
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Changes
              </p>
              {log.action === "CREATE" && log.newValue && (
                <div className="space-y-1">
                  <div className="grid grid-cols-3 gap-2 px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase">
                    <span>Field</span>
                    <span>Before</span>
                    <span>After</span>
                  </div>
                  {Object.entries(log.newValue).map(([k, v]) => (
                    <FieldDiff key={k} field={k} oldVal={null} newVal={v} />
                  ))}
                </div>
              )}
              {log.action === "UPDATE" && log.changedFields && log.oldValue && log.newValue && (
                <div className="space-y-1">
                  <div className="grid grid-cols-3 gap-2 px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase">
                    <span>Field</span>
                    <span>Before</span>
                    <span>After</span>
                  </div>
                  {log.changedFields.map((f) => (
                    <FieldDiff
                      key={f}
                      field={f}
                      oldVal={(log.oldValue as Record<string, unknown>)[f]}
                      newVal={(log.newValue as Record<string, unknown>)[f]}
                    />
                  ))}
                </div>
              )}
              {log.action === "DELETE" && log.oldValue && (
                <div className="space-y-1">
                  <p className="text-xs text-red-600">Record deleted. Snapshot at time of deletion:</p>
                  <pre className="mt-2 overflow-x-auto rounded bg-red-50 p-3 text-[11px] font-mono text-red-800">
                    {JSON.stringify(log.oldValue, null, 2)}
                  </pre>
                </div>
              )}
              {log.ipAddress && (
                <p className="mt-2 text-xs text-muted-foreground">
                  IP: {log.ipAddress}
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded bg-muted animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

export function AuditLogTable({
  logs,
  loading = false,
  total = 0,
  page = 1,
  pageSize = 25,
  onPageChange,
}: AuditLogTableProps) {
  const [actionFilter, setActionFilter] = useState("all");

  const actions = ["all", "CREATE", "UPDATE", "DELETE", "IMPORT", "EXPORT"];
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="flex gap-1">
          {actions.map((a) => (
            <button
              key={a}
              onClick={() => setActionFilter(a)}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                actionFilter === a
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {a === "all" ? "All" : a.charAt(0) + a.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {["Timestamp", "Action", "Dimension", "Record", "User", "Changed Fields", ""].map((h, i) => (
                <th
                  key={i}
                  className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  No audit log entries found
                </td>
              </tr>
            ) : (
              logs
                .filter((l) => actionFilter === "all" || l.action === actionFilter)
                .map((log) => <LogRow key={log.id} log={log} />)
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {total} total entries
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange?.(page - 1)}
              disabled={page <= 1}
              className="h-7 rounded border border-input px-2 text-xs text-muted-foreground disabled:opacity-40 hover:enabled:bg-muted transition-colors"
            >
              ← Prev
            </button>
            <button
              onClick={() => onPageChange?.(page + 1)}
              disabled={page >= totalPages}
              className="h-7 rounded border border-input px-2 text-xs text-muted-foreground disabled:opacity-40 hover:enabled:bg-muted transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
