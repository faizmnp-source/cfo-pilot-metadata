// POST /api/v2/analyze/pivot
// Body: { povIds: { scenarioId, timeId, entityIds[] },
//         rowDim:  "account" | "entity" | "time" | ...,
//         colDim:  "time" | "scenario" | "entity" | ...,
//         rowMemberIds?: string[],   // optional; defaults to leaf rollups
//         colMemberIds?: string[],   // optional; defaults to leaf rollups
//         aggregator?: "SUM" | "AVG" | "COUNT" }
// Returns: { rows: [{ memberId, code, name }],
//            cols: [{ memberId, code, name }],
//            cells: number[][],   // [rowIdx][colIdx]
//            totals: { byRow: number[], byCol: number[], grand: number }}
//
// Generic pivot. POV restricts the slice; rowDim + colDim each give
// you a sequence of dim members; cells aggregate FactRow.valueReporting.
// Section 8 (Ad Hoc) MVP. Drag-drop UX layer comes later.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

type Dim = "account" | "entity" | "time" | "scenario" | "currency" | "icp"
         | "ud1" | "ud2" | "ud3" | "ud4" | "ud5" | "ud6" | "ud7" | "ud8";

const DIM_FACT_KEY: Record<Dim, string> = {
  account: "accountId",  entity:  "entityId",  time: "timeId",
  scenario:"scenarioId", currency:"currencyId", icp:  "icpId",
  ud1:"ud1Id", ud2:"ud2Id", ud3:"ud3Id", ud4:"ud4Id",
  ud5:"ud5Id", ud6:"ud6Id", ud7:"ud7Id", ud8:"ud8Id",
};

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const body = await req.json().catch(() => null);
  if (!body?.povIds?.scenarioId || !body?.povIds?.timeId)
    return apiError("povIds.scenarioId + povIds.timeId required", 400);
  const rowDim = String(body.rowDim ?? "").toLowerCase() as Dim;
  const colDim = String(body.colDim ?? "").toLowerCase() as Dim;
  if (!DIM_FACT_KEY[rowDim] || !DIM_FACT_KEY[colDim]) return apiError("rowDim/colDim invalid", 400);
  if (rowDim === colDim) return apiError("rowDim and colDim must differ", 400);
  const agg = (body.aggregator ?? "SUM") as "SUM"|"AVG"|"COUNT";

  // Resolve time leaves so an FY period expands
  const { resolveTimeMembersToLeafMonths } = await import("@/lib/reports/time-resolver");
  const timeCode = (await prisma.dimensionMember.findFirst({
    where: { id: body.povIds.timeId, tenantId: auth.tid }, select: { memberCode: true },
  }))?.memberCode;
  const leafMonthIds: string[] = timeCode
    ? (await resolveTimeMembersToLeafMonths(auth.tid, timeCode)).leafMonthIds
    : [body.povIds.timeId];

  // Build the WHERE for fact pull
  const where: any = {
    tenantId: auth.tid,
    scenarioId: body.povIds.scenarioId,
    isCurrent: true,
  };
  if (colDim !== "time" && rowDim !== "time") {
    // Time is restricted by POV (full FY); both axes are other dims
    where.timeId = { in: leafMonthIds };
  } else {
    // Time IS one of the axes — let it be wide
    where.timeId = { in: leafMonthIds };
  }
  if ((body.povIds.entityIds?.length ?? 0) > 0 && rowDim !== "entity" && colDim !== "entity") {
    where.entityId = { in: body.povIds.entityIds };
  }

  // Pull rows + cols definitions (members of each axis dim). Default = all
  // members for the dim; caller can scope via rowMemberIds / colMemberIds.
  const fetchDim = async (dim: Dim, ids?: string[]) => {
    return prisma.dimensionMember.findMany({
      where: {
        tenantId: auth.tid, isActive: true,
        dimension: { code: dim },
        ...(ids?.length ? { id: { in: ids }} : {}),
      },
      select: { id: true, memberCode: true, memberName: true },
      orderBy: { memberCode: "asc" },
      take: 500,
    });
  };
  const [rowMembers, colMembers] = await Promise.all([
    fetchDim(rowDim, body.rowMemberIds),
    fetchDim(colDim, body.colMemberIds),
  ]);
  const rowIdxById = new Map(rowMembers.map((m, i) => [m.id, i]));
  const colIdxById = new Map(colMembers.map((m, i) => [m.id, i]));

  // Pull all matching facts in one query
  const facts = await prisma.factRow.findMany({
    where, take: 100_000,
    select: {
      valueReporting: true,
      ...Object.fromEntries(Object.values(DIM_FACT_KEY).map(k => [k, true])),
    } as any,
  });

  // Build the cell grid
  const cells: number[][] = rowMembers.map(() => colMembers.map(() => 0));
  const counts: number[][] = rowMembers.map(() => colMembers.map(() => 0));
  const rowKey = DIM_FACT_KEY[rowDim] as keyof typeof facts[number];
  const colKey = DIM_FACT_KEY[colDim] as keyof typeof facts[number];

  for (const f of facts as any[]) {
    const ri = rowIdxById.get(f[rowKey] as string);
    const ci = colIdxById.get(f[colKey] as string);
    if (ri === undefined || ci === undefined) continue;
    cells[ri][ci] += Number(f.valueReporting);
    counts[ri][ci]++;
  }
  if (agg === "AVG") {
    for (let r = 0; r < cells.length; r++) for (let c = 0; c < cells[r].length; c++)
      cells[r][c] = counts[r][c] === 0 ? 0 : cells[r][c] / counts[r][c];
  } else if (agg === "COUNT") {
    for (let r = 0; r < cells.length; r++) for (let c = 0; c < cells[r].length; c++)
      cells[r][c] = counts[r][c];
  }

  // Totals
  const byRow = cells.map(row => row.reduce((a, b) => a + b, 0));
  const byCol = colMembers.map((_, c) => cells.reduce((sum, row) => sum + row[c], 0));
  const grand = byRow.reduce((a, b) => a + b, 0);

  return apiResponse({
    rows:  rowMembers.map(m => ({ memberId: m.id, code: m.memberCode, name: m.memberName })),
    cols:  colMembers.map(m => ({ memberId: m.id, code: m.memberCode, name: m.memberName })),
    cells, totals: { byRow, byCol, grand },
    meta: { rowDim, colDim, aggregator: agg, factsRead: facts.length },
  });
}
