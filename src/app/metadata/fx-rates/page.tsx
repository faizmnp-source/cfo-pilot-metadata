"use client";

import { useState, useEffect, useCallback } from "react";
import { TrendingUp, Plus, Search, RefreshCw, Filter, Edit2, Trash2, ChevronUp, ChevronDown } from "lucide-react";

interface FxRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveDate: string;
  source: string;
  isActive: boolean;
}

interface PageData {
  data: FxRate[];
  total: number;
  page: number;
  totalPages: number;
}

export default function FxRatesPage() {
  const [pageData, setPageData]   = useState<PageData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [page, setPage]           = useState(1);
  const [from, setFrom]           = useState("");
  const [to, setTo]               = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editRate, setEditRate]   = useState<FxRate | null>(null);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({
    fromCurrency: "", toCurrency: "INR", rate: "", effectiveDate: new Date().toISOString().split("T")[0], source: "MANUAL",
  });

  const fetchRates = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page), pageSize: "20",
      ...(from && { from }), ...(to && { to }),
    });
    const res  = await fetch(`/api/metadata/fx-rates?${params}`, { credentials: "include" });
    const data = await res.json();
    setPageData(data.data ?? null);
    setLoading(false);
  }, [page, from, to]);

  useEffect(() => { fetchRates(); }, [fetchRates]);

  const openCreate = () => {
    setEditRate(null);
    setForm({ fromCurrency: "", toCurrency: "INR", rate: "", effectiveDate: new Date().toISOString().split("T")[0], source: "MANUAL" });
    setShowModal(true);
  };

  const openEdit = (r: FxRate) => {
    setEditRate(r);
    setForm({ fromCurrency: r.fromCurrency, toCurrency: r.toCurrency, rate: String(r.rate), effectiveDate: r.effectiveDate.split("T")[0], source: r.source });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const url    = editRate ? `/api/metadata/fx-rates/${editRate.id}` : "/api/metadata/fx-rates";
      const method = editRate ? "PUT" : "POST";
      const body   = editRate
        ? { rate: Number(form.rate), source: form.source }
        : { ...form, rate: Number(form.rate), effectiveDate: new Date(form.effectiveDate).toISOString() };

      const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { setShowModal(false); fetchRates(); }
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this FX rate?")) return;
    await fetch(`/api/metadata/fx-rates/${id}`, { method: "DELETE", credentials: "include" });
    fetchRates();
  };

  const filteredData = pageData?.data.filter((r) =>
    !search || r.fromCurrency.includes(search.toUpperCase()) || r.toCurrency.includes(search.toUpperCase())
  ) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-50">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">FX Rates</h1>
            <p className="text-sm text-gray-500">
              {pageData ? `${pageData.total} rates across all currencies` : "Loading…"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchRates} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Rate
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search currency…"
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <input
            type="text" value={from} onChange={(e) => setFrom(e.target.value.toUpperCase())}
            placeholder="From (e.g. USD)" maxLength={3}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-32 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
          />
          <span className="text-gray-400">→</span>
          <input
            type="text" value={to} onChange={(e) => setTo(e.target.value.toUpperCase())}
            placeholder="To (e.g. INR)" maxLength={3}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-32 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
          />
          <button onClick={() => { setFrom(""); setTo(""); setSearch(""); setPage(1); }}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">Clear</button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">From</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">To</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Rate</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Effective Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Source</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredData.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-900">{r.fromCurrency}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-gray-900">{r.toCurrency}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-800">
                      {Number(r.rate).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.effectiveDate.split("T")[0]}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.source === "MARKET"   ? "bg-blue-50 text-blue-700"   :
                        r.source === "IMPORTED" ? "bg-purple-50 text-purple-700" :
                                                  "bg-gray-100 text-gray-600"
                      }`}>
                        {r.source}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {r.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(r)} className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(r.id)} className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                      No FX rates found. Add rates or run the seed script.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {pageData && pageData.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-600">
                <span>Page {page} of {pageData.totalPages} ({pageData.total} rates)</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">← Prev</button>
                  <button onClick={() => setPage((p) => Math.min(pageData.totalPages, p + 1))} disabled={page === pageData.totalPages}
                    className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">{editRate ? "Edit FX Rate" : "Add FX Rate"}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">From Currency</label>
                <input type="text" value={form.fromCurrency}
                  onChange={(e) => setForm((f) => ({ ...f, fromCurrency: e.target.value.toUpperCase() }))}
                  disabled={!!editRate} maxLength={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
                  placeholder="USD"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">To Currency</label>
                <input type="text" value={form.toCurrency}
                  onChange={(e) => setForm((f) => ({ ...f, toCurrency: e.target.value.toUpperCase() }))}
                  disabled={!!editRate} maxLength={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
                  placeholder="INR"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Rate (1 {form.fromCurrency || "?"} = ? {form.toCurrency || "?"})</label>
              <input type="number" step="0.000001" value={form.rate}
                onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="84.5"
              />
            </div>
            {!editRate && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Effective Date</label>
                <input type="date" value={form.effectiveDate}
                  onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
              <select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="MANUAL">Manual</option>
                <option value="MARKET">Market</option>
                <option value="IMPORTED">Imported</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
