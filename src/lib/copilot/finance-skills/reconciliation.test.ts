// Unit tests for reconciliationSkill.execute().
//
// reconciliationSkill is the Copilot wrapper for the finance plugin's
// `reconciliation` skill — it compares a GL account balance against a
// subledger / bank / 3rd-party source and categorizes reconciling items
// (Timing / Error / Missing JE / Missing source / FX / Adjustment /
// Unresolved) with aging buckets and materiality flags.
//
// Unlike variance-analysis (which is ALWAYS dual-fetch via Promise.all),
// reconciliation is a single-fetch skill. It calls:
//
//   GET /api/v2/facts?accountId=…&entityId=…&pageSize=200
//
// Then filters the returned rows in-memory by periodCode (matching
// either `f.time?.memberCode` or `f.timeCode`). The GL balance is
// reduce-summed from `value ?? valueReporting ?? 0` across the filtered
// rows. Optional `sourceData` is passed through verbatim (text the user
// pasted from a bank statement / subledger). The two instructions
// branches diverge on whether sourceData was provided.
//
// What this file pins:
//   1. Static surface — name, description (mentions reconcile / GL /
//      subledger / bank), inputSchema (3 required + 1 optional
//      sourceData; sourceData has no `type` constraint — it's free-form
//      text), skillPrompt (framework table, categorization, aging
//      buckets, materiality, compliance reminder).
//   2. execute() shape — Promise → plain object → 4 keys (data,
//      instructions, meta, skill_guidance); skill_guidance === skillPrompt;
//      data is a specific 6-key shape.
//   3. Single-fetch surface:
//      - exactly one call, regardless of period rows
//      - URL hits /api/v2/facts with accountId, entityId, pageSize=200
//      - periodCode is NOT in the URL (in-memory filter)
//      - sourceData arg is NOT in the URL (passthrough only)
//      - Cookie + Content-Type forwarded
//      - ctx.baseUrl used as prefix
//   4. Period filter:
//      - matches f.time?.memberCode === periodCode
//      - OR matches f.timeCode === periodCode
//      - rows for other periods filtered out
//   5. Envelope coalescing:
//      - rows = j?.data?.data ?? j?.data ?? []
//      - all three branches pinned (nested data, direct data, neither)
//   6. GL balance aggregation:
//      - sum of Number(f.value ?? f.valueReporting ?? 0)
//      - missing value/valueReporting → 0 contribution
//      - prefers `value` over `valueReporting` when both present
//      - Number coercion of strings
//   7. sampleTransactions:
//      - .slice(0, 10) cap on filtered rows
//      - per-row projection: account/entity/value/origin/period
//   8. sourceData passthrough:
//      - present → data.sourceData === args.sourceData verbatim
//      - omitted → data.sourceData === null (?? null)
//   9. Instructions branch on !!args.sourceData:
//      - present → "Apply the reconciliation lens. Compare GL balance to source data…"
//      - absent  → "Show the GL balance + transactions. Tell user no source data…"
//  10. meta — skill literal 'reconciliation', glBalance, glRowCount,
//      hasSource (!! coercion).
//  11. Purity — no caller-arg/ctx mutation, fresh data/meta each call,
//      idempotent on identical inputs.
//
// Pairs with finance-skills/index.test.ts, journal-entry.test.ts,
// journal-entry-prep.test.ts, close-management.test.ts,
// financial-statements.test.ts, and variance-analysis.test.ts. Reuses
// the makeFetchMock/withFetch/fakeResponse helpers verbatim. Single-
// fetch surface so no routedFetchMock needed — one mock per test.

import { reconciliationSkill } from "./reconciliation";
import type { FinanceSkillContext, FinanceSkillResult } from "./types";

// --- shared fixtures -------------------------------------------------------
const ctx: FinanceSkillContext = {
  tenantId: "tnt_test",
  sessionCookie: "session=abc123",
  baseUrl: "http://localhost:3000",
};

const baseArgs = {
  accountId: "acc_cash_001",
  entityId: "ent_us_hq",
  periodCode: "2026-04",
};

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

/** Build a fact row with sensible defaults (matches v2 facts API shape). */
function factRow(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    account: { memberCode: "1010", label: "Cash — Operating" },
    entity: { memberCode: "US_HQ", label: "US HQ" },
    time: { memberCode: "2026-04", label: "Apr 2026" },
    origin: { memberCode: "IMPORT", label: "Import" },
    value: 100,
    valueReporting: 100,
    ...overrides,
  };
}

/**
 * v2 facts API envelope today (pagination wrapper): `{ data: { data: [...] } }`.
 * The skill coalesces `j?.data?.data ?? j?.data ?? []` so we test all three.
 */
function nestedEnvelope(rows: Array<Record<string, any>>): any {
  return { data: { data: rows } };
}
function flatEnvelope(rows: Array<Record<string, any>>): any {
  return { data: rows };
}

/** Convenience: returns a single-fetch mock with the nested envelope shape. */
function singleMock(rows: Array<Record<string, any>>): FetchMock {
  return makeFetchMock(async () => fakeResponse(nestedEnvelope(rows)));
}

