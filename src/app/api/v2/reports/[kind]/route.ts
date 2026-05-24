// GET /api/v2/reports/<kind>?scenarioId=&entityId=&yearCode=
// kind ∈ { trial-balance, income-statement, balance-sheet, cash-flow }
//
// Returns SectionedReport JSON the report pages render via shared chrome.

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import {
  buildTrialBalance, buildIncomeStatement, buildBalanceSheet, buildCashFlow,
} from "@/lib/reports/engine";

const BUILDERS: Record<string, any> = {
  "trial-balance":     buildTrialBalance,
  "income-statement":  buildIncomeStatement,
  "balance-sheet":     buildBalanceSheet,
  "cash-flow":         buildCashFlow,
};

export async function GET(
  req: NextRequest,
  ctx: { params: { kind: string } },
) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const kind = ctx.params.kind;
  const builder = BUILDERS[kind];
  if (!builder) return apiError(`Unknown report kind: ${kind}`, 404);

  const url = new URL(req.url);
  const scenarioId = url.searchParams.get("scenarioId");
  const entityId   = url.searchParams.get("entityId");
  const yearCode   = url.searchParams.get("yearCode");
  if (!scenarioId || !entityId || !yearCode) {
    return apiError("scenarioId, entityId, yearCode all required", 400);
  }

  try {
    const report = await builder({
      tenantId:   auth.tid,
      scenarioId, entityId, yearCode,
      kind,
    });
    return apiResponse(report);
  } catch (e: any) {
    return apiError(`Report failed: ${e?.message ?? e}`, 500);
  }
}
