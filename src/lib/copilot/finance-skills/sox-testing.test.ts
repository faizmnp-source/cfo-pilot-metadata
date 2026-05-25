// Unit tests for soxTestingSkill.execute().
//
// soxTestingSkill is the NINTH-shipped finance-skill test slot and
// THE LAST of the 8 finance skills to receive at-least-baseline
// execute() pins. Like auditSupportSkill (the prior slot) it is PURE:
// no fetch, no prisma, no IO. The body is a small deterministic
// lookup over FREQ_MAP + a branch on controlNature ('automated' vs
// 'manual') + an itgcEffective override, plus a ternary for
// suggestedSamplingMethod.
//
// The load-bearing logic the skill encodes is the AICPA AU-C 530 /
// PCAOB AS 2315 manual-control sample-size table, condensed to one
// representative per frequency tier:
//
//     annual            → 1
//     quarterly         → 2
//     monthly           → 3
//     weekly            → 8
//     daily             → 30
//     multiple_per_day  → 50
//     <anything else>   → 25  (default; treated as "random" tier)
//
// Plus the automated-control rule: if the relevant ITGC is effective
// (the default), an automated control can be tested with a sample of
// exactly 1. If the ITGC is NOT effective, the automated control
// reverts to manual-control sample sizes.
//
// suggestedSamplingMethod is a ternary on sampleSize:
//     sampleSize >= 25 → "random with seed documented"
//     sampleSize <  25 → "judgmental (small population)"
//
// What this file pins:
//   1. Static surface (name, description, inputSchema, skillPrompt)
//   2. execute() returns FinanceSkillResult shape with all four required keys
//   3. FREQ_MAP for all 6 documented frequencies — drift by ±1 silently
//      changes audit sample sizes (regulator-facing risk)
//   4. Default fallback for unknown frequency → 25
//   5. Manual vs automated branching, including itgcEffective override
//   6. controlNature normalisation (case-insensitive via .toLowerCase())
//   7. ?? semantics on controlNature ('' preserved? actually — empty
//      string is FALSY for toLowerCase but truthy for ??; current
//      behaviour: '' coerces via toLowerCase() to '' then falls through
//      the === "automated" check to the manual branch — pinned)
//   8. itgcEffective ?? true default behaviour
//   9. suggestedSamplingMethod ternary at the 25 boundary
//  10. meta enrichment: { skill: "sox-testing", frequency, sampleSize, controlNature }
//  11. Skill is PURE — no fetch, idempotent, context-independent
//  12. SKILL_PROMPT load-bearing content: AICPA AU-C 530 + PCAOB AS 2315,
//      frequency-vs-sample-size table, automated-control rules,
//      deficiency classification (deficiency / significant deficiency /
//      material weakness), 7-year retention reminder, compensating
//      controls section, TOD vs TOE distinction
//
// Pairs with src/lib/copilot/finance-skills/index.test.ts (registry-
// level pins) and the other 7 execute() tests. After this slot lands,
// ALL 8 finance skills have at-least-baseline execute() pins. Phase
// 3.6 is closed.

import { soxTestingSkill } from "./sox-testing";
import type { FinanceSkillContext } from "./types";

// --- shared fixture ---
const ctx: FinanceSkillContext = {
  tenantId: "tnt_test",
  sessionCookie: "session=abc123",
  baseUrl: "http://localhost:3000",
};

