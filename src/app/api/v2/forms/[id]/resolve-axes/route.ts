// POST /api/v2/forms/[id]/resolve-axes
//   Resolves the form's row + col selections (including DSL expressions)
//   against the current dimension members + hierarchy edges. Returns the
//   expanded member ids, plus a label map for the UI.
//
// No writes. Used by /data/input when it loads a form.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { resolveAxisSelection, type AxisSelection } from "@/lib/forms/resolve-axes";

const DIM_KIND_TO_CODE: Record<string, string> = {
  ACCOUNT: "account", ENTITY: "entity", SCENARIO: "scenario",
  TIME: "time",     CURRENCY: "currency", ICP: "icp",
  ORIGIN: "origin",
  UD1: "ud1", UD2: "ud2", UD3: "ud3", UD4: "ud4",
  UD5: "ud5", UD6: "ud6", UD7: "ud7", UD8: "ud8",
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const { id: formId } = await ctx.params;

  const form = await prisma.dataForm.findFirst({
    where: { id: formId, tenantId: auth.tid },
  });
  if (!form) return apiError("Form not found", 404);

  // Helper: resolve one axis (rowDimKind+rowSelection or colDimKind+colSelection)
  const resolveOne = async (dimKind: string, selection: any) => {
    const dimCode = DIM_KIND_TO_CODE[dimKind] ?? dimKind.toLowerCase();
    const members = await prisma.dimensionMember.findMany({
      where: { tenantId: auth.tid, isActive: true, dimension: { code: dimCode }},
      select: { id: true, memberCode: true, memberName: true },
    });
    const edges = await prisma.hierarchyEdge.findMany({
      where: { tenantId: auth.tid, parent: { dimension: { code: dimCode }}},
      select: { parentMemberId: true, childMemberId: true },
    });
    const ids = resolveAxisSelection(selection as AxisSelection, {
      dimensionCode: dimCode,
      members: members.map(m => ({ id: m.id, code: m.memberCode })),
      edges,
    });
    const labelMap: Record<string, { code: string; name: string }> =
      Object.fromEntries(members.filter(m => ids.includes(m.id)).map(m => [m.id, { code: m.memberCode, name: m.memberName }]));
    return { ids, labelMap };
  };

  try {
    const [row, col] = await Promise.all([
      resolveOne(form.rowDimKind, form.rowSelection),
      resolveOne(form.colDimKind, form.colSelection),
    ]);
    return apiResponse({
      formId,
      row: { dimKind: form.rowDimKind, memberIds: row.ids, labels: row.labelMap },
      col: { dimKind: form.colDimKind, memberIds: col.ids, labels: col.labelMap },
      // For VARIANCE / SCENARIO_STACK the cols cross-join with these scenarios
      scenarioIds: form.scenarioIds,
    });
  } catch (e: any) {
    // DslParseError or anything that bubbled up
    return apiError(`Failed to resolve axes: ${e?.message ?? e}`, 400);
  }
}
