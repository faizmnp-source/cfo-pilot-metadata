"use client";

// New Form dialog — layout picker + axis + member selection + POV defaults.
// V1 simplifications: rowSelection limited to all_leaves / children_of (no
// manual list picker yet — that's a Phase 2 tree component). Col selection
// is always "all_leaves" of TIME (rendered as months under current FY).
// Scenarios for VARIANCE / SCENARIO_STACK are picked from multi-select.

import { useEffect, useState } from "react";
import { X, LayoutGrid, ArrowLeftRight, Layers, Star } from "lucide-react";

type Member = { id: string; code: string; name: string };
type LayoutT = "STANDARD" | "VARIANCE" | "SCENARIO_STACK";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

async function fetchMembers(slug: string): Promise<Member[]> {
  const r = await fetch(`/api/v2/members/${slug}?pageSize=500`, { credentials: "include" });
  const j = await r.json().catch(() => null);
  return (j?.data?.data ?? [])
    .filter((m: any) => m.isActive)
    .map((m: any) => ({ id: m.id, code: m.memberCode, name: m.memberName }));
}

export function NewFormDialog({ onClose, onSaved }: Props) {
  const [name, setName]     = useState("");
  const [code, setCode]     = useState("");
  const [desc, setDesc]     = useState("");
  const [layout, setLayout] = useState<LayoutT>("STANDARD");
  const [isDefault, setIsDefault] = useState(false);

  // Row selection
  const [rowKind, setRowKind] = useState<"all_leaves" | "children_of">("all_leaves");
  const [rowParent, setRowParent] = useState<string>("");
  const [accounts, setAccounts] = useState<Member[]>([]);

  // Scenario selection (for VARIANCE / SCENARIO_STACK)
  const [scenarios, setScenarios] = useState<Member[]>([]);
  const [pickedScenarios, setPickedScenarios] = useState<string[]>([]);

  // POV defaults
  const [entities, setEntities] = useState<Member[]>([]);
  const [defaultEntity, setDefaultEntity] = useState<string>("");
  const [defaultScenario, setDefaultScenario] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [accts, scns, ents] = await Promise.all([
        fetchMembers("account"), fetchMembers("scenario"), fetchMembers("entity"),
      ]);
      setAccounts(accts); setScenarios(scns); setEntities(ents);
      if (ents[0]) setDefaultEntity(ents[0].id);
      if (scns[0]) setDefaultScenario(scns[0].id);
    })();
  }, []);

  // Auto-fill code from name (kebab-cased, lowercase)
  function syncCode(newName: string) {
    setName(newName);
    if (!code || code === slug(name)) setCode(slug(newName));
  }
  function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64); }

  function toggleScenarioPick(id: string) {
    setPickedScenarios(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }

  async function save() {
    setError(null);
    if (!name.trim()) { setError("Form name required"); return; }
    if (!code.trim()) { setError("Form code required"); return; }
    if (rowKind === "children_of" && !rowParent) { setError("Pick a parent account"); return; }
    if (layout === "VARIANCE" && pickedScenarios.length !== 2) { setError("Variance needs exactly 2 scenarios"); return; }
    if (layout === "SCENARIO_STACK" && pickedScenarios.length < 2) { setError("Scenario stack needs at least 2 scenarios"); return; }

    setSaving(true);
    try {
      const rowSelection = rowKind === "all_leaves"
        ? { kind: "all_leaves" }
        : { kind: "children_of", parentMemberId: rowParent };

      const povDefaults: Record<string, string> = {};
      if (defaultEntity)   povDefaults.ENTITY   = defaultEntity;
      if (defaultScenario && layout === "STANDARD") povDefaults.SCENARIO = defaultScenario;

      const r = await fetch("/api/v2/forms", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code, name, description: desc || undefined, layoutType: layout,
          rowSelection,
          colSelection: { kind: "all_leaves" }, // time months for current FY
          scenarioIds: layout === "STANDARD" ? [] : pickedScenarios,
          povDefaults,
          isDefault,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        const detail = j?.details?.issues?.[0]?.message;
        throw new Error(detail ? `${j.error} — ${detail}` : (j?.error ?? `HTTP ${r.status}`));
      }
      onSaved();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">New form</h2>
            <p className="text-xs text-muted-foreground">Scope the input grid to a curated subset of accounts and choose how columns lay out.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Basics */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Basics</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" required>
                <input value={name} onChange={(e) => syncCode(e.target.value)} placeholder="P&L Variance Review" className={inputCls} />
              </Field>
              <Field label="Code (URL slug)" required>
                <input value={code} onChange={(e) => setCode(slug(e.target.value))} placeholder="pl_variance" className={`${inputCls} font-mono text-xs`} />
              </Field>
            </div>
            <Field label="Description (optional)">
              <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Side-by-side Actual vs Budget for P&L accounts" className={inputCls} />
            </Field>
            <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              <Star className="h-3 w-3" /> Make this the default form for /data/input
            </label>
          </section>

          {/* Layout */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Layout</h3>
            <div className="grid grid-cols-3 gap-2">
              <LayoutCard active={layout === "STANDARD"}       onClick={() => setLayout("STANDARD")}       icon={LayoutGrid}     title="Standard"       desc="Account × Time (single scenario in POV)" />
              <LayoutCard active={layout === "VARIANCE"}       onClick={() => setLayout("VARIANCE")}       icon={ArrowLeftRight} title="Variance"       desc="Actual vs Budget side-by-side + auto Δ%" />
              <LayoutCard active={layout === "SCENARIO_STACK"} onClick={() => setLayout("SCENARIO_STACK")} icon={Layers}         title="Scenario stack" desc="Multiple scenarios on columns (one Time)" />
            </div>
          </section>

          {/* Rows */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Rows — Accounts to include</h3>
            <div className="flex items-start gap-3">
              <label className="flex-1 flex items-center gap-2 rounded-lg border border-border bg-white p-3 cursor-pointer hover:border-indigo-300 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50/50">
                <input type="radio" name="rowKind" checked={rowKind === "all_leaves"} onChange={() => setRowKind("all_leaves")} />
                <div>
                  <p className="text-sm font-medium text-gray-900">All leaf accounts</p>
                  <p className="text-xs text-muted-foreground">Every input-allowed account — {accounts.filter(a => true).length} total</p>
                </div>
              </label>
              <label className="flex-1 flex items-start gap-2 rounded-lg border border-border bg-white p-3 cursor-pointer hover:border-indigo-300 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50/50">
                <input type="radio" name="rowKind" checked={rowKind === "children_of"} onChange={() => setRowKind("children_of")} className="mt-1" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Children of an account</p>
                  <p className="text-xs text-muted-foreground mb-2">Pick any parent — all its descendants (leaves only) appear on rows</p>
                  <select
                    value={rowParent}
                    onChange={(e) => setRowParent(e.target.value)}
                    disabled={rowKind !== "children_of"}
                    className={`${inputCls} ${rowKind !== "children_of" ? "opacity-50" : ""}`}
                  >
                    <option value="">— pick a parent —</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                  </select>
                </div>
              </label>
            </div>
          </section>

          {/* Scenarios (only for VARIANCE / SCENARIO_STACK) */}
          {layout !== "STANDARD" && (
            <section>
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                Scenarios to compare {layout === "VARIANCE" ? "(pick exactly 2 — Actual & Budget recommended)" : "(pick 2 or more)"}
              </h3>
              <div className="flex flex-wrap gap-2">
                {scenarios.map(s => {
                  const picked = pickedScenarios.includes(s.id);
                  const order = pickedScenarios.indexOf(s.id);
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => toggleScenarioPick(s.id)}
                      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                        picked
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-border bg-white text-gray-700 hover:border-indigo-300"
                      }`}
                    >
                      {picked && <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">{order + 1}</span>}
                      <span className="font-mono text-[10px] text-gray-500">{s.code}</span>
                      <span>{s.name}</span>
                    </button>
                  );
                })}
              </div>
              {layout === "VARIANCE" && pickedScenarios.length === 2 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Δ% will be computed as (#1 − #2) / #2 × 100, shown as a third column per time period.
                </p>
              )}
            </section>
          )}

          {/* POV defaults */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">POV defaults</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Default Entity">
                <select value={defaultEntity} onChange={(e) => setDefaultEntity(e.target.value)} className={inputCls}>
                  <option value="">— none —</option>
                  {entities.map(e => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}
                </select>
              </Field>
              {layout === "STANDARD" && (
                <Field label="Default Scenario">
                  <select value={defaultScenario} onChange={(e) => setDefaultScenario(e.target.value)} className={inputCls}>
                    <option value="">— none —</option>
                    {scenarios.map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
                  </select>
                </Field>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Currency / ICP / Origin defaults are inferred at open-time (base currency, [None], Form).
            </p>
          </section>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">⚠ {error}</div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          <button onClick={onClose} className="text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Create form"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function LayoutCard({ active, onClick, icon: Icon, title, desc }: { active: boolean; onClick: () => void; icon: any; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition-all ${
        active
          ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
          : "border-border bg-white hover:border-indigo-300"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${active ? "text-indigo-600" : "text-gray-500"}`} />
        <span className={`text-sm font-medium ${active ? "text-indigo-700" : "text-gray-900"}`}>{title}</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">{desc}</p>
    </button>
  );
}
