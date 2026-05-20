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
            <span class