"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  LayoutList, GitBranch, Download, ChevronDown, ChevronRight, Pencil,
  Check, X, Loader2,
} from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { DimensionTable, Column } from "@/components/metadata/DimensionTable";
import { MetadataTree, TreeNode } from "@/components/metadata/MetadataTree";
import { HierarchyTreeView } from "@/components/metadata/HierarchyTreeView";
import { AccountForm } from "@/components/metadata/AccountForm";
import { AddAccountDialog } from "@/components/metadata/v2/AddAccountDialog";
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
  // Behavior Engine fields
  aggregationType?: "SUM" | "AVERAGE" | "LAST_VALUE" | "WEIGHTED_AVG" | "NONE";
  flowType?: "BALANCE" | "FLOW";
  signBehavior?: "NORMAL" | "REVERSED";
  currencyType?: "TRANSACTIONAL" | "TRANSLATED" | "NONE";
  allowInput?: boolean;
  isCalculated?: boolean;
  formula?: string | null;
}

type Tab = "table" | "tree";

const TYPE_COLORS: Record<string, string> = {
  ASSET:     "bg-blue-100 text-blue-700",
  LIABILITY: "bg-red-100 text-red-700",
  EQUITY:    "bg-purple-100 text-purple-700",
  REVENUE:   "bg-green-100 text-green-700",
  EXPENSE:   "bg-amber-100 text-amber-700",
};

