"use client";

// CFO Pilot Sidebar — Atelier theme (cream paper, ink, oxblood, Newsreader).
// Single editorial nav with foliation column (01/02/03…).

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, CalendarCheck, PieChart, TrendingUp, Users, Kanban,
  FileText, Sparkles, Bell, Settings, ChevronLeft, ChevronRight,
  BookOpen, GitBranch, Layers, Upload, ShieldCheck,
  History, LogOut, DollarSign, FolderKanban, Settings2,
  Pencil, FileSpreadsheet, Cpu, Receipt, Scale, TrendingDown, Rocket,
  Zap, Clock, Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

type Item = { href: string; label: string; icon: any };

const HERO_NAV: Item[] = [
  { href: "/copilot",       label: "AI Copilot",          icon: Sparkles },
];
const INSIGHTS_NAV: Item[] = [
  { href: "/dashboard",     label: "Executive Brief",     icon: LayoutDashboard },
  { href: "/growth",        label: "Growth Engine",       icon: Rocket },
  { href: "/monthly-close", label: "Monthly Close",       icon: CalendarCheck },
];
const PLANNING_NAV: Item[] = [
  { href: "/workforce",     label: "Workforce Planning",  icon: Users },
  { href: "/forecasting",   label: "Forecasting",         icon: TrendingUp },
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
  { href: "/reporting",                label: "Board Pack",          icon: Sparkles },
];
const META_NAV_BOTTOM: Item[] = [
  { href: "/metadata/import",      label: "Import Wizard",        icon: Upload },
  { href: "/metadata/validation",  label: "Validation",           icon: ShieldCheck },
  { href: "/metadata/audit-logs",  label: "Audit Logs",           icon: History },
  { href: "/metadata/dimensions",  label: "Configure Dimensions", icon: Settings2 },
];

interface UnifiedSidebarProps { userName?: string; userRole?: string }

