"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  LayoutList, GitBranch, ChevronDown, ChevronRight, Pencil,
  Check, X, Loader2,
} from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { DimensionTable, Column } from "@/components/metadata/DimensionTable";
import { MetadataTree, TreeNode } from "@/components/metadata/MetadataTree";
import { EntityForm } from "@/components/metadata/EntityForm";
import { AddMemberDialog } from "@/components/metadata/v2/AddMemberDialog";
import { HierarchyTreeView as V2Tree } from "@/components/metadata/v2/HierarchyTreeView";
import { cn } from "@/lib/utils";

type ConsolidationMethod = "FULL" | "PROPORTIONAL" | "EQUITY" | "NONE";

interface Entity {
  id: string;
  code: string;
  name: string;
  legalName: string | null;
  country: string | null;
  currency: string | null;
  parentId: string | null;
  parentCode?: string;
  parentName?: string;
  isActive: boolean;
  childCount?: number;
  // Consolidation fields
  consolidationMethod?: ConsolidationMethod;
  eliminationFlag?: boolean;
  ownershipPercentage?: number | null;
}

type Tab = "table" | "tree";

function buildTree(entities: Entity[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  entities.forEach((e) =>
    map.set(e.id, { id: e.id, code: e.code, name: e.name, isActive: e.isActive, children: [] })
  );
  const roots: TreeNode[] = [];
  entities.forEach((e) => {
    const node = map.get(e.id)!;
    if (e.parentId && map.has(e.parentId)) {
      map.get(e.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

const METHOD_STYLES: Record<ConsolidationMethod, string> = {
  FULL:         "bg-blue-50 text-blue-700",
  PROPORTIONAL: "bg-purple-50 text-purple-700",
  EQUITY:       "bg-amber-50 text-amber-700",
  NONE:         "bg-gray-100 text-gray-500",
};

// Consolidation edit form
interface ConsolidationEditFormProps {
  entity: Entity;
  onSave: (updates: Partial<Entity>) => Promise<void>;
  onCancel: () => void;
}

function ConsolidationEditForm({ entity, onSave, onCancel }: ConsolidationEditFormProps) {
  const [method, setMethod] = useState<ConsolidationMethod>(entity.consolidationMethod ?? "FULL");
  const [elim, setElim] = useState(entity.eliminationFlag ?? false);
  const [ownership, setOwnership] = useState(entity.ownershipPercentage != null ? String(entity.ownershipPercentage) : "100");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        consolidationMethod: method,
        eliminationFlag: elim,
        ownershipPercentage: ownership ? parseFloat(ownership) : null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mt-3">
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Consolidation Method</label>
        <select value={method} onChange={(e) => setMethod(e.target.value as ConsolidationMethod)}
          className="w-full rounded border border-gray-200 px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]">
          <option value="FULL">FULL</option>
          <option value="PROPORTIONAL">PROPORTIONAL</option>
          <option value="EQUITY">EQUITY</option>
          <option value="NONE">NONE</option>
        </select>
      </div>
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Ownership %</label>
        <input
          type="number" min="0" max="100" step="0.01"
          value={ownership}
          onChange={(e) => setOwnership(e.target.value)}
          className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]"
          placeholder="100"
        />
      </div>
      <div className="flex items-center gap-2 pt-4">
        <input type="checkbox" id={`elim-${entity.id}`} checked={elim} onChange={(e) => setElim(e.target.checked)} className="w-3.5 h-3.5" />
        <label htmlFor={`elim-${entity.id}`} className="text-xs text-gray-600 select-none">Elimination Entity</label>
      </div>
      <div className="md:col-span-4 flex items-center gap-2 pt-1">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1 h-6 px-3 rounded text-[10px] font-medium bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-700)] transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save Consolidation
        </button>
        <button onClick={onCancel}
          className="flex items-center gap-1 h-6 px-3 rounded text-[10px] font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
          <X className="w-3 h-3" /> Cancel
        </button>
      </div>
    </div>
  );
}

// Consolidation read display
interface ConsolidationPanelProps {
  entity: Entity;
  onEdit: () => void;
}

function ConsolidationPanel({ entity, onEdit }: ConsolidationPanelProps) {
  const method = entity.consolidationMethod ?? "FULL";
  return (
    <div className="flex flex-wrap items-start gap-4 py-2">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Consolidation Method</p>
        <span className={cn("px-2 py-0.5 rounded text-xs font-medium", METHOD_STYLES[method])}>
          {method}
        </span>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Elimination Flag</p>
        {entity.eliminationFlag ? (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600">Yes</span>
        ) : (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">No</span>
        )}
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Ownership %</p>
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
          {entity.ownershipPercentage != null ? `${entity.ownershipPercentage}%` : "100%"}
        </span>
      </div>
      <div className="ml-auto">
        <button onClick={onEdit}
          className="flex items-center gap-1 h-6 px-3 rounded text-[10px] font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors">
          <Pencil className="w-3 h-3" /> Edit Consolidation
        </button>
      </div>
    </div>
  );
}

export default function EntitiesPage() {
  const [tab, setTab] = useState<Tab>("table");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [v2DialogOpen, setV2DialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Entity | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [consolEditId, setConsolEditId] = useState<string | null>(null);
  const PAGE_SIZE = 20;

  const fetchEntities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page), pageSize: String(PAGE_SIZE), search, sortBy: sortKey, sortDir,
      });
      // Try v2 first
      const v2res = await fetch(`/api/v2/members/entity?${params}`, { credentials: "include" });
      if (v2res.ok) {
        const v2 = await v2res.json();
        // Map v2 dimension_member → Entity shape used by this legacy page.
        // Inlined because the helper was lost in the v2 schema migration;
        // legacy page is being replaced by /metadata/library — temporary glue.
        const mapV2Entity = (m: any): Entity => ({
          id: m.id,
          code: m.memberCode,
          name: m.memberName,
          parentId: null,
          baseCurrency:        m.properties?.base_currency        ?? "USD",
          consolidationMethod: m.properties?.consolidation_method ?? "FULL",
          ownershipPct:        m.properties?.ownership_pct        ?? 100,
          country:             m.properties?.country              ?? null,
          taxId:               m.properties?.tax_id               ?? null,
          icpEnabled:          m.properties?.icp_enabled          ?? false,
          isActive: m.isActive,
          sortOrder: m.sortOrder ?? 0,
        });
        const mapped = (v2?.data?.data ?? []).map(mapV2Entity);
        setEntities(mapped);
        setTotal(v2?.data?.total ?? mapped.length);
        setTreeData(buildTree(mapped));
        return;
      }
      // Fall back to legacy
      const res = await fetch(`/api/metadata/entities?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEntities(data.data ?? []);
      setTotal(data.total ?? 0);
      setTreeData(buildTree(data.allRecords ?? data.data ?? []));
    } catch { toast.error("Failed to load entities"); }
    finally { setLoading(false); }
  }, [page, search, sortKey, sortDir]);

  useEffect(() => { fetchEntities(); }, [fetchEntities]);

  const handleSave = async (data: Partial<Entity>) => {
    const url = editRecord ? `/api/metadata/entities/${editRecord.id}` : "/api/metadata/entities";
    const method = editRecord ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? "Save failed"); }
    toast.success(editRecord ? "Entity updated" : "Entity created");
    setFormOpen(false); setEditRecord(null); fetchEntities();
  };

  const handleSaveConsolidation = async (id: string, updates: Partial<Entity>) => {
    const entity = entities.find((e) => e.id === id);
    if (!entity) return;
    const res = await fetch(`/api/metadata/entities/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...entity, ...updates }),
    });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? "Failed to update consolidation");
      return;
    }
    toast.success("Consolidation properties updated");
    setConsolEditId(null);
    fetchEntities();
  };

  const handleDelete = async (row: Entity) => {
    if (!confirm(`Delete entity [${row.code}] ${row.name}?`)) return;
    const res = await fetch(`/api/metadata/entities/${row.id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json(); toast.error(err.error ?? "Delete failed"); }
    else { toast.success("Entity deleted"); fetchEntities(); }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
    if (expandedId !== id) setConsolEditId(null);
  };

  return (
    <>
      <MetadataHeader
        title="Legal Entities"
        subtitle={`${total.toLocaleString()} entities`}
        onAdd={() => { setEditRecord(null); setFormOpen(true); }}
        addLabel="Add Entity"
        onRefresh={fetchEntities}
        showSearch
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search entities..."
      />

      <main className="flex-1 overflow-y-auto bg-background p-6">
        {/* Tab switcher */}
        <div className="mb-4 flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
          <button onClick={() => setTab("table")}
            className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "table" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}>
            <LayoutList className="h-3.5 w-3.5" /> Table View
          </button>
          <button onClick={() => setTab("tree")}
            className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "tree" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}>
            <GitBranch className="h-3.5 w-3.5" /> Hierarchy View
          </button>
        </div>

        {/* Table view with consolidation expansion */}
        {tab === "table" && (
          <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50">
                  <th className="w-8 px-2 py-3" />
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Code</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Entity Name</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Legal Name</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Country</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Currency</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Parent</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><span className="inline-block h-4 w-16 rounded bg-gray-100 animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : entities.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">
                      No entities found. Add your first entity or import from Excel.
                    </td>
                  </tr>
                ) : (
                  entities.map((row) => (
                    <>
                      <tr
                        key={row.id}
                        className="border-b border-border hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => toggleExpand(row.id)}
                      >
                        <td className="px-2 py-2.5 text-gray-400">
                          {expandedId === row.id
                            ? <ChevronDown className="w-3.5 h-3.5" />
                            : <ChevronRight className="w-3.5 h-3.5" />}
                        </td>
                        <td className="px-4 py-2.5">
                          <code className="font-mono text-xs font-medium">{row.code}</code>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-foreground font-medium">{row.name}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {row.legalName ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {row.country ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {row.currency
                            ? <span className="font-mono">{row.currency}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {row.parentCode
                            ? <span className="font-mono">[{row.parentCode}] {row.parentName}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium",
                            row.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          )}>
                            {row.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setEditRecord(row); setFormOpen(true); }}
                              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(row)}
                              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Consolidation expand row */}
                      {expandedId === row.id && (
                        <tr key={`${row.id}-consol`} className="border-b border-border bg-purple-50/30">
                          <td />
                          <td colSpan={8} className="px-4 py-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-purple-600">
                                Consolidation Properties
                              </span>
                              <span className="h-px flex-1 bg-purple-100" />
                            </div>
                            {consolEditId === row.id ? (
                              <ConsolidationEditForm
                                entity={row}
                                onSave={(updates) => handleSaveConsolidation(row.id, updates)}
                                onCancel={() => setConsolEditId(null)}
                              />
                            ) : (
                              <ConsolidationPanel
                                entity={row}
                                onEdit={() => setConsolEditId(row.id)}
                              />
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
            {/* Pagination */}
            {!loading && total > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-border px-4 py-2 bg-gray-50">
                <p className="text-xs text-gray-400">
                  {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                </p>
                <div className="flex items-center gap-1">
                  <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                    className="h-7 px-3 rounded text-xs border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors">
                    Prev
                  </button>
                  <button disabled={page * PAGE_SIZE >= total} onClick={() => setPage(page + 1)}
                    className="h-7 px-3 rounded text-xs border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors">
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tree view */}
        {tab === "tree" && (
          <MetadataTree
            nodes={treeData}
            onEdit={(node) => { const e = entities.find((x) => x.id === node.id); if (e) { setEditRecord(e); setFormOpen(true); } }}
            onDelete={(node) => { const e = entities.find((x) => x.id === node.id); if (e) handleDelete(e); }}
            onAdd={() => { setEditRecord(null); setV2DialogOpen(true); }}
          />
        )}
      </main>

      {/* Legacy edit modal — kept until Slice 3.2 ships v2 edit dialog */}
      {formOpen && (
        <EntityForm
          entity={editRecord}
          entities={entities}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditRecord(null); }}
        />
      )}

      {/* v2 Add Entity dialog (Slice 3.1b) */}
      <AddMemberDialog
        open={v2DialogOpen}
        dim="entity"
        onClose={() => setV2DialogOpen(false)}
        onSaved={() => fetchEntities()}
      />
    </>
  );
}
