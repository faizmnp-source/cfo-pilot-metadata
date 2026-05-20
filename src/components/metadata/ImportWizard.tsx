"use client";

import { useState, useRef, useCallback } from "react";
import {
  X,
  Upload,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  FileSpreadsheet,
  Loader2,
  Download,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Step = "upload" | "validate" | "preview" | "confirm";

interface ValidationError {
  row: number;
  field: string;
  message: string;
  severity: "error" | "warning" | "info";
  fixable?: boolean;
  suggestedFix?: string;
}

interface PreviewRow {
  rowNumber: number;
  data: Record<string, string>;
  status: "valid" | "warning" | "error" | "duplicate";
}

interface ImportResult {
  jobId: string;
  previewRows?: PreviewRow[];
  validationErrors?: ValidationError[];
  totalRows?: number;
  validRows?: number;
  errorRows?: number;
  importedCount?: number;
}

interface ImportWizardProps {
  dimensionType: string;
  onClose: () => void;
  onComplete: () => void;
}

const STEPS: { id: Step; label: string; desc: string }[] = [
  { id: "upload", label: "Upload File", desc: "Select your Excel or CSV file" },
  { id: "validate", label: "Validate", desc: "AI checks for issues" },
  { id: "preview", label: "Preview", desc: "Review data before import" },
  { id: "confirm", label: "Complete", desc: "Import confirmed" },
];

const STEP_INDEX: Record<Step, number> = {
  upload: 0,
  validate: 1,
  preview: 2,
  confirm: 3,
};

function StepIndicator({ current }: { current: Step }) {
  const currentIdx = STEP_INDEX[current];
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
                  done
                    ? "bg-green-500 text-white"
                    : active
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <p
                className={cn(
                  "mt-1 text-[10px] font-medium",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                {step.label}
              </p>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "mb-4 h-0.5 w-16",
                  done ? "bg-green-500" : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: "error" | "warning" | "info" }) {
  const map = {
    error: "bg-red-100 text-red-700",
    warning: "bg-amber-100 text-amber-700",
    info: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium uppercase", map[severity])}>
      {severity}
    </span>
  );
}

function RowStatusBadge({ status }: { status: PreviewRow["status"] }) {
  const map: Record<string, string> = {
    valid: "bg-green-100 text-green-700",
    warning: "bg-amber-100 text-amber-700",
    error: "bg-red-100 text-red-700",
    duplicate: "bg-purple-100 text-purple-700",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", map[status] ?? "bg-muted text-muted-foreground")}>
      {status}
    </span>
  );
}

export function ImportWizard({
  dimensionType,
  onClose,
  onComplete,
}: ImportWizardProps) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) selectFile(f);
  }, []);

  const selectFile = (f: File) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    if (!allowed.includes(f.type) && !f.name.match(/\.(xlsx|xls|csv)$/i)) {
      setError("Please upload an Excel (.xlsx, .xls) or CSV file.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("File size must be under 10MB.");
      return;
    }
    setFile(f);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dimensionType", dimensionType);
      const res = await fetch("/api/metadata/import/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setResult(data);
      setStep("validate");
      // Auto-start validation
      await handleValidate(data.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async (jobId: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/metadata/import/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Validation failed");
      setResult((prev) => ({ ...prev!, ...data }));
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!result?.jobId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/metadata/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: result.jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setResult((prev) => ({ ...prev!, importedCount: data.importedCount }));
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    // In production this would download a pre-made template
    const headers = dimensionType === "ACCOUNT"
      ? "code,name,type,parentCode,reportingGroup,description,isActive"
      : "code,name,parentCode,description,isActive";
    const blob = new Blob([headers + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dimensionType.toLowerCase()}_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const errorCount = result?.validationErrors?.filter((e) => e.severity === "error").length ?? 0;
  const warningCount = result?.validationErrors?.filter((e) => e.severity === "warning").length ?? 0;
  const canProceed = errorCount === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Import {dimensionType.charAt(0) + dimensionType.slice(1).toLowerCase().replace("_", " ")}
            </h2>
            <p className="text-xs text-muted-foreground">
              Bulk import from Excel or CSV
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex justify-center border-b border-border px-6 py-4">
          <StepIndicator current={step} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Error banner */}
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* STEP: Upload */}
          {step === "upload" && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors",
                  dragging
                    ? "border-primary bg-primary/5"
                    : file
                    ? "border-green-400 bg-green-50"
                    : "border-border hover:border-primary/50 hover:bg-muted/20"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && selectFile(e.target.files[0])}
                />
                {file ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileSpreadsheet className="h-10 w-10 text-green-500" />
                    <p className="font-medium text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(0)} KB — click to change
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-10 w-10 text-muted-foreground" />
                    <p className="font-medium text-foreground">
                      Drop your file here or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Supports .xlsx, .xls, .csv — max 10MB
                    </p>
                  </div>
                )}
              </div>

              {/* Template download */}
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <Download className="h-3.5 w-3.5" />
                Download template for {dimensionType.toLowerCase()}
              </button>

              {/* Column requirements */}
              <div className="rounded-md border border-border bg-muted/20 p-4 text-sm">
                <p className="mb-2 font-medium text-foreground">Required columns:</p>
                <div className="flex flex-wrap gap-2">
                  {(dimensionType === "ACCOUNT"
                    ? ["code", "name", "type"]
                    : ["code", "name"]
                  ).map((col) => (
                    <code key={col} className="rounded bg-muted px-2 py-0.5 text-xs font-mono text-foreground">
                      {col}
                    </code>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Optional: parentCode, description, isActive{dimensionType === "ACCOUNT" ? ", reportingGroup" : ""}
                </p>
              </div>
            </div>
          )}

          {/* STEP: Validate (loading) */}
          {step === "validate" && loading && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="font-medium text-foreground">Running AI validation...</p>
              <p className="text-sm text-muted-foreground">
                Checking for duplicates, circular hierarchies, and data issues
              </p>
            </div>
          )}

          {/* STEP: Preview */}
          {step === "preview" && result && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{result.totalRows ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Total Rows</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{result.validRows ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Valid</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{result.errorRows ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </div>
              </div>

              {/* Validation issues */}
              {(result.validationErrors?.length ?? 0) > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">
                      Validation Issues
                    </p>
                    <div className="flex gap-2">
                      {errorCount > 0 && (
                        <span className="flex items-center gap-1 text-xs text-red-600">
                          <AlertCircle className="h-3 w-3" />
                          {errorCount} errors
                        </span>
                      )}
                      {warningCount > 0 && (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                          <AlertTriangle className="h-3 w-3" />
                          {warningCount} warnings
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {result.validationErrors!.map((err, i) => (
                      <div key={i} className="p-3">
                        <div
                          className="flex cursor-pointer items-center justify-between"
                          onClick={() => {
                            const next = new Set(expandedErrors);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            setExpandedErrors(next);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <SeverityBadge severity={err.severity} />
                            <span className="text-xs text-muted-foreground">
                              Row {err.row} · {err.field}
                            </span>
                            <span className="text-sm text-foreground">{err.message}</span>
                          </div>
                          {err.suggestedFix && (
                            expandedErrors.has(i) ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )
                          )}
                        </div>
                        {expandedErrors.has(i) && err.suggestedFix && (
                          <div className="mt-2 rounded-md bg-blue-50 p-2 text-xs text-blue-700">
                            <span className="font-medium">AI Suggestion:</span> {err.suggestedFix}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview rows */}
              {(result.previewRows?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-foreground">
                    Data Preview (first 5 rows)
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Row</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                          {Object.keys(result.previewRows![0]?.data ?? {}).map((col) => (
                            <th key={col} className="px-3 py-2 text-left font-medium text-muted-foreground capitalize">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {result.previewRows!.map((row) => (
                          <tr key={row.rowNumber} className="bg-white hover:bg-muted/10">
                            <td className="px-3 py-2 text-muted-foreground">{row.rowNumber}</td>
                            <td className="px-3 py-2">
                              <RowStatusBadge status={row.status} />
                            </td>
                            {Object.values(row.data).map((val, i) => (
                              <td key={i} className="px-3 py-2 text-foreground">{val}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {!canProceed && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Fix {errorCount} error{errorCount !== 1 ? "s" : ""} before importing.
                    Warnings can be ignored.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* STEP: Confirm */}
          {step === "confirm" && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">Import Complete!</p>
                <p className="text-sm text-muted-foreground">
                  Successfully imported{" "}
                  <span className="font-medium text-foreground">
                    {result?.importedCount ?? 0}
                  </span>{" "}
                  records into {dimensionType.toLowerCase().replace("_", " ")}.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="h-9 rounded-md border border-input px-4 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            {step === "confirm" ? "Close" : "Cancel"}
          </button>

          <div className="flex items-center gap-2">
            {step === "upload" && (
              <button
                onClick={handleUpload}
                disabled={!file || loading}
                className="flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Upload & Validate
              </button>
            )}

            {step === "preview" && (
              <>
                <button
                  onClick={() => result?.jobId && handleValidate(result.jobId)}
                  className="flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Re-validate
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!canProceed || loading}
                  className="flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Confirm Import
                </button>
              </>
            )}

            {step === "confirm" && (
              <button
                onClick={() => { onComplete(); onClose(); }}
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
              >
                View Imported Data
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
