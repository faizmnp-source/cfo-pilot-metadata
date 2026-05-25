"use client";
/*
 * <UnifiedPovPicker /> — one POV picker, used everywhere.
 *
 * Renders Atelier-style pills for Scenario / Compare / Period / Entities / Currency.
 * Fetches dim members on first render, caches in component state.
 * Calls onChange(povSpec) on any pill change.
 *
 * Props:
 *   value:    PovSpec
 *   onChange: (PovSpec) => void
 *   show?:    Which pills to render — defaults to ['scenario','compare','period','entities']
 *   compact?: tighter pill spacing for embed in headers
 */
import { useEffect, useState } from "react";
import type { PovSpec } from "@/lib/pov/types";
import { TimePOVPicker } from "@/components/reports/TimePOVPicker";

type Member = { id: string; code: string; name: string };

async function fetchMembers(dimCode: string): Promise<Member[]> {
  try {
    const r = await fetch(`/api/v2/members/${dimCode}?pageSize=500`, { credentials: "include" });
    const j = await r.json();
    return (j?.data?.data ?? []).filter((m: any) => m.isActive).map((m: any) => ({ id: m.id, code: m.memberCode, name: m.memberName }));
  } catch { return []; }
}

export type PovPillKind = "scenario" | "compare" | "period" | "entities" | "currency";

export function UnifiedPovPicker({
  value, onChange, show = ["scenario","compare","period","entities"], compact = false,
}: {
  value: PovSpec;
  onChange: (p: PovSpec) => void;
  show?: PovPillKind[];
  compact?: boolean;
}) {
  const [scenarios,  setScenarios]  = useState<Member[]>([]);
  const [entities,   setEntities]   = useState<Member[]>([]);
  const [currencies, setCurrencies] = useState<Member[]>([]);

  useEffect(() => {
    if (show.includes("scenario") || show.includes("compare")) fetchMembers("scenario").then(setScenarios);
    if (show.includes("entities"))                              fetchMembers("entity").then(setEntities);
    if (show.includes("currency"))                              fetchMembers("currency").then(setCurrencies);
  }, [show.join(",")]);

  const set = (patch: Partial<PovSpec>) => onChange({ ...value, ...patch });

  return (
    <div className={`flex flex-wrap items-center gap-${compact ? "2" : "3"}`}>
      {show.includes("scenario") && (
        <PillSelect label="Scenario" value={value.scenarioCode}
          onChange={(v) => set({ scenarioCode: v })}
          options={scenarios.map(s => ({ value: s.code, label: s.code }))} />
      )}
      {show.includes("compare") && (
        <PillSelect label="vs Compare" value={value.compareScenarioCode ?? ""}
          onChange={(v) => set({ compareScenarioCode: v || null })}
          options={[{ value: "", label: "(none)" }, ...scenarios.filter(s => s.code !== value.scenarioCode).map(s => ({ value: s.code, label: s.code }))]} />
      )}
      {show.includes("period") && (
        <div className="inline-flex items-center h-9 px-3 rounded-full border" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
          <span className="atelier-eyebrow" style={{ fontSize: 10, color: "var(--ink-3)", marginRight: 10 }}>Period</span>
          <TimePOVPicker value={value.periodCode} onChange={(c) => set({ periodCode: c })} label="" />
        </div>
      )}
      {show.includes("entities") && (
        <EntityMulti
          entities={entities}
          selectedCodes={value.entityCodes ?? []}
          onChange={(codes) => set({ entityCodes: codes })}
        />
      )}
      {show.includes("currency") && (
        <PillSelect label="Currency" value={value.currencyCode ?? ""}
          onChange={(v) => set({ currencyCode: v || undefined })}
          options={[{ value: "", label: "Reporting" }, ...currencies.map(c => ({ value: c.code, label: c.code }))]} />
      )}
    </div>
  );
}

function PillSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="inline-flex items-center h-9 px-3 rounded-full border" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
      <span className="atelier-eyebrow" style={{ fontSize: 10, color: "var(--ink-3)", marginRight: 10 }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent outline-none cursor-pointer atelier-serif" style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600 }}>
        {options.map(o => <option key={o.value || "_empty"} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function EntityMulti({ entities, selectedCodes, onChange }: { entities: Member[]; selectedCodes: string[]; onChange: (codes: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const label = selectedCodes.length === 0
    ? `All ${entities.length} entities`
    : selectedCodes.length <= 2 ? selectedCodes.join(", ") : `${selectedCodes.length} entities`;

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-2 h-9 px-3 rounded-full border"
        style={{ borderColor: "var(--ink)", background: open ? "var(--ink)" : "var(--paper)", color: open ? "var(--paper)" : "var(--ink)" }}>
        <span className="atelier-eyebrow" style={{ fontSize: 10, color: open ? "var(--paper)" : "var(--ink-3)" }}>Entities</span>
        <span className="atelier-serif" style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-2 w-72 max-h-80 overflow-y-auto"
          style={{ background: "var(--paper)", border: "1px solid var(--ink)", boxShadow: "0 6px 18px -8px rgba(26,22,18,0.2)" }}>
          <button onClick={() => { onChange([]); setOpen(false); }}
            className="w-full text-left px-3 py-2.5 border-b atelier-serif"
            style={{ fontSize: 13, fontWeight: 600, borderColor: "var(--rule)", background: selectedCodes.length === 0 ? "var(--paper-2)" : "transparent" }}>
            All entities {selectedCodes.length === 0 ? "✓" : ""}
          </button>
          {entities.map(e => {
            const sel = selectedCodes.includes(e.code);
            return (
              <button key={e.id}
                onClick={() => onChange(sel ? selectedCodes.filter(x => x !== e.code) : [...selectedCodes, e.code])}
                className="w-full text-left px-3 py-2 flex items-center gap-2 atelier-serif" style={{ fontSize: 13 }}>
                <span className="inline-flex items-center justify-center"
                  style={{ width: 14, height: 14, border: "1.5px solid var(--ink)", background: sel ? "var(--ink)" : "transparent", color: "var(--paper)", fontSize: 10 }}>
                  {sel ? "✓" : ""}
                </span>
                <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10.5, color: "var(--ink-3)", width: 56 }}>{e.code}</span>
                <span style={{ color: "var(--ink-2)" }}>{e.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
