"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { AddMemberDialog } from "@/components/metadata/v2/AddMemberDialog";
import { cn } from "@/lib/utils";

interface ICP {
  id: string;
  icpCode: string;
  icpName: string;
  entityId: string | null;
  description: string | null;
  isActive: boolean;
}

interface FormData {
  icpCode: string;
  icpName: string;
  entityId: string;
  description: string;
  isActive: boolean;
}

const EMPTY_FORM: FormData = { icpCode: "", icpName: "", entityId: "", description: "", isActive: true };

export default function ICPPage() {
  const [icps, setIcps] = useState<ICP[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [v2DialogOpen, setV2DialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<ICP | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);

  const fetchICPs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/metadata/icp");
      const data = await res.json();
      setIcps(Array.isArray(data) ? data : (data.data ?? []));
      setFetchError(false);
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchICPs(); }, [fetchICPs]);

  const openAdd = () => {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setAddOpen(true);
  };

  const openEdit = (item: ICP) => {
    setEditItem(item);
    setForm({
      icpCode: item.icpCode,
      icpName: item.icpName,
      entityId: item.entityId ?? "",
      description: item.description ?? "",
      isActive: item.isActive,
    });
    setFormError(null);
    setAddOpen(true);
  };

  const handleSave = async () => {
    if (!form.icpCode.trim()) { setFormError("ICP Code is required"); return; }
    if (!form.icpName.trim()) { setFormError("ICP Name is required"); return; }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        icpCode: form.icpCode.trim(),
        icpName: form.icpName.trim(),
        entityId: form.entityId.trim() || null,
        description: form.description.trim() || null,
        isActive: form.isActive,
      };
      let res: Response;
      if (editItem) {
        res = await fetch(`/api/metadata/icp/${editItem.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/metadata/icp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Save failed");
      }
      setAddOpen(false);
      setEditItem(null);
      fetchICPs();
    } catch (e: any) {
      setFormError(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: ICP) => {
    setConfirmDeleteId(null);
    try {
      await fetch(`/api/metadata/icp/${item.id}`, { method: "DELETE" });
      fetchICPs();
    } catch {}
  };

  const filtered = icps.filter((i) =>
    !search ||
    i.icpCode.toLowerCase().includes(search.toLowerCase()) ||
    i.icpName.toLowerCase().includes(search.toLowerCase()) ||
    (i.entityId ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <MetadataHeader
        title="Intercompany Partners"
        subtitle="Define ICP counterparties for elimination entries"
        showSearch
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search ICP code or name..."
        onAdd={() => setV2DialogOpen(true)}
        addLabel="Add ICP"
        onRefresh={fetchICPs}
      />

      <AddMemberDialog
        open={v2DialogOpen}
        dim="icp"
        onClose={() => setV2DialogOpen(false)}
        onSaved={() => fetchICPs()}
      />

      <main className="flex-1 overflow-y-auto bg-[var(--bg-surface-sunken)] p-6">
        {fetchError && (
          <p className="text-red-600 text-sm mb-4">Failed to load intercompany partners.</p>
        )}

        {/* Inline add/edit form */}
        {addOpen && (
          <div className="mb-4 rounded-xl border border-[var(--border-default)] bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-default)] bg-gray-50">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {editItem ? `Edit ICP — ${editItem.icpCode}` : "Add Intercompany Partner"}
              </h3>
              <button
                onClick={() => { setAddOpen(false); setEditItem(null); }}
                className="p-1 rounded hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4 md:grid-cols-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">ICP Code *</label>
                <input
                  autoFocus
                  value={form.icpCode}
                  onChange={(e) => setForm({ ...form, icpCode: e.target.value })}
                  className="w-full rounded-md border border-[var(--border-default)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent font-mono"
                  placeholder="e.g. ICP001"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">ICP Name *</label>
                <input
                  value={form.icpName}
                  onChange={(e) => setForm({ ...form, icpName: e.target.value })}
                  className="w-full rounded-md border border-[var(--border-default)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent"
                  placeholder="Partner name"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Linked Entity ID</label>
                <input
                  value={form.entityId}
                  onChange={(e) => setForm({ ...form, entityId: e.target.value })}
                  className="w-full rounded-md border border-[var(--border-default)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent"
                  placeholder="Optional entity ref"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-md border border-[var(--border-default)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent"
                  placeholder="Optional"
                />
              </div>
              <div className="flex items-center gap-2 pt-4">
                <input
                  type="checkbox"
                  id="icp-active"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <label htmlFor="icp-active" className="text-sm text-gray-700 select-none">Active</label>
              </div>
            </div>
            {formError && <p className="px-5 pb-2 text-red-600 text-xs">{formError}</p>}
            <div className="flex items-center gap-2 px-5 pb-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 h-8 px-4 rounded-md text-xs font-medium bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-700)] transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {editItem ? "Save Changes" : "Add ICP"}
              </button>
              <button
                onClick={() => { setAddOpen(false); setEditItem(null); }}
                className="h-8 px-4 rounded-md text-xs font-medium border border-[var(--border-default)] text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border border-[var(--border-default)] bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] bg-gray-50">
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">ICP Code</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Name</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Linked Entity</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Description</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-default)]">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <span className="inline-block h-4 w-20 rounded bg-muted animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                    {search ? "No ICPs match your search." : "No intercompany partners yet. Add your first ICP to get started."}
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <code className="font-mono text-xs font-medium text-[var(--text-primary)]">{item.icpCode}</code>
                    </td>
                    <td className="px-4 py-2.5 text-sm font-medium text-[var(--text-primary)]">{item.icpName}</td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)]">
                      {item.entityId ? (
                        <span className="font-mono">{item.entityId}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)] max-w-xs truncate">
                      {item.description ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", item.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500")}>
                        {item.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {confirmDeleteId === item.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-red-600 mr-1">Confirm delete?</span>
                          <button
                            onClick={() => handleDelete(item)}
                            className="text-xs font-medium text-red-600 hover:underline"
                          >
                            Yes
                          </button>
                          <span className="text-gray-300">/</span>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs font-medium text-gray-500 hover:underline"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(item)}
                            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(item.id)}
                            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {!loading && filtered.length > 0 && (
            <div className="border-t border-[var(--border-default)] px-4 py-2 bg-gray-50">
              <p className="text-xs text-gray-400">{filtered.length} partner{filtered.length !== 1 ? "s" : ""}</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
