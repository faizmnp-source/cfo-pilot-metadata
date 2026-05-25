// Unit tests for financialStatementsSkill.execute().
//
// financialStatementsSkill is the Copilot wrapper for the finance plugin's
// `financial-statements` skill — it produces a CFO-grade IS narrative with
// GAAP presentation, materiality-thresholded variance commentary, and key
// margin metrics. Unlike the prior skills, this one is the first
// MULTI-ENDPOINT skill: it always issues one fetch to
//
//   GET /api/v2/reports/income-statement?scenarioId&entityId&yearCode
//
// and, IF args.compareScenarioId is provided (truthy), a SECOND fetch to
// the same endpoint with the compare scenario substituted. The fetch
// failure path here is NOT swallowed (no try/catch in the source) — a
// thrown fetch propagates. So the test surface differs from
// close-management.test.ts: we always provide good fetch stubs and
// exercise the branching, parsing, and meta-extraction contracts.
//
// What this file pins:
//   1. Static surface — name, description (mentions GAAP/IS/variance/args),
//      inputSchema (3 required + 1 optional, all string), skillPrompt
//      (GAAP order, materiality matrix, variance decomposition, margin
//      lines, anti-patterns, compliance reminder).
//   2. execute() shape — Promise → plain object → 4 keys (data,
//      instructions, meta, skill_guidance); skill_guidance === skillPrompt;
//      data is `{ current, comparison }` ONLY.
//   3. Fetch surface (single-fetch mode):
//      - exactly one call when no compareScenarioId
//      - URL targets /api/v2/reports/income-statement
//      - query string carries scenarioId / entityId / yearCode verbatim
//      - Cookie + Content-Type forwarded
//      - ctx.baseUrl used as prefix
//   4. Fetch surface (dual-fetch mode):
//      - exactly two calls when compareScenarioId present
//      - second URL substitutes compareScenarioId for scenarioId but
//        shares entityId + yearCode
//   5. data.current parsing: `isJson?.data ?? null` — pulls .data, falls
//      back to null on missing / null / {} / undefined.
//   6. data.comparison parsing:
//      - omitted / undefined / "" → null (no second fetch issued)
//      - truthy compareScenarioId → second fetch issued + j2?.data ?? null
//      - second response empty → null
//   7. Instructions branching: single vs dual narratives carry the
//      contract verbs ("comparing" / "current period" / compliance).
//   8. meta — skill literal pinned, entityCode/scenarioCode/yearCode/
//      rowsRead pulled from `current?.meta?.*` chain, hasComparison
//      is `!!comparison` (boolean coercion).
//   9. Purity — no caller-arg/ctx mutation, fresh data/meta each call,
//      idempotent on identical inputs.
//
// Pairs with finance-skills/index.test.ts, journal-entry.test.ts,
// journal-entry-prep.test.ts, and close-management.test.ts. Extends the
// makeFetchMock helper with a `routedFetchMock` variant that switches
// per-call by inspecting the first call argument (URL).

import { financialStatementsSkill } from "./financial-statements";
import type { FinanceSkillContext, FinanceSkillResult } from "./types";

// --- shared fixtures -------------------------------------------------------
const ctx: FinanceSkillContext = {
  tenantId: "tnt_test",
  sessionCookie: "session=abc123",
  baseUrl: "http://localhost:3000",
};

