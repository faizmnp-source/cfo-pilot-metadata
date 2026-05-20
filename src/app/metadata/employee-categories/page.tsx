"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { DimensionTable, Column } from "@/components/metadata/DimensionTable";
import { cn } from "@/lib/utils";

interface EmployeeCategory {
  id: string;
  code: string;
  name: string;
  categoryType: string | null;
  payGrade: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  FULL_TIME: "bg-blue-100 text-blue-700",
  PART_TIME: "bg-green-100 text-green-700",
  CONTRACT: "bg-amber-100 text-amber-700",
  CONSULTANT: "bg-purple-100 text-purple-700",
  INTERN: "bg-gray-100 text-gray-600",
};

const CATEGORY_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "CONSULTANT", "INTERN"];

const COLUMNS: Column<EmployeeCategory>[] = [
  {
    key: "code",
    label: "Code",
    sortable: true,
    render: (row) => (
      <code className="font-mono text-xs font-medium text-foreground">{row.code}</code>
    ),
  },
  { key: "name", label: "Category Name", sortable: true },
  {
    key: "categoryType",
    label: "Type",
    render: (row) =>
      row.categoryType ? (
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
            TYPE_COLORS[row.categoryType] ?? "bg-muted text-muted-foreground"
          )}
        >
          {row.categoryType.replace("_", " ")}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "payGrade",
    label: "Pay Grade",
    render: (row) =>
      row.payGrade ? (
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
          {row.payGrade}
        </span>
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
  categoryType: "",
  payGrade: "",
  description: "",
  isActive: true,
};

export default function EmployeeCategoriesPage() {
  const [categories, setCategories] = useState<EmployeeCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<EmployeeCategory | null>(null);
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
      const res = await fetch(`/api/metadata/employee-categories?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCategories(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      toast.error("Failed to load employee categories");
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

  const openEdit = (row: EmployeeCategory) => {
    setEditRecord(row);
    setForm({
      code: row.code,
      name: row.name,
      categoryType: row.categoryType ?? "",
      payGrade: row.payGrade ?? "",
      description: row.description ?? "",
      isActive: row.isActive,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = editRecord
        ? `/api/metadata/employee-categories/${editRecord.id}`
        : "/api/metadata/employee-categories";
      const method = editRecord ? "PUT" : "POST";
      const payload = {
        ...form,
        categoryType: form.categoryType || null,
        payGrade: form.payGrade || null,
        description: form.description || null,
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

  const handleDelete = async (row: EmployeeCategory) => {
    if (!confirm(`Delete category [${row.code}] ${row.name}?`)) return;
    const res = await fetch(`/api/metadata/employee-categories/${row.id}`, {
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
      ["code", "name", "categoryType", "payGrade", "isActive"],
      ...categories.map((c) => [
        c.code,
        c.name,
        c.categoryType ?? "",
        c.payGrade ?? "",
        String(c.isActive),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "employee-categories.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputCls =
    "w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <>
      <MetadataHeader
        title="Employee Categories"
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
        searchPlaceholder="Search by code or name..."
      />

      <main className="flex-1 overflow-y-auto bg-background p-6">
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
          emptyMessage="No employee categories found. Add your first category."
        />
      </main>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-base font-semibold">
                {editRecord ? "Edit Employee Category" : "Add Employee Category"}
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
                    placeholder="e.g. FT-SENIOR"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Pay Grade
                  </label>
                  <input
                    className={inputCls}
                    value={form.payGrade}
                    onChange={(e) => setForm((f) => ({ ...f, payGrade: e.target.value }))}
                    placeholder="e.g. G7, L4"
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
                  placeholder="e.g. Senior Full-Time Employee"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Category Type
                </label>
                <select
                  className={inputCls}
                  value={form.categoryType}
                  onChange={(e) => setForm((f) => ({ ...f, categoryType: e.target.value }))}
                >
                  <option value="">— Select type —</option>
                  {CATEGORY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace("_", " ")}
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
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description..."
                />
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
