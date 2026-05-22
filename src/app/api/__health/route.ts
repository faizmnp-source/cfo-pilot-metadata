// /api/__health — readiness/liveness probe for QA's smoke harness.
//
// Returns row counts + DB latency + deployment fingerprint. Used by the
// pr-smoke GitHub Action to wait for a Vercel preview to be ready before
// running the @smoke suite, and as a permanent debug endpoint when something
// looks off in production.
//
// Gate:
//   • dev / preview  → open (so devs can curl it locally)
//   • production     → requires header `x-test-token` matching env TEST_TOKEN
//   • production w/o TEST_TOKEN set → 410, leaks nothing
//
// Why TEST_TOKEN gating: db_latency_ms + schema_hash + counts are infra
// signals. Useful to us, useful to an attacker fingerprinting the stack.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TEST_TOKEN = process.env.TEST_TOKEN;
const IS_PROD = process.env.NODE_ENV === "production"
             && process.env.VERCEL_ENV === "production";

export async function GET(req: NextRequest) {
  if (IS_PROD) {
    if (!TEST_TOKEN || req.headers.get("x-test-token") !== TEST_TOKEN) {
      // Same 410 shape as the legacy stubs — looks deprecated to scanners.
      return NextResponse.json(
        { success: false, error: "Endpoint not available" },
        { status: 410 },
      );
    }
  }

  const t0 = Date.now();
  try {
    // Cheapest possible probe — confirms pool + reachability.
    await prisma.$queryRaw`SELECT 1`;
    const db_latency_ms = Date.now() - t0;

    const [tenant_count, dimension_count, member_count, edge_count] = await Promise.all([
      prisma.tenant.count(),
      prisma.dimension.count(),
      prisma.dimensionMember.count(),
      prisma.hierarchyEdge.count(),
    ]);

    return NextResponse.json({
      ok: true,
      tenant_count,
      dimension_count,
      member_count,
      edge_count,
      db_latency_ms,
      // Vercel injects these on every deployment — gives QA a way to assert
      // "the preview I'm hitting is the SHA I think it is".
      schema_hash:    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      branch:         process.env.VERCEL_GIT_COMMIT_REF ?? "local",
      env:            process.env.VERCEL_ENV ?? "local",
      node:           process.version,
      timestamp:      new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:         "Database unreachable",
        detail:        err instanceof Error ? err.message : String(err),
        db_latency_ms: Date.now() - t0,
        schema_hash:   process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      },
      { status: 503 },
    );
  }
}
