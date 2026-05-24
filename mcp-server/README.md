# CFO Pilot MCP Server

Connects Claude (Cowork desktop, Claude Desktop, Claude Code) to your CFO Pilot tenant data. Once installed, Claude can answer questions like:

- *"What entities does Dtaxdude have?"*
- *"Show me all expense accounts"*
- *"Generate income statement for US_HQ FY2026"*
- *"Use /financial-statements monthly for GRP FY2026"*
- *"What's the executive dashboard saying right now?"*

The skills shipped in Anthropic's `finance` plugin (variance-analysis, financial-statements, close-management, etc.) work end-to-end against your real data because they call these tools to fetch source numbers.

---

## 1. Get a token

In CFO Pilot (logged in as admin):

```bash
curl -X POST https://metadata-module.vercel.app/api/v2/auth/mcp-token \
  -H "Content-Type: application/json" \
  -b "cfo_metadata_token=<your session cookie>"
```

Or via the in-app Settings → MCP Token (Phase 1.5).

Copy the `token` string from the response — it's valid 90 days.

## 2. Install (one of three)

### Cowork desktop

Add to your Cowork MCP config (Settings → MCP servers → Add custom):

```json
{
  "mcpServers": {
    "cfo-pilot": {
      "command": "npx",
      "args": ["-y", "@cfo-pilot/mcp-server"],
      "env": {
        "CFO_PILOT_TOKEN":   "<paste token>",
        "CFO_PILOT_BASE_URL": "https://metadata-module.vercel.app"
      }
    }
  }
}
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` — same shape as above.

### Claude Code

```bash
claude mcp add cfo-pilot \
  --command "npx" --args "-y" --args "@cfo-pilot/mcp-server" \
  --env "CFO_PILOT_TOKEN=<paste token>" \
  --env "CFO_PILOT_BASE_URL=https://metadata-module.vercel.app"
```

## 3. Run

Restart your client. Open chat. Type:

> *"What entities does my tenant have?"*

You should see Claude call `list_entities` and respond with your real data.

Then try the wow demo:

> *"Use the financial-statements skill on entity US_HQ for FY2026"*

Claude reads the skill, calls `get_income_statement` to fetch your numbers, and returns a properly formatted IS.

---

## Available tools (v1)

| Tool | What it does |
|---|---|
| `list_entities` | Lists all entities + their base currency / country |
| `list_accounts` | Lists all accounts + tags (account_type, time_balance, is_icp, cash_flow_category) |
| `get_facts` | Raw fact rows for (scenario × entity × year) |
| `get_trial_balance` | TB report |
| `get_income_statement` | IS report (sections + totals + margin) |
| `get_dashboard_summary` | KPIs + monthly trend + entity mix + variances |

All tools are **read-only**. Write tools (run consolidation, save fact, edit metadata) come in v2 once we trust the auth flow.

## Security notes

- Token is scoped to one tenant + one user role
- Token expires in 90 days; rotate via the same API
- Treat it like a password — paste only into your local MCP config, never commit to git
- Revoking access today = change `JWT_SECRET` env var on the server (revokes ALL tokens). Per-token revocation lands in v2 with a token registry.

## Dev

```bash
# From cfo-pilot-metadata/mcp-server/
npm install
CFO_PILOT_TOKEN=xxx npm run dev      # stdio server, ready for MCP client

# Build for distribution
npm run build
```