// =========================================================================
// Static surface
// =========================================================================

describe("reconciliationSkill — static surface", () => {
  test("name is exactly 'reconcile_account'", () => {
    expect(reconciliationSkill.name).toBe("reconcile_account");
  });

  test("description is a non-empty string ≥ 50 chars", () => {
    expect(typeof reconciliationSkill.description).toBe("string");
    expect(reconciliationSkill.description.length).toBeGreaterThanOrEqual(50);
  });

  test("description mentions the verbs Copilot routes on", () => {
    // Natural-language router keys off these. If marketing rewording
    // removes them, the match-score drops and the skill stops being invoked
    // on "reconcile cash", "bank rec", "GL vs subledger" prompts.
    const desc = reconciliationSkill.description.toLowerCase();
    expect(desc).toMatch(/reconcile|reconciliation|gl|subledger|bank/);
  });

  test("description names the canonical comparison sources", () => {
    // GL vs (subledger / bank / 3rd party) is the canonical use case.
    const desc = reconciliationSkill.description.toLowerCase();
    expect(desc).toMatch(/subledger|bank|3rd-party|3rd party|third-party/);
  });

  test("description names reconciling item categories (Timing/Error/Missing/FX)", () => {
    // The skill claims to categorize items — pin the categories in the
    // description so the model gets primed on them.
    const desc = reconciliationSkill.description.toLowerCase();
    const categories = ["timing", "error", "missing", "fx", "adjustment"];
    const matched = categories.filter((c) => desc.includes(c));
    expect(matched.length).toBeGreaterThanOrEqual(3);
  });

  test("description carries example user phrasings for routing", () => {
    // Quoted example prompts in the description ground the router.
    const desc = reconciliationSkill.description.toLowerCase();
    expect(desc).toMatch(/reconcile cash|reconcile ar|bank rec|gl vs subledger/);
  });

  test("description signals materiality / aging concerns", () => {
    // Reconciliation hinges on flagging material items and aging the
    // open ones — those concerns should appear in the routing surface.
    const desc = reconciliationSkill.description.toLowerCase();
    expect(desc).toMatch(/material|aging|age|flag/);
  });

  test("inputSchema is a JSON Schema object with required & properties", () => {
    expect(reconciliationSkill.inputSchema.type).toBe("object");
    expect(isPlainObject(reconciliationSkill.inputSchema.properties)).toBe(true);
    expect(Array.isArray(reconciliationSkill.inputSchema.required)).toBe(true);
  });

  test("required[] is exactly ['accountId', 'entityId', 'periodCode']", () => {
    // Order matters for the prompt the model sees, so we pin order too.
    // sourceData is OPTIONAL — the skill works without it (returns a
    // "paste your source data" instruction).
    expect(reconciliationSkill.inputSchema.required).toEqual([
      "accountId",
      "entityId",
      "periodCode",
    ]);
  });

  test("sourceData is OPTIONAL — not in required[]", () => {
    expect(reconciliationSkill.inputSchema.required).not.toContain("sourceData");
  });

  test("inputSchema declares all four properties", () => {
    const props = reconciliationSkill.inputSchema.properties;
    expect(props.accountId).toBeDefined();
    expect(props.entityId).toBeDefined();
    expect(props.periodCode).toBeDefined();
    expect(props.sourceData).toBeDefined();
  });

  test("accountId / entityId / periodCode declared as string", () => {
    const props = reconciliationSkill.inputSchema.properties;
    expect(props.accountId.type).toBe("string");
    expect(props.entityId.type).toBe("string");
    expect(props.periodCode.type).toBe("string");
  });

  test("sourceData has NO type constraint (free-form text/object/list)", () => {
    // The source code declares sourceData as { description: "..." } with
    // no type — it's intentionally permissive (text pastes, JSON objects,
    // arrays of rows all flow through). Pinning the absence of a type
    // guards against an accidental tightening that would reject pastes.
    const props = reconciliationSkill.inputSchema.properties;
    expect(props.sourceData.type).toBeUndefined();
  });

  test("accountId description identifies it as an account UUID", () => {
    const d = (
      reconciliationSkill.inputSchema.properties.accountId.description ?? ""
    ).toLowerCase();
    expect(d).toMatch(/account|uuid/);
  });

  test("entityId description identifies it as an entity UUID", () => {
    const d = (
      reconciliationSkill.inputSchema.properties.entityId.description ?? ""
    ).toLowerCase();
    expect(d).toMatch(/entity|uuid/);
  });

  test("periodCode description carries a YYYY-MM hint", () => {
    const d = reconciliationSkill.inputSchema.properties.periodCode.description ?? "";
    // Either an explicit YYYY-MM regex or a sample like 2026-04 should appear.
    expect(d).toMatch(/period|YYYY-MM|\d{4}-\d{2}/);
  });

  test("sourceData description signals optionality / paste hint", () => {
    const d = (
      reconciliationSkill.inputSchema.properties.sourceData.description ?? ""
    ).toLowerCase();
    expect(d).toMatch(/optional|paste|subledger|bank|3rd|text|transactions|balance/);
  });

  test("skillPrompt is a non-empty string opening with a markdown heading", () => {
    expect(typeof reconciliationSkill.skillPrompt).toBe("string");
    expect(reconciliationSkill.skillPrompt.length).toBeGreaterThan(200);
    expect(reconciliationSkill.skillPrompt.startsWith("#")).toBe(true);
  });

  test("skillPrompt carries the framework table sections", () => {
    const sp = reconciliationSkill.skillPrompt.toLowerCase();
    expect(sp).toContain("balance per gl");
    expect(sp).toMatch(/subledger|bank|3rd party/);
    expect(sp).toContain("difference");
    expect(sp).toContain("reconciling items");
    expect(sp).toMatch(/adjusted gl|adjusted balance/);
    expect(sp).toContain("open items");
  });

  test("skillPrompt enumerates the reconciling-item categories", () => {
    const sp = reconciliationSkill.skillPrompt;
    // Categories the source code names verbatim.
    expect(sp).toMatch(/Timing/);
    expect(sp).toMatch(/Error/);
    expect(sp).toMatch(/Missing JE|Missing source/);
    expect(sp).toMatch(/FX|revaluation/);
    expect(sp).toMatch(/Adjustment pending|Adjustment/);
    expect(sp).toMatch(/Unresolved/);
  });

  test("skillPrompt lists the aging buckets (0-30 / 31-60 / 61-90 / 91+)", () => {
    const sp = reconciliationSkill.skillPrompt;
    expect(sp).toMatch(/0-30/);
    expect(sp).toMatch(/31-60/);
    expect(sp).toMatch(/61-90/);
    expect(sp).toMatch(/91/);
  });

  test("skillPrompt calls out the 90-day auto-escalation rule", () => {
    const sp = reconciliationSkill.skillPrompt.toLowerCase();
    expect(sp).toMatch(/90 days|over 90|escalate/);
  });

  test("skillPrompt carries the materiality threshold (1% or ₹500K)", () => {
    const sp = reconciliationSkill.skillPrompt;
    expect(sp).toMatch(/materiality/i);
    expect(sp).toMatch(/1%|500K|500,000/);
  });

  test("skillPrompt ends with a compliance reminder phrase", () => {
    const sp = reconciliationSkill.skillPrompt.toLowerCase();
    expect(sp).toMatch(/compliance reminder|sox|second preparer|review/);
  });

  test("execute is an async function with arity 2 (args, ctx)", () => {
    expect(typeof reconciliationSkill.execute).toBe("function");
    expect(reconciliationSkill.execute.length).toBe(2);
  });
});

