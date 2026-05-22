"use client";

// Excel upload + parse + preview + bulk write.
// Two-phase write: (1) POST all members, (2) POST hierarchy edges from
// the parent_code column. Reports per-row success/failure as a toast
// summary and inline error markers in the preview table.

import { useRef, useState } from "react";
import { toast } from "sonner";
import { X, Upload, Download, CheckCircle, AlertTriangle, Loader2, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";
import type { SupportedDim } from "./AddMemberDialog";
import { TEMPLATES } from "@/lib/excel-templates";

interface Props {
  open: boolean;
  dim: SupportedDim;
  hierarchyCode?: string;
  onClose: () => void;
  onImported: () => void;
}

interface ParsedRow {
  rowIndex: number;
  values: Record<string, any>;
  error?: string;
}

type RowResult = { row: number; status: "created" | "exists" | "skipped" | "failed"; detail?: string };

export function ExcelImport({ open, dim, hierarchyCode = "default", onClose, onImported }: Props) {
  const spec = TEMPLATES[dim];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<RowResult[] | null>(null);

  if (!open) return null;

  const reset = () => {
    setFileName(null); setParsed([]); setParseError(null);
    setImporting(false); setProgress(null); setResults(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setParseError(null);
    setParsed([]);
    setResults(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      // Pick the first sheet whose name matches our spec, else the first sheet
      const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === spec.sheetName.toLowerCase())
                     ?? wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      if (!ws) throw new Error("Sheet not found");

      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
      if (aoa.length < 2) throw new Error("Sheet has no data rows");

      // Row 0 = labels (human), Row 1 = keys (parser). If row 1 doesn't look
      // like our keys, fall back to inferring keys from labels.
      const expectedKeys = spec.columns.map((c) => c.key);
      const keyRowLooksRight = expectedKeys.every((k) => aoa[1].includes(k));
      const keys: string[] = keyRowLooksRight ? aoa[1].map(String) : aoa[0].map((label: string) => {
        const found = spec.columns.find((c) => c.label.toLowerCase() === String(label).replace(/\s\*$/, "").toLowerCase());
        return found ? found.key : String(label).toLowerCase().replace(/\s+/g, "_");
      });

      const dataRows = aoa.slice(keyRowLooksRight ? 2 : 1);
      const rows: ParsedRow[] = dataRows
        .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
        .map((r, i) => {
          const values: Record<string, any> = {};
          keys.forEach((k, idx) => { values[k] = r[idx] ?? ""; });
          // Inline validation (light — server does the strict pass)
          const required = spec.columns.filter((c) => c.required).map((c) => c.key);
          const missing = required.filter((k) => !values[k] && values[k] !== false && values[k] !== 0);
          return {
            rowIndex: i + 1,
            values,
            error: missing.length ? `Missing required: ${missing.join(", ")}` : undefined,
          };
        });

      setParsed(rows);
    } catch (e: any) {
      setParseError(e?.message ?? "Failed to parse file");
    }
  };

  const downloadTemplate = () => {
    window.open(`/api/v2/template/${dim}`, "_blank");
  };

  const handleImport = async () => {
    if (!parsed.length) return;
    setImporting(true);
    setResults(null);
    const codeToId: Record<string, string> = {};
    const rowResults: RowResult[] = [];
    const total = parsed.length;
    setProgress({ done: 0, total });

    // PASS 1 — create members
    for (let i = 0; i < parsed.length; i++) {
      const r = parsed[i];
      if (r.error) {
        rowResults.push({ row: r.rowIndex, status: "skipped", detail: r.error });
        setProgress({ done: i + 1, total });
        continue;
      }
      try {
        const body = buildMemberBody(dim, r.values);
        const res = await fetch(`/api/v2/members/${dim}`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        // Capture both the raw body and the parsed JSON. Empty body on 5xx
        // is a backend crash before the response was written — surface that
        // explicitly instead of leaving the user staring at "HTTP 500".
        const rawText = await res.text();
        let data: any = {};
        try { data = rawText ? JSON.parse(rawText) : {}; } catch { /* leave data={} */ }
        const emptyBody = rawText.length === 0;

        if (res.status === 201 || res.status === 200) {
          codeToId[String(r.values.code)] = data?.data?.id;
          rowResults.push({ row: r.rowIndex, status: "created" });
        } else if (res.status === 409) {
          // Already exists — try to resolve its id so hierarchy edges still wire up
          try {
            const listRes = await fetch(
              `/api/v2/members/${dim}?search=${encodeURIComponent(String(r.values.code))}&pageSize=1`,
              { credentials: "include" }
            );
            const listData = await listRes.json();
            const found = listData?.data?.data?.find((m: any) => m.memberCode === String(r.values.code));
            if (found?.id) codeToId[String(r.values.code)] = found.id;
          } catch { /* ignore */ }
          rowResults.push({ row: r.rowIndex, status: "exists", detail: "code already exists — skipped" });
        } else if (res.status === 401) {
          rowResults.push({ row: r.rowIndex, status: "failed", detail: "Not signed in — log out and back in on this URL" });
        } else if (res.status === 422) {
          // Surface every validation issue, not just the first — Zod reports
          // them all at once and partial information is misleading.
          const issues: Array<{ path?: string[]; message?: string }> = data?.details?.issues ?? [];
          const formatted = issues.length
            ? issues.map((i) => `${i.path?.join(".") ?? ""} ${i.message ?? "invalid"}`.trim()).join(" • ")
            : "validation failed";
          rowResults.push({ row: r.rowIndex, status: "failed", detail: `Validation: ${formatted}` });
        } else if (res.status >= 500 && emptyBody) {
          // The function crashed before NextResponse.json() — most likely a
          // FK violation, Prisma drift, or import-time error. Tell the user
          // honestly that the server died, not just "HTTP 500".
          rowResults.push({ row: r.rowIndex, status: "failed",
            detail: `Server error (HTTP ${res.status}, no response body — check Vercel logs)` });
        } else {
          rowResults.push({ row: r.rowIndex, status: "failed",
            detail: data?.error
              ?? data?.details?.issues?.[0]?.message
              ?? `HTTP ${res.status} ${res.statusText || ""}`.trim() });
        }
      } catch (e: any) {
        rowResults.push({ row: r.rowIndex, status: "failed", detail: e?.message ?? "Network error" });
      }
      setProgress({ done: i + 1, total });
    }

    // PASS 2 — hierarchy edges from parent_code (only for rows that succeeded)
    let edgesCreated = 0;
    let edgesFailed = 0;
    for (const r of parsed) {
      const parentCode = String(r.values.parent_code ?? "").trim();
      const childCode  = String(r.values.code ?? "").trim();
      if (!parentCode || !childCode) continue;
      const childId  = codeToId[childCode];
      const parentId = codeToId[parentCode];
      if (!childId || !parentId) continue;
      try {
        const res = await fetch(`/api/v2/hierarchy/${dim}`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hierarchyCode, parentMemberId: parentId, childMemberId: childId,
            operator: "ADD", weight: 1,
          }),
        });
        if (res.ok) edgesCreated++; else edgesFailed++;
      } catch { edgesFailed++; }
    }

    setResults(rowResults);
    setImporting(false);

    const created = rowResults.filter((r) => r.status === "created").length;
    const exists  = rowResults.filter((r) => r.status === "exists").length;
    const failed  = rowResults.filter((r) => r.status === "failed").length;
    const skipped = rowResults.filter((r) => r.status === "skipped").length;
    if (failed === 0) {
      toast.success(`✅ ${created} created · ${exists} already existed · ${edgesCreated} edges`);
      onImported();
    } else {
      toast.error(`Created ${created} · Exists ${exists} · Failed ${failed} · Skipped ${skipped} · Edges ${edgesCreated}/${edgesCreated + edgesFailed}`);
    }
  };

  const errorCount   = parsed.filter((r) => r.error).length;
  const validCount   = parsed.length - errorCount;
  const resultsByRow = results ? Object.fromEntries(results.map((r) => [r.row, r])) : {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Import {spec.sheetName} from Excel</h2>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Step 1: file picker + download template */}
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">
              {fileName ? `Loaded: ${fileName}` : "Drop an .xlsx file here or click to browse"}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Expected sheet: <code>{spec.sheetName}</code>. First row = labels, second row = column keys (hidden in the template), then data.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Upload className="h-3.5 w-3.5" /> Choose file
              </button>
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" /> Download {dim} template
              </button>
            </div>
            <input
              ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>

          {parseError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              <AlertTriangle className="inline h-4 w-4 mr-1" /> {parseError}
            </div>
          )}

          {/* Preview */}
          {parsed.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-foreground">
                  Preview — {parsed.length} rows
                  <span className="ml-2 text-xs text-emerald-700">{validCount} valid</span>
                  {errorCount > 0 && (
                    <span className="ml-2 text-xs text-red-700">{errorCount} with errors</span>
                  )}
                </div>
                {progress && (
                  <div className="text-xs text-muted-foreground">
                    {importing ? <Loader2 className="inline h-3 w-3 animate-spin mr-1" /> : null}
                    {progress.done}/{progress.total}
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-border overflow-x-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium text-muted-foreground w-8">#</th>
                      <th className="px-2 py-1 text-left font-medium text-muted-foreground w-24">Status</th>
                      {spec.columns.map((c) => (
                        <th key={c.key} className="px-2 py-1 text-left font-medium text-muted-foreground whitespace-nowrap">
                          {c.label}{c.required && <span className="text-red-500">*</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 50).map((r) => {
                      const rr = resultsByRow[r.rowIndex];
                      return (
                        <tr key={r.rowIndex} className={cn("border-t border-border/50",
                          rr?.status === "created" ? "bg-emerald-50" :
                          rr?.status === "exists"  ? "bg-blue-50"    :
                          rr?.status === "failed"  ? "bg-red-50"     :
                          r.error                  ? "bg-amber-50"   : ""
                        )}>
                          <td className="px-2 py-1 text-muted-foreground tabular-nums">{r.rowIndex}</td>
                          <td className="px-2 py-1 text-[10px] uppercase tracking-wide">
                            {rr?.status ?? (r.error ? "warn" : "ready")}
                            {rr?.detail && <div className="text-[10px] text-red-700 normal-case">{rr.detail}</div>}
                            {!rr && r.error && <div className="text-[10px] text-amber-700 normal-case">{r.error}</div>}
                          </td>
                          {spec.columns.map((c) => (
                            <td key={c.key} className="px-2 py-1 whitespace-nowrap font-mono">
                              {String(r.values[c.key] ?? "")}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {parsed.length > 50 && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Showing first 50 of {parsed.length} rows.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
          <button onClick={() => { reset(); onClose(); }}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">Close</button>
          {parsed.length > 0 && !results && (
            <button
              onClick={handleImport}
              disabled={importing || validCount === 0}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
              {importing ? "Importing…" : `Import ${validCount} ${validCount === 1 ? "row" : "rows"}`}
            </button>
          )}
          {results && (
            <button onClick={() => { reset(); onImported(); onClose(); }}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
              <CheckCircle className="h-3.5 w-3.5" /> Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Per-dim payload builder ─────────────────────────────────────

function bool(v: any, def = false): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "") return def;
  return ["true", "1", "yes", "y"].includes(s);
}
function num(v: any, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function trim(v: any): string {
  return String(v ?? "").trim();
}

function buildMemberBody(dim: SupportedDim, v: Record<string, any>): any {
  const common = {
    memberCode: trim(v.code),
    memberName: trim(v.name),
    description: trim(v.description) || null,
    isActive: true,
    sortOrder: 0,
  };
  switch (dim) {
    case "account":
      return { ...common, properties: {
        account_type:      trim(v.account_type) || "EXPENSE",
        time_balance:      trim(v.time_balance) || "FLOW",
        switch_sign:       bool(v.switch_sign),
        storage_type:      trim(v.storage_type) || "STORED",
        calculation_type:  trim(v.calculation_type) || "INPUT",
        variance_type:     trim(v.variance_type) || "NEUTRAL",
        currency_behavior: trim(v.currency_behavior) || "TRANSACTIONAL",
        allow_input:       true,
        is_consolidated:   true,
        formula:           trim(v.formula) || null,
      }};
    case "entity":
      return { ...common, properties: {
        base_currency:        trim(v.base_currency) || "USD",
        consolidation_method: trim(v.consolidation_method) || "FULL",
        ownership_pct:        num(v.ownership_pct, 100),
        icp_enabled:          bool(v.icp_enabled),
        country:              trim(v.country),
        tax_id:               trim(v.tax_id),
      }};
    case "scenario":
      return { ...common, properties: {
        scenario_type: trim(v.scenario_type) || "BUDGET",
        is_frozen:     bool(v.is_frozen),
        version:       trim(v.version) || "v1",
        start_period:  trim(v.start_period),
        end_period:    trim(v.end_period),
      }};
    case "time":
      return { ...common, properties: {
        period_type: trim(v.period_type) || "MONTH",
        fiscal_year: num(v.fiscal_year, new Date().getFullYear()),
        start_date:  trim(v.start_date),
        end_date:    trim(v.end_date),
      }};
    case "currency":
      return { ...common, properties: {
        iso_code: (trim(v.iso_code) || trim(v.code)).toUpperCase().slice(0, 3),
        is_base:  bool(v.is_base),
      }};
    case "icp":
      // entity_code is a code reference — server expects entity_id (UUID).
      // We can't resolve here without a lookup; pass through as best-effort
      // and the server will reject if it's not a UUID. (Future: pre-resolve in pass 1.)
      return { ...common, properties: { entity_id: trim(v.entity_code) }};
    default: { // ud1..ud8
      const props: Record<string, any> = {};
      for (const [k, val] of Object.entries(v)) {
        if (["code", "name", "description", "parent_code"].includes(k)) continue;
        if (trim(val) !== "") props[k] = trim(val);
      }
      return { ...common, properties: props };
    }
  }
}
