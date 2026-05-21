"use client";

// v2 HierarchyTreeView with inline action buttons per node:
// Add Child · Add Sibling · Edit · Copy · Move · Delete
// All actions hit /api/v2/members/<dim> and /api/v2/hierarchy/<dim>.

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  ChevronRight, ChevronDown, Layers, FolderTree, RefreshCw,
  Plus, GitBranch, Pencil, Copy as CopyIcon, Trash2, ArrowRightLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AddMemberDialog, type SupportedDim } from "./AddMemberDialog";
import { MoveMemberDialog } from "./MoveMemberDialog";

export interface TreeNode {
  id: string;
  memberCode: string;
  memberName: string;
  operator?: "ADD" | "SUBTRACT" | "IGNORE";
  weight?: number;
  parentId?: string | null;
  children: TreeNode[];
}

interface Props {
  dimensionSlug: SupportedDim;
  hierarchyCode?: string;
  className?: string;
}

export function HierarchyTreeView({
  dimensionSlug, hierarchyCode = "default", className,
}: Props) {
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [orphans, setOrphans] = useState<TreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [addContext, setAddContext] = useState<{ parentId: string | null } | null>(null);
  const [editContext, setEditContext] = useState<{ node: TreeNode } | null>(null);
  const [copyContext, setCopyContext] = useState<{ node: TreeNode } | null>(null);
  const [moveContext, setMoveContext] = useState<{ node: TreeNode } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch tree + all members so orphans (no edges yet) show too
      const [treeRes, membersRes] = await Promise.all([
        fetch(`/api/v2/hierarchy/${dimensionSlug}?hierarchy=${hierarchyCode}&format=tree`, { credentials: "include" }),
        fetch(`/api/v2/members/${dimensionSlug}?pageSize=500`, { credentials: "include" }),
      ]);
      const treeData = await treeRes.json();
      const memberData = await membersRes.json();
      if (!treeRes.ok) throw new Error(treeData?.error ?? "Failed to load tree");
      const tNodes: TreeNode[] = treeData?.data?.tree ?? [];
      setTree(tNodes);

      // Compute orphans = members not appearing anywhere in the tree
      const inTreeIds = new Set<string>();
      function walk(n: TreeNode) { inTreeIds.add(n.id); n.children.forEach(walk); }
      tNodes.forEach(walk);
      const allMembers = memberData?.data?.data ?? [];
      const orphanNodes: TreeNode[] = allMembers
        .filter((m: any) => !inTreeIds.has(m.id))
        .map((m: any) => ({
          id: m.id, memberCode: m.memberCode, memberName: m.memberName,
          parentId: null, children: [],
        }));
      setOrphans(orphanNodes);
    } catch (e: any) {
      setError(e.message ?? "Failed to load tree");
      setTree([]);
      setOrphans([]);
    } finally {
      setLoading(false);
    }
  }, [dimensionSlug, hierarchyCode]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
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

  const handleDelete = async (node: TreeNode) => {
    if (!confirm(`Delete ${node.memberCode} — ${node.memberName}?\n(Soft delete; can be reactivated.)`)) return;
    try {
      const res = await fetch(`/api/v2/members/${dimensionSlug}/${node.id}`, {
        method: "DELETE", credentials: "include",
      });
      let data: any = {}; try { data = await res.json(); } catch {}
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      toast.success(`Deleted ${node.memberCode}`);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    }
  };

  if (loading) {
    return (
      <div className={cn("p-6 text-sm text-muted-foreground", className)}>
        <RefreshCw className="inline h-4 w-4 mr-2 animate-spin" />Loading hierarchy…
      </div>
    );
  }

  const empty = (!tree || tree.length === 0) && orphans.length === 0;
  if (empty) {
    return (
      <div className={cn("p-6 text-sm text-muted-foreground", className)}>
        <FolderTree className="inline h-4 w-4 mr-2" />
        No members yet in the <code>{dimensionSlug}</code> dimension. Add the first one to start building the hierarchy.
        {error && <div className="mt-2 text-amber-600 text-xs">⚠️ {error}</div>}
        <div className="mt-3">
          <button onClick={() => setAddContext({ parentId: null })}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="inline h-3.5 w-3.5 mr-1" /> Add first member
          </button>
        </div>
        {addContext && <AddMemberDialog open dim={dimensionSlug} onClose={() => setAddContext(null)} onSaved={() => load()} />}
      </div>
    );
  }

  return (
    <div className={cn("bg-white rounded-xl border border-border", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Layers className="h-4 w-4 text-primary" />
          Hierarchy <code className="text-xs text-muted-foreground">({hierarchyCode})</code>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setAddContext({ parentId: null })}
            className="flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20">
            <Plus className="h-3 w-3" /> Add Root
          </button>
          <button onClick={expandAll} className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted">Expand all</button>
          <button onClick={collapseAll} className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted">Collapse all</button>
          <button onClick={load} title="Refresh" className="rounded p-1 text-muted-foreground hover:bg-muted">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <ul className="p-2 font-mono text-sm">
        {(tree ?? []).map((node) => (
          <TreeRow key={node.id} node={node} depth={0} expanded={expanded} onToggle={toggle}
            onAddChild={(n) => setAddContext({ parentId: n.id })}
            onEdit={(n) => setEditContext({ node: n })}
            onCopy={(n) => setCopyContext({ node: n })}
            onMove={(n) => setMoveContext({ node: n })}
            onDelete={handleDelete}
          />
        ))}
        {orphans.length > 0 && (
          <li className="mt-3">
            <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 rounded">
              Unparented members ({orphans.length}) — drag/move into the tree above
            </div>
            <ul>
              {orphans.map((node) => (
                <TreeRow key={node.id} node={node} depth={0} expanded={expanded} onToggle={toggle}
                  onAddChild={(n) => setAddContext({ parentId: n.id })}
                  onEdit={(n) => setEditContext({ node: n })}
                  onCopy={(n) => setCopyContext({ node: n })}
                  onMove={(n) => setMoveContext({ node: n })}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          </li>
        )}
      </ul>

      {/* Dialogs */}
      {addContext && (
        <AddMemberDialog
          open
          dim={dimensionSlug}
          parentMemberId={addContext.parentId ?? undefined}
          onClose={() => setAddContext(null)}
          onSaved={() => { setAddContext(null); load(); }}
        />
      )}
      {editContext && (
        <AddMemberDialog
          open
          dim={dimensionSlug}
          mode="edit"
          memberId={editContext.node.id}
          onClose={() => setEditContext(null)}
          onSaved={() => { setEditContext(null); load(); }}
        />
      )}
      {copyContext && (
        <AddMemberDialog
          open
          dim={dimensionSlug}
          mode="copy"
          memberId={copyContext.node.id}
          onClose={() => setCopyContext(null)}
          onSaved={() => { setCopyContext(null); load(); }}
        />
      )}
      {moveContext && (
        <MoveMemberDialog
          open
          dim={dimensionSlug}
          memberId={moveContext.node.id}
          memberLabel={`${moveContext.node.memberCode} — ${moveContext.node.memberName}`}
          hierarchyCode={hierarchyCode}
          onClose={() => setMoveContext(null)}
          onMoved={() => { setMoveContext(null); load(); }}
        />
      )}
    </div>
  );
}

interface RowProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onAddChild: (n: TreeNode) => void;
  onEdit: (n: TreeNode) => void;
  onCopy: (n: TreeNode) => void;
  onMove: (n: TreeNode) => void;
  onDelete: (n: TreeNode) => void;
}

function TreeRow(p: RowProps) {
  const { node, depth, expanded, onToggle } = p;
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  return (
    <li>
      <div className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/60"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}>
        <button
          onClick={() => hasChildren && onToggle(node.id)}
          className={cn("flex-shrink-0", hasChildren ? "cursor-pointer" : "cursor-default")}
          title={hasChildren ? "Expand / collapse" : "Leaf node"}
        >
          {hasChildren
            ? (isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />)
            : <span className="inline-block h-3.5 w-3.5" />}
        </button>
        {node.operator && (
          <span className={cn("rounded px-1 text-[10px] font-bold",
            node.operator === "ADD" ? "bg-emerald-100 text-emerald-700" :
            node.operator === "SUBTRACT" ? "bg-red-100 text-red-700" :
            "bg-gray-100 text-gray-500"
          )} title={`Operator: ${node.operator}`}>
            {node.operator === "ADD" ? "+" : node.operator === "SUBTRACT" ? "−" : "~"}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{node.memberCode}</span>
        <span className="truncate text-foreground">{node.memberName}</span>
        {hasChildren && (
          <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">{node.children.length}</span>
        )}

        {/* Action buttons — visible on hover */}
        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <ActionBtn title="Add child"        onClick={() => p.onAddChild(node)}><Plus className="h-3.5 w-3.5" /></ActionBtn>
          <ActionBtn title="Edit / rename"    onClick={() => p.onEdit(node)}><Pencil className="h-3.5 w-3.5" /></ActionBtn>
          <ActionBtn title="Copy / duplicate" onClick={() => p.onCopy(node)}><CopyIcon className="h-3.5 w-3.5" /></ActionBtn>
          <ActionBtn title="Move"             onClick={() => p.onMove(node)}><ArrowRightLeft className="h-3.5 w-3.5" /></ActionBtn>
          <ActionBtn title="Delete"           onClick={() => p.onDelete(node)} danger><Trash2 className="h-3.5 w-3.5" /></ActionBtn>
        </div>
      </div>
      {hasChildren && isOpen && (
        <ul>{node.children.map((c) => <TreeRow key={c.id} {...p} node={c} depth={depth + 1} />)}</ul>
      )}
    </li>
  );
}

function ActionBtn({ title, onClick, danger, children }:
  { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      className={cn(
        "rounded p-1 transition-colors",
        danger
          ? "text-muted-foreground hover:bg-red-50 hover:text-red-600"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >{children}</button>
  );
}
