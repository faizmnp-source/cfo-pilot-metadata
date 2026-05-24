// GET /api/v2/hierarchy?slug=entity
// Returns all parent→child edges for the dim. Used by HierarchyMemberPicker
// to render the tree client-side.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

const SLUG_TO_KIND: Record<string, string> = {
  account: "ACCOUNT", entity: "ENTITY", scenario: "SCENARIO", time: "TIME",
  currency: "CURRENCY", icp: "ICP", origin: "ORIGIN",
  ud1: "UD1", ud2: "UD2", ud3: "UD3", ud4: "UD4",
  ud5: "UD5", ud6: "UD6", ud7: "UD7", ud8: "UD8",
};

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const kind = SLUG_TO_KIND[slug?.toLowerCase() ?? ""];
  if (!kind) return apiError("slug required (e.g. entity, account, ud3)", 400);

  // Find the dim
  const dim = await prisma.dimension.findFirst({
    where: { tenantId: auth.tid, kind: kind as any },
    select: { id: true },
  });
  if (!dim) return apiResponse({ edges: [], count: 0 });

  // Find all hierarchies for this dim
  const hiers = await prisma.hierarchy.findMany({
    where: { tenantId: auth.tid, dimensionId: dim.id },
    select: { id: true },
  });

  if (hiers.length === 0) return apiResponse({ edges: [], count: 0 });

  const edges = await prisma.hierarchyEdge.findMany({
    where: { tenantId: auth.tid, hierarchyId: { in: hiers.map(h => h.id) }},
    select: { parentMemberId: true, childMemberId: true, operator: true },
  });

  return apiResponse({
    slug,
    kind,
    edges,
    count: edges.length,
  });
}
