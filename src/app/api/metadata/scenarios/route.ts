import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission, getPaginationParams } from "@/lib/api-helpers";
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

export async function GET(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "scenario", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;
  const p = getPaginationParams(req.nextUrl.searchParams);
  const sortBy = p.sortBy === "createdAt" ? "scenarioCode" : p.sortBy;

  const where = {
    tenantId: auth.tid,
    ...(p.isActive !== undefined && { isActive: p.isActive }),
    ...(p.search && {
      OR: [
        { scenarioCode: { contains: p.search, mode: "insensitive" as const } },
        { scenarioName: { contains: p.search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    prisma.scenario.findMany({
      where,
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      orderBy: { [sortBy]: p.sortOrder },
    }),
    prisma.scenario.count({ where }),
  ]);

  return apiResponse({ data, total, page: p.page, pageSize: p.pageSize, totalPages: Math.ceil(total / p.pageSize) });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "scenario", "create");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const body = await req.json();
  const parsed = ScenarioSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  const exists = await prisma.scenario.findUnique({
    where: { tenantId_scenarioCode: { tenantId: auth.tid, scenarioCode: parsed.data.scenarioCode } },
  });
  if (exists) return apiError("Scenario code already exists", 409);

  const scenario = await prisma.scenario.create({
  });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "scenarios",
    recordId: scenario.id,
    dimensionType: "SCENARIO",
    action: "CREATE",
    newValue: scenario as Record<string, unknown>,
    userId: auth.sub,
    userName: auth.name,
    userEmail: auth.email,
    userRole: auth.role,
  });

  return apiResponse(scenario, 201);
}