const baseArgs = {
  controlId: "CTL-REV-001",
  frequency: "monthly",
  controlNature: "manual",
  itgcEffective: true,
  riskStatement: "Revenue may be recognised prior to delivery",
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

// =========================================================================
// Static surface
// =========================================================================

describe("soxTestingSkill — static surface", () => {
  test("name is exactly 'plan_sox_test'", () => {
    expect(soxTestingSkill.name).toBe("plan_sox_test");
  });

  test("description is a non-empty string ≥ 50 chars", () => {
    expect(typeof soxTestingSkill.description).toBe("string");
    expect(soxTestingSkill.description.length).toBeGreaterThanOrEqual(50);
  });

  test("description mentions SOX / 404 / control verbs", () => {
    // These keywords are what the route's natural-language router keys
    // off. If marketing-style rewording happens, the router's match
    // score drops and the skill never fires.
    const desc = soxTestingSkill.description;
    expect(desc).toMatch(/SOX/);
    expect(desc.toLowerCase()).toMatch(/control|testing|sample/);
  });

  test("description carries canonical routing examples", () => {
    // Pin the example phrasings the route uses to disambiguate this
    // skill from audit-support / reconciliation.
    const desc = soxTestingSkill.description.toLowerCase();
    expect(desc).toMatch(/plan sox testing|sample size|deficiency|test plan/);
  });

  test("description carries the args contract hint (frequency + controlNature)", () => {
    const desc = soxTestingSkill.description.toLowerCase();
    expect(desc).toMatch(/frequency/);
    expect(desc).toMatch(/controlnature/);
  });

  test("inputSchema is JSON Schema object with required & properties", () => {
    expect(soxTestingSkill.inputSchema.type).toBe("object");
    expect(isPlainObject(soxTestingSkill.inputSchema.properties)).toBe(true);
    expect(Array.isArray(soxTestingSkill.inputSchema.required)).toBe(true);
  });

  test("required[] is exactly ['controlId','frequency']", () => {
    // Pin order — model sees the prompt deterministically.
    expect(soxTestingSkill.inputSchema.required).toEqual([
      "controlId",
      "frequency",
    ]);
  });

  test("inputSchema declares all required fields in properties", () => {
    const props = soxTestingSkill.inputSchema.properties;
    for (const r of soxTestingSkill.inputSchema.required) {
      expect(props[r]).toBeDefined();
      expect(typeof props[r].type).toBe("string");
    }
  });

  test("inputSchema declares the optional fields (controlNature, itgcEffective, riskStatement)", () => {
    const props = soxTestingSkill.inputSchema.properties;
    expect(props.controlNature).toBeDefined();
    expect(props.controlNature.type).toBe("string");
    expect(props.itgcEffective).toBeDefined();
    expect(props.itgcEffective.type).toBe("boolean");
    expect(props.riskStatement).toBeDefined();
    expect(props.riskStatement.type).toBe("string");
  });

  test("frequency description enumerates all 6 supported frequencies", () => {
    // Pinned as a description hint (not a JSON-Schema enum) so Claude
    // sees the routing options without rejecting free-text inputs.
    const desc = (
      soxTestingSkill.inputSchema.properties.frequency.description ?? ""
    ).toLowerCase();
    for (const freq of [
      "daily",
      "weekly",
      "monthly",
      "quarterly",
      "annual",
      "multiple_per_day",
    ]) {
      expect(desc).toContain(freq);
    }
  });

  test("controlNature description mentions manual + automated", () => {
    const desc = (
      soxTestingSkill.inputSchema.properties.controlNature.description ?? ""
    ).toLowerCase();
    expect(desc).toMatch(/manual/);
    expect(desc).toMatch(/automated/);
  });

  test("itgcEffective description mentions the default true semantic", () => {
    const desc = (
      soxTestingSkill.inputSchema.properties.itgcEffective.description ?? ""
    ).toLowerCase();
    expect(desc).toMatch(/itgc/);
    expect(desc).toMatch(/effective/);
    expect(desc).toMatch(/default true|automated/);
  });

  test("riskStatement is described as optional context", () => {
    const desc = (
      soxTestingSkill.inputSchema.properties.riskStatement.description ?? ""
    ).toLowerCase();
    expect(desc).toMatch(/optional|what could go wrong|risk/);
  });

  test("skillPrompt is a non-empty string opening with a markdown heading", () => {
    expect(typeof soxTestingSkill.skillPrompt).toBe("string");
    expect(soxTestingSkill.skillPrompt.length).toBeGreaterThan(200);
    expect(soxTestingSkill.skillPrompt.startsWith("#")).toBe(true);
  });

  test("skillPrompt covers AICPA AU-C 530 + PCAOB AS 2315 citations", () => {
    // These are the regulator-facing citations the prompt is built on.
    // Drift here would be a regulatory drift, not a stylistic one.
    const sp = soxTestingSkill.skillPrompt;
    expect(sp).toMatch(/AICPA/);
    expect(sp).toMatch(/AU-C 530/);
    expect(sp).toMatch(/PCAOB/);
    expect(sp).toMatch(/AS 2315/);
  });

  test("skillPrompt covers the test-plan structure (TOD + TOE + conclusion)", () => {
    const sp = soxTestingSkill.skillPrompt;
    expect(sp).toMatch(/risk statement/i);
    expect(sp).toMatch(/control objective/i);
    expect(sp).toMatch(/test of design|TOD/i);
    expect(sp).toMatch(/test of operating effectiveness|TOE/i);
    expect(sp).toMatch(/conclusion/i);
  });

  test("skillPrompt covers the manual-control sample-size table by frequency", () => {
    const sp = soxTestingSkill.skillPrompt;
    // Frequency labels in the table
    expect(sp).toMatch(/annual/i);
    expect(sp).toMatch(/quarterly/i);
    expect(sp).toMatch(/monthly/i);
    expect(sp).toMatch(/weekly/i);
    expect(sp).toMatch(/daily/i);
    expect(sp).toMatch(/multiple\/day|multiple per day/i);
  });

  test("skillPrompt covers automated control sample-size rules (ITGC)", () => {
    const sp = soxTestingSkill.skillPrompt;
    expect(sp).toMatch(/automated control/i);
    expect(sp).toMatch(/ITGC/);
    expect(sp).toMatch(/itgc effective/i);
  });

  test("skillPrompt covers sample SELECTION methodology", () => {
    const sp = soxTestingSkill.skillPrompt;
    expect(sp).toMatch(/random/i);
    expect(sp).toMatch(/stratified/i);
    expect(sp).toMatch(/judgmental/i);
    expect(sp).toMatch(/block/i);
  });

  test("skillPrompt covers deficiency severity tiers", () => {
    const sp = soxTestingSkill.skillPrompt;
    expect(sp).toMatch(/deficiency/i);
    expect(sp).toMatch(/significant deficiency/i);
    expect(sp).toMatch(/material weakness/i);
    expect(sp).toMatch(/inconsequential/i);
  });

  test("skillPrompt covers compensating controls", () => {
    const sp = soxTestingSkill.skillPrompt;
    expect(sp).toMatch(/compensating controls?/i);
  });

  test("skillPrompt includes ≥7-year SOX retention reminder", () => {
    // This is the regulator-facing compliance line — it must NEVER be
    // dropped or rephrased into something soft like "keep around".
    const sp = soxTestingSkill.skillPrompt;
    expect(sp).toMatch(/7 years/i);
    expect(sp.toLowerCase()).toMatch(/retain|workpaper documentation/);
    expect(sp.toLowerCase()).toMatch(/public companies|sox/);
  });

  test("skillPrompt enforces independence (tester ≠ control owner)", () => {
    const sp = soxTestingSkill.skillPrompt;
    expect(sp).toMatch(/independent personnel|not the control owner/i);
  });

  test("execute is an async function with arity 2 (args, ctx)", () => {
    expect(typeof soxTestingSkill.execute).toBe("function");
    expect(soxTestingSkill.execute.length).toBe(2);
  });
});

// =========================================================================
// execute() — result shape
// =========================================================================

describe("soxTestingSkill.execute — result shape", () => {
  test("returns a Promise (then-able)", () => {
    const ret = soxTestingSkill.execute(baseArgs, ctx);
    expect(typeof (ret as Promise<unknown>).then).toBe("function");
  });

  test("resolved value is a plain object", async () => {
    const r = await soxTestingSkill.execute(baseArgs, ctx);
    expect(isPlainObject(r)).toBe(true);
  });

  test("has the four FinanceSkillResult keys", async () => {
    const r = await soxTestingSkill.execute(baseArgs, ctx);
    expect(Object.keys(r).sort()).toEqual(
      ["data", "instructions", "meta", "skill_guidance"].sort()
    );
  });

  test("skill_guidance === skill.skillPrompt (no drift)", async () => {
    const r = await soxTestingSkill.execute(baseArgs, ctx);
    expect(r.skill_guidance).toBe(soxTestingSkill.skillPrompt);
  });

  test("instructions is a non-empty string ≥ 50 chars", async () => {
    const r = await soxTestingSkill.execute(baseArgs, ctx);
    expect(typeof r.instructions).toBe("string");
    expect(r.instructions.length).toBeGreaterThanOrEqual(50);
  });

  test("instructions mention the SOX-testing lens + complete test plan deliverable", async () => {
    const r = await soxTestingSkill.execute(baseArgs, ctx);
    expect(r.instructions).toMatch(/SOX-testing lens|sox testing/i);
    expect(r.instructions).toMatch(/test plan/i);
    expect(r.instructions).toMatch(/risk statement/i);
    expect(r.instructions).toMatch(/control objective/i);
  });

  test("instructions name TOD walkthrough + TOE sample test", async () => {
    const r = await soxTestingSkill.execute(baseArgs, ctx);
    expect(r.instructions).toMatch(/TOD walkthrough|test of design walkthrough/i);
    expect(r.instructions).toMatch(/TOE sample|test of operating effectiveness/i);
  });

  test("instructions end with the compliance/retention reminder hook", async () => {
    // Pin that the instructions explicitly ask Claude to close with
    // the compliance reminder. Trip-wire on prompt drift.
    const r = await soxTestingSkill.execute(baseArgs, ctx);
    expect(r.instructions).toMatch(/compliance reminder|retention/i);
  });

  test("instructions mention deficiency classification rubric", async () => {
    const r = await soxTestingSkill.execute(baseArgs, ctx);
    expect(r.instructions).toMatch(/deficiency classification|deficiency rubric/i);
  });

  test("data is a plain object with the seven expected keys", async () => {
    const r = await soxTestingSkill.execute(baseArgs, ctx);
    expect(isPlainObject(r.data)).toBe(true);
    expect(Object.keys(r.data).sort()).toEqual(
      [
        "controlId",
        "frequency",
        "controlNature",
        "sampleSize",
        "itgcEffective",
        "riskStatement",
        "suggestedSamplingMethod",
      ].sort()
    );
  });
});

// =========================================================================
// FREQ_MAP table — manual control sample sizes
//
// This is the load-bearing logic of the skill. We pin every frequency
// the AICPA-aligned table walks through:
//
//   annual           → 1
//   quarterly        → 2
//   monthly          → 3
//   weekly           → 8
//   daily            → 30
//   multiple_per_day → 50
//   <unknown>        → 25
//
// Drift on any value silently changes audit sample sizes — regulator-
// facing risk, not just QA niceness.
// =========================================================================

describe("soxTestingSkill.execute — FREQ_MAP (manual control)", () => {
  async function run(frequency: string) {
    return soxTestingSkill.execute(
      { ...baseArgs, frequency, controlNature: "manual" },
      ctx
    );
  }

  test("frequency='annual' → sampleSize=1", async () => {
    const r = await run("annual");
    expect(r.data.sampleSize).toBe(1);
  });

  test("frequency='quarterly' → sampleSize=2", async () => {
    const r = await run("quarterly");
    expect(r.data.sampleSize).toBe(2);
  });

  test("frequency='monthly' → sampleSize=3", async () => {
    const r = await run("monthly");
    expect(r.data.sampleSize).toBe(3);
  });

  test("frequency='weekly' → sampleSize=8", async () => {
    const r = await run("weekly");
    expect(r.data.sampleSize).toBe(8);
  });

  test("frequency='daily' → sampleSize=30", async () => {
    const r = await run("daily");
    expect(r.data.sampleSize).toBe(30);
  });

  test("frequency='multiple_per_day' → sampleSize=50", async () => {
    const r = await run("multiple_per_day");
    expect(r.data.sampleSize).toBe(50);
  });

  // --- Unknown / default fallback ---

  test("frequency='hourly' (unknown) → sampleSize=25 (default fallback)", async () => {
    const r = await run("hourly");
    expect(r.data.sampleSize).toBe(25);
  });

  test("frequency='' (empty string, unknown key) → sampleSize=25", async () => {
    const r = await run("");
    expect(r.data.sampleSize).toBe(25);
  });

  test("frequency=' monthly ' (whitespace, unknown after no-trim) → sampleSize=25", async () => {
    // The skill does NOT trim the frequency. Pinned to force a future
    // trim to be intentional, not silent.
    const r = await run(" monthly ");
    expect(r.data.sampleSize).toBe(25);
  });

  test("frequency='MONTHLY' (case mismatch) → sampleSize=25 (NOT normalised)", async () => {
    // The skill does NOT lower-case the frequency before lookup.
    // Pinned to force a future normalisation to be intentional.
    const r = await run("MONTHLY");
    expect(r.data.sampleSize).toBe(25);
  });

  test("frequency='bi-weekly' (not in map) → sampleSize=25", async () => {
    const r = await run("bi-weekly");
    expect(r.data.sampleSize).toBe(25);
  });
});

// =========================================================================
// Automated control branch + ITGC override
//
// Rules:
//   automated + itgcEffective=true  → sampleSize=1
//   automated + itgcEffective=false → sampleSize=FREQ_MAP[freq] ?? 25
//   automated + itgcEffective omitted → defaults to true → sampleSize=1
// =========================================================================

describe("soxTestingSkill.execute — automated control + ITGC override", () => {
  test("automated + itgcEffective=true → sampleSize=1", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, controlNature: "automated", itgcEffective: true },
      ctx
    );
    expect(r.data.sampleSize).toBe(1);
  });

  test("automated + itgcEffective omitted → defaults to true → sampleSize=1", async () => {
    const { itgcEffective: _omit, ...args } = baseArgs;
    const r = await soxTestingSkill.execute(
      { ...args, controlNature: "automated" },
      ctx
    );
    expect(r.data.sampleSize).toBe(1);
  });

  test("automated + itgcEffective=undefined → defaults to true → sampleSize=1", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, controlNature: "automated", itgcEffective: undefined },
      ctx
    );
    expect(r.data.sampleSize).toBe(1);
  });

  test("automated + itgcEffective=null → ?? default true → sampleSize=1", async () => {
    // null nullishes via ??, so the default `true` kicks in.
    const r = await soxTestingSkill.execute(
      { ...baseArgs, controlNature: "automated", itgcEffective: null },
      ctx
    );
    expect(r.data.sampleSize).toBe(1);
  });

  test("automated + itgcEffective=false + monthly → sampleSize=3 (falls back to FREQ_MAP)", async () => {
    const r = await soxTestingSkill.execute(
      {
        ...baseArgs,
        controlNature: "automated",
        itgcEffective: false,
        frequency: "monthly",
      },
      ctx
    );
    expect(r.data.sampleSize).toBe(3);
  });

  test("automated + itgcEffective=false + annual → sampleSize=1 (FREQ_MAP)", async () => {
    const r = await soxTestingSkill.execute(
      {
        ...baseArgs,
        controlNature: "automated",
        itgcEffective: false,
        frequency: "annual",
      },
      ctx
    );
    expect(r.data.sampleSize).toBe(1);
  });

  test("automated + itgcEffective=false + daily → sampleSize=30 (FREQ_MAP)", async () => {
    const r = await soxTestingSkill.execute(
      {
        ...baseArgs,
        controlNature: "automated",
        itgcEffective: false,
        frequency: "daily",
      },
      ctx
    );
    expect(r.data.sampleSize).toBe(30);
  });

  test("automated + itgcEffective=false + unknown freq → sampleSize=25 (default)", async () => {
    const r = await soxTestingSkill.execute(
      {
        ...baseArgs,
        controlNature: "automated",
        itgcEffective: false,
        frequency: "biweekly",
      },
      ctx
    );
    expect(r.data.sampleSize).toBe(25);
  });

  test("automated control branch fires on lower-case 'automated'", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, controlNature: "automated", itgcEffective: true },
      ctx
    );
    expect(r.data.sampleSize).toBe(1);
  });

  test("automated branch fires on 'AUTOMATED' via toLowerCase normalisation", async () => {
    // The skill calls .toLowerCase() on controlNature. Pin that branch.
    const r = await soxTestingSkill.execute(
      { ...baseArgs, controlNature: "AUTOMATED", itgcEffective: true },
      ctx
    );
    expect(r.data.sampleSize).toBe(1);
  });

  test("automated branch fires on 'Automated' (mixed case)", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, controlNature: "Automated", itgcEffective: true },
      ctx
    );
    expect(r.data.sampleSize).toBe(1);
  });

  test("'manual' + frequency=monthly → sampleSize=3 (NOT 1)", async () => {
    // Confirm the manual branch ignores itgcEffective.
    const r = await soxTestingSkill.execute(
      {
        ...baseArgs,
        controlNature: "manual",
        itgcEffective: true,
        frequency: "monthly",
      },
      ctx
    );
    expect(r.data.sampleSize).toBe(3);
  });

  test("'manual' branch DISREGARDS itgcEffective entirely", async () => {
    // Whether ITGC effective or not, manual frequency drives sample.
    const a = await soxTestingSkill.execute(
      {
        ...baseArgs,
        controlNature: "manual",
        itgcEffective: true,
        frequency: "weekly",
      },
      ctx
    );
    const b = await soxTestingSkill.execute(
      {
        ...baseArgs,
        controlNature: "manual",
        itgcEffective: false,
        frequency: "weekly",
      },
      ctx
    );
    expect(a.data.sampleSize).toBe(8);
    expect(b.data.sampleSize).toBe(8);
  });
});

