"use client";

// v2 HierarchyTreeView — OneStream/EPBCS-style:
//   • Right-click any node → context menu (Add Child · Add Sibling · Edit · Copy · Move · Delete · Properties)
//   • Click a node → it's selected, the properties panel on the right shows all typed properties
//   • Double-click name → quick rename
//   • Hover action buttons kept as a secondary affordance for mouse users
//   • Delete key while a node is selected = delete

import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  ChevronRight, ChevronDown, Layers, FolderTree, RefreshCw,
  Plus, Pencil, Copy as CopyIcon, Trash2, ArrowRightLeft, GitBranch, Info,
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
  properties?: Record<string, any>;
  isActive?: boolean;
  children: TreeNode[];
}

interface Props {
  dimensionSlug: SupportedDim;
  hierarchyCode?: string;
  className?: string;
}

interface CtxMenu { x: number; y: number; node: TreeNode; }

export function HierarchyTreeView({
  dimensionSlug, hierarchyCode = "default", className,
}: Props) {
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [orphans, setOrphans] = useState<TreeNode[]>([]);
  const [memberById, setMemberById] = useState<Record<string, any>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

  // Dialog state
  const [addContext, setAddContext] = useState<{ parentId: string | null } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [copyId, setCopyId] = useState<string | null>(null);
  const [moveNode, setMoveNode] = useState<TreeNode | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [treeRes, membersRes] = await Promise.all([
        fetch(`/api/v2/hierarchy/${dimensionSlug}?hierarchy=${hierarchyCode}&format=tree`, { credentials: "include" }),
        fetch(`/api/v2/members/${dimensionSlug}?pageSize=500`, { credentials: "include" }),
      ]);
      const treeData = await treeRes.json();
      const memberData = await membersRes.json();
      if (!treeRes.ok) throw new Error(treeData?.error ?? "Failed to load tree");

      const allMembers = memberData?.data?.data ?? [];
      const lookup: Record<string, any> = {};
      for (const m of allMembers) lookup[m.id] = m;
      setMemberById(lookup);

      // Walk tree and stamp parentId on every node so Add Sibling works
      const tNodes: TreeNode[] = treeData?.data?.tree ?? [];
      function stamp(n: TreeNode, parentId: string | null) {
        n.parentId = parentId;
        // enrich with properties / isActive from member lookup
        if (lookup[n.id]) {
          n.properties = lookup[n.id].properties;
          n.isActive = lookup[n.id].isActive;
        }
        n.children.forEach((c) => stamp(c, n.id));
      }
      tNodes.forEach((n) => stamp(n, null));
      setTree(tNodes);

      // Orphans = active members not appearing anywhere in the tree
      const inTreeIds = new Set<string>();
      function walk(n: TreeNode) { inTreeIds.add(n.id); n.children.forEach(walk); }
      tNodes.forEach(walk);
      setOrphans(
        allMembers
          .filter((m: any) => !inTreeIds.has(m.id) && m.isActive)
          .map((m: any) => ({
            id: m.id, memberCode: m.memberCode, memberName: m.memberName,
            parentId: null, properties: m.properties, isActive: m.isActive,
            children: [],
          })),
      );
    } catch (e: any) {
      setError(e.message ?? "Failed to load tree");
      setTree([]);
      setOrphans([]);
    } finally {
      setLoading(false);
    }
  }, [dimensionSlug, hierarchyCode]);

  useEffect(() => { load(); }, [load]);

  // Close context menu on any outside click / escape
  useEffect(() => {
    if (!ctxMenu) return;
    const handle = (e: MouseEvent | KeyboardEvent) => {
      if ("key" in e && e.key !== "Escape") return;
      setCtxMenu(null);
    };
    window.addEventListener("click", handle);
    window.addEventListener("keydown", handle as any);
    return () => {
      window.removeEventListener("click", handle);
      window.removeEventListener("keydown", handle as any);
    };
  }, [ctxMenu]);

  // Delete key while a node is selected
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedId) {
        const n = findNode(tree ?? [], selectedId) ?? orphans.find((o) => o.id === selectedId);
        if (n) handleDelete(n);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, tree, orphans]);

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
      if (selectedId === node.id) setSelectedId(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    }
  };

  const openContextMenu = (e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(node.id);
    setCtxMenu({ x: e.clientX, y: e.clientY, node });
  };

  const selectedNode = selectedId
    ? (findNode(tree ?? [], selectedId) ?? orphans.find((o) => o.id === selectedId) ?? null)
    : null;

  // ─── Render ─────────────────────────────────────────────────────

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
    <div className={cn("grid grid-cols-3 gap-4", className)}>
      {/* Tree pane (2/3 width) */}
      <div className="col-span-2 bg-white rounded-xl border border-border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Layers className="h-4 w-4 text-primary" />
            Hierarchy <code className="text-xs text-muted-foreground">({hierarchyCode})</code>
            <span className="ml-2 text-[10px] text-muted-foreground">Right-click any node for actions</span>
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

        <ul className="p-2 font-mono text-sm" onClick={() => setSelectedId(null)}>
          {(tree ?? []).map((node) => (
            <TreeRow key={node.id} node={node} depth={0} expanded={expanded} onToggle={toggle}
              selectedId={selectedId} onSelect={setSelectedId}
              onContextMenu={openContextMenu}
              onAddChild={(n) => setAddContext({ parentId: n.id })}
              onEdit={(n) => setEditId(n.id)}
              onCopy={(n) => setCopyId(n.id)}
              onMove={(n) => setMoveNode(n)}
              onDelete={handleDelete}
            />
          ))}
          {orphans.length > 0 && (
            <li className="mt-3">
              <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 rounded">
                Unparented members ({orphans.length}) — right-click → Move into the tree
              </div>
              <ul>
                {orphans.map((node) => (
                  <TreeRow key={node.id} node={node} depth={0} expanded={expanded} onToggle={toggle}
                    selectedId={selectedId} onSelect={setSelectedId}
                    onContextMenu={openContextMenu}
                    onAddChild={(n) => setAddContext({ parentId: n.id })}
                    onEdit={(n) => setEditId(n.id)}
                    onCopy={(n) => setCopyId(n.id)}
                    onMove={(n) => setMoveNode(n)}
                    onDelete={handleDelete}
                  />
                ))}
              </ul>
            </li>
          )}
        </ul>
      </div>

      {/* Properties pane (1/3 width) */}
      <PropertiesPanel
        node={selectedNode}
        onEdit={() => selectedNode && setEditId(selectedNode.id)}
        onAddChild={() => selectedNode && setAddContext({ parentId: selectedNode.id })}
        onAddSibling={() => selectedNode && setAddContext({ parentId: selectedNode.parentId ?? null })}
        onCopy={() => selectedNode && setCopyId(selectedNode.id)}
        onMove={() => selectedNode && setMoveNode(selectedNode)}
        onDelete={() => selectedNode && handleDelete(selectedNode)}
      />

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y} node={ctxMenu.node}
          onAddChild={() => { setAddContext({ parentId: ctxMenu.node.id }); setCtxMenu(null); }}
          onAddSibling={() => { setAddContext({ parentId: ctxMenu.node.parentId ?? null }); setCtxMenu(null); }}
          onEdit={() => { setEditId(ctxMenu.node.id); setCtxMenu(null); }}
          onCopy={() => { setCopyId(ctxMenu.node.id); setCtxMenu(null); }}
          onMove={() => { setMoveNode(ctxMenu.node); setCtxMenu(null); }}
          onDelete={() => { handleDelete(ctxMenu.node); setCtxMenu(null); }}
          onShowProperties={() => { setSelectedId(ctxMenu.node.id); setCtxMenu(null); }}
        />
      )}

      {/* Dialogs */}
      {addContext && (
        <AddMemberDialog open dim={dimensionSlug} parentMemberId={addContext.parentId ?? undefined}
          onClose={() => setAddContext(null)} onSaved={() => { setAddContext(null); load(); }} />
      )}
      {editId && (
        <AddMemberDialog open dim={dimensionSlug} mode="edit" memberId={editId}
          onClose={() => setEditId(null)} onSaved={() => { setEditId(null); load(); }} />
      )}
      {copyId && (
        <AddMemberDialog open dim={dimensionSlug} mode="copy" memberId={copyId}
          onClose={() => setCopyId(null)} onSaved={() => { setCopyId(null); load(); }} />
      )}
      {moveNode && (
        <MoveMemberDialog open dim={dimensionSlug} memberId={moveNode.id}
          memberLabel={`${moveNode.memberCode} — ${moveNode.memberName}`}
          hierarchyCode={hierarchyCode}
          onClose={() => setMoveNode(null)}
          onMoved={() => { setMoveNode(null); load(); }} />
      )}
    </div>
  );
}

