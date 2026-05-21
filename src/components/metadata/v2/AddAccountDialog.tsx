"use client";

// Add Member dialog for the Account dimension.
// Typed dropdowns for every enum field — Faizan + epm-architect said
// "never magic strings in form inputs."
//
// Posts to /api/v2/members/account (Slice 1.1). On success calls onSaved
// so the parent page can refresh its list.

import { useState } from "react";
import { toast } from "sonner";
import { X, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AccountType, TimeBalance, StorageType, CalculationType,
  VarianceType, CurrencyBehavior,
} from "@/lib/dim-enums";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (created: any) => void;
}

const EMPTY = {
  memberCode: "",
  memberName: "",
  description: "",
  isActive: true,
  sortOrder: 0,
  storageType: StorageType.STORED as string,
  calculationType: CalculationType.INPUT as string,
  formula: "",
  account_type:       AccountType.EXPENSE as string,
  time_balance:       TimeBalance.FLOW as string,
  switch_sign:        false,
  variance_type:      VarianceType.NEUTRAL as string,
  currency_behavior:  CurrencyBehavior.TRANSACTIONAL as string,
  allow_input:        true,
  is_consolidated:    true,
};

export function AddAccountDialog({ open, onClose, onSaved }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.memberCode.trim() || !form.memberName.trim()) {
      toast.error("Code and Name are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/v2/members/account", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberCode: form.memberCode.trim(),
          memberName: form.memberName.trim(),
          description: form.description.trim() || null,
          isActive: form.isActive,
          sortOrder: form.sortOrder,
          storageType: form.storageType,
          calculationType: form.calculationType,
          formula: form.calculationType === CalculationType.FORMULA ? form.formula : null,
          properties: {
            account_type:       form.account_type,
            time_balance:       form.time_balance,
            switch_sign:        form.switch_sign,
            storage_type:       form.storageType,
            calculation_type:   form.calculationType,
            variance_type:      form.variance_type,
            currency_behavior:  form.currency_behavior,
            allow_input:        form.allow_input,
            is_consolidated:    form.is_consolidated,
            formula:            form.calculationType === CalculationType.FORMULA ? form.formula : null,
          },
        }),
      });
      let data: any = {};
      try { data = await res.json(); } catch { /* non-JSON body */ }
      if (!res.ok) {
        const detail = data?.error
          ?? data?.details?.issues?.[0]?.message
          ?? (res.status === 401 ? "Not signed in — please log in again on this URL"
              : `HTTP ${res.status}`);
        throw new Error(detail);
      }
      toast.success(`✅ Created account ${form.memberCode}`);
      onSaved(data.data);
      setForm(EMPTY);
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">Add Account</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="max-h-[70vh] overflow-y-auto p-6 space-y-4">
          {/* Identity */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Code" required>
              <input
                value={form.memberCode}
                onChange={(e) => set("memberCode", e.target.value)}
                placeholder="e.g. 4000"
                className={inputCls}
              />
            </Field>
            <Field label="Name" required>
              <input
                value={form.memberName}
                onChange={(e) => set("memberName", e.target.value)}
                placeholder="e.g. Product Revenue"
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Description (optional)">
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              className={cn(inputCls, "resize-none")}
            />
          </Field>

          {/* Typed enums — the EPM-correctness section */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Account behaviour (typed)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Account Type" required>
                <Select value={form.account_type} onChange={(v) => set("account_type", v)}>
                  {Object.values(AccountType).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Time Balance">
                <Select value={form.time_balance} onChange={(v) => set("time_balance", v)}>
                  {Object.values(TimeBalance).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Storage Type">
                <Select value={form.storageType} onChange={(v) => set("storageType", v)}>
                  {Object.values(StorageType).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Calculation Type">
                <Select value={form.calculationType} onChange={(v) => set("calculationType", v)}>
                  {Object.values(CalculationType).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Variance Type">
                <Select value={form.variance_type} onChange={(v) => set("variance_type", v)}>
                  {Object.values(VarianceType).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Currency Behavior">
                <Select value={form.currency_behavior} onChange={(v) => set("currency_behavior", v)}>
                  {Object.values(CurrencyBehavior).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* Booleans */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              <Check label="Switch Sign"      checked={form.switch_sign}     onChange={(v) => set("switch_sign", v)} />
              <Check label="Allow Input"      checked={form.allow_input}     onChange={(v) => set("allow_input", v)} />
              <Check label="Is Consolidated"  checked={form.is_consolidated} onChange={(v) => set("is_consolidated", v)} />
            </div>

            {form.calculationType === CalculationType.FORMULA && (
              <Field label="Formula">
                <input
                  value={form.formula}
                  onChange={(e) => set("formula", e.target.value)}
                  placeholder="e.g. [Operating Income] + [Dep] + [Amort]"
                  className={cn(inputCls, "font-mono text-xs")}
                />
              </Field>
            )}
          </div>

          {/* Status */}
          <div className="grid grid-cols-2 gap-3">
            <Check label="Active" checked={form.isActive} onChange={(v) => set("isActive", v)} />
            <Field label="Sort Order">
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => set("sortOrder", Number(e.target.value))}
                className={inputCls}
              />
            </Field>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tiny inline UI helpers ──────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {children}
    </select>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
      />
      {label}
    </label>
  );
}
