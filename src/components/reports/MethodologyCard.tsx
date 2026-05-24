"use client";

// Methodology — collapsible explainer showing exactly how the numbers were
// computed. Per-report description + the SQL-like filter applied + the
// time_balance treatment. Builds trust ("I can audit this") rather than
// black-box reports.

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";

interface Props {
  kind: "trial-balance" | "income-statement" | "balance-sheet" | "cash-flow";
  meta?: { scenarioId: string; entityId: string; yearCode: string; rowsRead: number; generatedAt: string };
  ccy: string;
}

export function MethodologyCard({ kind, meta, ccy }: Props) {
  const [open, setOpen] = useState(false);

  const config: Record<Props["kind"], { title: string; bullets: string[] }> = {
    "trial-balance": {
      title: "How Trial Balance is built",
      bullets: [
        "Reads every fact row where scenario, entity, year-months and isCurrent=true match the POV",
        "Aggregates by account using each account's time_balance property: FLOW = sum across 12 months; LAST = closing value; FIRST = opening; AVG = monthly average",
        "Shows one line per leaf account, sorted by account code",
        "Total = sum of all line values (no debit/credit split in v1 — column split lands when natural-balance sign convention is wired)",
      ],
    },
    "income-statement": {
      title: "How Income Statement is built",
      bullets: [
        "Reads facts WHERE: scenarioId = POV scenario · entityId = POV entity · time IN selected year's months · isCurrent = true",
        "Groups leaf accounts by account_type: REVENUE / EXPENSE",
        "Uses valueReporting column (translated to tenant base currency when multi-currency is on)",
        "Subtotals = sum of section's leaf lines · Net Income = Revenue − Expenses (no sign flip)",
        "Accounts without account_type fall under 'Unclassified'",
      ],
    },
    "balance-sheet": {
      title: "How Balance Sheet is built",
      bullets: [
        "Same fact filter as IS but groups by ASSET / LIABILITY / EQUITY account_type",
        "Uses time_balance = LAST → takes each account's CLOSING value at year-end (December for FY2026)",
        "Check: Total Assets vs (Total Liabilities + Equity) — should match within rounding",
        "Phase-2 will load opening balances + roll forward via journal entries",
      ],
    },
    "cash-flow": {
      title: "How Cash Flow is built",
      bullets: [
        "v1 = direct method. Reads facts and groups by account.properties.cash_flow_category",
        "Three sections: OPERATING / INVESTING / FINANCING (the tag on each account drives placement)",
        "Net Change in Cash = Operating + Investing + Financing",
        "Accounts without cash_flow_category fall under 'Unclassified' — set the tag via Library to refine",
        "Phase-2 will add indirect method (Net Income + non-cash adjustments + working capital changes)",
      ],
    },
  };

  const c = config[kind];

  return (
    <div className="rounded-lg border border-stone-200 bg-white mb-5 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-stone-50 transition-colors text-left"
      >
        <Info className="w-4 h-4 text-violet-600 shrink-0" />
        <span className="text-xs font-bold uppercase tracking-wider text-stone-700">{c.title}</span>
        <span className="text-[11px] text-stone-400 ml-2">— click to {open ? "hide" : "show"}</span>
        <ChevronDown className={`ml-auto w-4 h-4 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-stone-100">
          <ul className="space-y-1.5 text-[12px] text-stone-700 leading-relaxed mb-3">
            {c.bullets.map((b, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="text-violet-500 mt-0.5">→</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          {meta && (
            <div className="mt-3 p-3 rounded bg-stone-50 border border-stone-100 font-mono text-[11px] text-stone-700">
              <div className="mb-2 text-[10px] uppercase tracking-wider font-bold text-stone-500">Applied Filter</div>
              <div>scenarioId = <span className="text-violet-700">{meta.scenarioId.slice(0, 8)}…</span></div>
              <div>entityId   = <span className="text-violet-700">{meta.entityId.slice(0, 8)}…</span></div>
              <div>yearCode   = <span className="text-violet-700">{meta.yearCode}</span></div>
              <div>currency   = <span className="text-violet-700">{ccy}</span> (valueReporting column)</div>
              <div className="mt-1.5 pt-1.5 border-t border-stone-200 text-stone-500">
                Read <span className="font-bold text-stone-900">{meta.rowsRead.toLocaleString()}</span> fact rows · Generated {new Date(meta.generatedAt).toLocaleString()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
