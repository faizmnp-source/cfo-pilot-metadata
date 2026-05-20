"use client";
import { useState } from "react";
import { CFOHeader } from "@/components/cfo/Header";
import { CFOBadge } from "@/components/cfo/Badge";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { forecastScenarios } from "@/lib/cfo-data";
import { formatCurrency, cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Sparkles, ChevronRight } from "lucide-react";

const scenarios = [
  {
    key: "bull" as const,
    label: "Bull Case",
    icon: TrendingUp,
    color: "text-[var(--color-success-600)]",
    bg: "bg-[var(--color-success-50)]",
    border: "border-[var(--color-success-200)]",
    badge: "success" as const,
    revenue: "$35.0M",
    growth: "+43.6%",
    ebitda: "22.4%",
    assumptions: ["Enterprise ACV grows 35%", "SMB churn falls to 2.5%", "2 new verticals launch"],
  },
  {
    key: "base" as const,
    label: "Base Case",
    icon: Minus,
    color: "text-[var(--color-brand-600)]",
    bg: "bg-[var(--color-brand-50)]",
    border: "border-[var(--color-brand-200)]",
    badge: "info" as const,
    revenue: "$31.5M",
    growth: "+28.9%",
    ebitda: "18.7%",
    assumptions: ["Enterprise ACV grows 20%", "SMB churn steady at 4%", "Headcount plan as modeled"],
  },
  {
    key: "bear" as const,
    label: "Bear Case",
    icon: TrendingDown,
    color: "text-[var(--color-danger-600)]",
    bg: "bg-[var(--color-danger-50)]",
    border: "border-[var(--color-danger-200)]",
    badge: "danger" as const,
    revenue: "$27.0M",
    growth: "+10.6%",
    ebitda: "11.2%",
    assumptions: ["Enterprise ACV grows 5%", "SMB churn rises to 6%", "Hiring freeze Q3–Q4"],
  },
];

const assumptionsTable = [
  { driver: "Enterprise ACV Growth",  bull: "+35%",    base: "+20%",    bear: "+5%"    },
  { driver: "SMB Monthly Churn",       bull: "2.5%",    base: "4.0%",    bear: "6.0%"   },
  { driver: "NRR",                     bull: "120%",    base: "112%",    bear: "100%"   },
  { driver: "New Logo Adds / Mo",      bull: "18",      base: "12",      bear: "6"      },
  { driver: "Gross Margin",            bull: "71%",     base: "68%",     bear: "63%"    },
  { driver: "OpEx Growth",             bull: "+12%",    base: "+18%",    bear: "+8%"    },
  { driver: "Headcount EOY",           bull: "155",     base: "140",     bear: "118"    },
  { driver: "Cash Runway",             bull: "36 mo",   base: "28 mo",   bear: "18 mo"  },
];

