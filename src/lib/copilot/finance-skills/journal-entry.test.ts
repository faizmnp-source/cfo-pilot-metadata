// Unit tests for journalEntrySkill.execute().
//
// journalEntrySkill is the easiest Copilot skill to pin end-to-end because
// `execute()` is pure: no fetch, no prisma, no IO. v1 deliberately does
// NOT write JEs — it returns a structured spec the model interprets and
// shows the user for review (per route.ts handoff convention).
//
// What this file pins:
//   1. Static surface (name, description, inputSchema, skillPrompt)
//   2. execute() returns FinanceSkillResult shape with all four required keys
//   3. data is a pass-through of required args + nullable optionals
//   4. meta enrichment: { skill: "journal-entry", kind, period }
//   5. skill_guidance === skillPrompt (no drift between static + runtime)
//   6. execute() is pure: doesn't call fetch, context-independent, idempotent
//   7. instructions text contains the v1 "do not write to ledger" guarantee
//
// If the future-flag "actually post the JE" path lands, the no-fetch +
// no-writes assertions here will start failing — that's the trip-wire.
//
// Pairs with src/lib/copilot/finance-skills/index.test.ts (registry-level
// pins). Together they pin enough surface that the Copilot route can land
// without silent contract drift.

import { journalEntrySkill } from "./journal-entry";
import type { FinanceSkillContext, FinanceSkillResult } from "./types";

// --- shared fixture ---
const ctx: FinanceSkillContext = {
  tenantId: "tnt_test",
  sessionCookie: "session=abc123",
  baseUrl: "http://localhost:3000",
};

const baseArgs = {
  kind: "accrual",
  entityId: "ent_root",
  periodCode: "2026-04",
  amount: 12500,
};

const VALID_KINDS = [
  "accrual",
  "prepaid",
  "depreciation",
  "revenue",
  "payroll",
  "other",
] as const;

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

describe("journalEntrySkill — static surface", () => {
  test("name is exactly 'prepare_journal_entry'", () => {
    expect(journalEntrySkill.name).toBe("prepare_journal_entry");
  });

  test("description is a non-empty string ≥ 50 chars", () => {
    expect(typeof journalEntrySkill.description).toBe("string");
    expect(journalEntrySkill.description.length).toBeGreaterThanOrEqual(50);
  });

  test("description mentions the verbs Copilot routes on", () => {
    // These keywords are what the route's natural-language router keys off.
    // If marketing-style rewording happens, the router's match score drops.
    const desc = journalEntrySkill.description.toLowerCase();
    expect(desc).toMatch(/journal entry|je|accrual|depreciation/);
  });

  test("inputSchema is JSON Schema object with required & properties", () => {
    expect(journalEntrySkill.inputSchema.type).toBe("object");
    expect(isPlainObject(journalEntrySkill.inputSchema.properties)).toBe(true);
    expect(Array.isArray(journalEntrySkill.inputSchema.required)).toBe(true);
  });

  test("required[] is exactly ['kind','entityId','periodCode','amount']", () => {
    // Order matters for the prompt the model sees, so we pin order too.
    expect(journalEntrySkill.inputSchema.required).toEqual([
      "kind",
      "entityId",
      "periodCode",
      "amount",
    ]);
  });

  test("inputSchema declares all required fields in properties", () => {
    const props = journalEntrySkill.inputSchema.properties;
    for (const r of journalEntrySkill.inputSchema.required) {
      expect(props[r]).toBeDefined();
      expect(typeof props[r].type).toBe("string");
    }
  });

  test("inputSchema declares the optional account-code fields", () => {
    const props = journalEntrySkill.inputSchema.properties;
    expect(props.debitAccountCode).toBeDefined();
    expect(props.debitAccountCode.type).toBe("string");
    expect(props.creditAccountCode).toBeDefined();
    expect(props.creditAccountCode.type).toBe("string");
  });

  test("inputSchema declares a description field", () => {
    expect(journalEntrySkill.inputSchema.properties.description).toBeDefined();
    expect(journalEntrySkill.inputSchema.properties.description.type).toBe(
      "string"
    );
  });

  test("kind property mentions all six accepted values", () => {
    const kindDesc = (
      journalEntrySkill.inputSchema.properties.kind.description ?? ""
    ).toLowerCase();
    for (const k of VALID_KINDS) {
      expect(kindDesc).toContain(k);
    }
  });

  test("amount field is a number per JSON Schema", () => {
    expect(journalEntrySkill.inputSchema.properties.amount.type).toBe("number");
  });

  test("skillPrompt is a non-empty string opening with a markdown heading", () => {
    expect(typeof journalEntrySkill.skillPrompt).toBe("string");
    expect(journalEntrySkill.skillPrompt.length).toBeGreaterThan(100);
    expect(journalEntrySkill.skillPrompt.startsWith("#")).toBe(true);
  });

  test("skillPrompt covers the JE structure + validation checks", () => {
    // These are the load-bearing sections of the prompt — content drift here
    // changes Claude's behavior on every JE call.
    const sp = journalEntrySkill.skillPrompt;
    expect(sp).toMatch(/DR\b/);
    expect(sp).toMatch(/CR\b/);
    expect(sp).toMatch(/balance check/i);
    expect(sp).toMatch(/validation/i);
  });

  test("execute is an async function with arity 2 (args, ctx)", () => {
    expect(typeof journalEntrySkill.execute).toBe("function");
    expect(journalEntrySkill.execute.length).toBe(2);
  });
});