const baseArgs = {
  scenarioId: "scn_actual",
  entityId: "ent_grp",
  yearCode: "FY2026",
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

/** Sample IS data envelope: `{ data: { ... } }`. */
function isEnvelope(payload: Record<string, any> | null): any {
  return { data: payload };
}

/**
 * Route fetch calls by URL pattern. Each rule's `match(url)` is called in
 * order; the first match wins. Anything unmatched throws (so tests fail
 * loudly when the skill calls an endpoint we didn't stub).
 */
type Route = { match: (url: string) => boolean; respond: any };
function routedFetchMock(routes: Route[]): FetchMock {
  return makeFetchMock((url: string) => {
    for (const r of routes) {
      if (r.match(url)) return Promise.resolve(r.respond);
    }
    return Promise.reject(new Error(`unrouted fetch: ${url}`));
  });
}

// Common sample IS payload — mimics what /api/v2/reports/income-statement
// returns in production (just the keys the skill consumes from .meta).
const currentPayload = {
  sections: [
    { code: "OPREV", label: "Operating Revenue", total: 1_200_000 },
  ],
  meta: {
    entityCode: "US_HQ",
    scenarioCode: "ACTUAL",
    yearCode: "FY2026",
    rowsRead: 7297,
  },
};

const comparePayload = {
  sections: [
    { code: "OPREV", label: "Operating Revenue", total: 1_000_000 },
  ],
  meta: {
    entityCode: "US_HQ",
    scenarioCode: "BUDGET",
    yearCode: "FY2026",
    rowsRead: 4001,
  },
};

// =========================================================================
// Static surface
// =========================================================================

describe("financialStatementsSkill — static surface", () => {
  test("name is exactly 'analyze_income_statement'", () => {
    expect(financialStatementsSkill.name).toBe("analyze_income_statement");
  });

  test("description is a non-empty string ≥ 50 chars", () => {
    expect(typeof financialStatementsSkill.description).toBe("string");
    expect(financialStatementsSkill.description.length).toBeGreaterThanOrEqual(
      50
    );
  });

  test("description mentions the verbs Copilot routes on", () => {
    // Natural-language router keys off these. If marketing rewording removes
    // them, the match-score drops and the skill stops being invoked.
    const desc = financialStatementsSkill.description.toLowerCase();
    expect(desc).toMatch(/analyze|income statement|financial statement|md&a|flux/);
  });

  test("description mentions GAAP / materiality / variance lens", () => {
    const desc = financialStatementsSkill.description.toLowerCase();
    expect(desc).toMatch(/gaap/);
    expect(desc).toMatch(/materiality|variance|margin/);
  });

  test("description enumerates the canonical args (scenarioId / entityId / yearCode)", () => {
    const desc = financialStatementsSkill.description;
    expect(desc).toMatch(/scenarioId/);
    expect(desc).toMatch(/entityId/);
    expect(desc).toMatch(/yearCode/);
  });

  test("description names the optional compareScenarioId arg", () => {
    // Drift here breaks budget/forecast/prior-actual comparison routing.
    expect(financialStatementsSkill.description).toMatch(/compareScenarioId/);
  });

  test("description hints how to resolve scenarioId/entityId first", () => {
    // The skill description tells Claude to resolve via list_scenarios /
    // list_entities before invoking. If this hint dies, Claude will start
    // sending free-form names and every call will 404.
    const desc = financialStatementsSkill.description.toLowerCase();
    expect(desc).toMatch(/list_scenarios|list_entities|resolve/);
  });

  test("inputSchema is a JSON Schema object with required & properties", () => {
    expect(financialStatementsSkill.inputSchema.type).toBe("object");
    expect(
      isPlainObject(financialStatementsSkill.inputSchema.properties)
    ).toBe(true);
    expect(Array.isArray(financialStatementsSkill.inputSchema.required)).toBe(
      true
    );
  });

  test("required[] is exactly ['scenarioId', 'entityId', 'yearCode']", () => {
    expect(financialStatementsSkill.inputSchema.required).toEqual([
      "scenarioId",
      "entityId",
      "yearCode",
    ]);
  });

  test("compareScenarioId is OPTIONAL — not in required[]", () => {
    expect(financialStatementsSkill.inputSchema.required).not.toContain(
      "compareScenarioId"
    );
  });

  test("inputSchema declares all four properties as strings", () => {
    const props = financialStatementsSkill.inputSchema.properties;
    expect(props.scenarioId?.type).toBe("string");
    expect(props.entityId?.type).toBe("string");
    expect(props.yearCode?.type).toBe("string");
    expect(props.compareScenarioId?.type).toBe("string");
  });

  test("scenarioId description names ACTUAL as the canonical default", () => {
    const d = (financialStatementsSkill.inputSchema.properties.scenarioId
      .description ?? "").toUpperCase();
    expect(d).toMatch(/ACTUAL|SCENARIO|UUID/);
  });

  test("entityId description hints at GRP / consolidated", () => {
    const d = (financialStatementsSkill.inputSchema.properties.entityId
      .description ?? "").toLowerCase();
    expect(d).toMatch(/grp|consolidated|entity/);
  });

  test("yearCode description carries an FY example", () => {
    const d = financialStatementsSkill.inputSchema.properties.yearCode
      .description ?? "";
    expect(d).toMatch(/FY|year/i);
  });

  test("compareScenarioId description signals it is optional / comparison-only", () => {
    const d = (financialStatementsSkill.inputSchema.properties
      .compareScenarioId.description ?? "").toLowerCase();
    expect(d).toMatch(/optional|comparison|compare|budget|forecast|prior/);
  });

  test("skillPrompt is a non-empty string opening with a markdown heading", () => {
    expect(typeof financialStatementsSkill.skillPrompt).toBe("string");
    expect(financialStatementsSkill.skillPrompt.length).toBeGreaterThan(200);
    expect(financialStatementsSkill.skillPrompt.startsWith("#")).toBe(true);
  });

  test("skillPrompt enumerates the standard GAAP IS order", () => {
    // The five canonical lines. Drift here changes the report layout
    // Claude produces on every invocation.
    const sp = financialStatementsSkill.skillPrompt;
    for (const line of [
      "Revenue",
      "COGS",
      "Gross Profit",
      "Operating Income",
      "Net Income",
    ]) {
      expect(sp).toContain(line);
    }
  });

  test("skillPrompt carries the materiality matrix ($/% thresholds)", () => {
    const sp = financialStatementsSkill.skillPrompt;
    expect(sp).toMatch(/materiality/i);
    // Either or both threshold notations should appear.
    expect(sp).toMatch(/\$500K|5%|\$100K|10%|\$50K|15%/);
  });

  test("skillPrompt walks the variance-decomposition driver categories", () => {
    const sp = financialStatementsSkill.skillPrompt.toLowerCase();
    for (const driver of ["volume", "rate", "mix", "timing", "fx"]) {
      expect(sp).toContain(driver);
    }
  });

  test("skillPrompt requires margin metrics in the summary", () => {
    const sp = financialStatementsSkill.skillPrompt.toLowerCase();
    expect(sp).toMatch(/gross margin/);
    expect(sp).toMatch(/operating margin/);
    expect(sp).toMatch(/net margin/);
  });

  test("skillPrompt calls out anti-patterns to avoid", () => {
    const sp = financialStatementsSkill.skillPrompt.toLowerCase();
    expect(sp).toMatch(/anti-pattern|circular|vague|generic/);
  });

  test("skillPrompt ends with a compliance reminder phrase", () => {
    const sp = financialStatementsSkill.skillPrompt.toLowerCase();
    expect(sp).toMatch(/compliance reminder|management discussion|qualified financial/);
  });

  test("execute is an async function with arity 2 (args, ctx)", () => {
    expect(typeof financialStatementsSkill.execute).toBe("function");
    expect(financialStatementsSkill.execute.length).toBe(2);
  });
});

// =========================================================================
// execute() — result shape
// =========================================================================

describe("financialStatementsSkill.execute — result shape", () => {
  test("returns a Promise (then-able)", async () => {
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const ret = financialStatementsSkill.execute(baseArgs, ctx);
        expect(typeof (ret as Promise<unknown>).then).toBe("function");
        await ret;
      }
    );
  });

  test("resolved value is a plain object", async () => {
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(isPlainObject(r)).toBe(true);
      }
    );
  });

  test("has the four FinanceSkillResult keys exactly", async () => {
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(Object.keys(r).sort()).toEqual(
          ["data", "instructions", "meta", "skill_guidance"].sort()
        );
      }
    );
  });

  test("skill_guidance === skill.skillPrompt (no drift)", async () => {
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(r.skill_guidance).toBe(financialStatementsSkill.skillPrompt);
      }
    );
  });

  test("instructions is a non-empty string ≥ 50 chars", async () => {
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(typeof r.instructions).toBe("string");
        expect(r.instructions.length).toBeGreaterThanOrEqual(50);
      }
    );
  });

  test("data is a plain object with exactly { current, comparison } keys", async () => {
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(isPlainObject(r.data)).toBe(true);
        expect(Object.keys(r.data).sort()).toEqual(
          ["comparison", "current"].sort()
        );
      }
    );
  });
});

