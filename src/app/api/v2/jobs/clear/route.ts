// POST /api/v2/jobs/clear — one-shot CLEAR_DATA execution.
// Body: ClearArgs (see src/lib/jobs/copy-clear.ts). hardDelete defaults false.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { executeClearJob, type ClearArgs } from "@/lib/jobs/copy-clear";

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const body = (await req.json().catch(() => null)) as ClearArgs | null;
  if (!body?.scenarioCode || !body?.periodCode) {
    return apiError("scenarioCode + periodCode required", 400);
  }
  try {
    const result = await executeClearJob(prisma as any, auth.tid, auth.sub, body);
    return apiResponse(result);
  } catch (e: any) {
    return apiError(e?.message ?? String(e), 500);
  }
}
