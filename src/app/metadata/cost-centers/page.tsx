"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { LayoutList, GitBranch } from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { DimensionTable, Column } from "@/components/metadata/DimensionTable";
import { MetadataTree, TreeNode } from "@/components/metadata/MetadataTree";
import { DimensionForm } from "@/components/metadata/DimensionForm";
import { cn } from "@/lib/utils";

interface CostCenter {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  parentCode?: string;
  parentName?: string;
  description: string | null;
  isActive: boolean;
  [key: string]: unknown;
  childCount?: number;
}

type Tab = "table" | "tree";

function buildTree(items: CostCenter[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  items.forEach((c) => map.set(c.id, { id: c.id, code: c.code, name: c.name, isActive: c.isActive, children: [] }));
  const roots: TreeNode[] = [];
  items.forEach((c) => {
    const node = map.get(c.id)!;
    if (c.parentId && map.has(c.parentId)) map.get(c.parentId)!.children!.push(node);
    else roots.push(node);
  });
  return roots;
}

const COLUMNS: Column<CostCenter>[] = [
  { key: "code", label: "Code", sortable: true, render: (row) => <code className="font-mono text-xs font-medium">{row.code}</code> },
  { key: "name", label: "Cost Center Name", sortable: true },
  { key: "parentCode", label: "Parent", render: (row) => row.parentCode ? <span className="font-mono text-xs text-muted-foreground">[{row.parentCode}] {row.parentName}</span> : <span className="text-muted-foreground">—</span> },
  { key: "description", label: "Description", render: (row) => <span className="text-xs text-muted-foreground">{row.description ?? "—"}</span> },
  { key: "childCount", label: "Sub-centers", render: (row) => <span className="tabular-nums text-muted-foreground">{row.childCount ?? 0}</span> },
  { key: "isActive", label: "Status", render: (row) => <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", row.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>{row.isActive ? "Active" : "Inactive"}</span> },
];

export default function CostCentersPage() {
  const [tab, setTab] = useState<Tab>("table");
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<CostCenter | null>(null);
  const PAGE_SIZE = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), search, sortBy: sortKey, sortDir });
      const res = await fetch(`/api/metadata/cost-centers?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCostCenters(data.data ?? []);
      setTotal(data.total ?? 0);
      setTreeData(buildTree(data.allRecords ?? data.data ?? []));
    } catch { toast.error("Failed to load cost centers"); }
    finally { setLoading(false); }
  }, [page, search, sortKey, sortDir]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (formData: Record<string, unknown>) => {
    const url = editRecord ? `/api/metadata/cost-centers/${editRecord.id}` : "/api/metadata/cost-centers";
    const method = editRecord ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(formData) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? "Save failed"); }
    toast.success(editRecord ? "Cost center updated" : "Cost center created");
    setFormOpen(false); setEditRecord(null); fetchData();
  };

  const handleDelete = async (row: CostCenter) => {
    if (!confirm(`Delete cost center [${row.code}] ${row.name}?`)) return;
    const res = await fetch(`/api/metadata/cost-centers/${row.id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json(); toast.error(err.error ?? "Delete failed"); }
    else { toast.success("Cost center deleted"); fetchData(); }
  };

  return (
    <>
      <MetadataHeader
        title="Cost Centers"
        subtitle={`${total.toLocaleString()} cost centers`}
        onAdd={() => { setEditRecord(null); setFormOpen(true); }}
        addLabel="Add Cost Center"
        onRefresh={fetchData}
        showSearch
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search cost centers..."
      />

      <main className="flex-1 overflow-y-auto bg-background p-6">
        <div className="mb-4 flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
          <button onClick={() => setTab("table")} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors", tab === "table" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground")}>
            <LayoutList className="h-3.5 w-3.5" /> Table View
          </button>
          <button onClick={() => setTab("tree")} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors", tab === "tree" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground")}>
            <GitBranch className="h-3.5 w-3.5" /> Hierarchy View
          </button>
        </div>

        {tab === "table" ? (
          <DimensionTable
            columns={COLUMNS} data={costCenters} total={total} page={page} pageSize={PAGE_SIZE}
            onPageChange={setPage}
            onSort={(key, dir) => { setSortKey(key); setSortDir(dir); }}
            sortKey={sortKey} sortDir={sortDir}
            onEdit={(row) => { setEditRecord(row); setFormOpen(true); }}
            onDelete={handleDelete} loading={loading}
            emptyMessage="No cost centers found."
          />
        ) : (
          <MetadataTree
            nodes={treeData}
            onEdit={(node) => { const c = costCenters.find((x) => x.id === node.id); if (c) { setEditRecord(c); setFormOpen(true); } }}
            onDelete={(node) => { const c = costCenters.find((x) => x.id === node.id); if (c) handleDelete(c); }}
            onAdd={() => { setEditRecord(null); setFormOpen(true); }}
          />
        )}
      </main>

      {formOpen && (
        <DimensionForm
          title={editRecord ? "Edit Cost Center" : "Add Cost Center"}
          subtitle="Cost center for budget allocation"
          record={editRecord}
          records={costCenters}
          onSave={handleSave as (data: Partial<{ id: string; code: string; name: string; parentId: string | null; description: string | null; isActive: boolean }>) => Promise<void>}
          onClose={() => { setFormOpen(false); setEditRecord(null); }}
        />
      )}
    </>
  );
}
