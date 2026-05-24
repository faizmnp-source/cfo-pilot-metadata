// Wraps the Claude finance plugin's `audit-support` skill as a Copilot tool.
// Source: plugin_01KmRfL8EXGF3PeqMRzef1TR/skills/audit-support/SKILL.md

import type { FinanceSkill, FinanceSkillContext, FinanceSkillResult } from "./types";

const SKILL_PROMPT = `# Audit Support — SOX 404 Workpapers & Control Testing

You are operating under the audit-support lens. Help the finance team prepare for internal/external audit with proper workpapers, sample selection, and control documentation.

## Workpaper template (per control)

| Section | What to include |
|---|---|
| **Control ID + description** | Unique ID (e.g. CTL-AP-001), what the control does |
| **Control owner** | Process owner who executes the control |
| **Frequency** | Daily / weekly / monthly / quarterly / per-transaction |
| **Type** | Preventive vs detective; manual vs automated |
| **Risk addressed** | What could go wrong if this control fails |
| **Population size** | Total # of transactions in test period |
| **Sample size** | Per sample selection table below |
| **Sample selection method** | Random / judgmental / 100% |
| **Test procedures** | Step-by-step what tester does |
| **Test results** | Pass / fail per sample |
| **Conclusion** | Effective / deficient (severity) |
| **Evidence retained** | Files, screenshots, signed approvals |

## Sample selection (AICPA-aligned)

| Population | Sample Size | Notes |
|---|---|---|
| 1-25     | 100% (test all) | No sampling needed |
| 26-250   | 25 items | Random selection |
| 251-1000 | 40 items | Random + stratification by amount |
| 1001-2500| 60 items | Random |
| 2501+    | 90 items | Consider IT-driven test of full population |

For automated controls: sample size = 1-3 (test the IT general control once, not per-transaction).

## Control deficiency severity

| Severity | Definition | Reporting |
|---|---|---|
| **Deficiency** | A control deficiency exists | Internal only |
| **Significant Deficiency** | Less severe than material weakness but important enough to merit attention | Report to audit committee |
| **Material Weakness** | Reasonable possibility of material misstatement | Report to SEC, auditor, board |

## Common SOX control areas (R-O-T-C model)

- **Revenue** (R) — billing, collection, ASC 606 5-step compliance
- **Order-to-cash** (O) — credit approval, shipping, invoicing
- **Treasury** (T) — bank rec, cash management, FX, debt covenants
- **Close** (C) — JE review, period locks, consolidation, eliminations

## Compliance reminder
> *Audit workpapers must be retained per SOX (7 years for public companies, varies by jurisdiction otherwise). Second-preparer review required for material control test results.*

Now apply the lens to the audit support request below.`;

export const auditSupportSkill: FinanceSkill = {
  name: "prepare_audit_workpaper",
  description: "Prepare SOX/audit workpapers: control description, sample selection, test procedures, evidence checklist. Use when user asks 'prepare for audit', 'control testing', 'sample size for revenue testing', 'workpaper template'. Args: controlId, controlArea (Revenue/AP/Treasury/Close), populationSize, testPeriod.",
  inputSchema: {
    type: "object",
    properties: {
      controlId:      { type: "string", description: "Control ID e.g. CTL-AP-001" },
      controlArea:    { type: "string", description: "Revenue / AP / Payroll / Treasury / Close / ITGC" },
      populationSize: { type: "number", description: "Total transactions in test period" },
      testPeriod:     { type: "string", description: "e.g. Q1 2026, FY2026" },
      controlType:    { type: "string", description: "Optional: preventive/detective + manual/automated" },
    },
    required: ["controlId", "controlArea", "populationSize"],
  },
  skillPrompt: SKILL_PROMPT,

  async execute(args, ctx: FinanceSkillContext): Promise<FinanceSkillResult> {
    // Determine sample size per AICPA table
    const n = args.populationSize;
    let sampleSize: number;
    let method: string;
    if (n <= 25) { sampleSize = n; method = "100% (test all)"; }
    else if (n <= 250)  { sampleSize = 25; method = "random"; }
    else if (n <= 1000) { sampleSize = 40; method = "random with amount stratification"; }
    else if (n <= 2500) { sampleSize = 60; method = "random"; }
    else                { sampleSize = 90; method = "random — consider IT-driven full population test"; }

    return {
      skill_guidance: SKILL_PROMPT,
      data: {
        controlId: args.controlId,
        controlArea: args.controlArea,
        populationSize: n,
        sampleSize, samplingMethod: method,
        testPeriod: args.testPeriod ?? "current period",
        controlType: args.controlType ?? "manual / detective",
      },
      instructions: "Apply the audit-support lens. Produce a complete workpaper template for this control: control description, sample selection rationale, test procedures step-by-step, evidence checklist, and a draft conclusion structure. End with the compliance reminder about workpaper retention.",
      meta: { skill: "audit-support", controlArea: args.controlArea, populationSize: n, sampleSize },
    };
  },
};
