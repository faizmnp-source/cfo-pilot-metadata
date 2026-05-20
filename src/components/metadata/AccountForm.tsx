"use client";

import { useState, useEffect } from "react";
import { X, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId?: string | null;
  reportingGroup?: string | null;
  description?: string | null;
  isActive: boolean;
}

interface AccountFormProps {
  account?: Account | null;
  accounts?: Account[]; // for parent selection
  onSave: (data: Partial<Account>) => Promise<void>;
  onClose: () => void;
}

const ACCOUNT_TYPES = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
] as const;

type FieldError = { message: string };

export function AccountForm({
  account,
  accounts = [],
  onSave,
  onClose,
}: AccountFormProps) {
  const isEdit = !!account;
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, FieldError>>({});

  const [form, setForm] = useState({
    code: account?.code ?? "",
    name: account?.name ?? "",
    type: account?.type ?? "ASSET",
    parentId: account?.parentId ?? "",
    reportingGroup: account?.reportingGroup ?? "",
    description: account?.description ?? "",
    isActive: account?.isActive ?? true,
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
    const newErrors: Record<string, FieldError> = {};
    if (!form.code.trim()) newErrors.code = { message: "Code is required" };
    if (form.code.length > 20) newErrors.code = { message: "Max 20 characters" };
    if (!form.name.trim()) newErrors.name = { message: "Name is required" };
    if (!form.type) newErrors.type = { message: "Type is required" };
    // Prevent self-reference
    if (isEdit && form.parentId === account?.id) {
      newErrors.parentId = { message: "Cannot select self as parent" };
    }
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
        reportingGroup: form.reportingGroup || null,
        description: form.description || null,
      });
    } finally {
      setSaving(false);
    }
  };

  // Potential parents: all except self + descendants (simplified: just exclude self)
  const potentialParents = accounts.filter(
    (a) => a.id !== account?.id
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {isEdit ? "Edit Account" : "Add Account"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isEdit
                ? "Update account details"
                : "Create a new chart of accounts entry"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Code + Type row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Account Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => update("code", e.target.value.toUpperCase())}
                placeholder="e.g. 1100"
                maxLength={20}
                className={cn(
                  "h-9 w-full rounded-md border bg-white px-3 text-sm focus:outline-none focus:ring-1 transition-colors",
                  errors.code
                    ? "border-red-400 focus:border-red-400 focus:ring-red-200"
                    : "border-input focus:border-primary focus:ring-primary/20"
                )}
              />
              {errors.code && (
                <p className="mt-1 text-xs text-red-500">{errors.code.message}</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Account Type <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={form.type}
                  onChange={(e) => update("type", e.target.value)}
                  className={cn(
                    "h-9 w-full appearance-none rounded-md border bg-white px-3 pr-8 text-sm focus:outline-none focus:ring-1 transition-colors",
                    errors.type
                      ? "border-red-400 focus:ring-red-200"
                      : "border-input focus:border-primary focus:ring-primary/20"
                  )}
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0) + t.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Account Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="e.g. Cash and Cash Equivalents"
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

          {/* Parent account */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Parent Account
            </label>
            <div className="relative">
              <select
                value={form.parentId}
                onChange={(e) => update("parentId", e.target.value)}
                className="h-9 w-full appearance-none rounded-md border border-input bg-white px-3 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-colors"
              >
                <option value="">— None (Root Level) —</option>
                {potentialParents.map((a) => (
                  <option key={a.id} value={a.id}>
                    [{a.code}] {a.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
            {errors.parentId && (
              <p className="mt-1 text-xs text-red-500">{errors.parentId.message}</p>
            )}
          </div>

          {/* Reporting group */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Reporting Group
            </label>
            <input
              type="text"
              value={form.reportingGroup}
              onChange={(e) => update("reportingGroup", e.target.value)}
              placeholder="e.g. Current Assets"
              className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={2}
              placeholder="Optional description..."
              className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none transition-colors"
            />
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => update("isActive", !form.isActive)}
              className={cn(
                "relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none",
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

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-md border border-input px-4 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Update Account" : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
