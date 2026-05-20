import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const ScenarioSchema = z.object({
  scenarioCode: z.string().min(1).max(50),
  scenarioName: z.string().min(1).max(200),
  scenarioType: z.string().min(1).max(50),
  fiscalYear: z.number().int().min(1900).max(2200),
  description: z.string().max(500).optional().nullable(),
  isLocked: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "scenario", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const scenario = await prisma.scenario.findFirst({
    where: { id: params.id, tenantId: auth.tid },
  });
  if (!scenario) return apiError("Scenario not found", 404);
  return apiResponse(scenario);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "scenario", "update");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.scenario.findFirst({ where: { id: params.id, tenantId: auth.tid } });
  if (!existing) return apiError("Scenario not found", 404);

  const body = await req.json();
  const parsed = ScenarioSchema.partial().safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  const updated = await prisma.scenario.update({
    where: { id: params.id },
    data: { ...parsed.data },
  });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "scenarios",
    recordId: params.id,
    dimensionType: "SCENARIO",
    action: "UPDATE",
    oldValue: existing as Record<string, unknown>,
    newValue: updated as Record<string, unknown>,
    userId: auth.sub,
    userName: auth.name,
    userEmail: auth.email,
    userRole: auth.role,
  });

  return apiResponse(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireAuthAndPermission(req, "scenario", "delete");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.scenario.findFirst({ where: { id: params.id, tenantId: auth.tid } });
  if (!existing) return apiError("Scenario not found", 404);

  await prisma.scenario.delete({ where: { id: params.id } });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "scenarios",
    recordId: params.id,
    dimensionType: "SCENARIO",
    action: "DELETE",
    oldValue: existing as Record<string, unknown>,
    userId: auth.sub,
    userName: auth.name,
    userEmail: auth.email,
    userRole: auth.role,
  });

  return apiResponse({ deleted: true });
}
