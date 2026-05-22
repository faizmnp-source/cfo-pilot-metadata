"use client";

// Data Input — form-driven grid. Supports three layouts:
//   STANDARD       — Account × Time (single scenario in POV)
//   VARIANCE       — Account × Time × Scenario (auto Δ%)
//   SCENARIO_STACK — Account × Scenario (single Time in POV)
//
// Without a ?form= URL param, falls back to STANDARD with all leaf accounts.
// Layout 2 polish: quarter dividers, pulse-on-save, indigo focus rings,
// parent-row wash with lock icon + reason, monospace account codes.

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { Lock, Sparkles, ChevronDown, ChevronRight as ChevRight, Save, Loader2, LayoutGrid, ArrowLeftRight, Layers, FileText } from "lucide-react";

type Member  = { id: string; code: string; name: string };
type Account = Member & { isLeaf: boolean; isIcp: boolean };
type Month   = Member & { monthIndex: number | null };
type Cell    = { accountId: string; timeId: string; value: number; version: number; postedBy: string; postedAt: string; originId: string; factId: string };

type LayoutT = "STANDARD" | "VARIANCE" | "SCENARIO_STACK";

interface DataForm {
  id: string; code: string; name: string; description: string | null;
  layoutType: LayoutT;
  rowSelection: { kind: string; parentMemberId?: string; memberIds?: string[] };
  scenarioIds: string[];
  povDefaults: Record<string, string>;
}

async function fetchDimMembers(slug: string, limit = 200): Promise<Member[]> {
  const r = await fetch(`/api/v2/members/${slug}?pageSize=${limit}`, { credentials: "include" });
  const j = await r.json().catch(() => null);
  return (j?.data?.data ?? [])
    .filter((m: any) => m.isActive)
    .map((m: any) => ({ id: m.id, code: m.memberCode, name: m.memberName }));
}

async function fetchBaseCurrency(): Promise<Member | null> {
  const r = await fetch(`/api/v2/members/currency?pageSize=200`, { credentials: "include" });
  const j = await r.json().catch(() => null);
  const rows = j?.data?.data ?? [];
  const base = rows.find((m: any) => m?.properties?.is_base === true) ?? rows[0];
  return base ? { id: base.id, code: base.memberCode, name: base.memberName } : null;
}

export default function DataInputPageWrapper() {
  return <Suspense fallback={<div />}><DataInputPage /></Suspense>;
}

