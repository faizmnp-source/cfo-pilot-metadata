// POST /api/v2/jobs/copy — one-shot COPY_DATA execution.
// Body: CopyArgs (see src/lib/jobs/copy-clear.ts)
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { executeCopyJob, type CopyArgs } from "@/lib/jobs/copy-clear";

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const body = (await req.json().catch(() => null)) as CopyArgs | null;
  if (!body?.sourceScenarioCode || !body?.sourcePeriodCode || !body?.targetScenarioCode) {
    return apiError("sourceScenarioCode + sourcePeriodCode + targetScenarioCode required", 400);
  }
  try {
    const result = await executeCopyJob(prisma as any, auth.tid, auth.sub, body);
    return apiResponse(result);
  } catch (e: any) {
    return apiError(e?.message ?? String(e), 500);
  }
}
