"use client";

import { useState } from "react";
import { Search, Bell, Plus, Download, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetadataHeaderProps {
  title: string;
  subtitle?: string;
  onAdd?: () => void;
  onExport?: () => void;
  onRefresh?: () => void;
  addLabel?: string;
  showSearch?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  actions?: React.ReactNode;
}

export function MetadataHeader({
  title,
  subtitle,
  onAdd,
  onExport,
  onRefresh,
  addLabel = "Add New",
  showSearch = true,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  actions,
}: MetadataHeaderProps) {
  const [notifications] = useState(2);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-white px-6">
      {/* Title */}
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-2">
        {/* Search */}
        {showSearch && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="h-8 rounded-md border border-input bg-muted/30 pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary/20 w-52"
            />
          </div>
        )}

        {/* Custom actions */}
        {actions}

        {/* Refresh */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-input text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Export */}
        {onExport && (
          <button
            onClick={onExport}
            className="flex h-8 items-center gap-1.5 rounded-md border border-input px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        )}

        {/* Add */}
        {onAdd && (
          <button
            onClick={onAdd}
            className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {addLabel}
          </button>
        )}

        {/* Notifications */}
        <button className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Bell className="h-4 w-4" />
          {notifications > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-2 w-2 items-center justify-center rounded-full bg-red-500" />
          )}
        </button>
      </div>
    </header>
  );
}