function DataInputPage() {
  const params = useSearchParams();
  const formCode = params.get("form") ?? "";

  // ─── Form definition ──────────────────────────────────────────
  const [form, setForm] = useState<DataForm | null>(null);
  const [formLoading, setFormLoading] = useState<boolean>(Boolean(formCode));

  // ─── POV state ─────────────────────────────────────────────────
  const [scenarios, setScenarios] = useState<Member[]>([]);
  const [years,     setYears]     = useState<Member[]>([]);
  const [entities,  setEntities]  = useState<Member[]>([]);
  const [currencies, setCurrencies] = useState<Member[]>([]);
  const [icps,       setIcps]       = useState<Member[]>([]);
  const [origins,    setOrigins]    = useState<Member[]>([]);

  const [scenarioId, setScenarioId] = useState<string>("");
  const [yearCode,   setYearCode]   = useState<string>("");
  const [entityId,   setEntityId]   = useState<string>("");
  const [currencyId, setCurrencyId] = useState<string>("");
  const [icpId,      setIcpId]      = useState<string>("");
  const [originId,   setOriginId]   = useState<string>("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // ─── Grid state ────────────────────────────────────────────────
  type GridData = { accounts: Account[]; months: Month[]; cellsByScenario: Map<string, Map<string, Cell>> };
  const [grid, setGrid] = useState<GridData | null>(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [pulsedKey, setPulsedKey] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── Load form first (if URL has ?form=) ─────────────────────
  useEffect(() => {
    if (!formCode) { setFormLoading(false); return; }
    fetch(`/api/v2/forms?code=${encodeURIComponent(formCode)}`, { credentials: "include" })
      .then(r => r.json())
      .then(j => { setForm(j?.data ?? null); })
      .catch(() => setError("Form not found"))
      .finally(() => setFormLoading(false));
  }, [formCode]);

  // ─── Load POV options once ────────────────────────────────────
  useEffect(() => {
    (async () => {
      const [scns, ents, all_times, ccys, icps_, orgs, base] = await Promise.all([
        fetchDimMembers("scenario"),
        fetchDimMembers("entity"),
        fetchDimMembers("time", 500),
        fetchDimMembers("currency"),
        fetchDimMembers("icp"),
        fetchDimMembers("origin"),
        fetchBaseCurrency(),
      ]);
      setScenarios(scns);
      setEntities(ents);
      setYears(all_times.filter(m => /^FY\d{4}$/.test(m.code)));
      setCurrencies(ccys);
      setIcps(icps_);
      setOrigins(orgs);
      if (scns[0])    setScenarioId(prev => prev || scns[0].id);
      if (ents[0])    setEntityId(prev => prev || ents[0].id);
      const ccyPick = base?.id ?? ccys[0]?.id; if (ccyPick) setCurrencyId(prev => prev || ccyPick);
      const none = icps_.find(m => m.code === "None"); if (none) setIcpId(prev => prev || none.id);
      const formO = orgs.find(m => m.code === "Form");  if (formO) setOriginId(prev => prev || formO.id);
      const fy   = all_times.find(m => /^FY\d{4}$/.test(m.code)); if (fy) setYearCode(prev => prev || fy.code);
    })().catch(e => setError(String(e)));
  }, []);

  // ─── Apply form POV defaults once form is loaded ─────────────
  useEffect(() => {
    if (!form) return;
    const d = form.povDefaults || {};
    if (d.SCENARIO) setScenarioId(d.SCENARIO);
    if (d.ENTITY)   setEntityId(d.ENTITY);
    if (d.CURRENCY) setCurrencyId(d.CURRENCY);
    if (d.ICP)      setIcpId(d.ICP);
    if (d.ORIGIN)   setOriginId(d.ORIGIN);
  }, [form]);

  // ─── Load grid (form-aware) ──────────────────────────────────
  async function loadGrid() {
    const layout = form?.layoutType ?? "STANDARD";
    if (!entityId || !yearCode) return;
    if (layout === "STANDARD" && !scenarioId) return;
    if ((layout === "VARIANCE" || layout === "SCENARIO_STACK") && (!form || form.scenarioIds.length === 0)) return;

    setGridLoading(true);
    setError(null);
    try {
      const scenariosToFetch =
        layout === "STANDARD" ? [scenarioId] : (form?.scenarioIds ?? []);

      const responses = await Promise.all(
        scenariosToFetch.map(scId => {
          const qs = new URLSearchParams({ scenarioId: scId, entityId, yearCode });
          if (currencyId) qs.set("currencyId", currencyId);
          if (icpId)      qs.set("icpId",      icpId);
          if (originId)   qs.set("originId",   originId);
          return fetch(`/api/v2/facts?${qs.toString()}`, { credentials: "include" }).then(r => r.json());
        })
      );

      // Use the first response's accounts + months as the canonical schema
      const first = responses[0]?.data;
      if (!first) throw new Error("No grid data returned");
      let accounts: Account[] = first.accounts;
      const months:   Month[] = first.months;

      // Apply row filter from form
      if (form?.rowSelection?.kind === "children_of" && form.rowSelection.parentMemberId) {
        const parentId = form.rowSelection.parentMemberId;
        const descendants = await fetchAccountDescendants(parentId);
        const allowSet = new Set([parentId, ...descendants]);
        accounts = accounts.filter(a => allowSet.has(a.id));
      } else if (form?.rowSelection?.kind === "manual" && form.rowSelection.memberIds) {
        const allow = new Set(form.rowSelection.memberIds);
        accounts = accounts.filter(a => allow.has(a.id));
      }

      // Build cellsByScenario lookup
      const cellsByScenario = new Map<string, Map<string, Cell>>();
      scenariosToFetch.forEach((scId, idx) => {
        const cells: Cell[] = responses[idx]?.data?.cells ?? [];
        const m = new Map<string, Cell>();
        cells.forEach(c => m.set(`${c.accountId}::${c.timeId}`, c));
        cellsByScenario.set(scId, m);
      });

      setGrid({ accounts, months, cellsByScenario });
    } catch (e: any) {
      setError(e.message ?? String(e));
      setGrid(null);
    } finally {
      setGridLoading(false);
    }
  }

  // Walk hierarchy edges to collect descendants of a parent member
  async function fetchAccountDescendants(parentId: string): Promise<string[]> {
    const r = await fetch(`/api/v2/hierarchy/account?hierarchy=default&format=tree`, { credentials: "include" });
    const j = await r.json().catch(() => null);
    const tree = j?.data?.tree ?? [];
    function walk(node: any, into: string[]) {
      if (node?.id) into.push(node.id);
      (node?.children ?? []).forEach((c: any) => walk(c, into));
    }
    function find(node: any): any | null {
      if (node?.id === parentId) return node;
      for (const c of node?.children ?? []) { const f = find(c); if (f) return f; }
      return null;
    }
    let found: any = null;
    for (const root of tree) { found = find(root); if (found) break; }
    if (!found) return [];
    const out: string[] = [];
    walk(found, out);
    return out;
  }

  useEffect(() => {
    if (formLoading) return;
    loadGrid();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formLoading, form, scenarioId, entityId, yearCode, currencyId, icpId, originId]);

  // ─── Cell save ────────────────────────────────────────────────
  async function saveCell(accountId: string, timeId: string, scId: string, valStr: string) {
    const value = Number(valStr);
    if (!Number.isFinite(value)) { setError(`'${valStr}' is not a number`); return; }
    const key = `${accountId}::${timeId}::${scId}`;
    const existing = grid?.cellsByScenario.get(scId)?.get(`${accountId}::${timeId}`);
    if (existing && existing.value === value) return;

    setSavingKey(key);
    setError(null);
    try {
      const body: Record<string, any> = { scenarioId: scId, timeId, entityId, accountId, value };
      if (currencyId) body.currencyId = currencyId;
      if (icpId)      body.icpId      = icpId;
      if (originId)   body.originId   = originId;
      const r = await fetch("/api/v2/facts", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) {
        const detail = j?.details?.issues?.[0]?.message;
        throw new Error(detail ? `${j.error} — ${detail}` : (j?.error ?? `HTTP ${r.status}`));
      }
      setGrid((g) => {
        if (!g) return g;
        const next = new Map(g.cellsByScenario);
        const inner = new Map(next.get(scId) ?? new Map());
        inner.set(`${accountId}::${timeId}`, {
          accountId, timeId, value, version: j.data.version, postedBy: j.data.postedBy,
          postedAt: j.data.postedAt, originId: j.data.originId, factId: j.data.factId,
        });
        next.set(scId, inner);
        return { ...g, cellsByScenario: next };
      });
      setLastSaved(new Date().toLocaleTimeString());
      setPulsedKey(key);
      setTimeout(() => setPulsedKey(k => k === key ? null : k), 700);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSavingKey(null);
    }
  }

  // ─── Render helpers ───────────────────────────────────────────
  const layout: LayoutT = form?.layoutType ?? "STANDARD";
  const editableScenarioId =
    layout === "STANDARD"        ? scenarioId :
    layout === "VARIANCE"        ? form!.scenarioIds[0] :
    /* SCENARIO_STACK */            form!.scenarioIds[0];

  const layoutMeta: Record<LayoutT, { icon: any; label: string; color: string }> = {
    STANDARD:       { icon: LayoutGrid,     label: "Standard",       color: "bg-indigo-50 text-indigo-700" },
    VARIANCE:       { icon: ArrowLeftRight, label: "Variance",       color: "bg-amber-50 text-amber-800" },
    SCENARIO_STACK: { icon: Layers,         label: "Scenario stack", color: "bg-emerald-50 text-emerald-800" },
  };
  const LIcon = layoutMeta[layout].icon;

  return (
    <>
      <MetadataHeader
        title="Data Input"
        subtitle={form ? form.description ?? form.name : "Pick a form from the dropdown or load all leaf accounts"}
      />

      <main className="flex-1 overflow-y-auto bg-background p-6">
        {/* Toolbar — form picker + POV bar */}
        <div className="rounded-xl border border-border bg-white p-3 shadow-sm mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/data/forms" className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${layoutMeta[layout].color} hover:opacity-90`}>
              <LIcon className="h-4 w-4" /> {form?.name ?? "All accounts (default)"} <ChevronDown className="h-3 w-3" />
            </Link>
            <Pov label="Year"     value={yearCode}   options={years} onChange={setYearCode} useCode />
            {layout === "STANDARD" && (
              <Pov label="Scenario" value={scenarioId} options={scenarios} onChange={setScenarioId} />
            )}
            <Pov label="Entity"   value={entityId}   options={entities} onChange={setEntityId} />

            <button
              onClick={() => setAdvancedOpen(o => !o)}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-gray-100"
            >
              {advancedOpen ? <ChevronDown className="h-3 w-3" /> : <ChevRight className="h-3 w-3" />}
              {advancedOpen ? "Hide filters" : "More filters"}
            </button>
            <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700">
              <Sparkles className="h-3 w-3" /> AI · Phase 2
            </span>
          </div>
          {advancedOpen && (
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
              <Pov label="Currency" value={currencyId} options={currencies} onChange={setCurrencyId} />
              <Pov label="ICP"      value={icpId}      options={icps} onChange={setIcpId} />
              <Pov label="Origin"   value={originId}   options={origins} onChange={setOriginId} />
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="mb-2 flex items-center justify-between text-xs">
          <div className="text-muted-foreground">
            {gridLoading && <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading grid…</span>}
            {!gridLoading && grid && <span>{grid.accounts.length} accounts · {grid.months.length} months · {Array.from(grid.cellsByScenario.values()).reduce((s, m) => s + m.size, 0)} cells with values</span>}
          </div>
          <div className="flex items-center gap-3">
            {savingKey && <span className="inline-flex items-center gap-1 text-amber-700"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>}
            {lastSaved && !savingKey && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
                <Save className="h-3 w-3" /> Saved {lastSaved}
              </span>
            )}
            {error && <span className="rounded-md bg-red-50 px-2 py-1 text-red-700">⚠ {error}</span>}
          </div>
        </div>

        {/* The grid */}
        {grid && !gridLoading && (
          <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
            <table className="w-full border-collapse text-sm">
              {layout === "STANDARD" && <StandardHead months={grid.months} />}
              {layout === "VARIANCE" && <VarianceHead months={grid.months} scenarios={form!.scenarioIds.map(id => scenarios.find(s => s.id === id) ?? { id, code: id.slice(0,4), name: "?" })} />}
              {layout === "SCENARIO_STACK" && <ScenarioStackHead scenarios={form!.scenarioIds.map(id => scenarios.find(s => s.id === id) ?? { id, code: id.slice(0,4), name: "?" })} />}
              <tbody>
                {grid.accounts.map(a => (
                  <AccountRow
                    key={a.id}
                    account={a}
                    months={grid.months}
                    layout={layout}
                    scenariosToShow={form?.scenarioIds ?? [scenarioId]}
                    editableScenarioId={editableScenarioId}
                    cellsByScenario={grid.cellsByScenario}
                    savingKey={savingKey}
                    pulsedKey={pulsedKey}
                    onSave={(accountId, timeId, scId, val) => saveCell(accountId, timeId, scId, val)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!grid && !gridLoading && !error && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-3 text-sm font-medium text-gray-700">Pick a POV to load the grid</p>
            <p className="mt-1 text-xs text-muted-foreground">Year, Entity, and (for Standard) Scenario are required.</p>
          </div>
        )}
      </main>
    </>
  );
}

// ─── Header components per layout ─────────────────────────────────

function StandardHead({ months }: { months: Month[] }) {
  return (
    <thead>
      <tr className="border-b border-border bg-gray-50">
        <th className="sticky left-0 z-10 bg-gray-50 px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Account</th>
        {months.map((m, i) => {
          const isQEnd = ((m.monthIndex ?? 0) + 1) % 3 === 0;
          return (
            <th key={m.id} className={`px-2 py-2.5 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground ${isQEnd ? "border-r border-gray-200" : ""}`}>
              {m.code}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

function VarianceHead({ months, scenarios }: { months: Month[]; scenarios: Member[] }) {
  // 3 sub-cols per month: scen0, scen1, Δ%
  const grpColors = ["rgba(55,138,221,0.04)", "rgba(29,158,117,0.04)", "rgba(186,117,23,0.04)", "rgba(83,74,183,0.04)"];
  return (
    <thead>
      <tr className="bg-gray-50">
        <th className="sticky left-0 z-10 bg-gray-50 px-4 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground" rowSpan={2}>Account</th>
        {months.map((m, i) => (
          <th key={m.id} colSpan={3} className="px-2 py-2 text-center text-[11px] font-medium border-r border-gray-200" style={{ background: grpColors[i % grpColors.length] }}>
            {m.code}
          </th>
        ))}
      </tr>
      <tr className="border-b border-border bg-gray-50">
        {months.map((m, i) => (
          <>
            <th key={`${m.id}-0`} className="px-1.5 py-2 text-right text-[10px] font-medium text-muted-foreground" style={{ background: grpColors[i % grpColors.length] }}>{scenarios[0]?.code ?? "?"}</th>
            <th key={`${m.id}-1`} className="px-1.5 py-2 text-right text-[10px] font-medium text-muted-foreground" style={{ background: grpColors[i % grpColors.length] }}>{scenarios[1]?.code ?? "?"}</th>
            <th key={`${m.id}-d`} className="px-1.5 py-2 text-right text-[10px] font-medium text-muted-foreground border-r border-gray-200" style={{ background: grpColors[i % grpColors.length] }}>Δ%</th>
          </>
        ))}
      </tr>
    </thead>
  );
}

function ScenarioStackHead({ scenarios }: { scenarios: Member[] }) {
  return (
    <thead>
      <tr className="border-b border-border bg-gray-50">
        <th className="sticky left-0 z-10 bg-gray-50 px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Account</th>
        {scenarios.map(s => (
          <th key={s.id} className="px-2 py-2.5 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{s.code}</th>
        ))}
      </tr>
    </thead>
  );
}

// ─── Account row dispatcher (per layout) ──────────────────────────

function AccountRow({
  account, months, layout, scenariosToShow, editableScenarioId, cellsByScenario,
  savingKey, pulsedKey, onSave,
}: {
  account: Account; months: Month[]; layout: LayoutT;
  scenariosToShow: string[]; editableScenarioId: string;
  cellsByScenario: Map<string, Map<string, Cell>>;
  savingKey: string | null; pulsedKey: string | null;
  onSave: (accountId: string, timeId: string, scId: string, val: string) => void;
}) {
  const locked = !account.isLeaf;
  const baseClass = `border-t border-border ${locked ? "bg-indigo-50/30" : "hover:bg-gray-50 transition-colors"}`;

  const codeNameCell = (
    <td className={`sticky left-0 z-10 ${locked ? "bg-indigo-50/30" : "bg-white"} px-4 py-2 text-left`}>
      <div className="flex items-center gap-2">
        {locked && <span title={`Locked — '${account.code}' is a parent. Data input only at leaf accounts.`}><Lock className="h-3 w-3 text-gray-400" /></span>}
        <span className={`font-mono text-[11px] text-muted-foreground`}>{account.code}</span>
        <span className={`text-sm ${locked ? "font-medium text-gray-700" : "text-gray-900"}`}>{account.name}</span>
        {account.isIcp && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">ICP required</span>}
      </div>
    </td>
  );

  if (layout === "STANDARD") {
    const scId = scenariosToShow[0];
    return (
      <tr className={baseClass}>
        {codeNameCell}
        {months.map((m, i) => {
          const isQEnd = ((m.monthIndex ?? 0) + 1) % 3 === 0;
          return (
            <CellInput
              key={m.id}
              accountId={account.id} timeId={m.id} scenarioId={scId}
              disabled={locked}
              cell={cellsByScenario.get(scId)?.get(`${account.id}::${m.id}`)}
              savingKey={savingKey}
              pulsed={pulsedKey === `${account.id}::${m.id}::${scId}`}
              onSave={onSave}
              borderRight={isQEnd}
            />
          );
        })}
      </tr>
    );
  }

  if (layout === "VARIANCE") {
    const grpColors = ["rgba(55,138,221,0.025)", "rgba(29,158,117,0.025)", "rgba(186,117,23,0.025)", "rgba(83,74,183,0.025)"];
    const [scA, scB] = scenariosToShow;
    return (
      <tr className={baseClass}>
        {codeNameCell}
        {months.map((m, i) => {
          const cellA = cellsByScenario.get(scA)?.get(`${account.id}::${m.id}`);
          const cellB = cellsByScenario.get(scB)?.get(`${account.id}::${m.id}`);
          const vA = cellA?.value ?? 0;
          const vB = cellB?.value ?? 0;
          const delta = vB === 0 ? null : ((vA - vB) / vB) * 100;
          const deltaStr = delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
          const deltaCls = delta === null ? "text-gray-400" : Math.abs(delta) < 0.05 ? "text-gray-500" : delta > 0 ? "text-red-700 font-medium" : "text-emerald-700 font-medium";
          return (
            <>
              <CellInput
                key={`${m.id}-a`}
                accountId={account.id} timeId={m.id} scenarioId={scA}
                disabled={locked}
                cell={cellA}
                savingKey={savingKey}
                pulsed={pulsedKey === `${account.id}::${m.id}::${scA}`}
                onSave={onSave}
                bgColor={grpColors[i % grpColors.length]}
              />
              <td className="px-1.5 py-2 text-right text-[12px] tabular-nums text-gray-600" style={{ background: grpColors[i % grpColors.length] }}>
                {cellB ? cellB.value.toLocaleString() : "—"}
              </td>
              <td className={`px-1.5 py-2 text-right text-[12px] tabular-nums border-r border-gray-200 ${deltaCls}`} style={{ background: grpColors[i % grpColors.length] }}>
                {deltaStr}
              </td>
            </>
          );
        })}
      </tr>
    );
  }

  // SCENARIO_STACK
  return (
    <tr className={baseClass}>
      {codeNameCell}
      {scenariosToShow.map((scId, i) => {
        const cell = cellsByScenario.get(scId)?.get(`${account.id}::${months[0]?.id ?? ""}`);
        // For SCENARIO_STACK V1, we pick a single representative month (first one).
        return (
          <CellInput
            key={scId}
            accountId={account.id} timeId={months[0]?.id ?? ""} scenarioId={scId}
            disabled={locked || scId !== editableScenarioId}
            cell={cell}
            savingKey={savingKey}
            pulsed={pulsedKey === `${account.id}::${months[0]?.id ?? ""}::${scId}`}
            onSave={onSave}
          />
        );
      })}
    </tr>
  );
}

// ─── Single editable cell ────────────────────────────────────────

function CellInput({
  accountId, timeId, scenarioId, disabled, cell, savingKey, pulsed, onSave, bgColor, borderRight,
}: {
  accountId: string; timeId: string; scenarioId: string;
  disabled?: boolean; cell?: Cell;
  savingKey: string | null; pulsed: boolean;
  onSave: (accountId: string, timeId: string, scId: string, val: string) => void;
  bgColor?: string; borderRight?: boolean;
}) {
  const value = cell?.value;
  const [v, setV] = useState<string>(value === undefined ? "" : String(value));
  const lastInitial = useRef(value);
  useEffect(() => {
    if (value !== lastInitial.current) { lastInitial.current = value; setV(value === undefined ? "" : String(value)); }
  }, [value]);

  const key = `${accountId}::${timeId}::${scenarioId}`;
  const saving = savingKey === key;
  const tooltip = cell ? `v${cell.version} · ${new Date(cell.postedAt).toLocaleString()}` : undefined;

  return (
    <td className={`px-1 py-1 text-right ${borderRight ? "border-r border-gray-200" : ""}`} title={tooltip} style={bgColor ? { background: bgColor } : undefined}>
      <input
        type="text"
        inputMode="decimal"
        value={v}
        disabled={disabled}
        placeholder={disabled ? "" : "—"}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (!disabled && v.trim() !== "" && v !== String(value ?? "")) onSave(accountId, timeId, scenarioId, v.trim()); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className={`w-16 rounded border px-1.5 py-1 text-right text-[12px] tabular-nums transition-all ${
          disabled
            ? "border-transparent bg-transparent text-gray-400 cursor-not-allowed"
            : pulsed
              ? "border-emerald-300 bg-emerald-50 ring-2 ring-emerald-100"
              : saving
                ? "border-amber-300 bg-amber-50"
                : "border-transparent bg-white hover:border-gray-200 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 placeholder:text-gray-300"
        }`}
      />
    </td>
  );
}

// ─── POV chip ─────────────────────────────────────────────────────

function Pov({ label, value, options, onChange, useCode }: { label: string; value: string; options: Member[]; onChange: (v: string) => void; useCode?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      >
        <option value="">— pick —</option>
        {options.map(o => (
          <option key={o.id} value={useCode ? o.code : o.id}>{o.code} · {o.name}</option>
        ))}
      </select>
    </label>
  );
}
