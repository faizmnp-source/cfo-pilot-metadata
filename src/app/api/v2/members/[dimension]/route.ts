// Generic CRUD list+create for any dimension's members.
// Slice 1.1 of the Metadata Engine implementation plan.
//
// URL shape:
//   GET  /api/v2/members/account?page=1&pageSize=50&search=&isActive=true
//   POST /api/v2/members/account   { memberCode, memberName, properties: {...} }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getPaginationParams } from "@/lib/api-helpers";
import { apiError, apiResponse as apiSuccess } from "@/lib/utils";
import { audit } from "@/lib/audit-v2";
import {
  CreateMemberInputByDim,
  resolveDimKind,
} from "@/lib/dim-schemas";
import { ensureDimension } from "@/lib/ensure-dimension";

// ─── GET /api/v2/members/[dimension] ─────────────────────────────

export async function GET(
  req: NextRequest,
  ctx: { params: { dimension: string } }
) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const kind = resolveDimKind(ctx.params.dimension);
  if (!kind) return apiError(`Unknown dimension: ${ctx.params.dimension}`, 400);

  // Look up the dimension definition for this tenant (must exist + be enabled)
  // Auto-provision the Dimension row on first access for this tenant.
  const dimension = await ensureDimension(auth.tid, kind);
  if (!dimension.isEnabled) {
    return apiError(`Dimension '${kind}' is disabled. Enable in Settings → Features.`, 409);
  }

  const url = new URL(req.url);
  const { page, pageSize, search, isActive, sortBy, sortOrder } =
    getPaginationParams(url.searchParams);

  const where: any = {
    tenantId: auth.tid,
    dimensionId: dimension.id,
  };
  if (isActive !== undefined) where.isActive = isActive;
  if (search) {
    where.OR = [
      { memberCode: { contains: search, mode: "insensitive" } },
      { memberName: { contains: search, mode: "insensitive" } },
    ];
  }

  const allowedSortFields = new Set([
    "memberCode", "memberName", "sortOrder", "createdAt", "updatedAt",
  ]);
  const orderBy = allowedSortFields.has(sortBy)
    ? { [sortBy]: sortOrder }
    : { createdAt: "desc" as const };

  const [data, total] = await Promise.all([
    prisma.dimensionMember.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.dimensionMember.count({ where }),
  ]);

  return apiSuccess({
    data,
    total,
    page,
    pageSize,
    dimension: { id: dimension.id, kind: dimension.kind, code: dimension.code, label: dimension.label },
  });
}

// ─── POST /api/v2/members/[dimension] ────────────────────────────

export async function POST(
  req: NextRequest,
  ctx: { params: { dimension: string } }
) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  // VIEWER is read-only. Block writes at the role layer. QA PERM-004
  // caught that any authenticated user (incl. viewer) could POST members.
  if (auth.role === "VIEWER") {
    return apiError("Viewer role cannot create members", 403);
  }

  const kind = resolveDimKind(ctx.params.dimension);
  if (!kind) return apiError(`Unknown dimension: ${ctx.params.dimension}`, 400);

  // Auto-provision the Dimension row on first access for this tenant.
  const dimension = await ensureDimension(auth.tid, kind);
  if (!dimension.isEnabled) {
    return apiError(`Dimension '${kind}' is disabled. Enable in Settings → Features.`, 409);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const schema = CreateMemberInputByDim[kind];
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiError("Validation failed", 422, { issues: parsed.error.issues });
  }
  const input = parsed.data as any;

  // Reject duplicate code within (tenant, dimension)
  const existing = await prisma.dimensionMember.findFirst({
    where: {
      tenantId: auth.tid,
      dimensionId: dimension.id,
      memberCode: input.memberCode,
    },
    select: { id: true },
  });
  if (existing) {
    return apiError(`Member code '${input.memberCode}' already exists in this dimension`, 409);
  }

  const created = await prisma.dimensionMember.create({
    data: {
      tenantId: auth.tid,
      dimensionId: dimension.id,
      memberCode: input.memberCode,
      memberName: input.memberName,
      description: input.description ?? null,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
      storageType: input.storageType ?? null,
      calculationType: input.calculationType ?? null,
      formula: input.formula ?? null,
      properties: input.properties,
      createdBy: auth.sub,
      updatedBy: auth.sub,
    },
  });

  // Audit
  try {
    await audit({
      tenantId: auth.tid,
      userId: auth.sub,
      action: "CREATE",
      entityType: "dimension_member",
      entityId: created.id,
      after: created,
      metadata: { dimension: kind, memberCode: input.memberCode },
    });
  } catch { /* never let audit failures block the write */ }

  return apiSuccess(created, 201);
}
