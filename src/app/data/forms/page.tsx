"use client";

// Data Forms — list page. Admins manage form templates here.
// Users open a form from this page or from the form picker on /data/input.

import { useEffect, useState } from "react";
import Link from "next/link";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { Plus, LayoutGrid, ArrowLeftRight, Layers, Star, Trash2 } from "lucide-react";
import { NewFormDialog } from "@/components/data/NewFormDialog";

type FormRow = {
  id: string; code: string; name: string; description: string | null;
  layoutType: "STANDARD" | "VARIANCE" | "SCENARIO_STACK";
  isDefault: boolean; scenarioIds: string[];
  createdAt: string;
};

const LAYOUT_META: Record<string, { label: string; icon: any; color: string }> = {
  STANDARD:       { label: "Standard",       icon: LayoutGrid,     color: "text-indigo-700 bg-indigo-50" },
  VARIANCE:       { label: "Variance",       icon: ArrowLeftRight, color: "text-amber-800 bg-amber-50" },
  SCENARIO_STACK: { label: "Scenario stack", icon: Layers,         color: "text-emerald-800 bg-emerald-50" },
};

export default function DataFormsPage() {
  const [forms, setForms] = useState<FormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/v2/forms", { credentials: "include" });
      const j = await r.json();
      setForms(j?.data?.data ?? []);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    if (!confirm("Delete this form? (soft-delete — can be recovered)")) return;
    await fetch(`/api/v2/forms/${id}`, { method: "DELETE", credentials: "include" });
    load();
  }

  return (
    <>
      <MetadataHeader
        title="Data Forms"
        subtitle="Admin-defined templates that scope the input grid to a curated set of accounts and a specific layout."
      />
      <main className="flex-1 overflow-y-auto bg-background p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading…" : `${forms.length} form${forms.length === 1 ? "" : "s"} configured`}
          </p>
          <button
            onClick={() => setNewOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> New form
          </button>
        </div>

        {!loading && forms.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <LayoutGrid className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-3 text-sm font-medium text-gray-700">No forms yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create your first form — e.g. "P&amp;L Input" with just the income-statement accounts,
              or "P&amp;L Variance" comparing Actual vs Budget side-by-side.
            </p>
            <button
              onClick={() => setNewOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" /> Create your first form
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {forms.map(f => {
            const meta = LAYOUT_META[f.layoutType];
            const Icon = meta.icon;
            return (
              <div key={f.id} className="rounded-xl border border-border bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${meta.color}`}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                      {f.isDefault && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-yellow-50 px-2 py-0.5 text-[10px] font-medium text-yellow-800">
                          <Star className="h-3 w-3" /> Default
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 truncate">{f.name}</h3>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{f.code}</p>
                    {f.description && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{f.description}</p>}
                  </div>
                  <button
                    onClick={() => remove(f.id)}
                    className="text-gray-400 hover:text-red-600 transition-colors"
                    title="Delete form"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <Link
                  href={`/data/input?form=${f.code}`}
                  className="mt-3 block w-full rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-center text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  Open form →
                </Link>
              </div>
            );
          })}
        </div>

        {newOpen && <NewFormDialog onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); load(); }} />}
      </main>
    </>
  );
}
