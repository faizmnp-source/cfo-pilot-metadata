/**
 * GET /api/debug/db — temporary diagnostic endpoint
 * Returns DB connection status and exact error for debugging.
 * REMOVE before production hardening.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  const url = process.env.DATABASE_URL ?? "(not set)";
  const masked = url.replace(/:([^:@]{3})[^:@]*@/, ':***@');

  try {
    // Simple connectivity test
    const result = await prisma.$queryRaw<[{ one: number }]>`SELECT 1 AS one`;

    // Try to count users
    const userCount = await prisma.user.count();
    const tenantCount = await prisma.tenant.count();

    return NextResponse.json({
      ok: true,
      db_url: masked,
      ping: result[0]?.one,
      users: userCount,
      tenants: tenantCount,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      db_url: masked,
      error: err?.message ?? String(err),
      code: err?.code,
      meta: err?.meta,
    }, { status: 500 });
  }
}
