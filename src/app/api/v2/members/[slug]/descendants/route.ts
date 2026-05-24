// GET /api/v2/members/{slug}/descendants?parentId=X[&includeSelf=true]
//
// Returns the IDs of all DESCENDANTS of a parent member, walking the
// hierarchy edges depth-first. Used by Forecasting, Dashboard, Reports —
// "pick a parent (e.g. APOLLO_GRP) and include all hospitals underneath."
//
// slug = dimension slug ('entity', 'account', 'ud3', etc.)

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

const MAX_DEPTH = 12;

const SLUG_TO_KIND: Record<string, string> = {
  account: "ACCOUNT", entity: "ENTITY", scenario: "SCENARIO",
  time: "TIME", currency: "CURRENCY", icp: "ICP", origin: "ORIGIN",
  ud1: "UD1", ud2: "UD2", ud3: "UD3", ud4: "UD4",
  ud5: "UD5", ud6: "UD6", ud7: "UD7", ud8: "UD8",
};

export async function GET(req: NextRequest, { params }: { params: { slug: string }}) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const kind = SLUG_TO_KIND[params.slug?.toLowerCase()];
  if (!kind) return apiError(`Unknown dimension slug: ${params.slug}`, 400);

  const url = new URL(req.url);
  const parentId   = url.searchParams.get("parentId");
  const parentCode = url.searchParams.get("parentCode");
  const includeSelf = url.searchParams.get("includeSelf") === "true";
  const onlyLeaves  = url.searchParams.get("onlyLeaves")  === "true";

  if (!parentId && !parentCode) return apiError("parentId or parentCode required", 400);

  // Resolve parent
  let rootId = parentId;
  if (!rootId && parentCode) {
    const found = await prisma.dimensionMember.findFirst({
      where: { tenantId: auth.tid, dimension: { kind: kind as any }, memberCode: parentCode },
      select: { id: true },
    });
    if (!found) return apiError(`Member ${parentCode} not found in dim ${params.slug}`, 404);
    rootId = found.id;
  }

  // BFS through hierarchy edges (any hierarchy that links this member)
  const descendants: string[] = [];
  let frontier: string[] = [rootId!];
  const seen = new Set<string>([rootId!]);

  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth++) {
    const edges = await prisma.hierarchyEdge.findMany({
      where: { tenantId: auth.tid, parentMemberId: { in: frontier }},
      select: { parentMemberId: true, childMemberId: true },
    });
    const parentsWithChildren = new Set(edges.map(e => e.parentMemberId));
    const childIds = edges.map(e => e.childMemberId).filter(id => !seen.has(id));

    // If onlyLeaves: members in frontier with NO children are leaves
    if (onlyLeaves) {
      for (const id of frontier) {
        if (!parentsWithChildren.has(id) && id !== rootId) descendants.push(id);
      }
    } else {
      // includeAll: every descendant added (frontier excluding root if !includeSelf)
      for (const id of frontier) {
        if (id !== rootId) descendants.push(id);
      }
    }

    for (const id of childIds) seen.add(id);
    frontier = childIds;
  }
  // Any remaining frontier (leaves at max depth or hierarchy ended) — count if onlyLeaves
  if (onlyLeaves && frontier.length > 0) {
    for (const id of frontier) descendants.push(id);
  }

  // Optionally include the root itself
  const ids = includeSelf ? [rootId!, ...descendants] : descendants;

  // Hydrate member details for the result
  const members = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, id: { in: ids }, isActive: true },
    select: { id: true, memberCode: true, memberName: true, properties: true },
    orderBy: { memberCode: "asc" },
  });

  return apiResponse({
    parentId:    rootId,
    descendants: members.map(m => ({
      id:         m.id,
      memberCode: m.memberCode,
      memberName: m.memberName,
      properties: m.properties,
    })),
    count: members.length,
    mode: onlyLeaves ? "leaves" : "all",
    includesRoot: includeSelf,
  });
}