// =========================================================================
// execute() — result shape
// =========================================================================

describe("reconciliationSkill.execute — result shape", () => {
  test("returns a Promise (then-able)", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const ret = reconciliationSkill.execute(baseArgs, ctx);
      expect(typeof (ret as Promise<unknown>).then).toBe("function");
      await ret;
    });
  });

  test("resolved value is a plain object", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(isPlainObject(r)).toBe(true);
    });
  });

  test("has the four FinanceSkillResult keys exactly", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(Object.keys(r).sort()).toEqual(
        ["data", "instructions", "meta", "skill_guidance"].sort()
      );
    });
  });

  test("skill_guidance === skill.skillPrompt (no drift)", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.skill_guidance).toBe(reconciliationSkill.skillPrompt);
    });
  });

  test("instructions is a non-empty string ≥ 50 chars", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(typeof r.instructions).toBe("string");
      expect(r.instructions.length).toBeGreaterThanOrEqual(50);
    });
  });

  test("data is a plain object with the documented 6 keys", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(isPlainObject(r.data)).toBe(true);
      expect(Object.keys(r.data).sort()).toEqual(
        [
          "accountId",
          "entityId",
          "periodCode",
          "glBalance",
          "glTransactionCount",
          "sampleTransactions",
          "sourceData",
        ].sort()
      );
    });
  });
});

// =========================================================================
// execute() — single-fetch surface
// =========================================================================

