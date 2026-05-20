import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import * as XLSX from "xlsx";

const REQUIRED_COLUMNS: Record<string, string[]> = {
  ACCOUNT:      ["accountCode", "accountName", "accountType"],
  ENTITY:       ["entityCode", "entityName"],
  DEPARTMENT:   ["departmentCode", "departmentName"],
  COST_CENTER:  ["costCenterCode", "costCenterName"],
};

const PREVIEW_ROWS = 5;

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return apiError("Unauthorized", 401);
  if (auth.role !== "ADMIN") return apiError("Forbidden", 403);

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const dimensionType = formData.get("dimensionType") as string | null;

  if (!file || !dimensionType) return apiError("File and dimensionType are required", 400);
  if (!REQUIRED_COLUMNS[dimensionType]) return apiError("Invalid dimensionType", 400);

  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(bytes), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (rows.length === 0) return apiError("File is empty", 400);

  const required = REQUIRED_COLUMNS[dimensionType];
  const headers = Object.keys(rows[0]);
  const missingCols = required.filter(c => !headers.includes(c));

  const job = await prisma.importJob.create({
    data: {
      tenantId: auth.tid, fileName: file.name, originalFileName: file.name,
      fileSize: file.size, dimensionType: dimensionType as any,
      status: missingCols.length > 0 ? "VALIDATION_FAILED" : "PENDING",
      totalRecords: rows.length,
      previewData: JSON.parse(JSON.stringify(rows.slice(0, PREVIEW_ROWS))),
      validationReport: missingCols.length > 0 ? { errors: [{ type: "MISSING_COLUMNS", columns: missingCols }] } : null,
      createdBy: auth.sub, createdByName: auth.name,
    },
  });

  return apiResponse({ jobId: job.id, totalRecords: rows.length, headers, previewData: rows.slice(0, PREVIEW_ROWS), missingColumns: missingCols, status: job.status });
}
