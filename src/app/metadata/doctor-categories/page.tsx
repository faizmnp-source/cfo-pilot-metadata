"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Stethoscope, X } from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { DimensionTable, Column } from "@/components/metadata/DimensionTable";
import { cn } from "@/lib/utils";

interface DoctorCategory {
  id: string;
  code: string;
  name: string;
  specialty: string | null;
  billableRate: number | null;
  currency: string;
  department: string | null;
  isActive: boolean;
  createdAt: string;
}

const COLUMNS: Column<DoctorCategory>[] = [
  {
    key: "code",
    label: "Code",
    sortable: true,
    render: (row) => (
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-100">
          <Stethoscope className="h-3.5 w-3.5 text-teal-600" />
        </div>
        <code className="font-mono text-xs font-medium text-foreground">{row.code}</code>
      </div>
    ),
  },
  { key: "name", label: "Category Name", sortable: true },
  {
    key: "specialty",
    label: "Specialty",
    render: (row) =>
      row.specialty ? (
        <span className="rounded bg-teal-50 px-1.5 py-0.5 text-xs text-teal-700">
          {row.specialty}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "billableRate",
    label: "Billable Rate",
    sortable: true,
    render: (row) =>
      row.billableRate != null ? (
        <span className="tabular-nums text-sm font-medium">
          <span className="text-xs text-muted-foreground">{row.currency}/hr </span>
          {row.billableRate.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "department",
    label: "Department",
    render: (row) =>
      row.department ? (
        <span className="text-xs">{row.department}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
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
  specialty: "",
  billableRate: "" as string | number,
  currency: "USD",
  department: "",
  isActive: true,
};

export default function DoctorCategoriesPage() {
  const [categories, setCategories] = useState<DoctorCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<DoctorCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const PAGE_SIZE = 20;

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        search,
        sortBy: sortKey,
        sortDir,
      });
      const res = await fetch(`/api/metadata/doctor-categories?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCategories(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      toast.error("Failed to load doctor categories");
    } finally {
      setLoading(false);
    }
  }, [page, search, sortKey, sortDir]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const openAdd = () => {
    setEditRecord(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (row: DoctorCategory) => {
    setEditRecord(row);
    setForm({
      code: row.code,
      name: row.name,
      specialty: row.specialty ?? "",
      billableRate: row.billableRate ?? "",
      currency: row.currency,
      department: row.department ?? "",
      isActive: row.isActive,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = editRecord
        ? `/api/metadata/doctor-categories/${editRecord.id}`
        : "/api/metadata/doctor-categories";
      const method = editRecord ? "PUT" : "POST";
      const payload = {
        ...form,
        billableRate: form.billableRate !== "" ? Number(form.billableRate) : null,
        specialty: form.specialty || null,
        department: form.department || null,
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
      toast.success(editRecord ? "Category updated" : "Category created");
      setFormOpen(false);
      fetchCategories();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: DoctorCategory) => {
    if (!confirm(`Delete category [${row.code}] ${row.name}?`)) return;
    const res = await fetch(`/api/metadata/doctor-categories/${row.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? "Delete failed");
    } else {
      toast.success("Category deleted");
      fetchCategories();
    }
  };

  const handleExport = () => {
    const rows = [
      ["code", "name", "specialty", "billableRate", "currency", "department", "isActive"],
      ...categories.map((c) => [
        c.code,
        c.name,
        c.specialty ?? "",
        String(c.billableRate ?? ""),
        c.currency,
        c.department ?? "",
        String(c.isActive),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "doctor-categories.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputCls =
    "w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <>
      <MetadataHeader
        title="Doctor Categories"
        subtitle={`${total.toLocaleString()} categories`}
        onAdd={openAdd}
        addLabel="Add Category"
        onExport={handleExport}
        onRefresh={fetchCategories}
        showSearch
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Search by code or specialty..."
      />

      <main className="flex-1 overflow-y-auto bg-background p-6">
        {/* Healthcare context banner */}
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2.5">
          <Stethoscope className="h-4 w-4 text-teal-600" />
          <p className="text-xs text-teal-700">
            Doctor categories define physician billing classifications for healthcare cost modeling.
          </p>
        </div>

        <DimensionTable
          columns={COLUMNS}
          data={categories}
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
          emptyMessage="No doctor categories found. Add your first physician category."
        />
      </main>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-100">
                  <Stethoscope className="h-4 w-4 text-teal-600" />
                </div>
                <h2 className="text-base font-semibold">
                  {editRecord ? "Edit Doctor Category" : "Add Doctor Category"}
                </h2>
              </div>
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
                    placeholder="e.g. SPEC-CARDIO"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Specialty
                  </label>
                  <input
                    className={inputCls}
                    value={form.specialty}
                    onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))}
                    placeholder="e.g. Cardiology"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Category Name *
                </label>
                <input
                  className={inputCls}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Senior Cardiologist"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Department
                </label>
                <input
                  className={inputCls}
                  value={form.department}
                  onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                  placeholder="e.g. Cardiac Care Unit"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Billable Rate (per hour)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputCls}
                    value={form.billableRate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, billableRate: e.target.value }))
                    }
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Currency
                  </label>
                  <input
                    className={inputCls}
                    value={form.currency}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        currency: e.target.value.toUpperCase().slice(0, 3),
                      }))
                    }
                    placeholder="USD"
                    maxLength={3}
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
                {saving ? "Saving..." : editRecord ? "Save Changes" : "Create Category"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
