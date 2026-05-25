// POST /api/v2/workforce/forecast
// Body: { roster: RosterRow[], hires?: HirePlanRow[], months?: number }
// Returns: WorkforceForecast (headcount/salary/attrition/promotion/bonus by month)
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { workforceForecast } from "@/lib/workforce/forecast";

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;

  const body = await req.json().catch(() => null);
  if (!body?.roster || !Array.isArray(body.roster)) {
    return apiError("roster (array) is required", 400);
  }
  const months = Math.max(1, Math.min(60, Number(body.months) || 12));
  const result = workforceForecast(body.roster, body.hires ?? [], months);
  return apiResponse(result);
}
