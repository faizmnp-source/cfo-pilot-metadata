// Hierarchy edges (parent/child) for any dimension. Supports alternate
// hierarchies (named) via the `hierarchy` query param.
//
// URL shape:
//   GET    /api/v2/hierarchy/account?hierarchy=default   → tree (or flat edges)
//   POST   /api/v2/hierarchy/account                     → add an edge
//   DELETE /api/v2/hierarchy/account/<edge_id>           → remove an edge

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse as apiSuccess } from "@/lib/utils";
import { audit } from "@/lib/audit-v2";
import { resolveDimKind } from "@/lib/dim-schemas";
import { ensureDimension } from "@/lib/ensure-dimension";
import { AggregationOperator } from "@prisma/client";

const AddEdgeSchema = z.object({
  hierarchyCode:  z.string().min(1).default("default"),
  parentMemberId: z.string().uuid(),
  childMemberId:  z.string().uuid(),
  operator:       z.nativeEnum(AggregationOperator).default(AggregationOperator.ADD),
  weight:         z.number().min(-1e6).max(1e6).default(1),
  effectiveFrom:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  effectiveTo:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine((d) => d.parentMemberId !== d.childMemberId, {
  message: "A member cannot be its own parent",
  path:    ["childMemberId"],
});

// Recursive cycle detection: would adding parent→child create a cycle?
// We walk UP from the proposed parent through existing edges and bail if we
// encounter the child anywhere. Bounded depth at 100 (real hierarchies are
// usually < 10 deep; 100 is a generous safety net).
async function wouldCreateCycle(
  tenantId: string,
  hierarchyId: string,
  parentMemberId: string,
  childMemberId: string,
): Promise<boolean> {
  if (parentMemberId === childMemberId) return true;

  const visited = new Set<string>([parentMemberId]);
  let frontier: string[] = [parentMemberId];

  for (let depth = 0; depth < 100 && frontier.length > 0; depth++) {
    const edges = await prisma.hierarchyEdge.findMany({
      where: {
        tenantId,
        hierarchyId,
        childMemberId: { in: frontier },
      },
      select: { parentMemberId: true },
    });
    const nextFrontier: string[] = [];
    for (const e of edges) {
      if (e.parentMemberId === childMemberId) return true;
      if (!visited.has(e.parentMemberId)) {
        visited.add(e.parentMemberId);
        nextFrontier.push(e.parentMemberId);
      }
    }
    frontier = nextFrontier;
  }
  return false;
}

// ─── GET: query edges or build tree ──────────────────────────────

export async function GET(
  req: NextRequest,
  ctx: { params: { dimension: string } }
) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const kind = resolveDimKind(ctx.params.dimension);
  if (!kind) return apiError(`Unknown dimension: ${ctx.params.dimension}`, 400);

  const dimension = await ensureDimension(auth.tid, kind);

  const url = new URL(req.url);
  const hierarchyCode = url.searchParams.get("hierarchy") ?? "default";
  const format = url.searchParams.get("format") ?? "edges"; // 'edges' | 'tree'

  const hierarchy = await prisma.hierarchy.findFirst({
    where: { tenantId: auth.tid, dimensionId: dimension.id, code: hierarchyCode },
  });
  if (!hierarchy) {
    return apiSuccess({ hierarchy: null, edges: [], tree: [] });
  }

  // Pull all edges then filter out any where parent or child is soft-deleted
  // (isActive=false). EPM convention: deleted members are hidden from the
  // hierarchy view by default. Their data and audit trail still survive.
  const rawEdges = await prisma.hierarchyEdge.findMany({
    where: { tenantId: auth.tid, hierarchyId: hierarchy.id },
    include: {
      parent: { select: { id: true, memberCode: true, memberName: true, isActive: true } },
      child:  { select: { id: true, memberCode: true, memberName: true, isActive: true } },
    },
  });
  const edges = rawEdges.filter((e) => e.parent.isActive && e.child.isActive);

  if (format === "edges") {
    return apiSuccess({ hierarchy, edges });
  }

  // tree format: derive roots (members never appearing as child) + nest
  const allChildIds = new Set(edges.map((e) => e.childMemberId));
  const rootIds = Array.from(new Set(edges.map((e) => e.parentMemberId)))
    .filter((id) => !allChildIds.has(id));

  type Node = {
    id: string; memberCode: string; memberName: string;
    operator?: AggregationOperator; weight?: number;
    children: Node[];
  };

  const memberById: Record<string, { id: string; memberCode: string; memberName: string }> = {};
  for (const e of edges) {
    memberById[e.parent.id] = e.parent;
    memberById[e.child.id]  = e.child;
  }

  const childrenByParent: Record<string, typeof edges> = {};
  for (const e of edges) {
    (childrenByParent[e.parentMemberId] ??= []).push(e);
  }

  function build(memberId: string, op?: AggregationOperator, weight?: number): Node {
    const m = memberById[memberId];
    return {
      id: m.id, memberCode: m.memberCode, memberName: m.memberName,
      operator: op, weight,
      children: (childrenByParent[memberId] ?? []).map((c) =>
        build(c.childMemberId, c.operator, Number(c.weight))
      ),
    };
  }

  const tree = rootIds.map((id) => build(id));
  return apiSuccess({ hierarchy, tree });
}

// ─── POST: add a parent→child edge ───────────────────────────────

export async function POST(
  req: NextRequest,
  ctx: { params: { dimension: string } }
) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const kind = resolveDimKind(ctx.params.dimension);
  if (!kind) return apiError(`Unknown dimension: ${ctx.params.dimension}`, 400);

  const dimension = await ensureDimension(auth.tid, kind);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }
  const parsed = AddEdgeSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 422, { issues: parsed.error.issues });
  const input = parsed.data;

  // Both members must exist in THIS dimension (cross-dim edges forbidden)
  const members = await prisma.dimensionMember.findMany({
    where: {
      tenantId: auth.tid,
      dimensionId: dimension.id,
      id: { in: [input.parentMemberId, input.childMemberId] },
    },
    select: { id: true },
  });
  if (members.length !== 2) {
    return apiError("Parent and child must both exist in this dimension", 400);
  }

  // Get or create the hierarchy
  let hierarchy = await prisma.hierarchy.findFirst({
    where: { tenantId: auth.tid, dimensionId: dimension.id, code: input.hierarchyCode },
  });
  if (!hierarchy) {
    hierarchy = await prisma.hierarchy.create({
      data: {
        tenantId: auth.tid,
        dimensionId: dimension.id,
        code: input.hierarchyCode,
        name: input.hierarchyCode === "default" ? "Default" : input.hierarchyCode,
        isPrimary: input.hierarchyCode === "default",
        isActive: true,
      },
    });
  }

  // Cycle check
  if (await wouldCreateCycle(auth.tid, hierarchy.id, input.parentMemberId, input.childMemberId)) {
    return apiError(
      `Adding this edge would create a cycle in hierarchy '${hierarchy.code}'`,
      409,
    );
  }

  // Duplicate edge check (unique constraint exists, but error is nicer here)
  const dup = await prisma.hierarchyEdge.findFirst({
    where: {
      tenantId: auth.tid, hierarchyId: hierarchy.id,
      parentMemberId: input.parentMemberId,
      childMemberId:  input.childMemberId,
    },
    select: { id: true },
  });
  if (dup) return apiError("Edge already exists", 409);

  const created = await prisma.hierarchyEdge.create({
    data: {
      tenantId:       auth.tid,
      hierarchyId:    hierarchy.id,
      parentMemberId: input.parentMemberId,
      childMemberId:  input.childMemberId,
      operator:       input.operator,
      weight:         input.weight,
      effectiveFrom:  input.effectiveFrom ? new Date(input.effectiveFrom) : null,
      effectiveTo:    input.effectiveTo   ? new Date(input.effectiveTo)   : null,
    },
  });

  try {
    await audit({
      tenantId: auth.tid,
      userId: auth.sub,
      action: "CREATE",
      entityType: "hierarchy_edge",
      entityId: created.id,
      after: created,
      metadata: { dimension: kind, hierarchy: hierarchy.code },
    });
  } catch { /* ignore */ }

  return apiSuccess(created, 201);
}
