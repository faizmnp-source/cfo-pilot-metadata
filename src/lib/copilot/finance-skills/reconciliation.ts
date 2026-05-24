// Wraps the Claude finance plugin's `reconciliation` skill as a Copilot tool.
// Source: plugin_01KmRfL8EXGF3PeqMRzef1TR/skills/reconciliation/SKILL.md

import type { FinanceSkill, FinanceSkillContext, FinanceSkillResult } from "./types";

const SKILL_PROMPT = `# Account Reconciliation — General Ledger vs Subledger

You are operating under the reconciliation analytical lens. Compare account balances and identify reconciling items with proper categorization and aging.

## Reconciliation Framework

For each account being reconciled, structure the analysis as:

| Section | What to include |
|---|---|
| **Balance per GL** | Period-end balance from general ledger |
| **Balance per subledger / bank / 3rd party** | Comparison source balance |
| **Difference** | GL − Source (flag if material) |
| **Reconciling items** | Itemized list (timing, errors, missing entries) |
| **Adjusted GL balance** | GL + adjustments = should match source |
| **Open items** | Items NOT yet resolved (with aging) |

## Categorization of reconciling items

Each item gets ONE category:
- **Timing** — will clear next period (in-transit, outstanding checks, deposits-in-transit)
- **Error** — wrong amount or wrong account, needs journal entry to correct
- **Missing JE** — transaction in source but not GL (need to post)
- **Missing source** — transaction in GL but not in source (need to investigate or void)
- **FX / revaluation** — rate-driven, expected for foreign currency accounts
- **Adjustment pending** — known issue, JE planned but not posted
- **Unresolved** — investigation in progress (assign owner + ETA)

## Aging buckets (for open items)
0-30 days · 31-60 · 61-90 · 91+ (escalate)

## Materiality
Flag any RECONCILING ITEM ≥ 1% of account balance OR ≥ tenant materiality threshold (default ₹500K). Items over 90 days get auto-escalated regardless of size.

## Compliance reminder (always end with)
> *Reconciliations must be reviewed and approved by a second preparer per SOX 404 controls. Documentation should include source materials and timestamps.*

Now apply the lens to the reconciliation data below.`;

export const reconciliationSkill: FinanceSkill = {
  name: "reconcile_account",
  description: "Reconcile a GL account against subledger / bank / 3rd-party source. Categorizes reconciling items (Timing/Error/Missing/FX/Adjustment), ages open items, flags materiality. Use when user asks 'reconcile cash', 'reconcile AR', 'bank rec', or 'GL vs subledger'.",
  inputSchema: {
    type: "object",
    properties: {
      accountId:   { type: "string", description: "Account UUID to reconcile" },
      entityId:    { type: "string", description: "Entity UUID" },
      periodCode:  { type: "string", description: "Period e.g. 2026-04" },
      sourceData:  { description: "Optional: pasted subledger or bank balance + transactions, as text" },
    },
    required: ["accountId", "entityId", "periodCode"],
  },
  skillPrompt: SKILL_PROMPT,

  async execute(args, ctx: FinanceSkillContext): Promise<FinanceSkillResult> {
    const headers = { Cookie: ctx.sessionCookie, "Content-Type": "application/json" };
    // Pull GL balance + recent transactions for the account/entity/period
    const params = new URLSearchParams({ accountId: args.accountId, entityId: args.entityId });
    const r = await fetch(`${ctx.baseUrl}/api/v2/facts?${params}&pageSize=200`, { headers });
    const j = await r.json();
    const rows = (j?.data?.data ?? j?.data ?? []).filter((f: any) => {
      return f.time?.memberCode === args.periodCode || f.timeCode === args.periodCode;
    });
    const glBalance = rows.reduce((s: number, f: any) => s + Number(f.value ?? f.valueReporting ?? 0), 0);

    return {
      skill_guidance: SKILL_PROMPT,
      data: {
        accountId: args.accountId,
        entityId: args.entityId,
        periodCode: args.periodCode,
        glBalance,
        glTransactionCount: rows.length,
        sampleTransactions: rows.slice(0, 10).map((f: any) => ({
          account: f.account?.memberCode, entity: f.entity?.memberCode, value: f.value ?? f.valueReporting,
          origin: f.origin?.memberCode, period: f.time?.memberCode,
        })),
        sourceData: args.sourceData ?? null,
      },
      instructions: args.sourceData
        ? "Apply the reconciliation lens. Compare GL balance to source data provided. Itemize reconciling items by category. Age open items. Flag materiality. End with compliance reminder."
        : "Show the GL balance + transactions. Tell user no source data was provided. Ask them to paste bank statement / subledger balance / 3rd-party balance so reconciliation can complete.",
      meta: {
        skill: "reconciliation",
        glBalance, glRowCount: rows.length, hasSource: !!args.sourceData,
      },
    };
  },
};
