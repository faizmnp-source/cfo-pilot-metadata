"use client";

// Report body — renders SectionedReport from the API. Each section gets
// a colour-keyed header, lines with proper indent + bold for subtotals.
// Numbers shown with currency symbol, accounting-style negatives.

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

// Section colour key by account type. Subtle, document-feel.
const SECTION_THEME: Record<string, { dotBg: string; accentBg: string; label: string }> = {
  REVENUE:   { dotBg: "bg-emerald-500", accentBg: "bg-emerald-50",  label: "text-emerald-900" },
  EXPENSE:   { dotBg: "bg-rose-500",    accentBg: "bg-rose-50",     label: "text-rose-900" },
  ASSET:     { dotBg: "bg-sky-500",     accentBg: "bg-sky-50",      label: "text-sky-900" },
  LIABILITY: { dotBg: "bg-amber-500",   accentBg: "bg-amber-50",    label: "text-amber-900" },
  EQUITY:    { dotBg: "bg-violet-500",  accentBg: "bg-violet-50",   label: "text-violet-900" },
  DEFAULT:   { dotBg: "bg-stone-400",   accentBg: "bg-stone-50",    label: "text-stone-900" },
};

export function ReportBody({ sections, ccy = "USD" }: { sections: ReportSection[]; ccy?: string }) {
  if (!sections.length) {
    return (
      <div className="py-16 text-center text-stone-500 text-sm">
        No data for this POV.<br />
        <span className="text-xs text-stone-400">Load facts via Data Load or Data Input, then refresh.</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {sections.map((s, i) => {
        const theme = SECTION_THEME[s.type ?? "DEFAULT"] ?? SECTION_THEME.DEFAULT;
        return (
          <section key={`${s.title}-${i}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <span className={`inline-block w-2 h-2 rounded-full ${theme.dotBg}`} />
                <h3 className={`text-[11px] uppercase tracking-[0.18em] font-bold ${theme.label}`}>{s.title}</h3>
              </div>
              <span className="text-[10px] text-stone-400 font-medium">{s.lines.length} line{s.lines.length === 1 ? "" : "s"}</span>
            </div>
            <table className="w-full">
              <tbody>
                {s.lines.map((line, li) => (
                  <tr key={line.accountId} className="group hover:bg-stone-50/60 transition-colors border-b border-stone-50 last:border-b-0">
                    <td className="py-2 pr-4" style={{ paddingLeft: `${8 + line.indent * 16}px` }}>
                      <span className="font-mono text-[10px] text-stone-400 mr-3 tabular-nums">{line.code}</span>
                      <span className={`text-sm ${line.isBold ? "font-semibold text-stone-900" : "text-stone-800"}`}>{line.name}</span>
                    </td>
                    <td className={`py-2 pr-2 text-right font-mono text-sm tabular-nums w-44 ${line.value < 0 ? "text-rose-700" : "text-stone-900"}`}>
                      {formatMoney(line.value, { ccy })}
                    </td>
                  </tr>
                ))}
                {s.subtotal && (
                  <tr className={`${theme.accentBg} border-t-2 border-stone-300`}>
                    <td className="py-2.5 pr-4 pl-2">
                      <span className={`text-[12px] font-bold uppercase tracking-wider ${theme.label}`}>{s.subtotal.label}</span>
                    </td>
                    <td className={`py-2.5 pr-2 text-right font-mono text-base font-extrabold tabular-nums w-44 ${s.subtotal.value < 0 ? "text-rose-700" : theme.label}`}>
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
