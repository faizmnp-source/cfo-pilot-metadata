"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { LayoutList, GitBranch } from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { DimensionTable, Column } from "@/components/metadata/DimensionTable";
import { MetadataTree, TreeNode } from "@/components/metadata/MetadataTree";
import { EntityForm } from "@/components/metadata/EntityForm";
import { cn } from "@/lib/utils";

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

const COLUMNS: Column<Entity>[] = [
  {
    key: "code",
    label: "Code",
    sortable: true,
    render: (row) => <code className="font-mono text-xs font-medium">{row.code}</code>,
  },
  { key: "name", label: "Entity Name", sortable: true },
  {
    key: "legalName",
    label: "Legal Name",
    render: (row) => row.legalName ?? <span className="text-muted-foreground">—</span>,
  },
  {
    key: "country",
    label: "Country",
    render: (row) => row.country ?? <span className="text-muted-foreground">—</span>,
  },
  {
    key: "currency",
    label: "Currency",
    render: (row) => row.currency ? (
      <span className="font-mono text-xs">{row.currency}</span>
    ) : <span className="text-muted-foreground">—</span>,
  },
  {
    key: "parentCode",
    label: "Parent",
    render: (row) => row.parentCode ? (
      <span className="font-mono text-xs text-muted-foreground">[{row.parentCode}] {row.parentName}</span>
    ) : <span className="text-muted-foreground">—</span>,
  },
  {
    key: "isActive",
    label: "Status",
    render: (row) => (
      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium",
        row.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      )}>
        {row.isActive ? "Active" : "Inactive"}
      </span>
    ),
  },
];

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
  const [editRecord, setEditRecord] = useState<Entity | null>(null);
  const PAGE_SIZE = 20;

  const fetchEntities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page), pageSize: String(PAGE_SIZE), search, sortBy: sortKey, sortDir,
      });
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

  const handleDelete = async (row: Entity) => {
    if (!confirm(`Delete entity [${row.code}] ${row.name}?`)) return;
    const res = await fetch(`/api/metadata/entities/${row.id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json(); toast.error(err.error ?? "Delete failed"); }
    else { toast.success("Entity deleted"); fetchEntities(); }
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
        <div className="mb-4 flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
          <button onClick={() => setTab("table")} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors", tab === "table" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <LayoutList className="h-3.5 w-3.5" /> Table View
          </button>
          <button onClick={() => setTab("tree")} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors", tab === "tree" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <GitBranch className="h-3.5 w-3.5" /> Hierarchy View
          </button>
        </div>

        {tab === "table" ? (
          <DimensionTable
            columns={COLUMNS} data={entities} total={total} page={page} pageSize={PAGE_SIZE}
            onPageChange={setPage}
            onSort={(key, dir) => { setSortKey(key); setSortDir(dir); }}
            sortKey={sortKey} sortDir={sortDir}
            onEdit={(row) => { setEditRecord(row); setFormOpen(true); }}
            onDelete={handleDelete} loading={loading}
            emptyMessage="No entities found. Add your first entity or import from Excel."
          />
        ) : (
          <MetadataTree
            nodes={treeData}
            onEdit={(node) => { const e = entities.find((x) => x.id === node.id); if (e) { setEditRecord(e); setFormOpen(true); } }}
            onDelete={(node) => { const e = entities.find((x) => x.id === node.id); if (e) handleDelete(e); }}
            onAdd={() => { setEditRecord(null); setFormOpen(true); }}
          />
        )}
      </main>

      {formOpen && (
        <EntityForm
          entity={editRecord}
          entities={entities}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditRecord(null); }}
        />
      )}
    </>
  );
}
