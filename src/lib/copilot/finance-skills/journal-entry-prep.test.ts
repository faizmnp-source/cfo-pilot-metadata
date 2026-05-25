// Unit tests for journalEntryPrepSkill.execute().
//
// Sibling to journalEntrySkill — this one prepares the standard month-end
// CLOSE batch (accruals, prepaid amortization, depreciation schedule,
// payroll, revenue rec, FX revaluation). Unlike journalEntrySkill which is
// purely pass-through, journalEntryPrepSkill performs a single fetch:
//
//   fetch(`${ctx.baseUrl}/api/v2/members/entity?pageSize=200`, { headers })
//
// …to look up the entity's base currency (used to decide whether the FX
// revaluation block is needed). The fetch is wrapped in a try/catch that
// SWALLOWS errors and falls back to entityInfo=null. That swallow path is
// the easiest test case to pin — just stub fetch to throw and assert the
// no-entity fallback shape. We also exercise the happy path with a stubbed
// fetch returning a plausible API envelope.
//
// What this file pins:
//   1. Static surface (name, description, inputSchema, skillPrompt)
//   2. execute() returns FinanceSkillResult with all four required keys
//   3. data carries closePeriod / entityId / entityCode / baseCurrency /
//      requestedKinds / fxNeeded
//   4. meta = { skill: "journal-entry-prep", closePeriod, kindsRequested }
//   5. jeKinds default + parse + trim behavior
//   6. Fetch failure path (entityInfo=null) yields documented fallbacks
//   7. Fetch success path populates entityCode + baseCurrency + fxNeeded
//   8. fxNeeded heuristic: truthy only when baseCcy && baseCcy !== "USD"
//   9. Purity: no caller-arg or ctx mutation, fresh data on each call
//
// Pairs with finance-skills/index.test.ts and journal-entry.test.ts.

import { journalEntryPrepSkill } from "./journal-entry-prep";
import type { FinanceSkillContext, FinanceSkillResult } from "./types";

// --- shared fixtures ---
const ctx: FinanceSkillContext = {
  tenantId: "tnt_test",
  sessionCookie: "session=abc123",
  baseUrl: "http://localhost:3000",
};

const baseArgs = {
  closePeriod: "2026-04",
  entityId: "ent_root",
};

const DEFAULT_KINDS = [
  "accrual",
  "prepaid",
  "depreciation",
  "payroll",
  "revenue",
  "fx",
] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

/** Stub globalThis.fetch for one test, restore after. */
type FetchMock = jest.Mock<Promise<any>, [string, any?]>;
function makeFetchMock(impl: (...args: any[]) => Promise<any>): FetchMock {
  // Cast through unknown — the impl's inferred arity varies (0 or 2 args)
  // but we treat every mock as a [url, init?] tuple at the call-site.
  return jest.fn(impl) as unknown as FetchMock;
}
function withFetch<T>(impl: FetchMock, fn: () => Promise<T>): Promise<T> {
  const orig = (globalThis as any).fetch;
  (globalThis as any).fetch = impl;
  return fn().finally(() => {
    (globalThis as any).fetch = orig;
  });
}