export default function ForecastingPage() {
  const [active, setActive] = useState<"bull" | "base" | "bear">("base");
  const activeScenario = scenarios.find(s => s.key === active)!;

  return (
    <>
      <CFOHeader title="Forecasting" subtitle="FY 2026 Revenue Scenarios · Annual" />
      <main className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Scenario selector cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {scenarios.map(s => {
            const Icon = s.icon;
            const isActive = active === s.key;
            return (
              <button key={s.key} onClick={() => setActive(s.key)}
                className={cn("text-left p-5 rounded-xl border-2 transition-all",
                  isActive ? `${s.bg} ${s.border}` : "bg-white border-[var(--border-default)] hover:border-[var(--border-strong)]")}>
                <div className="flex items-center justify-between mb-3">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", s.bg)}>
                    <Icon className={cn("w-4 h-4", s.color)} />
                  </div>
                  <CFOBadge variant={s.badge}>{s.label}</CFOBadge>
                </div>
                <p className="text-2xl font-bold text-[var(--text-primary)] tabular">{s.revenue}</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">FY 2026 Revenue</p>
                <div className="mt-3 pt-3 border-t border-[var(--border-default)] flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)]">YoY Growth</span>
                  <span className={cn("text-xs font-semibold tabular", s.color)}>{s.growth}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-[var(--text-secondary)]">EBITDA Margin</span>
                  <span className="text-xs font-semibold tabular text-[var(--text-primary)]">{s.ebitda}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Chart */}
        <div className="bg-white rounded-xl border border-[var(--border-default)] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Revenue Forecast — All Scenarios</h2>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Jan – Dec 2026 · Dashed line = forecast (Apr–Dec)</p>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-[var(--text-secondary)]">
              {[
                { label: "Bull", color: "bg-[var(--color-success-500)]" },
                { label: "Base", color: "bg-[var(--color-brand-500)]" },
                { label: "Bear", color: "bg-[var(--color-danger-400)]" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className={cn("w-2.5 h-2.5 rounded-sm", l.color)} />
                  <span>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
          <ForecastChart data={forecastScenarios} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Key assumptions for selected scenario */}
          <div className="bg-white rounded-xl border border-[var(--border-default)] p-5">
            <div className="flex items-center gap-2 mb-4">
              <activeScenario.icon className={cn("w-4 h-4", activeScenario.color)} />
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{activeScenario.label} Assumptions</h3>
            </div>
            <div className="space-y-2.5">
              {activeScenario.assumptions.map((a, i) => (
                <div key={i} className="flex items-start gap-2.5 p-3 rounded-lg bg-[var(--bg-surface-sunken)]">
                  <ChevronRight className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", activeScenario.color)} />
                  <p className="text-xs text-[var(--text-primary)]">{a}</p>
                </div>
              ))}
            </div>
          </div>

          {/* AI insight */}
          <div className="xl:col-span-2 bg-white rounded-xl border border-[var(--border-default)] p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-[var(--color-ai-50)] flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-[var(--color-ai-600)]" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">AI Scenario Analysis</h3>
              <CFOBadge variant="info" className="ml-auto">Generated</CFOBadge>
            </div>
            <div className="space-y-3 text-xs text-[var(--text-secondary)] leading-relaxed">
              <p>Based on current pipeline velocity and Q2 actuals, the <strong className="text-[var(--text-primary)]">Base Case</strong> has a 58% probability of realization. Enterprise ACV is the highest-leverage variable — a 5% improvement in enterprise close rate would shift the outcome toward Bull by approximately $1.8M ARR.</p>
              <p>Key risks to monitor: SMB monthly churn is trending at 4.3% (slightly above the 4.0% base assumption). If churn rises to 5% in Q3, revenue could miss base by $600K–$900K, pulling the outcome toward the Bear scenario.</p>
              <p>Recommended action: prioritize renewal outreach for the SMB segment in June and revisit enterprise ACV targets with the Sales team before the Q3 board package.</p>
            </div>
          </div>
        </div>

        {/* Assumptions comparison table */}
        <div className="bg-white rounded-xl border border-[var(--border-default)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-default)]">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Scenario Assumptions Comparison</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[var(--bg-surface-sunken)] border-b border-[var(--border-default)]">
                  <th className="px-5 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-[var(--text-secondary)]">Driver</th>
                  <th className="px-5 py-3 text-center font-semibold uppercase tracking-wider text-[11px] text-[var(--color-success-600)]">Bull</th>
                  <th className="px-5 py-3 text-center font-semibold uppercase tracking-wider text-[11px] text-[var(--color-brand-600)]">Base</th>
                  <th className="px-5 py-3 text-center font-semibold uppercase tracking-wider text-[11px] text-[var(--color-danger-600)]">Bear</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {assumptionsTable.map(row => (
                  <tr key={row.driver} className="hover:bg-[var(--bg-surface-sunken)] transition-colors">
                    <td className="px-5 py-3 font-medium text-[var(--text-primary)]">{row.driver}</td>
                    <td className="px-5 py-3 text-center tabular text-[var(--color-success-600)] font-medium">{row.bull}</td>
                    <td className="px-5 py-3 text-center tabular text-[var(--color-brand-600)] font-medium">{row.base}</td>
                    <td className="px-5 py-3 text-center tabular text-[var(--color-danger-600)] font-medium">{row.bear}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </>
  );
}