// =========================================================================
// execute() — fetch surface (single-fetch mode, no compareScenarioId)
// =========================================================================

describe("financialStatementsSkill.execute — single-fetch mode", () => {
  test("calls fetch exactly once when compareScenarioId omitted", async () => {
    const spy = routedFetchMock([
      { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
    ]);
    await withFetch(spy, async () => {
      await financialStatementsSkill.execute(baseArgs, ctx);
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("targets /api/v2/reports/income-statement", async () => {
    const spy = routedFetchMock([
      { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
    ]);
    await withFetch(spy, async () => {
      await financialStatementsSkill.execute(baseArgs, ctx);
    });
    const [url] = spy.mock.calls[0];
    expect(typeof url).toBe("string");
    expect(url).toContain("/api/v2/reports/income-statement");
  });

  test("query string carries scenarioId, entityId, yearCode verbatim", async () => {
    const spy = routedFetchMock([
      { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
    ]);
    await withFetch(spy, async () => {
      await financialStatementsSkill.execute(baseArgs, ctx);
    });
    const [url] = spy.mock.calls[0];
    expect(url).toContain(`scenarioId=${baseArgs.scenarioId}`);
    expect(url).toContain(`entityId=${baseArgs.entityId}`);
    expect(url).toContain(`yearCode=${baseArgs.yearCode}`);
  });

  test("uses ctx.baseUrl as the URL prefix", async () => {
    const spy = routedFetchMock([
      { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
    ]);
    const localCtx: FinanceSkillContext = {
      ...ctx,
      baseUrl: "https://prod.example.com",
    };
    await withFetch(spy, async () => {
      await financialStatementsSkill.execute(baseArgs, localCtx);
    });
    const [url] = spy.mock.calls[0];
    expect(url).toMatch(
      /^https:\/\/prod\.example\.com\/api\/v2\/reports\/income-statement\?/
    );
  });

  test("forwards sessionCookie in the Cookie header", async () => {
    const spy = routedFetchMock([
      { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
    ]);
    await withFetch(spy, async () => {
      await financialStatementsSkill.execute(baseArgs, ctx);
    });
    const [, init] = spy.mock.calls[0];
    expect(init.headers.Cookie).toBe(ctx.sessionCookie);
  });

  test("sends Content-Type: application/json header", async () => {
    const spy = routedFetchMock([
      { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
    ]);
    await withFetch(spy, async () => {
      await financialStatementsSkill.execute(baseArgs, ctx);
    });
    const [, init] = spy.mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("application/json");
  });
});

// =========================================================================
// execute() — fetch surface (dual-fetch mode, compareScenarioId provided)
// =========================================================================

describe("financialStatementsSkill.execute — dual-fetch mode", () => {
  test("calls fetch exactly twice when compareScenarioId is provided", async () => {
    const spy = routedFetchMock([
      {
        match: (u) => u.includes("scn_actual"),
        respond: fakeResponse(isEnvelope(currentPayload)),
      },
      {
        match: (u) => u.includes("scn_budget"),
        respond: fakeResponse(isEnvelope(comparePayload)),
      },
    ]);
    await withFetch(spy, async () => {
      await financialStatementsSkill.execute(
        { ...baseArgs, compareScenarioId: "scn_budget" },
        ctx
      );
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test("first call uses primary scenarioId; second uses compareScenarioId", async () => {
    const spy = routedFetchMock([
      {
        match: (u) => u.includes("scn_actual"),
        respond: fakeResponse(isEnvelope(currentPayload)),
      },
      {
        match: (u) => u.includes("scn_budget"),
        respond: fakeResponse(isEnvelope(comparePayload)),
      },
    ]);
    await withFetch(spy, async () => {
      await financialStatementsSkill.execute(
        { ...baseArgs, compareScenarioId: "scn_budget" },
        ctx
      );
    });
    const [firstUrl] = spy.mock.calls[0];
    const [secondUrl] = spy.mock.calls[1];
    expect(firstUrl).toContain(`scenarioId=${baseArgs.scenarioId}`);
    expect(firstUrl).not.toContain("scn_budget");
    expect(secondUrl).toContain("scenarioId=scn_budget");
    expect(secondUrl).not.toContain(`scenarioId=${baseArgs.scenarioId}`);
  });

  test("both calls share entityId + yearCode in the query string", async () => {
    const spy = routedFetchMock([
      {
        match: (u) => u.includes("scn_actual"),
        respond: fakeResponse(isEnvelope(currentPayload)),
      },
      {
        match: (u) => u.includes("scn_budget"),
        respond: fakeResponse(isEnvelope(comparePayload)),
      },
    ]);
    await withFetch(spy, async () => {
      await financialStatementsSkill.execute(
        { ...baseArgs, compareScenarioId: "scn_budget" },
        ctx
      );
    });
    for (const [url] of spy.mock.calls) {
      expect(url).toContain(`entityId=${baseArgs.entityId}`);
      expect(url).toContain(`yearCode=${baseArgs.yearCode}`);
    }
  });

  test("both calls forward Cookie + Content-Type identically", async () => {
    const spy = routedFetchMock([
      {
        match: (u) => u.includes("scn_actual"),
        respond: fakeResponse(isEnvelope(currentPayload)),
      },
      {
        match: (u) => u.includes("scn_budget"),
        respond: fakeResponse(isEnvelope(comparePayload)),
      },
    ]);
    await withFetch(spy, async () => {
      await financialStatementsSkill.execute(
        { ...baseArgs, compareScenarioId: "scn_budget" },
        ctx
      );
    });
    for (const [, init] of spy.mock.calls) {
      expect(init.headers.Cookie).toBe(ctx.sessionCookie);
      expect(init.headers["Content-Type"]).toBe("application/json");
    }
  });
});

// =========================================================================
// execute() — data.current parsing
// =========================================================================

describe("financialStatementsSkill.execute — data.current parsing", () => {
  test("data.current === isJson.data when envelope is well-formed", async () => {
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(r.data.current).toEqual(currentPayload);
      }
    );
  });

  test("data.current === null when response has no .data key", async () => {
    // Pins `isJson?.data ?? null` — missing key → null.
    await withFetch(
      routedFetchMock([{ match: () => true, respond: fakeResponse({}) }]),
      async () => {
        const r = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(r.data.current).toBeNull();
      }
    );
  });

  test("data.current === null when response is null", async () => {
    // The skill uses optional chaining; null body must not throw.
    await withFetch(
      routedFetchMock([{ match: () => true, respond: fakeResponse(null) }]),
      async () => {
        const r = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(r.data.current).toBeNull();
      }
    );
  });

  test("data.current === null when response.data is explicitly null", async () => {
    // `{ data: null }` triggers the `?? null` fallback (null is nullish).
    await withFetch(
      routedFetchMock([{ match: () => true, respond: fakeResponse({ data: null }) }]),
      async () => {
        const r = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(r.data.current).toBeNull();
      }
    );
  });

  test("data.current === '' (empty string) is preserved (not nullish)", async () => {
    // Defensive: `?? null` should NOT default a non-nullish value like "".
    await withFetch(
      routedFetchMock([{ match: () => true, respond: fakeResponse({ data: "" }) }]),
      async () => {
        const r = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(r.data.current).toBe("");
      }
    );
  });
});

// =========================================================================
// execute() — data.comparison parsing
// =========================================================================

describe("financialStatementsSkill.execute — data.comparison parsing", () => {
  test("data.comparison === null when compareScenarioId omitted", async () => {
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(r.data.comparison).toBeNull();
      }
    );
  });

  test("data.comparison === null when compareScenarioId is undefined", async () => {
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(
          { ...baseArgs, compareScenarioId: undefined },
          ctx
        );
        expect(r.data.comparison).toBeNull();
      }
    );
  });

  test("data.comparison === null when compareScenarioId is empty string", async () => {
    // The source uses `if (args.compareScenarioId)` — empty string is
    // falsy, so the second fetch is skipped. Documents the current
    // truthy-check contract.
    const spy = routedFetchMock([
      {
        match: (u) => u.includes("scn_actual"),
        respond: fakeResponse(isEnvelope(currentPayload)),
      },
    ]);
    await withFetch(spy, async () => {
      const r = await financialStatementsSkill.execute(
        { ...baseArgs, compareScenarioId: "" },
        ctx
      );
      expect(r.data.comparison).toBeNull();
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  test("data.comparison populated from j2.data when compareScenarioId truthy", async () => {
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope(currentPayload)),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(isEnvelope(comparePayload)),
        },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(
          { ...baseArgs, compareScenarioId: "scn_budget" },
          ctx
        );
        expect(r.data.comparison).toEqual(comparePayload);
      }
    );
  });

  test("data.comparison === null when second response has no .data", async () => {
    // Mirror of the current `j2?.data ?? null` chain on the second fetch.
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope(currentPayload)),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse({}),
        },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(
          { ...baseArgs, compareScenarioId: "scn_budget" },
          ctx
        );
        expect(r.data.comparison).toBeNull();
      }
    );
  });

  test("data.comparison === null when second response is null", async () => {
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope(currentPayload)),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(null),
        },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(
          { ...baseArgs, compareScenarioId: "scn_budget" },
          ctx
        );
        expect(r.data.comparison).toBeNull();
      }
    );
  });
});

