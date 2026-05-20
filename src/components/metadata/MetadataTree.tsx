"use client";

import { useState, useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  Search,
  X,
  Edit,
  Trash2,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface TreeNode {
  id: string;
  code: string;
  name: string;
  children?: TreeNode[];
  level?: number;
  isActive?: boolean;
  metadata?: Record<string, string | number | boolean>;
}

interface MetadataTreeProps {
  nodes: TreeNode[];
  onEdit?: (node: TreeNode) => void;
  onDelete?: (node: TreeNode) => void;
  onAdd?: (parentNode?: TreeNode) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  canAdd?: boolean;
  className?: string;
}

function buildFlatList(nodes: TreeNode[], level = 0): (TreeNode & { level: number })[] {
  return nodes.flatMap((node) => [
    { ...node, level },
    ...(node.children ? buildFlatList(node.children, level + 1) : []),
  ]);
}

function TreeNodeRow({
  node,
  expanded,
  hasChildren,
  onToggle,
  onEdit,
  onDelete,
  onAdd,
  canEdit,
  canDelete,
  canAdd,
  isMatch,
}: {
  node: TreeNode & { level: number };
  expanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  onEdit?: (n: TreeNode) => void;
  onDelete?: (n: TreeNode) => void;
  onAdd?: (n: TreeNode) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  canAdd?: boolean;
  isMatch: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const indent = node.level * 20;

  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors",
        isMatch
          ? "bg-yellow-50 ring-1 ring-yellow-300"
          : hovered
          ? "bg-muted/50"
          : "hover:bg-muted/30"
      )}
      style={{ paddingLeft: `${8 + indent}px` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Expand/collapse */}
      <button
        onClick={onToggle}
        className={cn(
          "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors",
          !hasChildren && "invisible"
        )}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Folder icon */}
      <span className="flex-shrink-0 text-muted-foreground">
        {hasChildren && expanded ? (
          <FolderOpen className="h-4 w-4 text-amber-500" />
        ) : hasChildren ? (
          <Folder className="h-4 w-4 text-amber-400" />
        ) : (
          <div className="h-4 w-4 rounded border border-border bg-muted/30" />
        )}
      </span>

      {/* Code + name */}
      <div className="min-w-0 flex-1">
        <span className="font-mono text-xs text-muted-foreground">
          [{node.code}]
        </span>{" "}
        <span className="text-foreground">{node.name}</span>
      </div>

      {/* Active badge */}
      {node.isActive === false && (
        <span className="flex-shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
          Inactive
        </span>
      )}

      {/* Actions (visible on hover) */}
      <div
        className={cn(
          "flex flex-shrink-0 items-center gap-0.5 transition-opacity",
          hovered ? "opacity-100" : "opacity-0"
        )}
      >
        {canAdd && onAdd && (
          <button
            onClick={() => onAdd(node)}
            title="Add child"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
        {canEdit && onEdit && (
          <button
            onClick={() => onEdit(node)}
            title="Edit"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-blue-50 hover:text-blue-600 transition-colors"
          >
            <Edit className="h-3 w-3" />
          </button>
        )}
        {canDelete && onDelete && (
          <button
            onClick={() => onDelete(node)}
            title="Delete"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export function MetadataTree({
  nodes,
  onEdit,
  onDelete,
  onAdd,
  canEdit = true,
  canDelete = true,
  canAdd = true,
  className,
}: MetadataTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Collect all node ids for expand-all
  const allIds = useMemo(() => {
    const ids = new Set<string>();
    function collect(n: TreeNode[]) {
      n.forEach((node) => {
        if (node.children?.length) {
          ids.add(node.id);
          collect(node.children);
        }
      });
    }
    collect(nodes);
    return ids;
  }, [nodes]);

  const expandAll = () => setExpandedIds(new Set(allIds));
  const collapseAll = () => setExpandedIds(new Set());

  const toggleNode = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Search: find matching node ids + their ancestors
  const matchIds = useMemo(() => {
    if (!search.trim()) return new Set<string>();
    const q = search.toLowerCase();
    const matches = new Set<string>();
    function check(n: TreeNode) {
      if (n.code.toLowerCase().includes(q) || n.name.toLowerCase().includes(q)) {
        matches.add(n.id);
      }
      n.children?.forEach(check);
    }
    nodes.forEach(check);
    return matches;
  }, [nodes, search]);

  // When searching, auto-expand parents of matches
  const visibleExpandedIds = useMemo(() => {
    if (!search.trim()) return expandedIds;
    const expanded = new Set(expandedIds);
    // expand parents of matched nodes
    function expandParents(n: TreeNode[], parentIds: string[]) {
      n.forEach((node) => {
        if (matchIds.has(node.id)) {
          parentIds.forEach((pid) => expanded.add(pid));
        }
        if (node.children?.length) {
          expandParents(node.children, [...parentIds, node.id]);
        }
      });
    }
    expandParents(nodes, []);
    return expanded;
  }, [expandedIds, matchIds, nodes, search]);

  // Build flat visible list
  const flatList = useMemo(() => {
    const result: (TreeNode & { level: number })[] = [];
    function traverse(n: TreeNode[], level: number) {
      n.forEach((node) => {
        result.push({ ...node, level });
        if (node.children?.length && visibleExpandedIds.has(node.id)) {
          traverse(node.children, level + 1);
        }
      });
    }
    traverse(nodes, 0);
    return result;
  }, [nodes, visibleExpandedIds]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Search + controls */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-muted/30 pl-8 pr-7 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={expandAll}
          className="h-8 rounded-md border border-input px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          Expand All
        </button>
        <button
          onClick={collapseAll}
          className="h-8 rounded-md border border-input px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          Collapse All
        </button>
        {canAdd && onAdd && (
          <button
            onClick={() => onAdd()}
            className="flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add Root
          </button>
        )}
      </div>

      {/* Search info */}
      {search && matchIds.size > 0 && (
        <p className="text-xs text-muted-foreground">
          Found {matchIds.size} matching node{matchIds.size !== 1 ? "s" : ""}
        </p>
      )}
      {search && matchIds.size === 0 && (
        <p className="text-xs text-muted-foreground">No matches found</p>
      )}

      {/* Tree */}
      <div className="overflow-y-auto rounded-lg border border-border bg-white p-2">
        {flatList.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No hierarchy data available
          </div>
        ) : (
          flatList.map((node) => (
            <TreeNodeRow
              key={node.id}
              node={node}
              expanded={visibleExpandedIds.has(node.id)}
              hasChildren={!!(node.children?.length)}
              onToggle={() => toggleNode(node.id)}
              onEdit={onEdit}
              onDelete={onDelete}
              onAdd={onAdd}
              canEdit={canEdit}
              canDelete={canDelete}
              canAdd={canAdd}
              isMatch={matchIds.has(node.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