// =========================================================================
// execute() — result shape
// =========================================================================

describe("journalEntrySkill.execute — result shape", () => {
  test("returns a Promise (then-able)", () => {
    const ret = journalEntrySkill.execute(baseArgs, ctx);
    expect(typeof (ret as Promise<unknown>).then).toBe("function");
  });

  test("resolved value is a plain object", async () => {
    const r = await journalEntrySkill.execute(baseArgs, ctx);
    expect(isPlainObject(r)).toBe(true);
  });

  test("has the four FinanceSkillResult keys", async () => {
    const r = await journalEntrySkill.execute(baseArgs, ctx);
    expect(Object.keys(r).sort()).toEqual(
      ["data", "instructions", "meta", "skill_guidance"].sort()
    );
  });

  test("skill_guidance === skill.skillPrompt (no drift)", async () => {
    const r = await journalEntrySkill.execute(baseArgs, ctx);
    // Identity by value is enough — the prompt is a module-level constant.
    expect(r.skill_guidance).toBe(journalEntrySkill.skillPrompt);
  });

  test("instructions is a non-empty string ≥ 50 chars", async () => {
    const r = await journalEntrySkill.execute(baseArgs, ctx);
    expect(typeof r.instructions).toBe("string");
    expect(r.instructions.length).toBeGreaterThanOrEqual(50);
  });

  test("instructions explicitly forbids writing to the ledger in v1", async () => {
    const r = await journalEntrySkill.execute(baseArgs, ctx);
    // Trip-wire: when the optional write-path is built, this fails on purpose
    // so the test author MUST decide what the post-write contract should say.
    expect(r.instructions.toLowerCase()).toMatch(/not write|preparation only/);
  });

  test("data is a plain object with the seven expected keys", async () => {
    const r = await journalEntrySkill.execute(baseArgs, ctx);
    expect(isPlainObject(r.data)).toBe(true);
    expect(Object.keys(r.data).sort()).toEqual(
      [
        "kind",
        "entity",
        "period",
        "amount",
        "description",
        "debitAccountCode",
        "creditAccountCode",
      ].sort()
    );
  });

  test("data maps entityId → entity and periodCode → period", async () => {
    const r = await journalEntrySkill.execute(baseArgs, ctx);
    // This rename is the legacy contract the route relies on — protect it.
    expect(r.data.entity).toBe(baseArgs.entityId);
    expect(r.data.period).toBe(baseArgs.periodCode);
    expect(r.data.kind).toBe(baseArgs.kind);
    expect(r.data.amount).toBe(baseArgs.amount);
  });

  test("meta contains skill='journal-entry', kind, and period", async () => {
    const r = await journalEntrySkill.execute(baseArgs, ctx);
    expect(r.meta).toEqual({
      skill: "journal-entry",
      kind: baseArgs.kind,
      period: baseArgs.periodCode,
    });
  });
});

// =========================================================================
// execute() — optional-field defaulting
// =========================================================================

describe("journalEntrySkill.execute — optional fields default to null", () => {
  test("description omitted → null", async () => {
    const r = await journalEntrySkill.execute(baseArgs, ctx);
    expect(r.data.description).toBeNull();
  });

  test("debitAccountCode omitted → null", async () => {
    const r = await journalEntrySkill.execute(baseArgs, ctx);
    expect(r.data.debitAccountCode).toBeNull();
  });

  test("creditAccountCode omitted → null", async () => {
    const r = await journalEntrySkill.execute(baseArgs, ctx);
    expect(r.data.creditAccountCode).toBeNull();
  });

  test("description undefined → null (explicit undefined)", async () => {
    const r = await journalEntrySkill.execute(
      { ...baseArgs, description: undefined },
      ctx
    );
    expect(r.data.description).toBeNull();
  });

  test("description '' (empty string) preserved as '' (NOT coerced to null)", async () => {
    // ?? only nullishes on null/undefined — `""` is a legitimate value the
    // user may have provided. Document that here so a future maintainer
    // doesn't "fix" it to be more aggressive.
    const r = await journalEntrySkill.execute(
      { ...baseArgs, description: "" },
      ctx
    );
    expect(r.data.description).toBe("");
  });

  test("description null → null", async () => {
    const r = await journalEntrySkill.execute(
      { ...baseArgs, description: null },
      ctx
    );
    expect(r.data.description).toBeNull();
  });

  test("debit/credit account codes pass through when supplied", async () => {
    const r = await journalEntrySkill.execute(
      { ...baseArgs, debitAccountCode: "6100", creditAccountCode: "2100" },
      ctx
    );
    expect(r.data.debitAccountCode).toBe("6100");
    expect(r.data.creditAccountCode).toBe("2100");
  });

  test("description string passes through verbatim (no trim/normalize)", async () => {
    const desc = "  Monthly insurance accrual — Q2 \n";
    const r = await journalEntrySkill.execute(
      { ...baseArgs, description: desc },
      ctx
    );
    expect(r.data.description).toBe(desc);
  });
});

