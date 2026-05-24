// GET /api/v2/members/{dimension}/descendants?parentId=X[&onlyLeaves=true][&includeSelf=true]
// Walks the hierarchy edges, returns descendants. Used by HierarchyMemberPicker.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

const MAX_DEPTH = 12;

const SLUG_TO_KIND: Record<string, string> = {
  account: "ACCOUNT", entity: "ENTITY", scenario: "SCENARIO", time: "TIME",
  currency: "CURRENCY", icp: "ICP", origin: "ORIGIN",
  ud1: "UD1", ud2: "UD2", ud3: "UD3", ud4: "UD4",
  ud5: "UD5", ud6: "UD6", ud7: "UD7", ud8: "UD8",
};

export async function GET(req: NextRequest, { params }: { params: { dimension: string }}) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const kind = SLUG_TO_KIND[params.dimension?.toLowerCase()];
  if (!kind) return apiError(`Unknown dimension: ${params.dimension}`, 400);

  const url = new URL(req.url);
  const parentId    = url.searchParams.get("parentId");
  const parentCode  = url.searchParams.get("parentCode");
  const includeSelf = url.searchParams.get("includeSelf") === "true";
  const onlyLeaves  = url.searchParams.get("onlyLeaves")  === "true";
  if (!parentId && !parentCode) return apiError("parentId or parentCode required", 400);

  let rootId = parentId;
  if (!rootId && parentCode) {
    const found = await prisma.dimensionMember.findFirst({
      where: { tenantId: auth.tid, dimension: { kind: kind as any }, memberCode: parentCode },
      select: { id: true },
    });
    if (!found) return apiError(`Member ${parentCode} not found in dim ${params.dimension}`, 404);
    rootId = found.id;
  }

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

    if (onlyLeaves) {
      for (const id of frontier) {
        if (!parentsWithChildren.has(id) && id !== rootId) descendants.push(id);
      }
    } else {
      for (const id of frontier) {
        if (id !== rootId) descendants.push(id);
      }
    }
    for (const id of childIds) seen.add(id);
    frontier = childIds;
  }
  if (onlyLeaves && frontier.length > 0) {
    for (const id of frontier) descendants.push(id);
  }

  const ids = includeSelf ? [rootId!, ...descendants] : descendants;
  const members = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, id: { in: ids }, isActive: true },
    select: { id: true, memberCode: true, memberName: true, properties: true },
    orderBy: { memberCode: "asc" },
  });

  return apiResponse({
    parentId:    rootId,
    descendants: members.map(m => ({
      id: m.id, memberCode: m.memberCode, memberName: m.memberName, properties: m.properties,
    })),
    count: members.length,
    mode: onlyLeaves ? "leaves" : "all",
    includesRoot: includeSelf,
  });
}
