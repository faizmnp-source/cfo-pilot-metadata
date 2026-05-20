"use client";

import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ValidationError {
  id?: string;
  row?: number;
  field?: string;
  dimension?: string;
  code?: string;
  message: string;
  severity: "error" | "warning" | "info";
  fixable?: boolean;
  suggestedFix?: string;
  category?: string;
}

interface ValidationReportProps {
  errors: ValidationError[];
  title?: string;
  onApplyFix?: (error: ValidationError) => void;
  onDismiss?: (error: ValidationError) => void;
  className?: string;
}

const SEVERITY_CONFIG = {
  error: {
    icon: AlertCircle,
    color: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
    badge: "bg-red-100 text-red-700",
    label: "Error",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    label: "Warning",
  },
  info: {
    icon: Info,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
    badge: "bg-blue-100 text-blue-700",
    label: "Info",
  },
};

type SeverityFilter = "all" | "error" | "warning" | "info";

function ErrorRow({
  error,
  onApplyFix,
  onDismiss,
}: {
  error: ValidationError;
  onApplyFix?: (e: ValidationError) => void;
  onDismiss?: (e: ValidationError) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = SEVERITY_CONFIG[error.severity];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        config.border,
        config.bg
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-4 w-4 flex-shrink-0", config.color)} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                config.badge
              )}
            >
              {config.label}
            </span>
            {error.category && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {error.category}
              </span>
            )}
            {error.row !== undefined && (
              <span className="text-xs text-muted-foreground">Row {error.row}</span>
            )}
            {error.field && (
              <code className="rounded bg-muted px-1 text-[10px] font-mono text-foreground">
                {error.field}
              </code>
            )}
            {error.dimension && (
              <span className="text-xs text-muted-foreground">{error.dimension}</span>
            )}
            {error.code && (
              <code className="rounded bg-muted px-1 text-[10px] font-mono text-muted-foreground">
                {error.code}
              </code>
            )}
          </div>

          <p className="mt-1 text-sm text-foreground">{error.message}</p>

          {/* Suggested fix */}
          {error.suggestedFix && (
            <div>
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-1.5 flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Sparkles className="h-3 w-3" />
                AI suggested fix
                {expanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
              {expanded && (
                <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 p-2.5">
                  <p className="text-xs text-blue-800">{error.suggestedFix}</p>
                  {error.fixable && onApplyFix && (
                    <button
                      onClick={() => onApplyFix(error)}
                      className="mt-2 flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700 transition-colors"
                    >
                      <Sparkles className="h-3 w-3" />
                      Apply Fix
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dismiss */}
        {onDismiss && (
          <button
            onClick={() => onDismiss(error)}
            className="flex-shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

export function ValidationReport({
  errors,
  title = "Validation Report",
  onApplyFix,
  onDismiss,
  className,
}: ValidationReportProps) {
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const errorCount = errors.filter((e) => e.severity === "error").length;
  const warningCount = errors.filter((e) => e.severity === "warning").length;
  const infoCount = errors.filter((e) => e.severity === "info").length;
  const fixableCount = errors.filter((e) => e.fixable).length;

  const categories = Array.from(
    new Set(errors.map((e) => e.category).filter(Boolean))
  ) as string[];

  const filtered = errors.filter((e) => {
    if (filter !== "all" && e.severity !== filter) return false;
    if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
    return true;
  });

  if (errors.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-10 text-center",
          className
        )}
      >
        <CheckCircle2 className="h-10 w-10 text-green-500" />
        <p className="font-medium text-green-800">All Clear!</p>
        <p className="text-sm text-green-600">No validation issues found.</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Header + summary */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {fixableCount > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
            <Sparkles className="h-3 w-3" />
            {fixableCount} auto-fixable
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {errorCount > 0 && (
          <button
            onClick={() => setFilter(filter === "error" ? "all" : "error")}
            className={cn(
              "rounded-lg border p-2.5 text-center transition-colors",
              filter === "error"
                ? "border-red-400 bg-red-50"
                : "border-red-200 bg-red-50/50 hover:bg-red-50"
            )}
          >
            <p className="text-lg font-bold text-red-700">{errorCount}</p>
            <p className="text-xs text-red-600">Errors</p>
          </button>
        )}
        {warningCount > 0 && (
          <button
            onClick={() => setFilter(filter === "warning" ? "all" : "warning")}
            className={cn(
              "rounded-lg border p-2.5 text-center transition-colors",
              filter === "warning"
                ? "border-amber-400 bg-amber-50"
                : "border-amber-200 bg-amber-50/50 hover:bg-amber-50"
            )}
          >
            <p className="text-lg font-bold text-amber-700">{warningCount}</p>
            <p className="text-xs text-amber-600">Warnings</p>
          </button>
        )}
        {infoCount > 0 && (
          <button
            onClick={() => setFilter(filter === "info" ? "all" : "info")}
            className={cn(
              "rounded-lg border p-2.5 text-center transition-colors",
              filter === "info"
                ? "border-blue-400 bg-blue-50"
                : "border-blue-200 bg-blue-50/50 hover:bg-blue-50"
            )}
          >
            <p className="text-lg font-bold text-blue-700">{infoCount}</p>
            <p className="text-xs text-blue-600">Info</p>
          </button>
        )}
      </div>

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <button
            onClick={() => setCategoryFilter("all")}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs transition-colors",
              categoryFilter === "all"
                ? "bg-primary text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(categoryFilter === cat ? "all" : cat)}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs transition-colors",
                categoryFilter === cat
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Error list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No issues match the current filter
          </p>
        ) : (
          filtered.map((err, i) => (
            <ErrorRow
              key={err.id ?? i}
              error={err}
              onApplyFix={onApplyFix}
              onDismiss={onDismiss}
            />
          ))
        )}
      </div>
    </div>
  );
}
