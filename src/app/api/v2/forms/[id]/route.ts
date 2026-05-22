// Single-form read / update / soft-delete
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { audit } from "@/lib/audit-v2";

const SelectionSchema = z.union([
  z.object({ kind: z.literal("all_leaves") }),
  z.object({ kind: z.literal("children_of"), parentMemberId: z.string().uuid() }),
  z.object({ kind: z.literal("manual"), memberIds: z.array(z.string().uuid()).min(1) }),
]);

const UpdateFormSchema = z.object({
  name:         z.string().min(1).max(120).optional(),
  description:  z.string().max(500).nullable().optional(),
  layoutType:   z.enum(["STANDARD", "VARIANCE", "SCENARIO_STACK"]).optional(),
  rowSelection: SelectionSchema.optional(),
  colSelection: SelectionSchema.optional(),
  scenarioIds:  z.array(z.string().uuid()).optional(),
  povDefaults:  z.record(z.string(), z.string().uuid()).optional(),
  isDefault:    z.boolean().optional(),
  isActive:     z.boolean().optional(),
});

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const form = await prisma.dataForm.findFirst({
    where: { id: ctx.params.id, tenantId: auth.tid },
  });
  if (!form) return apiError("Not found", 404);
  return apiResponse(form);
}

export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  if (auth.role !== "ADMIN") return apiError("Admin role required", 403);

  const existing = await prisma.dataForm.findFirst({
    where: { id: ctx.params.id, tenantId: auth.tid },
  });
  if (!existing) return apiError("Not found", 404);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }
  const parsed = UpdateFormSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const msg = first ? `${first.path.join(".") || "body"}: ${first.message}` : "Validation failed";
    return apiError(msg, 422, { issues: parsed.error.issues });
  }
  const input = parsed.data;

  if (input.isDefault) {
    await prisma.dataForm.updateMany({
      where: { tenantId: auth.tid, isDefault: true, NOT: { id: existing.id } },
      data:  { isDefault: false },
    });
  }

  const updated = await prisma.dataForm.update({
    where: { id: existing.id },
    data: {
      name:         input.name        ?? existing.name,
      description:  input.description !== undefined ? input.description : existing.description,
      layoutType:   (input.layoutType ?? existing.layoutType) as any,
      rowSelection: (input.rowSelection ?? existing.rowSelection) as any,
      colSelection: (input.colSelection ?? existing.colSelection) as any,
      scenarioIds:  input.scenarioIds ?? existing.scenarioIds,
      povDefaults:  (input.povDefaults ?? existing.povDefaults) as any,
      isDefault:    input.isDefault   ?? existing.isDefault,
      isActive:     input.isActive    ?? existing.isActive,
      updatedBy:    auth.sub,
    },
  });

  try {
    await audit({
      tenantId: auth.tid, userId: auth.sub, action: "UPDATE",
      entityType: "data_form", entityId: existing.id,
      before: existing, after: updated, metadata: { code: existing.code },
    });
  } catch { /* ignore */ }

  return apiResponse(updated);
}

export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  if (auth.role !== "ADMIN") return apiError("Admin role required", 403);

  const existing = await prisma.dataForm.findFirst({
    where: { id: ctx.params.id, tenantId: auth.tid },
  });
  if (!existing) return apiError("Not found", 404);

  // Soft-delete to preserve audit + any cells that reference the form
  await prisma.dataForm.update({
    where: { id: existing.id },
    data:  { isActive: false, updatedBy: auth.sub },
  });

  try {
    await audit({
      tenantId: auth.tid, userId: auth.sub, action: "DELETE",
      entityType: "data_form", entityId: existing.id,
      before: existing, metadata: { code: existing.code },
    });
  } catch { /* ignore */ }

  return apiResponse({ id: existing.id, deleted: true });
}
