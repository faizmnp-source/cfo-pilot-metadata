"use client";

import { useState } from "react";
import { X, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface DimensionRecord {
  id: string;
  code: string;
  name: string;
  parentId?: string | null;
  description?: string | null;
  isActive: boolean;
  [key: string]: unknown;
}

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "select" | "textarea" | "boolean";
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  maxLength?: number;
  transform?: (v: string) => string;
}

interface DimensionFormProps {
  title: string;
  subtitle?: string;
  record?: DimensionRecord | null;
  records?: DimensionRecord[];
  extraFields?: FieldDef[];
  onSave: (data: Partial<DimensionRecord>) => Promise<void>;
  onClose: () => void;
}

export function DimensionForm({
  title,
  subtitle,
  record,
  records = [],
  extraFields = [],
  onSave,
  onClose,
}: DimensionFormProps) {
  const isEdit = !!record;
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Build initial form state
  const initialState: Record<string, unknown> = {
    code: record?.code ?? "",
    name: record?.name ?? "",
    parentId: record?.parentId ?? "",
    description: record?.description ?? "",
    isActive: record?.isActive ?? true,
  };
  extraFields.forEach((f) => {
    initialState[f.key] = record?.[f.key] ?? (f.type === "boolean" ? true : "");
  });

  const [form, setForm] = useState<Record<string, unknown>>(initialState);

  const update = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!String(form.code ?? "").trim()) newErrors.code = "Code is required";
    if (!String(form.name ?? "").trim()) newErrors.name = "Name is required";
    if (isEdit && form.parentId === record?.id)
      newErrors.parentId = "Cannot select self as parent";
    extraFields.forEach((f) => {
      if (f.required && !String(form[f.key] ?? "").trim()) {
        newErrors[f.key] = `${f.label} is required`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        parentId: form.parentId || null,
        description: form.description || null,
      };
      extraFields.forEach((f) => {
        if (f.type !== "boolean" && !payload[f.key]) payload[f.key] = null;
      });
      await onSave(payload as Partial<DimensionRecord>);
    } finally {
      setSaving(false);
    }
  };

  const potentialParents = records.filter((r) => r.id !== record?.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Code */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={String(form.code ?? "")}
              onChange={(e) => update("code", e.target.value.toUpperCase())}
              maxLength={20}
              placeholder="e.g. DEPT-001"
              className={cn(
                "h-9 w-full rounded-md border bg-white px-3 text-sm focus:outline-none focus:ring-1 transition-colors",
                errors.code
                  ? "border-red-400 focus:ring-red-200"
                  : "border-input focus:border-primary focus:ring-primary/20"
              )}
            />
            {errors.code && <p className="mt-1 text-xs text-red-500">{errors.code}</p>}
          </div>

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={String(form.name ?? "")}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Display name"
              className={cn(
                "h-9 w-full rounded-md border bg-white px-3 text-sm focus:outline-none focus:ring-1 transition-colors",
                errors.name
                  ? "border-red-400 focus:ring-red-200"
                  : "border-input focus:border-primary focus:ring-primary/20"
              )}
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>

          {/* Extra fields */}
          {extraFields.map((field) => (
            <div key={field.key}>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </label>
              {field.type === "select" ? (
                <div className="relative">
                  <select
                    value={String(form[field.key] ?? "")}
                    onChange={(e) => update(field.key, e.target.value)}
                    className={cn(
                      "h-9 w-full appearance-none rounded-md border bg-white px-3 pr-8 text-sm focus:outline-none focus:ring-1 transition-colors",
                      errors[field.key]
                        ? "border-red-400 focus:ring-red-200"
                        : "border-input focus:border-primary focus:ring-primary/20"
                    )}
                  >
                    <option value="">— Select —</option>
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
              ) : field.type === "textarea" ? (
                <textarea
                  value={String(form[field.key] ?? "")}
                  onChange={(e) => update(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  rows={2}
                  className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none transition-colors"
                />
              ) : field.type === "boolean" ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => update(field.key, !form[field.key])}
                    className={cn(
                      "relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors",
                      form[field.key] ? "bg-primary" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                        form[field.key] ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>
                  <span className="text-sm text-foreground">
                    {form[field.key] ? "Yes" : "No"}
                  </span>
                </div>
              ) : (
                <input
                  type="text"
                  value={String(form[field.key] ?? "")}
                  onChange={(e) =>
                    update(field.key, field.transform ? field.transform(e.target.value) : e.target.value)
                  }
                  placeholder={field.placeholder}
                  maxLength={field.maxLength}
                  className={cn(
                    "h-9 w-full rounded-md border bg-white px-3 text-sm focus:outline-none focus:ring-1 transition-colors",
                    errors[field.key]
                      ? "border-red-400 focus:ring-red-200"
                      : "border-input focus:border-primary focus:ring-primary/20"
                  )}
                />
              )}
              {errors[field.key] && (
                <p className="mt-1 text-xs text-red-500">{errors[field.key]}</p>
              )}
            </div>
          ))}

          {/* Parent */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Parent
            </label>
            <div className="relative">
              <select
                value={String(form.parentId ?? "")}
                onChange={(e) => update("parentId", e.target.value)}
                className="h-9 w-full appearance-none rounded-md border border-input bg-white px-3 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-colors"
              >
                <option value="">— None (Root Level) —</option>
                {potentialParents.map((r) => (
                  <option key={r.id} value={r.id}>
                    [{r.code}] {r.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
            {errors.parentId && (
              <p className="mt-1 text-xs text-red-500">{errors.parentId}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Description
            </label>
            <textarea
              value={String(form.description ?? "")}
              onChange={(e) => update("description", e.target.value)}
              rows={2}
              placeholder="Optional description..."
              className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none transition-colors"
            />
          </div>

          {/* Active */}
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
        </form>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-input px-4 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEdit ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
