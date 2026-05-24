"use client";

// TimePOVPicker — universal Time POV widget. OneStream-style.
//
// Picks ANY Time member: FY2026, FY2026H1, FY2026Q3, 2026-04, etc.
// Backend's time-resolver expands the picked member to its leaf months
// and aggregates facts accordingly.
//
// UI: button shows current selection → click opens panel with
//   - Search box (filter by code/name)
//   - Tabs: All / Years / Quarters / Months
//   - Grouped list by year
//
// API param name stays `yearCode` for backward compat — same shape, expanded semantics.

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronDown, Search, X, Check } from "lucide-react";

type TimeMember = { id: string; code: string; name: string };

interface Props {
  value:    string;                          // member code (e.g. "FY2026", "2026-04")
  onChange: (code: string) => void;
  label?:   string;
}

function classify(code: string): "year" | "half" | "quarter" | "month" | "other" {
  if (/^FY\d{4}$/.test(code))        return "year";
  if (/^FY\d{4}H[12]$/.test(code))   return "half";
  if (/^FY\d{4}Q[1-4]$/.test(code))  return "quarter";
  if (/^\d{4}-\d{2}$/.test(code))    return "month";
  return "other";
}
function yearOf(code: string): string {
  const m = code.match(/(\d{4})/);
  return m?.[1] ?? "?";
}

export function TimePOVPicker({ value, onChange, label = "Time" }: Props) {
  const [members, setMembers] = useState<TimeMember[]>([]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "year" | "half" | "quarter" | "month">("all");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/v2/members/time?pageSize=500", { credentials: "include" })
      .then(r => r.json())
      .then(j => {
        const items: TimeMember[] = ((j?.data?.data ?? []) as any[])
          .filter(m => m.isActive)
          .map(m => ({ id: m.id, code: m.memberCode, name: m.memberName }));
        setMembers(items);
      })
      .catch(() => {});
  }, []);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const grouped = useMemo(() => {
    const filt = members.filter(m => {
      if (tab !== "all" && classify(m.code) !== tab) return false;
      if (q && !`${m.code} ${m.name}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    // Group by year
    const byYear = new Map<string, TimeMember[]>();
    for (const m of filt) {
      const y = yearOf(m.code);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push(m);
    }
    // Sort years desc, members within by code asc with year-roots first
    return Array.from(byYear.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, ms]) => ({
        year,
        members: ms.sort((a, b) => {
          const ra = classify(a.code), rb = classify(b.code);
          const rank = { year: 0, half: 1, quarter: 2, month: 3, other: 4 } as const;
          return rank[ra] - rank[rb] || a.code.localeCompare(b.code);
        }),
      }));
  }, [members, q, tab]);

  const selected = members.find(m => m.code === value);
  const selectedKind = selected ? classify(selected.code) : "other";

  return (
    <div ref={ref} className="relative inline-block">
      {label && <span className="text-[10px] text-stone-500 uppercase tracking-widest mr-2">{label}</span>}
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-stone-200 bg-white text-xs text-stone-800 hover:border-stone-300"
      >
        <Calendar className="w-3 h-3 text-stone-500" />
        <span className="font-mono">{value || "—"}</span>
        {selected && selectedKind !== "other" && (
          <span className="text-[10px] text-stone-400 ml-0.5">({selectedKind})</span>
        )}
        <ChevronDown className={`w-3 h-3 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 w-72 bg-white border border-stone-200 rounded-lg shadow-xl">
          {/* Search */}
          <div className="p-2 border-b border-stone-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-stone-400" />
              <input
                value={q} onChange={e => setQ(e.target.value)} autoFocus
                placeholder="Search FY2026, Q1, 2026-04…"
                className="w-full pl-7 pr-7 py-1.5 text-xs border border-stone-200 rounded focus:outline-none focus:border-violet-300"
              />
              {q && <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"><X className="w-3 h-3" /></button>}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-stone-100 px-2 gap-1">
            {(["all", "year", "half", "quarter", "month"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${tab === t ? "text-violet-700 border-b-2 border-violet-500" : "text-stone-500 hover:text-stone-700"}`}>
                {t}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="max-h-72 overflow-y-auto p-1">
            {grouped.length === 0 && <p className="px-2 py-3 text-[11px] text-stone-400 italic">No matches</p>}
            {grouped.map(g => (
              <div key={g.year} className="mb-1">
                <p className="px-2 py-1 text-[10px] uppercase tracking-widest font-bold text-stone-400">FY{g.year}</p>
                {g.members.map(m => {
                  const active = m.code === value;
                  const kind = classify(m.code);
                  const indent = kind === "year" ? "pl-2" : kind === "half" ? "pl-4" : kind === "quarter" ? "pl-5" : "pl-7";
                  return (
                    <button key={m.id} onClick={() => { onChange(m.code); setOpen(false); }}
                      className={`w-full text-left ${indent} pr-2 py-1 flex items-center gap-2 text-xs rounded ${
                        active ? "bg-violet-50 text-violet-900 font-semibold" : "text-stone-700 hover:bg-stone-50"
                      }`}>
                      {active ? <Check className="w-3 h-3 text-violet-600" /> : <span className="w-3" />}
                      <span className="font-mono">{m.code}</span>
                      <span className="text-stone-400 truncate">{m.name}</span>
                      <span className="ml-auto text-[9px] text-stone-400 uppercase">{kind !== "other" && kind}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="px-2 py-1.5 border-t border-stone-100 text-[10px] text-stone-400">
            Reports auto-aggregate to whichever level you pick (OneStream-style).
          </div>
        </div>
      )}
    </div>
  );
}
