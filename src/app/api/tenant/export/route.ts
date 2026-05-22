// /api/tenant/export — GDPR Article 20 "right to data portability" stub.
// Any authenticated user can export their tenant's data as a single JSON
// document. Returns members, hierarchy edges, dimensions, feature flags,
// and audit log entries.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiResponse } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;
  const tenantId = auth.tid;

  const [tenant, users, dimensions, members, edges, features, auditLogs] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    prisma.user.findMany({ where: { tenantId }, select: { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true, createdAt: true } }),
    prisma.dimension.findMany({ where: { tenantId } }),
    prisma.dimensionMember.findMany({ where: { tenantId } }),
    prisma.hierarchyEdge.findMany({ where: { tenantId } }),
    prisma.tenantFeature.findMany({ where: { tenantId } }),
    prisma.auditLog.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 10_000 }),
  ]);

  return apiResponse({
    schema:    "cfo-pilot.tenant-export.v1",
    exportedAt: new Date().toISOString(),
    tenantId,
    tenant,
    users,
    dimensions,
    members,
    edges,
    features,
    auditLogs,
    counts: {
      users: users.length,
      dimensions: dimensions.length,
      members: members.length,
      edges: edges.length,
      features: features.length,
      auditLogs: auditLogs.length,
    },
  });
}
