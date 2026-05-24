// Wraps the Claude finance plugin's `sox-testing` skill as a Copilot tool.
// Source: plugin_01KmRfL8EXGF3PeqMRzef1TR/skills/sox-testing/SKILL.md

import type { FinanceSkill, FinanceSkillContext, FinanceSkillResult } from "./types";

const SKILL_PROMPT = `# SOX 404 Testing — Sample Selection, Workpaper, Deficiency Classification

You are operating under the SOX-testing lens. Build a defensible test plan for a SOX-relevant control.

## Test plan structure

1. **Risk statement** — what could go wrong (RCM-linked)
2. **Control objective** — what the control should achieve
3. **Test of design (TOD)** — walkthrough: is the control DESIGNED to work?
4. **Test of operating effectiveness (TOE)** — sample testing: does it actually work?
5. **Conclusion** — pass / fail with severity rating

## Sample selection — AICPA AU-C 530 + PCAOB AS 2315

### Manual control sample sizes (most common case)

| Frequency | Annual freq | Sample size |
|---|---|---|
| Annual | 1 | 1 |
| Quarterly | 4 | 2 |
| Monthly | 12 | 2-5 |
| Weekly | 52 | 5-10 |
| Daily | 250 | 25-40 |
| Multiple/day | 1000+ | 40-60 |

### Automated control sample sizes
- Test the IT general control (ITGC) once per assessment period
- If ITGC effective → test the automated control with sample size of **1** (one operation)
- If ITGC ineffective → must test the automated control as if manual

### Sample SELECTION methodology
- **Random** (preferred): use random number generator, document seed/method
- **Stratified**: split by amount tier when materiality varies
- **Judgmental**: only when random not feasible, document basis
- **Block**: rarely defensible

## Deficiency classification

| Severity | Likelihood × Magnitude | Action |
|---|---|---|
| Inconsequential | Low + Low | Track in deficiency log only |
| Deficiency | Some chance of error, immaterial | Remediate, retest |
| Significant Deficiency | Reasonable possibility of more-than-immaterial misstatement | Report to audit committee |
| Material Weakness | Reasonable possibility of material misstatement | Report to SEC + external auditor |

## Compensating controls

If a primary control is deficient, document COMPENSATING controls:
- They must cover the same risk
- They must be tested independently
- They must be in place during the relevant period

## Compliance reminder
> *SOX testing must be performed by independent personnel (not the control owner). All test results require workpaper documentation retained for ≥7 years (public companies).*

Now apply the lens to the SOX testing request below.`;

export const soxTestingSkill: FinanceSkill = {
  name: "plan_sox_test",
  description: "Plan SOX 404 control testing: TOD + TOE structure, sample size per frequency, sampling methodology, deficiency classification framework. Use when user asks 'plan SOX testing', 'sample size for monthly control', 'classify this deficiency', 'test plan for revenue controls'. Args: controlId, frequency (daily/weekly/monthly/quarterly/annual), controlNature (manual/automated).",
  inputSchema: {
    type: "object",
    properties: {
      controlId:      { type: "string" },
      frequency:      { type: "string", description: "daily | weekly | monthly | quarterly | annual | multiple_per_day" },
      controlNature:  { type: "string", description: "manual | automated" },
      itgcEffective:  { type: "boolean", description: "If automated: is the relevant ITGC effective? (default true)" },
      riskStatement:  { type: "string", description: "Optional: what could go wrong" },
    },
    required: ["controlId", "frequency"],
  },
  skillPrompt: SKILL_PROMPT,

  async execute(args, ctx: FinanceSkillContext): Promise<FinanceSkillResult> {
    const FREQ_MAP: Record<string, number> = {
      annual: 1, quarterly: 2, monthly: 3, weekly: 8, daily: 30, multiple_per_day: 50,
    };
    const nature = (args.controlNature ?? "manual").toLowerCase();
    let sampleSize: number;
    if (nature === "automated") {
      sampleSize = (args.itgcEffective ?? true) ? 1 : (FREQ_MAP[args.frequency] ?? 25);
    } else {
      sampleSize = FREQ_MAP[args.frequency] ?? 25;
    }

    return {
      skill_guidance: SKILL_PROMPT,
      data: {
        controlId: args.controlId,
        frequency: args.frequency,
        controlNature: nature,
        sampleSize,
        itgcEffective: args.itgcEffective ?? true,
        riskStatement: args.riskStatement ?? null,
        suggestedSamplingMethod: sampleSize >= 25 ? "random with seed documented" : "judgmental (small population)",
      },
      instructions: "Apply the SOX-testing lens. Produce a complete test plan: risk statement → control objective → TOD walkthrough steps → TOE sample test procedures → deficiency classification rubric. End with the compliance reminder.",
      meta: { skill: "sox-testing", frequency: args.frequency, sampleSize, controlNature: nature },
    };
  },
};
