// Data Forms CRUD — admin-defined input/review form templates.
//
// GET  /api/v2/forms                  → list all active forms for tenant
// POST /api/v2/forms                  → create a form (admin only)

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { audit } from "@/lib/audit-v2";

// Row/col selection variants — keep loose at the API layer; renderer enforces.
const SelectionSchema = z.union([
  z.object({ kind: z.literal("all_leaves") }),
  z.object({ kind: z.literal("children_of"), parentMemberId: z.string().uuid() }),
  z.object({ kind: z.literal("manual"), memberIds: z.array(z.string().uuid()).min(1) }),
]);

const CreateFormSchema = z.object({
  code:        z.string().min(1).max(64).regex(/^[a-z0-9_]+$/, "lowercase letters/digits/underscores only"),
  name:        z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  layoutType:  z.enum(["STANDARD", "VARIANCE", "SCENARIO_STACK"]),
  rowSelection: SelectionSchema,
  colSelection: SelectionSchema,
  scenarioIds:  z.array(z.string().uuid()).default([]),
  povDefaults:  z.record(z.string(), z.string().uuid()).default({}),
  isDefault:    z.boolean().default(false),
}).refine((d) => {
  // VARIANCE requires exactly 2 scenarios (e.g. Actual + Budget)
  if (d.layoutType === "VARIANCE" && d.scenarioIds.length !== 2) return false;
  // SCENARIO_STACK requires 2+ scenarios
  if (d.layoutType === "SCENARIO_STACK" && d.scenarioIds.length < 2) return false;
  return true;
}, { message: "Variance needs 2 scenarios; scenario stack needs ≥2" });

// ─── GET ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (code) {
    const form = await prisma.dataForm.findFirst({
      where: { tenantId: auth.tid, code, isActive: true },
    });
    if (!form) return apiError(`Form '${code}' not found`, 404);
    return apiResponse(form);
  }

  const forms = await prisma.dataForm.findMany({
    where: { tenantId: auth.tid, isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return apiResponse({ data: forms, total: forms.length });
}

// ─── POST ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  if (auth.role !== "ADMIN") return apiError("Admin role required to create forms", 403);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }
  const parsed = CreateFormSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const msg = first ? `${first.path.join(".") || "body"}: ${first.message}` : "Validation failed";
    return apiError(msg, 422, { issues: parsed.error.issues });
  }
  const input = parsed.data;

  // Duplicate code check
  const dup = await prisma.dataForm.findFirst({
    where: { tenantId: auth.tid, code: input.code },
    select: { id: true },
  });
  if (dup) return apiError(`Form code '${input.code}' already exists`, 409);

  // If this form claims default, clear any other default first
  if (input.isDefault) {
    await prisma.dataForm.updateMany({
      where: { tenantId: auth.tid, isDefault: true },
      data:  { isDefault: false },
    });
  }

  const created = await prisma.dataForm.create({
    data: {
      tenantId:     auth.tid,
      code:         input.code,
      name:         input.name,
      description:  input.description,
      layoutType:   input.layoutType as any,
      rowDimKind:   "ACCOUNT",
      rowSelection: input.rowSelection as any,
      colDimKind:   "TIME",
      colSelection: input.colSelection as any,
      scenarioIds:  input.scenarioIds,
      povDefaults:  input.povDefaults as any,
      isDefault:    input.isDefault,
      createdBy:    auth.sub,
      updatedBy:    auth.sub,
    },
  });

  try {
    await audit({
      tenantId:   auth.tid,
      userId:     auth.sub,
      action:     "CREATE",
      entityType: "data_form",
      entityId:   created.id,
      after:      created,
      metadata:   { code: input.code, layoutType: input.layoutType },
    });
  } catch { /* ignore */ }

  return apiResponse(created, 201);
}
