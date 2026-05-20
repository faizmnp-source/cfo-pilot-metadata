"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { DimensionTable, Column } from "@/components/metadata/DimensionTable";
import { cn } from "@/lib/utils";

interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  exchangeRate: number;
  isBase: boolean;
  isActive: boolean;
  createdAt: string;
}

const COLUMNS: Column<Currency>[] = [
  {
    key: "code",
    label: "Code",
    sortable: true,
    render: (row) => (
      <div className="flex items-center gap-2">
        <code className="font-mono text-xs font-medium text-foreground">{row.code}</code>
        {row.isBase && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
            Base
          </span>
        )}
      </div>
    ),
  },
  { key: "name", label: "Currency Name", sortable: true },
  {
    key: "symbol",
    label: "Symbol",
    render: (row) => (
      <span className="font-mono text-sm font-medium">{row.symbol}</span>
    ),
  },
  {
    key: "exchangeRate",
    label: "Exchange Rate",
    sortable: true,
    render: (row) => (
      <span className="tabular-nums text-sm">
        {row.isBase ? "1.0000 (base)" : row.exchangeRate.toFixed(4)}
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
  symbol: "",
  exchangeRate: 1,
  isBase: false,
  isActive: true,
};

export default function CurrenciesPage() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Currency | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const PAGE_SIZE = 20;

  const fetchCurrencies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        search,
        sortBy: sortKey,
        sortDir,
      });
      const res = await fetch(`/api/metadata/currencies?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCurrencies(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      toast.error("Failed to load currencies");
    } finally {
      setLoading(false);
    }
  }, [page, search, sortKey, sortDir]);

  useEffect(() => {
    fetchCurrencies();
  }, [fetchCurrencies]);

  const openAdd = () => {
    setEditRecord(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (row: Currency) => {
    setEditRecord(row);
    setForm({
      code: row.code,
      name: row.name,
      symbol: row.symbol,
      exchangeRate: row.exchangeRate,
      isBase: row.isBase,
      isActive: row.isActive,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = editRecord
        ? `/api/metadata/currencies/${editRecord.id}`
        : "/api/metadata/currencies";
      const method = editRecord ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, exchangeRate: Number(form.exchangeRate) }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Save failed");
      }
      toast.success(editRecord ? "Currency updated" : "Currency created");
      setFormOpen(false);
      fetchCurrencies();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: Currency) => {
    if (!confirm(`Delete currency ${row.code} — ${row.name}?`)) return;
    const res = await fetch(`/api/metadata/currencies/${row.id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? "Delete failed");
    } else {
      toast.success("Currency deleted");
      fetchCurrencies();
    }
  };

  const handleExport = () => {
    const rows = [
      ["code", "name", "symbol", "exchangeRate", "isBase", "isActive"],
      ...currencies.map((c) => [
        c.code,
        c.name,
        c.symbol,
        String(c.exchangeRate),
        String(c.isBase),
        String(c.isActive),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "currencies.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputCls =
    "w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <>
      <MetadataHeader
        title="Currencies"
        subtitle={`${total.toLocaleString()} currencies`}
        onAdd={openAdd}
        addLabel="Add Currency"
        onExport={handleExport}
        onRefresh={fetchCurrencies}
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
          data={currencies}
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
          emptyMessage="No currencies found. Add your first currency."
        />
      </main>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-base font-semibold">
                {editRecord ? "Edit Currency" : "Add Currency"}
              </h2>
              <button
                onClick={() => setFormOpen(false)}
                className="rounded-md p-1 hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Code * (3 chars)
                  </label>
                  <input
                    className={inputCls}
                    value={form.code}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        code: e.target.value.toUpperCase().slice(0, 3),
                      }))
                    }
                    placeholder="USD"
                    maxLength={3}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Symbol *
                  </label>
                  <input
                    className={inputCls}
                    value={form.symbol}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, symbol: e.target.value.slice(0, 10) }))
                    }
                    placeholder="$"
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Exchange Rate *
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    className={inputCls}
                    value={form.exchangeRate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, exchangeRate: Number(e.target.value) }))
                    }
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Currency Name *
                </label>
                <input
                  className={inputCls}
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="e.g. US Dollar"
                />
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isBase}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, isBase: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-input"
                  />
                  Base currency (exchange rate = 1)
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
                {saving ? "Saving..." : editRecord ? "Save Changes" : "Create Currency"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
