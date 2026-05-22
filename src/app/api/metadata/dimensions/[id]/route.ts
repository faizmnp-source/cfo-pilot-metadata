// PUT /api/metadata/dimensions/[id] — update a v2 Dimension row's label
// or isEnabled flag from the legacy Configure Dimensions page.
// DELETE is intentionally not supported (UD slots are upserted, not deleted).

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

export async function PUT(
  req: NextRequest,
  ctx: { params: { id: string } },
) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  if (auth.role !== "ADMIN") {
    return apiError("Admin role required to configure dimensions", 403);
  }

  let body: any = {};
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  // Tenant-scoped lookup
  const existing = await prisma.dimension.findFirst({
    where: { id: ctx.params.id, tenantId: auth.tid },
  });
  if (!existing) return apiError("Dimension not found", 404);

  const updated = await prisma.dimension.update({
    where: { id: ctx.params.id },
    data: {
      ...(typeof body.name === "string"      ? { label:     body.name.trim() } : {}),
      ...(typeof body.isActive === "boolean" ? { isEnabled: body.isActive }    : {}),
    },
    include: { _count: { select: { members: true } } },
  });

  return apiResponse({
    id:          updated.id,
    tenantId:    updated.tenantId,
    slot:        String(updated.kind),
    name:        updated.label,
    pluralName:  updated.label.endsWith("s") ? updated.label : `${updated.label}s`,
    description: null,
    iconName:    "Layers",
    color:       "text-gray-600",
    bgColor:     "bg-gray-50",
    isActive:    updated.isEnabled,
    sortOrder:   0,
    createdAt:   updated.createdAt,
    updatedAt:   updated.updatedAt,
    _count:      { members: updated._count.members },
  });
}

export async function DELETE() {
  return apiError(
    "Dimensions are upserted by slot, not deleted. Toggle isActive=false instead.",
    405,
  );
}