// =========================================================================
// execute() — kind variants
// =========================================================================

describe("journalEntrySkill.execute — every documented kind round-trips", () => {
  test.each(VALID_KINDS)("kind=%s passes through in data + meta", async (kind) => {
    const r = await journalEntrySkill.execute({ ...baseArgs, kind }, ctx);
    expect(r.data.kind).toBe(kind);
    expect(r.meta?.kind).toBe(kind);
  });
});

// =========================================================================
// execute() — amount edge cases
// =========================================================================

describe("journalEntrySkill.execute — amount preservation", () => {
  test.each([0, 0.01, 1, 100, 1_000_000, -50])(
    "amount=%p preserved verbatim",
    async (amount) => {
      const r = await journalEntrySkill.execute({ ...baseArgs, amount }, ctx);
      expect(r.data.amount).toBe(amount);
    }
  );

  test("very large amount (≥ Number.MAX_SAFE_INTEGER) preserved", async () => {
    const huge = Number.MAX_SAFE_INTEGER;
    const r = await journalEntrySkill.execute({ ...baseArgs, amount: huge }, ctx);
    expect(r.data.amount).toBe(huge);
  });
});

// =========================================================================
// execute() — purity / no-IO
// =========================================================================

describe("journalEntrySkill.execute — purity", () => {
  test("does NOT call globalThis.fetch (v1 is purely sync data-shaping)", async () => {
    const orig = (globalThis as any).fetch;
    const spy = jest.fn(() => {
      throw new Error("fetch must not be called from journalEntrySkill.execute");
    });
    (globalThis as any).fetch = spy;
    try {
      await journalEntrySkill.execute(baseArgs, ctx);
    } finally {
      (globalThis as any).fetch = orig;
    }
    expect(spy).not.toHaveBeenCalled();
  });

  test("context-independent: different ctx values produce identical result", async () => {
    const r1 = await journalEntrySkill.execute(baseArgs, ctx);
    const r2 = await journalEntrySkill.execute(baseArgs, {
      tenantId: "tnt_OTHER",
      sessionCookie: "session=XXX",
      baseUrl: "https://prod.example.com",
    });
    expect(r1).toEqual(r2);
  });

  test("idempotent: same args produce deep-equal results across calls", async () => {
    const r1 = await journalEntrySkill.execute(baseArgs, ctx);
    const r2 = await journalEntrySkill.execute(baseArgs, ctx);
    expect(r1).toEqual(r2);
  });

  test("each call returns a fresh `data` object (no shared mutable ref)", async () => {
    const r1 = await journalEntrySkill.execute(baseArgs, ctx);
    const r2 = await journalEntrySkill.execute(baseArgs, ctx);
    expect(r1.data).not.toBe(r2.data); // identity differs
    expect(r1.data).toEqual(r2.data); // value matches

    // Mutating the first result's data must not bleed into the second.
    (r1.data as any).kind = "MUTATED";
    expect(r2.data.kind).toBe(baseArgs.kind);
  });

  test("each call returns a fresh `meta` object", async () => {
    const r1 = await journalEntrySkill.execute(baseArgs, ctx);
    const r2 = await journalEntrySkill.execute(baseArgs, ctx);
    expect(r1.meta).not.toBe(r2.meta);
    expect(r1.meta).toEqual(r2.meta);
  });

  test("does not mutate the caller's args object", async () => {
    const args = { ...baseArgs };
    const snapshot = JSON.stringify(args);
    await journalEntrySkill.execute(args, ctx);
    expect(JSON.stringify(args)).toBe(snapshot);
  });

  test("does not mutate the caller's ctx object", async () => {
    const localCtx = { ...ctx };
    const snapshot = JSON.stringify(localCtx);
    await journalEntrySkill.execute(baseArgs, localCtx);
    expect(JSON.stringify(localCtx)).toBe(snapshot);
  });
});

// =========================================================================
// execute() — TypeScript-level contract probes
// =========================================================================

describe("journalEntrySkill.execute — typed contract", () => {
  test("FinanceSkillResult interface keys present", async () => {
    // Compile-time check via property access — if any of these go missing,
    // TS will error before runtime. The runtime asserts are belt+braces.
    const r: FinanceSkillResult = await journalEntrySkill.execute(baseArgs, ctx);
    expect(r.skill_guidance).toBeDefined();
    expect(r.data).toBeDefined();
    expect(r.instructions).toBeDefined();
    expect(r.meta).toBeDefined();
  });
});