describe("reconciliationSkill.execute — single-fetch surface", () => {
  test("issues exactly one fetch call (always single-fetch — no compare scenario)", async () => {
    const spy = singleMock([factRow()]);
    await withFetch(spy, async () => {
      await reconciliationSkill.execute(baseArgs, ctx);
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("URL targets /api/v2/facts", async () => {
    const spy = singleMock([factRow()]);
    await withFetch(spy, async () => {
      await reconciliationSkill.execute(baseArgs, ctx);
    });
    const [url] = spy.mock.calls[0];
    expect(url).toContain("/api/v2/facts");
  });

  test("URL carries accountId verbatim", async () => {
    const spy = singleMock([factRow()]);
    await withFetch(spy, async () => {
      await reconciliationSkill.execute(baseArgs, ctx);
    });
    const [url] = spy.mock.calls[0];
    expect(url).toContain(`accountId=${baseArgs.accountId}`);
  });

  test("URL carries entityId verbatim", async () => {
    const spy = singleMock([factRow()]);
    await withFetch(spy, async () => {
      await reconciliationSkill.execute(baseArgs, ctx);
    });
    const [url] = spy.mock.calls[0];
    expect(url).toContain(`entityId=${baseArgs.entityId}`);
  });

  test("URL carries pageSize=200 (high cap so filter sees enough rows)", async () => {
    const spy = singleMock([factRow()]);
    await withFetch(spy, async () => {
      await reconciliationSkill.execute(baseArgs, ctx);
    });
    const [url] = spy.mock.calls[0];
    expect(url).toContain("pageSize=200");
  });

  test("URL does NOT carry periodCode (filter is in-memory, not server-side)", async () => {
    // Drift here would change the API contract — the skill expects the
    // server to return all rows for the (account,entity) combo and filter
    // by period locally. If a future refactor moves the filter server-side,
    // every other test in this file would need rewriting.
    const spy = singleMock([factRow()]);
    await withFetch(spy, async () => {
      await reconciliationSkill.execute(baseArgs, ctx);
    });
    const [url] = spy.mock.calls[0];
    expect(url).not.toContain("periodCode");
    expect(url).not.toContain(baseArgs.periodCode);
  });

  test("URL does NOT carry sourceData (passthrough only, never sent to server)", async () => {
    const spy = singleMock([factRow()]);
    await withFetch(spy, async () => {
      await reconciliationSkill.execute(
        { ...baseArgs, sourceData: "Bank balance: 12345.67" },
        ctx
      );
    });
    const [url] = spy.mock.calls[0];
    expect(url).not.toContain("sourceData");
    expect(url).not.toContain("12345");
  });

  test("uses ctx.baseUrl as the URL prefix", async () => {
    const spy = singleMock([factRow()]);
    const localCtx: FinanceSkillContext = {
      ...ctx,
      baseUrl: "https://prod.example.com",
    };
    await withFetch(spy, async () => {
      await reconciliationSkill.execute(baseArgs, localCtx);
    });
    const [url] = spy.mock.calls[0];
    expect(url).toMatch(/^https:\/\/prod\.example\.com\/api\/v2\/facts\?/);
  });

  test("forwards sessionCookie in Cookie header", async () => {
    const spy = singleMock([factRow()]);
    await withFetch(spy, async () => {
      await reconciliationSkill.execute(baseArgs, ctx);
    });
    const [, init] = spy.mock.calls[0];
    expect(init.headers.Cookie).toBe(ctx.sessionCookie);
  });

  test("sends Content-Type: application/json", async () => {
    const spy = singleMock([factRow()]);
    await withFetch(spy, async () => {
      await reconciliationSkill.execute(baseArgs, ctx);
    });
    const [, init] = spy.mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("application/json");
  });
});

// =========================================================================
// execute() — period filter (in-memory)
// =========================================================================

describe("reconciliationSkill.execute — period filter", () => {
  test("matches rows where f.time.memberCode === periodCode", async () => {
    const rows = [
      factRow({ time: { memberCode: "2026-04" } }),
      factRow({ time: { memberCode: "2026-04" } }),
    ];
    await withFetch(singleMock(rows), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.glTransactionCount).toBe(2);
    });
  });

  test("matches rows where f.timeCode === periodCode (top-level fallback)", async () => {
    // Some v2 responses use the flat `timeCode` shape rather than the
    // nested `time.memberCode`. The skill's `||` predicate accepts both.
    const rows = [
      { ...factRow(), time: undefined, timeCode: "2026-04" },
      { ...factRow(), time: undefined, timeCode: "2026-04" },
    ];
    await withFetch(singleMock(rows), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.glTransactionCount).toBe(2);
    });
  });

  test("filters out rows for other periods", async () => {
    const rows = [
      factRow({ time: { memberCode: "2026-04" }, value: 100 }),
      factRow({ time: { memberCode: "2026-03" }, value: 999 }),
      factRow({ time: { memberCode: "2026-05" }, value: 999 }),
      factRow({ time: { memberCode: "2026-04" }, value: 200 }),
    ];
    await withFetch(singleMock(rows), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.glTransactionCount).toBe(2);
      expect(r.data.glBalance).toBe(300);
    });
  });

  test("returns 0 rows / 0 balance when no period matches", async () => {
    const rows = [
      factRow({ time: { memberCode: "2026-03" }, value: 100 }),
      factRow({ time: { memberCode: "2026-05" }, value: 200 }),
    ];
    await withFetch(singleMock(rows), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.glTransactionCount).toBe(0);
      expect(r.data.glBalance).toBe(0);
    });
  });

  test("nested time.memberCode preferred over timeCode when both present", async () => {
    // The `||` predicate short-circuits — if nested matches first, the
    // top-level timeCode is never inspected. We pin this by giving the
    // two fields conflicting periods.
    const rows = [
      factRow({ time: { memberCode: "2026-04" }, timeCode: "2026-99-XYZ" }),
    ];
    await withFetch(singleMock(rows), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.glTransactionCount).toBe(1);
    });
  });

  test("rows with no time AND no timeCode are filtered out", async () => {
    const rows = [
      { account: { memberCode: "1010" }, value: 50 }, // no time, no timeCode
      factRow({ time: { memberCode: "2026-04" } }),
    ];
    await withFetch(singleMock(rows), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.glTransactionCount).toBe(1);
    });
  });
});

