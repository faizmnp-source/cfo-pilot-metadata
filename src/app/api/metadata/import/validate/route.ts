import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import * as XLSX from "xlsx";

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return apiError("Unauthorized", 401);
  if (auth.role !== "ADMIN") return apiError("Forbidden", 403);

  const { jobId } = await req.json();
  const job = await prisma.importJob.findFirst({ where: { id: jobId, tenantId: auth.tid } });
  if (!job) return apiError("Import job not found", 404);

  await prisma.importJob.update({ where: { id: jobId }, data: { status: "VALIDATING" } });

  // Try AI service; fall back to local validation
  let validationResult;
  try {
    const aiUrl = process.env.AI_SERVICE_URL ?? "http://localhost:8000";
    const resp = await fetch(`${aiUrl}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": process.env.AI_SERVICE_API_KEY ?? "" },
      body: JSON.stringify({ jobId, tenantId: auth.tid, dimensionType: job.dimensionType, rows: job.previewData }),
      signal: AbortSignal.timeout(5000),
    });
    validationResult = await resp.json();
  } catch {
    // Local fallback validation
    const rows = (job.previewData as Record<string, string>[]) ?? [];
    const errors: unknown[] = [];
    const codes = new Set<string>();
    rows.forEach((row, i) => {
      const code = row.accountCode ?? row.entityCode ?? row.departmentCode ?? row.costCenterCode ?? "";
      if (!code) errors.push({ row: i+1, errorType: "MISSING_REQUIRED_FIELD", severity: "ERROR", field: "code", message: "Code is required", recommendation: "Add a unique code", fixable: false });
      if (codes.has(code)) errors.push({ row: i+1, errorType: "DUPLICATE_CODE", severity: "ERROR", field: "code", message: `Duplicate code: ${code}`, recommendation: `Make code unique`, fixable: true, suggestedFix: `${code}_DUP_${i+1}` });
      codes.add(code);
      if (job.dimensionType === "ACCOUNT" && row.accountType && !["ASSET","LIABILITY","EQUITY","REVENUE","EXPENSE"].includes(row.accountType)) {
        errors.push({ row: i+1, errorType: "INVALID_ACCOUNT_TYPE", severity: "ERROR", field: "accountType", message: `Invalid accountType: ${row.accountType}`, recommendation: "Must be ASSET, LIABILITY, EQUITY, REVENUE, or EXPENSE", fixable: false });
      }
    });
    validationResult = { errors, validCount: rows.length - errors.length, invalidCount: errors.length };
  }

  const status = validationResult.invalidCount === 0 ? "VALIDATION_PASSED" : "VALIDATION_FAILED";
  const updated = await prisma.importJob.update({
    where: { id: jobId },
    data: { status, validRecords: validationResult.validCount, invalidRecords: validationResult.invalidCount, validationReport: JSON.parse(JSON.stringify(validationResult)) },
  });

  return apiResponse({ status, validRecords: updated.validRecords, invalidRecords: updated.invalidRecords, report: validationResult });
}
