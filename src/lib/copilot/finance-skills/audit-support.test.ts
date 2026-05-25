// Unit tests for auditSupportSkill.execute().
//
// auditSupportSkill is the EIGHTH-shipped finance-skill test slot but
// structurally the SECOND-simplest (after journal-entry) because
// execute() is PURE: no fetch, no prisma, no IO. The skill takes a
// control + a population size and runs a deterministic AICPA-aligned
// sample-size lookup table:
//
//     1   ≤ n ≤ 25   → sampleSize = n,  method = "100% (test all)"
//    26   ≤ n ≤ 250  → sampleSize = 25, method = "random"
//   251   ≤ n ≤ 1000 → sampleSize = 40, method = "random with amount stratification"
//  1001   ≤ n ≤ 2500 → sampleSize = 60, method = "random"
//  2501   ≤ n         → sampleSize = 90, method = "random — consider IT-driven full population test"
//
// What this file pins:
//   1. Static surface (name, description, inputSchema, skillPrompt)
//   2. execute() returns FinanceSkillResult shape with all four required keys
//   3. AICPA sample-size table — boundary cases at 25/26/250/251/1000/1001/2500/2501
//   4. Sample-method strings — pinned verbatim (drift here changes Claude's narrative)
//   5. Default ?? fallback semantics (testPeriod, controlType)
//   6. meta enrichment: { skill: "audit-support", controlArea, populationSize, sampleSize }
//   7. Skill is PURE — no fetch, idempotent, context-independent
//   8. SKILL_PROMPT covers: SOX, AICPA, R-O-T-C control areas, deficiency
//      severity (deficiency / significant / material weakness), 7-year
//      retention reminder, workpaper template structure
//
// Trip-wire on the pure-function assertion: if a future "actually pull
// the population from the GL" path lands, the no-fetch assertion will
// fail on purpose — forcing the author to decide what the post-fetch
// contract should be.
//
// Pairs with src/lib/copilot/finance-skills/index.test.ts (registry-level
// pins) and the other 7 execute() tests. After this slot lands, only
// sox-testing remains.

import { auditSupportSkill } from "./audit-support";
import type { FinanceSkillContext } from "./types";

// --- shared fixture ---
const ctx: FinanceSkillContext = {
  tenantId: "tnt_test",
  sessionCookie: "session=abc123",
  baseUrl: "http://localhost:3000",
};

