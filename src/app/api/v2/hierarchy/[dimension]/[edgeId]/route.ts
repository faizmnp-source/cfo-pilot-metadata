// Remove a single hierarchy edge by id.
//
// URL: DELETE /api/v2/hierarchy/account/<edge_id>

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse as apiSuccess } from "@/lib/utils";
import { audit } from "@/lib/audit-v2";
import { resolveDimKind } from "@/lib/dim-schemas";

export async function DELETE(
  req: NextRequest,
  ctx: { params: { dimension: string; edgeId: string } }
) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const kind = resolveDimKind(ctx.params.dimension);
  if (!kind) return apiError(`Unknown dimension: ${ctx.params.dimension}`, 400);

  const edge = await prisma.hierarchyEdge.findFirst({
    where: { id: ctx.params.edgeId, tenantId: auth.tid },
    include: {
      hierarchy: { include: { dimension: { select: { kind: true } } } },
    },
  });
  if (!edge) return apiError("Edge not found", 404);
  if (edge.hierarchy.dimension.kind !== kind) {
    return apiError("Edge does not belong to this dimension", 400);
  }

  await prisma.hierarchyEdge.delete({ where: { id: edge.id } });

  try {
    await audit({
      tenantId: auth.tid,
      userId: auth.sub,
      action: "DELETE",
      entityType: "hierarchy_edge",
      entityId: edge.id,
      before: edge,
      metadata: { dimension: kind, hierarchy: edge.hierarchy.code },
    });
  } catch { /* ignore */ }

  return apiSuccess({ id: edge.id, deleted: true });
}
