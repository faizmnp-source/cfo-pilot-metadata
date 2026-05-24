// POST /api/v2/copilot/chat
//
// AI Copilot — single chat surface that uses Anthropic tool-use to call
// any of our v2 APIs. User asks in natural language, Claude picks tools,
// server executes them, Claude synthesises final answer.
//
// Body:
//   { conversationId?: string,
//     message: string,
//     model?: 'haiku-4.5' | 'sonnet-4.6' }
//
// Returns:
//   { conversationId, messages: [{ role, content, toolUseBlocks }] }
//
// SSE streaming planned for v2; v1 returns the full response.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { FINANCE_SKILLS, skillsToToolDefs, findSkill } from "@/lib/copilot/finance-skills";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const BASE_URL_INTERNAL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";

// ─── Tool definitions (mirror MCP server) ───────────────────────────

const TOOLS = [
  {
    name: "list_entities",
    description: "List all legal entities (Entity dim members) for this tenant. Returns code, name, base_currency, country, icp_enabled. Use first when user asks about entities.",
    input_schema: { type: "object", properties: { search: { type: "string", description: "Optional substring filter on code/name" }} },
  },
  {
    name: "list_accounts",
    description: "List all accounts (Account dim members). Filters: accountType (REVENUE/EXPENSE/ASSET/LIABILITY/EQUITY), search. Use when user asks about chart of accounts.",
    input_schema: { type: "object", properties: { accountType: { type: "string", enum: ["REVENUE","EXPENSE","ASSET","LIABILITY","EQUITY"] }, search: { type: "string" }} },
  },
  {
    name: "list_scenarios",
    description: "List scenario members (ACTUAL, BUDGET, FORECAST). Returns id+code+name. Call this FIRST whenever the user mentions 'actual', 'budget', 'forecast' to resolve to ids.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_income_statement",
    description: "Generate Income Statement. Args: scenarioId (uuid), entityId (uuid), yearCode (FYxxxx). Returns sectioned IS w/ Operating Revenue, COGS, Gross Profit, Opex, Operating Income, Other I/E, Pre-Tax, Tax, Net Income.",
    input_schema: { type: "object", properties: { scenarioId: { type: "string" }, entityId: { type: "string" }, yearCode: { type: "string" }}, required: ["scenarioId","entityId","yearCode"] },
  },
  {
    name: "get_balance_sheet",
    description: "Generate Balance Sheet. Same args as get_income_statement.",
    input_schema: { type: "object", properties: { scenarioId: { type: "string" }, entityId: { type: "string" }, yearCode: { type: "string" }}, required: ["scenarioId","entityId","yearCode"] },
  },
  {
    name: "get_trial_balance",
    description: "Generate Trial Balance. Same args as get_income_statement.",
    input_schema: { type: "object", properties: { scenarioId: { type: "string" }, entityId: { type: "string" }, yearCode: { type: "string" }}, required: ["scenarioId","entityId","yearCode"] },
  },
  {
    name: "get_dashboard_summary",
    description: "Executive dashboard summary: KPIs (Revenue, COGS, GP, Opex, NI, Cash) + monthly trend + entity mix + variances. Best for 'how is the business doing'.",
    input_schema: { type: "object", properties: { scenarioId: { type: "string" }, compareScenarioId: { type: "string" }, yearCode: { type: "string" }, entityIds: { type: "string", description: "comma-separated" }}, required: ["scenarioId","yearCode"] },
  },
  {
    name: "run_consolidation",
    description: "TRIGGER consolidation process — walks entity hierarchy, sums leaves, FX translates, IC eliminates. ⚠ WRITE operation. Args: scenarioId, entityId (parent), yearCode. Confirm with user before calling.",
    input_schema: { type: "object", properties: { scenarioId: { type: "string" }, entityId: { type: "string" }, yearCode: { type: "string" }}, required: ["scenarioId","entityId","yearCode"] },
  },
];

const WRITE_TOOLS = new Set(["run_consolidation"]);

// All tools = built-in v2 API tools + finance skill tools (auto-derived from registry)
const ALL_TOOLS = [...TOOLS, ...skillsToToolDefs()];

