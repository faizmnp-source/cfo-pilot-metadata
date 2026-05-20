"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Pencil, Check, X, ChevronRight, Loader2 } from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { cn } from "@/lib/utils";

interface DimensionDef {
  id: string;
  slot: string;        // "UD1" .. "UD10"
  name: string;
  pluralName: string;
  isActive: boolean;
}

const SLOT_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  UD1:  { bg: "bg-blue-50",   text: "text-blue-700",   badge: "bg-blue-100 text-blue-700" },
  UD2:  { bg: "bg-purple-50", text: "text-purple-700", badge: "bg-purple-100 text-purple-700" },
  UD3:  { bg: "bg-green-50",  text: "text-green-700",  badge: "bg-green-100 text-green-700" },
  UD4:  { bg: "bg-amber-50",  text: "text-amber-700",  badge: "bg-amber-100 text-amber-700" },
  UD5:  { bg: "bg-indigo-50", text: "text-indigo-700", badge: "bg-indigo-100 text-indigo-700" },
  UD6:  { bg: "bg-teal-50",   text: "text-teal-700",   badge: "bg-teal-100 text-teal-700" },
  UD7:  { bg: "bg-cyan-50",   text: "text-cyan-700",   badge: "bg-cyan-100 text-cyan-700" },
  UD8:  { bg: "bg-orange-50", text: "text-orange-700", badge: "bg-orange-100 text-orange-700" },
  UD9:  { bg: "bg-pink-50",   text: "text-pink-700",   badge: "bg-pink-100 text-pink-700" },
  UD10: { bg: "bg-rose-50",   text: "text-rose-700",   badge: "bg-rose-100 text-rose-700" },
};

const ALL_SLOTS = ["UD1","UD2","UD3","UD4","UD5","UD6","UD7","UD8","UD9","UD10"];

interface DimCardProps {
  slot: string;
  dim: DimensionDef | null;
  onSaved: () => void;
}

function DimCard({ slot, dim, onSaved }: DimCardProps) {
  const colors = SLOT_COLORS[slot] ?? SLOT_COLORS["UD1"];
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(dim?.name ?? "");
  const [pluralVal, setPluralVal] = useState(dim?.pluralName ?? "");
  const [active, setActive] = useState(dim?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNameVal(dim?.name ?? "");
    setPluralVal(dim?.pluralName ?? "");
    setActive(dim?.isActive ?? true);
  }, [dim]);

  const handleSave = async () => {
    if (!nameVal.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = { slot, name: nameVal.trim(), pluralName: pluralVal.trim() || nameVal.trim() + "s", isActive: active };
      let res: Response;
      if (dim?.id) {
        res = await fetch(`/api/metadata/dimensions/${dim.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/metadata/dimensions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Save failed");
      }
      setEditing(false);
      onSaved();
    } catch (e: any) {
      setError(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!dim?.id) return;
    const next = !active;
    setActive(next);
    try {
      await fetch(`/api/metadata/dimensions/${dim.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...dim, isActive: next }),
      });
      onSaved();
    } catch {
      setActive(!next);
    }
  };

  const isConfigured = !!(dim?.name);

  return (
    <div className={cn(
      "rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md overflow-hidden",
      isConfigured ? "border-[var(--border-default)]" : "border-dashed border-gray-200"
    )}>
      {/* Header bar */}
      <div className={cn("flex items-center justify-between px-4 py-3", colors.bg)}>
        <span className={cn("text-xs font-bold tracking-wide px-2 py-0.5 rounded-full", colors.badge)}>
          {slot}
        </span>
        <div className="flex items-center gap-1.5">
          {/* Active toggle */}
          {isConfigured && (
            <button
              onClick={handleToggleActive}
              title={active ? "Deactivate" : "Activate"}
              className={cn(
                "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                active ? "bg-green-500" : "bg-gray-200"
              )}
            >
              <span className={cn(
                "inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200",
                active ? "translate-x-4" : "translate-x-0"
              )} />
            </button>
          )}
          {/* Edit button */}
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="p-1 rounded-md text-gray-500 hover:text-gray-800 hover:bg-white/60 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-4">
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Display Name *
              </label>
              <input
                autoFocus
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
                className="w-full rounded-md border border-[var(--border-default)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent"
                placeholder={`e.g. Cost Driver`}
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Plural Name
              </label>
              <input
                value={pluralVal}
                onChange={(e) => setPluralVal(e.target.value)}
                className="w-full rounded-md border border-[var(--border-default)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent"
                placeholder={`e.g. Cost Drivers`}
              />
            </div>
            {error && <p className="text-red-600 text-xs">{error}</p>}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-700)] transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Save
              </button>
              <button
                onClick={() => { setEditing(false); setNameVal(dim?.name ?? ""); setPluralVal(dim?.pluralName ?? ""); setError(null); }}
                className="flex items-center gap-1 h-7 px-3 rounded-md text-xs font-medium border border-[var(--border-default)] text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <X className="w-3 h-3" /> Cancel
              </button>
            </div>
          </div>
        ) : isConfigured ? (
          <>
            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{dim!.name}</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{dim!.pluralName || dim!.name + "s"}</p>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border-default)]">
              <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500")}>
                {active ? "Active" : "Inactive"}
              </span>
              <Link
                href={`/metadata/dimensions/${dim!.id}`}
                className="flex items-center gap-1 text-xs font-medium text-[var(--color-brand-600)] hover:text-[var(--color-brand-700)] transition-colors"
              >
                Manage Members <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <p className="text-xs text-gray-400 font-medium">Not configured</p>
            <p className="text-[10px] text-gray-300 mt-0.5">Click the pencil to set up</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DimensionsPage() {
  const [dims, setDims] = useState<DimensionDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchDims = () => {
    setLoading(true);
    fetch("/api/metadata/dimensions")
      .then((r) => r.json())
      .then((data) => {
        setDims(Array.isArray(data) ? data : (data.data ?? []));
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDims(); }, []);

  const getDimForSlot = (slot: string): DimensionDef | null =>
    dims.find((d) => d.slot === slot) ?? null;

  const configuredCount = dims.filter((d) => d.name).length;

  return (
    <>
      <MetadataHeader
        title="User Defined Dimensions"
        subtitle={`Configure UD1–UD10 for your business — ${configuredCount} of 10 configured`}
        showSearch={false}
        onRefresh={fetchDims}
      />
      <main className="flex-1 overflow-y-auto bg-[var(--bg-surface-sunken)] p-6">
        {error && (
          <p className="text-red-600 text-sm mb-4">Failed to load dimensions. Please try again.</p>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {ALL_SLOTS.map((slot) => (
              <div key={slot} className="h-44 rounded-xl border border-[var(--border-default)] bg-white animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {ALL_SLOTS.map((slot) => (
              <DimCard
                key={slot}
                slot={slot}
                dim={getDimForSlot(slot)}
                onSaved={fetchDims}
              />
            ))}
          </div>
        )}

        <div className="mt-6 rounded-lg border border-[var(--border-default)] bg-white p-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">About User Dimensions</h3>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            User Dimensions (UD1–UD10) let you create custom classification hierarchies specific to your business.
            Once configured and activated, each dimension appears in the sidebar and can hold an unlimited
            number of members with parent-child relationships. Common uses: Cost Drivers, Service Lines,
            Payor Mix, Physician Groups, Projects, or any custom reporting segmentation.
          </p>
        </div>
      </main>
    </>
  );
}
