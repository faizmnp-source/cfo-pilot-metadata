// Wraps the Claude finance plugin's `journal-entry` skill as a Copilot tool.
// Source: plugin_01KmRfL8EXGF3PeqMRzef1TR/skills/journal-entry/SKILL.md

import type { FinanceSkill, FinanceSkillContext, FinanceSkillResult } from "./types";

const SKILL_PROMPT = `# Journal Entry — Preparation & Validation

You are operating under the journal-entry lens. Prepare a structured JE with proper debits, credits, supporting detail, and audit narrative.

## JE structure (every entry MUST have)

| Field | Required | Notes |
|---|---|---|
| Date | yes | Period-end date for accruals; transaction date for cash |
| Account (debit) | yes | Must net to zero with credits |
| Account (credit) | yes | Must net to zero with debits |
| Amount | yes | $ amount (positive for debit, positive for credit) |
| Reference / source doc | yes | Invoice #, bank txn ID, payroll batch, etc |
| Description | yes | Plain English business reason — NOT just "monthly entry" |
| Preparer | yes | Initials of preparer |
| Reviewer | yes (for >$threshold) | Second-preparer for material entries |

## Common JE types & templates

**Accrual** (expense incurred not yet invoiced)
   DR Expense Account   $X
       CR AP Accrual          $X

**Prepaid amortization** (monthly portion of annual contract)
   DR Expense Account   $X (= annual / 12)
       CR Prepaid Asset       $X

**Depreciation** (fixed asset wear)
   DR Depreciation Expense   $X (= cost / useful life)
       CR Accumulated Depreciation $X

**Revenue recognition** (deferred revenue → recognized)
   DR Deferred Revenue   $X
       CR Revenue            $X

**Payroll** (gross pay + employer taxes + benefits)
   DR Salary Expense        $G (gross)
   DR Employer Tax Expense  $T
   DR Benefits Expense      $B
       CR Cash                  $N (net pay)
       CR Payroll Tax Liability $T+$X (employee + employer)
       CR Benefits Liability    $B

## Validation checks (run on every JE)
1. **Balance check:** Σ(debits) = Σ(credits) — abort if mismatch
2. **Account validity:** Both DR and CR accounts are active in COA
3. **Period open:** Period not yet locked (closed entries blocked)
4. **Description quality:** ≥ 10 chars, not just "month-end entry" or "adjustment"
5. **Materiality:** Entries ≥ tenant materiality flagged for review
6. **Round numbers warning:** Very round amounts ($100K exact) sometimes indicate estimation — flag for backup

## Compliance reminder
> *All material JEs require second-preparer review per SOX 404. Supporting documentation must be attached and retained per audit policy.*

Now apply the lens to the journal entry request below.`;

export const journalEntrySkill: FinanceSkill = {
  name: "prepare_journal_entry",
  description: "Prepare a structured journal entry (DR/CR, narrative, validation). Use when user asks 'book accrual', 'record depreciation', 'prepare JE', 'post deferred revenue', 'payroll entry', etc. Args: kind (accrual/prepaid/depreciation/revenue/payroll/other), entityId, periodCode, amount, description.",
  inputSchema: {
    type: "object",
    properties: {
      kind:        { type: "string", description: "accrual | prepaid | depreciation | revenue | payroll | other" },
      entityId:    { type: "string" },
      periodCode:  { type: "string", description: "e.g. 2026-04" },
      amount:      { type: "number", description: "Dollar amount (positive)" },
      description: { type: "string", description: "Business reason" },
      debitAccountCode:  { type: "string", description: "Optional explicit DR account code" },
      creditAccountCode: { type: "string", description: "Optional explicit CR account code" },
    },
    required: ["kind", "entityId", "periodCode", "amount"],
  },
  skillPrompt: SKILL_PROMPT,

  async execute(args, ctx: FinanceSkillContext): Promise<FinanceSkillResult> {
    // We don't write JEs in v1 — just return the structured spec for user review.
    // Future: optional commit-to-facts flow with second-preparer approval.
    return {
      skill_guidance: SKILL_PROMPT,
      data: {
        kind: args.kind,
        entity: args.entityId,
        period: args.periodCode,
        amount: args.amount,
        description: args.description ?? null,
        debitAccountCode: args.debitAccountCode ?? null,
        creditAccountCode: args.creditAccountCode ?? null,
      },
      instructions: "Apply the journal-entry lens. Produce a structured JE: DR/CR lines, narrative, references, validation checklist. If accounts not provided, suggest likely accounts based on kind. Flag if amount is suspiciously round, missing description, or needs review. Do NOT write to the ledger — this is preparation only.",
      meta: { skill: "journal-entry", kind: args.kind, period: args.periodCode },
    };
  },
};
