"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ChevronRight, Plus, Search, Pencil, Trash2, Check, X,
  ChevronDown, ChevronRight as ChevronRightIcon, Loader2, LayoutList, GitBranch,
} from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { cn } from "@/lib/utils";

interface DimensionDef {
  id: string;
  slot: string;
  name: string;
  pluralName: string;
  isActive: boolean;
}

interface DimensionMember {
  id: string;
  dimensionId: string;
  code: string;
  name: string;
  parentId: string | null;
  parentCode?: string;
  parentName?: string;
  description: string | null;
  isActive: boolean;
  childCount?: number;
}

interface MemberFormData {
  code: string;
  name: string;
  parentId: string;
  description: string;
  isActive: boolean;
}

const EMPTY_FORM: MemberFormData = { code: "", name: "", parentId: "", description: "", isActive: true };

type Tab = "table" | "tree";

interface TreeRowProps {
  member: DimensionMember;
  allMembers: DimensionMember[];
  depth: number;
  onEdit: (m: DimensionMember) => void;
  onDelete: (m: DimensionMember) => void;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
  executeDelete: (m: DimensionMember) => void;
}

function TreeRow({ member, allMembers, depth, onEdit, onDelete, confirmDeleteId, setConfirmDeleteId, executeDelete }: TreeRowProps) {
  const [expanded, setExpanded] = useState(true);
  const children = allMembers.filter((m) => m.parentId === member.id);
  const hasChildren = children.length > 0;

  return (
    <>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-2.5 whitespace-nowrap">
          <div className="flex items-center" style={{ paddingLeft: `${depth * 20}px` }}>
            {hasChildren ? (
              <button onClick={() => setExpanded(!expanded)} className="mr-1 p-0.5 rounded hover:bg-gray-200 transition-colors">
                {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRightIcon className="w-3.5 h-3.5 text-gray-400" />}
              </button>
            ) : (
              <span className="mr-1 w-5" />
            )}
            <code className="font-mono text-xs font-medium text-[var(--text-primary)]">{member.code}</code>
            {hasChildren && (
              <span className="ml-2 text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5">
                {children.length}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-2.5 text-sm text-[var(--text-primary)]">{member.name}</td>
        <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)] max-w-xs truncate">{member.description ?? "—"}</td>
        <td className="px-4 py-2.5">
          <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", member.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500")}>
            {member.isActive ? "Active" : "Inactive"}
          </span>
        </td>
        <td className="px-4 py-2.5">
          {confirmDeleteId === member.id ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-red-600 mr-1">Delete?</span>
              <button onClick={() => executeDelete(member)} className="text-xs font-medium text-red-600 hover:underline">Yes</button>
              <span className="text-gray-300">/</span>
              <button onClick={() => setConfirmDeleteId(null)} className="text-xs font-medium text-gray-500 hover:underline">No</button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={() => onEdit(member)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setConfirmDeleteId(member.id)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </td>
      </tr>
      {expanded && children.map((child) => (
        <TreeRow
          key={child.id}
          member={child}
          allMembers={allMembers}
          depth={depth + 1}
          onEdit={onEdit}
          onDelete={onDelete}
          confirmDeleteId={confirmDeleteId}
          setConfirmDeleteId={setConfirmDeleteId}
          executeDelete={executeDelete}
        />
      ))}
    </>
  );
}