// =========================================================================
// execute() — envelope coalescing (j.data.data ?? j.data ?? [])
// =========================================================================

describe("reconciliationSkill.execute — envelope coalescing", () => {
  test("reads rows from nested j.data.data envelope (preferred shape)", async () => {
    const rows = [factRow(), factRow()];
    const spy = makeFetchMock(async () => fakeResponse({ data: { data: rows } }));
    await withFetch(spy, async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.glTransactionCount).toBe(2);
    });
  });

  test("falls back to j.data when j.data.data missing", async () => {
    const rows = [factRow(), factRow(), factRow()];
    const spy = makeFetchMock(async () => fakeResponse({ data: rows }));
    await withFetch(spy, async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.glTransactionCount).toBe(3);
    });
  });

  test("falls back to [] when both j.data.data and j.data missing", async () => {
    const spy = makeFetchMock(async () => fakeResponse({}));
    await withFetch(spy, async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.glTransactionCount).toBe(0);
      expect(r.data.glBalance).toBe(0);
      expect(r.data.sampleTransactions).toEqual([]);
    });
  });

  test("nested data.data === null currently throws (??-chain does NOT unwrap inner null)", async () => {
    // Source coalesces `j?.data?.data ?? j?.data ?? []`. When the API
    // returns `{ data: { data: null } }` (which happens when the v2
    // paginator yields no rows), the chain evaluates to `j.data` (the
    // outer object `{ data: null }`), NOT to `[]`. `.filter()` then
    // throws "filter is not a function".
    //
    // This is a defective branch (defensive parsing should produce an
    // empty array). Pinning it here makes the bug visible AND turns a
    // future hardening pass into an intentional test update rather
    // than a silent contract change. If anyone adds `Array.isArray(...)
    // ?? []` semantics, this test starts failing → swap to
    // `.toBe(0)` and the contract is now defensive.
    const spy = makeFetchMock(async () =>
      fakeResponse({ data: { data: null } })
    );
    await withFetch(spy, async () => {
      await expect(reconciliationSkill.execute(baseArgs, ctx)).rejects.toThrow(
        /filter is not a function/
      );
    });
  });

  test("empty inner array [] is honored (does NOT fall through ??)", async () => {
    // Distinct from the null case: when `j.data.data === []`, the array
    // IS the result. We add an unrelated `j.data === [...]` to make sure
    // the inner empty wins (?? does NOT coalesce on `[]`).
    const spy = makeFetchMock(async () =>
      fakeResponse({ data: { data: [], runs: [factRow(), factRow()] } })
    );
    await withFetch(spy, async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.glTransactionCount).toBe(0);
    });
  });
});

// =========================================================================
// execute() — GL balance aggregation
// =========================================================================

describe("reconciliationSkill.execute — GL balance aggregation", () => {
  test("sums Number(f.value) across all matching rows", async () => {
    const rows = [
      factRow({ value: 100, valueReporting: undefined }),
      factRow({ value: 250, valueReporting: undefined }),
      factRow({ value: -50, valueReporting: undefined }),
    ];
    await withFetch(singleMock(rows), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.glBalance).toBe(300);
    });
  });

  test("falls back to valueReporting when value is missing", async () => {
    const rows = [
      factRow({ value: undefined, valueReporting: 100 }),
      factRow({ value: undefined, valueReporting: 200 }),
    ];
    await withFetch(singleMock(rows), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.glBalance).toBe(300);
    });
  });

  test("prefers value over valueReporting when both present (?? short-circuit)", async () => {
    // `f.value ?? f.valueReporting ?? 0` — `value` wins if defined.
    const rows = [
      factRow({ value: 100, valueReporting: 999 }),
      factRow({ value: 200, valueReporting: 999 }),
    ];
    await withFetch(singleMock(rows), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.glBalance).toBe(300);
    });
  });

  test("treats value === 0 as a real zero (NOT a fallback trigger)", async () => {
    // ?? treats 0 as defined. valueReporting should NOT be consulted.
    const rows = [
      factRow({ value: 0, valueReporting: 999 }),
      factRow({ value: 100, valueReporting: 0 }),
    ];
    await withFetch(singleMock(rows), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.glBalance).toBe(100);
    });
  });

  test("missing value AND valueReporting contributes 0 (?? 0 fallback)", async () => {
    const rows = [
      factRow({ value: undefined, valueReporting: undefined }),
      factRow({ value: 100, valueReporting: undefined }),
    ];
    await withFetch(singleMock(rows), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.glBalance).toBe(100);
    });
  });

  test("coerces string values via Number()", async () => {
    // Decimal serialization from Prisma sometimes comes back as a string
    // (e.g., "1500.00"). The skill uses Number() to coerce — pin this.
    const rows = [
      factRow({ value: "100.50" as any }),
      factRow({ value: "200.25" as any }),
    ];
    await withFetch(singleMock(rows), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.glBalance).toBeCloseTo(300.75, 2);
    });
  });

  test("Number('abc') → NaN, which propagates through reduce (caller-visible)", async () => {
    // We pin the (defective but observable) behavior so future refactors
    // either preserve or explicitly change it. A future hardening pass
    // could add isFinite() — this test would catch that intentional change.
    const rows = [factRow({ value: "abc" as any })];
    await withFetch(singleMock(rows), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(Number.isNaN(r.data.glBalance)).toBe(true);
    });
  });

  test("zero rows → glBalance === 0", async () => {
    await withFetch(singleMock([]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.glBalance).toBe(0);
      expect(r.data.glTransactionCount).toBe(0);
    });
  });
});