/** Build a fake Response object that resolves to the given JSON body. */
function fakeResponse(body: any): any {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

/** The standard /api/v2/members/entity envelope. */
function entityEnvelope(entities: Array<Record<string, any>>): any {
  return { data: { data: entities } };
}

// =========================================================================
// Static surface
// =========================================================================

describe("journalEntryPrepSkill — static surface", () => {
  test("name is exactly 'prepare_close_je_batch'", () => {
    expect(journalEntryPrepSkill.name).toBe("prepare_close_je_batch");
  });

  test("description is a non-empty string ≥ 50 chars", () => {
    expect(typeof journalEntryPrepSkill.description).toBe("string");
    expect(journalEntryPrepSkill.description.length).toBeGreaterThanOrEqual(50);
  });

  test("description mentions the verbs Copilot routes on", () => {
    // Natural-language router keys off these. If marketing rewording removes
    // them, the match-score drops and the skill stops being invoked.
    const desc = journalEntryPrepSkill.description.toLowerCase();
    expect(desc).toMatch(/month-end|close/);
    expect(desc).toMatch(/accrual|prepaid|depreciation|payroll/);
  });

  test("description enumerates all six standard JE kinds", () => {
    const desc = journalEntryPrepSkill.description.toLowerCase();
    for (const k of DEFAULT_KINDS) {
      expect(desc).toContain(k);
    }
  });

  test("inputSchema is a JSON Schema object with required & properties", () => {
    expect(journalEntryPrepSkill.inputSchema.type).toBe("object");
    expect(isPlainObject(journalEntryPrepSkill.inputSchema.properties)).toBe(
      true
    );
    expect(Array.isArray(journalEntryPrepSkill.inputSchema.required)).toBe(true);
  });

  test("required[] is exactly ['closePeriod','entityId']", () => {
    // Order is pinned because the model sees this list verbatim.
    expect(journalEntryPrepSkill.inputSchema.required).toEqual([
      "closePeriod",
      "entityId",
    ]);
  });

  test("inputSchema declares closePeriod, entityId, jeKinds with type=string", () => {
    const props = journalEntryPrepSkill.inputSchema.properties;
    for (const k of ["closePeriod", "entityId", "jeKinds"]) {
      expect(props[k]).toBeDefined();
      expect(props[k].type).toBe("string");
    }
  });

  test("jeKinds is OPTIONAL — not in required[]", () => {
    expect(journalEntryPrepSkill.inputSchema.required).not.toContain("jeKinds");
  });

  test("jeKinds description mentions all six accepted values", () => {
    const desc = (
      journalEntryPrepSkill.inputSchema.properties.jeKinds.description ?? ""
    ).toLowerCase();
    for (const k of DEFAULT_KINDS) {
      expect(desc).toContain(k);
    }
  });

  test("closePeriod description shows the canonical YYYY-MM format", () => {
    // Format drift here would cascade to every period-coded API call.
    const d = (
      journalEntryPrepSkill.inputSchema.properties.closePeriod.description ?? ""
    );
    expect(d).toMatch(/2026-04|YYYY-MM|period/i);
  });

  test("skillPrompt is a non-empty string opening with a markdown heading", () => {
    expect(typeof journalEntryPrepSkill.skillPrompt).toBe("string");
    expect(journalEntryPrepSkill.skillPrompt.length).toBeGreaterThan(100);
    expect(journalEntryPrepSkill.skillPrompt.startsWith("#")).toBe(true);
  });

  test("skillPrompt covers DR/CR, all six close-cycle JE blocks, and SOX", () => {
    // These are the load-bearing sections of the prompt — content drift here
    // changes Claude's behavior on every close-JE call.
    const sp = journalEntryPrepSkill.skillPrompt;
    expect(sp).toMatch(/DR\b/);
    expect(sp).toMatch(/CR\b/);
    expect(sp).toMatch(/accrual/i);
    expect(sp).toMatch(/prepaid/i);
    expect(sp).toMatch(/depreciation/i);
    expect(sp).toMatch(/payroll/i);
    expect(sp).toMatch(/revenue/i);
    expect(sp).toMatch(/FX|currency/i);
    expect(sp).toMatch(/SOX/i);
  });

  test("execute is an async function with arity 2 (args, ctx)", () => {
    expect(typeof journalEntryPrepSkill.execute).toBe("function");
    expect(journalEntryPrepSkill.execute.length).toBe(2);
  });
});

// =========================================================================
// execute() — result shape (fetch-throws fallback)
// =========================================================================

describe("journalEntryPrepSkill.execute — result shape (fetch-throws path)", () => {
  test("returns a Promise (then-able)", async () => {
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net down"))), async () => {
      const ret = journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(typeof (ret as Promise<unknown>).then).toBe("function");
      await ret;
    });
  });

  test("resolved value is a plain object", async () => {
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(isPlainObject(r)).toBe(true);
    });
  });

  test("has the four FinanceSkillResult keys", async () => {
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(Object.keys(r).sort()).toEqual(
        ["data", "instructions", "meta", "skill_guidance"].sort()
      );
    });
  });

  test("skill_guidance === skill.skillPrompt (no drift)", async () => {
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r.skill_guidance).toBe(journalEntryPrepSkill.skillPrompt);
    });
  });

  test("instructions is a non-empty string ≥ 50 chars", async () => {
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(typeof r.instructions).toBe("string");
      expect(r.instructions.length).toBeGreaterThanOrEqual(50);
    });
  });

  test("instructions invokes the journal-entry-prep lens and SOX reminder", async () => {
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r.instructions.toLowerCase()).toMatch(/journal-entry-prep|lens/);
      // The compliance reminder about second-preparer sign-off MUST close the JE prep.
      expect(r.instructions.toLowerCase()).toMatch(/second-preparer|compliance/);
    });
  });

  test("data is a plain object with the six expected keys", async () => {
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(isPlainObject(r.data)).toBe(true);
      expect(Object.keys(r.data).sort()).toEqual(
        [
          "closePeriod",
          "entityId",
          "entityCode",
          "baseCurrency",
          "requestedKinds",
          "fxNeeded",
        ].sort()
      );
    });
  });

  test("data passes through closePeriod and entityId", async () => {
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r.data.closePeriod).toBe(baseArgs.closePeriod);
      expect(r.data.entityId).toBe(baseArgs.entityId);
    });
  });

  test("fetch swallow yields undefined entityCode + baseCurrency", async () => {
    // Documents the swallow-on-throw fallback. If the swallow is ever
    // removed (e.g. to surface the error), this test fails on purpose.
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r.data.entityCode).toBeUndefined();
      expect(r.data.baseCurrency).toBeUndefined();
    });
  });

  test("fxNeeded is falsy when baseCurrency is missing", async () => {
    // baseCcy is undefined → `undefined && ...` → undefined (falsy)
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r.data.fxNeeded).toBeFalsy();
    });
  });

  test("meta = { skill: 'journal-entry-prep', closePeriod, kindsRequested }", async () => {
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r.meta).toEqual({
        skill: "journal-entry-prep",
        closePeriod: baseArgs.closePeriod,
        kindsRequested: DEFAULT_KINDS.length,
      });
    });
  });
});

