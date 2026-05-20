"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, CalendarCheck, PieChart, TrendingUp, Users, Kanban,
  FileText, Table2, Sparkles, Bell, Settings, ChevronLeft, ChevronRight,
  Navigation, BookOpen, Building2, GitBranch, Layers, Upload, ShieldCheck,
  History, LogOut, DollarSign, Globe, Clock, Link2, FolderKanban, Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

const CFO_NAV = [
  { href: "/dashboard",     label: "Executive Dashboard", icon: LayoutDashboard },
  { href: "/monthly-close", label: "Monthly Close",       icon: CalendarCheck },
  { href: "/budgeting",     label: "Budgeting",           icon: PieChart },
  { href: "/forecasting",   label: "Forecasting",         icon: TrendingUp },
  { href: "/workforce",     label: "Workforce Planning",  icon: Users },
  { href: "/projects",      label: "Project Planning",    icon: Kanban },
  { href: "/reporting",     label: "Reporting",           icon: FileText },
  { href: "/excel",         label: "Excel Integration",   icon: Table2 },
];

const META_NAV_CORE = [
  { href: "/metadata",             label: "Overview",     icon: Layers },
  { href: "/metadata/accounts",    label: "Accounts",     icon: BookOpen },
  { href: "/metadata/entities",    label: "Entities",     icon: Building2 },
  { href: "/metadata/departments", label: "Departments",  icon: GitBranch },
  { href: "/metadata/cost-centers",label: "Cost Centers", icon: DollarSign },
  { href: "/metadata/scenarios",   label: "Scenarios",    icon: PieChart },
  { href: "/metadata/currencies",  label: "Currencies",   icon: Globe },
  { href: "/metadata/time",        label: "Time Periods", icon: Clock },
  { href: "/metadata/icp",         label: "ICP",          icon: Link2 },
  { href: "/metadata/projects",    label: "Projects",     icon: FolderKanban },
];

const META_NAV_BOTTOM = [
  { href: "/metadata/import",      label: "Import Wizard",     icon: Upload },
  { href: "/metadata/validation",  label: "Validation",        icon: ShieldCheck },
  { href: "/metadata/audit-logs",  label: "Audit Logs",        icon: History },
  { href: "/metadata/dimensions",  label: "Configure Dimensions", icon: Settings2 },
];

interface UnifiedSidebarProps {
  userName?: string;
  userRole?: string;
}

export function UnifiedSidebar({ userName = "Faizan", userRole = "CFO" }: UnifiedSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [userDims, setUserDims] = useState<{ id: string; slot: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/metadata/dimensions")
      .then((r) => r.json())
      .then((data) => {
        const dims = Array.isArray(data) ? data : (data.data ?? []);
        setUserDims(dims.filter((d: any) => d.isActive && d.name));
      })
      .catch(() => {});
  }, []);

  const isActive = (href: string) =>
    href === "/metadata" ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className={cn(
      "flex flex-col h-full bg-white border-r border-[var(--border-default)] transition-all duration-200 shrink-0 overflow-y-auto",
      collapsed ? "w-16" : "w-60"
    )}>
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-[var(--border-default)] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[var(--color-brand-600)] flex items-center justify-center shrink-0">
            <Navigation className="w-4 h-4 text-white" strokeWidth={1.5} />
          </div>
          {!collapsed && (
            <div className="flex items-baseline gap-1 min-w-0">
              <span className="font-semibold text-sm text-[var(--text-primary)] tracking-tight">CFO</span>
              <span className="font-light text-sm text-[var(--text-secondary)] tracking-tight">Pilot</span>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn("ml-auto p-1 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-sunken)] transition-colors", collapsed && "mx-auto ml-0")}
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Finance OS section */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {!collapsed && (
          <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">
            Finance OS
          </p>
        )}
        {CFO_NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link key={href} href={href} title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-3 px-3 h-9 rounded-md mb-0.5 text-xs font-medium transition-all duration-100",
                collapsed && "justify-center px-0",
                active
                  ? "bg-[var(--color-brand-50)] text-[var(--color-brand-600)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-sunken)]"
              )}>
              <Icon className={cn("w-4 h-4 shrink-0", active ? "text-[var(--color-brand-500)]" : "text-[var(--text-tertiary)]")} strokeWidth={active ? 2 : 1.5} />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}

        {/* Divider */}
        <div className={cn("my-2 border-t border-[var(--border-default)]", collapsed && "mx-2")} />

        {!collapsed && (
          <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">
            Metadata
          </p>
        )}
        {META_NAV_CORE.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link key={href} href={href} title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-3 px-3 h-9 rounded-md mb-0.5 text-xs font-medium transition-all duration-100",
                collapsed && "justify-center px-0",
                active
                  ? "bg-[var(--color-brand-50)] text-[var(--color-brand-600)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-sunken)]"
              )}>
              <Icon className={cn("w-4 h-4 shrink-0", active ? "text-[var(--color-brand-500)]" : "text-[var(--text-tertiary)]")} strokeWidth={active ? 2 : 1.5} />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}

        {/* User Dimensions section */}
        {userDims.length > 0 && (
          <>
            {!collapsed && (
              <p className="px-3 mt-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">
                User Dimensions
              </p>
            )}
            {collapsed && <div className="my-1 border-t border-[var(--border-default)] mx-2" />}
            {userDims.map(({ id, name }) => {
              const href = `/metadata/dimensions/${id}`;
              const active = isActive(href);
              return (
                <Link key={id} href={href} title={collapsed ? name : undefined}
                  className={cn(
                    "flex items-center gap-3 px-3 h-9 rounded-md mb-0.5 text-xs font-medium transition-all duration-100",
                    collapsed && "justify-center px-0",
                    active
                      ? "bg-[var(--color-brand-50)] text-[var(--color-brand-600)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-sunken)]"
                  )}>
                  <Layers className={cn("w-4 h-4 shrink-0", activ