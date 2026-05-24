// POST /api/v2/automation/jobs/[id]/run — manually trigger a job.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { executeJob } from "@/lib/automation/executor";

const BASE_URL_INTERNAL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const job = await prisma.automationJob.findFirst({
    where: { id: params.id, tenantId: auth.tid },
  });
  if (!job) return apiError("Job not found", 404);
  if (!job.enabled) return apiError("Job is disabled", 400);

  const result = await executeJob(job.id, {
    tenantId: auth.tid,
    triggeredBy: `manual:${auth.sub}`,
    baseUrl: BASE_URL_INTERNAL,
    sessionCookie: req.headers.get("cookie") ?? "",
  });

  return apiResponse(result, result.status === "SUCCEEDED" ? 200 : 500);
}
