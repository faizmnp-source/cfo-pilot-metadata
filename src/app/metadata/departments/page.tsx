"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { LayoutList, GitBranch } from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { DimensionTable, Column } from "@/components/metadata/DimensionTable";
import { MetadataTree, TreeNode } from "@/components/metadata/MetadataTree";
import { DimensionForm } from "@/components/metadata/DimensionForm";
import { cn } from "@/lib/utils";

interface Department {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  parentCode?: string;
  parentName?: string;
  description: string | null;
  isActive: boolean;
  childCount?: number;
}

type Tab = "table" | "tree";

function buildTree(items: Department[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  items.forEach((d) => map.set(d.id, { id: d.id, code: d.code, name: d.name, isActive: d.isActive, children: [] }));
  const roots: TreeNode[] = [];
  items.forEach((d) => {
    const node = map.get(d.id)!;
    if (d.parentId && map.has(d.parentId)) map.get(d.parentId)!.children!.push(node);
    else roots.push(node);
  });
  return roots;
}

const COLUMNS: Column<Department>[] = [
  { key: "code", label: "Code", sortable: true, render: (row) => <code className="font-mono text-xs font-medium">{row.code}</code> },
  { key: "name", label: "Department Name", sortable: true },
  { key: "parentCode", label: "Parent", render: (row) => row.parentCode ? <span className="font-mono text-xs text-muted-foreground">[{row.parentCode}] {row.parentName}</span> : <span className="text-muted-foreground">—</span> },
  { key: "description", label: "Description", render: (row) => <span className="text-muted-foreground text-xs">{row.description ?? "—"}</span> },
  { key: "childCount", label: "Sub-depts", render: (row) => <span className="tabular-nums text-muted-foreground">{row.childCount ?? 0}</span> },
  { key: "isActive", label: "Status", render: (row) => <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", row.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>{row.isActive ? "Active" : "Inactive"}</span> },
];

export default function DepartmentsPage() {
  const [tab, setTab] = useState<Tab>("table");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Department | null>(null);
  const PAGE_SIZE = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), search, sortBy: sortKey, sortDir });
      const res = await fetch(`/api/metadata/departments?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDepartments(data.data ?? []);
      setTotal(data.total ?? 0);
      setTreeData(buildTree(data.allRecords ?? data.data ?? []));
    } catch { toast.error("Failed to load departments"); }
    finally { setLoading(false); }
  }, [page, search, sortKey, sortDir]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (formData: Record<string, unknown>) => {
    const url = editRecord ? `/api/metadata/departments/${editRecord.id}` : "/api/metadata/departments";
    const method = editRecord ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(formData) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? "Save failed"); }
    toast.success(editRecord ? "Department updated" : "Department created");
    setFormOpen(false); setEditRecord(null); fetchData();
  };

  const handleDelete = async (row: Department) => {
    if (!confirm(`Delete department [${row.code}] ${row.name}?`)) return;
    const res = await fetch(`/api/metadata/departments/${row.id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json(); toast.error(err.error ?? "Delete failed"); }
    else { toast.success("Department deleted"); fetchData(); }
  };

  return (
    <>
      <MetadataHeader
        title="Departments"
        subtitle={`${total.toLocaleString()} departments`}
        onAdd={() => { setEditRecord(null); setFormOpen(true); }}
        addLabel="Add Department"
        onRefresh={fetchData}
        showSearch
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search departments..."
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
            columns={COLUMNS} data={departments} total={total} page={page} pageSize={PAGE_SIZE}
            onPageChange={setPage}
            onSort={(key, dir) => { setSortKey(key); setSortDir(dir); }}
            sortKey={sortKey} sortDir={sortDir}
            onEdit={(row) => { setEditRecord(row); setFormOpen(true); }}
            onDelete={handleDelete} loading={loading}
            emptyMessage="No departments found."
          />
        ) : (
          <MetadataTree
            nodes={treeData}
            onEdit={(node) => { const d = departments.find((x) => x.id === node.id); if (d) { setEditRecord(d); setFormOpen(true); } }}
            onDelete={(node) => { const d = departments.find((x) => x.id === node.id); if (d) handleDelete(d); }}
            onAdd={() => { setEditRecord(null); setFormOpen(true); }}
          />
        )}
      </main>

      {formOpen && (
        <DimensionForm
          title={editRecord ? "Edit Department" : "Add Department"}
          subtitle="Organizational department"
          record={editRecord}
          records={departments}
          onSave={handleSave as (data: Partial<{ id: string; code: string; name: string; parentId: string | null; description: string | null; isActive: boolean }>) => Promise<void>}
          onClose={() => { setFormOpen(false); setEditRecord(null); }}
        />
      )}
    </>
  );
}
