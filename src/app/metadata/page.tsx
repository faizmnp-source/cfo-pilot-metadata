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

  useEffe