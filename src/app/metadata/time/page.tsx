"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { LayoutList, GitBranch, X } from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { DimensionTable, Column } from "@/components/metadata/DimensionTable";
import { AddMemberDialog } from "@/components/metadata/v2/AddMemberDialog";
import { cn } from "@/lib/utils";

interface TimePoint {
  id: string;
  code: string;
  name: string;
  periodType: string;
  fiscalYear: number;
  fiscalPeriod: number | null;
  startDate: string;
  endDate: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

const PERIOD_COLORS: Record<string, string> = {
  YEAR: "bg-blue-100 text-blue-700",
  QUARTER: "bg-purple-100 text-purple-700",
  MONTH: "bg-green-100 text-green-700",
  WEEK: "bg-amber-100 text-amber-700",
  DAY: "bg-gray-100 text-gray-700",
};

const PERIOD_TYPES = ["YEAR", "QUARTER", "MONTH", "WEEK", "DAY"];

type Tab = "table" | "tree";

const COLUMNS: Column<TimePoint>[] = [
  {
    key: "code",
    label: "Code",
    sortable: true,
    render: (row) => (
      <code className="font-mono text-xs font-medium text-foreground">{row.code}</code>
    ),
  },
  { key: "name", label: "Period Name", sortable: true },
  {
    key: "periodType",
    label: "Type",
    render: (row) => (
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
          PERIOD_COLORS[row.periodType] ?? "bg-muted text-muted-foreground"
        )}
      >
        {row.periodType}
      </span>
    ),
  },
  {
    key: "fiscalYear",
    label: "Fiscal Year",
    sortable: true,
    render: (row) => <span className="tabular-nums">{row.fiscalYear}</span>,
  },
  {
    key: "fiscalPeriod",
    label: "Period #",
    render: (row) =>
      row.fiscalPeriod != null ? (
        <span className="tabular-nums">{row.fiscalPeriod}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "startDate",
    label: "Start Date",
    sortable: true,
    render: (row) => (
      <span className="tabular-nums text-xs">
        {row.startDate ? new Date(row.startDate).toLocaleDateString() : "—"}
      </span>
    ),
  },
  {
    key: "endDate",
    label: "End Date",
    render: (row) => (
      <span className="tabular-nums text-xs">
        {row.endDate ? new Date(row.endDate).toLocaleDateString() : "—"}
      </span>
    ),
  },
  {
    key: "isActive",
    label: "Status",
    render: (row) => (
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[10px] font-medium",
          row.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
        )}
      >
        {row.isActive ? "Active" : "Inactive"}
      </span>
    ),
  },
];

const EMPTY_FORM = {
  code: "",
  name: "",
  periodType: "MONTH",
  fiscalYear: new Date().getFullYear(),
  fiscalPeriod: "" as string | number,
  startDate: "",
  endDate: "",
  sortOrder: 0,
  isActive: true,
};