// =========================================================================
// execute() — sampleTransactions projection
// =========================================================================

describe("reconciliationSkill.execute — sampleTransactions", () => {
  test("returns an array", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(Array.isArray(r.data.sampleTransactions)).toBe(true);
    });
  });

  test("caps at 10 rows even when filtered set is much larger", async () => {
    // The cap is hardcoded in the source as `.slice(0, 10)`. Drift here
    // would change the Copilot-visible sample window — pin it.
    const rows = Array.from({ length: 25 }, () => factRow());
    await withFetch(singleMock(rows), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.sampleTransactions.length).toBe(10);
      // But glTransactionCount stays accurate to the full filtered set.
      expect(r.data.glTransactionCount).toBe(25);
    });
  });

  test("returns all rows when filtered set is ≤ 10", async () => {
    const rows = Array.from({ length: 3 }, () => factRow());
    await withFetch(singleMock(rows), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.sampleTransactions.length).toBe(3);
    });
  });

  test("each sample row has exactly { account, entity, value, origin, period } keys", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      const sample = r.data.sampleTransactions[0];
      expect(Object.keys(sample).sort()).toEqual(
        ["account", "entity", "value", "origin", "period"].sort()
      );
    });
  });

  test("sample row pulls account.memberCode / entity.memberCode / etc.", async () => {
    const row = factRow({
      account: { memberCode: "1010" },
      entity: { memberCode: "US_HQ" },
      value: 100,
      origin: { memberCode: "IMPORT" },
      time: { memberCode: "2026-04" },
    });
    await withFetch(singleMock([row]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      const s = r.data.sampleTransactions[0];
      expect(s.account).toBe("1010");
      expect(s.entity).toBe("US_HQ");
      expect(s.value).toBe(100);
      expect(s.origin).toBe("IMPORT");
      expect(s.period).toBe("2026-04");
    });
  });

  test("sample value falls back to valueReporting when value missing", async () => {
    const row = factRow({ value: undefined, valueReporting: 250 });
    await withFetch(singleMock([row]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.sampleTransactions[0].value).toBe(250);
    });
  });

  test("sample fields safely undefined when nested objects missing", async () => {
    // The projection uses optional chaining (`f.account?.memberCode`) —
    // a row without `account` should not throw, just yield undefined.
    const row: any = {
      value: 100,
      time: { memberCode: "2026-04" },
    };
    await withFetch(singleMock([row]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      const s = r.data.sampleTransactions[0];
      expect(s.account).toBeUndefined();
      expect(s.entity).toBeUndefined();
      expect(s.origin).toBeUndefined();
      expect(s.period).toBe("2026-04");
      expect(s.value).toBe(100);
    });
  });
});

// =========================================================================
// execute() — sourceData passthrough
// =========================================================================

describe("reconciliationSkill.execute — sourceData", () => {
  test("data.sourceData === args.sourceData verbatim when provided (string)", async () => {
    const src = "Bank balance: 12,500.00\nOutstanding checks: 250.00";
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(
        { ...baseArgs, sourceData: src },
        ctx
      );
      expect(r.data.sourceData).toBe(src);
    });
  });

  test("data.sourceData === null when sourceData omitted", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.sourceData).toBeNull();
    });
  });

  test("data.sourceData === null when sourceData explicitly undefined", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(
        { ...baseArgs, sourceData: undefined },
        ctx
      );
      expect(r.data.sourceData).toBeNull();
    });
  });

  test("data.sourceData preserves explicit empty string (?? does NOT coalesce '')", async () => {
    // ?? only falls through on null/undefined. An empty string is a
    // valid passthrough value — pin it.
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(
        { ...baseArgs, sourceData: "" },
        ctx
      );
      expect(r.data.sourceData).toBe("");
    });
  });

  test("passthrough works for non-string sourceData (object / array)", async () => {
    // The inputSchema lets sourceData be any shape — the skill must not
    // assume it's a string. Pin object + array passthrough.
    const objSource = { balance: 12500, asOf: "2026-04-30" };
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(
        { ...baseArgs, sourceData: objSource as any },
        ctx
      );
      expect(r.data.sourceData).toEqual(objSource);
    });

    const arrSource = [
      { date: "2026-04-30", amount: 100 },
      { date: "2026-04-29", amount: 200 },
    ];
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(
        { ...baseArgs, sourceData: arrSource as any },
        ctx
      );
      expect(r.data.sourceData).toEqual(arrSource);
    });
  });
});

