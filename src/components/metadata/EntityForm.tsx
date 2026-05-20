"use client";

import { useState } from "react";
import { X, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Entity {
  id: string;
  code: string;
  name: string;
  legalName?: string | null;
  country?: string | null;
  currency?: string | null;
  parentId?: string | null;
  isActive: boolean;
}

interface EntityFormProps {
  entity?: Entity | null;
  entities?: Entity[];
  onSave: (data: Partial<Entity>) => Promise<void>;
  onClose: () => void;
}

const COUNTRIES = [
  { code: "TH", name: "Thailand" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" },
  { code: "AU", name: "Australia" },
  { code: "JP", name: "Japan" },
  { code: "IN", name: "India" },
  { code: "CN", name: "China" },
  { code: "HK", name: "Hong Kong" },
];

const CURRENCIES = ["THB", "USD", "EUR", "GBP", "SGD", "MYR", "AUD", "JPY", "INR", "CNY", "HKD"];

export function EntityForm({
  entity,
  entities = [],
  onSave,
  onClose,
}: EntityFormProps) {
  const isEdit = !!entity;
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, { message: string }>>({});

  const [form, setForm] = useState({
    code: entity?.code ?? "",
    name: entity?.name ?? "",
    legalName: entity?.legalName ?? "",
    country: entity?.country ?? "",
    currency: entity?.currency ?? "USD",
    parentId: entity?.parentId ?? "",
    isActive: entity?.isActive ?? true,
  });

  const update = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validate = () => {
    const newErrors: Record<string, { message: string }> = {};
    if (!form.code.trim()) newErrors.code = { message: "Code is required" };
    if (!form.name.trim()) newErrors.name = { message: "Name is required" };
    if (isEdit && form.parentId === entity?.id)
      newErrors.parentId = { message: "Cannot select self as parent" };
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({
        ...form,
        parentId: form.parentId || null,
        legalName: form.legalName || null,
        country: form.country || null,
        currency: form.currency || null,
      });
    } finally {
      setSaving(false);
    }
  };

  const potentialParents = entities.filter((e) => e.id !== entity?.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {isEdit ? "Edit Entity" : "Add Entity"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Legal entity or business unit
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Code + Currency */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Entity Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => update("code", e.target.value.toUpperCase())}
                placeholder="e.g. TH-HQ"
                maxLength={20}
                className={cn(
                  "h-9 w-full rounded-md border bg-white px-3 text-sm focus:outline-none focus:ring-1 transition-colors",
                  errors.code
                    ? "border-red-400 focus:ring-red-200"
                    : "border-input focus:border-primary focus:ring-primary/20"
                )}
              />
              {errors.code && (
                <p className="mt-1 text-xs text-red-500">{errors.code.message}</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Functional Currency
              </label>
              <div className="relative">
                <select
                  value={form.currency}
                  onChange={(e) => update("currency", e.target.value)}
                  className="h-9 w-full appearance-none rounded-md border border-input bg-white px-3 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-colors"
                >
                  <option value="">— Select —</option>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Entity Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="e.g. Thailand Headquarters"
              className={cn(
                "h-9 w-full rounded-md border bg-white px-3 text-sm focus:outline-none focus:ring-1 transition-colors",
                errors.name
                  ? "border-red-400 focus:ring-red-200"
                  : "border-input focus:border-primary focus:ring-primary/20"
              )}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* Legal Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Legal Name
            </label>
            <input
              type="text"
              value={form.legalName}
              onChange={(e) => update("legalName", e.target.value)}
              placeholder="Official registered name"
              className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-colors"
            />
          </div>

          {/* Country + Parent */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Country
              </label>
              <div className="relative">
                <select
                  value={form.country}
                  onChange={(e) => update("country", e.target.value)}
                  className="h-9 w-full appearance-none rounded-md border border-input bg-white px-3 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-colors"
                >
                  <option value="">— Select —</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Parent Entity
              </label>
              <div className="relative">
                <select
                  value={form.parentId}
                  onChange={(e) => update("parentId", e.target.value)}
                  className="h-9 w-full appearance-none rounded-md border border-input bg-white px-3 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-colors"
                >
                  <option value="">— None —</option>
                  {potentialParents.map((e) => (
                    <option key={e.id} value={e.id}>
                      [{e.code}] {e.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
              {errors.parentId && (
                <p className="mt-1 text-xs text-red-500">{errors.parentId.message}</p>
              )}
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => update("isActive", !form.isActive)}
              className={cn(
                "relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors",
                form.isActive ? "bg-primary" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                  form.isActive ? "translate-x-4" : "translate-x-0"
                )}
              />
            </button>
            <label className="text-sm text-foreground">
              {form.isActive ? "Active" : "Inactive"}
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-md border border-input px-4 text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Update Entity" : "Create Entity"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
