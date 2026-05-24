// AI Gateway — single entry point for all AI features.
//
// Design principles (per BRD §5 — "AI-proof strategy"):
//   1. Cost-discipline first. Cache by hash. Haiku default. Sonnet only when
//      explicitly requested. Gemini Flash for free-tier tenants.
//   2. Skill-driven. System prompts loaded from the Anthropic finance plugin
//      skill files (variance-analysis, financial-statements, etc.).
//   3. Audit trail. Every call logged to ai_call_logs with cost + tokens +
//      cached flag. Per-tenant daily cap enforced.
//   4. Stub mode. If no API key configured, return a structured stub so the
//      UI can be built/tested without burning credits.

import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// ─── Cost table (INR per million tokens, ~Nov 2026 pricing) ────────

const MODELS = {
  "haiku-4.5":         { provider: "anthropic", model: "claude-haiku-4-5-20251001", costIn: 1.00 * 83,  costOut: 5.00 * 83 },
  "sonnet-4.6":        { provider: "anthropic", model: "claude-sonnet-4-6",        costIn: 3.00 * 83,  costOut: 15.00 * 83 },
  "gemini-2.5-flash":  { provider: "gemini",    model: "gemini-2.5-flash",         costIn: 0.075 * 83, costOut: 0.30 * 83 },
} as const;
type ModelKey = keyof typeof MODELS;

const DEFAULT_TTL_HOURS: Record<string, number> = {
  "variance":           24,
  "anomaly":             6,
  "income-narrative":   24,
  "balance-narrative":  24,
  "board-pack":      24 * 7,
  "classify":     24 * 30,
  // close-summary changes throughout the day → keep stale-after-1h
  "close-summary":       1,
  "default":            12,
};

const DEFAULT_DAILY_CAP_INR = 100;   // per tenant default

// ─── Public API ────────────────────────────────────────────────────

export interface AiRequest {
  tenantId:   string;
  userId:     string;
  kind:       string;            // 'variance' | 'income-narrative' | etc
  systemPrompt: string;          // skill content + role
  userPrompt:   string;          // payload as JSON-ish text
  model?:     ModelKey;          // default haiku
  maxTokens?: number;            // default 1500
  bypassCache?: boolean;
}

export interface AiResponse {
  text:        string;
  model:       string;
  cached:      boolean;
  promptTokens:  number;
  outputTokens:  number;
  costInr:     number;
  latencyMs:   number;
  capExceeded: boolean;
  stub:        boolean;
}

