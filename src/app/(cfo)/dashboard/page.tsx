"use client";
import { useState } from "react";
import { CFOHeader } from "@/components/cfo/Header";
import { KPICard } from "@/components/cfo/KPICard";
import { CFOBadge } from "@/components/cfo/Badge";
import { RevenueChart } from "@/components/charts/RevenueChart";
import { BudgetBarChart } from "@/components/charts/BudgetBarChart";
import { CopilotPanel } from "@/components/cfo/CopilotPanel";
import { kpiData as dummyKpis, revenueChartData, departmentData } from "@/lib/cfo-data";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import { Sparkles, AlertTriangle, Clock, TrendingDown, Download, RefreshCw } from "lucide-react";

const alerts = [
  { icon: Clock,         color: "text-amber-500", bg: "bg-amber-50", label: "Monthly close due in 3 days",     sub: "4 of 11 tasks remaining" },
  { icon: TrendingDown,  color: "text-red-500",   bg: "bg-red-50",   label: "Headcount 6% over plan",          sub: "Engineering +3, Sales +2 vs. budget" },
  { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-50", label: "AR aging 60+ days: $940K",        sub: "3 enterprise accounts outstanding" },
];

const deptChartData = departmentData.map(d => ({ name: d.name.split(" ")[0], budget: d.budget, actual: d.actual }));

export default function DashboardPage() {
  const [copilotOpen, setCopilotOpen] = useState(false);
  const live = useDashboardData();

  // Use live numbers when we have real data; fall back to dummy preview.
  // Sparklines now come from monthly trend (revenue/expense/netIncome over 12 months).
  const kpiData = live.hasData ? {
    revenue:  { ...dummyKpis.revenue,  value: live.revenue.value,  trend: live.revenue.trend,  sparkline: live.revenue.sparkline.length ? live.revenue.sparkline : dummyKpis.revenue.sparkline },
    ebitda:   { ...dummyKpis.ebitda,   value: live.ebitda.value,   trend: live.ebitda.trend,   sparkline: live.ebitda.sparkline.length  ? live.ebitda.sparkline  : dummyKpis.ebitda.sparkline },
    cash:     { ...dummyKpis.cash,     value: live.cash.value,     trend: live.cash.trend },
    burnRate: { ...dummyKpis.burnRate, value: live.burnRate.value, trend: live.burnRate.trend, sparkline: live.burnRate.sparkline.length ? live.burnRate.sparkline : dummyKpis.burnRate.sparkline },
  } : dummyKpis;

  return (
    <>
      <CFOHeader
        title="Executive Dashboard"
        subtitle={live.loaded
          ? live.hasData
              ? `${live.entityName} · ${live.yearCode} · live from /api/v2/reports`
              : `${live.entityName ?? "—"} · ${live.yearCode ?? "—"} · sample data (load facts to see live numbers)`
          : "Loading…"}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCopilotOpen(!copilotOpen)}
              className={cn("flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-all",
                copilotOpen ? "bg-[var(--color-ai-500)] text-white" : "border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-sunken)]")}>
              <Sparkles className="w-3.5 h-3.5" /> AI Copilot
            </button>
            <button className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-700)] transition-colors">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>
        }
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <KPICard label="Total Revenue"  value={kpiData.revenue.value}  delta={kpiData.revenue.delta}  trend={kpiData.revenue.trend}  sparkline={kpiData.revenue.sparkline} />
            <KPICard label="EBITDA"         value={kpiData.ebitda.value}   delta={kpiData.ebitda.delta}   trend={kpiData.ebitda.trend}   sparkline={kpiData.ebitda.sparkline} />
            <KPICard label="Cash Position"  value={kpiData.cash.value}     delta={kpiData.cash.delta}     trend={kpiData.cash.trend}     sparkline={kpiData.cash.sparkline} />
            <KPICard label="Monthly Burn"   value={kpiData.burnRate.value} delta={kpiData.burnRate.delta} trend="up" sparkline={kpiData.burnRate.sparkline} positive="down" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 bg-white rounded-xl border border-[var(--border-default)] p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">Revenue vs Expenses · Monthly Trend</h2>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                    {live.hasData ? `${live.entityName} · ${live.yearCode} · in ${live.ccy}` : "Jul 2025 – Jun 2026 · Monthly (sample)"}
                  </p>
                </div>
                <button className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-sunken)] transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
              <RevenueChart data={live.hasData && live.monthly.length > 0
                ? live.monthly.map(m => ({
                    month: m.code.slice(-3).replace("M0", "M"),     // "M01" → "M1"
                    actual: m.revenue,
                    budget: m.expense,
                    forecast: m.netIncome,
                  }))
                : revenueChartData} />
            </div>
            <div className="bg-white rounded-xl border border-[var(--border-default)] p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Action Items</h2>
                <CFOBadge variant="warning" className="ml-auto">{alerts.length} items</CFOBadge>
              </div>
              <div className="space-y-3">
                {alerts.map((a, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border-default)] hover:bg-[var(--bg-surface-sunken)] cursor-pointer transition-colors">
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", a.bg)}>
                      <a.icon className={cn("w-3.5 h-3.5", a.color)} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--text-primary)] leading-snug">{a.label}</p>
                      <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{a.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[var(--border-default)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-default)]">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Department Performance</h2>
              <p className="text-xs text-[var(--text-tertiary)]">Budget vs. Actual · YTD Q2</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--bg-surface-sunken)] border-b border-[var(--border-default)]">
                    {["Department","Budget","Actual","Variance","Var %","Headcount","Status"].map(h => (
                      <th key={h} className="px-5 py-2.5 text-left font-semibold uppercase tracking-wider text-[11px] text-[var(--text-secondary)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {departmentData.map((d) => {
                    const isOver = d.variance > 0;
                    const isOnTrack = d.status === "on-track";
                    return (
                      <tr key={d.name} className="hover:bg-[var(--bg-surface-sunken)] transition-colors cursor-pointer">
                        <td className="px-5 py-3 font-medium text-[var(--text-primary)]">{d.name}</td>
                        <td className="px-5 py-3 tabular text-[var(--text-secondary)]">{formatCurrency(d.budget)}</td>
                        <td className="px-5 py-3 tabular font-medium text-[var(--text-primary)]">{formatCurrency(d.actual)}</td>
                        <td className={cn("px-5 py-3 tabular font-medium", isOver ? "text-[var(--color-danger-600)]" : "text-[var(--color-success-600)]")}>
                          {isOver ? "+" : ""}{formatCurrency(d.variance)}
                        </td>
                        <td className={cn("px-5 py-3 tabular font-medium", isOver ? "text-[var(--color-danger-600)]" : "text-[var(--color-success-600)]")}>
                          {formatPercent(d.variancePct)}
                        </td>
                        <td className="px-5 py-3 tabular text-[var(--text-secondary)]">{d.headcount}</td>
                        <td className="px-5 py-3">
                          <CFOBadge variant={isOnTrack ? "neutral" : isOver ? "danger" : "success"}>
                            {isOnTrack ? "On Track" : isOver ? "Over" : "Under"}
                          </CFOBadge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 bg-white rounded-xl border border-[var(--border-default)] p-5">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Budget vs. Actual by Department</h2>
              <BudgetBarChart data={deptChartData} />
            </div>
            <div className="bg-white rounded-xl border border-[var(--border-default)] p-5 space-y-4">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Quick Stats</h2>
              {[
                { label: "Gross Margin",     value: "68.7%",  delta: "+0.5pts",       pos: true  },
                { label: "ARR",              value: "$29.2M", delta: "+14.2% YoY",    pos: true  },
                { label: "Total Headcount",  value: "127",    delta: "+8 QoQ",        pos: true  },
                { label: "Runway",           value: "28 mo",  delta: "+3 mo vs. prior",pos: true },
                { label: "OpEx / Revenue",   value: "48.6%",  delta: "+1.8pts",       pos: false },
                { label: "NRR",              value: "112%",   delta: "+2pts QoQ",     pos: true  },
              ].map(({ label, value, delta, pos }) => (
                <div key={label} className="flex items-center justify-between py-1 border-b border-[var(--border-default)] last:border-0">
                  <span className="text-xs text-[var(--text-secondary)]">{label}</span>
                  <div className="text-right">
                    <p className="text-xs font-semibold tabular text-[var(--text-primary)]">{value}</p>
                    <p className={cn("text-[10px] tabular", pos ? "text-[var(--color-success-600)]" : "text-[var(--color-danger-600)]")}>{delta}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

        {copilotOpen && <CopilotPanel onClose={() => setCopilotOpen(false)} />}
      </div>
    </>
  );
}
