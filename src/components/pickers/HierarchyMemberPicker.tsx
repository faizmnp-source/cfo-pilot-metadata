"use client";

// HierarchyMemberPicker — pick a parent member and optionally expand to
// all descendants. OneStream/Pigment pattern.
//
// Example: pick APOLLO_GRP, toggle "include all hospitals" → returns 4 IDs.
// Use in forecast entity picker, dashboard entity filter, report POV.
//
// Props:
//   - slug:        dimension slug ('entity', 'account', etc.)
//   - selectedIds: array of selected member IDs
//   - onChange:    callback
//   - allowMulti:  if true, user can pick multiple parents
//   - placeholder: input text when empty

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Check, Search, X, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

type Member = { id: string; memberCode: string; memberName: string };

interface Props {
  slug: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  allowMulti?: boolean;
  placeholder?: string;
  label?: string;
}

export function HierarchyMemberPicker({ slug, selectedIds, onChange, allowMulti = true, placeholder = "Search members…", label }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [edges, setEdges] = useState<{ parentMemberId: string; childMemberId: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  // Load members + edges
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/v2/members/${slug}?pageSize=500`, { credentials: "include" }).then(r => r.json()),
      fetch(`/api/v2/hierarchy?slug=${slug}`, { credentials: "include" }).then(r => r.json()).catch(() => ({})),
    ]).then(([m, h]) => {
      const items = ((m?.data?.data ?? []) as any[]).filter(x => x.isActive)
        .map(x => ({ id: x.id, memberCode: x.memberCode, memberName: x.memberName }));
      setMembers(items);
      setEdges(h?.data?.edges ?? []);
      // Auto-expand top level
      const childrenIds = new Set((h?.data?.edges ?? []).map((e: any) => e.childMemberId));
      const roots = items.filter(it => !childrenIds.has(it.id));
      setExpanded(new Set(roots.map(r => r.id)));
    }).finally(() => setLoading(false));
  }, [slug]);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Build child index
  const childrenByParent = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of edges) {
      if (!map.has(e.parentMemberId)) map.set(e.parentMemberId, []);
      map.get(e.parentMemberId)!.push(e.childMemberId);
    }
    return map;
  }, [edges]);

  const childrenIdSet = useMemo(() => new Set(edges.map(e => e.childMemberId)), [edges]);
  const roots = useMemo(() => members.filter(m => !childrenIdSet.has(m.id)), [members, childrenIdSet]);

  function getAllDescendants(id: string): string[] {
    const out: string[] = [];
    const stack = [id];
    const seen = new Set<string>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const kids = childrenByParent.get(cur) ?? [];
      for (const k of kids) { out.push(k); stack.push(k); }
    }
    return out;
  }

  function toggle(id: string) {
    if (!allowMulti) {
      onChange([id]);
      setOpen(false);
      return;
    }
    if (selectedIds.includes(id)) onChange(selectedIds.filter(x => x !== id));
    else onChange([...selectedIds, id]);
  }

  function includeAllDescendants(parentId: string) {
    const desc = getAllDescendants(parentId);
    const all = Array.from(new Set([...selectedIds, parentId, ...desc]));
    onChange(all);
  }

  function clear() { onChange([]); }

  const filteredRoots = useMemo(() => {
    if (!q.trim()) return roots;
    const needle = q.toLowerCase();
    // If searching, flatten: show any member matching
    const matches = members.filter(m =>
      m.memberCode.toLowerCase().includes(needle) || m.memberName.toLowerCase().includes(needle)
    );
    return matches;
  }, [q, roots, members]);

  const selectedSummary = selectedIds.length === 0
    ? "Select…"
    : selectedIds.length === 1
      ? (members.find(m => m.id === selectedIds[0])?.memberCode ?? "1 selected")
      : `${selectedIds.length} selected`;

  return (
    <div ref={ref} className="relative inline-block min-w-[200px]">
      {label && <label className="block text-[10px] uppercase font-bold text-stone-500 tracking-wide mb-1">{label}</label>}
      <button onClick={() => setOpen(o => !o)}
        className="w-full inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-stone-200 bg-white text-xs text-stone-800 hover:border-stone-300">
        <GitBranch className="w-3.5 h-3.5 text-stone-400" />
        <span className="flex-1 text-left truncate">{selectedSummary}</span>
        <ChevronDown className={cn("w-3 h-3 text-stone-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 w-80 bg-white border border-stone-200 rounded-lg shadow-xl">
          <div className="p-2 border-b border-stone-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-stone-400" />
              <input value={q} onChange={e => setQ(e.target.value)} autoFocus
                placeholder={placeholder}
                className="w-full pl-7 pr-7 py-1.5 text-xs border border-stone-200 rounded focus:outline-none focus:border-violet-300" />
              {q && <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"><X className="w-3 h-3" /></button>}
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="px-2 py-1 border-b border-stone-100 flex items-center justify-between text-[10px]">
              <span className="text-stone-500">{selectedIds.length} selected</span>
              <button onClick={clear} className="text-violet-600 hover:text-violet-800 font-semibold">Clear all</button>
            </div>
          )}

          <div className="max-h-72 overflow-y-auto p-1">
            {loading && <p className="px-2 py-3 text-[11px] text-stone-400 italic">Loading…</p>}
            {!loading && filteredRoots.length === 0 && <p className="px-2 py-3 text-[11px] text-stone-400 italic">No matches</p>}
            {!loading && !q && filteredRoots.map(root => (
              <Node key={root.id} member={root} depth={0}
                expanded={expanded} setExpanded={setExpanded}
                selectedIds={selectedIds} toggle={toggle}
                includeAllDescendants={includeAllDescendants}
                childrenByParent={childrenByParent} membersById={new Map(members.map(m => [m.id, m]))}
                getAllDescendants={getAllDescendants}
              />
            ))}
            {!loading && q && filteredRoots.map(m => (
              <button key={m.id} onClick={() => toggle(m.id)}
                className={cn("w-full text-left px-2 py-1.5 text-xs rounded hover:bg-stone-50 flex items-center gap-2",
                  selectedIds.includes(m.id) ? "bg-violet-50 text-violet-900 font-semibold" : "text-stone-700")}>
                {selectedIds.includes(m.id) ? <Check className="w-3 h-3 text-violet-600" /> : <span className="w-3" />}
                <span className="font-mono">{m.memberCode}</span>
                <span className="text-stone-400 truncate">— {m.memberName}</span>
              </button>
            ))}
          </div>

          <div className="px-2 py-1.5 border-t border-stone-100 text-[10px] text-stone-400">
            Click ▸ to expand. Click row to toggle. <b>"+ all"</b> includes every descendant.
          </div>
        </div>
      )}
    </div>
  );
}

function Node({
  member, depth, expanded, setExpanded, selectedIds, toggle, includeAllDescendants,
  childrenByParent, membersById, getAllDescendants,
}: any) {
  const kids: string[] = childrenByParent.get(member.id) ?? [];
  const isExpanded = expanded.has(member.id);
  const isSelected = selectedIds.includes(member.id);
  const descCount = getAllDescendants(member.id).length;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 px-1 py-1 text-xs rounded hover:bg-stone-50",
          isSelected && "bg-violet-50"
        )}
        style={{ paddingLeft: depth * 12 + 4 }}>
        {kids.length > 0 ? (
          <button onClick={() => {
            const next = new Set(expanded);
            if (next.has(member.id)) next.delete(member.id); else next.add(member.id);
            setExpanded(next);
          }} className="text-stone-400 hover:text-stone-700">
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        ) : <span className="w-3" />}
        <button onClick={() => toggle(member.id)} className="flex-1 text-left flex items-center gap-2 min-w-0">
          {isSelected ? <Check className="w-3 h-3 text-violet-600 shrink-0" /> : <span className="w-3 shrink-0" />}
          <span className={cn("font-mono", isSelected && "font-semibold text-violet-900")}>{member.memberCode}</span>
          <span className="text-stone-400 truncate">— {member.memberName}</span>
          {kids.length > 0 && <span className="text-[9px] text-stone-400 ml-auto shrink-0">{descCount} desc</span>}
        </button>
        {kids.length > 0 && (
          <button onClick={() => includeAllDescendants(member.id)}
            className="text-[9px] text-violet-600 hover:text-violet-800 font-semibold px-1.5 py-0.5 rounded hover:bg-violet-50 shrink-0">+ all</button>
        )}
      </div>
      {isExpanded && kids.map(kid => {
        const km = membersById.get(kid);
        if (!km) return null;
        return <Node key={kid} member={km} depth={depth + 1}
          expanded={expanded} setExpanded={setExpanded}
          selectedIds={selectedIds} toggle={toggle}
          includeAllDescendants={includeAllDescendants}
          childrenByParent={childrenByParent} membersById={membersById}
          getAllDescendants={getAllDescendants} />;
      })}
    </div>
  );
}
