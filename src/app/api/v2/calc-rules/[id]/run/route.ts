// POST /api/v2/calc-rules/[id]/run
//
// Execute a saved CalcRule. Only ACTIVE rules can run (DRAFT must be promoted).
// Returns the run result + the CalcRuleRun record id for audit lookup.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { executeRule } from "@/lib/calc-rules/executor";
import type { RuleSpec } from "@/lib/calc-rules/types";

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const rule = await prisma.calcRule.findFirst({
    where: { id: params.id, tenantId: auth.tid },
  });
  if (!rule) return apiError("Rule not found", 404);

  if (rule.status === "DRAFT")    return apiError("Cannot run DRAFT rule — promote to ACTIVE first.", 400);
  if (rule.status === "DISABLED") return apiError("Rule is DISABLED.", 400);
  if (rule.status === "ARCHIVED") return apiError("Rule is ARCHIVED.", 400);

  const result = await executeRule(
    rule.id,
    rule.spec as unknown as RuleSpec,
    { tenantId: auth.tid, triggeredBy: `user:${auth.sub}` }
  );

  return apiResponse(result, result.status === "SUCCEEDED" ? 200 : 500);
}
