"use client";

import { useState, useEffect } from "react";
import {
  Upload,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileSpreadsheet,
  ChevronDown,
} from "lucide-react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { ImportWizard } from "@/components/metadata/ImportWizard";
import { cn } from "@/lib/utils";

interface ImportJob {
  id: string;
  dimensionType: string;
  status: string;
  totalRows: number | null;
  importedRows: number | null;
  errorCount: number | null;
  fileName: string | null;
  createdAt: string;
  completedAt: string | null;
}

const DIMENSION_TYPES = [
  { value: "ACCOUNT", label: "Chart of Accounts" },
  { value: "ENTITY", label: "Entities" },
  { value: "DEPARTMENT", label: "Departments" },
  { value: "COST_CENTER", label: "Cost Centers" },
];

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  PENDING: { icon: Clock, color: "text-amber-500", label: "Pending" },
  PROCESSING: { icon: Clock, color: "text-blue-500", label: "Processing" },
  VALIDATION_PASSED: { icon: CheckCircle2, color: "text-green-500", label: "Validated" },
  VALIDATION_FAILED: { icon: XCircle, color: "text-red-500", label: "Validation Failed" },
  COMPLETED: { icon: CheckCircle2, color: "text-green-600", label: "Completed" },
  FAILED: { icon: XCircle, color: "text-red-600", label: "Failed" },
  PARTIAL: { icon: AlertTriangle, color: "text-amber-600", label: "Partial" },
};

export default function ImportPage() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedDimension, setSelectedDimension] = useState("ACCOUNT");
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(false);

  // In a real app, fetch import history
  useEffect(() => {
    setJobs([]);
  }, []);

  return (
    <>
      <MetadataHeader
        title="Import Wizard"
        subtitle="Bulk import financial dimensions from Excel or CSV"
        showSearch={false}
      />

      <main className="flex-1 overflow-y-auto bg-background p-6">
        {/* Start new import */}
        <div className="mb-8 rounded-xl border border-border bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-foreground">
            Start New Import
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Select a dimension type and upload your Excel or CSV file. Our AI engine
            will validate the data before importing.
          </p>

          <div className="flex items-end gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Dimension Type
              </label>
              <div className="relative">
                <select
                  value={selectedDimension}
                  onChange={(e) => setSelectedDimension(e.target.value)}
                  className="h-10 appearance-none rounded-md border border-input bg-white px-3 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 w-52"
                >
                  {DIMENSION_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            <button
              onClick={() => setWizardOpen(true)}
              className="flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              <Upload className="h-4 w-4" />
              Start Import
            </button>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="mb-8 grid grid-cols-3 gap-4">
          {[
            {
              icon: FileSpreadsheet,
              title: "Excel & CSV Support",
              desc: "Upload .xlsx, .xls, or .csv files up to 10MB",
              color: "text-green-600",
              bg: "bg-green-50",
            },
            {
              icon: CheckCircle2,
              title: "AI Validation",
              desc: "Automatically detects duplicates, circular hierarchies, and invalid data",
              color: "text-blue-600",
              bg: "bg-blue-50",
            },
            {
              icon: AlertTriangle,
              title: "Fix Suggestions",
              desc: "AI provides suggested fixes for common data quality issues",
              color: "text-amber-600",
              bg: "bg-amber-50",
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

        {/* Import history */}
        <div>
          <h2 className="mb-4 text-sm font-semibold text-foreground">Import History</h2>
          {jobs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No import jobs yet</p>
              <p className="text-xs text-muted-foreground">
                Your import history will appear here
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {["File", "Dimension", "Status", "Rows", "Imported", "Errors", "Date"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {jobs.map((job) => {
                    const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.PENDING;
                    const Icon = cfg.icon;
                    return (
                      <tr key={job.id} className="bg-white hover:bg-muted/10">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FileSpreadsheet className="h-4 w-4 text-green-600" />
                            <span className="text-xs font-mono">{job.fileName ?? "Unknown"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{job.dimensionType}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
                            <span className="text-xs">{cfg.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">{job.totalRows ?? "—"}</td>
                        <td className="px-4 py-3 tabular-nums text-green-700">{job.importedRows ?? "—"}</td>
                        <td className="px-4 py-3 tabular-nums text-red-600">{job.errorCount ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(job.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {wizardOpen && (
        <ImportWizard
          dimensionType={selectedDimension}
          onClose={() => setWizardOpen(false)}
          onComplete={() => {
            setWizardOpen(false);
            // Refresh jobs list in real app
          }}
        />
      )}
    </>
  );
}
