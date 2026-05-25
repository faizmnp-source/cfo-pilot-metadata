// POST /api/v2/forms/preview-dsl
// Body: { dimensionCode: string, expression: string, limit?: number }
// Returns: { memberIds: string[], labels: Record<id, {code,name}>, count, truncated }
//
// Stateless live-preview endpoint for the form-builder UI. Resolves the
// DSL expression against the current dim members + hierarchy edges and
// returns up to `limit` resolved members for display. Errors return 400
// with the DslParseError message so the UI can show it inline.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { resolveAxisSelection } from "@/lib/forms/resolve-axes";

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;

  const body = await req.json().catch(() => null);
  if (!body?.dimensionCode || !body?.expression) {
    return apiError("dimensionCode and expression are required", 400);
  }
  const limit = Math.max(1, Math.min(1000, Number(body.limit) || 200));
  const dimCode = String(body.dimensionCode).toLowerCase();

  const [members, edges] = await Promise.all([
    prisma.dimensionMember.findMany({
      where: { tenantId: auth.tid, isActive: true, dimension: { code: dimCode }},
      select: { id: true, memberCode: true, memberName: true },
    }),
    prisma.hierarchyEdge.findMany({
      where: { tenantId: auth.tid, parent: { dimension: { code: dimCode }}},
      select: { parentMemberId: true, childMemberId: true },
    }),
  ]);

  try {
    const ids = resolveAxisSelection(
      { kind: "dsl", expression: body.expression },
      {
        dimensionCode: dimCode,
        members: members.map(m => ({ id: m.id, code: m.memberCode })),
        edges,
      },
    );
    const truncated = ids.length > limit;
    const slice = truncated ? ids.slice(0, limit) : ids;
    const labels: Record<string, { code: string; name: string }> = {};
    for (const m of members) if (slice.includes(m.id)) labels[m.id] = { code: m.memberCode, name: m.memberName };
    return apiResponse({ memberIds: slice, labels, count: ids.length, truncated });
  } catch (e: any) {
    return apiError(`DSL error: ${e?.message ?? e}`, 400);
  }
}