// =========================================================================
// execute() — instructions branch (with/without sourceData)
// =========================================================================

describe("reconciliationSkill.execute — instructions branch", () => {
  test("with sourceData → 'Apply the reconciliation lens' instruction", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(
        { ...baseArgs, sourceData: "Bank: 12500" },
        ctx
      );
      expect(r.instructions.toLowerCase()).toMatch(/apply.*lens|compare gl balance/);
    });
  });

  test("with sourceData → instruction mentions itemizing / categorizing", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(
        { ...baseArgs, sourceData: "Bank: 12500" },
        ctx
      );
      expect(r.instructions.toLowerCase()).toMatch(/itemize|categor/);
    });
  });

  test("with sourceData → instruction mentions aging / materiality / compliance", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(
        { ...baseArgs, sourceData: "Bank: 12500" },
        ctx
      );
      const ins = r.instructions.toLowerCase();
      expect(ins).toMatch(/age|aging/);
      expect(ins).toMatch(/material/);
      expect(ins).toMatch(/compliance|reminder/);
    });
  });

  test("without sourceData → 'no source data was provided' instruction", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.instructions.toLowerCase()).toMatch(/no source data|paste.*bank|paste.*subledger/);
    });
  });

  test("without sourceData → instruction asks user to paste source", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      const ins = r.instructions.toLowerCase();
      expect(ins).toMatch(/paste|provide/);
      expect(ins).toMatch(/bank|subledger|3rd-party|3rd party/);
    });
  });

  test("instructions branch is !!args.sourceData (truthy check, not deep-equal)", async () => {
    // Empty string is falsy → goes to "no source data" branch even though
    // sourceData IS present. Pin this contract.
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(
        { ...baseArgs, sourceData: "" },
        ctx
      );
      expect(r.instructions.toLowerCase()).toMatch(/no source data|paste/);
    });
  });

  test("instructions stable across runs (no random/timestamp content)", async () => {
    let a: string;
    let b: string;
    await withFetch(singleMock([factRow()]), async () => {
      const r1 = await reconciliationSkill.execute(baseArgs, ctx);
      a = r1.instructions;
    });
    await withFetch(singleMock([factRow()]), async () => {
      const r2 = await reconciliationSkill.execute(baseArgs, ctx);
      b = r2.instructions;
    });
    expect(a!).toBe(b!);
  });
});

// =========================================================================
// execute() — meta extraction
// =========================================================================

describe("reconciliationSkill.execute — meta", () => {
  test("meta is a plain object", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(isPlainObject(r.meta!)).toBe(true);
    });
  });

  test("meta.skill === 'reconciliation' literal", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.meta!.skill).toBe("reconciliation");
    });
  });

  test("meta.glBalance === data.glBalance (same value, mirror)", async () => {
    const rows = [factRow({ value: 100 }), factRow({ value: 200 })];
    await withFetch(singleMock(rows), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.meta!.glBalance).toBe(r.data.glBalance);
      expect(r.meta!.glBalance).toBe(300);
    });
  });

  test("meta.glRowCount === filtered row count (NOT raw fetch count)", async () => {
    const rows = [
      factRow({ time: { memberCode: "2026-04" } }),
      factRow({ time: { memberCode: "2026-04" } }),
      factRow({ time: { memberCode: "2026-03" } }), // filtered out
    ];
    await withFetch(singleMock(rows), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.meta!.glRowCount).toBe(2);
    });
  });

  test("meta.hasSource === true when sourceData truthy", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(
        { ...baseArgs, sourceData: "Bank: 12500" },
        ctx
      );
      expect(r.meta!.hasSource).toBe(true);
    });
  });

  test("meta.hasSource === false when sourceData omitted", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.meta!.hasSource).toBe(false);
    });
  });

  test("meta.hasSource === false when sourceData is empty string (!! coercion)", async () => {
    // !! coerces "" → false. Pin this — drift to !== undefined would
    // change the meta output and downstream UI banners.
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(
        { ...baseArgs, sourceData: "" },
        ctx
      );
      expect(r.meta!.hasSource).toBe(false);
    });
  });

  test("meta.hasSource === true for non-empty object sourceData", async () => {
    // Non-empty objects are truthy → hasSource true.
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(
        { ...baseArgs, sourceData: { balance: 12500 } as any },
        ctx
      );
      expect(r.meta!.hasSource).toBe(true);
    });
  });
});

// =========================================================================
// execute() — data passthrough fields
// =========================================================================

