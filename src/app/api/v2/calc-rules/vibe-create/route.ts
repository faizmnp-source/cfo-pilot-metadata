// POST /api/v2/calc-rules/vibe-create
//
// "Vibe coding" for calc rules. User describes the rule in natural language
// (e.g. "10% Indian tax on US_HQ revenue accounts for FY2026"), Anthropic
// generates a structured RuleSpec, and we save it as a DRAFT for user review.
//
// The user reviews the AI-generated spec in the /rules UI, optionally tweaks,
// then promotes to ACTIVE. After that the rule is pure deterministic — no
// LLM at run-time.
//
// Body: { prompt: string, model?: 'haiku-4.5' | 'sonnet-4.6' }
// Returns: { rule: <DRAFT rule object>, spec: <RuleSpec>, cost: {...} }

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";

const SYSTEM = `You translate finance/EPM rule descriptions into structured CalcRule JSON specs.

The user describes a calculation in natural language. You output a JSON spec the engine can execute deterministically.

Output ONLY a single JSON object — no prose, no markdown, no fences. The object schema:

{
  "code":        "<url-safe-kebab-case-name>",
  "name":        "<human-readable name>",
  "description": "<one-sentence explanation>",
  "kind":        "PERCENTAGE" | "SUM" | "ALLOCATION" | "FX_CONVERT" | "COMP_BUILD",
  "spec": {
    "filters": {
      "scenarioCode":      "<optional, e.g. ACTUAL>",
      "entityCodes":       ["<list>"],
      "accountCodes":      ["<list>"],
      "accountTypePrefix": "<single char: 4|5|6|7|8>",
      "yearCode":          "<FYxxxx>",
      "periodCodes":       ["<YYYY-MM>"]
    },
    "formula": {
      "kind":   "percentage" | "sum" | "allocation" | "fx_convert" | "comp_build",
      "factor": <number — for percentage, e.g. 0.10>,
      "basis":  "amount" | "abs"
    },
    "output": {
      "accountCode":       "<account where result lands>",
      "scenarioCode":      "<optional override>",
      "origin":            "AI" | "Calc",
      "overwriteExisting": false
    }
  }
}

Rules:
- Use codes (not UUIDs) for entityCodes / accountCodes / scenarioCode — the engine resolves them at run-time.
- accountTypePrefix shortcuts: 4=Revenue, 5=COGS, 6=Opex, 7=Other I/E, 8=Tax. Use ONE OF accountCodes OR accountTypePrefix, not both.
- Default origin to "AI" for vibe-created rules.
- Default scenarioCode in filters to "ACTUAL" if user doesn't specify.
- Pick a kebab-case 'code' that's a unique snapshot of the rule (e.g. "in-tax-on-us-revenue-fy2026").
- For percentages: factor is the decimal (10% = 0.10).
- Always include 'description' as a one-sentence plain-English summary.

If the request is ambiguous (e.g. missing target account), make a reasonable default and add a TODO in description. The user reviews before activating.

Output ONLY the JSON. No preamble. No code fences.`;

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  let body: any;
  try { body = await req.json(); } catch { return apiError("Invalid JSON", 400); }
  const prompt = String(body?.prompt ?? "").trim();
  if (!prompt) return apiError("prompt is required", 400);
  const model = body?.model === "sonnet-4.6" ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";

  // Stub mode if no key
  if (!ANTHROPIC_KEY) {
    // Save a placeholder DRAFT so user sees the flow works
    const stubSpec = {
      filters: { scenarioCode: "ACTUAL", yearCode: "FY2026" },
      formula: { kind: "percentage", factor: 0.10, basis: "amount" },
      output:  { accountCode: "TODO_SET_OUTPUT_ACCOUNT", origin: "AI", overwriteExisting: false },
    };
    const code = "stub-rule-" + Date.now().toString(36);
    const rule = await prisma.calcRule.create({
      data: {
        tenantId: auth.tid, code, name: prompt.slice(0, 60), description: "STUB — add ANTHROPIC_API_KEY for real vibe-coding",
        spec: stubSpec, kind: "PERCENTAGE", status: "DRAFT", source: "vibe",
        vibePrompt: prompt, vibeModel: "stub", createdBy: auth.sub,
      },
    });
    return apiResponse({ rule, spec: stubSpec, stub: true });
  }

  const t0 = Date.now();
  const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 1024,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" }}],
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!claudeResp.ok) {
    const err = await claudeResp.text();
    return apiError(`Anthropic ${claudeResp.status}: ${err.slice(0, 200)}`, 502);
  }
  const j = await claudeResp.json();
  const text = (j.content ?? []).find((b: any) => b.type === "text")?.text ?? "";

  // Strip code fences if Claude included them
  const cleaned = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```\s*$/, "").trim();
  let parsed: any;
  try { parsed = JSON.parse(cleaned); }
  catch (e) { return apiError(`AI returned invalid JSON: ${cleaned.slice(0, 200)}`, 502); }

  if (!parsed.spec || !parsed.code || !parsed.name) {
    return apiError(`AI output missing required fields. Got: ${JSON.stringify(Object.keys(parsed))}`, 502);
  }

  // De-dup code if already exists for this tenant
  let finalCode = parsed.code;
  let n = 1;
  while (await prisma.calcRule.findFirst({ where: { tenantId: auth.tid, code: finalCode }})) {
    finalCode = `${parsed.code}-${++n}`;
    if (n > 20) break;
  }

  const rule = await prisma.calcRule.create({
    data: {
      tenantId:    auth.tid,
      code:        finalCode,
      name:        parsed.name,
      description: parsed.description ?? null,
      spec:        parsed.spec,
      kind:        parsed.kind ?? "PERCENTAGE",
      status:      "DRAFT",
      source:      "vibe",
      vibePrompt:  prompt,
      vibeModel:   model,
      createdBy:   auth.sub,
    },
  });

  const promptTokens = j.usage?.input_tokens ?? 0;
  const outputTokens = j.usage?.output_tokens ?? 0;
  const isSonnet = model.includes("sonnet");
  const costInr = isSonnet
    ? (promptTokens / 1_000_000) * 3 * 83 + (outputTokens / 1_000_000) * 15 * 83
    : (promptTokens / 1_000_000) * 1 * 83 + (outputTokens / 1_000_000) * 5 * 83;

  return apiResponse({
    rule, spec: parsed.spec,
    cost: { inr: costInr, promptTokens, outputTokens, latencyMs: Date.now() - t0, model },
  });
}
