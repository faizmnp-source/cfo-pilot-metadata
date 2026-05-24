// CalcRule CRUD — list + create + show.
//
// GET  /api/v2/calc-rules            — list all rules for tenant
// POST /api/v2/calc-rules            — create from explicit spec
// GET  /api/v2/calc-rules?id=<id>    — fetch single
//
// For NL → spec generation see /api/v2/calc-rules/vibe-create
// For execution see /api/v2/calc-rules/[id]/run

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    const rule = await prisma.calcRule.findFirst({
      where: { id, tenantId: auth.tid },
      include: { runs: { orderBy: { startedAt: "desc" }, take: 10 }},
    });
    if (!rule) return apiError("Not found", 404);
    return apiResponse(rule);
  }

  const rules = await prisma.calcRule.findMany({
    where: { tenantId: auth.tid },
    orderBy: [{ updatedAt: "desc" }],
    include: { _count: { select: { runs: true }}},
  });
  return apiResponse({ data: rules });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  let body: any;
  try { body = await req.json(); } catch { return apiError("Invalid JSON", 400); }

  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (!code || !name) return apiError("code and name are required", 400);
  if (!body.spec || typeof body.spec !== "object") return apiError("spec object is required", 400);

  // Sanity check spec shape
  if (!body.spec.filters || !body.spec.formula || !body.spec.output) {
    return apiError("spec must have { filters, formula, output }", 400);
  }

  const existing = await prisma.calcRule.findFirst({ where: { tenantId: auth.tid, code }});
  if (existing) return apiError(`Rule with code '${code}' already exists`, 409);

  const rule = await prisma.calcRule.create({
    data: {
      tenantId:    auth.tid,
      code, name,
      description: body.description ?? null,
      spec:        body.spec,
      kind:        body.kind ?? "PERCENTAGE",
      status:      body.status ?? "DRAFT",
      source:      body.source ?? "manual",
      vibePrompt:  body.vibePrompt ?? null,
      vibeModel:   body.vibeModel ?? null,
      createdBy:   auth.sub,
    },
  });
  return apiResponse(rule, 201);
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  let body: any;
  try { body = await req.json(); } catch { return apiError("Invalid JSON", 400); }
  const id = String(body.id ?? "").trim();
  if (!id) return apiError("id is required", 400);

  const existing = await prisma.calcRule.findFirst({ where: { id, tenantId: auth.tid }});
  if (!existing) return apiError("Not found", 404);

  const updateData: any = { updatedBy: auth.sub };
  if (body.name)         updateData.name        = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.spec)         updateData.spec        = body.spec;
  if (body.kind)         updateData.kind        = body.kind;
  if (body.status)       updateData.status      = body.status;

  const updated = await prisma.calcRule.update({ where: { id }, data: updateData });
  return apiResponse(updated);
}

export async function DELETE(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return apiError("id required", 400);

  const existing = await prisma.calcRule.findFirst({ where: { id, tenantId: auth.tid }});
  if (!existing) return apiError("Not found", 404);

  await prisma.calcRule.delete({ where: { id }});
  return apiResponse({ deleted: true });
}
