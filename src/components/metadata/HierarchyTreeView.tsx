"use client";

// OneStream / EPM-style expandable hierarchy tree.
// Fetches from /api/v2/hierarchy/<dim>?format=tree and renders a collapsed
// tree by default. User clicks the chevron (▶ / ▼) to expand a branch.
//
// Usage:
//   <HierarchyTreeView dimensionSlug="account" hierarchyCode="default" />

import { useEffect, useState, useCallback } from "react";
import { ChevronRight, ChevronDown, Layers, FolderTree, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TreeNode {
  id: string;
  memberCode: string;
  memberName: string;
  operator?: "ADD" | "SUBTRACT" | "IGNORE";
  weight?: number;
  children: TreeNode[];
}

interface Props {
  dimensionSlug: string;          // e.g. "account", "entity"
  hierarchyCode?: string;          // default "default"
  className?: string;
}

export function HierarchyTreeView({
  dimensionSlug,
  hierarchyCode = "default",
  className,
}: Props) {
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v2/hierarchy/${dimensionSlug}?hierarchy=${hierarchyCode}&format=tree`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load tree");
      setTree(data?.data?.tree ?? []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load tree");
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, [dimensionSlug, hierarchyCode]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const all = new Set<string>();
    function walk(n: TreeNode) { all.add(n.id); n.children.forEach(walk); }
    (tree ?? []).forEach(walk);
    setExpanded(all);
  };
  const collapseAll = () => setExpanded(new Set());

  if (loading) {
    return (
      <div className={cn("p-6 text-sm text-muted-foreground", className)}>
        <RefreshCw className="inline h-4 w-4 mr-2 animate-spin" />
        Loading hierarchy…
      </div>
    );
  }

  if (error || !tree || tree.length === 0) {
    return (
      <div className={cn("p-6 text-sm text-muted-foreground", className)}>
        <FolderTree className="inline h-4 w-4 mr-2" />
        No hierarchy yet for the <code>{dimensionSlug}</code> dimension.
        Add edges via the API or the "Move to…" action on a member.
        {error && <div className="mt-2 text-amber-600 text-xs">⚠️ {error}</div>}
      </div>
    );
  }

  return (
    <div className={cn("bg-white rounded-xl border border-border", className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Layers className="h-4 w-4 text-primary" />
          Hierarchy <code className="text-xs text-muted-foreground">({hierarchyCode})</code>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={expandAll}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Expand all
          </button>
          <button
            onClick={collapseAll}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Collapse all
          </button>
          <button
            onClick={load}
            title="Refresh"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <ul className="p-2 font-mono text-sm">
        {tree.map((node) => (
          <TreeRow
            key={node.id}
            node={node}
            depth={0}
            expanded={expanded}
            onToggle={toggle}
          />
        ))}
      </ul>
    </div>
  );
}

interface RowProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}

function TreeRow({ node, depth, expanded, onToggle }: RowProps) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50",
          hasChildren ? "cursor-pointer" : "cursor-default"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => hasChildren && onToggle(node.id)}
      >
        {hasChildren ? (
          isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="inline-block h-3.5 w-3.5 flex-shrink-0" />
        )}
        {node.operator && (
          <span
            className={cn(
              "rounded px-1 text-[10px] font-bold",
              node.operator === "ADD" ? "bg-emerald-100 text-emerald-700" :
              node.operator === "SUBTRACT" ? "bg-red-100 text-red-700" :
              "bg-gray-100 text-gray-500"
            )}
            title={`Aggregation operator: ${node.operator}`}
          >
            {node.operator === "ADD" ? "+" : node.operator === "SUBTRACT" ? "−" : "~"}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{node.memberCode}</span>
        <span className="truncate text-foreground">{node.memberName}</span>
        {hasChildren && (
          <span className="ml-auto rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
            {node.children.length}
          </span>
        )}
      </div>
      {hasChildren && isOpen && (
        <ul>
          {node.children.map((c) => (
            <TreeRow
              key={c.id}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