// ─── System prompt ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the CFO Pilot Copilot — a finance assistant for users of a multi-tenant EPM SaaS.

You have TWO classes of tools:

## A. Data tools (raw — return numbers, no analysis)
- list_entities, list_accounts, list_scenarios — metadata lookup
- get_income_statement, get_balance_sheet, get_trial_balance — raw financial reports
- get_dashboard_summary — KPI snapshot
- run_consolidation — WRITE (process trigger)

## B. Skill tools (analyst-grade — apply a structured CFO lens, return guidance + data)
- analyze_income_statement — GAAP-grade MD&A with materiality + variance decomposition
- do_variance_analysis — Price/Volume/Mix/Headcount/Rate decomposition with narrative
- plan_month_end_close — Day-by-day close plan with dependencies and bottleneck risk
- (more skill tools coming: reconciliation, journal-entry, audit-support)

## Tool selection guidance — IMPORTANT

- For an analytical question ("analyze our P&L", "why did margin slip?", "plan our close"), PREFER the skill tool. It returns both the data AND the analytical lens — follow that lens precisely in your final answer.
- For raw data ("show me revenue", "list our entities", "what scenarios exist?"), use the data tools directly.
- A skill tool's result includes a 'skill_guidance' field — that IS your instruction set for the response. Internalize and apply it. The 'instructions' field tells you exactly what shape the final answer should take. Always end skill-tool answers with the compliance reminder from the guidance.

## Workflow

1. Decide if the question is analytical (→ skill tool) or raw (→ data tool).
2. If the user mentions an entity by name (US_HQ, GRP, Dtaxdude India), call list_entities first to resolve UUIDs.
3. If they mention scenario (ACTUAL/BUDGET) or year (FY2026), resolve via list_scenarios.
4. Read tools — execute freely.
5. Write tools (run_consolidation) — describe what you'll do, wait for "yes"/"go"/"confirm".
6. After tools return, synthesize. Format numbers with currency symbols. Use markdown.
7. Cite tools at the end: "Used: analyze_income_statement (financial-statements skill)".

## Hard rules