// =========================================================================
// execute() — instructions branching
// =========================================================================

describe("financialStatementsSkill.execute — instructions branching", () => {
  test("no-comparison instructions name current-period framing", async () => {
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(baseArgs, ctx);
        const ins = r.instructions.toLowerCase();
        expect(ins).toMatch(/current period|commentary/);
        expect(ins).toMatch(/compliance|reminder/);
      }
    );
  });

  test("no-comparison instructions hint user to provide compareScenarioId", async () => {
    // If the user asks "vs budget" without picking the scenario, Claude
    // should ask for it. The skill instructions encode that nudge.
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(r.instructions).toMatch(/compareScenarioId/);
      }
    );
  });

  test("with-comparison instructions name the comparison framing", async () => {
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope(currentPayload)),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(isEnvelope(comparePayload)),
        },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(
          { ...baseArgs, compareScenarioId: "scn_budget" },
          ctx
        );
        const ins = r.instructions.toLowerCase();
        expect(ins).toMatch(/comparing|comparison/);
        expect(ins).toMatch(/materiality/);
        expect(ins).toMatch(/decompose|variance/);
        expect(ins).toMatch(/margin/);
        expect(ins).toMatch(/compliance|reminder/);
      }
    );
  });

  test("with-comparison instructions do NOT hint compareScenarioId prompt", async () => {
    // The compare-mode instructions don't ask for compareScenarioId again
    // (we already have it). Pins the branch boundary.
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope(currentPayload)),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(isEnvelope(comparePayload)),
        },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(
          { ...baseArgs, compareScenarioId: "scn_budget" },
          ctx
        );
        expect(r.instructions).not.toMatch(/provide a compareScenarioId/i);
      }
    );
  });
});

