"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Lock, Unlock, X } from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { DimensionTable, Column } from "@/components/metadata/DimensionTable";
import { AddMemberDialog } from "@/components/metadata/v2/AddMemberDialog";
import { cn } from "@/lib/utils";

interface Scenario {
  id: string;
  scenarioCode: string;
  scenarioName: string;
  scenarioType: string;
  fiscalYear: number;
  description: string | null;
  isLocked: boolean;
  isActive: boolean;
  createdAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  BUDGET: "bg-blue-100 text-blue-700",
  FORECAST: "bg-purple-100 text-purple-700",
  ACTUALS: "bg-green-100 text-green-700",
  ROLLING_FORECAST: "bg-teal-100 text-teal-700",
  STRESS_TEST: "bg-red-100 text-red-700",
};

const SCENARIO_TYPES = ["BUDGET", "FORECAST", "ACTUALS", "ROLLING_FORECAST", "STRESS_TEST"];

const COLUMNS: Column<Scenario>[] = [
  {
    key: "scenarioCode",
    label: "Code",
    sortable: true,
    render: (row) => (
      <code className="font-mono text-xs font-medium text-foreground">{row.scenarioCode}</code>
    ),
  },
  { key: "scenarioName", label: "Scenario Name", sortable: true },
  {
    key: "scenarioType",
    label: "Type",
    render: (row) => (
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
          TYPE_COLORS[row.scenarioType] ?? "bg-muted text-muted-foreground"
        )}
      >
        {row.scenarioType.replace(/_/g, " ")}
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
    key: "isLocked",
    label: "Locked",
    render: (row) =>
      row.isLocked ? (
        <span className="flex items-center gap-1 text-amber-600">
          <Lock className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">Locked</span>
        </span>
      ) : (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Unlock className="h-3.5 w-3.5" />
          <span className="text-xs">Open</span>
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
  scenarioCode: "",
  scenarioName: "",
  scenarioType: "BUDGET",
  fiscalYear: new Date().getFullYear(),
  description: "",
  isLocked: false,
  isActive: true,
};

export default function ScenariosPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("scenarioCode");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [v2DialogOpen, setV2DialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Scenario | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const PAGE_SIZE = 20;

  const fetchScenarios = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        search,
        sortBy: sortKey,
        sortDir,
      });
      const res = await fetch(`/api/metadata/scenarios?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setScenarios(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      toast.error("Failed to load scenarios");
    } finally {
      setLoading(false);
    }
  }, [page, search, sortKey, sortDir]);

  useEffect(() => {
    fetchScenarios();
  }, [fetchScenarios]);

  const openAdd = () => {
    setEditRecord(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (row: Scenario) => {
    setEditRecord(row);
    setForm({
      scenarioCode: row.scenarioCode,
      scenarioName: row.scenarioName,
      scenarioType: row.scenarioType,
      fiscalYear: row.fiscalYear,
      description: row.description ?? "",
      isLocked: row.isLocked,
      isActive: row.isActive,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = editRecord
        ? `/api/metadata/scenarios/${editRecord.id}`
        : "/api/metadata/scenarios";
      const method = editRecord ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, fiscalYear: Number(form.fiscalYear) }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Save failed");
      }
      toast.success(editRecord ? "Scenario updated" : "Scenario created");
      setFormOpen(false);
      fetchScenarios();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: Scenario) => {
    if (!confirm(`Delete scenario [${row.scenarioCode}] ${row.scenarioName}?`)) return;
    const res = await fetch(`/api/metadata/scenarios/${row.id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? "Delete failed");
    } else {
      toast.success("Scenario deleted");
      fetchScenarios();
    }
  };

  const handleExport = () => {
    const rows = [
      ["scenarioCode", "scenarioName", "scenarioType", "fiscalYear", "isLocked", "isActive"],
      ...scenarios.map((s) => [
        s.scenarioCode,
        s.scenarioName,
        s.scenarioType,
        String(s.fiscalYear),
        String(s.isLocked),
        String(s.isActive),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scenarios.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputCls =
    "w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <>
      <MetadataHeader
        title="Scenarios"
        subtitle={`${total.toLocaleString()} scenarios`}
        onAdd={() => setV2DialogOpen(true)}
        addLabel="Add Scenario"
        onExport={handleExport}
        onRefresh={fetchScenarios}
        showSearch
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Search by code or name..."
      />

      <main className="flex-1 overflow-y-auto bg-background p-6">
        <DimensionTable
          columns={COLUMNS}
          data={scenarios}
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
          emptyMessage="No scenarios found. Add your first scenario."
        />
      </main>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-base font-semibold">
                {editRecord ? "Edit Scenario" : "Add Scenario"}
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
                    Scenario Code *
                  </label>
                  <input
                    className={inputCls}
                    value={form.scenarioCode}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, scenarioCode: e.target.value }))
                    }
                    placeholder="e.g. FY2025-BUDGET"
                  />
                </div>
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
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Scenario Name *
                </label>
                <input
                  className={inputCls}
                  value={form.scenarioName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, scenarioName: e.target.value }))
                  }
                  placeholder="e.g. Annual Budget 2025"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Scenario Type *
                </label>
                <select
                  className={inputCls}
                  value={form.scenarioType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, scenarioType: e.target.value }))
                  }
                >
                  {SCENARIO_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Description
                </label>
                <textarea
                  className={cn(inputCls, "resize-none")}
                  rows={3}
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder="Optional description..."
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isLocked}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, isLocked: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-input"
                  />
                  Lock scenario (prevent edits)
                </label>

                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <div
                    onClick={() =>
                      setForm((f) => ({ ...f, isActive: !f.isActive }))
                    }
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
                {saving ? "Saving..." : editRecord ? "Save Changes" : "Create Scenario"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v2 Add Scenario dialog (Slice 3.1b) */}
      <AddMemberDialog
        open={v2DialogOpen}
        dim="scenario"
        onClose={() => setV2DialogOpen(false)}
        onSaved={() => fetchScenarios()}
      />
    </>
  );
}
