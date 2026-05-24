"use client";

// CFO Pilot Sidebar — dark theme, color-coded sections.
//
// Design language: Linear / Stripe / Cube Cloud / Vercel hybrid.
// - Deep slate-950 background with subtle inner glow
// - Each semantic section has its own accent color (signature)
// - AI Copilot is a gradient hero pill (always at the top, always magic)
// - Active items: gradient bg in section color + left edge accent + glow
// - Hover: subtle white/5 wash
// - Footer: glass-blur with user avatar wearing a gradient ring

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, CalendarCheck, PieChart, TrendingUp, Users, Kanban,
  FileText, Table2, Sparkles, Bell, Settings, ChevronLeft, ChevronRight,
  BookOpen, GitBranch, Layers, Upload, ShieldCheck,
  History, LogOut, DollarSign, FolderKanban, Settings2,
  Pencil, FileSpreadsheet, Cpu, Receipt, Scale, TrendingDown, Rocket,
  Zap, Clock, Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

// ─── Section type ────────────────────────────────────────────────
type Item = { href: string; label: string; icon: any };

// ─── Section accent colors (Tailwind tokens) ─────────────────────
// Each section gets a memorable signature color. Builds muscle memory.
const ACCENTS = {
  hero:     { from: "from-violet-500",  to: "to-fuchsia-500",  glow: "shadow-violet-500/20",  dot: "bg-violet-400",  hex: "violet" },
  insights: { from: "from-sky-500",     to: "to-cyan-500",     glow: "shadow-sky-500/15",     dot: "bg-sky-400",     hex: "sky" },
  planning: { from: "from-emerald-500", to: "to-teal-500",     glow: "shadow-emerald-500/15", dot: "bg-emerald-400", hex: "emerald" },
  data:     { from: "from-zinc-500",    to: "to-slate-500",    glow: "shadow-zinc-500/10",    dot: "bg-zinc-400",    hex: "zinc" },
  process:  { from: "from-amber-500",   to: "to-orange-500",   glow: "shadow-amber-500/15",   dot: "bg-amber-400",   hex: "amber" },
  reports:  { from: "from-rose-500",    to: "to-pink-500",     glow: "shadow-rose-500/15",    dot: "bg-rose-400",    hex: "rose" },
} as const;
type AccentKey = keyof typeof ACCENTS;