- Don't make up numbers. If a tool returns no data, say so.
- Don't expose UUIDs to the user unless they ask.
- For skill-tool answers, always follow the skill's required format (tables, materiality thresholds, etc.) and end with the compliance reminder.
- Be concise on raw questions, structured + thorough on analytical ones.`;

// ─── Tool execution (server-side) ─────────────────────────────────

async function executeTool(toolName: string, args: any, tenantId: string, sessionCookie: string): Promise<any> {
  const headers = { "Cookie": sessionCookie, "Content-Type": "application/json" };

  // ─── Finance skill tools (registry-driven) ─────────────────────────
  const skill = findSkill(toolName);
  if (skill) {
    return skill.execute(args, {
      tenantId,
      sessionCookie,
      baseUrl: BASE_URL_INTERNAL,
    });
  }

  // ─── Built-in v2 API tools ─────────────────────────────────────────
  switch (toolName) {
    case "list_entities": {
      const r = await fetch(`${BASE_URL_INTERNAL}/api/v2/members/entity?pageSize=500`, { headers });
      const j = await r.json();
      let rows = (j?.data?.data ?? []).filter((m: any) => m.isActive);
      if (args.search) rows = rows.filter((m: any) => (m.memberCode + m.memberName).toLowerCase().includes(args.search.toLowerCase()));
      return rows.map((m: any) => ({ id: m.id, code: m.memberCode, name: m.memberName, base_currency: m.properties?.base_currency, country: m.properties?.country, icp_enabled: m.properties?.icp_enabled }));
    }
    case "list_accounts": {
      const r = await fetch(`${BASE_URL_INTERNAL}/api/v2/members/account?pageSize=500`, { headers });
      const j = await r.json();
      let rows = (j?.data?.data ?? []).filter((m: any) => m.isActive);
      if (args.accountType) rows = rows.filter((m: any) => m.properties?.account_type === args.accountType);
      if (args.search) rows = rows.filter((m: any) => (m.memberCode + m.memberName).toLowerCase().includes(args.search.toLowerCase()));
      return rows.map((m: any) => ({ id: m.id, code: m.memberCode, name: m.memberName, account_type: m.properties?.account_type, time_balance: m.properties?.time_balance, is_icp: m.properties?.is_icp }));
    }
    case "list_scenarios": {
      const r = await fetch(`${BASE_URL_INTERNAL}/api/v2/members/scenario?pageSize=100`, { headers });
      const j = await r.json();
      return (j?.data?.data ?? []).filter((m: any) => m.isActive).map((m: any) => ({ id: m.id, code: m.memberCode, name: m.memberName }));
    }
    case "get_income_statement":
    case "get_balance_sheet":
    case "get_trial_balance": {
      const kind = toolName.replace("get_", "").replace("_", "-");
      const qs = new URLSearchParams({ scenarioId: args.scenarioId, entityId: args.entityId, yearCode: args.yearCode });
      const r = await fetch(`${BASE_URL_INTERNAL}/api/v2/reports/${kind}?${qs}`, { headers });
      const j = await r.json();
      return j?.data ?? j;
    }
    case "get_dashboard_summary": {
      const qs = new URLSearchParams({ scenarioId: args.scenarioId, yearCode: args.yearCode });
      if (args.compareScenarioId) qs.set("compareScenarioId", args.compareScenarioId);
      if (args.entityIds) qs.set("entityIds", args.entityIds);
      const r = await fetch(`${BASE_URL_INTERNAL}/api/v2/dashboard/summary?${qs}`, { headers });
      const j = await r.json();
      return j?.data ?? j;
    }
    case "run_consolidation": {
      const r = await fetch(`${BASE_URL_INTERNAL}/api/v2/processes/consolidation`, {
        method: "POST", headers,
        body: JSON.stringify({ scenarioId: args.scenarioId, entityId: args.entityId, yearCode: args.yearCode }),
      });
      const j = await r.json();
      return j?.data ?? j;
    }
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ─── Main handler ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  let body: any;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }
  const message = String(body?.message ?? "").trim();
  const model   = body?.model ?? "haiku-4.5";
  const conversationId = body?.conversationId as string | undefined;
  if (!message) return apiError("message is required", 400);

  // Resolve or create conversation
  let convo = conversationId
    ? await prisma.copilotConversation.findFirst({ where: { id: conversationId, tenantId: auth.tid, userId: auth.sub } })
    : null;
  if (!convo) {
    convo = await prisma.copilotConversation.create({
      data: { tenantId: auth.tid, userId: auth.sub, title: message.slice(0, 80) },
    });
  }

  // Load conversation history
  const prior = await prisma.copilotMessage.findMany({
    where: { conversationId: convo.id }, orderBy: { createdAt: "asc" },
  });

  // Save user message
  await prisma.copilotMessage.create({
    data: { conversationId: convo.id, role: "user", content: message },
  });

  // Stub mode if no API key
  if (!ANTHROPIC_KEY) {
    const stubResponse = `[Stub mode — ANTHROPIC_API_KEY not set on the server]\n\nYou asked: "${message}"\n\nOnce the key lands, I'd call appropriate tools (list_entities, get_income_statement, run_consolidation, etc.) and synthesise an answer using your real Dtaxdude data.\n\nAdd the key via:\nhttps://vercel.com/faizmnp-sources-projects/metadata-module/settings/environment-variables`;
    await prisma.copilotMessage.create({
      data: { conversationId: convo.id, role: "assistant", content: stubResponse, model: "stub" },
    });
    return apiResponse({
      conversationId: convo.id, title: convo.title,
      response: { role: "assistant", content: stubResponse, toolUseBlocks: [], stub: true },
    });
  }

  // Build message history for Anthropic
  const anthropicMessages: any[] = [];
  for (const m of prior) {
    if (m.role === "user") anthropicMessages.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      // Reconstruct content blocks (text + tool_use)
      const blocks: any[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      // (tool_use blocks recovered from m.toolUseBlocks would go here in v2)
      anthropicMessages.push({ role: "assistant", content: blocks.length ? blocks : m.content });
    }
  }
  anthropicMessages.push({ role: "user", content: message });

  // Get session cookie to pass through to internal API calls
  const sessionCookie = req.headers.get("cookie") ?? "";

  // Tool-use loop (max 5 rounds to prevent runaway)
  const toolUseBlocks: any[] = [];
  let assistantText = "";
  let totalPromptTokens = 0, totalOutputTokens = 0;
  const startTime = Date.now();

  for (let round = 0; round < 5; round++) {
    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: model === "sonnet-4.6" ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: ALL_TOOLS,
        messages: anthropicMessages,
      }),
    });
    if (!claudeResp.ok) {
      const err = await claudeResp.text();
      return apiError(`Anthropic ${claudeResp.status}: ${err.slice(0, 200)}`, 502);
    }
    const j = await claudeResp.json();
    totalPromptTokens += j.usage?.input_tokens ?? 0;
    totalOutputTokens += j.usage?.output_tokens ?? 0;

    const stopReason = j.stop_reason;
    const blocks = j.content ?? [];

    // Collect assistant content
    const newAssistantBlocks: any[] = [];
    for (const b of blocks) {
      newAssistantBlocks.push(b);
      if (b.type === "text") assistantText += b.text;
    }
    anthropicMessages.push({ role: "assistant", content: newAssistantBlocks });

    if (stopReason !== "tool_use") break;  // Done

    // Execute tool calls + push results back
    const toolResults: any[] = [];
    for (const b of blocks) {
      if (b.type !== "tool_use") continue;
      try {
        const result = await executeTool(b.name, b.input, auth.tid, sessionCookie);
        toolUseBlocks.push({ tool: b.name, input: b.input, result });
        toolResults.push({
          type: "tool_result", tool_use_id: b.id,
          content: JSON.stringify(result).slice(0, 30_000),
        });
      } catch (e: any) {
        toolUseBlocks.push({ tool: b.name, input: b.input, error: e.message });
        toolResults.push({
          type: "tool_result", tool_use_id: b.id, is_error: true,
          content: `Tool error: ${e.message}`,
        });
      }
    }
    anthropicMessages.push({ role: "user", content: toolResults });
  }

  const latencyMs = Date.now() - startTime;
  // Cost: roughly Haiku ₹1/M in, ₹5/M out (USD * 83)
  const isSonnet = model === "sonnet-4.6";
  const costInr = isSonnet
    ? (totalPromptTokens / 1_000_000) * 3 * 83 + (totalOutputTokens / 1_000_000) * 15 * 83
    : (totalPromptTokens / 1_000_000) * 1 * 83 + (totalOutputTokens / 1_000_000) * 5 * 83;

  await prisma.copilotMessage.create({
    data: {
      conversationId: convo.id, role: "assistant",
      content: assistantText || "(no text response)",
      toolUseBlocks: toolUseBlocks as any,
      model, promptTokens: totalPromptTokens, outputTokens: totalOutputTokens, costInr,
    },
  });

  return apiResponse({
    conversationId: convo.id, title: convo.title,
    response: { role: "assistant", content: assistantText, toolUseBlocks },
    cost: { inr: costInr, promptTokens: totalPromptTokens, outputTokens: totalOutputTokens, latencyMs, model },
  });
}

// GET — list user's conversations
export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const url = new URL(req.url);
  const conversationId = url.searchParams.get("id");

  if (conversationId) {
    const convo = await prisma.copilotConversation.findFirst({
      where: { id: conversationId, tenantId: auth.tid, userId: auth.sub },
      include: { messages: { orderBy: { createdAt: "asc" }}},
    });
    return apiResponse(convo);
  }

  const convos = await prisma.copilotConversation.findMany({
    where: { tenantId: auth.tid, userId: auth.sub },
    orderBy: { updatedAt: "desc" }, take: 30,
    include: { _count: { select: { messages: true }}},
  });
  return apiResponse({ data: convos });
}
