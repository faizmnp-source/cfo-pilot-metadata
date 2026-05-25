// GET /api/v2/jobs/runs?limit=50&status=
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiResponse } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const url = new URL(req.url);
  const limit  = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const status = url.searchParams.get("status") ?? undefined;
  const runs = await prisma.jobRun.findMany({
    where: { tenantId: auth.tid, ...(status ? { status } : {}) },
    orderBy: { startedAt: "desc" },
    take: limit,
    include: { job: { select: { id: true, code: true, name: true, kind: true }}},
  });
  return apiResponse({ data: runs });
}
