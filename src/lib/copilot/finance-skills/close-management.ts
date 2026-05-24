// Wraps the Claude finance plugin's `close-management` skill as a
// Copilot tool. Generates a month-end close plan tailored to a target
// close day, with task sequencing and dependencies.
//
// Source skill: plugin_01KmRfL8EXGF3PeqMRzef1TR/skills/close-management/SKILL.md

import type { FinanceSkill, FinanceSkillContext, FinanceSkillResult } from "./types";

const SKILL_PROMPT = `# Month-End Close — Plan & Sequence

You are operating under the close-management lens. Produce a concrete close
plan with task sequencing, dependencies, and owners. Default to a 5-day close
unless the user requests accelerated (3-day).

## Standard 5-Day Close Calendar

| Day | Key Activities | Responsible |
|-----|---|---|
| **T+1** | Cash entries, payroll, AP accruals, depreciation, prepaid amortization, intercompany posting | Staff accountants, payroll |
| **T+2** | Revenue recognition, remaining accruals, subledger recs (AR/AP/FA), FX revaluation | Revenue accountant, AP/AR, treasury |
| **T+3** | Balance sheet recs, intercompany rec + eliminations, preliminary TB, preliminary flux | Accounting, consolidation |
| **T+4** | Tax provision, equity roll-forward, draft FS, detailed flux, management review | Tax, controller, FP&A |
| **T+5** | Final adjustments, hard close, period lock, reporting package, forecast update | Controller, FP&A, finance leadership |

## Accelerated 3-Day Close
| Day | Activities |
|---|---|
| **T+1** | All JEs (auto + manual), all subledger recs, bank rec, IC rec, preliminary TB |
| **T+2** | All BS recs, tax provision, consolidation, draft FS, flux, mgmt review |
| **T+3** | Final adjustments, hard close, reporting package, forecast update |

**Prerequisites for 3-day close:**
- Automated recurring JEs (depreciation, amortization, standard accruals)
- Continuous (not month-end) reconciliation
- Automated intercompany elimination
- Pre-close cut-off + accrual estimates done before month-end
- Empowered team, minimal handoffs
- Real-time sub-system integration

## Common Bottlenecks → Solutions
| Bottleneck | Root Cause | Solution |
|---|---|---|
| Late AP accruals | Waiting for dept spend confirmation | Continuous accrual estimation; cut-off deadlines |
| Manual JEs | Recurring entries prepared by hand | Automate in ERP |
| Slow recs | Starting from scratch each month | Continuous/rolling reconciliation |
| IC delays | Waiting on counterparty | Automate matching, stricter deadlines |
| Mgmt review surprises | Large adjustments late | Improve preliminary review, empower team |
| Missing docs | Scrambling at close | Maintain documentation throughout month |

## Retrospective Questions (always end with these)
1. What went well this close that we should continue?
2. What took longer than expected and why?
3. What blockers did we encounter and how can we prevent them?
4. Any surprises in results we should have caught earlier?
5. What can we automate or streamline for next month?

## Compliance reminder
> *This close plan is a working framework. Adapt to your organization's actual cut-offs, sub-system schedule, and team structure.*

Now apply the above to the close-plan request below.`;

export const closeManagementSkill: FinanceSkill = {
  name: "plan_month_end_close",
  description: "Generate a month-end close plan with task sequencing, dependencies, and owners. Use when user asks 'plan our close', 'month-end checklist', 'help with the close', 'what should we do on T+2'. Args: closePeriod (e.g. '2026-04'), targetDays (3 or 5), entityId (optional — defaults to consolidated).",
  inputSchema: {
    type: "object",
    properties: {
      closePeriod: { type: "string", description: "Period being closed, e.g. '2026-04' or 'April 2026'" },
      targetDays:  { type: "number", description: "Target close days — 3 (accelerated) or 5 (standard). Default 5." },
      entityId:    { type: "string", description: "Optional — entity scope (default consolidated)" },
      includeFy:   { type: "boolean", description: "Optional — add fiscal year-end specifics (additional tasks)" },
    },
    required: ["closePeriod"],
  },
  skillPrompt: SKILL_PROMPT,

  async execute(args, ctx: FinanceSkillContext): Promise<FinanceSkillResult> {
    // Pull recent close-run history if available, otherwise just metadata
    const headers = { Cookie: ctx.sessionCookie, "Content-Type": "application/json" };
    let recentRuns: any[] = [];
    try {
      const r = await fetch(`${ctx.baseUrl}/api/v2/processes/consolidation/recent?limit=5`, { headers });
      const j = await r.json();
      recentRuns = j?.data?.runs ?? j?.data ?? [];
    } catch { /* endpoint may not exist yet — skip */ }

    const targetDays = args.targetDays === 3 ? 3 : 5;

    return {
      skill_guidance: SKILL_PROMPT,
      data: {
        closePeriod: args.closePeriod,
        targetDays,
        entityId: args.entityId ?? "consolidated",
        includeFiscalYearEnd: !!args.includeFy,
        recentConsolidationRuns: recentRuns.slice(0, 5),
      },
      instructions: `Produce a ${targetDays}-day close plan for period ${args.closePeriod}. Include: (1) day-by-day task list with owners, (2) dependency map for the top blocking tasks, (3) 3-5 bottleneck risks specific to this org based on recent run history if available, (4) retrospective questions at the end. End with the compliance reminder.`,
      meta: {
        skill: "close-management",
        closePeriod: args.closePeriod,
        targetDays,
      },
    };
  },
};
