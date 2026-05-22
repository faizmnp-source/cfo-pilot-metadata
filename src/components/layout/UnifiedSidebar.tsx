"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, CalendarCheck, PieChart, TrendingUp, Users, Kanban,
  FileText, Table2, Sparkles, Bell, Settings, ChevronLeft, ChevronRight,
  Navigation, BookOpen, Building2, GitBranch, Layers, Upload, ShieldCheck,
  History, LogOut, DollarSign, Globe, Clock, Link2, FolderKanban, Settings2,
  Pencil,
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

// Metadata v2 (agreed 2026-05-21):
//   always-on (5):     Account · Entity · Scenario · Time · Currency
//   toggleable (1):    ICP                  (intercompany_enabled)
//   optional core (3): Department · Cost Center · Project
//   customer-defined:  UD1–UD8
// Only the always-on 5 + tools render by default. Optional items appear when
// their feature flag is on, configured in Settings → Features.
// Per-dim deep-link nav was removed — dims are picked via the dropdown on
// /metadata/library (OneStream/EPBCS pattern). Keep just Overview + Library.
const META_NAV_CORE = [
  { href: "/metadata",         label: "Overview",          icon: Layers },
  { href: "/metadata/library", label: "Dimension Library", icon: BookOpen },
  { href: "/data/forms",       label: "Data Forms",        icon: FolderKanban },
  { href: "/data/input",       label: "Data Input",        icon: Pencil },
];

const META_NAV_BOTTOM = [
  { href: "/metadata/import",      label: "Import Wizard",        icon: Upload },
  { href: "/metadata/validation",  label: "Validation",           icon: ShieldCheck },
  { href: "/metadata/audit-logs",  label: "Audit Logs",           icon: History },
  { href: "/metadata/dimensions",  label: "Configure Dimensions", icon: Settings2 },
  { href: "/metadata/settings",    label: "App Settings",         icon: Settings },
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
      .then((r) => r.json())
      .then((data) => {
        const dims = Array.isArray(data) ? data : (data.data ?? []);
        setUserDims(dims.filter((d: any) => d.isActive && d.name));
      })
      .catch(() => {});

    // Resolve the active tenant's display name so users can tell which
    // tenant they're in (helpful when one operator manages several).
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const name = d?.data?.tenant?.name ?? d?.data?.tenantName ?? d?.tenant?.name;
        if (name) setTenantName(name);
        else if (d?.data?.tenantId) {
          // Fallback — fetch tenant by id if /me didn't include the name
          fetch(`/api/v2/tenant-features`, { credentials: "include" })
            .catch(() => null); // keep it best-effort
        }
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
            <div className="min-w-0">
              <div className="flex items-baseline gap-1">
                <span className="font-semibold text-sm text-[var(--text-primary)] tracking-tight">CFO</span>
                <span className="font-light text-sm text-[var(--text-secondary)] tracking-tight">Pilot</span>
              </div>
              {tenantName && (
                <div className="truncate text-[10px] text-[var(--text-tertiary)] -mt-0.5" title={tenantName}>
                  {tenantName}
                </div>
              )}
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
                  <Layers className={cn("w-4 h-4 shrink-0", active ? "text-[var(--color-brand-500)]" : "text-[var(--text-tertiary)]")} strokeWidth={active ? 2 : 1.5} />
                  {!collapsed && <span className="truncate">{name}</span>}
                </Link>
              );
            })}
          </>
        )}

        {/* Bottom meta nav */}
        <div className={cn("my-2 border-t border-[var(--border-default)]", collapsed && "mx-2")} />
        {META_NAV_BOTTOM.map(({ href, label, icon: Icon }) => {
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
      </nav>

      {/* Footer */}
      <div className={cn("border-t border-[var(--border-default)] py-2 px-2 shrink-0")}>
        {[
          { icon: Sparkles, label: "AI Copilot",     color: "text-[var(--color-ai-500)]" },
          { icon: Bell,     label: "Notifications",  color: "" },
          { icon: Settings, label: "Settings",       color: "" },
        ].map(({ icon: Icon, label, color }) => (
          <button key={label} title={collapsed ? label : undefined}
            className={cn("flex items-center gap-3 w-full px-3 h-9 rounded-md text-xs font-medium transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-sunken)]", collapsed && "justify-center px-0")}>
            <Icon className={cn("w-4 h-4 shrink-0", color || "text-[var(--text-tertiary)]")} strokeWidth={1.5} />
            {!collapsed && label}
          </button>
        ))}
        <Link href="/api/auth/logout"
          title={collapsed ? "Sign out" : undefined}
          className={cn("flex items-center gap-3 w-full px-3 h-9 rounded-md text-xs font-medium transition-colors text-[var(--text-secondary)] hover:text-red-600 hover:bg-red-50", collapsed && "justify-center px-0")}>
          <LogOut className="w-4 h-4 shrink-0 text-[var(--text-tertiary)]" strokeWidth={1.5} />
          {!collapsed && "Sign out"}
        </Link>

        {!collapsed && (
          <div className="flex items-center gap-2.5 px-3 py-2 mt-1 rounded-md hover:bg-[var(--bg-surface-sunken)] cursor-pointer">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center shrink-0">
              <span className="text-white font-semibold text-xs">{userName.slice(0, 2).toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[var(--text-primary)] truncate">{userName}</p>
              <p className="text-[10px] text-[var(--text-tertiary)] truncate">{userRole}</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