// =========================================================================
// execute() — fetch call surface
// =========================================================================

describe("journalEntryPrepSkill.execute — fetch is called correctly", () => {
  test("calls fetch exactly once per invocation", async () => {
    const spy = makeFetchMock(() => Promise.resolve(fakeResponse(entityEnvelope([]))));
    await withFetch(spy, async () => {
      await journalEntryPrepSkill.execute(baseArgs, ctx);
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("calls /api/v2/members/entity with pageSize=200", async () => {
    const spy = makeFetchMock(() => Promise.resolve(fakeResponse(entityEnvelope([]))));
    await withFetch(spy, async () => {
      await journalEntryPrepSkill.execute(baseArgs, ctx);
    });
    const [url] = spy.mock.calls[0];
    expect(typeof url).toBe("string");
    expect(url).toContain("/api/v2/members/entity");
    expect(url).toContain("pageSize=200");
  });

  test("uses ctx.baseUrl as the URL prefix", async () => {
    const spy = makeFetchMock(() => Promise.resolve(fakeResponse(entityEnvelope([]))));
    const localCtx: FinanceSkillContext = {
      ...ctx,
      baseUrl: "https://prod.example.com",
    };
    await withFetch(spy, async () => {
      await journalEntryPrepSkill.execute(baseArgs, localCtx);
    });
    const [url] = spy.mock.calls[0];
    expect(url).toMatch(/^https:\/\/prod\.example\.com\/api\/v2\/members\/entity/);
  });

  test("forwards sessionCookie in the Cookie header", async () => {
    const spy = makeFetchMock(() => Promise.resolve(fakeResponse(entityEnvelope([]))));
    await withFetch(spy, async () => {
      await journalEntryPrepSkill.execute(baseArgs, ctx);
    });
    const [, init] = spy.mock.calls[0];
    expect(init.headers.Cookie).toBe(ctx.sessionCookie);
  });

  test("sends Content-Type: application/json header", async () => {
    const spy = makeFetchMock(() => Promise.resolve(fakeResponse(entityEnvelope([]))));
    await withFetch(spy, async () => {
      await journalEntryPrepSkill.execute(baseArgs, ctx);
    });
    const [, init] = spy.mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("application/json");
  });
});

// =========================================================================
// execute() — fetch success path: entityInfo populated
// =========================================================================

describe("journalEntryPrepSkill.execute — entity found in API response", () => {
  test("populates entityCode from matched member", async () => {
    const entities = [
      { id: "ent_other", memberCode: "OTHER", properties: { base_currency: "USD" } },
      { id: "ent_root", memberCode: "ROOT", properties: { base_currency: "EUR" } },
    ];
    const spy = makeFetchMock(() => Promise.resolve(fakeResponse(entityEnvelope(entities))));
    await withFetch(spy, async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r.data.entityCode).toBe("ROOT");
    });
  });

  test("populates baseCurrency from matched entity properties", async () => {
    const entities = [
      { id: "ent_root", memberCode: "ROOT", properties: { base_currency: "EUR" } },
    ];
    const spy = makeFetchMock(() => Promise.resolve(fakeResponse(entityEnvelope(entities))));
    await withFetch(spy, async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r.data.baseCurrency).toBe("EUR");
    });
  });

  test("fxNeeded === true when baseCurrency !== 'USD'", async () => {
    // Heuristic: non-USD base currency means FX revaluation block applies.
    // If this is ever refined (e.g. per-tenant reporting currency), the
    // expectation here will need to follow.
    const entities = [
      { id: "ent_root", memberCode: "ROOT", properties: { base_currency: "INR" } },
    ];
    const spy = makeFetchMock(() => Promise.resolve(fakeResponse(entityEnvelope(entities))));
    await withFetch(spy, async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r.data.fxNeeded).toBe(true);
    });
  });

  test("fxNeeded === false when baseCurrency === 'USD'", async () => {
    const entities = [
      { id: "ent_root", memberCode: "ROOT", properties: { base_currency: "USD" } },
    ];
    const spy = makeFetchMock(() => Promise.resolve(fakeResponse(entityEnvelope(entities))));
    await withFetch(spy, async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r.data.fxNeeded).toBe(false);
    });
  });

  test("fxNeeded is falsy when entity has no base_currency property", async () => {
    const entities = [
      { id: "ent_root", memberCode: "ROOT", properties: {} },
    ];
    const spy = makeFetchMock(() => Promise.resolve(fakeResponse(entityEnvelope(entities))));
    await withFetch(spy, async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r.data.fxNeeded).toBeFalsy();
      expect(r.data.baseCurrency).toBeUndefined();
    });
  });

  test("entity ID with no match leaves entityCode + baseCurrency undefined", async () => {
    // entities list doesn't include the requested id → find() returns undefined
    const entities = [
      { id: "ent_alpha", memberCode: "ALPHA", properties: { base_currency: "USD" } },
    ];
    const spy = makeFetchMock(() => Promise.resolve(fakeResponse(entityEnvelope(entities))));
    await withFetch(spy, async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r.data.entityCode).toBeUndefined();
      expect(r.data.baseCurrency).toBeUndefined();
      expect(r.data.fxNeeded).toBeFalsy();
    });
  });

  test("empty entities array leaves entityCode + baseCurrency undefined", async () => {
    const spy = makeFetchMock(() => Promise.resolve(fakeResponse(entityEnvelope([]))));
    await withFetch(spy, async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r.data.entityCode).toBeUndefined();
      expect(r.data.baseCurrency).toBeUndefined();
    });
  });

  test("malformed envelope (no .data.data) treated as empty list", async () => {
    // `j?.data?.data ?? []` guards against missing envelope keys
    const spy = makeFetchMock(() => Promise.resolve(fakeResponse({})));
    await withFetch(spy, async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r.data.entityCode).toBeUndefined();
    });
  });

  test("response.json() throwing is swallowed (entityInfo=null fallback)", async () => {
    const badResp: any = {
      ok: true,
      json: async () => {
        throw new Error("bad JSON");
      },
    };
    const spy = makeFetchMock(() => Promise.resolve(badResp));
    await withFetch(spy, async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r.data.entityCode).toBeUndefined();
      expect(r.data.baseCurrency).toBeUndefined();
    });
  });
});

