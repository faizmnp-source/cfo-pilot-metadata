"use client";

// Generic Add Member dialog. Switches form fields based on `dim` prop.
// Supports: account, entity, scenario, time, currency, icp, ud1..ud8.
// Each variant POSTs to /api/v2/members/<dim> with the right typed
// properties bag. Audit + duplicate-check handled server-side.

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { X, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AccountType, TimeBalance, StorageType, CalculationType,
  VarianceType, CurrencyBehavior,
  ConsolidationMethod, ScenarioType, TimePeriodType,
} from "@/lib/dim-enums";
import { ISO_4217, ISO_TOP } from "@/lib/iso4217";

export type SupportedDim =
  | "account" | "entity" | "scenario" | "time" | "currency" | "icp" | "origin"
  | "ud1" | "ud2" | "ud3" | "ud4" | "ud5" | "ud6" | "ud7" | "ud8";

interface Props {
  open: boolean;
  dim: SupportedDim;
  dimLabel?: string;          // optional display name override
  mode?: "add" | "edit" | "copy";  // default 'add'
  memberId?: string;          // required for edit/copy — prefills form from this member
  parentMemberId?: string;    // for add: also create a hierarchy edge under this parent
  headerOverride?: string;    // custom dialog title (e.g. 'Add sibling of 4100 (under 4000)')
  onClose: () => void;
  onSaved: (created: any) => void;
}