// =========================================================================
// execute() — meta extraction
// =========================================================================

describe("financialStatementsSkill.execute — meta extraction", () => {
  test("meta.skill is the literal 'financial-statements'", async () => {
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(r.meta?.skill).toBe("financial-statements");
      }
    );
  });

  test("meta.entityCode / scenarioCode / yearCode / rowsRead pulled from current.meta", async () => {
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(r.meta?.entityCode).toBe(currentPayload.meta.entityCode);
        expect(r.meta?.scenarioCode).toBe(currentPayload.meta.scenarioCode);
        expect(r.meta?.yearCode).toBe(currentPayload.meta.yearCode);
        expect(r.meta?.rowsRead).toBe(currentPayload.meta.rowsRead);
      }
    );
  });

  test("meta.hasComparison === false when no compareScenarioId", async () => {
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(r.meta?.hasComparison).toBe(false);
      }
    );
  });

  test("meta.hasComparison === true when comparison payload returned", async () => {
    // `!!comparison` — non-null comparison object coerces to true.
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope(currentPayload)),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(isEnvelope(comparePayload)),
        },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(
          { ...baseArgs, compareScenarioId: "scn_budget" },
          ctx
        );
        expect(r.meta?.hasComparison).toBe(true);
      }
    );
  });

  test("meta.hasComparison === false when second fetch returned null payload", async () => {
    // Even though compareScenarioId was provided, the API returned no
    // data → comparison resolves to null → !!null === false.
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope(currentPayload)),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse({ data: null }),
        },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(
          { ...baseArgs, compareScenarioId: "scn_budget" },
          ctx
        );
        expect(r.meta?.hasComparison).toBe(false);
      }
    );
  });

  test("meta still has skill + hasComparison when current.meta is missing", async () => {
    // current may have sections but no meta. The optional-chaining must
    // not throw, and the constant fields stay.
    await withFetch(
      routedFetchMock([
        {
          match: () => true,
          respond: fakeResponse(isEnvelope({ sections: [] })),
        },
      ]),
      async () => {
        const r = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(r.meta?.skill).toBe("financial-statements");
        expect(r.meta?.hasComparison).toBe(false);
        expect(r.meta?.entityCode).toBeUndefined();
        expect(r.meta?.scenarioCode).toBeUndefined();
        expect(r.meta?.yearCode).toBeUndefined();
        expect(r.meta?.rowsRead).toBeUndefined();
      }
    );
  });

  test("meta still has skill + hasComparison when current is null entirely", async () => {
    // The whole `current` may be null (empty response body, no data
    // envelope). Optional chaining must not throw.
    await withFetch(
      routedFetchMock([{ match: () => true, respond: fakeResponse(null) }]),
      async () => {
        const r = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(r.meta?.skill).toBe("financial-statements");
        expect(r.meta?.hasComparison).toBe(false);
        expect(r.meta?.entityCode).toBeUndefined();
      }
    );
  });
});

