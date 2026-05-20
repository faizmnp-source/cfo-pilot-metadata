"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Calendar, ChevronDown } from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { AuditLogTable, AuditLogEntry } from "@/components/metadata/AuditLogTable";

const DIMENSION_TYPES = [
  { value: "", label: "All Dimensions" },
  { value: "ACCOUNT", label: "Accounts" },
  { value: "ENTITY", label: "Entities" },
  { value: "DEPARTMENT", label: "Departments" },
  { value: "COST_CENTER", label: "Cost Centers" },
];

const DATE_RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last year" },
];

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [dimensionFilter, setDimensionFilter] = useState("");
  const [dateRange, setDateRange] = useState("30");
  const PAGE_SIZE = 25;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        days: dateRange,
      });
      if (dimensionFilter) params.set("dimensionType", dimensionFilter);

      const res = await fetch(`/api/metadata/audit-logs?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLogs(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      toast.error("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [page, dimensionFilter, dateRange]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleExport = () => {
    const rows = [
      ["timestamp", "action", "dimension", "recordCode", "recordName", "user", "email"],
      ...logs.map((l) => [
        l.createdAt,
        l.action,
        l.dimensionType,
        l.recordCode ?? "",
        l.recordName ?? "",
        l.userName ?? "",
        l.userEmail ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <MetadataHeader
        title="Audit Logs"
        subtitle={`${total.toLocaleString()} events`}
        onExport={handleExport}
        onRefresh={fetchLogs}
        showSearch={false}
        actions={
          <div className="flex items-center gap-2">
            {/* Dimension filter */}
            <div className="relative">
              <select
                value={dimensionFilter}
                onChange={(e) => { setDimensionFilter(e.target.value); setPage(1); }}
                className="h-8 appearance-none rounded-md border border-input bg-white px-3 pr-7 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
              >
                {DIMENSION_TYPES.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            </div>

            {/* Date range */}
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <select
                value={dateRange}
                onChange={(e) => { setDateRange(e.target.value); setPage(1); }}
                className="h-8 appearance-none rounded-md border border-input bg-white pl-7 pr-7 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
              >
                {DATE_RANGES.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        }
      />

      <main className="flex-1 overflow-y-auto bg-background p-6">
        {/* Summary stats */}
        <div className="mb-6 grid grid-cols-4 gap-3">
          {[
            { label: "Total Events", value: total, color: "text-foreground" },
            { label: "Creates", value: logs.filter((l) => l.action === "CREATE").length, color: "text-green-700" },
            { label: "Updates", value: logs.filter((l) => l.action === "UPDATE").length, color: "text-blue-700" },
            { label: "Deletes", value: logs.filter((l) => l.action === "DELETE").length, color: "text-red-700" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-white p-4">
              <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        <AuditLogTable
          logs={logs}
          loading={loading}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </main>
    </>
  );
}
