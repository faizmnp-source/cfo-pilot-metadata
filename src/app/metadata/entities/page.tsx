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
  const [editRecord, setEditRecord] = useState<Entity | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [consolEditId, setConsolEditId] = useState<st