export function UnifiedSidebar({ userName = "Faizan", userRole = "CFO" }: UnifiedSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [tenantName, setTenantName] = useState<string>("");

  useEffect(() => {
    fetch("/api/v2/tenant", { credentials: "include" })
      .then(r => r.json()).then(j => { if (j?.data?.name) setTenantName(j.data.name); })
      .catch(() => {});
  }, []);

  const isActive = (href: string) =>
    href === "/metadata" ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className={cn(
      "flex flex-col h-full shrink-0 overflow-hidden border-r transition-all duration-200",
      collapsed ? "w-16" : "w-[232px]"
    )} style={{ background: "var(--paper-2, #ede5d2)", borderColor: "var(--rule, #d9cfb8)", color: "var(--ink, #1a1612)", fontFamily: "var(--font-sans, Inter, sans-serif)" }}>

      {/* MASTHEAD */}
      <div className="flex items-baseline gap-2 px-6 py-6 border-b" style={{ borderColor: "var(--rule)" }}>
        <span className="atelier-serif italic font-semibold" style={{ fontSize: 28, color: "var(--ink)", lineHeight: 1 }}>CFO</span>
        {!collapsed && <span className="atelier-eyebrow">Pilot</span>}
        <button onClick={() => setCollapsed(!collapsed)} className="ml-auto p-1 hover:opacity-60">
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>
      {!collapsed && tenantName && (
        <div className="px-6 py-2 text-[10px] italic" style={{ fontFamily: "var(--font-serif)", color: "var(--ink-3)" }} title={tenantName}>
          {tenantName}
        </div>
      )}

      {/* NAV */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-stone-300/40 [&::-webkit-scrollbar-track]:bg-transparent">
        {/* Hero AI Copilot — single underlined oxblood row */}
        {HERO_NAV.map((item, i) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined}
              className={cn("flex items-center gap-2.5 px-3 h-9 mb-2 transition-all", collapsed && "justify-center px-0",
                active ? "" : "hover:bg-black/5")}
              style={{ background: active ? "var(--ink)" : "transparent", color: active ? "var(--paper)" : "var(--accent)" }}>
              <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={active ? 2 : 1.5} />
              {!collapsed && (
                <>
                  <span className="atelier-serif italic" style={{ fontSize: 14, fontWeight: 600 }}>{item.label}</span>
                  <span className="ml-auto font-mono text-[10px] opacity-60">00</span>
                </>
              )}
            </Link>
          );
        })}

        <SectionLabel collapsed={collapsed} label="Insights" />
        {INSIGHTS_NAV.map((item, i) => <Row key={item.href} item={item} num={i+1} active={isActive(item.href)} collapsed={collapsed} />)}

        <SectionLabel collapsed={collapsed} label="Planning &amp; Modeling" />
        {PLANNING_NAV.map((item, i) => <Row key={item.href} item={item} num={INSIGHTS_NAV.length+i+1} active={isActive(item.href)} collapsed={collapsed} />)}

        <Divider collapsed={collapsed} />

        <SectionLabel collapsed={collapsed} label="Metadata" />
        {META_NAV_CORE.map((item, i) => <Row key={item.href} item={item} num={INSIGHTS_NAV.length+PLANNING_NAV.length+i+1} active={isActive(item.href)} collapsed={collapsed} />)}

        <SectionLabel collapsed={collapsed} label="Data Load" />
        {DATA_LOAD_NAV.map((item, i) => <Row key={item.href} item={item} num={i+1} active={isActive(item.href)} collapsed={collapsed} compact />)}

        <SectionLabel collapsed={collapsed} label="Process" />
        {PROCESS_NAV.map((item, i) => <Row key={item.href} item={item} num={i+1} active={isActive(item.href)} collapsed={collapsed} compact />)}

        <SectionLabel collapsed={collapsed} label="Reports" />
        {REPORTS_NAV.map((item, i) => <Row key={item.href} item={item} num={i+1} active={isActive(item.href)} collapsed={collapsed} compact />)}

        <Divider collapsed={collapsed} />
        {META_NAV_BOTTOM.map(item => <Row key={item.href} item={item} num={0} active={isActive(item.href)} collapsed={collapsed} compact noNum />)}
      </nav>

      {/* PULL QUOTE FOOTER */}
      {!collapsed && (
        <div className="px-6 py-4 border-t" style={{ borderColor: "var(--rule)" }}>
          <p className="italic atelier-serif" style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.4 }}>
            "The numbers tell you what — <span style={{ color: "var(--accent)" }}>Lyra tells you why.</span>"
          </p>
        </div>
      )}

      {/* SIGN OUT + USER */}
      <div className="border-t" style={{ borderColor: "var(--rule)" }}>
        <Row item={{ href: "#notifications", label: "Notifications", icon: Bell }} num={0} active={false} collapsed={collapsed} compact noNum />
        <Row item={{ href: "/metadata/settings", label: "Settings", icon: Settings }} num={0} active={isActive("/metadata/settings")} collapsed={collapsed} compact noNum />
        <Link href="/api/auth/logout" title={collapsed ? "Sign out" : undefined}
          className={cn("flex items-center gap-2.5 px-3 h-9 text-xs hover:text-rose-700 hover:bg-rose-50/40 transition", collapsed && "justify-center px-0")}
          style={{ color: "var(--ink-3)" }}>
          <LogOut className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
          {!collapsed && <span className="atelier-serif" style={{ fontSize: 13 }}>Sign out</span>}
        </Link>

        {!collapsed && (
          <div className="flex items-center gap-2 px-4 py-3 hover:bg-black/5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center atelier-serif italic" style={{ border: "1.5px solid var(--ink)", color: "var(--ink)", fontSize: 12, fontWeight: 600 }}>
              {userName.slice(0,1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="atelier-serif" style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{userName}</p>
              <p className="atelier-eyebrow" style={{ fontSize: 9 }}>{userRole}</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function SectionLabel({ collapsed, label }: { collapsed: boolean; label: string }) {
  if (collapsed) return <div className="my-2 mx-2 h-px" style={{ background: "var(--rule)" }} />;
  return (
    <p className="px-3 pt-4 pb-1 atelier-eyebrow" style={{ fontSize: 9, letterSpacing: "0.22em" }} dangerouslySetInnerHTML={{ __html: label }} />
  );
}

function Divider({ collapsed }: { collapsed: boolean }) {
  return <div className={cn("my-2 h-px", collapsed && "mx-2")} style={{ background: "var(--rule)" }} />;
}

function Row({ item, num, active, collapsed, compact, noNum }: { item: Item; num: number; active: boolean; collapsed: boolean; compact?: boolean; noNum?: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} title={collapsed ? item.label : undefined}
      className={cn("flex items-center gap-2.5 px-3 transition-all", compact ? "h-8" : "h-9", collapsed && "justify-center px-0",
        active ? "" : "hover:bg-black/5")}
      style={{ background: active ? "var(--ink)" : "transparent", color: active ? "var(--paper)" : "var(--ink-2)" }}>
      <Icon className="w-3.5 h-3.5 shrink-0 opacity-70" strokeWidth={active ? 2 : 1.5} />
      {!collapsed && (
        <>
          <span className="atelier-serif" style={{ fontSize: compact ? 12.5 : 13.5, fontWeight: active ? 600 : 500 }}>{item.label}</span>
          {!noNum && <span className="ml-auto font-mono text-[10px]" style={{ color: active ? "var(--paper)" : "var(--ink-4, #a89d87)", opacity: active ? 0.6 : 1 }}>{String(num).padStart(2,"0")}</span>}
        </>
      )}
    </Link>
  );
}
