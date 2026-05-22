// /api/metadata/dimensions — legacy UD configurator endpoint.
//
// In the v2 schema, user-defined dimensions are just Dimension rows with
// kind starting with "UD" and isCustom=true. The legacy /metadata/dimensions
// page expects a richer payload (slot, name, pluralName, color, bgColor,
// sortOrder, _count.members) so we synthesize those fields here on the
// read path. New work should target /api/v2/tenant-features and the new
// Dimension Library page; this route exists only to keep the legacy UI
// from crashing during the migration window.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuth } from "@/lib/api-helpers";
import type { Dimension } from "@prisma/client";

const SLOT_DEFAULTS: Record<string, { color: string; bgColor: string; sortOrder: number }> = {
  UD1: { color: "text-violet-600",  bgColor: "bg-violet-50",  sortOrder: 1 },
  UD2: { color: "text-pink-600",    bgColor: "bg-pink-50",    sortOrder: 2 },
  UD3: { color: "text-orange-600",  bgColor: "bg-orange-50",  sortOrder: 3 },
  UD4: { color: "text-emerald-600", bgColor: "bg-emerald-50", sortOrder: 4 },
  UD5: { color: "text-sky-600",     bgColor: "bg-sky-50",     sortOrder: 5 },
  UD6: { color: "text-amber-600",   bgColor: "bg-amber-50",   sortOrder: 6 },
  UD7: { color: "text-rose-600",    bgColor: "bg-rose-50",    sortOrder: 7 },
  UD8: { color: "text-indigo-600",  bgColor: "bg-indigo-50",  sortOrder: 8 },
};

function toLegacyShape(d: Dimension & { _count: { members: number } }) {
  const slot = String(d.kind);
  const defaults = SLOT_DEFAULTS[slot] ?? { color: "text-gray-600", bgColor: "bg-gray-50", sortOrder: 99 };
  return {
    id:          d.id,
    tenantId:    d.tenantId,
    slot,
    name:        d.label,
    pluralName:  d.label.endsWith("s") ? d.label : `${d.label}s`,
    description: null,
    iconName:    "Layers",
    color:       defaults.color,
    bgColor:     defaults.bgColor,
    isActive:    d.isEnabled,
    sortOrder:   defaults.sortOrder,
    createdAt:   d.createdAt,
    updatedAt:   d.updatedAt,
    _count:      { members: d._count.members },
  };
}

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  try {
    const dims = await prisma.dimension.findMany({
      where: { tenantId: auth.tid, isCustom: true },
      include: { _count: { select: { members: true } } },
      orderBy: { kind: "asc" },
    });

    const data = dims
      .filter((d) => String(d.kind).startsWith("UD"))
      .map(toLegacyShape);

    return apiResponse({
      data,
      total:      data.length,
      page:       1,
      pageSize:   data.length,
      totalPages: 1,
    });
  } catch (err) {
    console.error("[api/metadata/dimensions GET]", err);
    return apiError("Failed to load dimensions", 500);
  }
}

// POST/PUT to this legacy endpoint is intentionally 410 — UD configuration
// now happens through /api/v2/tenant-features and the new Library page.
export async function POST() {
  return apiError(
    "This endpoint is deprecated. Use the Dimension Library to manage UDx slots.",
    410,
  );
}
