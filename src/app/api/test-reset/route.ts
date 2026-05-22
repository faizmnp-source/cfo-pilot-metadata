// /api/test-reset — test fixture endpoint. Truncates the tenant's metadata
// so the next request lands on a clean DB. Used by TEN-004 (clean-DB cold-
// boot) and cross-tenant isolation tests that need a deterministic start.
//
// Gate (mirrors /api/healthz):
//   • dev / preview  → open
//   • production     → requires header `x-test-token` matching env TEST_TOKEN
//   • production w/o TEST_TOKEN → 410
//
// Scope: ONLY wipes the named tenant's metadata. Tenant + User rows are
// kept (so the demo login still works). Default: demo-tenant.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TEST_TOKEN = process.env.TEST_TOKEN;
const IS_PROD = process.env.NODE_ENV === "production"
             && process.env.VERCEL_ENV === "production";

function gate(req: NextRequest): NextResponse | null {
  if (!IS_PROD) return null;
  if (!TEST_TOKEN || req.headers.get("x-test-token") !== TEST_TOKEN) {
    return NextResponse.json(
      { success: false, error: "Endpoint not available" },
      { status: 410 },
    );
  }
  return null;
}

export async function POST(req: NextRequest) {
  const blocked = gate(req); if (blocked) return blocked;

  let tenantId = "demo-tenant";
  try {
    const body = await req.json();
    if (body?.tenantId && typeof body.tenantId === "string") tenantId = body.tenantId;
  } catch { /* no body is fine */ }

  // Order matters — children before parents to avoid FK violations.
  const r1 = await prisma.hierarchyEdge.deleteMany({ where: { tenantId } });
  const r2 = await prisma.auditLog.deleteMany({ where: { tenantId } });
  const r3 = await prisma.dimensionMember.deleteMany({ where: { tenantId } });
  const r4 = await prisma.dimension.deleteMany({ where: { tenantId } });
  const r5 = await prisma.tenantFeature.deleteMany({ where: { tenantId } });

  return NextResponse.json({
    success: true,
    tenantId,
    cleared: {
      hierarchy_edges:   r1.count,
      audit_logs:        r2.count,
      dimension_members: r3.count,
      dimensions:        r4.count,
      tenant_features:   r5.count,
    },
  });
}

export async function GET(req: NextRequest) {
  const blocked = gate(req); if (blocked) return blocked;
  return NextResponse.json({ success: true, message: "POST to truncate tenant metadata" });
}