function buildTreeRows(
  items: TimePoint[],
  parentId: string | null = null,
  depth = 0
): Array<TimePoint & { depth: number }> {
  return items
    .filter((i) => i.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((item) => [
      { ...item, depth },
      ...buildTreeRows(items, item.id, depth + 1),
    ]);
}

export default function TimePage() {
  const [tab, setTab] = useState<Tab>("table");
  const [timePoints, setTimePoints] = useState<TimePoint[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("fiscalYear");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [v2DialogOpen, setV2DialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<TimePoint | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const PAGE_SIZE = 20;

  const fetchTimePoints = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        search,
        sortBy: sortKey,
        sortDir,
      });
      const res = await fetch(`/api/metadata/time?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTimePoints(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      // API migration pending — fall back to time periods generated via
      // Settings → Time Periods Auto-Generate (stored in localStorage).
      try {
        const raw = typeof window !== "undefined" ? window.localStorage.getItem("cfo_pilot_time_periods") : null;
        if (raw) {
          const periods = JSON.parse(raw) as Array<{
            code: string; name: string; type: string; fiscalYear: number;
            startDate: string; endDate: string; parentCode: string | null;
            monthIndex?: number; quarterIndex?: number;
          }>;
          const mapped: TimePoint[] = periods.map((p, i) => ({
            id: `local-${p.code}`,
            code: p.code,
            name: p.name,
            periodType: p.type,
            fiscalYear: p.fiscalYear,
            fiscalPeriod: p.monthIndex != null ? p.monthIndex + 1 : (p.quarterIndex ?? null),
            startDate: p.startDate,
            endDate: p.endDate,
            parentId: null,
            sortOrder: i,
            isActive: true,
            createdAt: new Date().toISOString(),
          }));
          setTimePoints(mapped);
          setTotal(mapped.length);
          toast.success(`Loaded ${mapped.length} periods from Settings (browser cache).`);
          return;
        }
      } catch { /* ignore */ }
      toast.error("Failed to load time periods. Go to Settings → Time Periods Auto-Generate to seed them.");
    } finally {
      setLoading(false);
    }
  }, [page, search, sortKey, sortDir]);

  useEffect(() => {
    fetchTimePoints();
  }, [fetchTimePoints]);

  const openAdd = () => {
    setEditRecord(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (row: TimePoint) => {
    setEditRecord(row);
    setForm({
      code: row.code,
      name: row.name,
      periodType: row.periodType,
      fiscalYear: row.fiscalYear,
      fiscalPeriod: row.fiscalPeriod ?? "",
      startDate: row.startDate ? row.startDate.slice(0, 10) : "",
      endDate: row.endDate ? row.endDate.slice(0, 10) : "",
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = editRecord
        ? `/api/metadata/time/${editRecord.id}`
        : "/api/metadata/time";
      const method = editRecord ? "PUT" : "POST";
      const payload = {
        ...form,
        fiscalYear: Number(form.fiscalYear),
        fiscalPeriod: form.fiscalPeriod !== "" ? Number(form.fiscalPeriod) : null,
        sortOrder: Number(form.sortOrder),
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Save failed");
      }
      toast.success(editRecord ? "Time period updated" : "Time period created");
      setFormOpen(false);
      fetchTimePoints();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: TimePoint) => {
    if (!confirm(`Delete time period [${row.code}] ${row.name}?`)) return;
    const res = await fetch(`/api/metadata/time/${row.id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? "Delete failed");
    } else {
      toast.success("Time period deleted");
      fetchTimePoints();
    }
  };

  const handleExport = () => {
    const rows = [
      ["code", "name", "periodType", "fiscalYear", "fiscalPeriod", "startDate", "endDate", "isActive"],
      ...timePoints.map((t) => [
        t.code,
        t.name,
        t.periodType,
        String(t.fiscalYear),
        String(t.fiscalPeriod ?? ""),
        t.startDate,
        t.endDate,
        String(t.isActive),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "time-periods.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const treeRows = buildTreeRows(timePoints);

  const inputCls =
    "w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <>
      <MetadataHeader
        title="Time Periods"
        subtitle={`${total.toLocaleString()} periods`}
        onAdd={() => setV2DialogOpen(true)}
        addLabel="Add Period"
        onExport={handleExport}
        onRefresh={fetchTimePoints}
        showSearch
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Search by code or name..."
      />

      <main className="flex-1 overflow-y-auto bg-background p-6">
        {/* Tab switcher */}
        <div className="mb-4 flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
          <button
            onClick={() => setTab("table")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "table"
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutList className="h-3.5 w-3.5" />
            Table View
          </button>
          <button
            onClick={() => setTab("tree")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "tree"
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <GitBranch className="h-3.5 w-3.5" />
            Hierarchy View
          </button>
        </div>

        {tab === "table" && (
          <DimensionTable
            columns={COLUMNS}
            data={timePoints}
            total={total}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            onSort={(key, dir) => {
              setSortKey(key);
              setSortDir(dir);
            }}
            sortKey={sortKey}
            sortDir={sortDir}
            onEdit={openEdit}
            onDelete={handleDelete}
            loading={loading}
            emptyMessage="No time periods found. Add your first period."
          />
        )}

        {tab === "tree" && (
          <div className="rounded-lg border border-border bg-white">
            {loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
            ) : treeRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No time periods found.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Period</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">FY</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Start</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">End</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                    <th className="w-24 px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {treeRows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2">
                        <div
                          className="flex items-center gap-1"
                          style={{ paddingLeft: `${row.depth * 20}px` }}
                        >
                          {row.depth > 0 && (
                            <span className="text-muted-foreground">└</span>
                          )}
                          <code className="font-mono text-xs font-medium">{row.code}</code>
                          <span className="ml-1 text-xs text-muted-foreground">{row.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                            PERIOD_COLORS[row.periodType] ?? "bg-muted text-muted-foreground"
                          )}
                        >
                          {row.periodType}
                        </span>
                      </td>
                      <td className="px-4 py-2 tabular-nums text-xs">{row.fiscalYear}</td>
                      <td className="px-4 py-2 tabular-nums text-xs">
                        {row.startDate ? new Date(row.startDate).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-xs">
                        {row.endDate ? new Date(row.endDate).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-medium",
                            row.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          )}
                        >
                          {row.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(row)}
                            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(row)}
                            className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-base font-semibold">
                {editRecord ? "Edit Time Period" : "Add Time Period"}
              </h2>
              <button
                onClick={() => setFormOpen(false)}
                className="rounded-md p-1 hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Code *
                  </label>
                  <input
                    className={inputCls}
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder="e.g. FY2025-Q1"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Period Type *
                  </label>
                  <select
                    className={inputCls}
                    value={form.periodType}
                    onChange={(e) => setForm((f) => ({ ...f, periodType: e.target.value }))}
                  >
                    {PERIOD_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Period Name *
                </label>
                <input
                  className={inputCls}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Q1 FY2025"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Fiscal Year *
                  </label>
                  <input
                    type="number"
                    className={inputCls}
                    value={form.fiscalYear}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, fiscalYear: Number(e.target.value) }))
                    }
                    min={2000}
                    max={2099}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Fiscal Period #
                  </label>
                  <input
                    type="number"
                    className={inputCls}
                    value={form.fiscalPeriod}
                    onChange={(e) => setForm((f) => ({ ...f, fiscalPeriod: e.target.value }))}
                    min={1}
                    max={53}
                    placeholder="e.g. 1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    className={inputCls}
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    End Date *
                  </label>
                  <input
                    type="date"
                    className={inputCls}
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <div
                  onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
                  className={cn(
                    "relative inline-flex h-5 w-9 rounded-full transition-colors",
                    form.isActive ? "bg-green-500" : "bg-muted-foreground/30"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                      form.isActive ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </div>
                Active
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <button
                onClick={() => setFormOpen(false)}
                className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Saving..." : editRecord ? "Save Changes" : "Create Period"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v2 Add Time Period dialog (Slice 3.1b) */}
      <AddMemberDialog
        open={v2DialogOpen}
        dim="time"
        onClose={() => setV2DialogOpen(false)}
        onSaved={() => fetchTimePoints()}
      />
    </>
  );
}
