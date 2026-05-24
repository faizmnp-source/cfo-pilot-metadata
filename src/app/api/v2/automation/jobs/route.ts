// Automation Job CRUD.
//
// GET   /api/v2/automation/jobs           — list
// GET   /api/v2/automation/jobs?id=<id>   — one + recent runs
// POST  /api/v2/automation/jobs           — create
// PATCH /api/v2/automation/jobs           — update (toggle enabled, change params)
// DELETE /api/v2/automation/jobs?id=<id>  — delete (cascades runs)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

const VALID_KINDS = new Set([
  "EXPORT_FACTS", "EXPORT_METADATA", "RUN_CONSOLIDATION",
  "RUN_CALC_RULE", "SEND_REPORT", "RUN_PIPELINE",
]);

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    const job = await prisma.automationJob.findFirst({
      where: { id, tenantId: auth.tid },
      include: { runs: { orderBy: { startedAt: "desc" }, take: 20 }},
    });
    if (!job) return apiError("Not found", 404);
    return apiResponse(job);
  }

  const jobs = await prisma.automationJob.findMany({
    where: { tenantId: auth.tid },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { runs: true }}},
  });
  return apiResponse({ data: jobs });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  let body: any;
  try { body = await req.json(); } catch { return apiError("Invalid JSON", 400); }

  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  const kind = String(body.kind ?? "").trim();
  if (!code || !name || !kind) return apiError("code, name, kind required", 400);
  if (!VALID_KINDS.has(kind)) return apiError(`kind must be one of: ${Array.from(VALID_KINDS).join(", ")}`, 400);

  const existing = await prisma.automationJob.findFirst({ where: { tenantId: auth.tid, code }});
  if (existing) return apiError(`Job with code '${code}' already exists`, 409);

  const job = await prisma.automationJob.create({
    data: {
      tenantId:    auth.tid,
      code, name, kind,
      description: body.description ?? null,
      params:      body.params ?? {},
      schedule:    body.schedule ?? "manual",
      timezone:    body.timezone ?? "UTC",
      enabled:     body.enabled ?? true,
      createdBy:   auth.sub,
    },
  });
  return apiResponse(job, 201);
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  let body: any;
  try { body = await req.json(); } catch { return apiError("Invalid JSON", 400); }
  const id = String(body.id ?? "").trim();
  if (!id) return apiError("id required", 400);

  const existing = await prisma.automationJob.findFirst({ where: { id, tenantId: auth.tid }});
  if (!existing) return apiError("Not found", 404);

  const data: any = { updatedBy: auth.sub };
  if (body.name)        data.name        = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.params)      data.params      = body.params;
  if (body.schedule)    data.schedule    = body.schedule;
  if (body.timezone)    data.timezone    = body.timezone;
  if (body.enabled !== undefined) data.enabled = body.enabled;

  const updated = await prisma.automationJob.update({ where: { id }, data });
  return apiResponse(updated);
}

export async function DELETE(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return apiError("id required", 400);

  const existing = await prisma.automationJob.findFirst({ where: { id, tenantId: auth.tid }});
  if (!existing) return apiError("Not found", 404);

  await prisma.automationJob.delete({ where: { id }});
  return apiResponse({ deleted: true });
}