const TITLE_FOR_DIM: Record<SupportedDim, string> = {
  account: "Account", entity: "Entity", scenario: "Scenario", time: "Time Period",
  currency: "Currency", icp: "Intercompany Partner", origin: "Origin",
  ud1: "Member (UD1)", ud2: "Member (UD2)", ud3: "Member (UD3)", ud4: "Member (UD4)",
  ud5: "Member (UD5)", ud6: "Member (UD6)", ud7: "Member (UD7)", ud8: "Member (UD8)",
};

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function AddMemberDialog({
  open, dim, dimLabel,
  mode = "add", memberId, parentMemberId, headerOverride,
  onClose, onSaved,
}: Props) {
  const [common, setCommon] = useState({
    memberCode: "", memberName: "", description: "",
    isActive: true, sortOrder: 0,
  });
  const [props, setProps] = useState<Record<string, any>>(() => defaultPropsFor(dim));
  const [saving, setSaving] = useState(false);
  const [prefilling, setPrefilling] = useState(false);

  // Prefill form for edit/copy modes
  useEffect(() => {
    if (!open || mode === "add" || !memberId) return;
    setPrefilling(true);
    fetch(`/api/v2/members/${dim}/${memberId}`, { credentials: "include" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error ?? "Failed to load member");
        const m = d.data;
        setCommon({
          memberCode: mode === "copy" ? `${m.memberCode}-copy` : m.memberCode,
          memberName: mode === "copy" ? `${m.memberName} (copy)` : m.memberName,
          description: m.description ?? "",
          isActive: m.isActive,
          sortOrder: m.sortOrder ?? 0,
        });
        setProps({ ...defaultPropsFor(dim), ...(m.properties ?? {}) });
      })
      .catch((e) => toast.error(e?.message ?? "Failed to load"))
      .finally(() => setPrefilling(false));
  }, [open, mode, memberId, dim]);

  if (!open) return null;
  const setC = <K extends keyof typeof common>(k: K, v: (typeof common)[K]) =>
    setCommon((f) => ({ ...f, [k]: v }));
  const setP = (k: string, v: any) => setProps((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!common.memberCode.trim() || !common.memberName.trim()) {
      toast.error("Code and Name are required"); return;
    }
    setSaving(true);
    try {
      const body: any = {
        memberCode: common.memberCode.trim(),
        memberName: common.memberName.trim(),
        description: common.description.trim() || null,
        isActive: common.isActive,
        sortOrder: common.sortOrder,
        properties: cleanProps(dim, props),
      };
      const url = mode === "edit"
        ? `/api/v2/members/${dim}/${memberId}`
        : `/api/v2/members/${dim}`;
      const method = mode === "edit" ? "PUT" : "POST";
      const res = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

      // Add: optionally attach to a parent hierarchy edge
      if (mode !== "edit" && parentMemberId && data?.data?.id) {
        try {
          await fetch(`/api/v2/hierarchy/${dim}`, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              parentMemberId, childMemberId: data.data.id,
              operator: "ADD", weight: 1,
            }),
          });
        } catch { /* edge creation failure shouldn't block member save */ }
      }

      const verb = mode === "edit" ? "Updated" : mode === "copy" ? "Duplicated" : "Created";
      toast.success(`✅ ${verb} ${TITLE_FOR_DIM[dim]} ${common.memberCode}`);
      onSaved(data.data);
      setCommon({ memberCode: "", memberName: "", description: "", isActive: true, sortOrder: 0 });
      setProps(defaultPropsFor(dim));
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">
            {headerOverride ?? (
              mode === "edit" ? `Edit ${dimLabel ?? TITLE_FOR_DIM[dim]}` :
              mode === "copy" ? `Duplicate ${dimLabel ?? TITLE_FOR_DIM[dim]}` :
              parentMemberId ? `Add child to ${dimLabel ?? TITLE_FOR_DIM[dim]}` :
              `Add ${dimLabel ?? TITLE_FOR_DIM[dim]}`
            )}
            {prefilling && <Loader2 className="inline ml-2 h-4 w-4 animate-spin text-muted-foreground" />}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-6 space-y-4">
          {/* Identity */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Code" required>
              <input value={common.memberCode} onChange={(e) => setC("memberCode", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Name" required>
              <input value={common.memberName} onChange={(e) => setC("memberName", e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="Description (optional)">
            <textarea value={common.description} onChange={(e) => setC("description", e.target.value)} rows={2} className={cn(inputCls, "resize-none")} />
          </Field>

          {/* Dim-specific typed properties */}
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{TITLE_FOR_DIM[dim]} properties (typed)</p>
            <PropertyFields dim={dim} props={props} setP={setP} />
          </div>

          {/* Status */}
          <div className="grid grid-cols-2 gap-3">
            <Check label="Active" checked={common.isActive} onChange={(v) => setC("isActive", v)} />
            <Field label="Sort Order">
              <input type="number" value={common.sortOrder} onChange={(e) => setC("sortOrder", Number(e.target.value))} className={inputCls} />
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Per-dim default property values ─────────────────────────────

function defaultPropsFor(dim: SupportedDim): Record<string, any> {
  switch (dim) {
    case "account":
      return {
        account_type: AccountType.EXPENSE, time_balance: TimeBalance.FLOW,
        switch_sign: false, storage_type: StorageType.STORED,
        calculation_type: CalculationType.INPUT, variance_type: VarianceType.NEUTRAL,
        currency_behavior: CurrencyBehavior.TRANSACTIONAL,
        allow_input: true, is_consolidated: true, formula: null,
      };
    case "entity":
      return {
        base_currency: "USD", consolidation_method: ConsolidationMethod.FULL,
        ownership_pct: 100, icp_enabled: false, country: "", tax_id: "",
      };
    case "scenario":
      return { scenario_type: ScenarioType.BUDGET, is_frozen: false, version: "v1", start_period: "", end_period: "" };
    case "time":
      return {
        period_type: TimePeriodType.MONTH, fiscal_year: new Date().getFullYear(),
        start_date: "", end_date: "",
      };
    case "currency":
      return { iso_code: "USD", is_base: false };
    case "icp":
      return { entity_id: "" };
    case "origin":
      return { origin_type: "FORM", description: "" };
    default:  // ud1..ud8
      return {};
  }
}

// Strip empty optional strings before sending
function cleanProps(dim: SupportedDim, p: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === "" || v === null || v === undefined) continue;
    out[k] = v;
  }
  // Re-add booleans that may have been false
  for (const k of ["switch_sign", "allow_input", "is_consolidated", "icp_enabled", "is_base", "is_frozen"]) {
    if (k in p && typeof p[k] === "boolean") out[k] = p[k];
  }
  return out;
}

// ─── Per-dim field renderer ──────────────────────────────────────

function PropertyFields({
  dim, props, setP,
}: { dim: SupportedDim; props: Record<string, any>; setP: (k: string, v: any) => void; }) {
  switch (dim) {
    case "account":
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account Type" required>
              <Select value={props.account_type} onChange={(v) => setP("account_type", v)} options={Object.values(AccountType)} />
            </Field>
            <Field label="Time Balance">
              <Select value={props.time_balance} onChange={(v) => setP("time_balance", v)} options={Object.values(TimeBalance)} />
            </Field>
            <Field label="Storage Type">
              <Select value={props.storage_type} onChange={(v) => setP("storage_type", v)} options={Object.values(StorageType)} />
            </Field>
            <Field label="Calculation Type">
              <Select value={props.calculation_type} onChange={(v) => setP("calculation_type", v)} options={Object.values(CalculationType)} />
            </Field>
            <Field label="Variance Type">
              <Select value={props.variance_type} onChange={(v) => setP("variance_type", v)} options={Object.values(VarianceType)} />
            </Field>
            <Field label="Currency Behavior">
              <Select value={props.currency_behavior} onChange={(v) => setP("currency_behavior", v)} options={Object.values(CurrencyBehavior)} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-2">
            <Check label="Switch Sign"     checked={!!props.switch_sign}     onChange={(v) => setP("switch_sign", v)} />
            <Check label="Allow Input"     checked={!!props.allow_input}     onChange={(v) => setP("allow_input", v)} />
            <Check label="Is Consolidated" checked={!!props.is_consolidated} onChange={(v) => setP("is_consolidated", v)} />
          </div>
          {props.calculation_type === CalculationType.FORMULA && (
            <Field label="Formula">
              <input value={props.formula ?? ""} onChange={(e) => setP("formula", e.target.value)} placeholder="e.g. [Operating Income] + [Dep]" className={cn(inputCls, "font-mono text-xs")} />
            </Field>
          )}
        </>
      );

    case "entity":
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Base Currency" required>
              <select value={props.base_currency} onChange={(e) => setP("base_currency", e.target.value)} className={inputCls}>
                <optgroup label="Most common">
                  {ISO_TOP.map((c) => {
                    const x = ISO_4217.find((y) => y.code === c)!;
                    return <option key={c} value={c}>{x.code} — {x.name}</option>;
                  })}
                </optgroup>
                <optgroup label="All ISO 4217">
                  {ISO_4217.filter((c) => !ISO_TOP.includes(c.code)).map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </optgroup>
              </select>
            </Field>
            <Field label="Consolidation Method">
              <Select value={props.consolidation_method} onChange={(v) => setP("consolidation_method", v)} options={Object.values(ConsolidationMethod)} />
            </Field>
            <Field label="Ownership %">
              <input type="number" min={0} max={100} step={0.01} value={props.ownership_pct} onChange={(e) => setP("ownership_pct", Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="Country (optional)">
              <input value={props.country} onChange={(e) => setP("country", e.target.value)} placeholder="e.g. US, IN, UK" className={inputCls} />
            </Field>
            <Field label="Tax ID (optional)">
              <input value={props.tax_id} onChange={(e) => setP("tax_id", e.target.value)} className={inputCls} />
            </Field>
            <Check label="ICP Enabled (intercompany)" checked={!!props.icp_enabled} onChange={(v) => setP("icp_enabled", v)} />
          </div>
        </>
      );

    case "scenario":
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Scenario Type" required>
              <Select value={props.scenario_type} onChange={(v) => setP("scenario_type", v)} options={Object.values(ScenarioType)} />
            </Field>
            <Field label="Version">
              <input value={props.version} onChange={(e) => setP("version", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Start Period (optional)">
              <input value={props.start_period} onChange={(e) => setP("start_period", e.target.value)} placeholder="e.g. 2026M01" className={inputCls} />
            </Field>
            <Field label="End Period (optional)">
              <input value={props.end_period} onChange={(e) => setP("end_period", e.target.value)} placeholder="e.g. 2026M12" className={inputCls} />
            </Field>
            <Check label="Frozen (read-only)" checked={!!props.is_frozen} onChange={(v) => setP("is_frozen", v)} />
          </div>
        </>
      );

    case "time":
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Period Type" required>
              <Select value={props.period_type} onChange={(v) => setP("period_type", v)} options={Object.values(TimePeriodType)} />
            </Field>
            <Field label="Fiscal Year" required>
              <input type="number" min={2000} max={2099} value={props.fiscal_year} onChange={(e) => setP("fiscal_year", Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="Start Date" required>
              <input type="date" value={props.start_date} onChange={(e) => setP("start_date", e.target.value)} className={inputCls} />
            </Field>
            <Field label="End Date" required>
              <input type="date" value={props.end_date} onChange={(e) => setP("end_date", e.target.value)} className={inputCls} />
            </Field>
          </div>
        </>
      );

    case "currency":
      return (
        <>
          <Field label="ISO 4217 Code" required>
            <select value={props.iso_code} onChange={(e) => setP("iso_code", e.target.value)} className={inputCls}>
              {ISO_4217.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol})</option>
              ))}
            </select>
          </Field>
          <Check label="Set as Base Currency" checked={!!props.is_base} onChange={(v) => setP("is_base", v)} />
        </>
      );

    case "icp":
      return (
        <Field label="Linked Entity Member ID" required>
          <input value={props.entity_id} onChange={(e) => setP("entity_id", e.target.value)} placeholder="UUID of an Entity member" className={cn(inputCls, "font-mono text-xs")} />
        </Field>
      );

    case "origin":
      return (
        <>
          <Field label="Origin Type" required>
            <select value={props.origin_type} onChange={(e) => setP("origin_type", e.target.value)} className={inputCls}>
              {["IMPORT","FORM","AI","CALC","ELIM","CONSOL","TRANSLATION","ALLOC","JOURNAL"].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>
          <Field label="Description (optional)">
            <input value={props.description ?? ""} onChange={(e) => setP("description", e.target.value)} placeholder="e.g. Loaded from Tally TB export" className={inputCls} />
          </Field>
        </>
      );

    default:  // UD1..UD8
      return (
        <div className="text-xs text-muted-foreground">
          Custom dimension. Properties bag is free-form — add any key/value pairs after create via Edit dialog.
        </div>
      );
  }
}

// ─── Tiny inline UI helpers ──────────────────────────────────────

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

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
      {label}
    </label>
  );
}
