// Parse a facts-import file (CSV or XLSX) into a normalized row shape.
//
// Long-format only — one row per intersection. The first row is the
// header. Column names match Dimension labels (case-insensitive). The
// magic columns are:
//   Period  → Time member code (e.g. "2026M01")
//   Value   → numeric, parsed with Number()
// Everything else maps to whichever dim has a matching label.

import * as XLSX from "xlsx";
import Papa from "papaparse";

export interface ParsedFile {
  headers: string[];                  // raw header names from row 1
  rows:    Record<string, string>[];  // { headerName: cellValueAsString }
}

/**
 * Parses an uploaded File into headers + row dicts. Handles xlsx, xls,
 * csv. Returns ParsedFile or throws with a user-readable error.
 *
 * We deliberately convert every cell to string here — numeric parsing
 * happens at the validator layer because we need access to the column
 * (Value vs Period vs member code) to decide.
 */
export async function parseFactsFile(
  buffer: ArrayBuffer,
  mimeType: string,
  filename: string,
): Promise<ParsedFile> {
  const lower = filename.toLowerCase();
  const isCsv = lower.endsWith(".csv") || mimeType === "text/csv";
  const isXlsx =
    lower.endsWith(".xlsx") || lower.endsWith(".xls") ||
    mimeType.includes("spreadsheet") || mimeType.includes("excel");

  if (isCsv) return parseCsv(buffer);
  if (isXlsx) return parseXlsx(buffer);
  throw new Error(`Unsupported file type: ${filename} (${mimeType}). Use .csv, .xlsx, or .xls.`);
}

function parseCsv(buffer: ArrayBuffer): ParsedFile {
  const text = new TextDecoder("utf-8").decode(buffer);
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy",
  });
  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error(`CSV parse failed: ${result.errors[0].message}`);
  }
  return rowsToParsedFile(result.data as any as string[][]);
}

function parseXlsx(buffer: ArrayBuffer): ParsedFile {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("XLSX has no sheets");
  const sheet = wb.Sheets[sheetName];
  // raw:false stringifies dates and numbers; defval:"" gives us empty
  // strings instead of undefined for blank cells.
  const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
  return rowsToParsedFile(aoa as any as string[][]);
}

function rowsToParsedFile(rows: string[][]): ParsedFile {
  if (rows.length === 0) throw new Error("File is empty");
  const headers = rows[0].map((h) => String(h ?? "").trim()).filter(Boolean);
  if (headers.length === 0) throw new Error("First row has no header columns");

  const data = rows.slice(1)
    .filter((r) => r.some((cell) => String(cell ?? "").trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = String(r[i] ?? "").trim();
      });
      return obj;
    });

  return { headers, rows: data };
}
