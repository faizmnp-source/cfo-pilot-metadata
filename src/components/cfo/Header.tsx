"use client";
import { Search, Bell, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const periods = ["FY 2026 · Q2", "FY 2026 · Q1", "FY 2025 · Full Year", "Last 12 Months", "Custom Range"];

interface CFOHeaderProps { title: string; subtitle?: string; actions?: React.ReactNode; }

export function CFOHeader({ title, subtitle, actions }: CFOHeaderProps) {
  const [period, setPeriod] = useState("FY 2026 · Q2");
  const [showPeriod, setShowPeriod] = useState(false);

  return (
    <header className="h-14 flex items-center gap-4 px-6 bg-white/90 backdrop-blur-sm border-b border-[var(--border-default)] sticky top-0 z-30 shrink-0">
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold text-[var(--text-primary)] truncate">{title}</h1>
        {subtitle && <p className="text-xs text-[var(--text-tertiary)] truncate">{subtitle}</p>}
      </div>
      <div className="hidden lg:flex items-center gap-2 h-8 px-3 rounded-md bg-[var(--bg-surface-sunken)] border border-[var(--border-default)] text-[var(--text-tertiary)] w-52 cursor-text">
        <Search className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
        <span className="text-xs">Search…</span>
        <kbd className="ml-auto text-[10px] font-medium bg-white border border-[var(--border-default)] px-1 rounded text-[var(--text-tertiary)]">⌘K</kbd>
      </div>
      <div className="relative">
        <button onClick={() => setShowPeriod(!showPeriod)}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--bg-surface-sunken)] transition-colors">
          {period}<ChevronDown className="w-3 h-3 text-[var(--text-tertiary)]" />
        </button>
        {showPeriod && (
          <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg border border-[var(--border-default)] shadow-lg z-50 py-1">
            {periods.map((p) => (
              <button key={p} onClick={() => { setPeriod(p); setShowPeriod(false); }}
                className={cn("w-full text-left px-3 py-2 text-xs hover:bg-[var(--bg-surface-sunken)] transition-colors", p === period ? "text-[var(--color-brand-600)] font-medium" : "text-[var(--text-primary)]")}>
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
      {actions}
      <button className="relative w-8 h-8 flex items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-surface-sunken)] transition-colors">
        <Bell className="w-4 h-4" strokeWidth={1.5} />
        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--color-danger-500)] border-2 border-white" />
      </button>
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center cursor-pointer shrink-0">
        <span className="text-white font-semibold text-xs">FA</span>
      </div>
    </header>
  );
}
