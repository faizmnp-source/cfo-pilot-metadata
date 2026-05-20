"use client";
import { useState } from "react";
import { CFOHeader } from "@/components/cfo/Header";
import { CFOBadge } from "@/components/cfo/Badge";
import { budgetLines } from "@/lib/cfo-data";
import { formatCurrency, cn } from "@/lib/utils";
import { ChevronRight, ChevronDown, Download, Plus, Check, GitBranch } from "lucide-react";

const months = ["Jan", "Feb", "Mar"];
const versions = ["v1 Submitted", "v2 Approved", "v3 Current (Live)"];

function VariancePill({ actual, budget }: { actual: number; budget: number }) {
  const pct = ((actual - budget) / budget) * 100;
  const isOver = pct > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular",
      Math.abs(pct) < 1.5 ? "bg-gray-100 text-gray-600" :
      isOver ? "bg-[var(--color-danger-50)] text-[var(--color-danger-600)]" :
               "bg-[var(--color-success-50)] text-[var(--color-success-600)]"
    )}>
      {isOver ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

export default function BudgetingPage() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["rev", "opex"]));
  const [activeVersion, setActiveVersion] = useState(2);
  const toggle = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <>
      <CFOHeader title="Budgeting" subtitle="FY 2026 Annual Operating Plan"
        actions={
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-sunken)] transition-colors">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <button className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-700)] transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Line
            </button>
          </div>
        }
      />
      <main className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="flex items-center gap-2 bg-white rounded-xl border border-[var(--border-default)] px-4 py-3">
          <GitBranch className="w-4 h-4 text-[var(--text-tertiary)]" />
          <span className="text-xs text-[var(--text-secondary)] font-medium mr-2">Version:</span>
          {versions.map((v, i) => (
            <button key={i} onClick={() => setActiveVersion(i)}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                activeVersion === i ? "bg-[var(--color-brand-50)] text-[var(--color-brand-700)] border border-[var(--color-brand-200)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-sunken)]")}>
              {activeVersion === i && <Check className="w-3 h-3" />}{v}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-[var(--border-default)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="bg-[var(--bg-surface-sunken)] border-b border-[var(--border-strong)]">
                  <th className="px-5 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-[var(--text-secondary)] w-52">Account</th>
                  {months.map(m => (
                    <>
                      <th key={`${m}-act`} className="px-3 py-3 text-right font-semibold uppercase tracking-wider text-[11px] text-[var(--text-secondary)] w-28">{m} Actual</th>
                      <th key={`${m}-bud`} className="px-3 py-3 text-right font-semibold uppercase tracking-wider text-[11px] text-[var(--text-secondary)] w-28">{m} Budget</th>
                      <th key={`${m}-var`} className="px-3 py-3 text-center font-semibold uppercase tracking-wider text-[11px] text-[var(--text-secondary)] w-20">Var</th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {(budgetLines as unknown as any[]).map((line) => {
                  const isExp = expanded.has(line.id);
                  return (
                    <>
                      <tr key={line.id} onClick={() => line.children && toggle(line.id)}
                        className={cn("transition-colors", line.isTotal ? "bg-gray-50 font-bold" : line.isHeader ? "bg-[var(--bg-surface-sunken)]" : "", line.children ? "cursor-pointer hover:bg-gray-50" : "")}>
                        <td className={cn("px-5 py-3 text-[var(--text-primary)]", line.isTotal ? "font-bold" : line.isHeader ? "font-semibold" : "font-medium")}>
                          <div className="flex items-center gap-2">
                            {line.children && (isExp ? <ChevronDown className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" />)}
                            {!line.children && <span className="w-3.5 shrink-0" />}
                            <span style={{ paddingLeft: line.indent * 12 }}>{line.label}</span>
                          </div>
                        </td>
                        {[{ act: line.jan, bud: line.budgetJan }, { act: line.feb, bud: line.budgetFeb }, { act: line.mar, bud: line.budgetMar }].map(({ act, bud }, i) => (
                          <>
                            <td key={`act-${i}`} className={cn("px-3 py-3 text-right tabular", line.isTotal ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-primary)]")}>{formatCurrency(act)}</td>
                            <td key={`bud-${i}`} className="px-3 py-3 text-right tabular text-[var(--text-secondary)]">{formatCurrency(bud)}</td>
                            <td key={`var-${i}`} className="px-3 py-3 text-center"><VariancePill actual={act} budget={bud} /></td>
                          </>
                        ))}
                      </tr>
                      {isExp && line.children?.map((child: any) => (
                        <tr key={child.id} className="hover:bg-[var(--bg-surface-sunken)] transition-colors">
                          <td className="px-5 py-2.5 text-[var(--text-secondary)]">
                            <span style={{ paddingLeft: (child.indent) * 16 + 20 }}>{child.label}</span>
                          </td>
                          {[{ act: child.jan, bud: child.budgetJan }, { act: child.feb, bud: child.budgetFeb }, { act: child.mar, bud: child.budgetMar }].map(({ act, bud }, i) => (
                            <>
                              <td key={`c-act-${i}`} className="px-3 py-2.5 text-right tabular text-[var(--text-secondary)]">{formatCurrency(act)}</td>
                              <td key={`c-bud-${i}`} className="px-3 py-2.5 text-right tabular text-[var(--text-tertiary)]">{formatCurrency(bud)}</td>
                              <td key={`c-var-${i}`} className="px-3 py-2.5 text-center"><VariancePill actual={act} budget={bud} /></td>
                            </>
                          ))}
                        </tr>
                      ))}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    