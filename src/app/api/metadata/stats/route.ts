import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return apiError("Unauthorized", 401);
  const tid = auth.tid;
  const since24h = new Date(Date.now() - 86400000);
  const [accounts, entities, departments, costCenters, currencies, scenarios, recentChanges, importJobs] = await Promise.all([
    prisma.account.count({ where: { tenantId: tid, isActive: true } }),
    prisma.entity.count({ where: { tenantId: tid, isActive: true } }),
    prisma.department.count({ where: { tenantId: tid, isActive: true } }),
    prisma.costCenter.count({ where: { tenantId: tid, isActive: true } }),
    prisma.currency.count({ where: { tenantId: tid, isActive: true } }),
    prisma.scenario.count({ where: { tenantId: tid, isActive: true } }),
    prisma.auditLog.count({ where: { tenantId: tid, createdAt: { gte: since24h } } }),
    prisma.importJob.count({ where: { tenantId: tid } }),
  ]);
  return apiResponse({ accounts, entities, departments, costCenters, currencies, scenarios, recentChanges, importJobs, validationErrors: 0 });
}
