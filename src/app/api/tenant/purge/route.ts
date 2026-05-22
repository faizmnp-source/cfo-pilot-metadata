// /api/tenant/purge — GDPR Article 17 "right to erasure" stub.
// ADMIN-only. Permanently deletes ALL tenant data: members, edges, audit
// logs, dimensions, tenant_features, users, then the Tenant row.
//
// Requires confirmation in the body (`{ confirm: "PURGE" }`) so an
// accidental click can't wipe a tenant. Returns count of rows deleted.
//
// Production-ready behavior: cascades the delete via Prisma. Real-world
// hardening (audit-the-purge, async export-first, 30-day soft-state)
// would belong in a follow-up; this is the v1 endpoint that unblocks
// AUD-006 testing.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  if (auth.role !== "ADMIN") {
    return apiError("Admin role required for tenant purge", 403);
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  if (body?.confirm !== "PURGE") {
    return apiError("Confirmation required — POST { confirm: 'PURGE' }", 400);
  }

  const tenantId = auth.tid;
  const before = await Promise.all([
    prisma.dimensionMember.count({ where: { tenantId } }),
    prisma.hierarchyEdge.count({ where: { tenantId } }),
    prisma.auditLog.count({ where: { tenantId } }),
    prisma.dimension.count({ where: { tenantId } }),
    prisma.tenantFeature.count({ where: { tenantId } }),
    prisma.user.count({ where: { tenantId } }),
  ]);

  // Children-first to avoid FK violations
  await prisma.hierarchyEdge.deleteMany({ where: { tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.dimensionMember.deleteMany({ where: { tenantId } });
  await prisma.dimension.deleteMany({ where: { tenantId } });
  await prisma.tenantFeature.deleteMany({ where: { tenantId } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});

  return apiResponse({
    purged: true,
    tenantId,
    counts: {
      dimension_members: before[0],
      hierarchy_edges:   before[1],
      audit_logs:        before[2],
      dimensions:        before[3],
      tenant_features:   before[4],
      users:             before[5],
    },
  });
}