export default function DimensionMembersPage() {
  const params = useParams();
  const id = params.id as string;

  const [def, setDef] = useState<DimensionDef | null>(null);
  const [members, setMembers] = useState<DimensionMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [defError, setDefError] = useState(false);
  const [tab, setTab] = useState<Tab>("table");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<DimensionMember | null>(null);
  const [form, setForm] = useState<MemberFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchDef = useCallback(async () => {
    try {
      const res = await fetch(`/api/metadata/dimensions/${id}`);
      if (!res.ok) throw new Error();
      setDef(await res.json());
      setDefError(false);
    } catch {
      setDefError(true);
    }
  }, [id]);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/metadata/dimensions/${id}/members`);
      const data = await res.json();
      setMembers(Array.isArray(data) ? data : (data.data ?? []));
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDef();
    fetchMembers();
  }, [fetchDef, fetchMembers]);

  const openAdd = () => {
    setEditMember(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setAddOpen(true);
  };

  const openEdit = (m: DimensionMember) => {
    setEditMember(m);
    setForm({ code: m.code, name: m.name, parentId: m.parentId ?? "", description: m.description ?? "", isActive: m.isActive });
    setFormError(null);
    setAddOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim()) { setFormError("Code is required"); return; }
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        dimensionId: id,
        code: form.code.trim(),
        name: form.name.trim(),
        parentId: form.parentId || null,
        description: form.description.trim() || null,
        isActive: form.isActive,
      };
      let res: Response;
      if (editMember) {
        res = await fetch(`/api/metadata/dimensions/${id}/members/${editMember.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/metadata/dimensions/${id}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Save failed");
      }
      setAddOpen(false);
      setEditMember(null);
      fetchMembers();
    } catch (e: any) {
      setFormError(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const executeDelete = async (m: DimensionMember) => {
    setConfirmDeleteId(null);
    try {
      await fetch(`/api/metadata/dimensions/${id}/members/${m.id}`, { method: "DELETE" });
      fetchMembers();
    } catch {}
  };

  const filtered = members.filter((m) =>
    !search || m.code.toLowerCase().includes(search.toLowerCase()) || m.name.toLowerCase().includes(search.toLowerCase())
  );

  const rootMembers = filtered.filter((m) => !m.parentId);
  const allRootsForTree = members.filter((m) => !m.parentId);

  const parentOptions = members.filter((m) => editMember ? m.id !== editMember.id : true);

  return (
    <>
      <MetadataHeader
        title={def ? def.name : (defError ? "Unknown Dimension" : "Loading...")}
        subtitle={def ? (def.pluralName || def.name + "s") : ""}
        showSearch
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search ${def?.pluralName ?? "members"}...`}
        onAdd={openAdd}
        addLabel={`Add ${def?.name ?? "Member"}`}
        onRefresh={() => { fetchDef(); fetchMembers(); }}
      />

      <main className="flex-1 overflow-y-auto bg-[var(--bg-surface-sunken)] p-6">
        {defError && (
          <p className="text-red-600 text-sm mb-4">Failed to load dimension definition.</p>
        )}

        {/* Inline add/edit form (slide-down) */}
        {addOpen && (
          <div className="mb-4 rounded-xl border border-[var(--border-default)] bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-default)] bg-gray-50">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {editMember ? `Edit Member — ${editMember.code}` : `Add New ${def?.name ?? "Member"}`}
              </h3>
              <button onClick={() => { setAddOpen(false); setEditMember(null); }} className="p-1 rounded hover:bg-gray-200 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4 md:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Code *</label>
                <input
                  autoFocus
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full rounded-md border border-[var(--border-default)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent font-mono"
                  placeholder="e.g. CD001"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-md border border-[var(--border-default)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent"
                  placeholder="Member name"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Parent</label>
                <select
                  value={form.parentId}
                  onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                  className="w-full rounded-md border border-[var(--border-default)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent bg-white"
                >
                  <option value="">— None (root) —</option>
                  {parentOptions.map((m) => (
                    <option key={m.id} value={m.id}>[{m.code}] {m.name}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-md border border-[var(--border-default)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent"
                  placeholder="Optional description"
                />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  id="member-active"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-[var(--color-brand-600)]"
                />
                <label htmlFor="member-active" className="text-sm text-gray-700 select-none">Active</label>
              </div>
            </div>
            {formError && <p className="px-5 pb-2 text-red-600 text-xs">{formError}</p>}
            <div className="flex items-center gap-2 px-5 pb-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 h-8 px-4 rounded-md text-xs font-medium bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-700)] transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {editMember ? "Save Changes" : "Add Member"}
              </button>
              <button
                onClick={() => { setAddOpen(false); setEditMember(null); }}
                className="h-8 px-4 rounded-md text-xs font-medium border border-[var(--border-default)] text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Tab switcher */}
        <div className="mb-4 flex items-center gap-1 rounded-lg border border-[var(--border-default)] bg-white p-1 w-fit shadow-sm">
          <button
            onClick={() => setTab("table")}
            className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "table" ? "bg-[var(--bg-surface-sunken)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            <LayoutList className="h-3.5 w-3.5" /> Table View
          </button>
          <button
            onClick={() => setTab("tree")}
            className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === "tree" ? "bg-[var(--bg-surface-sunken)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            <GitBranch className="h-3.5 w-3.5" /> Tree View
          </button>
        </div>

        {/* Table */}
        {tab === "table" && (
          <div className="rounded-xl border border-[var(--border-default)] bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-gray-50">
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Code</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Name</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Parent</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Description</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <span className="inline-block h-4 w-20 rounded bg-gray-100 animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                      {search ? "No members match your search." : `No members yet. Add your first ${def?.name ?? "member"}.`}
                    </td>
                  </tr>
                ) : (
                  filtered.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <code className="font-mono text-xs font-medium text-[var(--text-primary)]">{m.code}</code>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-[var(--text-primary)]">{m.name}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)]">
                        {m.parentCode ? (
                          <span className="font-mono">[{m.parentCode}] {m.parentName}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)] max-w-xs truncate">
                        {m.description ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", m.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500")}>
                          {m.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {confirmDeleteId === m.id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-red-600 mr-1">Delete?</span>
                            <button onClick={() => executeDelete(m)} className="text-xs font-medium text-red-600 hover:underline">Yes</button>
                            <span className="text-gray-300">/</span>
                            <button onClick={() => setConfirmDeleteId(null)} className="text-xs font-medium text-gray-500 hover:underline">No</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEdit(m)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setConfirmDeleteId(m.id)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {!loading && filtered.length > 0 && (
              <div className="border-t border-[var(--border-default)] px-4 py-2 bg-gray-50">
                <p className="text-xs text-gray-400">{filtered.length} member{filtered.length !== 1 ? "s" : ""}</p>
              </div>
            )}
          </div>
        )}

        {/* Tree view */}
        {tab === "tree" && (
          <div className="rounded-xl border border-[var(--border-default)] bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-gray-50">
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Code / Hierarchy</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Name</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Description</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><span className="inline-block h-4 w-20 rounded bg-gray-100 animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : allRootsForTree.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">No members yet.</td>
                  </tr>
                ) : (
                  allRootsForTree.map((root) => (
                    <TreeRow
                      key={root.id}
                      member={root}
                      allMembers={members}
                      depth={0}
                      onEdit={openEdit}
                      onDelete={(m) => setConfirmDeleteId(m.id)}
                      confirmDeleteId={confirmDeleteId}
                      setConfirmDeleteId={setConfirmDeleteId}
                      executeDelete={executeDelete}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
