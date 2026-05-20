"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Pencil, Trash2, Check, X, Loader2, LayoutList, GitBranch,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { cn } from "@/lib/utils";

type ProjectStatus = "ACTIVE" | "COMPLETED" | "ON_HOLD" | "CANCELLED";

interface Project {
  id: string;
  projectCode: string;
  projectName: string;
  parentId: string | null;
  parentCode?: string;
  parentName?: string;
  entityId: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  currency: string;
  status: ProjectStatus;
  isActive: boolean;
  childCount?: number;
}

interface FormData {
  projectCode: string;
  projectName: string;
  parentId: string;
  entityId: string;
  description: string;
  startDate: string;
  endDate: string;
  budget: string;
  currency: string;
  status: ProjectStatus;
}

const EMPTY_FORM: FormData = {
  projectCode: "", projectName: "", parentId: "", entityId: "",
  description: "", startDate: "", endDate: "", budget: "",
  currency: "USD", status: "ACTIVE",
};

const STATUS_STYLES: Record<ProjectStatus, string> = {
  ACTIVE:    "bg-green-50 text-green-700",
  COMPLETED: "bg-gray-100 text-gray-600",
  ON_HOLD:   "bg-amber-50 text-amber-700",
  CANCELLED: "bg-red-50 text-red-600",
};

type Tab = "table" | "tree";

interface TreeRowProps {
  project: Project;
  allProjects: Project[];
  depth: number;
  onEdit: (p: Project) => void;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
  executeDelete: (p: Project) => void;
}

