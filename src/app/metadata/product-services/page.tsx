"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { DimensionTable, Column } from "@/components/metadata/DimensionTable";
import { cn } from "@/lib/utils";

interface ProductService {
  id: string;
  code: string;
  name: string;
  category: string | null;
  unitOfMeasure: string | null;
  unitPrice: number | null;
  currency: string;
  isActive: boolean;
  createdAt: string;
}

const COLUMNS: Column<ProductService>[] = [
  {
    key: "code",
    label: "Code",
    sortable: true,
    render: (row) => (
      <code className="font-mono text-xs font-medium text-foreground">{row.code}</code>
    ),
  },
  { key: "name", label: "Name", sortable: true },
  {
    key: "category",
    label: "Category",
    render: (row) =>
      row.category ? (
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.category}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "unitOfMeasure",
    label: "UOM",
    render: (row) =>
      row.unitOfMeasure ? (
        <span className="text-xs">{row.unitOfMeasure}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "unitPrice",
    label: "Unit Price",
    sortable: true,
    render: (row) =>
      row.unitPrice != null ? (
        <span className="tabular-nums text-sm font-medium">
          <span className="text-xs text-muted-foreground">{row.currency} </span>
          {row.unitPrice.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
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
  category: "",
  unitOfMeasure: "",
  unitPrice: "" as string | number,
  currency: "USD",
  isActive: true,
};

export default function ProductServicesPage() {
  const [items, setItems] = useState<ProductService[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<ProductService | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const PAGE_SIZE = 20;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        search,
        sortBy: sortKey,
        sortDir,
      });
      const res = await fetch(`/api/metadata/product-services?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setItems(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      toast.error("Failed to load products & services");
    } finally {
      setLoading(false);
    }
  }, [page, search, sortKey, sortDir]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const openAdd = () => {
    setEditRecord(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (row: ProductService) => {
    setEditRecord(row);
    setForm({
      code: row.code,
      name: row.name,
      category: row.category ?? "",
      unitOfMeasure: row.unitOfMeasure ?? "",
      unitPrice: row.unitPrice ?? "",
      currency: row.currency,
      isActive: row.isActive,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = editRecord
        ? `/api/metadata/product-services/${editRecord.id}`
        : "/api/metadata/product-services";
      const method = editRecord ? "PUT" : "POST";
      const payload = {
        ...form,
        unitPrice: form.unitPrice !== "" ? Number(form.unitPrice) : null,
        category: form.category || null,
        unitOfMeasure: form.unitOfMeasure || null,
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
      toast.success(editRecord ? "Item updated" : "Item created");
      setFormOpen(false);
      fetchItems();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: ProductService) => {
    if (!confirm(`Delete [${row.code}] ${row.name}?`)) return;
    const res = await fetch(`/api/metadata/product-services/${row.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? "Delete failed");
    } else {
      toast.success("Item deleted");
      fetchItems();
    }
  };

  const handleExport = () => {
    const rows = [
      ["code", "name", "category", "unitOfMeasure", "unitPrice", "currency", "isActive"],
      ...items.map((i) => [
        i.code,
        i.name,
        i.category ?? "",
        i.unitOfMeasure ?? "",
        String(i.unitPrice ?? ""),
        i.currency,
        String(i.isActive),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "product-services.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputCls =
    "w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <>
      <MetadataHeader
        title="Products & Services"
        subtitle={`${total.toLocaleString()} items`}
        onAdd={openAdd}
        addLabel="Add Item"
        onExport={handleExport}
        onRefresh={fetchItems}
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
          data={items}
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
          emptyMessage="No products or services found. Add your first item."
        />
      </main>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-base font-semibold">
                {editRecord ? "Edit Product / Service" : "Add Product / Service"}
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
                    placeholder="e.g. SVC-001"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Category
                  </label>
                  <input
                    className={inputCls}
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="e.g. Consulting"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Name *
                </label>
                <input
                  className={inputCls}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Advisory Services"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Unit of Measure
                  </label>
                  <input
                    className={inputCls}
                    value={form.unitOfMeasure}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, unitOfMeasure: e.target.value }))
                    }
                    placeholder="e.g. Hour"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Unit Price
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputCls}
                    value={form.unitPrice}
                    onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
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
                {saving ? "Saving..." : editRecord ? "Save Changes" : "Create Item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
