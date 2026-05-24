// POST /api/v2/ai/explain
//
// Single entry point for AI-driven explanations. Loads the right skill
// prompt, calls the AI gateway, returns markdown.
//
// Body:
//   {
//     kind:    "variance" | "income-narrative" | "balance-narrative" | "anomaly" | "board-pack",
//     payload: { ...whatever the kind needs (report JSON, fact data, etc) },
//     model?:  "haiku-4.5" | "sonnet-4.6" | "gemini-2.5-flash",
//     bypassCache?: boolean
//   }
//
// Returns:
//   { text, model, cached, costInr, latencyMs, stub }

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { callAi } from "@/lib/ai/gateway";

// ─── Skill prompts (inlined for v1; later read from /skills/ at startup) ───

const SKILL_PROMPTS: Record<string, string> = {
  variance: `You are an FP&A analyst writing variance commentary for a CFO. Apply the finance:variance-analysis methodology (Price/Volume/Mix decomposition, materiality thresholds, narrative generation).

Given a variance (actual vs prior or actual vs budget), write a 3-4 sentence commentary that:
1. States the variance amount + direction (favorable/unfavorable)
2. Decomposes the most likely drivers (volume vs price vs mix vs timing)
3. Flags whether it's material (>5% or > tenant's threshold)
4. Suggests one concrete next step (investigate X, accrue Y, defer Z)

Keep it CFO-readable: no jargon, plain English, accounting style negatives in parens. Maximum 80 words.`,

  "income-narrative": `You are an FP&A analyst writing the MD&A section for an income statement. Apply the finance:financial-statements methodology with GAAP presentation (ASC 220) and proper variance commentary.

Given a sectioned income statement JSON (Revenue, COGS, Gross Profit, Opex, Operating Income, Other I/E, Pre-Tax, Tax, Net Income with margins), write a 4-paragraph MD&A:
1. Top-line revenue commentary — growth/decline, mix shift, key drivers
2. Margin commentary — gross + operating margins vs benchmark
3. Below-the-line — FX/interest/tax notable items
4. Bottom line — net income/loss takeaway + forward signal

Use accounting style negatives (in parens). CFO-readable, no jargon. ~250 words total.`,

  "balance-narrative": `You are an FP&A analyst writing balance-sheet commentary.

Given a sectioned balance sheet (Assets, Liabilities, Equity with totals), write a 3-paragraph note:
1. Asset composition — current vs fixed, working capital position, cash position
2. Liability + equity — leverage, capital structure
3. Balance check — A=L+E (flag any discrepancy)

CFO-readable. ~180 words.`,

  anomaly: `You are an FP&A anomaly detection assistant. Given a fact value + its trailing 3-month average + standard deviation, classify whether it's anomalous and explain why in 1-2 sentences.

Output format:
  - severity: NONE | LOW | MEDIUM | HIGH
  - reason: <one sentence>
  - suggestion: <one action>`,

  "board-pack": `You are an FP&A analyst writing the executive summary for a board pack. Apply finance:financial-statements + variance-analysis + close-management methodologies.

Given full IS + BS + cash position + key variances, write a 1-page executive summary (≤500 words):
- Quarter at a glance — 3 KPIs with delta
- Wins of the quarter (2-3 bullets)
- Risks of the quarter (2-3 bullets)
- Forward outlook (1 paragraph)
- Asks of the board (1-2 explicit items)

Tone: confident, candid, no fluff. Accounting style negatives.`,

  classify: `You are a Chart-of-Accounts classification assistant. Given an account code + name, suggest:
  - account_type: REVENUE | EXPENSE | ASSET | LIABILITY | EQUITY | STATISTICAL
  - time_balance: FLOW (P&L) | LAST (BS closing)
  - is_icp: true | false (true if name suggests intercompany)
  - cash_flow_category: OPERATING | INVESTING | FINANCING

Output ONLY a JSON object. Include 'confidence' (0-1) and 'reason' (one sentence).`,
};

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  let body: any;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const kind = String(body?.kind ?? "");
  const payload = body?.payload;
  const model = body?.model as any;
  const bypassCache = !!body?.bypassCache;

  if (!kind) return apiError("kind is required", 400);
  if (!payload) return apiError("payload is required", 400);

  const systemPrompt = SKILL_PROMPTS[kind];
  if (!systemPrompt) return apiError(`Unknown kind: ${kind}. Known: ${Object.keys(SKILL_PROMPTS).join(", ")}`, 400);

  const userPrompt = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);

  const result = await callAi({
    tenantId: auth.tid, userId: auth.sub,
    kind, systemPrompt, userPrompt, model, bypassCache,
  });

  return apiResponse(result);
}

// GET /api/v2/ai/explain — returns today's AI usage stats for the caller's tenant
export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const { prisma } = await import("@/lib/prisma");
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [byKind, totals] = await Promise.all([
    prisma.aiCallLog.groupBy({
      by: ["kind"],
      where: { tenantId: auth.tid, createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { costInr: true, promptTokens: true, outputTokens: true },
    }),
    prisma.aiCallLog.aggregate({
      where: { tenantId: auth.tid, createdAt: { gte: since } },
      _sum: { costInr: true },
      _count: { _all: true },
    }),
  ]);

  return apiResponse({
    period: "24h",
    totalCalls: totals._count._all,
    totalCostInr: Number(totals._sum.costInr ?? 0),
    dailyCapInr: 100,
    byKind: byKind.map((b: any) => ({
      kind: b.kind, calls: b._count._all,
      costInr: Number(b._sum.costInr ?? 0),
      promptTokens: b._sum.promptTokens ?? 0,
      outputTokens: b._sum.outputTokens ?? 0,
    })),
  });
}
