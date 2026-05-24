"use client";

// Facts-import wizard. Three states:
//   1. Pick file (drop zone or click)
//   2. Dry-run results (rows valid / invalid, errors table, preview)
//   3. After commit: success banner + link to /data/input to verify
//
// All-or-nothing commit per Faizan's call — any validation error blocks
// the whole upload.

import { useState, useRef } from "react";
import { MetadataHeader } from "@/components/layout/MetadataHeader";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, ArrowRight, Download } from "lucide-react";
import Link from "next/link";

interface DryRunResp {
  mode: "dry-run";
  rowsTotal:   number;
  rowsValid:   number;
  rowsInvalid: number;
  errors:      { row: number; field: string; message: string }[];
  preview:     { rowIndex: number; value: number }[];
}

interface CommitResp {
  mode: "commit";
  loadBatchId:   string;
  processRunId:  string;
  rowsCommitted: number;
  rowsTotal:     number;
}

export default function FactsImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"idle" | "dry-run" | "commit">("idle");
  const [dryRun, setDryRun] = useState<DryRunResp | null>(null);
  const [committed, setCommitted] = useState<CommitResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function pickFile() { fileInputRef.current?.click(); }
  function reset() { setFile(null); setDryRun(null); setCommitted(null); setError(null); }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setDryRun(null); setCommitted(null); setError(null);
    if (f) await runDryRun(f);
  }

  async function runDryRun(f: File) {
    setBusy("dry-run"); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("mode", "dry-run");
      const r = await fetch("/api/v2/facts/import", { method: "POST", credentials: "include", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setDryRun(j.data);
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setBusy("idle"); }
  }

  async function runCommit() {
    if (!file) return;
    setBusy("commit"); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "commit");
      const r = await fetch("/api/v2/facts/import", { method: "POST", credentials: "include", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setCommitted(j.data);
    } catch (e: any) { setError(e.message ?? String(e)); }
    finally { setBusy("idle"); }
  }

  return (
    <>
      <MetadataHeader
        title="Excel / CSV Facts Import"
        subtitle="Upload at leaf level. Every enabled dimension is required per row."
      />
      <main className="flex-1 overflow-y-auto bg-background p-6">
        {/* Step 1 — Drop zone */}
        {!file && (
          <div
            onClick={pickFile}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) { setFile(f); runDryRun(f); }
            }}
            className="cursor-pointer rounded-xl border-2 border-dashed border-gray-300 bg-white p-12 text-center hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
          >
            <Upload className="mx-auto h-10 w-10 text-gray-400" />
            <p className="mt-3 text-sm font-medium text-gray-700">Drop your file here or click to browse</p>
            <p className="mt-1 text-xs text-muted-foreground">.xlsx, .xls, or .csv — long format, one row per intersection</p>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,text/csv" className="hidden" onChange={onFileChange} />
          </div>
        )}

        {/* File chip */}
        {file && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
              <div>
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground">Pick a different file</button>
          </div>
        )}

        {/* Step 2 — Dry-run results */}
        {busy === "dry-run" && (
          <div className="rounded-xl border border-border bg-white p-6 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" />
            <p className="mt-3 text-sm font-medium">Validating file…</p>
          </div>
        )}

        {dryRun && !committed && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Stat label="Total rows" value={dryRun.rowsTotal} color="bg-gray-50 text-gray-700" />
              <Stat label="Valid" value={dryRun.rowsValid} color="bg-emerald-50 text-emerald-700" icon={CheckCircle2} />
              <Stat label="Invalid" value={dryRun.rowsInvalid} color="bg-red-50 text-red-700" icon={AlertTriangle} />
            </div>

            {dryRun.errors.length > 0 && (
              <div className="mb-4 rounded-xl border border-red-100 bg-white shadow-sm overflow-hidden">
                <div className="bg-red-50 px-4 py-2 text-xs font-semibold text-red-800 border-b border-red-100">
                  ⚠ {dryRun.errors.length} validation error{dryRun.errors.length === 1 ? "" : "s"} (showing first 100)
                </div>
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground w-20">Row</th>
                        <th className="px-4 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground w-40">Field</th>
                        <th className="px-4 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dryRun.errors.map((e, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-4 py-1.5 font-mono text-[12px]">{e.row}</td>
                          <td className="px-4 py-1.5 text-[12px] font-medium">{e.field}</td>
                          <td className="px-4 py-1.5 text-[12px] text-gray-700">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button onClick={reset} className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">Cancel</button>
              <button
                onClick={runCommit}
                disabled={busy !== "idle" || dryRun.rowsInvalid > 0 || dryRun.rowsValid === 0}
                className={`px-4 py-2 rounded-md text-xs font-semibold transition-all ${
                  dryRun.rowsInvalid > 0 || dryRun.rowsValid === 0
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
              >
                {busy === "commit" ? (<><Loader2 className="inline h-3 w-3 animate-spin mr-1" /> Committing…</>) : `Commit ${dryRun.rowsValid} row${dryRun.rowsValid === 1 ? "" : "s"}`}
              </button>
            </div>
          </>
        )}

        {/* Step 3 — Success */}
        {committed && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-sm text-emerald-900">Imported {committed.rowsCommitted} rows</h3>
                <p className="text-xs text-emerald-700 mt-1">Load batch <span className="font-mono">{committed.loadBatchId.slice(0, 8)}…</span> · Process run <span className="font-mono">{committed.processRunId.slice(0, 8)}…</span></p>
                <div className="mt-3 flex items-center gap-2">
                  <Link href="/data/input" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-emerald-700 rounded-md text-xs font-medium border border-emerald-200 hover:bg-emerald-100">
                    Verify in Data Input <ArrowRight className="h-3 w-3" />
                  </Link>
                  <button onClick={reset} className="px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-100 rounded-md">Import another file</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-xs text-red-800">
            ⚠ {error}
          </div>
        )}

        {/* Footer helper */}
        <div className="mt-6 rounded-lg border border-border bg-gray-50 p-4 text-xs text-muted-foreground">
          <p className="font-medium text-gray-700 mb-1.5">File format</p>
          <p>Long format — one row per cell. Required columns (case-insensitive): every enabled dimension + <strong>Period</strong> + <strong>Value</strong>. Origin column is optional, defaults to <em>Import</em>.</p>
          <p className="mt-2"><strong>Example header:</strong> <code className="bg-white px-1.5 py-0.5 rounded text-[11px]">Account, Entity, Scenario, Period, Currency, ICP, Department, CostCenter, Value</code></p>
        </div>
      </main>
    </>
  );
}

function Stat({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon?: any }) {
  return (
    <div className={`rounded-lg ${color} px-4 py-3`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium opacity-80">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}
