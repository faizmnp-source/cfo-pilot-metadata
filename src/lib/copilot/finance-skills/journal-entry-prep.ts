// Wraps the Claude finance plugin's `journal-entry-prep` skill as a Copilot tool.
// (Sibling to journal-entry — this one focuses on close-cycle batch JEs:
// accruals, prepaid amortization, depreciation schedule, payroll, recurring.)
// Source: plugin_01KmRfL8EXGF3PeqMRzef1TR/skills/journal-entry-prep/SKILL.md

import type { FinanceSkill, FinanceSkillContext, FinanceSkillResult } from "./types";

const SKILL_PROMPT = `# Journal Entry Prep — Close-Cycle Batch Entries

You are operating under the journal-entry-prep lens. Prepare the standard recurring JEs needed every month-end close.

## Standard close-cycle JE batches

### 1. AP accruals (T+1 close day)
For each open PO/service received not yet invoiced:
   DR Expense Account (by department)
       CR AP Accrual (liability)

Estimate using:
- Open PO commitments × % received
- Service contracts × elapsed days / billing period
- Recurring vendors × prior month patterns

### 2. Prepaid amortization (T+1)
For each active prepaid contract:
   DR Expense Account (by period of benefit)
       CR Prepaid Asset

Amount = annual prepaid / # of periods (typically 12 for monthly amortization).

### 3. Fixed asset depreciation (T+1)
For each fixed asset in service:
   DR Depreciation Expense (by asset class)
       CR Accumulated Depreciation

Method:
- Straight-line (most common): (Cost − Salvage) / Useful Life
- DDB (accelerated): 2 × Straight-line rate × Net Book Value
- Match accounting policy

### 4. Payroll accrual (T+1)
If pay period straddles month-end:
   DR Salary Expense        $G_partial (gross × days_in_month / total_pay_period_days)
   DR Employer Tax Expense  $T_partial
       CR Payroll Accrual         $G+$T_partial

### 5. Revenue recognition (T+2)
Subscription/service revenue → recognize earned portion:
   DR Deferred Revenue   $X (amount earned in period)
       CR Revenue            $X

Project revenue (% completion):
   DR Unbilled Receivable / Contract Asset   $X
       CR Revenue                                $X

### 6. FX revaluation (T+2, multi-entity)
For each non-functional-currency monetary balance:
   DR (or CR) FX Gain/Loss
       CR (or DR) Asset/Liability account

Rate: month-end spot rate for monetary assets/liabilities.

## Quality bar
- **Every entry has supporting documentation** (PO list, prepaid schedule, depreciation register, payroll batch, FX rate source)
- **Materiality:** entries < tenant materiality may be aggregated by category; entries ≥ require individual detail
- **Round-number alarm:** estimates like exactly $100K or $50K → flag for source verification

## Compliance reminder
> *Standard close JEs should be automated where possible (depreciation, prepaid amortization). Manual estimates require second-preparer sign-off per SOX 404 monthly-close controls.*

Now apply the lens to the close JE prep request below.`;

export const journalEntryPrepSkill: FinanceSkill = {
  name: "prepare_close_je_batch",
  description: "Prepare the standard month-end close JE batch — accruals, prepaid amortization, depreciation, payroll, revenue rec, FX revaluation. Use when user asks 'prepare month-end JEs', 'help with the close JEs', 'what JEs do I need for April close'. Args: closePeriod, entityId, jeKinds (subset of accrual/prepaid/depreciation/payroll/revenue/fx).",
  inputSchema: {
    type: "object",
    properties: {
      closePeriod: { type: "string", description: "Period being closed, e.g. 2026-04" },
      entityId:    { type: "string", description: "Entity scope" },
      jeKinds:     { type: "string", description: "Comma-separated subset: accrual,prepaid,depreciation,payroll,revenue,fx (omit for all)" },
    },
    required: ["closePeriod", "entityId"],
  },
  skillPrompt: SKILL_PROMPT,

  async execute(args, ctx: FinanceSkillContext): Promise<FinanceSkillResult> {
    const headers = { Cookie: ctx.sessionCookie, "Content-Type": "application/json" };
    // Look up entity properties to determine if FX revaluation is relevant
    let entityInfo: any = null;
    try {
      const r = await fetch(`${ctx.baseUrl}/api/v2/members/entity?pageSize=200`, { headers });
      const j = await r.json();
      entityInfo = (j?.data?.data ?? []).find((e: any) => e.id === args.entityId);
    } catch { /* swallow */ }

    const requestedKinds = (args.jeKinds ?? "accrual,prepaid,depreciation,payroll,revenue,fx").split(",").map((s: string) => s.trim());
    const baseCcy = entityInfo?.properties?.base_currency;

    return {
      skill_guidance: SKILL_PROMPT,
      data: {
        closePeriod: args.closePeriod,
        entityId:    args.entityId,
        entityCode:  entityInfo?.memberCode,
        baseCurrency: baseCcy,
        requestedKinds,
        fxNeeded: baseCcy && baseCcy !== "USD",   // simple heuristic — refine later with tenant reporting ccy
      },
      instructions: "Apply the journal-entry-prep lens. For each requested kind, produce a templated JE with placeholders the user fills in from their supporting docs. Include estimated amount calculations where deterministic (e.g. depreciation = cost/life). Skip FX revaluation if the entity is in reporting currency. End with the compliance reminder about second-preparer sign-off.",
      meta: { skill: "journal-entry-prep", closePeriod: args.closePeriod, kindsRequested: requestedKinds.length },
    };
  },
};