const baseArgs = {
  controlId: "CTL-AP-001",
  controlArea: "AP",
  populationSize: 500,
  testPeriod: "Q1 2026",
  controlType: "manual / detective",
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

describe("auditSupportSkill — static surface", () => {
  test("name is exactly 'prepare_audit_workpaper'", () => {
    expect(auditSupportSkill.name).toBe("prepare_audit_workpaper");
  });

  test("description is a non-empty string ≥ 50 chars", () => {
    expect(typeof auditSupportSkill.description).toBe("string");
    expect(auditSupportSkill.description.length).toBeGreaterThanOrEqual(50);
  });

  test("description mentions audit/workpaper/control verbs", () => {
    // These keywords are what the route's natural-language router keys
    // off. If marketing-style rewording happens, the router's match
    // score drops and the skill never fires.
    const desc = auditSupportSkill.description.toLowerCase();
    expect(desc).toMatch(/audit|workpaper|control/);
  });

  test("description mentions SOX (the dominant compliance regime)", () => {
    expect(auditSupportSkill.description).toMatch(/SOX/);
  });

  test("description carries canonical routing examples", () => {
    // Pin the example phrasings the route uses to disambiguate this
    // skill from reconciliation / variance-analysis.
    const desc = auditSupportSkill.description.toLowerCase();
    expect(desc).toMatch(/prepare for audit|control testing|sample size|workpaper/);
  });

  test("inputSchema is JSON Schema object with required & properties", () => {
    expect(auditSupportSkill.inputSchema.type).toBe("object");
    expect(isPlainObject(auditSupportSkill.inputSchema.properties)).toBe(true);
    expect(Array.isArray(auditSupportSkill.inputSchema.required)).toBe(true);
  });

  test("required[] is exactly ['controlId','controlArea','populationSize']", () => {
    // Order matters for the prompt the model sees, so pin order too.
    expect(auditSupportSkill.inputSchema.required).toEqual([
      "controlId",
      "controlArea",
      "populationSize",
    ]);
  });

  test("inputSchema declares all required fields in properties", () => {
    const props = auditSupportSkill.inputSchema.properties;
    for (const r of auditSupportSkill.inputSchema.required) {
      expect(props[r]).toBeDefined();
      expect(typeof props[r].type).toBe("string");
    }
  });

  test("inputSchema declares the optional testPeriod + controlType fields", () => {
    const props = auditSupportSkill.inputSchema.properties;
    expect(props.testPeriod).toBeDefined();
    expect(props.testPeriod.type).toBe("string");
    expect(props.controlType).toBeDefined();
    expect(props.controlType.type).toBe("string");
  });

  test("controlId field is type=string with a CTL-* example in description", () => {
    const f = auditSupportSkill.inputSchema.properties.controlId;
    expect(f.type).toBe("string");
    expect((f.description ?? "").toUpperCase()).toMatch(/CTL/);
  });

  test("controlArea field describes the canonical control-area enum hints", () => {
    // We carry these as a description hint, not a true JSON-Schema enum,
    // so Claude has the routing options without the schema rejecting
    // free text like "FX hedging" or "stock-comp".
    const desc = (
      auditSupportSkill.inputSchema.properties.controlArea.description ?? ""
    ).toLowerCase();
    for (const area of ["revenue", "ap", "payroll", "treasury", "close", "itgc"]) {
      expect(desc).toContain(area);
    }
  });

  test("populationSize is type=number per JSON Schema", () => {
    expect(auditSupportSkill.inputSchema.properties.populationSize.type).toBe(
      "number"
    );
  });

  test("testPeriod description carries fiscal-quarter / FY examples", () => {
    const desc = (
      auditSupportSkill.inputSchema.properties.testPeriod.description ?? ""
    ).toLowerCase();
    expect(desc).toMatch(/q1|q2|q3|q4|fy/);
  });

  test("controlType description mentions preventive/detective + manual/automated dimensions", () => {
    const desc = (
      auditSupportSkill.inputSchema.properties.controlType.description ?? ""
    ).toLowerCase();
    expect(desc).toMatch(/preventive|detective/);
    expect(desc).toMatch(/manual|automated/);
  });

  test("skillPrompt is a non-empty string opening with a markdown heading", () => {
    expect(typeof auditSupportSkill.skillPrompt).toBe("string");
    expect(auditSupportSkill.skillPrompt.length).toBeGreaterThan(200);
    expect(auditSupportSkill.skillPrompt.startsWith("#")).toBe(true);
  });

  test("skillPrompt covers the workpaper template sections", () => {
    // These are the load-bearing sections — content drift here
    // changes Claude's behavior on every workpaper call.
    const sp = auditSupportSkill.skillPrompt;
    expect(sp).toMatch(/workpaper template/i);
    expect(sp).toMatch(/control id/i);
    expect(sp).toMatch(/control owner/i);
    expect(sp).toMatch(/frequency/i);
    expect(sp).toMatch(/test procedures/i);
    expect(sp).toMatch(/evidence/i);
  });

  test("skillPrompt covers AICPA sample-size table", () => {
    const sp = auditSupportSkill.skillPrompt;
    expect(sp).toMatch(/AICPA/);
    expect(sp).toMatch(/sample/i);
    // The four sample-size numbers in the AICPA-aligned table must
    // appear in the prompt — Claude relies on this to explain its
    // sampling rationale.
    expect(sp).toMatch(/\b25\b/);
    expect(sp).toMatch(/\b40\b/);
    expect(sp).toMatch(/\b60\b/);
    expect(sp).toMatch(/\b90\b/);
  });

  test("skillPrompt covers deficiency severity tiers", () => {
    const sp = auditSupportSkill.skillPrompt;
    expect(sp).toMatch(/deficiency/i);
    expect(sp).toMatch(/significant deficiency/i);
    expect(sp).toMatch(/material weakness/i);
  });

  test("skillPrompt covers R-O-T-C SOX control-area model", () => {
    const sp = auditSupportSkill.skillPrompt;
    expect(sp).toMatch(/R-O-T-C/);
    expect(sp).toMatch(/revenue/i);
    expect(sp).toMatch(/order-to-cash/i);
    expect(sp).toMatch(/treasury/i);
    expect(sp).toMatch(/close/i);
  });

  test("skillPrompt includes 7-year SOX retention reminder", () => {
    // This is the regulator-facing compliance line — it must NEVER
    // be dropped or rephrased into something soft like "keep around".
    const sp = auditSupportSkill.skillPrompt;
    expect(sp).toMatch(/7 years/i);
    expect(sp).toMatch(/retain/i);
    expect(sp.toLowerCase()).toMatch(/sox|public companies/);
  });

  test("skillPrompt mentions second-preparer review for material results", () => {
    expect(auditSupportSkill.skillPrompt).toMatch(/second-preparer|second preparer/i);
  });

  test("execute is an async function with arity 2 (args, ctx)", () => {
    expect(typeof auditSupportSkill.execute).toBe("function");
    expect(auditSupportSkill.execute.length).toBe(2);
  });
});

// =========================================================================
// execute() — result shape
// =========================================================================

describe("auditSupportSkill.execute — result shape", () => {
  test("returns a Promise (then-able)", () => {
    const ret = auditSupportSkill.execute(baseArgs, ctx);
    expect(typeof (ret as Promise<unknown>).then).toBe("function");
  });

  test("resolved value is a plain object", async () => {
    const r = await auditSupportSkill.execute(baseArgs, ctx);
    expect(isPlainObject(r)).toBe(true);
  });

  test("has the four FinanceSkillResult keys", async () => {
    const r = await auditSupportSkill.execute(baseArgs, ctx);
    expect(Object.keys(r).sort()).toEqual(
      ["data", "instructions", "meta", "skill_guidance"].sort()
    );
  });

  test("skill_guidance === skill.skillPrompt (no drift)", async () => {
    const r = await auditSupportSkill.execute(baseArgs, ctx);
    expect(r.skill_guidance).toBe(auditSupportSkill.skillPrompt);
  });

  test("instructions is a non-empty string ≥ 50 chars", async () => {
    const r = await auditSupportSkill.execute(baseArgs, ctx);
    expect(typeof r.instructions).toBe("string");
    expect(r.instructions.length).toBeGreaterThanOrEqual(50);
  });

  test("instructions mention the workpaper deliverable verbatim", async () => {
    const r = await auditSupportSkill.execute(baseArgs, ctx);
    expect(r.instructions).toMatch(/workpaper/i);
    expect(r.instructions).toMatch(/sample selection/i);
    expect(r.instructions).toMatch(/test procedures/i);
    expect(r.instructions).toMatch(/evidence/i);
  });

  test("instructions end with the retention reminder hook", async () => {
    // Pin that the instructions explicitly ask Claude to close with
    // the retention reminder. Trip-wire on prompt drift.
    const r = await auditSupportSkill.execute(baseArgs, ctx);
    expect(r.instructions).toMatch(/retention|compliance reminder/i);
  });

  test("data is a plain object with the seven expected keys", async () => {
    const r = await auditSupportSkill.execute(baseArgs, ctx);
    expect(isPlainObject(r.data)).toBe(true);
    expect(Object.keys(r.data).sort()).toEqual(
      [
        "controlId",
        "controlArea",
        "populationSize",
        "sampleSize",
        "samplingMethod",
        "testPeriod",
        "controlType",
      ].sort()
    );
  });
});

// =========================================================================
// AICPA sample-size table — boundary semantics
//
// This is the load-bearing logic of the skill. We pin every threshold
// the AICPA-aligned table walks through:
//
//   1   ≤ n ≤ 25   → sampleSize = n,  method = "100% (test all)"
//   26  ≤ n ≤ 250  → sampleSize = 25, method = "random"
//   251 ≤ n ≤ 1000 → sampleSize = 40, method = "random with amount stratification"
//   1001≤ n ≤ 2500 → sampleSize = 60, method = "random"
//   2501≤ n         → sampleSize = 90, method = "random — consider IT-driven full population test"
//
// Drift on any boundary by ±1 silently changes audit sample sizes —
// regulator-facing risk, not just QA niceness.
// =========================================================================

describe("auditSupportSkill.execute — AICPA sample-size table boundaries", () => {
  // Helper to skip the boilerplate of building & awaiting the call.
  async function run(populationSize: number) {
    return auditSupportSkill.execute({ ...baseArgs, populationSize }, ctx);
  }

  // --- Bucket 1: 1 ≤ n ≤ 25 (100% test all) ---

  test("n=1 → sampleSize=1, method='100% (test all)'", async () => {
    const r = await run(1);
    expect(r.data.sampleSize).toBe(1);
    expect(r.data.samplingMethod).toBe("100% (test all)");
  });

  test("n=10 → sampleSize=10, method='100% (test all)'", async () => {
    const r = await run(10);
    expect(r.data.sampleSize).toBe(10);
    expect(r.data.samplingMethod).toBe("100% (test all)");
  });

  test("n=25 (upper boundary of bucket 1) → sampleSize=25, method='100% (test all)'", async () => {
    const r = await run(25);
    expect(r.data.sampleSize).toBe(25);
    expect(r.data.samplingMethod).toBe("100% (test all)");
  });

  // --- Bucket 2: 26 ≤ n ≤ 250 (random, 25 items) ---

  test("n=26 (lower boundary of bucket 2) → sampleSize=25, method='random'", async () => {
    const r = await run(26);
    expect(r.data.sampleSize).toBe(25);
    expect(r.data.samplingMethod).toBe("random");
  });

  test("n=100 → sampleSize=25, method='random'", async () => {
    const r = await run(100);
    expect(r.data.sampleSize).toBe(25);
    expect(r.data.samplingMethod).toBe("random");
  });

  test("n=250 (upper boundary of bucket 2) → sampleSize=25, method='random'", async () => {
    const r = await run(250);
    expect(r.data.sampleSize).toBe(25);
    expect(r.data.samplingMethod).toBe("random");
  });

  // --- Bucket 3: 251 ≤ n ≤ 1000 (random + stratification, 40 items) ---

  test("n=251 (lower boundary of bucket 3) → sampleSize=40, method='random with amount stratification'", async () => {
    const r = await run(251);
    expect(r.data.sampleSize).toBe(40);
    expect(r.data.samplingMethod).toBe("random with amount stratification");
  });

  test("n=500 → sampleSize=40, method='random with amount stratification'", async () => {
    const r = await run(500);
    expect(r.data.sampleSize).toBe(40);
    expect(r.data.samplingMethod).toBe("random with amount stratification");
  });

  test("n=1000 (upper boundary of bucket 3) → sampleSize=40, method='random with amount stratification'", async () => {
    const r = await run(1000);
    expect(r.data.sampleSize).toBe(40);
    expect(r.data.samplingMethod).toBe("random with amount stratification");
  });

  // --- Bucket 4: 1001 ≤ n ≤ 2500 (random, 60 items) ---

  test("n=1001 (lower boundary of bucket 4) → sampleSize=60, method='random'", async () => {
    const r = await run(1001);
    expect(r.data.sampleSize).toBe(60);
    expect(r.data.samplingMethod).toBe("random");
  });

  test("n=2000 → sampleSize=60, method='random'", async () => {
    const r = await run(2000);
    expect(r.data.sampleSize).toBe(60);
    expect(r.data.samplingMethod).toBe("random");
  });

  test("n=2500 (upper boundary of bucket 4) → sampleSize=60, method='random'", async () => {
    const r = await run(2500);
    expect(r.data.sampleSize).toBe(60);
    expect(r.data.samplingMethod).toBe("random");
  });

  // --- Bucket 5: 2501 ≤ n (90 items, IT-driven hint) ---

  test("n=2501 (lower boundary of bucket 5) → sampleSize=90", async () => {
    const r = await run(2501);
    expect(r.data.sampleSize).toBe(90);
  });

  test("n=2501 method mentions IT-driven full population test", async () => {
    const r = await run(2501);
    expect(r.data.samplingMethod).toMatch(/IT-driven/);
    expect(r.data.samplingMethod).toMatch(/full population/);
  });

  test("n=10000 → sampleSize=90 (cap)", async () => {
    const r = await run(10000);
    expect(r.data.sampleSize).toBe(90);
  });

  test("n=1000000 → sampleSize=90 (cap holds at very large populations)", async () => {
    const r = await run(1000000);
    expect(r.data.sampleSize).toBe(90);
  });

  // --- Edge cases that fall through the comparison ladder ---

  test("n=0 → first branch (0 <= 25) → sampleSize=0, method='100% (test all)'", async () => {
    // 0 is technically a degenerate population but the if-ladder
    // catches it cleanly. Pinned because a future "n < 1 → reject"
    // hardening pass should be intentional.
    const r = await run(0);
    expect(r.data.sampleSize).toBe(0);
    expect(r.data.samplingMethod).toBe("100% (test all)");
  });

  test("n=-5 (negative) → first branch (n <= 25 is true) → sampleSize=-5", async () => {
    // Negative populations are nonsensical but the ladder is naive.
    // We pin the current behaviour so a future input-guard is a
    // deliberate test update, not a silent contract drift.
    const r = await run(-5);
    expect(r.data.sampleSize).toBe(-5);
    expect(r.data.samplingMethod).toBe("100% (test all)");
  });

  test("n=NaN → all comparisons false → falls to bucket 5 (90, IT-driven)", async () => {
    // NaN <= x === false for every x, so the ladder skips every
    // bucket and lands in the else branch. This is a subtle JS gotcha
    // worth pinning — if someone later adds Number.isFinite() guards
    // the test will fail and force them to decide what NaN should map to.
    const r = await run(NaN);
    expect(r.data.sampleSize).toBe(90);
    expect(r.data.samplingMethod).toMatch(/IT-driven/);
  });

  test("n=Infinity → all comparisons false → bucket 5 (90)", async () => {
    const r = await run(Infinity);
    expect(r.data.sampleSize).toBe(90);
  });

  test("populationSize verbatim mirrored to data.populationSize (cast-free)", async () => {
    const r = await run(500);
    expect(r.data.populationSize).toBe(500);
    // No Math.floor / Math.round happening — fractional populations
    // pass through unmolested.
    const r2 = await run(500.5);
    expect(r2.data.populationSize).toBe(500.5);
  });
});

// =========================================================================
// execute() — default ?? fallback semantics for optional args
// =========================================================================

describe("auditSupportSkill.execute — optional fields default via ??", () => {
  // The skill uses `args.testPeriod ?? "current period"` and
  // `args.controlType ?? "manual / detective"`. ?? nullishes only on
  // null/undefined — empty string is preserved. Pin both sides so a
  // future `||` rewrite is caught.

  test("testPeriod omitted → 'current period'", async () => {
    const { testPeriod: _omit, ...args } = baseArgs;
    const r = await auditSupportSkill.execute(args, ctx);
    expect(r.data.testPeriod).toBe("current period");
  });

  test("testPeriod === undefined → 'current period'", async () => {
    const r = await auditSupportSkill.execute(
      { ...baseArgs, testPeriod: undefined },
      ctx
    );
    expect(r.data.testPeriod).toBe("current period");
  });

  test("testPeriod === null → 'current period'", async () => {
    const r = await auditSupportSkill.execute(
      { ...baseArgs, testPeriod: null },
      ctx
    );
    expect(r.data.testPeriod).toBe("current period");
  });

  test("testPeriod === '' (empty string) is PRESERVED (?? does NOT coalesce '')", async () => {
    const r = await auditSupportSkill.execute(
      { ...baseArgs, testPeriod: "" },
      ctx
    );
    expect(r.data.testPeriod).toBe("");
  });

  test("testPeriod passes through verbatim when supplied", async () => {
    const r = await auditSupportSkill.execute(
      { ...baseArgs, testPeriod: "FY2026" },
      ctx
    );
    expect(r.data.testPeriod).toBe("FY2026");
  });

  test("controlType omitted → 'manual / detective'", async () => {
    const { controlType: _omit, ...args } = baseArgs;
    const r = await auditSupportSkill.execute(args, ctx);
    expect(r.data.controlType).toBe("manual / detective");
  });

  test("controlType === undefined → 'manual / detective'", async () => {
    const r = await auditSupportSkill.execute(
      { ...baseArgs, controlType: undefined },
      ctx
    );
    expect(r.data.controlType).toBe("manual / detective");
  });

  test("controlType === '' (empty string) is PRESERVED (?? semantics)", async () => {
    const r = await auditSupportSkill.execute(
      { ...baseArgs, controlType: "" },
      ctx
    );
    expect(r.data.controlType).toBe("");
  });

  test("controlType passes through verbatim when supplied", async () => {
    const r = await auditSupportSkill.execute(
      { ...baseArgs, controlType: "automated / preventive" },
      ctx
    );
    expect(r.data.controlType).toBe("automated / preventive");
  });
});

// =========================================================================
// execute() — required-arg passthrough
// =========================================================================

describe("auditSupportSkill.execute — required args mirrored to data", () => {
  test("data.controlId === args.controlId verbatim", async () => {
    const r = await auditSupportSkill.execute(
      { ...baseArgs, controlId: "CTL-REV-007" },
      ctx
    );
    expect(r.data.controlId).toBe("CTL-REV-007");
  });

  test("data.controlArea === args.controlArea verbatim", async () => {
    const r = await auditSupportSkill.execute(
      { ...baseArgs, controlArea: "Treasury" },
      ctx
    );
    expect(r.data.controlArea).toBe("Treasury");
  });

  test("data.populationSize === args.populationSize verbatim", async () => {
    const r = await auditSupportSkill.execute(
      { ...baseArgs, populationSize: 750 },
      ctx
    );
    expect(r.data.populationSize).toBe(750);
  });

  test("controlArea is preserved case-sensitively (no normalisation)", async () => {
    // Pin that the skill does NOT lower/upper-case the controlArea —
    // a future normalisation pass might silently change the
    // narrative grouping Claude produces.
    const r = await auditSupportSkill.execute(
      { ...baseArgs, controlArea: "ItGc" },
      ctx
    );
    expect(r.data.controlArea).toBe("ItGc");
  });
});

// =========================================================================
// execute() — meta enrichment
// =========================================================================

describe("auditSupportSkill.execute — meta", () => {
  test("meta is a plain object", async () => {
    const r = await auditSupportSkill.execute(baseArgs, ctx);
    expect(isPlainObject(r.meta)).toBe(true);
  });

  test("meta has exactly four keys", async () => {
    const r = await auditSupportSkill.execute(baseArgs, ctx);
    expect(Object.keys(r.meta!).sort()).toEqual(
      ["controlArea", "populationSize", "sampleSize", "skill"].sort()
    );
  });

  test("meta.skill === 'audit-support' literal", async () => {
    const r = await auditSupportSkill.execute(baseArgs, ctx);
    expect(r.meta!.skill).toBe("audit-support");
  });

  test("meta.controlArea mirrors args.controlArea", async () => {
    const r = await auditSupportSkill.execute(
      { ...baseArgs, controlArea: "Payroll" },
      ctx
    );
    expect(r.meta!.controlArea).toBe("Payroll");
  });

  test("meta.populationSize mirrors args.populationSize", async () => {
    const r = await auditSupportSkill.execute(
      { ...baseArgs, populationSize: 1234 },
      ctx
    );
    expect(r.meta!.populationSize).toBe(1234);
  });

  test("meta.sampleSize === data.sampleSize (mirror, not independent compute)", async () => {
    // Both come from the same `sampleSize` local in execute(). If a
    // future refactor splits them into two compute paths the values
    // could diverge silently.
    const cases = [25, 26, 250, 251, 1000, 1001, 2500, 2501];
    for (const n of cases) {
      const r = await auditSupportSkill.execute(
        { ...baseArgs, populationSize: n },
        ctx
      );
      expect(r.meta!.sampleSize).toBe(r.data.sampleSize);
    }
  });

  test("meta.sampleSize matches AICPA bucket for the supplied populationSize", async () => {
    const r = await auditSupportSkill.execute(
      { ...baseArgs, populationSize: 500 },
      ctx
    );
    expect(r.meta!.sampleSize).toBe(40);
  });
});

// =========================================================================
// execute() — purity (no fetch, no IO, idempotent)
//
// This is a tripwire — if a future "actually pull population from the
// GL" or "look up control owner from prisma" path lands, these assertions
// fail. That is the intended signal: the author must then re-pin the
// post-IO contract intentionally.
// =========================================================================

describe("auditSupportSkill.execute — purity", () => {
  test("does NOT call globalThis.fetch", async () => {
    const originalFetch = (globalThis as any).fetch;
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    (globalThis as any).fetch = spy;
    try {
      await auditSupportSkill.execute(baseArgs, ctx);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });

  test("works with empty ctx (no baseUrl/cookie/tenant) — context-independent", async () => {
    // If the skill is truly pure, ctx is unused. Force the issue with
    // a degenerate ctx.
    const r = await auditSupportSkill.execute(baseArgs, {
      tenantId: "",
      sessionCookie: "",
      baseUrl: "",
    });
    expect(r.data.sampleSize).toBe(40); // n=500 → bucket 3
    expect(r.meta!.skill).toBe("audit-support");
  });

  test("idempotent on identical inputs (no random/state in the body)", async () => {
    const r1 = await auditSupportSkill.execute(baseArgs, ctx);
    const r2 = await auditSupportSkill.execute(baseArgs, ctx);
    expect(r1.data).toEqual(r2.data);
    expect(r1.meta).toEqual(r2.meta);
    expect(r1.instructions).toBe(r2.instructions);
  });

  test("does NOT mutate caller args", async () => {
    const args = { ...baseArgs };
    const snapshot = JSON.stringify(args);
    await auditSupportSkill.execute(args, ctx);
    expect(JSON.stringify(args)).toBe(snapshot);
  });

  test("does NOT mutate ctx", async () => {
    const localCtx = { ...ctx };
    const snapshot = JSON.stringify(localCtx);
    await auditSupportSkill.execute(baseArgs, localCtx);
    expect(JSON.stringify(localCtx)).toBe(snapshot);
  });

  test("fresh data object per call (mutating r1.data does not bleed into r2)", async () => {
    const r1 = await auditSupportSkill.execute(baseArgs, ctx);
    (r1.data as any).sampleSize = 9999;
    const r2 = await auditSupportSkill.execute(baseArgs, ctx);
    expect(r2.data.sampleSize).toBe(40); // n=500 → 40, not 9999
  });

  test("fresh meta object per call", async () => {
    const r1 = await auditSupportSkill.execute(baseArgs, ctx);
    (r1.meta as any).skill = "tampered";
    const r2 = await auditSupportSkill.execute(baseArgs, ctx);
    expect(r2.meta!.skill).toBe("audit-support");
  });
});

// =========================================================================
// Typed contract surface
// =========================================================================

describe("auditSupportSkill — typed FinanceSkillResult contract", () => {
  test("compile-time: result has all FinanceSkillResult keys", async () => {
    // This is mostly a TS contract check — the runtime assertion is
    // covered elsewhere, but having the import + the destructure here
    // means `tsc --noEmit` will fail if FinanceSkillResult drifts.
    const r = await auditSupportSkill.execute(baseArgs, ctx);
    const { data, instructions, meta, skill_guidance } = r;
    expect(data).toBeDefined();
    expect(instructions).toBeDefined();
    expect(meta).toBeDefined();
    expect(skill_guidance).toBeDefined();
  });
});
