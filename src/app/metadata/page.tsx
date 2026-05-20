"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Building2,
  GitBranch,
  DollarSign,
  Upload,
  ShieldCheck,
  ScrollText,
  TrendingUp,
  Activity,
  AlertTriangle,
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
  auditLogsToday: number;
  importJobsThisWeek: number;
  pendingValidations?: number;
}

const DIMENSION_LINKS = [
  {
    href: "/metadata/accounts",
    icon: BookOpen,
    label: "Chart of Accounts",
    desc: "Manage financial account hierarchy",
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    href: "/metadata/entities",
    icon: Building2,
    label: "Legal Entities",
    desc: "Business units and subsidiaries",
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  {
    href: "/metadata/departments",
    icon: GitBranch,
    label: "Departments",
    desc: "Organizational department tree",
    color: "text-green-600",
    bg: "bg-green-50",
  },
  {
    href: "/metadata/cost-centers",
    icon: DollarSign,
    label: "Cost Centers",
    desc: "Cost center hierarchy",
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    href: "/metadata/import",
    icon: Upload,
    label: "Import Wizard",
    desc: "Bulk import with AI validation",
    color: "text-teal-600",
    bg: "bg-teal-50",
  },
  {
    href: "/metadata/validation",
    icon: ShieldCheck,
    label: "Validation",
    desc: "Review and fix data quality issues",
    color: "text-red-600",
    bg: "bg-red-50",
  },
  {
    href: "/metadata/audit-logs",
    icon: ScrollText,
    label: "Audit Logs",
    desc: "Full change history and activity",
    color: "text-gray-600",
    bg: "bg-gray-50",
  },
];

export default function MetadataDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/metadata/stats")
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  const skeletonClass = "h-5 w-20 rounded bg-muted animate-pulse";

  return (
    <>
      <MetadataHeader
        title="Metadata Dashboard"
        subtitle="Overview of all financial dimensions"
        showSearch={false}
      />
      <main className="flex-1 overflow-y-auto bg-background p-6">
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
          <StatsCard
            title="Accounts"
            value={loading ? "—" : (stats?.accounts ?? 0)}
            icon={BookOpen}
            iconColor="text-blue-600"
            iconBg="bg-blue-50"
            subtitle="Chart of accounts"
          />
          <StatsCard
            title="Entities"
            value={loading ? "—" : (stats?.entities ?? 0)}
            icon={Building2}
            iconColor="text-purple-600"
            iconBg="bg-purple-50"
            subtitle="Legal entities"
          />
          <StatsCard
            title="Departments"
            value={loading ? "—" : (stats?.departments ?? 0)}
            icon={GitBranch}
            iconColor="text-green-600"
            iconBg="bg-green-50"
            subtitle="Org units"
          />
          <StatsCard
            title="Cost Centers"
            value={loading ? "—" : (stats?.costCenters ?? 0)}
            icon={DollarSign}
            iconColor="text-amber-600"
            iconBg="bg-amber-50"
            subtitle="Cost center codes"
          />
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <StatsCard
            title="Audit Events Today"
            value={loading ? "—" : (stats?.auditLogsToday ?? 0)}
            icon={Activity}
            iconColor="text-teal-600"
            iconBg="bg-teal-50"
          />
          <StatsCard
            title="Imports This Week"
            value={loading ? "—" : (stats?.importJobsThisWeek ?? 0)}
            icon={Upload}
            iconColor="text-indigo-600"
            iconBg="bg-indigo-50"
          />
          <StatsCard
            title="Pending Validations"
            value={loading ? "—" : (stats?.pendingValidations ?? 0)}
            icon={AlertTriangle}
            iconColor="text-red-600"
            iconBg="bg-red-50"
          />
        </div>

        {/* Quick navigation */}
        <h2 className="mb-4 text-sm font-semibold text-foreground">
          Manage Dimensions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {DIMENSION_LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-start gap-3 rounded-xl border border-border bg-white p-4 shadow-sm transition-shadow hover:shadow-md hover:border-primary/30"
              >
                <div
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${item.bg}`}
                >
                  <Icon className={`h-4.5 w-4.5 ${item.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground leading-snug">{item.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