// =========================================================================
// execute() — purity / non-mutation
// =========================================================================

describe("financialStatementsSkill.execute — purity", () => {
  test("does not mutate the caller's args object (single mode)", async () => {
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const args = { ...baseArgs };
        const snapshot = JSON.stringify(args);
        await financialStatementsSkill.execute(args, ctx);
        expect(JSON.stringify(args)).toBe(snapshot);
      }
    );
  });

  test("does not mutate the caller's args object (dual mode)", async () => {
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope(currentPayload)),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(isEnvelope(comparePayload)),
        },
      ]),
      async () => {
        const args = { ...baseArgs, compareScenarioId: "scn_budget" };
        const snapshot = JSON.stringify(args);
        await financialStatementsSkill.execute(args, ctx);
        expect(JSON.stringify(args)).toBe(snapshot);
      }
    );
  });

  test("does not mutate the caller's ctx object", async () => {
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const localCtx = { ...ctx };
        const snapshot = JSON.stringify(localCtx);
        await financialStatementsSkill.execute(baseArgs, localCtx);
        expect(JSON.stringify(localCtx)).toBe(snapshot);
      }
    );
  });

  test("each call returns a fresh data object (no shared mutable ref)", async () => {
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const r1 = await financialStatementsSkill.execute(baseArgs, ctx);
        const r2 = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(r1.data).not.toBe(r2.data);
        expect(r1.data).toEqual(r2.data);
        // Mutating r1.data does not bleed into r2.
        (r1.data as any).current = { mutated: true };
        expect((r2.data as any).current).not.toEqual({ mutated: true });
      }
    );
  });

  test("each call returns a fresh meta object", async () => {
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const r1 = await financialStatementsSkill.execute(baseArgs, ctx);
        const r2 = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(r1.meta).not.toBe(r2.meta);
        expect(r1.meta).toEqual(r2.meta);
      }
    );
  });

  test("idempotent on identical inputs (single mode)", async () => {
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const r1 = await financialStatementsSkill.execute(baseArgs, ctx);
        const r2 = await financialStatementsSkill.execute(baseArgs, ctx);
        expect(r1).toEqual(r2);
      }
    );
  });

  test("idempotent on identical inputs (dual mode)", async () => {
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope(currentPayload)),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(isEnvelope(comparePayload)),
        },
      ]),
      async () => {
        const a = { ...baseArgs, compareScenarioId: "scn_budget" };
        const r1 = await financialStatementsSkill.execute(a, ctx);
        const r2 = await financialStatementsSkill.execute(a, ctx);
        expect(r1).toEqual(r2);
      }
    );
  });
});

// =========================================================================
// execute() — typed contract
// =========================================================================

describe("financialStatementsSkill.execute — typed contract", () => {
  test("FinanceSkillResult interface keys present", async () => {
    await withFetch(
      routedFetchMock([
        { match: () => true, respond: fakeResponse(isEnvelope(currentPayload)) },
      ]),
      async () => {
        const r: FinanceSkillResult =
          await financialStatementsSkill.execute(baseArgs, ctx);
        expect(r.skill_guidance).toBeDefined();
        expect(r.data).toBeDefined();
        expect(r.instructions).toBeDefined();
        expect(r.meta).toBeDefined();
      }
    );
  });
});
