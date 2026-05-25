"use client";

// Report body — finance-document aesthetic.
// Serif title fonts, accounting black-on-cream, tabular monospace numbers,
// subtotal single underline, grand-total double underline + bold.

import { formatMoney } from "./ReportLayout";

interface ReportLine {
  accountId:   string;
  code:        string;
  name:        string;
  value:       number;
  indent:      number;
  isSubtotal:  boolean;
  isBold:      boolean;
  accountType: string | null;
}

interface ReportSection {
  title:    string;
  lines:    ReportLine[];
  subtotal: { label: string; value: number } | null;
  type?:    string;
}

// Section accent — restrained, financial-document feel
const SECTION_THEME: Record<string, { dot: string; rule: string; subtotalBg: string; label: string }> = {
  REVENUE:   { dot: "bg-emerald-700",  rule: "border-emerald-300/60",  subtotalBg: "bg-emerald-50/50",  label: "text-emerald-900" },
  EXPENSE:   { dot: "bg-rose-700",     rule: "border-rose-300/60",     subtotalBg: "bg-rose-50/40",     label: "text-rose-900" },
  ASSET:     { dot: "bg-sky-700",      rule: "border-sky-300/60",      subtotalBg: "bg-sky-50/50",      label: "text-sky-900" },
  LIABILITY: { dot: "bg-amber-700",    rule: "border-amber-300/60",    subtotalBg: "bg-amber-50/50",    label: "text-amber-900" },
  EQUITY:    { dot: "bg-violet-700",   rule: "border-violet-300/60",   subtotalBg: "bg-violet-50/50",   label: "text-violet-900" },
  DEFAULT:   { dot: "bg-stone-500",    rule: "border-stone-300",       subtotalBg: "bg-stone-50",       label: "text-stone-900" },
};

export function ReportBody({ sections, ccy = "USD", onDrillLine }: { sections: ReportSection[]; ccy?: string; onDrillLine?: (accountId: string, name: string) => void }) {
  if (!sections.length) {
    return (
      <div className="py-16 text-center text-stone-500" style={{ fontFamily: "'Georgia', 'Garamond', serif" }}>
        <p className="text-base italic">No data for this POV.</p>
        <p className="text-xs text-stone-400 mt-2">Load facts via Data Load or Data Input, then refresh.</p>
      </div>
    );
  }

  return (
    <div className="space-y-7" style={{ fontFamily: "'Georgia', 'Garamond', 'Cambria', serif" }}>
      {sections.map((s, i) => {
        const theme = SECTION_THEME[s.type ?? "DEFAULT"] ?? SECTION_THEME.DEFAULT;
        return (
          <section key={`${s.title}-${i}`}>
            {/* Section header — restrained, like a financial statement */}
            <div className={`flex items-baseline justify-between pb-1.5 mb-1 border-b ${theme.rule}`}>
              <div className="flex items-center gap-2">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${theme.dot}`} />
                <h3 className={`text-[11px] uppercase tracking-[0.25em] font-bold ${theme.label}`} style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
                  {s.title}
                </h3>
              </div>
              <span className="text-[9px] text-stone-400 font-medium uppercase tracking-widest" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
                in {ccy} thousands
              </span>
            </div>
            <table className="w-full">
              <tbody>
                {s.lines.map((line, li) => (
                  <tr key={line.accountId} className="group hover:bg-stone-50/60 transition-colors">
                    <td className="py-1.5 pr-4" style={{ paddingLeft: `${8 + line.indent * 18}px` }}>
                      <span className="font-mono text-[10px] text-stone-400 mr-3 tabular-nums" style={{ fontFamily: "'SF Mono', 'Monaco', 'Menlo', monospace" }}>
                        {line.code}
                      </span>
                      <span className={`text-[13px] ${line.isBold ? "font-semibold text-stone-900" : "text-stone-700"}`}>
                        {line.name}
                      </span>
                      {onDrillLine && line.accountId && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDrillLine(line.accountId, line.name); }}
                          title={`Drill into ${line.name}`}
                          className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full border border-stone-300 text-stone-500 hover:text-stone-900 hover:border-stone-500 text-[9px] leading-none"
                          style={{ verticalAlign: "middle" }}
                        >ⓘ</button>
                      )}
                    </td>
                    <td className={`py-1.5 pr-2 text-right font-mono text-[13px] tabular-nums w-48 ${line.value < 0 ? "text-rose-700" : "text-stone-900"}`}
                        style={{ fontFamily: "'SF Mono', 'Monaco', 'Menlo', monospace" }}>
                      {formatMoney(line.value, { ccy })}
                    </td>
                  </tr>
                ))}
                {s.subtotal && (
                  <tr className={`${theme.subtotalBg}`}>
                    <td className={`py-2 pr-4 pl-2 border-t-2 ${theme.rule}`}>
                      <span className={`text-[11px] font-bold uppercase tracking-[0.15em] ${theme.label}`} style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
                        {s.subtotal.label}
                      </span>
                    </td>
                    <td className={`py-2 pr-2 text-right font-mono text-[14px] font-extrabold tabular-nums w-48 border-t-2 ${theme.rule} ${s.subtotal.value < 0 ? "text-rose-700" : theme.label}`}
                        style={{ fontFamily: "'SF Mono', 'Monaco', 'Menlo', monospace" }}>
                      {formatMoney(s.subtotal.value, { ccy })}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