// =========================================================================
// controlNature ?? "manual" default + normalisation
//
// nature = (args.controlNature ?? "manual").toLowerCase()
//
// ?? only nullishes on null/undefined. Empty string '' is preserved
// and lower-cased to '' — which is NOT === "automated", so it falls
// through to the manual branch. Pinned both sides.
// =========================================================================

describe("soxTestingSkill.execute — controlNature default + normalisation", () => {
  test("controlNature omitted → 'manual' (default branch)", async () => {
    const { controlNature: _omit, ...args } = baseArgs;
    const r = await soxTestingSkill.execute(args, ctx);
    expect(r.data.controlNature).toBe("manual");
    // monthly + manual = 3, confirms manual branch fired
    expect(r.data.sampleSize).toBe(3);
  });

  test("controlNature === undefined → 'manual'", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, controlNature: undefined },
      ctx
    );
    expect(r.data.controlNature).toBe("manual");
  });

  test("controlNature === null → 'manual' (?? coerces null)", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, controlNature: null },
      ctx
    );
    expect(r.data.controlNature).toBe("manual");
  });

  test("controlNature === '' (empty string) is PRESERVED then lower-cased to ''", async () => {
    // ?? does NOT nullish '' — empty string flows through, toLowerCase()
    // yields '', and '' !== 'automated' so manual branch fires. Pinned
    // so a future ?? → || rewrite is caught.
    const r = await soxTestingSkill.execute(
      { ...baseArgs, controlNature: "" },
      ctx
    );
    expect(r.data.controlNature).toBe("");
    // monthly + (effectively manual) = 3
    expect(r.data.sampleSize).toBe(3);
  });

  test("controlNature='MANUAL' → lower-cased to 'manual'", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, controlNature: "MANUAL" },
      ctx
    );
    expect(r.data.controlNature).toBe("manual");
  });

  test("controlNature='Manual' (mixed case) → lower-cased to 'manual'", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, controlNature: "Manual" },
      ctx
    );
    expect(r.data.controlNature).toBe("manual");
  });

  test("controlNature='SemiAutomated' (unknown but contains 'auto') → manual branch fires", async () => {
    // The check is strict equality on === "automated" (post-lower-case).
    // 'semiautomated' !== 'automated' → manual branch.
    const r = await soxTestingSkill.execute(
      {
        ...baseArgs,
        controlNature: "SemiAutomated",
        frequency: "monthly",
      },
      ctx
    );
    expect(r.data.controlNature).toBe("semiautomated");
    expect(r.data.sampleSize).toBe(3);
  });
});