export async function callAi(req: AiRequest): Promise<AiResponse> {
  const model = req.model ?? "haiku-4.5";
  const cfg = MODELS[model];
  const t0 = Date.now();

  // ─── Cap check ────
  const todayCost = await todaysCostInr(req.tenantId);
  if (todayCost >= DEFAULT_DAILY_CAP_INR) {
    return {
      text: `⚠ Daily AI cost cap (₹${DEFAULT_DAILY_CAP_INR}) reached. Resets at midnight UTC.`,
      model, cached: false, promptTokens: 0, outputTokens: 0, costInr: 0,
      latencyMs: Date.now() - t0, capExceeded: true, stub: false,
    };
  }

  // ─── Cache check ────
  const cacheKey = hash(`${model}|${req.systemPrompt}|${req.userPrompt}`);
  if (!req.bypassCache) {
    const hit = await prisma.aiCache.findUnique({ where: { tenantId_cacheKey: { tenantId: req.tenantId, cacheKey }} });
    if (hit && hit.expiresAt > new Date()) {
      await prisma.aiCache.update({
        where: { id: hit.id },
        data: { hitCount: hit.hitCount + 1, lastHitAt: new Date() },
      });
      await logCall({ ...req, model, cached: true, promptTokens: hit.promptTokens, outputTokens: hit.outputTokens, costInr: 0, latencyMs: Date.now() - t0 });
      return {
        text: hit.response, model, cached: true,
        promptTokens: hit.promptTokens, outputTokens: hit.outputTokens, costInr: 0,
        latencyMs: Date.now() - t0, capExceeded: false, stub: false,
      };
    }
  }

  // ─── Make the call ────
  let resp: { text: string; promptTokens: number; outputTokens: number; stub: boolean };
  try {
    if (cfg.provider === "anthropic") {
      const hasKey = !!process.env.ANTHROPIC_API_KEY;
      resp = hasKey ? await callAnthropic(cfg.model, req.systemPrompt, req.userPrompt, req.maxTokens ?? 1500)
                    : stubResponse(req, "anthropic");
    } else if (cfg.provider === "gemini") {
      const hasKey = !!process.env.GEMINI_API_KEY;
      resp = hasKey ? await callGemini(cfg.model, req.systemPrompt, req.userPrompt, req.maxTokens ?? 1500)
                    : stubResponse(req, "gemini");
    } else {
      resp = stubResponse(req, "unknown");
    }
  } catch (e: any) {
    resp = stubResponse({ ...req, kind: `error:${e?.message?.slice(0,40)}` }, cfg.provider);
  }

  const costInr = (resp.promptTokens / 1_000_000) * cfg.costIn + (resp.outputTokens / 1_000_000) * cfg.costOut;
  const ttlHours = DEFAULT_TTL_HOURS[req.kind] ?? DEFAULT_TTL_HOURS.default;
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

  // Persist to cache (only if not stub — stubs shouldn't pollute cache)
  if (!resp.stub) {
    try {
      await prisma.aiCache.upsert({
        where: { tenantId_cacheKey: { tenantId: req.tenantId, cacheKey } },
        update: { response: resp.text, promptTokens: resp.promptTokens, outputTokens: resp.outputTokens, costInr, model, expiresAt, hitCount: 0 },
        create: { tenantId: req.tenantId, cacheKey, kind: req.kind, model, response: resp.text, promptTokens: resp.promptTokens, outputTokens: resp.outputTokens, costInr, expiresAt },
      });
    } catch { /* never let cache fail the response */ }
  }

  await logCall({ ...req, model, cached: false, promptTokens: resp.promptTokens, outputTokens: resp.outputTokens, costInr, latencyMs: Date.now() - t0 });

  return {
    text: resp.text, model, cached: false,
    promptTokens: resp.promptTokens, outputTokens: resp.outputTokens, costInr,
    latencyMs: Date.now() - t0, capExceeded: false, stub: resp.stub,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function hash(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

async function todaysCostInr(tenantId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const r = await prisma.aiCallLog.aggregate({
    where: { tenantId, createdAt: { gte: since }, cached: false },
    _sum: { costInr: true },
  });
  return Number(r._sum.costInr ?? 0);
}

async function logCall(args: { tenantId: string; userId: string; kind: string; model: string; cached: boolean; promptTokens: number; outputTokens: number; costInr: number; latencyMs: number }) {
  try {
    await prisma.aiCallLog.create({
      data: {
        tenantId: args.tenantId, userId: args.userId, kind: args.kind, model: args.model,
        cached: args.cached, promptTokens: args.promptTokens, outputTokens: args.outputTokens,
        costInr: args.costInr, latencyMs: args.latencyMs,
      },
    });
  } catch { /* never let logging fail the response */ }
}

function stubResponse(req: AiRequest, provider: string): { text: string; promptTokens: number; outputTokens: number; stub: true } {
  const stub = `[Stub mode — ${provider} key not configured]\n\nKind: ${req.kind}\nWould generate AI response for the supplied payload. Add ${provider === "anthropic" ? "ANTHROPIC_API_KEY" : "GEMINI_API_KEY"} to Vercel env to enable live AI.\n\nPayload preview:\n${req.userPrompt.slice(0, 400)}${req.userPrompt.length > 400 ? "…" : ""}`;
  return { text: stub, promptTokens: 0, outputTokens: 0, stub: true };
}

// ─── Anthropic call ────────────────────────────────────────────────

async function callAnthropic(model: string, system: string, user: string, maxTokens: number): Promise<{ text: string; promptTokens: number; outputTokens: number; stub: false }> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      // Use prompt caching on the system prompt — same skill text across many
      // calls means we pay 10% on cache-hit, full price only first time.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => "");
    throw new Error(`Anthropic ${r.status}: ${err.slice(0, 200)}`);
  }
  const j = await r.json();
  const text = (j.content?.[0]?.text ?? "").toString();
  return {
    text, promptTokens: j.usage?.input_tokens ?? 0,
    outputTokens: j.usage?.output_tokens ?? 0, stub: false,
  };
}

// ─── Gemini call ───────────────────────────────────────────────────

async function callGemini(model: string, system: string, user: string, maxTokens: number): Promise<{ text: string; promptTokens: number; outputTokens: number; stub: false }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.5 },
    }),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => "");
    throw new Error(`Gemini ${r.status}: ${err.slice(0, 200)}`);
  }
  const j = await r.json();
  const text = (j.candidates?.[0]?.content?.parts?.[0]?.text ?? "").toString();
  return {
    text,
    promptTokens: j.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0,
    stub: false,
  };
}
