// POST /api/v2/intelligence/explain
// Body: { kpiKey, kpi, context: { byEntity, byCategory, topVariances, monthly, prior, tenantName } }
// Returns: { what, why, impact, action, priority }
//
// AI Storyteller — wraps a KPI with what/why/impact/action narrative.
// Uses Claude Haiku via /api/v2/copilot/chat infra (cached). Returns
// deterministic fallback if AI is offline.
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

const KEY = process.env.ANTHROPIC_API_KEY ?? "";

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const body = await req.json().catch(() => null);
  if (!body?.kpi) return apiError("kpi is required", 400);
  const kpi = body.kpi;
  const ctx = body.context ?? {};

  // Deterministic fallback if no AI
  const fallback = {
    what:   `${kpi.label} is ${kpi.value?.toFixed?.(1) ?? kpi.value}${kpi.unit === "PCT" ? "%" : ""}${kpi.deltaPct != null ? `, ${kpi.deltaPct > 0 ? "+" : ""}${kpi.deltaPct.toFixed(1)}% vs budget` : ""}.`,
    why:    "Driver decomposition requires AI — set ANTHROPIC_API_KEY to enable root-cause narration.",
    impact: kpi.favourable === "BAD"
      ? "Unfavourable trend — review at the next management review."
      : kpi.favourable === "GOOD"
        ? "Favourable trend — investigate whether to lock in or scale up."
        : "Neutral movement.",
    action: "Open the related report to inspect underlying lines.",
    priority: kpi.favourable === "BAD" ? "HIGH" : "MEDIUM",
  };

  if (!KEY) return apiResponse(fallback);

  const sys = `You are an FP&A storyteller writing for a CFO. Given a KPI and supporting facts, return STRICT JSON with this shape:
{ "what": string, "why": string, "impact": string, "action": string, "priority": "HIGH"|"MEDIUM"|"LOW" }

- what:   one sentence stating the number + change in plain English.
- why:    one paragraph (max 60 words) naming the actual entity/account/customer driving the result. Use only the facts provided.
- impact: one sentence on the business implication.
- action: one specific recommended next step (an owner, a meeting, a calc to run).
- priority: how urgent (HIGH if material, LOW if cosmetic).

No headers, no markdown, no commentary outside the JSON.`;

  const user = `KPI:
${JSON.stringify(kpi, null, 2)}

Context (tenant: ${ctx.tenantName ?? "this company"}):
${JSON.stringify({
  byEntity: ctx.byEntity?.slice?.(0, 6),
  byCategory: ctx.byCategory?.slice?.(0, 6),
  topVariances: ctx.topVariances?.slice?.(0, 6),
  prior: ctx.prior,
  period: ctx.period,
}, null, 2)}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: sys,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!r.ok) return apiResponse({ ...fallback, _error: `Claude ${r.status}` });
    const j = await r.json();
    const text = j?.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return apiResponse({ ...fallback, _raw: text });
    try {
      const parsed = JSON.parse(match[0]);
      return apiResponse({
        what:   parsed.what   ?? fallback.what,
        why:    parsed.why    ?? fallback.why,
        impact: parsed.impact ?? fallback.impact,
        action: parsed.action ?? fallback.action,
        priority: parsed.priority ?? fallback.priority,
      });
    } catch {
      return apiResponse({ ...fallback, _raw: text });
    }
  } catch (e: any) {
    return apiResponse({ ...fallback, _error: e.message });
  }
}
