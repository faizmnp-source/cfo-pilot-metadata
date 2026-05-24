#!/usr/bin/env node
// CFO Pilot MCP Server — exposes tenant data to Claude clients via MCP.
//
// 6 read-only tools (v1):
//   list_entities          → "What entities does this tenant have?"
//   list_accounts          → "Show me all expense accounts"
//   get_facts              → Raw fact query for any POV slice
//   get_trial_balance      → TB as JSON for any (scenario, entity, year)
//   get_income_statement   → IS sections + totals
//   get_dashboard_summary  → KPIs + monthly trend + entity mix + variances
//
// Install (in your Cowork / Claude Desktop mcp config):
//   {
//     "mcpServers": {
//       "cfo-pilot": {
//         "command": "npx",
//         "args": ["-y", "@cfo-pilot/mcp-server"],
//         "env": {
//           "CFO_PILOT_TOKEN":   "<paste from /api/v2/auth/mcp-token>",
//           "CFO_PILOT_BASE_URL": "https://metadata-module.vercel.app"
//         }
//       }
//     }
//   }

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

const TOKEN    = process.env.CFO_PILOT_TOKEN ?? "";
const BASE_URL = (process.env.CFO_PILOT_BASE_URL ?? "https://metadata-module.vercel.app").replace(/\/$/, "");

if (!TOKEN) {
  console.error("[cfo-pilot-mcp] ERROR: CFO_PILOT_TOKEN env var is required. Generate one via POST /api/v2/auth/mcp-token (admin only).");
  process.exit(1);
}

// ─── Helpers ────────────────────────────────────────────────────

async function api(path: string, query?: Record<string, string | undefined>): Promise<any> {
  const qs = query ? "?" + Object.entries(query).filter(([_, v]) => v != null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&") : "";
  const url = `${BASE_URL}${path}${qs}`;
  const r = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Accept": "application/json",
    },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`CFO Pilot API ${r.status}: ${text.slice(0, 300)}`);
  }
  const j = await r.json();
  return j?.data ?? j;
}

function trimText(s: string, max = 30_000): string {
  return s.length > max ? s.slice(0, max) + `\n\n[truncated: ${s.length - max} chars omitted — narrow filters to see more]` : s;
}

// ─── Tool definitions ────────────────────────────────────────────

const tools: Tool[] = [
  {
    name: "list_entities",
    description: "List all legal entities (Entity dimension members) for the CFO Pilot tenant. Returns member id, code, name, properties (base_currency, country, icp_enabled, etc.). Useful when you need to know what entities exist before querying facts or reports.",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Optional substring search on entity code or name" },
      },
    },
  },
  {
    name: "list_accounts",
    description: "List all accounts (Account dimension members). Returns code, name, account_type (REVENUE/EXPENSE/ASSET/LIABILITY/EQUITY), time_balance (FLOW/LAST), is_icp, cash_flow_category. Use this to discover chart of accounts before any deeper query.",
    inputSchema: {
      type: "object",
      properties: {
        accountType: { type: "string", enum: ["REVENUE", "EXPENSE", "ASSET", "LIABILITY", "EQUITY"], description: "Filter by account type" },
        search:      { type: "string", description: "Optional substring search on account code or name" },
      },
    },
  },
  {
    name: "get_facts",
    description: "Pull raw fact rows for a specific intersection (POV). Returns per-cell values (accountId, timeId, value, version, postedBy, postedAt). Use this when you need the underlying granular data, not aggregated reports.",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId: { type: "string", description: "Scenario member id (e.g. ACTUAL or BUDGET id)" },
        entityId:   { type: "string", description: "Entity member id (leaf entity)" },
        yearCode:   { type: "string", description: "Year code like FY2026" },
      },
      required: ["scenarioId", "entityId", "yearCode"],
    },
  },
  {
    name: "get_trial_balance",
    description: "Generate a Trial Balance report: one line per leaf account with YTD value. Respects each account's time_balance (FLOW = sum, LAST = closing). Returns sections + lines + totals + meta. Best starting point for any finance question.",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId: { type: "string" },
        entityId:   { type: "string" },
        yearCode:   { type: "string", description: "e.g. FY2026" },
      },
      required: ["scenarioId", "entityId", "yearCode"],
    },
  },
  {
    name: "get_income_statement",
    description: "Generate an Income Statement: Revenue and Expense sections with subtotals + Net Income total + margin %. Use when the user asks for P&L, IS, profitability, or revenue/expense breakdown.",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId: { type: "string" },
        entityId:   { type: "string" },
        yearCode:   { type: "string" },
      },
      required: ["scenarioId", "entityId", "yearCode"],
    },
  },
  {
    name: "get_dashboard_summary",
    description: "Executive dashboard data in one call: 6 KPIs (Revenue, COGS, Gross Profit, Opex, Net Income, Cash) with delta vs compare scenario, monthly trend, revenue-by-entity donut, expense-by-category bars, top variances, cash trajectory. Use for executive-level questions or any 'how is the business doing' query.",
    inputSchema: {
      type: "object",
      properties: {
        scenarioId:        { type: "string", description: "Primary scenario (usually ACTUAL)" },
        compareScenarioId: { type: "string", description: "Optional comparison scenario (usually BUDGET) for variance deltas" },
        yearCode:          { type: "string" },
        entityIds:         { type: "string", description: "Comma-separated entity ids. If omitted, defaults to all leaf entities." },
      },
      required: ["scenarioId", "yearCode"],
    },
  },
];

