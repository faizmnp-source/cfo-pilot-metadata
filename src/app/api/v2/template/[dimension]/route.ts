// Generates an .xlsx template per dimension. Downloadable from the Excel
// Import dialog. The header row matches what the import parser expects.

import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { requireAuth } from "@/lib/api-helpers";
import { apiError } from "@/lib/utils";
import { resolveDimKind } from "@/lib/dim-schemas";
import { TEMPLATES } from "@/lib/excel-templates";
import type { SupportedDim } from "@/components/metadata/v2/AddMemberDialog";

export async function GET(
  req: NextRequest,
  ctx: { params: { dimension: string } }
) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;

  const kind = resolveDimKind(ctx.params.dimension);
  if (!kind) return apiError(`Unknown dimension: ${ctx.params.dimension}`, 400);

  const dimSlug = ctx.params.dimension.toLowerCase() as SupportedDim;
  const spec = TEMPLATES[dimSlug];
  if (!spec) return apiError(`No template for ${dimSlug}`, 400);

  // Build a workbook: data sheet + Notes sheet
  const wb = XLSX.utils.book_new();

  // Data sheet — first row is column labels (display), rest are sample rows
  const headerRow = spec.columns.map((c) => c.label + (c.required ? " *" : ""));
  const keyRow    = spec.columns.map((c) => c.key);           // hidden key row for parser
  const sampleRows = spec.sampleRows.map((r) => spec.columns.map((c) => r[c.key] ?? ""));

  const aoa = [headerRow, keyRow, ...sampleRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Style: set column widths
  ws["!cols"] = spec.columns.map((c) => ({ wch: Math.max(c.label.length + 2, 14) }));

  // Hide the key row (row 2) — used by the parser, not the human
  ws["!rows"] = [{}, { hidden: true }];

  XLSX.utils.book_append_sheet(wb, ws, spec.sheetName);

  // Notes sheet — column reference + instructions
  const notesAoa: any[][] = [
    [`${spec.sheetName} — column reference`],
    [],
    ["Column", "Required", "Hint"],
    ...spec.columns.map((c) => [c.label, c.required ? "YES" : "", c.hint ?? ""]),
    [],
    ["Notes:"],
    ...spec.notes.map((n) => [n]),
  ];
  const notesWs = XLSX.utils.aoa_to_sheet(notesAoa);
  notesWs["!cols"] = [{ wch: 25 }, { wch: 10 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, notesWs, "Notes");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  // Node's Buffer doesn't satisfy the BodyInit type in newer Next types —
  // wrap in Uint8Array which is a structural match.
  const body = new Uint8Array(buf);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${dimSlug}_template.xlsx"`,
    },
  });
}
