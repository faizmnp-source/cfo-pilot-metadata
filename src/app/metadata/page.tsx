"use client";

import { useEffect, useState } from "react";
import {
  BookOpen, Building2, GitBranch, DollarSign, Upload, ShieldCheck, ScrollText,
  Activity, AlertTriangle, Globe, Clock, PieChart, Download, RefreshCw,
  Link2, FolderKanban, Settings2,
} from "lucide-react";
import Link from "next/link";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { StatsCard } from "@/components/metadata/StatsCard";

interface Stats {
  accounts: number;
  entities: number;
  departments: number;
  costCenters: number;
  currencies: number;
  scenarios: number;
  timePoints: number;
  icps: number;
  projects: number;
  userDimensions: number;
  recentChanges: number;
  importJobs: number;
  validationErrors: number;
}

const DIMENSIONS = [
  { href: "/metadata/accounts",    icon: BookOpen,     label: "Chart of Accounts",       desc: "Financial account hierarchy (Assets, Liabilities, Revenue, Expense)",                    color: "text-blue-600",   bg: "bg-blue-50",   statKey: "accounts" },
  { href: "/metadata/entities",    icon: Building2,    label: "Legal Entities",           desc: "Business units, subsidiaries and hospital groups",                                      color: "text-purple-600", bg: "bg-purple-50", statKey: "entities" },
  { href: "/metadata/departments", icon: GitBranch,    label: "Departments",              desc: "Organizational departments (Cardiology, ICU, Radiology…)",                              color: "text-green-600",  bg: "bg-green-50",  statKey: "departments" },
  { href: "/metadata/cost-centers",icon: DollarSign,   label: "Cost Centers",             desc: "Unlimited hierarchy for expense tracking and allocation",                                color: "text-amber-600",  bg: "bg-amber-50",  statKey: "costCenters" },
  { href: "/metadata/scenarios",   icon: PieChart,     label: "Scenarios",                desc: "Budget, Forecast, Actuals and Stress Test planning scenarios",                           color: "text-indigo-600", bg: "bg-indigo-50", statKey: "scenarios" },
  { href: "/metadata/currencies",  icon: Globe,        label: "Currencies",               desc: "Multi-currency with exchange rates and base currency setup",                             color: "text-teal-600",   bg: "bg-teal-50",   statKey: "currencies" },
  { href: "/metadata/time",        icon: Clock,        label: "Time Periods",             desc: "Fiscal years, quarters, months and reporting periods",                                   color: "text-cyan-600",   bg: "bg-cyan-50",   statKey: "timePoints" },
  { href: "/metadata/icp",         icon: Link2,        label: "Intercompany Partners",    desc: "Define ICP counterparties for intercompany eliminations and consolidation",              color: "text-cyan-600",   bg: "bg-cyan-50",   statKey: "icps" },
  { href: "/metadata/projects",    icon: FolderKanban, label: "Projects",                 desc: "Project hierarchy for cost tracking, budgeting and reporting",                          color: "text-emerald-600",bg: "bg-emerald-50",statKey: "projects" },
  { href: "/metadata/dimensions",  icon: Settings2,    label: "User Dimensions",          desc: "Configure UD1-UD10 custom dimensions for your business",                                color: "text-violet-600", bg: "bg-violet-50", statKey: "userDimensions" },
  { href: "/metadata/import",      icon: Upload,       label: "Import Wizard",            desc: "Bulk import from Excel/CSV with AI validation and preview",                             color: "text-violet-600", bg: "bg-violet-50", statKey: null },
  { href: "/metadata/validation",  icon: ShieldCheck,  label: "Validation Center",        desc: "Review AI-detected errors, duplicates and fix suggestions",                             color: "text-red-600",    bg: "bg-red-50",    statKey: null },
  { href: "/metadata/audit-logs",  icon: ScrollText,   label: "Audit Logs",               desc: "Full change history — who changed what, when and from what value",                      color: "text-gray-600",   bg: "bg-gray-50",   statKey: null },
] as const;