// =========================================================================
// execute() — jeKinds parsing
// =========================================================================

describe("journalEntryPrepSkill.execute — jeKinds defaulting and parsing", () => {
  test("omitted jeKinds → all six default kinds", async () => {
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r.data.requestedKinds).toEqual([...DEFAULT_KINDS]);
    });
  });

  test("omitted jeKinds → meta.kindsRequested === 6", async () => {
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r.meta?.kindsRequested).toBe(6);
    });
  });

  test("subset jeKinds returns only the requested kinds in order", async () => {
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r = await journalEntryPrepSkill.execute(
        { ...baseArgs, jeKinds: "accrual,depreciation" },
        ctx
      );
      expect(r.data.requestedKinds).toEqual(["accrual", "depreciation"]);
      expect(r.meta?.kindsRequested).toBe(2);
    });
  });

  test("single jeKind returns one-element array", async () => {
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r = await journalEntryPrepSkill.execute(
        { ...baseArgs, jeKinds: "fx" },
        ctx
      );
      expect(r.data.requestedKinds).toEqual(["fx"]);
      expect(r.meta?.kindsRequested).toBe(1);
    });
  });

  test("whitespace around comma-separated kinds is trimmed", async () => {
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r = await journalEntryPrepSkill.execute(
        { ...baseArgs, jeKinds: " accrual , prepaid ,depreciation " },
        ctx
      );
      expect(r.data.requestedKinds).toEqual(["accrual", "prepaid", "depreciation"]);
    });
  });

  test("empty string jeKinds yields a single empty-string element (current contract)", async () => {
    // Documents the current behavior: `"".split(",")` → `[""]`, then trim
    // leaves `[""]`. This is not validated as a kind — it just becomes a
    // weird payload. If we ever add validation/coercion, this test will
    // fail and force a deliberate update.
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r = await journalEntryPrepSkill.execute(
        { ...baseArgs, jeKinds: "" },
        ctx
      );
      expect(r.data.requestedKinds).toEqual([""]);
    });
  });

  test("explicit undefined jeKinds → defaults", async () => {
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r = await journalEntryPrepSkill.execute(
        { ...baseArgs, jeKinds: undefined },
        ctx
      );
      expect(r.data.requestedKinds).toEqual([...DEFAULT_KINDS]);
    });
  });

  test("trailing comma yields a trailing empty element", async () => {
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r = await journalEntryPrepSkill.execute(
        { ...baseArgs, jeKinds: "accrual,prepaid," },
        ctx
      );
      expect(r.data.requestedKinds).toEqual(["accrual", "prepaid", ""]);
      expect(r.meta?.kindsRequested).toBe(3);
    });
  });
});