// =========================================================================
// suggestedSamplingMethod ternary
//
// sampleSize >= 25 → "random with seed documented"
// sampleSize <  25 → "judgmental (small population)"
//
// Boundary case n=25 (where == 25) falls into the >=25 branch.
// =========================================================================

describe("soxTestingSkill.execute — suggestedSamplingMethod ternary", () => {
  test("sampleSize=1 (annual, manual) → 'judgmental (small population)'", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, frequency: "annual", controlNature: "manual" },
      ctx
    );
    expect(r.data.sampleSize).toBe(1);
    expect(r.data.suggestedSamplingMethod).toBe("judgmental (small population)");
  });

  test("sampleSize=2 (quarterly, manual) → 'judgmental (small population)'", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, frequency: "quarterly", controlNature: "manual" },
      ctx
    );
    expect(r.data.sampleSize).toBe(2);
    expect(r.data.suggestedSamplingMethod).toBe("judgmental (small population)");
  });

  test("sampleSize=3 (monthly, manual) → 'judgmental (small population)'", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, frequency: "monthly", controlNature: "manual" },
      ctx
    );
    expect(r.data.sampleSize).toBe(3);
    expect(r.data.suggestedSamplingMethod).toBe("judgmental (small population)");
  });

  test("sampleSize=8 (weekly, manual) → 'judgmental (small population)'", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, frequency: "weekly", controlNature: "manual" },
      ctx
    );
    expect(r.data.sampleSize).toBe(8);
    expect(r.data.suggestedSamplingMethod).toBe("judgmental (small population)");
  });

  test("sampleSize=25 (unknown freq → default) → 'random with seed documented' (BOUNDARY)", async () => {
    // n=25 satisfies >=25, so falls into the "random" branch.
    // Pinned because a future change to > 25 (strict gt) would silently
    // re-route the boundary case to "judgmental".
    const r = await soxTestingSkill.execute(
      { ...baseArgs, frequency: "hourly", controlNature: "manual" },
      ctx
    );
    expect(r.data.sampleSize).toBe(25);
    expect(r.data.suggestedSamplingMethod).toBe("random with seed documented");
  });

  test("sampleSize=30 (daily, manual) → 'random with seed documented'", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, frequency: "daily", controlNature: "manual" },
      ctx
    );
    expect(r.data.sampleSize).toBe(30);
    expect(r.data.suggestedSamplingMethod).toBe("random with seed documented");
  });

  test("sampleSize=50 (multiple_per_day, manual) → 'random with seed documented'", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, frequency: "multiple_per_day", controlNature: "manual" },
      ctx
    );
    expect(r.data.sampleSize).toBe(50);
    expect(r.data.suggestedSamplingMethod).toBe("random with seed documented");
  });

  test("automated + itgcEffective=true → sampleSize=1 → 'judgmental (small population)'", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, controlNature: "automated", itgcEffective: true },
      ctx
    );
    expect(r.data.sampleSize).toBe(1);
    expect(r.data.suggestedSamplingMethod).toBe("judgmental (small population)");
  });

  test("automated + itgcEffective=false + daily → sampleSize=30 → 'random with seed documented'", async () => {
    const r = await soxTestingSkill.execute(
      {
        ...baseArgs,
        controlNature: "automated",
        itgcEffective: false,
        frequency: "daily",
      },
      ctx
    );
    expect(r.data.sampleSize).toBe(30);
    expect(r.data.suggestedSamplingMethod).toBe("random with seed documented");
  });
});

