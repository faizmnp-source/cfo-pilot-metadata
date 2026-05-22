"use client";

// Move a member under a new parent in the hierarchy.
// Today: removes any existing parent→child edge for this node, adds a new
// edge under the chosen parent. Cycle detection happens server-side.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, GitBranch, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  dim: string;
  memberId: string;
  memberLabel: string;
  hierarchyCode?: string;
  onClose: () => void;
  onMoved: () => void;
}

interface MemberOpt { id: string; memberCode: string; memberName: string; }

export function MoveMemberDialog({
  open, dim, memberId, memberLabel, hierarchyCode = "default", onClose, onMoved,
}: Props) {
  const [members, setMembers] = useState<MemberOpt[]>([]);
  const [parentId, setParentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingEdges, setExistingEdges] = useState<any[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/v2/members/${dim}?pageSize=500`, { credentials: "include" }).then((r) => r.json()),
      fetch(`/api/v2/hierarchy/${dim}?hierarchy=${hierarchyCode}&format=edges`, { credentials: "include" }).then((r) => r.json()),
    ]).then(([m, h]) => {
      setMembers((m?.data?.data ?? []).filter((x: any) => x.id !== memberId));
      setExistingEdges(h?.data?.edges ?? []);
    }).finally(() => setLoading(false));
  }, [open, dim, hierarchyCode, memberId]);

  if (!open) return null;

  const handleMove = async () => {
    if (!parentId) { toast.error("Pick a new parent"); return; }
    setSaving(true);
    try {
      // Remove any existing parent edge for this member (single-hierarchy assumption)
      const myEdges = existingEdges.filter((e: any) => e.childMemberId === memberId);
      for (const e of myEdges) {
        await fetch(`/api/v2/hierarchy/${dim}/${e.id}`, { method: "DELETE", credentials: "include" });
      }
      // Add new edge
      const res = await fetch(`/api/v2/hierarchy/${dim}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hierarchyCode, parentMemberId: parentId, childMemberId: memberId, operator: "ADD", weight: 1,
        }),
      });
      let data: any = {}; try { data = await res.json(); } catch {}
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      toast.success(`Moved ${memberLabel}`);
      onMoved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Move failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Move <span className="text-muted-foreground font-mono text-sm">{memberLabel}</span></h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 space-y-3">
          <label className="block text-xs font-medium text-gray-700">New parent</label>
          {loading ? (
            <div className="text-sm text-muted-foreground"><Loader2 className="inline h-3.5 w-3.5 animate-spin mr-2" />Loading members…</div>
          ) : (
            <select value={parentId} onChange={(e) => setParentId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">— pick a parent —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.memberCode} — {m.memberName}</option>
              ))}
            </select>
          )}
          <p className="text-xs text-muted-foreground">Cycles are blocked server-side. Existing parent edge in this hierarchy is removed before the new one is written.</p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">Cancel</button>
          <button onClick={handleMove} disabled={saving || !parentId}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
            {saving ? "Moving…" : "Move"}
          </button>
        </div>
      </div>
    </div>
  );
}
