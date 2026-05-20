import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return apiError("Unauthorized", 401);
  if (auth.role !== "ADMIN") return apiError("Forbidden", 403);

  const { jobId } = await req.json();
  const job = await prisma.importJob.findFirst({ where: { id: jobId, tenantId: auth.tid } });
  if (!job) return apiError("Import job not found", 404);
  if (job.status !== "VALIDATION_PASSED") return apiError("Job must pass validation before import", 400);

  await prisma.importJob.update({ where: { id: jobId }, data: { status: "IMPORTING", startedAt: new Date() } });

  const rows = (job.previewData as Record<string, string>[]) ?? [];
  let imported = 0;

  for (const row of rows) {
    try {
      if (job.dimensionType === "ACCOUNT") {
        await prisma.account.upsert({
          where: { tenantId_accountCode: { tenantId: auth.tid, accountCode: row.accountCode } },
          create: { tenantId: auth.tid, accountCode: row.accountCode, accountName: row.accountName, accountType: row.accountType as any, reportingGroup: row.reportingGroup, isActive: true, createdBy: auth.sub, updatedBy: auth.sub },
          update: { accountName: row.accountName, accountType: row.accountType as any, updatedBy: auth.sub },
        });
      } else if (job.dimensionType === "ENTITY") {
        await prisma.entity.upsert({
          where: { tenantId_entityCode: { tenantId: auth.tid, entityCode: row.entityCode } },
          create: { tenantId: auth.tid, entityCode: row.entityCode, entityName: row.entityName, country: row.country, isActive: true, createdBy: auth.sub, updatedBy: auth.sub },
          update: { entityName: row.entityName, updatedBy: auth.sub },
        });
      } else if (job.dimensionType === "DEPARTMENT") {
        await prisma.department.upsert({
          where: { tenantId_departmentCode: { tenantId: auth.tid, departmentCode: row.departmentCode } },
          create: { tenantId: auth.tid, departmentCode: row.departmentCode, departmentName: row.departmentName, isActive: true, createdBy: auth.sub, updatedBy: auth.sub },
          update: { departmentName: row.departmentName, updatedBy: auth.sub },
        });
      } else if (job.dimensionType === "COST_CENTER") {
        await prisma.costCenter.upsert({
          where: { tenantId_costCenterCode: { tenantId: auth.tid, costCenterCode: row.costCenterCode } },
          create: { tenantId: auth.tid, costCenterCode: row.costCenterCode, costCenterName: row.costCenterName, isActive: true, createdBy: auth.sub, updatedBy: auth.sub },
          update: { costCenterName: row.costCenterName, updatedBy: auth.sub },
        });
      }
      imported++;
    } catch (e) {
      console.error("[Import] Row error:", e);
    }
  }

  await prisma.importJob.update({ where: { id: jobId }, data: { status: "COMPLETED", importedRecords: imported, completedAt: new Date() } });
  await writeAuditLog({ tenantId: auth.tid, tableName: job.dimensionType.toLowerCase() + "s", recordId: jobId, dimensionType: job.dimensionType as any, action: "IMPORT", newValue: { imported, total: rows.length, jobId } as Record<string, unknown>, userId: auth.sub, userName: auth.name, userEmail: auth.email, userRole: auth.role });

  return apiResponse({ status: "COMPLETED", imported, total: rows.length });
}
