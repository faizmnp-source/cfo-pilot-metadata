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
          <span className="px-2 py-0.5 rounded te