describe("reconciliationSkill.execute — data passthrough", () => {
  test("data.accountId === args.accountId", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.accountId).toBe(baseArgs.accountId);
    });
  });

  test("data.entityId === args.entityId", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.entityId).toBe(baseArgs.entityId);
    });
  });

  test("data.periodCode === args.periodCode", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.periodCode).toBe(baseArgs.periodCode);
    });
  });

  test("data.glTransactionCount === filtered row count", async () => {
    const rows = [factRow(), factRow(), factRow()];
    await withFetch(singleMock(rows), async () => {
      const r = await reconciliationSkill.execute(baseArgs, ctx);
      expect(r.data.glTransactionCount).toBe(3);
    });
  });
});

// =========================================================================
// execute() — purity
// =========================================================================

describe("reconciliationSkill.execute — purity", () => {
  test("does NOT mutate caller args (without sourceData)", async () => {
    const argsBefore = { ...baseArgs };
    await withFetch(singleMock([factRow()]), async () => {
      await reconciliationSkill.execute(baseArgs, ctx);
    });
    expect(baseArgs).toEqual(argsBefore);
  });

  test("does NOT mutate caller args (with sourceData)", async () => {
    const src = "Bank: 12500";
    const args = { ...baseArgs, sourceData: src };
    const argsBefore = { ...args };
    await withFetch(singleMock([factRow()]), async () => {
      await reconciliationSkill.execute(args, ctx);
    });
    expect(args).toEqual(argsBefore);
  });

  test("does NOT mutate ctx", async () => {
    const ctxBefore = { ...ctx };
    await withFetch(singleMock([factRow()]), async () => {
      await reconciliationSkill.execute(baseArgs, ctx);
    });
    expect(ctx).toEqual(ctxBefore);
  });

  test("fresh data object per call (mutating r1.data does not bleed into r2)", async () => {
    const rows = [factRow()];
    let r1: FinanceSkillResult;
    let r2: FinanceSkillResult;
    await withFetch(singleMock(rows), async () => {
      r1 = await reconciliationSkill.execute(baseArgs, ctx);
    });
    // Mutate r1.data — should not affect r2.
    (r1!.data as any).poisoned = true;
    (r1!.data.sampleTransactions as any[]).push({ poisoned: true });
    await withFetch(singleMock(rows), async () => {
      r2 = await reconciliationSkill.execute(baseArgs, ctx);
    });
    expect((r2!.data as any).poisoned).toBeUndefined();
    expect(r2!.data.sampleTransactions.length).toBe(1);
  });

  test("fresh meta object per call", async () => {
    let r1: FinanceSkillResult;
    let r2: FinanceSkillResult;
    await withFetch(singleMock([factRow()]), async () => {
      r1 = await reconciliationSkill.execute(baseArgs, ctx);
    });
    (r1!.meta as any).poisoned = true;
    await withFetch(singleMock([factRow()]), async () => {
      r2 = await reconciliationSkill.execute(baseArgs, ctx);
    });
    expect((r2!.meta as any).poisoned).toBeUndefined();
  });

  test("idempotent on identical inputs (no random/state)", async () => {
    const rows = [factRow({ value: 100 }), factRow({ value: 200 })];
    let r1: FinanceSkillResult;
    let r2: FinanceSkillResult;
    await withFetch(singleMock(rows), async () => {
      r1 = await reconciliationSkill.execute(baseArgs, ctx);
    });
    await withFetch(singleMock(rows), async () => {
      r2 = await reconciliationSkill.execute(baseArgs, ctx);
    });
    expect(r1!.data).toEqual(r2!.data);
    expect(r1!.meta).toEqual(r2!.meta);
    expect(r1!.instructions).toBe(r2!.instructions);
    expect(r1!.skill_guidance).toBe(r2!.skill_guidance);
  });

  test("does NOT mutate the API response rows array (no .reverse / .sort)", async () => {
    // Catches future regressions where someone adds an in-place sort.
    const rows = [
      factRow({ time: { memberCode: "2026-04" }, value: 100 }),
      factRow({ time: { memberCode: "2026-04" }, value: 200 }),
      factRow({ time: { memberCode: "2026-04" }, value: 300 }),
    ];
    const rowsBefore = JSON.parse(JSON.stringify(rows));
    const spy = makeFetchMock(async () =>
      fakeResponse({ data: { data: rows } })
    );
    await withFetch(spy, async () => {
      await reconciliationSkill.execute(baseArgs, ctx);
    });
    expect(rows).toEqual(rowsBefore);
  });
});

// =========================================================================
// Typed contract — compile-time interface key check
// =========================================================================

describe("reconciliationSkill — typed FinanceSkillResult contract", () => {
  test("compile-time: result has all FinanceSkillResult keys", async () => {
    await withFetch(singleMock([factRow()]), async () => {
      const r: FinanceSkillResult = await reconciliationSkill.execute(
        baseArgs,
        ctx
      );
      // The destructure below would fail to typecheck if the interface
      // shape changes — runtime assertions are just for completeness.
      const { skill_guidance, data, instructions, meta } = r;
      expect(typeof skill_guidance).toBe("string");
      expect(typeof instructions).toBe("string");
      expect(data).toBeDefined();
      expect(meta).toBeDefined();
    });
  });
});
