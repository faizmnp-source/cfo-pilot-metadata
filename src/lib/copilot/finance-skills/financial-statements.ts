// Wraps the Claude finance plugin's `financial-statements` skill as a
// Copilot tool. When user asks "analyze our income statement" or
// "generate financial statements with variance analysis", Claude picks
// this tool. We fetch IS + comparison data and return the skill's
// analytical guidance so Claude produces a CFO-grade narrative.
//
// Source skill: plugin_01KmRfL8EXGF3PeqMRzef1TR/skills/financial-statements/SKILL.md

import type { FinanceSkill, FinanceSkillContext, FinanceSkillResult } from "./types";

const SKILL_PROMPT = `# Financial Statements Analysis — CFO Grade

You are now operating under the financial-statements analytical lens. Apply this lens to
interpret the data below and produce a CFO-grade narrative.

## Presentation Requirements
- Multi-column format: Current | Prior Period | Variance ($) | Variance (%) | Budget (if available) | Budget Var
- Standard GAAP order: Revenue → COGS → Gross Profit → Opex → Operating Income → Other I/E → Pre-Tax → Tax → Net Income
- Show margin lines (Gross Margin %, Operating Margin %, Net Margin %) below their subtotals
- Format numbers consistently (thousands or millions); negative as parentheses; use accounting currency symbols

## Materiality Thresholds (when flagging variances)
| Line Item Size | $ Threshold | % Threshold |
|---|---|---|
| > $10M | $500K | 5% |
| $1M - $10M | $100K | 10% |
| < $1M | $50K | 15% |

A variance is material if EITHER the $ or % threshold is exceeded.

## Variance Decomposition (for each material variance)
- **Volume/quantity effect** — change in volume at prior rates
- **Rate/price effect** — change in rate/price at current volume
- **Mix effect** — shift in composition between items with different rates
- **Timing effect** — items shifting between periods (not a true run-rate change)
- **One-time/non-recurring** — items not expected to repeat
- **Currency (FX)** — impact of FX rate changes on translated results

## Narrative Structure (for each material variance)
1. Quantify ($ + %)
2. Favorable or unfavorable?
3. Decompose by driver category above
4. Business reason (specific, not generic — avoid "various small items")
5. Temporary vs trend?
6. Action required (investigation, forecast update, process change)

## Key Metrics Summary (always include)
- Revenue growth %, Gross margin %, Operating margin %, Net margin %, OpEx as % of revenue, Effective tax rate

## Anti-patterns to avoid
- "Revenue was higher due to higher revenue" (circular)
- "Expenses were elevated" (vague — which expenses? why?)
- "Timing" without specifying what was early/late
- Lumping items as "various small items" if material

## Compliance reminder (always end narrative with)
> *This analysis is for management discussion. Statements should be reviewed by qualified financial professionals before reporting or filing.*

Now apply the above to the data below.`;

export const financialStatementsSkill: FinanceSkill = {
  name: "analyze_income_statement",
  description: "Generate a CFO-grade Income Statement analysis with GAAP presentation, materiality-thresholded variance commentary, and key margin metrics. Use when user asks to 'analyze IS', 'generate financial statements', 'produce MD&A', 'flux analysis', or compares periods/budget. Requires scenarioId + entityId + yearCode (resolve via list_scenarios + list_entities first). Optionally takes compareScenarioId for budget/prior comparison.",
  inputSchema: {
    type: "object",
    properties: {
      scenarioId: { type: "string", description: "Primary scenario UUID (usually ACTUAL)" },
      entityId:   { type: "string", description: "Entity UUID (e.g. GRP for consolidated)" },
      yearCode:   { type: "string", description: "Year code like FY2026" },
      compareScenarioId: { type: "string", description: "Optional — second scenario for comparison (BUDGET/FORECAST/prior ACTUAL)" },
    },
    required: ["scenarioId", "entityId", "yearCode"],
  },
  skillPrompt: SKILL_PROMPT,

  async execute(args, ctx: FinanceSkillContext): Promise<FinanceSkillResult> {
    const headers = { Cookie: ctx.sessionCookie, "Content-Type": "application/json" };
    const qs = new URLSearchParams({ scenarioId: args.scenarioId, entityId: args.entityId, yearCode: args.yearCode });
    const isResp = await fetch(`${ctx.baseUrl}/api/v2/reports/income-statement?${qs}`, { headers });
    const isJson = await isResp.json();
    const current = isJson?.data ?? null;

    let comparison: any = null;
    if (args.compareScenarioId) {
      const qs2 = new URLSearchParams({ scenarioId: args.compareScenarioId, entityId: args.entityId, yearCode: args.yearCode });
      const r2 = await fetch(`${ctx.baseUrl}/api/v2/reports/income-statement?${qs2}`, { headers });
      const j2 = await r2.json();
      comparison = j2?.data ?? null;
    }

    return {
      skill_guidance: SKILL_PROMPT,
      data: { current, comparison },
      instructions: comparison
        ? "Produce a CFO-grade IS narrative comparing current vs comparison scenario. Apply materiality thresholds. Decompose variances. Include margin metrics. End with the compliance reminder."
        : "Produce a CFO-grade IS commentary on the current period. Highlight margin metrics, the largest line items, and anything anomalous. End with the compliance reminder. If user wants a comparison, tell them to provide a compareScenarioId.",
      meta: {
        skill: "financial-statements",
        entityCode: current?.meta?.entityCode,
        scenarioCode: current?.meta?.scenarioCode,
        yearCode: current?.meta?.yearCode,
        rowsRead: current?.meta?.rowsRead,
        hasComparison: !!comparison,
      },
    };
  },
};