const CORE_STATS = [
  { key: "accounts",       label: "Accounts",             icon: BookOpen,     color: "text-blue-600",   bg: "bg-blue-50"    },
  { key: "entities",       label: "Entities",             icon: Building2,    color: "text-purple-600", bg: "bg-purple-50"  },
  { key: "departments",    label: "Departments",          icon: GitBranch,    color: "text-green-600",  bg: "bg-green-50"   },
  { key: "costCenters",    label: "Cost Centers",         icon: DollarSign,   color: "text-amber-600",  bg: "bg-amber-50"   },
  { key: "scenarios",      label: "Scenarios",            icon: PieChart,     color: "text-indigo-600", bg: "bg-indigo-50"  },
  { key: "currencies",     label: "Currencies",           icon: Globe,        color: "text-teal-600",   bg: "bg-teal-50"    },
  { key: "timePoints",     label: "Time Periods",         icon: Clock,        color: "text-cyan-600",   bg: "bg-cyan-50"    },
  { key: "icps",           label: "ICP Partners",         icon: Link2,        color: "text-cyan-600",   bg: "bg-cyan-50"    },
  { key: "projects",       label: "Projects",             icon: FolderKanban, color: "text-emerald-600",bg: "bg-emerald-50" },
  { key: "userDimensions", label: "User Dimensions",      icon: Settings2,    color: "text-violet-600", bg: "bg-violet-50"  },
] as const;

export default function MetadataDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = () => {
    setLoading(true);
    fetch("/api/metadata/stats")
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchStats(); }, []);

  const total = stats
    ? stats.accounts + stats.entities + stats.departments + stats.costCenters +
      stats.currencies + stats.scenarios + stats.timePoints +
      stats.icps + stats.projects + stats.userDimensions
    : 0;

  return (
    <>
      <MetadataHeader
        title="Metadata Management"
        subtitle={`${total.toLocaleString()} total dimension records across 10 dimensions`}
        showSearch={false}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={fetchStats}
              className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <Link href="/metadata/import"
              className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              <Upload className="w-3.5 h-3.5" /> Import Data
            </Link>
          </div>
        }
      />
      <main className="flex-1 overflow-y-auto bg-background p-6 space-y-8">

        {/* Alert banner if validation errors */}
        {stats && stats.validationErrors > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-sm text-red-700">
              <strong>{stats.validationErrors} import jobs</strong> have validation errors that need attention.{" "}
              <Link href="/metadata/validation" className="underline font-medium">Review now →</Link>
            </p>
          </div>
        )}

        {/* 10 dimension stats grid */}
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">All Dimensions</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {CORE_STATS.map(({ key, label, icon: Icon, color, bg }) => (
              <div key={key} className="bg-white rounded-xl border border-border p-4 shadow-sm">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">{label}</span>
                </div>
                <p className="text-2xl font-bold text-foreground tabular-nums">
                  {loading
                    ? <span className="inline-block h-7 w-10 rounded bg-muted animate-pulse" />
                    : ((stats as any)?.[key] ?? 0).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Activity stats row */}
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">Activity</h2>
          <div className="grid grid-cols-3 gap-4">
            <StatsCard title="Changes Today"    value={loading ? "—" : (stats?.recentChanges ?? 0)} icon={Activity}       iconColor="text-teal-600"   iconBg="bg-teal-50"   subtitle="Audit log entries (24h)" />
            <StatsCard title="Import Jobs"       value={loading ? "—" : (stats?.importJobs ?? 0)}    icon={Upload}         iconColor="text-indigo-600" iconBg="bg-indigo-50" subtitle="Total upload sessions" />
            <StatsCard title="Validation Errors" value={loading ? "—" : (stats?.validationErrors ?? 0)} icon={AlertTriangle} iconColor="text-red-600"    iconBg="bg-red-50"    subtitle="Pending fix actions" />
          </div>
        </section>

        {/* Dimension navigation grid */}
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">Manage Dimensions</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {DIMENSIONS.map((item) => {
              const Icon = item.icon;
              const count = item.statKey ? (stats as any)?.[item.statKey] : null;
              return (
                <Link key={item.href} href={item.href}
                  className="flex items-start gap-3 rounded-xl border border-border bg-white p-4 shadow-sm transition-all hover:shadow-md hover:border-primary/30 group">
                  <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${item.bg} group-hover:scale-105 transition-transform`}>
                    <Icon className={`h-5 w-5 ${item.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-sm font-semibold text-foreground">{item.label}</p>
                      {count !== null && (
                        <span className="text-xs tabular-nums font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                          {loading ? "…" : count}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug mt-0.5">{item.desc}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}