// =========================================================================
// data passthrough — required + optional args mirrored
// =========================================================================

describe("soxTestingSkill.execute — data passthrough", () => {
  test("data.controlId === args.controlId verbatim", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, controlId: "CTL-AP-022" },
      ctx
    );
    expect(r.data.controlId).toBe("CTL-AP-022");
  });

  test("data.frequency === args.frequency verbatim (no normalisation)", async () => {
    // Even if the lookup falls through to the default, the mirrored
    // value is the original — not the normalised lookup key.
    const r = await soxTestingSkill.execute(
      { ...baseArgs, frequency: "MONTHLY" },
      ctx
    );
    expect(r.data.frequency).toBe("MONTHLY");
  });

  test("data.itgcEffective mirrors args.itgcEffective when supplied", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, itgcEffective: false },
      ctx
    );
    expect(r.data.itgcEffective).toBe(false);
  });

  test("data.itgcEffective defaults to true when omitted", async () => {
    const { itgcEffective: _omit, ...args } = baseArgs;
    const r = await soxTestingSkill.execute(args, ctx);
    expect(r.data.itgcEffective).toBe(true);
  });

  test("data.itgcEffective defaults to true when null (?? coerces null)", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, itgcEffective: null },
      ctx
    );
    expect(r.data.itgcEffective).toBe(true);
  });

  test("data.riskStatement mirrors args.riskStatement verbatim", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, riskStatement: "Unauthorised journal entries" },
      ctx
    );
    expect(r.data.riskStatement).toBe("Unauthorised journal entries");
  });

  test("data.riskStatement === null when omitted (?? null default)", async () => {
    const { riskStatement: _omit, ...args } = baseArgs;
    const r = await soxTestingSkill.execute(args, ctx);
    expect(r.data.riskStatement).toBeNull();
  });

  test("data.riskStatement === null when undefined", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, riskStatement: undefined },
      ctx
    );
    expect(r.data.riskStatement).toBeNull();
  });

  test("data.riskStatement === '' (empty string) is PRESERVED (?? semantics)", async () => {
    // ?? does NOT nullish ''. Empty string flows through unchanged.
    const r = await soxTestingSkill.execute(
      { ...baseArgs, riskStatement: "" },
      ctx
    );
    expect(r.data.riskStatement).toBe("");
  });

  test("controlId is preserved case-sensitively (no normalisation)", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, controlId: "ctl-rev-001" },
      ctx
    );
    expect(r.data.controlId).toBe("ctl-rev-001");
  });
});