// ─── TreeRow ────────────────────────────────────────────────────

interface RowProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
  onAddChild: (n: TreeNode) => void;
  onEdit: (n: TreeNode) => void;
  onCopy: (n: TreeNode) => void;
  onMove: (n: TreeNode) => void;
  onDelete: (n: TreeNode) => void;
}

function TreeRow(p: RowProps) {
  const { node, depth, expanded, onToggle, selectedId, onSelect, onContextMenu } = p;
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-2 rounded px-2 py-1",
          isSelected ? "bg-primary/10" : "hover:bg-muted/60",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        <button
          onClick={(e) => { e.stopPropagation(); hasChildren && onToggle(node.id); }}
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

        {/* Hover action buttons — secondary affordance */}
        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <ActionBtn title="Add child"     onClick={() => p.onAddChild(node)}><Plus className="h-3.5 w-3.5" /></ActionBtn>
          <ActionBtn title="Edit / rename" onClick={() => p.onEdit(node)}><Pencil className="h-3.5 w-3.5" /></ActionBtn>
          <ActionBtn title="Copy"          onClick={() => p.onCopy(node)}><CopyIcon className="h-3.5 w-3.5" /></ActionBtn>
          <ActionBtn title="Move"          onClick={() => p.onMove(node)}><ArrowRightLeft className="h-3.5 w-3.5" /></ActionBtn>
          <ActionBtn title="Delete"        onClick={() => p.onDelete(node)} danger><Trash2 className="h-3.5 w-3.5" /></ActionBtn>
        </div>
      </div>
      {hasChildren && isOpen && (
        <ul>{node.children.map((c) => <TreeRow key={c.id} {...p} node={c} depth={depth + 1} />)}</ul>
      )}
    </li>
  );
}