function TreeRow({ project, allProjects, depth, onEdit, confirmDeleteId, setConfirmDeleteId, executeDelete }: TreeRowProps) {
  const [expanded, setExpanded] = useState(true);
  const children = allProjects.filter((p) => p.parentId === project.id);
  const hasChildren = children.length > 0;

  return (
    <>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-2.5 whitespace-nowrap">
          <div className="flex items-center" style={{ paddingLeft: `${depth * 20}px` }}>
            {hasChildren ? (
              <button onClick={() => setExpanded(!expanded)} className="mr-1 p-0.5 rounded hover:bg-gray-200 transition-colors">
                {expanded
                  ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
              </button>
            ) : (
              <span className="mr-1 w-5" />
            )}
            <code className="font-mono text-xs font-medium text-[var(--text-primary)]">{project.projectCode}</code>
            {hasChildren && (
              <span className="ml-2 text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5">
                {children.length}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-2.5 text-sm text-[var(--text-primary)]">{project.projectName}</td>
        <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)]">
          {project.entityId ?? <span className="text-gray-300">—</span>}
        </td>
        <td className="px-4 py-2.5">
          <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_STYLES[project.status])}>
            {project.status.replace("_", " ")}
          </span>
        </td>
        <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)]">
          {project.budget != null ? `${project.currency} ${project.budget.toLocaleString()}` : <span className="text-gray-300">—</span>}
        </td>
        <td className="px-4 py-2.5">
          {confirmDeleteId === project.id ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-red-600 mr-1">Delete?</span>
              <button onClick={() => executeDelete(project)} className="text-xs font-medium text-red-600 hover:underline">Yes</button>
              <span className="text-gray-300">/</span>
              <button onClick={() => setConfirmDeleteId(null)} className="text-xs font-medium text-gray-500 hover:underline">No</button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={() => onEdit(project)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setConfirmDeleteId(project.id)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </td>
      </tr>
      {expanded && children.map((child) => (
        <TreeRow
          key={child.id}
          project={child}
          allProjects={allProjects}
          depth={depth + 1}
          onEdit={onEdit}
          confirmDeleteId={confirmDeleteId}
          setConfirmDeleteId={setConfirmDeleteId}
          executeDelete={executeDelete}
        />
      ))}
    </>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("table");
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Project | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/metadata/projects");
      const data = await res.json();
      setProjects(Array.isArray(data) ? data : (data.data ?? []));
      setFetchError(false);
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const openAdd = () => {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setAddOpen(true);
  };

  const openEdit = (item: Project) => {
    setEditItem(item);
    setForm({
      projectCode: item.projectCode,
      projectName: item.projectName,
      parentId: item.parentId ?? "",
      entityId: item.entityId ?? "",
      description: item.description ?? "",
      startDate: item.startDate ?? "",
      endDate: item.endDate ?? "",
      budget: item.budget != null ? String(item.budget) : "",
      currency: item.currency,
      status: item.status,
    });
    setFormError(null);
    setAddOpen(true);
  };

  const handleSave = async () => {
    if (!form.projectCode.trim()) { setFormError("Project Code is required"); return; }
    if (!form.projectName.trim()) { setFormError("Project Name is required"); return; }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        projectCode: form.projectCode.trim(),
        projectName: form.projectName.trim(),
        parentId: form.parentId || null,
        entityId: form.entityId.trim() || null,
        description: form.description.trim() || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        budget: form.budget ? parseFloat(form.budget) : null,
        currency: form.currency || "USD",
        status: form.status,
      };
      let res: Response;
      if (editItem) {
        res = await fetch(`/api/metadata/projects/${editItem.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/metadata/projects", {
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
      setEditItem(null);
      fetchProjects();
    } catch (e: any) {
      setFormError(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const executeDelete = async (item: Project) => {
    setConfirmDeleteId(null);
    try {
      await fetch(`/api/metadata/projects/${item.id}`, { method: "DELETE" });
      fetchProjects();
    } catch {}
  };

  const filtered = projects.filter((p) =>
    !search ||
    p.projectCode.toLowerCase().includes(search.toLowerCase()) ||
    p.projectName.toLowerCase().includes(search.toLowerCase())
  );

  const parentOptions = projects.filter((p) => editItem ? p.id !== editItem.id : true);
  const rootProjects = projects.filter((p) => !p.parentId);

  return (
    <>
      <MetadataHeader
        title="Projects"
        subtitle="Project hierarchy for cost tracking and reporting"
        showSearch
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search project code or name..."
        onAdd={openAdd}
        addLabel="Add Project"
        onRefresh={fetchProjects}
      />

      <main className="flex-1 overflow-y-auto bg-[var(--bg-surface-sunken)] p-6">
        {fetchError && (
          <p className="text-red-600 text-sm mb-4">Failed to load projects.</p>
        )}

        {/* Inline add/edit form */}
        {addOpen && (
          <div className="mb-4 rounded-xl border border-[var(--border-default)] bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-default)] bg-gray-50">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {editItem ? `Edit Project — ${editItem.projectCode}` : "Add New Project"}
              </h3>
              <button
                onClick={() => { setAddOpen(false); setEditItem(null); }}
                className="p-1 rounded hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Project Code *</label>
                <input
                  autoFocus
                  value={form.projectCode}
                  onChange={(e) => setForm({ ...form, projectCode: e.target.value })}
                  className="w-full rounded-md border border-[var(--border-default)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent font-mono"
                  placeholder="e.g. PRJ001"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Project Name *</label>
                <input
                  value={form.projectName}
                  onChange={(e) => setForm({ ...form, projectName: e.target.value })}
                  className="w-full rounded-md border border-[var(--border-default)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent"
                  placeholder="Project name"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Parent Project</label>
                <select
                  value={form.parentId}
                  onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                  className="w-full rounded-md border border-[var(--border-default)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent bg-white"
                >
                  <option value="">— None (root) —</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>[{p.projectCode}] {p.projectName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Entity</label>
                <input
                  value={form.entityId}
                  onChange={(e) => setForm({ ...form, entityId: e.target.value })}
                  className="w-full rounded-md border border-[var(--border-default)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent"
                  placeholder="Entity ID or code"
                />
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
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}
                  className="w-full rounded-md border border-[var(--border-default)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent bg-white"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="ON_HOLD">On Hold</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Start Date</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-full rounded-md border border-[var(--border-default)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">End Date</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="w-full rounded-md border border-[var(--border-default)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Budget</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.budget}
                  onChange={(e) => setForm({ ...form, budget: e.target.value })}
                  className="w-full rounded-md border border-[var(--border-default)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Currency</label>
                <input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                  maxLength={3}
                  className="w-full rounded-md border border-[var(--border-default)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent font-mono uppercase"
                  placeholder="USD"
                />
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
                {editItem ? "Save Changes" : "Add Project"}
              </button>
              <button
                onClick={() => { setAddOpen(false); setEditItem(null); }}
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

        {/* Table view */}
        {tab === "table" && (
          <div className="rounded-xl border border-[var(--border-default)] bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-gray-50">
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Code</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Name</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Parent</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Entity</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Budget</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Dates</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <span className="inline-block h-4 w-16 rounded bg-muted animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                      {search ? "No projects match your search." : "No projects yet. Add your first project to get started."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5">
                        <code className="font-mono text-xs font-medium text-[var(--text-primary)]">{item.projectCode}</code>
                      </td>
                      <td className="px-4 py-2.5 text-sm font-medium text-[var(--text-primary)]">{item.projectName}</td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)]">
                        {item.parentCode ? (
                          <span className="font-mono">[{item.parentCode}]</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)]">
                        {item.entityId ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_STYLES[item.status])}>
                          {item.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                        {item.budget != null
                          ? `${item.currency} ${item.budget.toLocaleString()}`
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                        {item.startDate || item.endDate
                          ? [item.startDate, item.endDate].filter(Boolean).join(" → ")
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {confirmDeleteId === item.id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-red-600 mr-1">Delete?</span>
                            <button onClick={() => executeDelete(item)} className="text-xs font-medium text-red-600 hover:underline">Yes</button>
                            <span className="text-gray-300">/</span>
                            <button onClick={() => setConfirmDeleteId(null)} className="text-xs font-medium text-gray-500 hover:underline">No</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEdit(item)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setConfirmDeleteId(item.id)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
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
                <p className="text-xs text-gray-400">{filtered.length} project{filtered.length !== 1 ? "s" : ""}</p>
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
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Entity</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Budget</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><span className="inline-block h-4 w-20 rounded bg-gray-100 animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : rootProjects.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">No projects yet.</td>
                  </tr>
                ) : (
                  rootProjects.map((root) => (
                    <TreeRow
                      key={root.id}
                      project={root}
                      allProjects={projects}
                      depth={0}
                      onEdit={openEdit}
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
