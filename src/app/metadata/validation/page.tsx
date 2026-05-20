"use client";

import { useState } from "react";
import {
  ShieldCheck, AlertTriangle, AlertCircle, Info, CheckCircle2,
  Wrench, RefreshCw, ChevronDown, ChevronRight, X, Sparkles, Download,
} from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ValidationIssue {
  id: string;
  rowIndex: number;
  severity: "error" | "warning" | "info";
  dimension: string;
  code?: string;
  field?: string;
  message: string;
  category: string;
  fixable: boolean;
  fixSuggestion?: string;
  fixAction?: string;
  fixed?: boolean;
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const INITIAL_ISSUES: ValidationIssue[] = [
  {
    id: "v1", rowIndex: 3, severity: "error", dimension: "ACCOUNT", code: "1100", field: "parentId",
    message: "Parent account '9999' does not exist in the system or import file",
    category: "Missing Reference", fixable: true, fixed: false,
    fixSuggestion: "Remove the parent reference or create account 9999 first. Alternatively, set this account as a root-level account.",
    fixAction: "remove_parent",
  },
  {
    id: "v2", rowIndex: 7, severity: "warning", dimension: "DEPARTMENT", code: "DEPT-A1", field: "name",
    message: "Department name 'Finance' appears 3 times with different codes (DEPT-A1, DEPT-B3, DEPT-C7)",
    category: "Duplicate Name", fixable: true, fixed: false,
    fixSuggestion: "Add a qualifier to distinguish records: 'Finance - Group HQ', 'Finance - Region A', 'Finance - Region B'",
    fixAction: "rename_name",
  },
  {
    id: "v3", rowIndex: 12, severity: "error", dimension: "ACCOUNT", code: "5200", field: "parentId",
    message: "Circular hierarchy detected: 5200 → 5100 → 5000 → 5200",
    category: "Circular Hierarchy", fixable: false, fixed: false,
    fixSuggestion: "Break the cycle by removing the parent link from account 5200. Restructure the hierarchy manually.",
    fixAction: "manual",
  },
  {
    id: "v4", rowIndex: 1, severity: "error", dimension: "ACCOUNT", code: "REV-001", field: "accountType",
    message: "Account type 'INCOME' is invalid. Must be one of: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE",
    category: "Invalid Field Value", fixable: true, fixed: false,
    fixSuggestion: "Change accountType to 'REVENUE' which is the correct classification for income accounts.",
    fixAction: "set_default_type",
  },
  {
    id: "v5", rowIndex: 9, severity: "warning", dimension: "COST_CENTER", code: "CC-101",
    message: "Cost center code 'CC-101' already exists in the database — this import will overwrite it",
    category: "Existing Record", fixable: true, fixed: false,
    fixSuggestion: "Rename to 'CC-101-NEW' if this is a new cost center, or proceed to overwrite the existing one.",
    fixAction: "rename_code",
  },
  {
    id: "v6", rowIndex: 5, severity: "error", dimension: "ENTITY", code: "ENT-005", field: "ownershipPercentage",
    message: "Ownership percentage 120 is invalid. Must be between 0 and 100.",
    category: "Invalid Field Value", fixable: true, fixed: false,
    fixSuggestion: "Set ownershipPercentage to 100 for a fully owned subsidiary, or correct to the actual ownership stake.",
    fixAction: "set_default_type",
  },
  {
    id: "v7", rowIndex: 14, severity: "info", dimension: "DEPARTMENT", code: "DEPT-PHARMA",
    message: "Department name 'Pharmaceutical Services' is very similar to existing 'Pharmacy Services' (95% match)",
    category: "Fuzzy Duplicate", fixable: true, fixed: false,
    fixSuggestion: "Confirm this is intentionally different from 'Pharmacy Services', or merge with the existing record.",
    fixAction: "rename_name",
  },
  {
    id: "v8", rowIndex: 2, severity: "warning", dimension: "SCENARIO", code: "FY26-BUDGET", field: "fiscalYear",
    message: "Scenario fiscal year 1999 is outside the valid range (2000–2099)",
    category: "Invalid Field Value", fixable: true, fixed: false,
    fixSuggestion: "Update fiscalYear to 2026 for this FY2026 Budget scenario.",
    fixAction: "set_default_type",
  },
  {
    id: "v9", rowIndex: 6, severity: "error", dimension: "CURRENCY", code: "usd", field: "code",
    message: "Currency code 'usd' must be exactly 3 uppercase letters (ISO 4217 format)",
    category: "Invalid Field Value", fixable: true, fixed: false,
    fixSuggestion: "Change the currency code to 'USD' (uppercase). ISO 4217 codes are always uppercase.",
    fixAction: "set_default_type",
  },
  {
    id: "v10", rowIndex: 11, severity: "warning", dimension: "DOCTOR_CATEGORY", code: "DR-CARD",
    message: "Doctor category code 'DR-CARD' has a missing specialty field — billable rate defaults may not apply correctly",
    category: "Missing Reference", fixable: true, fixed: false,
    fixSuggestion: "Add the specialty field (e.g. 'Cardiology') to ensure correct billing rate assignment.",
    fixAction: "manual",
  },
];

// ─── Constants ───────────────────────────────────────────────────────────────

const SEVERITY_CFG = {
  error:   { icon: AlertCircle,   label: "Error",   outerBg: "bg-red-50",    border: "border-red-200",    iconCls: "text-red-600",    badge: "bg-red-100 text-red-700"     },
  warning: { icon: AlertTriangle, label: "Warning", outerBg: "bg-amber-50",  border: "border-amber-200",  iconCls: "text-amber-600",  badge: "bg-amber-100 text-amber-700"  },
  info:    { icon: Info,          label: "Info",    outerBg: "bg-blue-50",   border: "border-blue-200",   iconCls: "text-blue-600",   badge: "bg-blue-100 text-blue-700"   },
};

const DIM_LABELS: Record<string, string> = {
  ACCOUNT: "Accounts", ENTITY: "Entities", DEPARTMENT: "Departments", COST_CENTER: "Cost Centers",
  SCENARIO: "Scenarios", CURRENCY: "Currencies", TIME: "Time Periods",
  PRODUCT_SERVICE: "Products", EMPLOYEE_CATEGORY: "Employee Cat.", DOCTOR_CATEGORY: "Doctor Cat.",
};

const CATEGORIES = ["All", "Missing Reference", "Duplicate Name", "Circular Hierarchy",
  "Invalid Field Value", "Existing Record", "Fuzzy Duplicate"];

// ─── Issue card ───────────────────────────────────────────────────────────────

function IssueCard({ issue, onFix, onDismiss }: {
  issue: ValidationIssue;
  onFix: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const cfg = SEVERITY_CFG[issue.severity];
  const SIcon = cfg.icon;

  if (issue.fixed) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-green-200 bg-green-50">
        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
        <span className="text-xs text-green-700 flex-1 line-through opacity-60">{issue.message}</span>
        <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Fixed</span>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border transition-all", cfg.border, cfg.outerBg)}>
      <div className="flex items-start gap-3 px-4 py-3 cursor-pointer select-none" onClick={() => setOpen(!open)}>
        <SIcon className={cn("w-4 h-4 mt-0.5 shrink-0", cfg.iconCls)} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={cn("text-[10px] font-bold uppercase rounded-full px-2 py-0.5", cfg.badge)}>{cfg.label}</span>
            <span className="text-[10px] bg-white/80 border border-border rounded-full px-2 py-0.5 text-muted-foreground">{issue.category}</span>
            <span className="text-[10px] bg-white/80 border border-border rounded-full px-2 py-0.5 text-muted-foreground">{DIM_LABELS[issue.dimension] ?? issue.dimension}</span>
            {issue.code && <code className="text-[10px] font-mono text-foreground bg-white/80 border border-border rounded-full px-2 py-0.5">{issue.code}</code>}
            {issue.field && <span className="text-[10px] text-muted-foreground">→ <code className="font-mono">{issue.field}</code></span>}
          </div>
          <p className="text-xs text-foreground font-medium leading-snug">{issue.message}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {issue.fixable && issue.fixAction !== "manual" && (
            <button
              onClick={(e) => { e.stopPropagation(); onFix(issue.id); }}
              className="flex items-center gap-1 h-6 px-2.5 rounded-full text-[10px] font-semibold bg-white border border-border text-foreground hover:bg-primary hover:text-white hover:border-primary transition-all"
            >
              <Wrench className="w-3 h-3" /> Fix
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onDismiss(issue.id); }}
            className="h-6 w-6 flex items-center justify-center rounded-full text-muted-foreground hover:bg-white hover:text-foreground transition-colors">
            <X className="w-3 h-3" />
          </button>
          {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </div>

      {open && (
        <div className="mx-4 mb-3 mt-0 border-t border-white/60 pt-3">
          <div className="flex items-start gap-2.5 rounded-lg bg-white border border-violet-200 p-3">
            <Sparkles className="w-3.5 h-3.5 text-violet-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600 mb-1">AI Fix Suggestion</p>
              <p className="text-xs text-foreground leading-relaxed">{issue.fixSuggestion ?? "Review this record manually."}</p>
              <div className="flex items-center gap-3 mt-2 pt-2 border-t border-violet-100">
                <span className="text-[10px] text-muted-foreground">Row {issue.rowIndex + 1}</span>
                <span className="text-[10px] font-mono bg-muted rounded px-1.5 py-0.5 text-muted-foreground">{issue.fixAction ?? "manual"}</span>
                {!issue.fixable && <span className="text-[10px] text-amber-600 font-medium">⚠ Manual review required</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ValidationPage() {
  const [issues, setIssues] = useState<ValidationIssue[]>(INITIAL_ISSUES);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [dimensionFilter, setDimensionFilter] = useState("all");
  const [fixingAll, setFixingAll] = useState(false);

  const errors   = issues.filter(i => i.severity === "error"   && !i.fixed).length;
  const warnings = issues.filter(i => i.severity === "warning" && !i.fixed).length;
  const infos    = issues.filter(i => i.severity === "info"    && !i.fixed).length;
  const fixedCnt = issues.filter(i => i.fixed).length;
  const fixable  = issues.filter(i => !i.fixed && i.fixable && i.fixAction !== "manual").length;

  const visible = issues.filter(i => {
    if (severityFilter !== "all" && i.severity !== severityFilter) return false;
    if (categoryFilter !== "All" && i.category !== categoryFilter) return false;
    if (dimensionFilter !== "all" && i.dimension !== dimensionFilter) return false;
    return true;
  });

  const handleFix     = (id: string) => setIssues(p => p.map(i => i.id === id ? { ...i, fixed: true } : i));
  const handleDismiss = (id: string) => setIssues(p => p.filter(i => i.id !== id));
  const handleFixAll  = async () => {
    setFixingAll(true);
    await new Promise(r => setTimeout(r, 700));
    setIssues(p => p.map(i => (!i.fixed && i.fixable && i.fixAction !== "manual") ? { ...i, fixed: true } : i));
    setFixingAll(false);
  };

  const handleExport = () => {
    const rows = [
      ["Severity", "Dimension", "Code", "Field", "Message", "Category", "AI Suggestion", "Fix Action"],
      ...issues.map(i => [i.severity, i.dimension, i.code ?? "", i.field ?? "", i.message, i.category, i.fixSuggestion ?? "", i.fixAction ?? ""]),
    ];
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "validation-report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const uniqueDims = Array.from(new Set(issues.map(i => i.dimension)));

  return (
    <>
      <MetadataHeader
        title="Validation Center"
        subtitle="AI-powered data quality checks and one-click fix suggestions"
        showSearch={false}
        onExport={handleExport}
      />

      <main className="flex-1 overflow-y-auto bg-background p-6 space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Errors",   count: errors,   color: "text-red-600",    bg: "bg-red-50",    border: "border-red-200",    Icon: AlertCircle   },
            { label: "Warnings", count: warnings, color: "text-amber-600",  bg: "bg-amber-50",  border: "border-amber-200",  Icon: AlertTriangle },
            { label: "Info",     count: infos,    color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-200",   Icon: Info          },
            { label: "Resolved", count: fixedCnt, color: "text-green-600",  bg: "bg-green-50",  border: "border-green-200",  Icon: CheckCircle2  },
            { label: "Fixable",  count: fixable,  color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200", Icon: Sparkles      },
          ].map(({ label, count, color, bg, border, Icon }) => (
            <div key={label} className={cn("flex items-center gap-3 rounded-xl border px-4 py-3", bg, border)}>
              <Icon className={cn("w-5 h-5 shrink-0", color)} />
              <div>
                <p className="text-2xl font-bold tabular-nums text-foreground leading-none">{count}</p>
                <p className={cn("text-xs font-medium mt-0.5", color)}>{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-lg border border-border bg-muted/30 p-1 gap-0.5">
            {["all", "error", "warning", "info"].map(v => (
              <button key={v} onClick={() => setSeverityFilter(v)}
                className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize",
                  severityFilter === v ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {v === "all" ? "All Severity" : v.charAt(0).toUpperCase() + v.slice(1) + "s"}
              </button>
            ))}
          </div>

          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30">
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>

          <select value={dimensionFilter} onChange={e => setDimensionFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30">
            <option value="all">All Dimensions</option>
            {uniqueDims.map(d => <option key={d} value={d}>{DIM_LABELS[d] ?? d}</option>)}
          </select>

          <div className="ml-auto flex items-center gap-2">
            {fixable > 0 && (
              <button onClick={handleFixAll} disabled={fixingAll}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50">
                {fixingAll
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Fixing…</>
                  : <><Sparkles className="w-3.5 h-3.5" /> Fix All Auto-fixable ({fixable})</>}
              </button>
            )}
          </div>
        </div>

        {/* Issues */}
        {visible.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mb-4">
              <ShieldCheck className="w-7 h-7 text-green-600" />
            </div>
            <p className="text-sm font-semibold text-foreground">No issues</p>
            <p className="text-xs text-muted-foreground mt-1">
              {issues.filter(i => !i.fixed).length === 0
                ? "All issues resolved. Data is clean ✓"
                : "No issues match the active filters."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {visible.filter(i => !i.fixed).length} open · {visible.filter(i => i.fixed).length} resolved
            </p>
            {visible.map(issue => (
              <IssueCard key={issue.id} issue={issue} onFix={handleFix} onDismiss={handleDismiss} />
            ))}
          </div>
        )}

        {/* AI Engine info */}
        <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
          <Sparkles className="w-4 h-4 text-violet-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-violet-700">AI Validation Engine — All 10 Dimensions</p>
            <p className="text-xs text-violet-600 mt-0.5 leading-relaxed">
              Validates Accounts, Entities, Departments, Cost Centers, Scenarios, Currencies, Time Periods,
              Products & Services, Employee Categories, and Doctor Categories. Detects duplicate codes,
              missing parents, circular hierarchies, invalid field values, and fuzzy name conflicts.
              Auto-fixable issues can be resolved in one click; others include AI-generated guidance.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