// ─── Nav sections ────────────────────────────────────────────────
const HERO_NAV: Item[] = [
  { href: "/copilot",       label: "AI Copilot",          icon: Sparkles },
];
const INSIGHTS_NAV: Item[] = [
  { href: "/dashboard",     label: "Executive Dashboard", icon: LayoutDashboard },
  { href: "/growth",        label: "Growth Engine",       icon: Rocket },
  { href: "/monthly-close", label: "Monthly Close",       icon: CalendarCheck },
];
const PLANNING_NAV: Item[] = [
  { href: "/workforce",     label: "Workforce Planning",  icon: Users },
  { href: "/forecasting",   label: "Forecasting",         icon: TrendingUp },
  { href: "/forecasting/variance", label: "Forecast Variance",   icon: Scale },
  { href: "/budgeting",     label: "Budgeting",           icon: PieChart },
  { href: "/projects",      label: "Project Planning",    icon: Kanban },
  { href: "/rules",         label: "Calc Rules",          icon: Cpu },
  { href: "/automation",    label: "Automation",          icon: Zap },
];
const META_NAV_CORE: Item[] = [
  { href: "/metadata",         label: "Overview",          icon: Layers },
  { href: "/metadata/library", label: "Dimension Library", icon: BookOpen },
  { href: "/data/forms",       label: "Data Forms",        icon: FolderKanban },
  { href: "/data/input",       label: "Data Input",        icon: Pencil },
];
const DATA_LOAD_NAV: Item[] = [
  { href: "/data/load",                label: "Overview",            icon: FileSpreadsheet },
  { href: "/data/load/facts-import",   label: "Excel / CSV Import",  icon: Upload },
];
const PROCESS_NAV: Item[] = [
  { href: "/process",                  label: "Overview",            icon: Clock },
  { href: "/process/consolidation",    label: "Consolidation",       icon: GitBranch },
  { href: "/process/fx-rates",         label: "FX Rates",            icon: DollarSign },
  { href: "/snapshots",                label: "Snapshots & Backup",  icon: Camera },
];
const REPORTS_NAV: Item[] = [
  { href: "/reports",                  label: "Overview",            icon: FileText },
  { href: "/reports/income-statement", label: "Income Statement",    icon: TrendingDown },
  { href: "/reports/balance-sheet",    label: "Balance Sheet",       icon: Scale },
  { href: "/reports/trial-balance",    label: "Trial Balance",       icon: Receipt },
  { href: "/reports/cash-flow",        label: "Cash Flow",           icon: BookOpen },
];
const META_NAV_BOTTOM: Item[] = [
  { href: "/metadata/import",      label: "Import Wizard",        icon: Upload },
  { href: "/metadata/validation",  label: "Validation",           icon: ShieldCheck },
  { href: "/metadata/audit-logs",  label: "Audit Logs",           icon: History },
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
  const [tenantName, setTenantName] = useState<string>("");

  useEffect(() => {
    fetch("/api/metadata/dimensions")
      .then(r => r.json())
      .then(data => {
        const dims = Array.isArray(data) ? data : (data.data ?? []);
        setUserDims(dims.filter((d: any) => d.isActive && d.name));
      })
      .catch(() => {});
    fetch("/api/v2/tenant", { credentials: "include" })
      .then(r => r.json()).then(j => { if (j?.data?.name) setTenantName(j.data.name); })
      .catch(() => {});
  }, []);

  const isActive = (href: string) =>
    href === "/metadata" ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className={cn(
      "flex flex-col h-full bg-slate-950 text-zinc-200 border-r border-white/5 transition-all duration-200 shrink-0 overflow-hidden",
      collapsed ? "w-16" : "w-64"
    )}>
      {/* Top inner glow — subtle ambient light */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-violet-500/[0.08] via-fuchsia-500/[0.02] to-transparent pointer-events-none" />

      {/* ─── LOGO ─── */}
      <div className="relative flex items-center h-14 px-4 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/30">
            <Sparkles className="w-4 h-4 text-white" strokeWidth={2.2} />
            {/* subtle glow */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-violet-400 to-fuchsia-400 opacity-50 blur-md -z-10" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="flex items-baseline gap-1">
                <span className="font-bold text-sm text-white tracking-tight">CFO</span>
                <span className="font-light text-sm text-zinc-400 tracking-tight">Pilot</span>
              </div>
              {tenantName && (
                <div className="truncate text-[10px] text-zinc-500 -mt-0.5" title={tenantName}>{tenantName}</div>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn("ml-auto p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-white/5 transition", collapsed && "mx-auto ml-0")}
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* ─── NAV ─── */}
      <nav className="relative flex-1 overflow-y-auto py-3 px-2 space-y-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-track]:bg-transparent">

        {/* HERO — AI Copilot — always glows */}
        {HERO_NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link key={href} href={href} title={collapsed ? label : undefined}
              className={cn(
                "group relative flex items-center gap-3 px-3 h-11 rounded-xl mb-2 text-xs font-semibold transition-all",
                collapsed && "justify-center px-0",
                active
                  ? "bg-gradient-to-r from-violet-500/20 via-fuchsia-500/15 to-transparent text-white ring-1 ring-violet-400/30 shadow-lg shadow-violet-500/10"
                  : "text-zinc-100 hover:bg-white/[0.04] bg-gradient-to-r from-violet-500/[0.06] to-transparent"
              )}>
              {/* Icon with gradient bg */}
              <span className={cn(
                "relative shrink-0 w-7 h-7 rounded-lg flex items-center justify-center",
                "bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-md shadow-violet-500/30"
              )}>
                <Icon className="w-3.5 h-3.5 text-white" strokeWidth={2.2} />
              </span>
              {!collapsed && (
                <>
                  <span className="truncate">{label}</span>
                  <span className="ml-auto text-[9px] uppercase tracking-widest text-violet-300/70 font-bold">AI</span>
                </>
              )}
              {/* Left edge accent when active */}
              {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-7 rounded-r-full bg-gradient-to-b from-violet-400 to-fuchsia-400" />}
            </Link>
          );
        })}

        {/* INSIGHTS */}
        <Section label="Insights" accent="insights" collapsed={collapsed} />
        {INSIGHTS_NAV.map(item => <NavItem key={item.href} item={item} accent="insights" collapsed={collapsed} active={isActive(item.href)} />)}

        {/* PLANNING & MODELING */}
        <Section label="Planning & Modeling" accent="planning" collapsed={collapsed} />
        {PLANNING_NAV.map(item => <NavItem key={item.href} item={item} accent="planning" collapsed={collapsed} active={isActive(item.href)} />)}

        {/* Divider between modeling-side and data-side */}
        <div className="my-3 mx-2 border-t border-white/5" />

        {/* METADATA */}
        <Section label="Metadata" accent="data" collapsed={collapsed} />
        {META_NAV_CORE.map(item => <NavItem key={item.href} item={item} accent="data" collapsed={collapsed} active={isActive(item.href)} />)}

        {/* User Dimensions (dynamic) */}
        {userDims.length > 0 && (
          <>
            <Section label="User Dimensions" accent="data" collapsed={collapsed} />
            {userDims.map(({ id, name }) => {
              const href = `/metadata/dimensions/${id}`;
              const active = isActive(href);
              return <NavItem key={id} item={{ href, label: name, icon: Layers }} accent="data" collapsed={collapsed} active={active} />;
            })}
          </>
        )}

        {/* DATA LOAD */}
        <Section label="Data Load" accent="data" collapsed={collapsed} />
        {DATA_LOAD_NAV.map(item => <NavItem key={item.href} item={item} accent="data" collapsed={collapsed} active={isActive(item.href)} />)}

        {/* PROCESS */}
        <Section label="Process" accent="process" collapsed={collapsed} />
        {PROCESS_NAV.map(item => <NavItem key={item.href} item={item} accent="process" collapsed={collapsed} active={isActive(item.href)} />)}

        {/* REPORTS */}
        <Section label="Reports" accent="reports" collapsed={collapsed} />
        {REPORTS_NAV.map(item => <NavItem key={item.href} item={item} accent="reports" collapsed={collapsed} active={isActive(item.href)} />)}

        {/* META BOTTOM (admin) */}
        <div className="my-3 mx-2 border-t border-white/5" />
        {META_NAV_BOTTOM.map(item => <NavItem key={item.href} item={item} accent="data" collapsed={collapsed} active={isActive(item.href)} compact />)}
      </nav>

      {/* ─── FOOTER ─── */}
      <div className={cn(
        "relative border-t border-white/5 backdrop-blur-md bg-slate-950/60 py-2 px-2 shrink-0"
      )}>
        <NavItem item={{ href: "#notifications", label: "Notifications", icon: Bell }} accent="data" collapsed={collapsed} active={false} compact />
        <NavItem item={{ href: "/metadata/settings", label: "Settings", icon: Settings }} accent="data" collapsed={collapsed} active={isActive("/metadata/settings")} compact />

        {/* Sign out */}
        <Link href="/api/auth/logout"
          title={collapsed ? "Sign out" : undefined}
          className={cn(
            "flex items-center gap-3 w-full px-3 h-9 rounded-md text-xs font-medium transition text-zinc-500 hover:text-rose-300 hover:bg-rose-500/10",
            collapsed && "justify-center px-0"
          )}>
          <LogOut className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          {!collapsed && "Sign out"}
        </Link>

        {/* User identity card */}
        {!collapsed && (
          <div className="flex items-center gap-2.5 px-2 py-2 mt-1 rounded-lg hover:bg-white/[0.04] cursor-pointer transition group">
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 via-fuchsia-400 to-amber-300 p-[1.5px]">
                <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center">
                  <span className="text-white font-bold text-[11px]">{userName.slice(0, 2).toUpperCase()}</span>
                </div>
              </div>
              {/* Online indicator */}
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{userName}</p>
              <p className="text-[10px] text-zinc-500 truncate uppercase tracking-wider">{userRole}</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Section header — colored dot + uppercase tracked text ─────
function Section({ label, accent, collapsed }: { label: string; accent: AccentKey; collapsed: boolean }) {
  // Tailwind JIT-safe color map (no interpolation)
  const collapsedBar: Record<AccentKey, string> = {
    hero:     "bg-violet-400/20",
    insights: "bg-sky-400/20",
    planning: "bg-emerald-400/20",
    data:     "bg-zinc-400/15",
    process:  "bg-amber-400/20",
    reports:  "bg-rose-400/20",
  };
  if (collapsed) {
    return <div className={cn("my-2 mx-3 h-px", collapsedBar[accent])} />;
  }
  return (
    <p className="px-3 mt-4 mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500 flex items-center gap-1.5">
      <span className={cn("w-1 h-1 rounded-full", ACCENTS[accent].dot)} />
      {label}
    </p>
  );
}

// ─── Single nav row — accent-colored when active ─────────────
function NavItem({
  item, accent, collapsed, active, compact,
}: {
  item: Item; accent: AccentKey; collapsed: boolean; active: boolean; compact?: boolean;
}) {
  const a = ACCENTS[accent];
  const Icon = item.icon;
  return (
    <Link href={item.href} title={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex items-center gap-3 px-3 rounded-lg mb-px text-xs font-medium transition-all",
        compact ? "h-8" : "h-9",
        collapsed && "justify-center px-0",
        active
          ? cn(
              "bg-gradient-to-r text-white ring-1 ring-white/10",
              accent === "hero" ? "from-violet-500/20 to-transparent" :
              accent === "insights" ? "from-sky-500/15 to-transparent" :
              accent === "planning" ? "from-emerald-500/15 to-transparent" :
              accent === "process" ? "from-amber-500/15 to-transparent" :
              accent === "reports" ? "from-rose-500/15 to-transparent" :
              "from-zinc-500/10 to-transparent"
            )
          : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
      )}>
      {/* Left edge accent when active */}
      {active && (
        <span className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full",
          accent === "insights" ? "bg-sky-400" :
          accent === "planning" ? "bg-emerald-400" :
          accent === "process"  ? "bg-amber-400"  :
          accent === "reports"  ? "bg-rose-400"   :
          accent === "hero"     ? "bg-violet-400" :
          "bg-zinc-400"
        )} />
      )}
      <Icon className={cn(
        "w-4 h-4 shrink-0 transition",
        active ? (
          accent === "insights" ? "text-sky-300" :
          accent === "planning" ? "text-emerald-300" :
          accent === "process"  ? "text-amber-300" :
          accent === "reports"  ? "text-rose-300" :
          accent === "hero"     ? "text-violet-300" :
          "text-zinc-300"
        ) : "text-zinc-500 group-hover:text-zinc-300"
      )} strokeWidth={active ? 2 : 1.75} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}
