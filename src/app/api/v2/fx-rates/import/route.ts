// FX rates Excel import.
//   GET  /api/v2/fx-rates/import          → returns a pre-formatted template xlsx
//   POST /api/v2/fx-rates/import          → multipart, file=xlsx, upserts rates
//
// Template shape: TWO sheets named "CLOSING" and "AVERAGE".
//   Row 1: header — first cell "Currency", then one column per period code
//   Row 2..: one row per from-currency; cells are the rate (1 unit fromCcy in toCcy)
// toCcy = tenant's reporting currency (auto-resolved).

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { audit } from "@/lib/audit-v2";

async function getReportingIso(tenantId: string): Promise<string> {
  const baseMember = await prisma.dimensionMember.findFirst({
    where: {
      tenantId, isActive: true,
      dimension: { kind: "CURRENCY" as any },
      properties: { path: ["is_base"], equals: true } as any,
    },
    select: { properties: true },
  });
  const iso = (baseMember?.properties as any)?.iso_code;
  return typeof iso === "string" && iso.length === 3 ? iso : "USD";
}

// ─── GET: download template ────────────────────────────────────────

export async function GET(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;

  // Resolve current state: reporting iso, list of non-base ISO currencies,
  // and list of FY2026 months (12 codes).
  const baseIso = await getReportingIso(auth.tid);

  const currencyMembers = await prisma.dimensionMember.findMany({
    where: {
      tenantId: auth.tid, isActive: true,
      dimension: { kind: "CURRENCY" as any },
    },
    select: { memberCode: true, properties: true },
  });
  const fromCcys = currencyMembers
    .map(m => ({ code: m.memberCode, iso: (m.properties as any)?.iso_code, isBase: (m.properties as any)?.is_base }))
    .filter(c => c.iso && c.iso !== baseIso && !c.isBase)
    .map(c => c.iso as string);

  const timeMembers = await prisma.dimensionMember.findMany({
    where: {
      tenantId: auth.tid, isActive: true,
      dimension: { kind: "TIME" as any },
    },
    select: { memberCode: true },
  });
  const periods = timeMembers
    .map(m => m.memberCode)
    .filter(c => /^\d{4}M\d{2}$/.test(c))
    .sort();

  // Existing rates for pre-filling
  const existing = await prisma.fxRate.findMany({
    where: { tenantId: auth.tid, toCcy: baseIso },
    select: { fromCcy: true, periodCode: true, rateType: true, rate: true },
  });
  const rateLookup = new Map<string, number>();
  for (const r of existing) rateLookup.set(`${r.fromCcy}|${r.periodCode}|${r.rateType}`, Number(r.rate));

  // Build two sheets
  function buildSheet(rateType: "CLOSING" | "AVERAGE") {
    const aoa: any[][] = [];
    aoa.push([`Currency → ${baseIso}`, ...periods]);
    for (const fromCcy of fromCcys) {
      const row: any[] = [fromCcy];
      for (const p of periods) row.push(rateLookup.get(`${fromCcy}|${p}|${rateType}`) ?? "");
      aoa.push(row);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 16 }, ...periods.map(() => ({ wch: 10 }))];
    return ws;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet("CLOSING"), "CLOSING");
  XLSX.utils.book_append_sheet(wb, buildSheet("AVERAGE"), "AVERAGE");

  // Add a README sheet so users know what to do
  const readme = XLSX.utils.aoa_to_sheet([
    ["FX Rates Upload Template"],
    [""],
    [`Tenant reporting currency: ${baseIso}`],
    [`Currencies covered: ${fromCcys.join(", ") || "(none — add ISO currencies in Library first)"}`],
    [`Periods covered: FY2026 months (${periods.length})`],
    [""],
    ["Instructions:"],
    ["1. Fill rates as: 1 unit of row-currency = N units of toCcy (e.g. 1 GBP = 1.27 USD)"],
    ["2. Sheet 'CLOSING' = month-end rate (for BS accounts)"],
    ["3. Sheet 'AVERAGE' = monthly avg rate (for P&L accounts)"],
    ["4. Leave cells blank to skip — won't be uploaded"],
    ["5. Upload via /process/fx-rates → Upload button"],
  ]);
  readme["!cols"] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, readme, "README");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="fx-rates-template.xlsx"`,
    },
  });
}

// ─── POST: upload + upsert ────────────────────────────────────────

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  if (auth.role !== "ADMIN" && auth.role !== "FINANCE_MANAGER") return apiError("Admin/FM required", 403);

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return apiError("file required", 400);

  const baseIso = await getReportingIso(auth.tid);
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  type Upsert = { fromCcy: string; periodCode: string; rateType: "CLOSING" | "AVERAGE"; rate: number };
  const upserts: Upsert[] = [];
  const errors: string[] = [];

  for (const rateType of ["CLOSING", "AVERAGE"] as const) {
    const sheet = wb.Sheets[rateType];
    if (!sheet) { errors.push(`Sheet '${rateType}' missing`); continue; }
    const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: true, defval: "" }) as any[][];
    if (aoa.length < 2) continue;

    const headers = aoa[0].slice(1).map(h => String(h ?? "").trim());
    // Filter to valid period codes (skip blank trailing columns)
    const periodCols = headers
      .map((h, i) => ({ idx: i + 1, code: h }))
      .filter(c => /^\d{4}M\d{2}$/.test(c.code));

    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r] ?? [];
      const fromCcy = String(row[0] ?? "").trim().toUpperCase();
      if (!fromCcy || !/^[A-Z]{3}$/.test(fromCcy)) continue;
      if (fromCcy === baseIso) continue;   // skip self-translation rows
      for (const col of periodCols) {
        const cell = row[col.idx];
        if (cell === "" || cell == null) continue;
        const rate = Number(cell);
        if (!Number.isFinite(rate) || rate <= 0) {
          errors.push(`${rateType} sheet, row ${r + 1}, period ${col.code}: '${cell}' is not a positive number`);
          continue;
        }
        upserts.push({ fromCcy, periodCode: col.code, rateType, rate });
      }
    }
  }

  if (upserts.length === 0) {
    return apiError(`No valid rates found. ${errors.slice(0, 5).join(" | ") || "Check sheets named CLOSING and AVERAGE with period headers like 2026M01."}`, 422);
  }

  // Upsert in a transaction
  let committed = 0;
  await prisma.$transaction(async (tx) => {
    for (const u of upserts) {
      await tx.fxRate.upsert({
        where: { fx_rate_key: { tenantId: auth.tid, fromCcy: u.fromCcy, toCcy: baseIso, periodCode: u.periodCode, rateType: u.rateType } },
        update: { rate: u.rate, uploadedBy: auth.sub, source: "manual-upload" },
        create: { tenantId: auth.tid, fromCcy: u.fromCcy, toCcy: baseIso, periodCode: u.periodCode, rateType: u.rateType, rate: u.rate, uploadedBy: auth.sub, source: "manual-upload" },
      });
      committed++;
    }
  }, { timeout: 30_000 });

  try { await audit({ tenantId: auth.tid, userId: auth.sub, action: "IMPORT", entityType: "fx_rate", entityId: file.name, metadata: { rowsCommitted: committed, errors: errors.length, filename: file.name }}); } catch {}

  return apiResponse({ rowsCommitted: committed, errors });
}