function buildTree(accounts: Account[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  accounts.forEach((a) =>
    map.set(a.id, { id: a.id, code: a.code, name: a.name, isActive: a.isActive, children: [] })
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

// Behavior Engine edit form (inline within expand row)
interface BehaviorEditFormProps {
  account: Account;
  onSave: (updates: Partial<Account>) => Promise<void>;
  onCancel: () => void;
}

function BehaviorEditForm({ account, onSave, onCancel }: BehaviorEditFormProps) {
  const [aggType, setAggType] = useState(account.aggregationType ?? "SUM");
  const [flowType, setFlowType] = useState(account.flowType ?? "BALANCE");
  const [signBehavior, setSignBehavior] = useState(account.signBehavior ?? "NORMAL");
  const [currencyType, setCurrencyType] = useState(account.currencyType ?? "TRANSACTIONAL");
  const [allowInput, setAllowInput] = useState(account.allowInput ?? true);
  const [isCalc, setIsCalc] = useState(account.isCalculated ?? false);
  const [formula, setFormula] = useState(account.formula ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        aggregationType: aggType,
        flowType,
        signBehavior,
        currencyType,
        allowInput,
        isCalculated: isCalc,
        formula: isCalc ? formula : null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mt-3">
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Aggregation Type</label>
        <select value={aggType} onChange={(e) => setAggType(e.target.value as any)}
          className="w-full rounded border border-gray-200 px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]">
          {["SUM","AVERAGE","LAST_VALUE","WEIGHTED_AVG","NONE"].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Flow Type</label>
        <select value={flowType} onChange={(e) => setFlowType(e.target.value as any)}
          className="w-full rounded border border-gray-200 px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]">
          <option value="BALANCE">BALANCE</option>
          <option value="FLOW">FLOW</option>
        </select>
      </div>
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Sign Behavior</label>
        <select value={signBehavior} onChange={(e) => setSignBehavior(e.target.value as any)}
          className="w-full rounded border border-gray-200 px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]">
          <option value="NORMAL">NORMAL</option>
          <option value="REVERSED">REVERSED</option>
        </select>
      </div>
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Currency Type</label>
        <select value={currencyType} onChange={(e) => setCurrencyType(e.target.value as any)}
          className="w-full rounded border border-gray-200 px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]">
          {["TRANSACTIONAL","TRANSLATED","NONE"].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id={`allow-${account.id}`} checked={allowInput} onChange={(e) => setAllowInput(e.target.checked)} className="w-3.5 h-3.5" />
        <label htmlFor={`allow-${account.id}`} className="text-xs text-gray-600 select-none">Allow Input</label>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id={`calc-${account.id}`} checked={isCalc} onChange={(e) => setIsCalc(e.target.checked)} className="w-3.5 h-3.5" />
        <label htmlFor={`calc-${account.id}`} className="text-xs text-gray-600 select-none">Is Calculated</label>
      </div>
      {isCalc && (
        <div className="md:col-span-2">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Formula</label>
          <input value={formula} onChange={(e) => setFormula(e.target.value)}
            className="w-full rounded border border-gray-200 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]"
            placeholder="e.g. [1000] + [1010]" />
        </div>
      )}
      <div className="md:col-span-4 flex items-center gap-2 pt-1">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1 h-6 px-3 rounded text-[10px] font-medium bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-700)] transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save Behavior
        </button>
        <button onClick={onCancel}
          className="flex items-center gap-1 h-6 px-3 rounded text-[10px] font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
          <X className="w-3 h-3" /> Cancel
        </button>
      </div>
    </div>
  );
}

// Behavior Engine read display
interface BehaviorPanelProps {
  account: Account;
  onEditBehavior: () => void;
}

function BehaviorPanel({ account, onEditBehavior }: BehaviorPanelProps) {
  return (
    <div className="flex flex-wrap items-start gap-4 py-2">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Aggregation</p>
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
          {account.aggregationType ?? "SUM"}
        </span>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Flow Type</p>
        <span className={cn("px-2 py-0.5 rounded text-xs font-medium",
          account.flowType === "FLOW" ? "bg-purple-50 text-purple-700" : "bg-blue-50 text-blue-700"
        )}>
          {account.flowType ?? "BALANCE"}
        </span>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Sign Behavior</p>
        <span className={cn("px-2 py-0.5 rounded text-xs font-medium",
          account.signBehavior === "REVERSED" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"
        )}>
          {account.signBehavior ?? "NORMAL"}
        </span>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Currency Type</p>
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
          {account.currencyType ?? "TRANSACTIONAL"}
        </span>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Allow Input</p>
        <span className={cn("px-2 py-0.5 rounded text-xs font-medium",
          account.allowInput !== false ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
        )}>
          {account.allowInput !== false ? "Yes" : "No"}
        </span>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Calculated</p>
        {account.isCalculated ? (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">Yes</span>
        ) : (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">No</span>
        )}
      </div>
      {account.isCalculated && account.formula && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Formula</p>
          <code className="px-2 py-0.5 rounded text-xs bg-gray-50 text-gray-700 border border-gray-200 font-mono">
            {account.formula}
          </code>
        </div>
      )}
      <div className="ml-auto">
        <button onClick={onEditBehavior}
          className="flex items-center gap-1 h-6 px-3 rounded text-[10px] font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors">
          <Pencil className="w-3 h-3" /> Edit Behavior
        </button>
      </div>
    </div>
  );
}

const COLUMNS: Column<Account>[] = [
  {
    key: "code",
    label: "Code",
    sortable: true,
    render: (row) => (
      <code className="font-mono text-xs font-medium text-foreground">{row.code}</code>
    ),
  },
  { key: "name", label: "Account Name", sortable: true },
  {
    key: "type",
    label: "Type",
    render: (row) => (
      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
        TYPE_COLORS[row.type] ?? "bg-muted text-muted-foreground"
      )}>
        {row.type}
      </span>
    ),
  },
  {
    key: "parentCode",
    label: "Parent",
    render: (row) =>
      row.parentCode ? (
        <span className="font-mono text-xs text-muted-foreground">[{row.parentCode}] {row.parentName}</span>
      ) : <span className="text-muted-foreground">—</span>,
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
      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium",
        row.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      )}>
        {row.isActive ? "Active" : "Inactive"}
      </span>
    ),
  },
  {
    key: "childCount",
    label: "Children",
    render: (row) => <span className="tabular-nums text-muted-foreground">{row.childCount ?? 0}</span>,
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
  const [v2DialogOpen, setV2DialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<Account | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [behaviorEditId, setBehaviorEditId] = useState<string | null>(null);
  const PAGE_SIZE = 20;

  // Map a v2 dimension_member row to the page's existing Account shape.
  const mapV2 = (m: any): Account => ({
    id: m.id,
    code: m.memberCode,
    name: m.memberName,
    type: m.properties?.account_type ?? "EXPENSE",
    parentId: null,
    reportingGroup: m.properties?.reporting_group ?? null,
    description: m.description ?? null,
    aggregationType: m.properties?.aggregation_type ?? "SUM",
    flowType: m.properties?.time_balance ?? "BALANCE",
    signBehavior: m.properties?.switch_sign ? "REVERSED" : "NORMAL",
    currencyType: m.properties?.currency_behavior ?? "TRANSACTIONAL",
    allowInput: m.properties?.allow_input ?? true,
    isCalculated: m.calculationType === "FORMULA",
    formula: m.formula ?? null,
    isActive: m.isActive,
    sortOrder: m.sortOrder ?? 0,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  });

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page), pageSize: String(PAGE_SIZE), search, sortBy: sortKey, sortDir,
      });
      // Try v2 first
      const v2res = await fetch(`/api/v2/members/account?${params}`, { credentials: "include" });
      if (v2res.ok) {
        const v2data = await v2res.json();
        const mapped = (v2data?.data?.data ?? []).map(mapV2);
        setAccounts(mapped);
        setTotal(v2data?.data?.total ?? mapped.length);
        setTreeData(buildTree(mapped));
        return;
      }
      // Fall back to legacy
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

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleSave = async (data: Partial<Account>) => {
    const url = editRecord ? `/api/metadata/accounts/${editRecord.id}` : "/api/metadata/accounts";
    const method = editRecord ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? "Save failed"); }
    toast.success(editRecord ? "Account updated" : "Account created");
    setFormOpen(false); setEditRecord(null); fetchAccounts();
  };

  const handleSaveBehavior = async (id: string, updates: Partial<Account>) => {
    const res = await fetch(`/api/metadata/accounts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? "Failed to update behavior");
      return;
    }
    toast.success("Behavior properties updated");
    setBehaviorEditId(null);
    fetchAccounts();
  };

  const handleDelete = async (row: Account) => {
    if (!confirm(`Delete account [${row.code}] ${row.name}?`)) return;
    const res = await fetch(`/api/metadata/accounts/${row.id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json(); toast.error(err.error ?? "Delete failed"); }
    else { toast.success("Account deleted"); fetchAccounts(); }
  };

  const handleExport = () => {
    const rows = [
      ["code", "name", "type", "reportingGroup", "isActive"],
      ...accounts.map((a) => [a.code, a.name, a.type, a.reportingGroup ?? "", String(a.isActive)]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "accounts.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
    if (expandedId !== id) setBehaviorEditId(null);
  };

  return (
    <>
      <MetadataHeader
        title="Chart of Accounts"
        subtitle={`${total.toLocaleString()} accounts`}
        onAdd={() => { setEditRecord(null); setV2DialogOpen(true); }}
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

        {/* Table view with behavior expansion */}
        {tab === "table" && (
          <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50">
                  <th className="w-8 px-2 py-3" />
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Code</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Account Name</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Type</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Parent</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Reporting Group</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Children</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <span className="inline-block h-4 w-16 rounded bg-gray-100 animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : accounts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">
                      No accounts found. Add your first account or import from Excel.
                    </td>
                  </tr>
                ) : (
                  accounts.map((row) => (
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
                          <code className="font-mono text-xs font-medium text-foreground">{row.code}</code>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-foreground">{row.name}</td>
                        <td className="px-4 py-2.5">
                          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                            TYPE_COLORS[row.type] ?? "bg-muted text-muted-foreground"
                          )}>
                            {row.type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {row.parentCode
                            ? <span className="font-mono">[{row.parentCode}] {row.parentName}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {row.reportingGroup ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium",
                            row.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          )}>
                            {row.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-muted-foreground">{row.childCount ?? 0}</td>
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

                      {/* Behavior Engine expand row */}
                      {expandedId === row.id && (
                        <tr key={`${row.id}-behavior`} className="border-b border-border bg-blue-50/40">
                          <td />
                          <td colSpan={8} className="px-4 py-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
                                Behavior Engine
                              </span>
                              <span className="h-px flex-1 bg-blue-100" />
                            </div>
                            {behaviorEditId === row.id ? (
                              <BehaviorEditForm
                                account={row}
                                onSave={(updates) => handleSaveBehavior(row.id, updates)}
                                onCancel={() => setBehaviorEditId(null)}
                              />
                            ) : (
                              <BehaviorPanel
                                account={row}
                                onEditBehavior={() => setBehaviorEditId(row.id)}
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

        {/* Tree view — OneStream/EPM-style expandable, fed by /api/v2/hierarchy */}
        {tab === "tree" && (
          <HierarchyTreeView dimensionSlug="account" hierarchyCode="default" />
        )}
      </main>

      {/* Legacy edit modal (kept until Slice 3.2 ships v2 edit dialog) */}
      {formOpen && (
        <AccountForm
          account={editRecord}
          accounts={accounts}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditRecord(null); }}
        />
      )}

      {/* v2 Add Account dialog (Slice 3.1) — typed properties, posts to /api/v2/members/account */}
      <AddAccountDialog
        open={v2DialogOpen}
        onClose={() => setV2DialogOpen(false)}
        onSaved={() => fetchAccounts()}
      />
    </>
  );
}
