"use client";

// Report body — renders SectionedReport from the API. Each section gets
// a heading, lines with proper indent + bold for subtotals.

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

export function ReportBody({ sections }: { sections: ReportSection[] }) {
  if (!sections.length) {
    return (
      <div className="py-16 text-center text-stone-500 text-sm">
        No data for this POV.<br />
        <span className="text-xs text-stone-400">Load facts via Data Load or Data Input, then refresh.</span>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {sections.map((s, i) => (
        <section key={`${s.title}-${i}`}>
          <h3 className="text-[10px] uppercase tracking-[0.14em] font-semibold text-stone-600 mb-2 pb-1.5 border-b border-stone-100">
            {s.title}
          </h3>
          <table className="w-full">
            <tbody>
              {s.lines.map(line => (
                <tr key={line.accountId} className="group hover:bg-stone-50/60 transition-colors">
                  <td className="py-1.5 pr-4" style={{ paddingLeft: `${line.indent * 16}px` }}>
                    <span className="font-mono text-[10px] text-stone-400 mr-2 tabular-nums">{line.code}</span>
                    <span className={`text-sm ${line.isBold ? "font-semibold text-stone-900" : "text-stone-700"}`}>{line.name}</span>
                  </td>
                  <td className="py-1.5 text-right font-mono text-sm tabular-nums text-stone-900 w-44">
                    {formatMoney(line.value)}
                  </td>
                </tr>
              ))}
              {s.subtotal && (
                <tr className="border-t border-stone-200">
                  <td className="py-2 pr-4 pl-0">
                    <span className="text-sm font-semibold text-stone-900 uppercase tracking-wide text-[12px]">{s.subtotal.label}</span>
                  </td>
                  <td className="py-2 text-right font-mono text-base font-bold tabular-nums text-stone-900 w-44">
                    {formatMoney(s.subtotal.value)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
