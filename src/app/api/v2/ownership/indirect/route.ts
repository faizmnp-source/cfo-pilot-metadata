import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiResponse } from "@/lib/utils";
import { indirectOwnershipMatrix } from "@/lib/ownership/solver";

export async function GET(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const edges = await (prisma as any).entityOwnership.findMany({
    where: { tenantId: auth.tid },
    select: { parentEntityId: true, childEntityId: true, pctOwned: true },
  });
  const matrix = indirectOwnershipMatrix(edges.map((e: any) => ({ parentId: e.parentEntityId, childId: e.childEntityId, pct: Number(e.pctOwned) })));
  const out: Record<string, Record<string, number>> = {};
  for (const [parent, kids] of Array.from(matrix.entries())) {
    const m: Record<string, number> = {};
    for (const [child, pct] of Array.from(kids.entries())) m[child] = Number((pct * 100).toFixed(4));
    out[parent] = m;
  }
  return apiResponse({ matrix: out });
}