// ─── Server bootstrap ────────────────────────────────────────────

const server = new Server(
  { name: "cfo-pilot", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    let data: any;
    switch (name) {
      case "list_entities": {
        const search = (args.search as string | undefined)?.toLowerCase();
        const r = await api("/api/v2/members/entity", { pageSize: "500" });
        let rows = (r?.data ?? []) as any[];
        if (search) rows = rows.filter(m => m.memberCode.toLowerCase().includes(search) || m.memberName.toLowerCase().includes(search));
        data = rows.map(m => ({
          id: m.id, code: m.memberCode, name: m.memberName,
          base_currency: m.properties?.base_currency,
          country: m.properties?.country,
          icp_enabled: m.properties?.icp_enabled,
        }));
        break;
      }
      case "list_accounts": {
        const search = (args.search as string | undefined)?.toLowerCase();
        const accountType = args.accountType as string | undefined;
        const r = await api("/api/v2/members/account", { pageSize: "500" });
        let rows = (r?.data ?? []) as any[];
        if (search) rows = rows.filter(m => m.memberCode.toLowerCase().includes(search) || m.memberName.toLowerCase().includes(search));
        if (accountType) rows = rows.filter(m => m.properties?.account_type === accountType);
        data = rows.map(m => ({
          id: m.id, code: m.memberCode, name: m.memberName,
          account_type: m.properties?.account_type,
          time_balance: m.properties?.time_balance,
          is_icp: m.properties?.is_icp,
          cash_flow_category: m.properties?.cash_flow_category,
        }));
        break;
      }
      case "get_facts": {
        data = await api("/api/v2/facts", {
          scenarioId: args.scenarioId as string,
          entityId:   args.entityId as string,
          yearCode:   args.yearCode as string,
        });
        break;
      }
      case "get_trial_balance": {
        data = await api(`/api/v2/reports/trial-balance`, {
          scenarioId: args.scenarioId as string,
          entityId:   args.entityId as string,
          yearCode:   args.yearCode as string,
        });
        break;
      }
      case "get_income_statement": {
        data = await api(`/api/v2/reports/income-statement`, {
          scenarioId: args.scenarioId as string,
          entityId:   args.entityId as string,
          yearCode:   args.yearCode as string,
        });
        break;
      }
      case "get_dashboard_summary": {
        data = await api(`/api/v2/dashboard/summary`, {
          scenarioId:        args.scenarioId as string,
          compareScenarioId: args.compareScenarioId as string | undefined,
          yearCode:          args.yearCode as string,
          entityIds:         args.entityIds as string | undefined,
        });
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: "text", text: trimText(JSON.stringify(data, null, 2)) }] };
  } catch (e: any) {
    return {
      content: [{ type: "text", text: `ERROR calling ${name}: ${e?.message ?? String(e)}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[cfo-pilot-mcp] connected. Tenant resolved from token. Base URL: ${BASE_URL}`);