// =========================================================================
// meta enrichment
// =========================================================================

describe("soxTestingSkill.execute — meta", () => {
  test("meta is a plain object", async () => {
    const r = await soxTestingSkill.execute(baseArgs, ctx);
    expect(isPlainObject(r.meta)).toBe(true);
  });

  test("meta has exactly four keys", async () => {
    const r = await soxTestingSkill.execute(baseArgs, ctx);
    expect(Object.keys(r.meta!).sort()).toEqual(
      ["controlNature", "frequency", "sampleSize", "skill"].sort()
    );
  });

  test("meta.skill === 'sox-testing' literal", async () => {
    const r = await soxTestingSkill.execute(baseArgs, ctx);
    expect(r.meta!.skill).toBe("sox-testing");
  });

  test("meta.frequency mirrors args.frequency", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, frequency: "weekly" },
      ctx
    );
    expect(r.meta!.frequency).toBe("weekly");
  });

  test("meta.frequency mirrors RAW args.frequency (not normalised lookup key)", async () => {
    const r = await soxTestingSkill.execute(
      { ...baseArgs, frequency: "MONTHLY" },
      ctx
    );
    expect(r.meta!.frequency).toBe("MONTHLY");
  });

  test("meta.controlNature mirrors the NORMALISED (post-toLowerCase) controlNature", async () => {
    // data.controlNature reflects the normalised local — that's what
    // both data.controlNature and meta.controlNature surface.
    const r = await soxTestingSkill.execute(
      { ...baseArgs, controlNature: "AUTOMATED", itgcEffective: true },
      ctx
    );
    expect(r.meta!.controlNature).toBe("automated");
    // mirror invariant
    expect(r.meta!.controlNature).toBe(r.data.controlNature);
  });

  test("meta.sampleSize === data.sampleSize across every frequency tier", async () => {
    // Both come from the same `sampleSize` local in execute(). If a
    // future refactor splits them into two compute paths the values
    // could diverge silently.
    const cases: Array<[string, string, boolean | null, number]> = [
      ["annual", "manual", null, 1],
      ["quarterly", "manual", null, 2],
      ["monthly", "manual", null, 3],
      ["weekly", "manual", null, 8],
      ["daily", "manual", null, 30],
      ["multiple_per_day", "manual", null, 50],
      ["hourly", "manual", null, 25],
      ["monthly", "automated", true, 1],
      ["monthly", "automated", false, 3],
      ["daily", "automated", false, 30],
    ];
    for (const [freq, nature, itgc, expected] of cases) {
      const args: Record<string, unknown> = {
        ...baseArgs,
        frequency: freq,
        controlNature: nature,
      };
      if (itgc !== null) args.itgcEffective = itgc;
      const r = await soxTestingSkill.execute(args, ctx);
      expect(r.data.sampleSize).toBe(expected);
      expect(r.meta!.sampleSize).toBe(expected);
      expect(r.meta!.sampleSize).toBe(r.data.sampleSize);
    }
  });
});