// ─── Context menu (custom — positioned at right-click coords) ────

interface CtxProps {
  x: number; y: number; node: TreeNode;
  onAddChild: () => void; onAddSibling: () => void;
  onEdit: () => void; onCopy: () => void; onMove: () => void; onDelete: () => void;
  onShowProperties: () => void;
}
function ContextMenu(p: CtxProps) {
  return (
    <div
      className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-white shadow-xl py-1 text-sm"
      style={{ left: p.x, top: p.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
        {p.node.memberCode}
      </div>
      <CtxItem icon={<Plus className="h-3.5 w-3.5" />}            label="Add child"    onClick={p.onAddChild} />
      <CtxItem icon={<GitBranch className="h-3.5 w-3.5" />}       label="Add sibling"  onClick={p.onAddSibling} />
      <CtxItem icon={<Pencil className="h-3.5 w-3.5" />}          label="Edit / rename" onClick={p.onEdit} />
      <CtxItem icon={<CopyIcon className="h-3.5 w-3.5" />}        label="Duplicate"    onClick={p.onCopy} />
      <CtxItem icon={<ArrowRightLeft className="h-3.5 w-3.5" />}  label="Move"         onClick={p.onMove} />
      <div className="my-1 h-px bg-border" />
      <CtxItem icon={<Info className="h-3.5 w-3.5" />}            label="Properties"   onClick={p.onShowProperties} />
      <div className="my-1 h-px bg-border" />
      <CtxItem icon={<Trash2 className="h-3.5 w-3.5" />}          label="Delete"       onClick={p.onDelete} danger />
    </div>
  );
}
function CtxItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
        danger ? "text-red-600 hover:bg-red-50" : "text-foreground hover:bg-muted",
      )}
    >
      {icon} {label}
    </button>
  );
}

// ─── Properties panel ───────────────────────────────────────────

function PropertiesPanel({ node, onEdit, onAddChild, onAddSibling, onCopy, onMove, onDelete }:
  { node: TreeNode | null;
    onEdit: () => void; onAddChild: () => void; onAddSibling: () => void;
    onCopy: () => void; onMove: () => void; onDelete: () => void;
  }) {
  if (!node) {
    return (
      <div className="bg-white rounded-xl border border-border p-4 text-xs text-muted-foreground">
        <Info className="inline h-3.5 w-3.5 mr-1.5" />
        Click a member to see its typed properties. Right-click for actions.
      </div>
    );
  }
  const props = node.properties ?? {};
  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <div className="border-b border-border px-4 py-2 flex items-center justify-between">
        <div className="text-sm font-medium text-foreground truncate">
          <span className="text-xs text-muted-foreground font-mono mr-2">{node.memberCode}</span>
          {node.memberName}
        </div>
        <button onClick={onEdit} className="rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20">
          <Pencil className="inline h-3 w-3 mr-1" /> Edit
        </button>
      </div>
      <div className="p-4 space-y-2 text-xs">
        {Object.keys(props).length === 0 ? (
          <p className="text-muted-foreground">No typed properties.</p>
        ) : (
          <table className="w-full">
            <tbody>
              {Object.entries(props).map(([k, v]) => (
                <tr key={k} className="border-b border-border/30 last:border-0">
                  <td className="py-1 pr-3 text-muted-foreground font-mono">{k}</td>
                  <td className="py-1 text-foreground font-mono break-all">{String(v ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="border-t border-border px-4 py-2 flex flex-wrap gap-1">
        <PanelBtn onClick={onAddChild}><Plus className="h-3 w-3" /> Add child</PanelBtn>
        <PanelBtn onClick={onAddSibling}><GitBranch className="h-3 w-3" /> Add sibling</PanelBtn>
        <PanelBtn onClick={onCopy}><CopyIcon className="h-3 w-3" /> Copy</PanelBtn>
        <PanelBtn onClick={onMove}><ArrowRightLeft className="h-3 w-3" /> Move</PanelBtn>
        <PanelBtn onClick={onDelete} danger><Trash2 className="h-3 w-3" /> Delete</PanelBtn>
      </div>
    </div>
  );
}
function PanelBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors",
        danger ? "text-red-600 hover:bg-red-50" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}>{children}</button>
  );
}

// ─── helpers ─────────────────────────────────────────────────────

function ActionBtn({ title, onClick, danger, children }:
  { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      className={cn(
        "rounded p-1 transition-colors",
        danger ? "text-muted-foreground hover:bg-red-50 hover:text-red-600"
               : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >{children}</button>
  );
}

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const c = findNode(n.children, id);
    if (c) return c;
  }
  return null;
}
