"use client";

// Data Input — Layout 2 (AI-augmented grid) base implementation.
// Phase 1: POV bar + editable Account × Time grid + save-on-blur.
// AI ghost suggestions / anomaly dots / audit-on-hover / smart paste / variance
// columns come in Phase 2 — scaffolding here is ready for them.

import { useEffect, useMemo, useRef, useState } from "react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { Lock, Sparkles, ChevronDown, ChevronRight as ChevRight, Save, Loader2 } from "lucide-react";

type Member  = { id: string; code: string; name: string };
type Account = Member & { isLeaf: boolean; isIcp: boolean };
type Month   = Member & { monthIndex: number | null };
type Cell    = { accountId: string; timeId: string; value: number; version: number; postedBy: string; postedAt: string; originId: string; factId: string };

interface GridResponse {
  accounts: Account[];
  months:   Month[];
  cells:    Cell[];
}

// One-time fetch helpers — list members of a single dim, scoped to leaves.
async function fetchDimMembers(slug: string, limit = 200): Promise<Member[]> {
  const r = await fetch(`/api/v2/members/${slug}?pageSize=${limit}`, { credentials: "include" });
  const j = await r.json().catch(() => null);
  const rows = j?.data?.data ?? [];
  return rows
    .filter((m: any) => m.isActive)
    .map((m: any) => ({ id: m.id, code: m.memberCode, name: m.memberName }));
}

// Currency members that are tenant-base get is_base=true on properties
async function fetchBaseCurrency(): Promise<Member | null> {
  const r = await fetch(`/api/v2/members/currency?pageSize=200`, { credentials: "include" });
  const j = await r.json().catch(() => null);
  const rows = j?.data?.data ?? [];
  const base = rows.find((m: any) => m?.properties?.is_base === true) ?? rows[0];
  return base ? { id: base.id, code: base.memberCode, name: base.memberName } : null;
}

