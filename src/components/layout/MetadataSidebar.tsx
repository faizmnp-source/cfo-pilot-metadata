"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  Building2,
  GitBranch,
  DollarSign,
  Upload,
  ShieldCheck,
  ScrollText,
  ChevronLeft,
  ChevronRight,
  Database,
  LogOut,
  Settings,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Dashboard",
    href: "/metadata",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "Accounts",
    href: "/metadata/accounts",
    icon: BookOpen,
  },
  {
    label: "Entities",
    href: "/metadata/entities",
    icon: Building2,
  },
  {
    label: "Departments",
    href: "/metadata/departments",
    icon: GitBranch,
  },
  {
    label: "Cost Centers",
    href: "/metadata/cost-centers",
    icon: DollarSign,
  },
  {
    label: "Import",
    href: "/metadata/import",
    icon: Upload,
  },
  {
    label: "Validation",
    href: "/metadata/validation",
    icon: ShieldCheck,
  },
  {
    label: "Audit Logs",
    href: "/metadata/audit-logs",
    icon: ScrollText,
  },
];

interface MetadataSidebarProps {
  userRole?: string;
  userName?: string;
  tenantName?: string;
}

export function MetadataSidebar({
  userRole = "ADMIN",
  userName = "Finance Admin",
  tenantName = "CFO Pilot",
}: MetadataSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const roleColors: Record<string, string> = {
    ADMIN: "bg-purple-100 text-purple-700",
    FINANCE_MANAGER: "bg-blue-100 text-blue-700",
    FINANCE_USER: "bg-green-100 text-green-700",
    VIEWER: "bg-gray-100 text-gray-600",
  };

  return (
    <aside
      className={cn(
        "relative flex flex-col border-r border-border bg-white transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-border px-4">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-white">
            <Database className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {tenantName}
              </p>
              <p className="text-xs text-muted-foreground">Metadata Manager</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const active = isActive(item.href, item.exact);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User profile */}
      <div className="border-t border-border p-2">
        {!collapsed && (
          <div className="mb-2 rounded-md bg-muted/50 p-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/20">
                <User className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {userName}
                </p>
                <span
                  className={cn(
                    "inline-block rounded px-1 py-0.5 text-[10px] font-medium",
                    roleColors[userRole] ?? roleColors.VIEWER
                  )}
                >
                  {userRole.replace("_", " ")}
                </span>
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center gap-1">
          {!collapsed && (
            <>
              <Link
                href="/settings"
                className="flex flex-1 items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Settings className="h-3.5 w-3.5" />
                Settings
              </Link>
              <Link
                href="/api/auth/logout"
                className="flex items-center rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-red-50 hover:text-red-600"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Link>
            </>
          )}
          {collapsed && (
            <Link
              href="/api/auth/logout"
              title="Logout"
              className="flex w-full items-center justify-center rounded px-2 py-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-16 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-white text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </button>
    </aside>
  );
}
