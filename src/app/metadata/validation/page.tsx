"use client";

import { useState } from "react";
import { ShieldCheck, RefreshCw, Loader2, ChevronDown } from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { ValidationReport, ValidationError } from "@/components/metadata/ValidationReport";
import { cn } from "@/lib/utils";

const DIMENSION_TYPES = [
  { value: "ACCOUNT", label: "Accounts" },
  { value: "ENTITY", label: "Entities" },
  { value: "DEPARTMENT", label: "Departments" },
  { value: "COST_CENTER", label: "Cost Centers" },
];

// Mock validation errors for demo
const MOCK_ERRORS: ValidationError[] = [
  {
    id: "1",
    severity: "error",
    dimension: "ACCOUNT",
    code: "1100",
    field: "parentId",
    message: "Parent account '9999' does not exist in the system",
    category: "Missing Reference",
    fixable: true,
    suggestedFix: "Remove the parent reference or create account 9999 first. Alternatively, set this account as a root-level account.",
  },
  {
    id: "2",
    severity: "warning",
    dimension: "DEPARTMENT",
    code: "DEPT-A1",
    field: "name",
    message: "Department name 'Finance' appears 3 times with different codes",
    category: "Duplicate Detection",
    fixable: true,
    suggestedFix: "Consider renaming to distinguish: 'Finance - Group', 'Finance - Thailand', 'Finance - Singapore'",
  },
  {
    id: "3",
    severity: "error",
    dimension: "ACCOUNT",
    code: "5200",
    message: "Circular hierarchy detected: 5200 → 5100 → 5000 → 5200",
    category: "Circular Hierarchy",
    fixable: false,
  },
  {
    id: "4",
    severity: "warning",
    dimension: "ENTITY",
    code: "SG-01",
    field: "currency",
    message: "Currency field is empty for entity SG-01. Transactions will use parent entity currency.",
    category: "Missing Data",
    fixable: true,
    suggestedFix: "Set currency to 'SGD' for Singapore entity.",
  },
  {
    id: "5",
    severity: "info",
    dimension: "COST_CENTER",
    code: "CC-999",
    message: "Cost center CC-999 has no children and is marked as a parent. Consider if this is intended.",
    category: "Data Quality",
    fixable: false,
  },
];

export default function ValidationPage() {
  const [selectedDimension, setSelectedDimension] = useState("all");
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const runValidation = async () => {
    setRunning(true);
    setHasRun(false);
    // Simulate AI validation
    await new Promise((r) => setTimeout(r, 2000));
    const filtered =
      selectedDimension === "all"
        ? MOCK_ERRORS
        : MOCK_ERRORS.filter((e) => e.dimension === selectedDimension);
    setErrors(filtered);
    setDismissed(new Set());
    setHasRun(true);
    setRunning(false);
  };

  const handleApplyFix = (error: ValidationError) => {
    // In real app: call API to apply the suggested fix
    setErrors((prev) => prev.filter((e) => e.id !== error.id));
  };

  const handleDismiss = (error: ValidationError) => {
    if (error.id) {
      setDismissed((prev) => new Set([...prev, error.id!]));
    }
  };

  const visibleErrors = errors.filter((e) => !e.id || !dismissed.has(e.id));

  return (
    <>
      <MetadataHeader
        title="Data Validation"
        subtitle="AI-powered data quality checks for all dimensions"
        showSearch={false}
      />

      <main className="flex-1 overflow-y-auto bg-background p-6">
        {/* Controls */}
        <div className="mb-6 flex items-end gap-3 rounded-xl border border-border bg-white p-5 shadow-sm">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Dimension Scope
            </label>
            <div className="relative">
              <select
                value={selectedDimension}
                onChange={(e) => setSelectedDimension(e.target.value)}
                className="h-10 appearance-none rounded-md border border-input bg-white px-3 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 w-48"
              >
                <option value="all">All Dimensions</option>
                {DIMENSION_TYPES.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          <button
            onClick={runValidation}
            disabled={running}
            className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {running ? "Running AI Validation..." : "Run Validation"}
          </button>

          {hasRun && (
            <p className="text-xs text-muted-foreground">
              Found {visibleErrors.length} issue{visibleErrors.length !== 1 ? "s" : ""}
              {dismissed.size > 0 && ` (${dismissed.size} dismissed)`}
            </p>
          )}
        </div>

        {/* Validation info */}
        {!hasRun && !running && (
          <div className="mb-6 grid grid-cols-3 gap-4">
            {[
              {
                icon: ShieldCheck,
                title: "Duplicate Detection",
                desc: "Identifies duplicate codes and names across dimensions",
                color: "text-green-600",
                bg: "bg-green-50",
              },
              {
                icon: RefreshCw,
                title: "Circular Hierarchy",
                desc: "Detects circular parent-child references that would break reporting",
                color: "text-red-600",
                bg: "bg-red-50",
              },
              {
                icon: ShieldCheck,
                title: "Missing References",
                desc: "Flags parent codes that don't exist in the system",
                color: "text-blue-600",
                bg: "bg-blue-50",
              },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-white p-5">
                <div className={cn("mb-3 flex h-10 w-10 items-center justify-center rounded-lg", f.bg)}>
                  <f.icon className={cn("h-5 w-5", f.color)} />
                </div>
                <p className="mb-1 text-sm font-medium text-foreground">{f.title}</p>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        )}

        {/* Loading */}
        {running && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="relative">
              <div className="h-16 w-16 rounded-full border-4 border-primary/20" />
              <div className="absolute inset-0 h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
            <p className="font-medium text-foreground">Running AI validation...</p>
            <p className="text-sm text-muted-foreground">
              Checking duplicates, circular references, and data quality
            </p>
          </div>
        )}

        {/* Results */}
        {hasRun && !running && (
          <ValidationReport
            errors={visibleErrors}
            title={`Validation Results — ${selectedDimension === "all" ? "All Dimensions" : DIMENSION_TYPES.find((d) => d.value === selectedDimension)?.label}`}
            onApplyFix={handleApplyFix}
            onDismiss={handleDismiss}
          />
        )}
      </main>
    </>
  );
}
