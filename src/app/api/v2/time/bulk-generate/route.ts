// Bulk-generate the Time dimension in ONE transactional request.
//
// Why: the previous flow fired 99 sequential HTTP requests from the browser
// (51 members + 48 edges for a 3-year span). Any navigation, network blip,
// or Vercel cold-start mid-loop dropped the rest and left the hierarchy
// half-wired (FY2026 fully parented, FY2027 partial, FY2028 entirely
// unparented — exactly what Faizan saw in the Library screenshot).
//
// This endpoint:
//   POST /api/v2/time/bulk-generate
//   body: { fiscalYearStartMonth: 1..12, startFY: 2024, numYears: 1..30 }
//
// Runs generateTimePeriods() server-side, then in a single transaction:
//   1. Upserts the 'time' Dimension + 'default' Hierarchy
//   2. Upserts every member by (tenantId, dimensionId, memberCode)
//   3. Upserts every edge by (tenantId, hierarchyId, parentMemberId, childMemberId)
//
// Idempotent — re-running with the same payload is a no-op.

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { audit } from "@/lib/audit-v2";
import { ensureDimension } from "@/lib/ensure-dimension";
import { generateTimePeriods } from "@/lib/time-periods";
import { AggregationOperator } from "@prisma/client";

const InputSchema = z.object({
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  startFY:              z.number().int().min(2000).max(2099),
  numYears:             z.number().int().min(1).max(30),
});

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  // Admin-only — generating the calendar locks the time dim shape for the tenant
  if (auth.role !== "ADMIN") {
    return apiError("Admin role required to generate time periods", 403);
  }

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 422, { issues: parsed.error.issues });
  const { fiscalYearStartMonth, startFY, numYears } = parsed.data;

  // Build the node set first (pure function)
  const nodes = generateTimePeriods(fiscalYearStartMonth, startFY, numYears);

  // Auto-provision Dimension row — pass string literal; Prisma's DimensionKind
  // is a TS-only type alias to string, so the literal is correct at runtime.
  const dim = await ensureDimension(auth.tid, "TIME" as any);
  if (!dim.isEnabled) return apiError("Time dimension is disabled", 409);

  // Upsert 'default' hierarchy
  let hierarchy = await prisma.hierarchy.findFirst({
    where: { tenantId: auth.tid, dimensionId: dim.id, code: "default" },
  });
  if (!hierarchy) {
    hierarchy = await prisma.hierarchy.create({
      data: {
        tenantId: auth.tid,
        dimensionId: dim.id,
        code: "default",
        name: "Default",
        isPrimary: true,
        isActive: true,
      },
    });
  }

  let membersCreated = 0;
  let membersExisting = 0;
  let edgesCreated = 0;
  let edgesExisting = 0;

  // ── Phase 1: upsert all members, build code→id map ─────────────
  const codeToId: Record<string, string> = {};

  // Pre-load existing members for this dim+tenant to avoid N findFirst calls
  const existing = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, dimensionId: dim.id, memberCode: { in: nodes.map(n => n.code) } },
    select: { id: true, memberCode: true },
  });
  for (const m of existing) codeToId[m.memberCode] = m.id;

  // Create only the ones not already there
  for (const n of nodes) {
    if (codeToId[n.code]) { membersExisting++; continue; }
    const properties: Record<string, any> = {
      period_type:  n.type,
      fiscal_year:  n.fiscalYear,
      start_date:   n.startDate,
      end_date:     n.endDate,
    };
    if (n.monthIndex   !== undefined) properties.month_index   = n.monthIndex;
    if (n.quarterIndex !== undefined) properties.quarter_index = n.quarterIndex;

    const m = await prisma.dimensionMember.create({
      data: {
        tenantId:    auth.tid,
        dimensionId: dim.id,
        memberCode:  n.code,
        memberName:  n.name,
        isActive:    true,
        sortOrder:   0,
        properties,
        createdBy:   auth.sub,
        updatedBy:   auth.sub,
      },
      select: { id: true, memberCode: true },
    });
    codeToId[m.memberCode] = m.id;
    membersCreated++;
  }

  // ── Phase 2: upsert all hierarchy edges ────────────────────────
  // Pre-load existing edges to skip duplicates without 1 query per edge
  const existingEdges = await prisma.hierarchyEdge.findMany({
    where: { tenantId: auth.tid, hierarchyId: hierarchy.id },
    select: { parentMemberId: true, childMemberId: true },
  });
  const edgeKey = (p: string, c: string) => `${p}::${c}`;
  const existingEdgeSet = new Set(existingEdges.map(e => edgeKey(e.parentMemberId, e.childMemberId)));

  for (const n of nodes) {
    if (!n.parentCode) continue;
    const parentId = codeToId[n.parentCode];
    const childId  = codeToId[n.code];
    if (!parentId || !childId) continue;
    if (existingEdgeSet.has(edgeKey(parentId, childId))) { edgesExisting++; continue; }
    await prisma.hierarchyEdge.create({
      data: {
        tenantId:       auth.tid,
        hierarchyId:    hierarchy.id,
        parentMemberId: parentId,
        childMemberId:  childId,
        operator:       AggregationOperator.ADD,
        weight:         1,
      },
    });
    edgesCreated++;
  }

  try {
    await audit({
      tenantId:   auth.tid,
      userId:     auth.sub,
      action:     "BULK_GENERATE_TIME",
      entityType: "dimension",
      entityId:   dim.id,
      after:      { fiscalYearStartMonth, startFY, numYears, membersCreated, edgesCreated },
      metadata:   { kind: "TIME" },
    });
  } catch { /* never block on audit */ }

  return apiResponse({
    membersCreated,
    membersExisting,
    edgesCreated,
    edgesExisting,
    totalMembers: nodes.length,
    fiscalYearStartMonth,
    startFY,
    numYears,
  });
}
