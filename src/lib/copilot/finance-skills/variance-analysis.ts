// Wraps the Claude finance plugin's `variance-analysis` skill as a
// Copilot tool. Decomposes variances into Price/Volume/Mix/Timing/FX/
// One-time drivers with proper narrative — avoiding the circular/vague
// anti-patterns common in low-quality variance commentary.
//
// Source skill: plugin_01KmRfL8EXGF3PeqMRzef1TR/skills/variance-analysis/SKILL.md

import type { FinanceSkill, FinanceSkillContext, FinanceSkillResult } from "./types";

const SKILL_PROMPT = `# Variance Analysis — Driver Decomposition

You are operating under the variance-analysis lens. Decompose financial variances
into the underlying drivers and produce narrative that would survive scrutiny in
a board meeting.

## Materiality Triggers (default)
| Comparison | $ Threshold | % Threshold | Trigger |
|---|---|---|---|
| Actual vs Budget | 0.5-1% of revenue | 10% | Either exceeded |
| Actual vs Prior Period | 0.5-1% of revenue | 15% | Either exceeded |
| Actual vs Forecast | 0.5-1% of revenue | 5% | Either exceeded |
| MoM | 0.5-1% of revenue | 20% | Either exceeded |

## Decomposition Framework (for each material variance)

**Price / Volume / Mix (revenue, COGS):**
- Volume effect  = (Actual Vol − Budget Vol) × Budget Price
- Price effect   = (Actual Price − Budget Price) × Actual Volume
- Mix effect     = residual or proportional allocation
- Verify: Volume + Price + Mix = Total Variance

**Headcount / Comp (payroll):**
- Headcount variance = (Actual HC − Budget HC) × Budget Avg Comp
- Rate variance      = (Actual Avg Comp − Budget Avg Comp) × Budget HC
- Timing variance    = hiring earlier/later (partial-period effect)
- Mix variance       = level/department shift

**Other operating expense:**
- Spend category breakdown (where did the dollars go?)
- Recurring vs one-time
- Timing (early/late payment, shifted between periods)

## Investigation Priority
1. Largest absolute dollar variance (biggest P&L impact)
2. Largest percentage variance (may indicate process issue/error)
3. Unexpected direction (opposite to trend)
4. New variance (was on track, now off)
5. Cumulative/trending variance (growing each period)

## Narrative — DO
- Quantify driver split ($ + % per driver)
- Be specific about the business reason ("US enterprise renewal cycle pulled $4M from Q2 to Q1")
- State if temporary or trend
- Recommend action ("update Q2 forecast", "investigate AR aging in SE Asia segment")

## Narrative — DON'T (anti-patterns)
- "Revenue was higher due to higher revenue" (circular)
- "Expenses were elevated this period" (vague)
- "Timing" without saying what was early/late and when it normalizes
- "One-time" without explaining what
- "Various small items" for a material variance
- Focusing only on largest driver and ignoring offsetting items

## Compliance reminder (end every analysis with)
> *Variance commentary is for management discussion. Should be reviewed by qualified finance professionals before external reporting.*

Now apply the above to the variance data below.`;

export const varianceAnalysisSkill: FinanceSkill = {
  name: "do_variance_analysis",
  description: "Run a driver-decomposition variance analysis (Price/Volume/Mix/Headcount/Rate/Timing) between two scenarios. Use when user asks 'why did revenue miss budget?', 'analyze variance', 'flux analysis', 'explain the gap'. Requires scenarioId (actual), compareScenarioId (budget/forecast/prior), entityId, yearCode.",
  inputSchema: {
    type: "object",
    properties: {
      scenarioId:        { type: "string", description: "Primary scenario UUID (usually ACTUAL)" },
      compareScenarioId: { type: "string", description: "Comparison scenario UUID (BUDGET/FORECAST/PRIOR_ACTUAL)" },
      entityId:          { type: "string", description: "Entity UUID" },
      yearCode:          { type: "string", description: "Year code FYxxxx" },
      lineItem:          { type: "string", description: "Optional — focus on one line item (account code or name)" },
    },
    required: ["scenarioId", "compareScenarioId", "entityId", "yearCode"],
  },
  skillPrompt: SKILL_PROMPT,

  async execute(args, ctx: FinanceSkillContext): Promise<FinanceSkillResult> {
    const headers = { Cookie: ctx.sessionCookie, "Content-Type": "application/json" };
    const fetchIs = async (scenarioId: string) => {
      const qs = new URLSearchParams({ scenarioId, entityId: args.entityId, yearCode: args.yearCode });
      const r = await fetch(`${ctx.baseUrl}/api/v2/reports/income-statement?${qs}`, { headers });
      const j = await r.json();
      return j?.data ?? null;
    };
    const [current, comparison] = await Promise.all([
      fetchIs(args.scenarioId),
      fetchIs(args.compareScenarioId),
    ]);

    // Build a per-line-item variance table the AI can crunch
    const buildIndex = (rpt: any): Record<string, number> => {
      const idx: Record<string, number> = {};
      for (const s of rpt?.sections ?? []) {
        for (const l of s.lines ?? []) idx[l.code] = (idx[l.code] ?? 0) + (l.value ?? 0);
      }
      return idx;
    };
    const cur = buildIndex(current);
    const cmp = buildIndex(comparison);
    const codes = Array.from(new Set([...Object.keys(cur), ...Object.keys(cmp)])).sort();
    const variances = codes.map(code => {
      const c = cur[code] ?? 0, b = cmp[code] ?? 0;
      const diff = c - b;
      const pct = b === 0 ? null : (diff / b) * 100;
      return { code, current: c, comparison: b, diff, pct };
    });

    let filtered = variances;
    if (args.lineItem) {
      const needle = args.lineItem.toLowerCase();
      filtered = variances.filter(v => v.code.toLowerCase().includes(needle));
    }

    return {
      skill_guidance: SKILL_PROMPT,
      data: {
        scenarios: {
          primary:    current?.meta?.scenarioCode,
          comparison: comparison?.meta?.scenarioCode,
        },
        variances: filtered,
        totals: {
          current_total:    current?.totals?.netIncome ?? null,
          comparison_total: comparison?.totals?.netIncome ?? null,
        },
      },
      instructions: "Apply variance-analysis lens above. Identify material variances (use materiality thresholds). Decompose top 3-5 by driver. Provide narrative for each. End with compliance reminder.",
      meta: {
        skill: "variance-analysis",
        entityCode: current?.meta?.entityCode,
        yearCode: current?.meta?.yearCode,
        comparedLines: filtered.length,
      },
    };
  },
};