// =========================================================================
// execute() — purity / non-mutation
// =========================================================================

describe("journalEntryPrepSkill.execute — purity", () => {
  test("does not mutate the caller's args object", async () => {
    await withFetch(makeFetchMock(() => Promise.resolve(fakeResponse(entityEnvelope([])))), async () => {
      const args = { ...baseArgs, jeKinds: "accrual,prepaid" };
      const snapshot = JSON.stringify(args);
      await journalEntryPrepSkill.execute(args, ctx);
      expect(JSON.stringify(args)).toBe(snapshot);
    });
  });

  test("does not mutate the caller's ctx object", async () => {
    await withFetch(makeFetchMock(() => Promise.resolve(fakeResponse(entityEnvelope([])))), async () => {
      const localCtx = { ...ctx };
      const snapshot = JSON.stringify(localCtx);
      await journalEntryPrepSkill.execute(baseArgs, localCtx);
      expect(JSON.stringify(localCtx)).toBe(snapshot);
    });
  });

  test("each call returns a fresh data object (no shared mutable ref)", async () => {
    await withFetch(makeFetchMock(() => Promise.resolve(fakeResponse(entityEnvelope([])))), async () => {
      const r1 = await journalEntryPrepSkill.execute(baseArgs, ctx);
      const r2 = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r1.data).not.toBe(r2.data);
      expect(r1.data).toEqual(r2.data);
      // Mutating r1.data does not bleed into r2.
      (r1.data as any).closePeriod = "MUTATED";
      expect(r2.data.closePeriod).toBe(baseArgs.closePeriod);
    });
  });

  test("each call returns a fresh meta object", async () => {
    await withFetch(makeFetchMock(() => Promise.resolve(fakeResponse(entityEnvelope([])))), async () => {
      const r1 = await journalEntryPrepSkill.execute(baseArgs, ctx);
      const r2 = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r1.meta).not.toBe(r2.meta);
      expect(r1.meta).toEqual(r2.meta);
    });
  });

  test("idempotent on the no-entity fallback path", async () => {
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r1 = await journalEntryPrepSkill.execute(baseArgs, ctx);
      const r2 = await journalEntryPrepSkill.execute(baseArgs, ctx);
      expect(r1).toEqual(r2);
    });
  });
});

// =========================================================================
// execute() — typed contract
// =========================================================================

describe("journalEntryPrepSkill.execute — typed contract", () => {
  test("FinanceSkillResult interface keys present", async () => {
    await withFetch(makeFetchMock(() => Promise.reject(new Error("net"))), async () => {
      const r: FinanceSkillResult = await journalEntryPrepSkill.execute(
        baseArgs,
        ctx
      );
      expect(r.skill_guidance).toBeDefined();
      expect(r.data).toBeDefined();
      expect(r.instructions).toBeDefined();
      expect(r.meta).toBeDefined();
    });
  });
});