export default function DataInputPage() {
  // ─── POV state ─────────────────────────────────────────────────
  const [scenarios, setScenarios] = useState<Member[]>([]);
  const [years,     setYears]     = useState<Member[]>([]);
  const [entities,  setEntities]  = useState<Member[]>([]);
  const [currencies, setCurrencies] = useState<Member[]>([]);
  const [icps,       setIcps]       = useState<Member[]>([]);
  const [origins,    setOrigins]    = useState<Member[]>([]);
  const [baseCcy, setBaseCcy]       = useState<Member | null>(null);

  const [scenarioId, setScenarioId] = useState<string>("");
  const [yearCode,   setYearCode]   = useState<string>("");
  const [entityId,   setEntityId]   = useState<string>("");
  const [currencyId, setCurrencyId] = useState<string>("");
  const [icpId,      setIcpId]      = useState<string>("");
  const [originId,   setOriginId]   = useState<string>("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // ─── Grid state ────────────────────────────────────────────────
  const [grid, setGrid] = useState<GridResponse | null>(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── Load POV options once ─────────────────────────────────────
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
      // Years from Time members are codes like 'FY2026' — filter to years only
      setYears(all_times.filter(m => /^FY\d{4}$/.test(m.code)));
      setCurrencies(ccys);
      setIcps(icps_);
      setOrigins(orgs);
      setBaseCcy(base);
      // Sensible defaults
      if (scns[0])    setScenarioId(scns[0].id);
      if (ents[0])    setEntityId(ents[0].id);
      if (base)       setCurrencyId(base.id);
      const none = icps_.find(m => m.code === "None"); if (none) setIcpId(none.id);
      const form = orgs.find(m => m.code === "Form");  if (form) setOriginId(form.id);
      const fy   = all_times.find(m => /^FY\d{4}$/.test(m.code)); if (fy) setYearCode(fy.code);
    })().catch(e => setError(String(e)));
  }, []);

  // ─── Load grid when POV changes ────────────────────────────────
  async function loadGrid() {
    if (!scenarioId || !entityId || !yearCode) return;
    setGridLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ scenarioId, entityId, yearCode });
      if (currencyId) qs.set("currencyId", currencyId);
      if (icpId)      qs.set("icpId",      icpId);
      if (originId)   qs.set("originId",   originId);
      const r = await fetch(`/api/v2/facts?${qs.toString()}`, { credentials: "include" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setGrid(j.data);
    } catch (e: any) {
      setError(e.message ?? String(e));
      setGrid(null);
    } finally {
      setGridLoading(false);
    }
  }
  useEffect(() => { loadGrid(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scenarioId, entityId, yearCode, currencyId, icpId, originId]);

  // Cell value map for fast lookup
  const cellMap = useMemo(() => {
    const m = new Map<string, Cell>();
    grid?.cells.forEach(c => m.set(`${c.accountId}::${c.timeId}`, c));
    return m;
  }, [grid]);

  // ─── Cell save (on blur if changed) ────────────────────────────
  async function saveCell(accountId: string, timeId: string, valStr: string) {
    const value = Number(valStr);
    if (!Number.isFinite(value)) { setError(`'${valStr}' is not a number`); return; }
    const key = `${accountId}::${timeId}`;
    const existing = cellMap.get(key);
    if (existing && existing.value === value) return; // no change

    setSavingKey(key);
    setError(null);
    try {
      const r = await fetch("/api/v2/facts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId, timeId, entityId, accountId,
          currencyId, icpId, originId,
          value,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      // Patch grid state with the new value
      setGrid((g) => g ? {
        ...g,
        cells: [
          ...g.cells.filter(c => !(c.accountId === accountId && c.timeId === timeId)),
          { accountId, timeId, value, version: j.data.version, postedBy: j.data.postedBy, postedAt: j.data.postedAt, originId: j.data.originId, factId: j.data.factId },
        ],
      } : g);
      setLastSaved(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSavingKey(null);
    }
  }

  // ─── Render ────────────────────────────────────────────────────
  const povComplete = scenarioId && entityId && yearCode;

  return (
    <>
      <MetadataHeader
        title="Data Input"
        subtitle="EPM-style grid — leaf-level only · saves go to Origin = Form"
      />

      <main className="flex-1 overflow-y-auto bg-background p-6">
        {/* POV bar */}
        <div className="rounded-xl border border-border bg-white p-3 shadow-sm mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <Pov label="Scenario" value={scenarioId} options={scenarios} onChange={setScenarioId} />
            <Pov label="Year"     value={yearCode}   options={years} onChange={setYearCode} useCode />
            <Pov label="Entity"   value={entityId}   options={entities} onChange={setEntityId} />

            <button
              onClick={() => setAdvancedOpen(o => !o)}
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {advancedOpen ? <ChevronDown className="h-3 w-3" /> : <ChevRight className="h-3 w-3" />}
              {advancedOpen ? "Hide" : "More filters"}
            </button>
            <span className="flex items-center gap-1 rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700">
              <Sparkles className="h-3 w-3" /> AI on (Phase 2)
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
            {!gridLoading && grid && <span>{grid.accounts.length} accounts · {grid.months.length} months · {grid.cells.length} cells with values</span>}
            {!povComplete && !gridLoading && <span>Pick Scenario · Year · Entity to load the grid.</span>}
          </div>
          <div className="flex items-center gap-3">
            {savingKey && <span className="inline-flex items-center gap-1 text-amber-700"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>}
            {lastSaved && !savingKey && <span className="inline-flex items-center gap-1 text-emerald-700"><Save className="h-3 w-3" /> Saved {lastSaved}</span>}
            {error && <span className="text-red-700">⚠ {error}</span>}
          </div>
        </div>

        {/* The grid */}
        {grid && povComplete && (
          <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Account
                  </th>
                  {grid.months.map(m => (
                    <th key={m.id} className="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {m.code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.accounts.map(a => (
                  <AccountRow
                    key={a.id}
                    account={a}
                    months={grid.months}
                    cellMap={cellMap}
                    savingKey={savingKey}
                    onSave={(timeId, value) => saveCell(a.id, timeId, value)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}

// ─── POV chip ─────────────────────────────────────────────────────

function Pov({
  label, value, options, onChange, useCode,
}: { label: string; value: string; options: Member[]; onChange: (v: string) => void; useCode?: boolean; }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="">— pick —</option>
        {options.map(o => (
          <option key={o.id} value={useCode ? o.code : o.id}>{o.code} · {o.name}</option>
        ))}
      </select>
    </label>
  );
}

// ─── A single account row, with cells per month ────────────────────

function AccountRow({
  account, months, cellMap, savingKey, onSave,
}: {
  account: Account;
  months: Month[];
  cellMap: Map<string, any>;
  savingKey: string | null;
  onSave: (timeId: string, value: string) => void;
}) {
  const locked = !account.isLeaf;
  return (
    <tr className={`border-t border-border ${locked ? "bg-gray-50/50" : "hover:bg-gray-50"}`}>
      <td className={`sticky left-0 z-10 ${locked ? "bg-gray-50/50" : "bg-white"} px-3 py-1.5 text-left`}>
        <div className="flex items-center gap-2">
          {locked && (
            <span title={`Locked — '${account.code}' is a parent/rollup. Data input only at leaf accounts.`}>
              <Lock className="h-3 w-3 text-gray-400" />
            </span>
          )}
          <span className={`text-xs font-mono text-muted-foreground`}>{account.code}</span>
          <span className={`text-sm ${locked ? "font-medium text-gray-700" : "text-gray-900"}`}>{account.name}</span>
          {account.isIcp && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">ICP required</span>}
        </div>
      </td>
      {months.map(m => {
        const key = `${account.id}::${m.id}`;
        const existing = cellMap.get(key);
        return (
          <CellInput
            key={m.id}
            disabled={locked}
            saving={savingKey === key}
            initial={existing?.value ?? ""}
            tooltip={existing ? `v${existing.version} · ${new Date(existing.postedAt).toLocaleString()}` : undefined}
            onCommit={(v) => onSave(m.id, v)}
          />
        );
      })}
    </tr>
  );
}

function CellInput({
  initial, disabled, saving, tooltip, onCommit,
}: {
  initial: number | "";
  disabled?: boolean;
  saving?: boolean;
  tooltip?: string;
  onCommit: (val: string) => void;
}) {
  const [v, setV] = useState<string>(initial === "" ? "" : String(initial));
  // sync if initial changes (POV change)
  const initialRef = useRef(initial);
  if (initial !== initialRef.current) { initialRef.current = initial; }
  useEffect(() => { setV(initial === "" ? "" : String(initial)); }, [initial]);
  return (
    <td className="px-1 py-1 text-right" title={tooltip}>
      <input
        type="text"
        inputMode="decimal"
        value={v}
        disabled={disabled}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (!disabled && v.trim() !== "" && v !== String(initial)) onCommit(v.trim()); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className={`w-20 rounded border px-1.5 py-1 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
          disabled ? "border-transparent bg-transparent text-gray-400 cursor-not-allowed" :
          saving ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white hover:border-gray-300"
        }`}
      />
    </td>
  );
}
