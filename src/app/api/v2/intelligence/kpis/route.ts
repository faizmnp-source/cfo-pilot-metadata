// POST /api/v2/intelligence/kpis
// Body: SummaryShape — see src/lib/intelligence/kpis.ts
// Returns: { kpis: Kpi[] }
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { apiResponse } from "@/lib/utils";
import { autoKpis, type SummaryShape } from "@/lib/intelligence/kpis";

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const body = (await req.json().catch(() => null)) as SummaryShape | null;
  if (!body) return apiResponse({ kpis: [] });
  return apiResponse({ kpis: autoKpis(body) });
}