// =========================================================================
// Purity — no fetch, no IO, idempotent
//
// This is a tripwire — if a future "actually pull control catalogue from
// prisma" path lands, these assertions fail. That is the intended
// signal: the author must then re-pin the post-IO contract intentionally.
// =========================================================================

describe("soxTestingSkill.execute — purity", () => {
  test("does NOT call globalThis.fetch", async () => {
    const originalFetch = (globalThis as any).fetch;
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    (globalThis as any).fetch = spy;
    try {
      await soxTestingSkill.execute(baseArgs, ctx);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });

  test("works with empty ctx (no baseUrl/cookie/tenant) — context-independent", async () => {
    const r = await soxTestingSkill.execute(baseArgs, {
      tenantId: "",
      sessionCookie: "",
      baseUrl: "",
    });
    // monthly + manual = 3
    expect(r.data.sampleSize).toBe(3);
    expect(r.meta!.skill).toBe("sox-testing");
  });

  test("idempotent on identical inputs (no random/state in the body)", async () => {
    const r1 = await soxTestingSkill.execute(baseArgs, ctx);
    const r2 = await soxTestingSkill.execute(baseArgs, ctx);
    expect(r1.data).toEqual(r2.data);
    expect(r1.meta).toEqual(r2.meta);
    expect(r1.instructions).toBe(r2.instructions);
  });

  test("does NOT mutate caller args", async () => {
    const args = { ...baseArgs };
    const snapshot = JSON.stringify(args);
    await soxTestingSkill.execute(args, ctx);
    expect(JSON.stringify(args)).toBe(snapshot);
  });

  test("does NOT mutate ctx", async () => {
    const localCtx = { ...ctx };
    const snapshot = JSON.stringify(localCtx);
    await soxTestingSkill.execute(baseArgs, localCtx);
    expect(JSON.stringify(localCtx)).toBe(snapshot);
  });

  test("fresh data object per call (mutating r1.data does not bleed into r2)", async () => {
    const r1 = await soxTestingSkill.execute(baseArgs, ctx);
    (r1.data as any).sampleSize = 9999;
    const r2 = await soxTestingSkill.execute(baseArgs, ctx);
    // monthly + manual = 3, NOT 9999
    expect(r2.data.sampleSize).toBe(3);
  });

  test("fresh meta object per call", async () => {
    const r1 = await soxTestingSkill.execute(baseArgs, ctx);
    (r1.meta as any).skill = "tampered";
    const r2 = await soxTestingSkill.execute(baseArgs, ctx);
    expect(r2.meta!.skill).toBe("sox-testing");
  });
});

// =========================================================================
// Typed contract surface
// =========================================================================

describe("soxTestingSkill — typed FinanceSkillResult contract", () => {
  test("compile-time: result has all FinanceSkillResult keys", async () => {
    // Mostly a TS contract check — the runtime assertion is covered
    // elsewhere, but the import + the destructure here means
    // `tsc --noEmit` will fail if FinanceSkillResult drifts.
    const r = await soxTestingSkill.execute(baseArgs, ctx);
    const { data, instructions, meta, skill_guidance } = r;
    expect(data).toBeDefined();
    expect(instructions).toBeDefined();
    expect(meta).toBeDefined();
    expect(skill_guidance).toBeDefined();
  });
});
