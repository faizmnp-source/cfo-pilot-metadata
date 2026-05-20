"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { LayoutList, GitBranch, Download } from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { DimensionTable, Column } from "@/components/metadata/DimensionTable";
import { MetadataTree, TreeNode } from "@/components/metadata/MetadataTree";
import { AccountForm } from "@/components/metadata/AccountForm";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId: string | null;
  parentCode?: string;
  parentName?: string;
  reportingGroup: string | null;
  isActive: boolean;
  childCount?: number;
  createdAt: string;
}

type Tab = "table" | "tree";

const TYPE_COLORS: Record<string, string> = {
  ASSET: "bg-blue-100 text-blue-700",
  LIABILITY: "bg-red-100 text-red-700",
  EQUITY: "bg-purple-100 text-purple-700",
  REVENUE: "bg-green-100 text-green-700",
  EXPENSE: "bg-amber-100 text-amber-700",
};

function buildTree(accounts: Account[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  accounts.forEach((a) =>
    map.set(a.id, {
      id: a.id,
      code: a.code,
      name: a.name,
      isActive: a.isActive,
      children: [],
    })
  );
  const roots: TreeNode[] = [];
  accounts.forEach((a) => {
    const node = map.get(a.id)!;
    if (a.parentId && map.has(a.parentId)) {
      map.get(a.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

const COLUMNS: Column<Account>[] = [
  {
    key: "code",
    label: "Code",
    sortable: true,
    render: (row) => (
      <code className="font-mono text-xs font-medium text-foreground">
        {row.code}
      </code>
    ),
  },
  { key: "name", label: "Account Name", sortable: true },
  {
    key: "type",
    label: "Type",
    render: (row) => (
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
          TYPE_COLORS[row.type] ?? "bg-muted text-muted-foreground"
        )}
      >
        {row.type}
      </span>
    ),
  },
  {
    key: "parentCode",
    label: "Parent",
    render: (row) =>
      row.parentCode ? (
        <span className="font-mono text-xs text-muted-foreground">
          [{row.parentCode}] {row.parentName}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "reportingGroup",
    label: "Reporting Group",
    render: (row) => row.reportingGroup ?? <span className="text-muted-foreground">—</span>,
  },
  {
    key: "isActive",
    label: "Status",
    render: (row) => (
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[10px] font-medium",
          row.isActive
            ? "bg-green-100 text-green-700"
            : "bg-red-100 text-red-700"
        )}
      >
        {row.isActive ? "Active" : "Inactive"}
      </span>
    ),
  },
  {
    key: "childCount",
    label: "Children",
    render: (row) => (
      <span className="tabular-nums text-muted-foreground">
        {row.childCount ?? 0}
      </span>
    ),
  },
];

export default function AccountsPage() {
  const [tab, setTab] = useState<Tab>("table");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Account | null>(null);
  const PAGE_SIZE = 20;

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        search,
        sortBy: sortKey,
        sortDir,
      });
      const res = await fetch(`/api/metadata/accounts?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAccounts(data.data ?? []);
      setTotal(data.total ?? 0);
      setTreeData(buildTree(data.allRecords ?? data.data ?? []));
    } catch {
      toast.error("Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, [page, search, sortKey, sortDir]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleSave = async (data: Partial<Account>) => {
    const url = editRecord
      ? `/api/metadata/accounts/${editRecord.id}`
      : "/api/metadata/accounts";
    const method = editRecord ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Save failed");
    }
    toast.success(editRecord ? "Account updated" : "Account created");
    setFormOpen(false);
    setEditRecord(null);
    fetchAccounts();
  };

  const handleDelete = async (row: Account) => {
    if (!confirm(`Delete account [${row.code}] ${row.name}?`)) return;
    const res = await fetch(`/api/metadata/accounts/${row.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? "Delete failed");
    } else {
      toast.success("Account deleted");
      fetchAccounts();
    }
  };

  const handleExport = () => {
    const rows = [
      ["code", "name", "type", "reportingGroup", "isActive"],
      ...accounts.map((a) => [
        a.code,
        a.name,
        a.type,
        a.reportingGroup ?? "",
        String(a.isActive),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "accounts.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <MetadataHeader
        title="Chart of Accounts"
        subtitle={`${total.toLocaleString()} accounts`}
        onAdd={() => { setEditRecord(null); setFormOpen(true); }}
        addLabel="Add Account"
        onExport={handleExport}
        onRefresh={fetchAccounts}
        showSearch
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search by code or name..."
      />

      <main className="flex-1 overflow-y-auto bg-background p-6">
        {/* Tab switcher */}
        <div className="mb-4 flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
          <button
            onClick={() => setTab("table")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "table"
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutList className="h-3.5 w-3.5" />
            Table View
          </button>
          <button
            onClick={() => setTab("tree")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "tree"
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <GitBranch className="h-3.5 w-3.5" />
            Hierarchy View
          </button>
        </div>

        {/* Table view */}
        {tab === "table" && (
          <DimensionTable
            columns={COLUMNS}
            data={accounts}
            total={total}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            onSort={(key, dir) => { setSortKey(key); setSortDir(dir); }}
            sortKey={sortKey}
            sortDir={sortDir}
            onEdit={(row) => { setEditRecord(row); setFormOpen(true); }}
            onDelete={handleDelete}
            loading={loading}
            emptyMessage="No accounts found. Add your first account or import from Excel."
          />
        )}

        {/* Tree view */}
        {tab === "tree" && (
          <MetadataTree
            nodes={treeData}
            onEdit={(node) => {
              const account = accounts.find((a) => a.id === node.id);
              if (account) { setEditRecord(account); setFormOpen(true); }
            }}
            onDelete={(node) => {
              const account = accounts.find((a) => a.id === node.id);
              if (account) handleDelete(account);
            }}
            onAdd={(parent) => {
              setEditRecord(null);
              setFormOpen(true);
            }}
          />
        )}
      </main>

      {/* Form modal */}
      {formOpen && (
        <AccountForm
          account={editRecord}
          accounts={accounts}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditRecord(null); }}
        />
      )}
    </>
  );
}
