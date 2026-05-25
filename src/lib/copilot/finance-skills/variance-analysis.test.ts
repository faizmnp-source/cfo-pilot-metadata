// Unit tests for varianceAnalysisSkill.execute().
//
// varianceAnalysisSkill is the Copilot wrapper for the finance plugin's
// `variance-analysis` skill — it decomposes financial variances into
// Price/Volume/Mix/Headcount/Rate/Timing/FX drivers and produces narrative
// that would survive scrutiny in a board meeting.
//
// Unlike financialStatementsSkill (which can run in single OR dual fetch
// mode), this one is ALWAYS dual-fetch: `compareScenarioId` is REQUIRED.
// Both fetches go to:
//
//   GET /api/v2/reports/income-statement?scenarioId&entityId&yearCode
//
// They are issued in PARALLEL via Promise.all (not sequential). After both
// resolve, the skill builds a per-line-item variance table by walking
// `rpt.sections[].lines[]`, summing `value` by `code`, and computing
// `{ code, current, comparison, diff, pct }` for the union of all codes
// from both reports.
//
// What this file pins:
//   1. Static surface — name, description (mentions decomposition / drivers
//      / canonical 4 required args), inputSchema (4 required + 1 optional
//      lineItem, all string), skillPrompt (materiality triggers, Volume/
//      Price/Mix framework, headcount/rate framework, investigation
//      priority, anti-patterns, compliance reminder).
//   2. execute() shape — Promise → plain object → 4 keys (data,
//      instructions, meta, skill_guidance); skill_guidance === skillPrompt;
//      data is `{ scenarios, variances, totals }` ONLY.
//   3. Parallel fetch surface:
//      - exactly two calls (always, regardless of lineItem)
//      - issued via Promise.all (not sequential — both visible in first tick)
//      - first/second URLs split on scenarioId (primary vs compare)
//      - both share entityId + yearCode + headers
//      - Cookie + Content-Type forwarded
//      - ctx.baseUrl used as prefix
//   4. Variance computation:
//      - buildIndex walks sections[].lines[], sums value by code
//      - codes are the SORTED UNION of current + comparison codes
//      - diff = current - comparison
//      - pct = comparison === 0 ? null : (diff / comparison) * 100
//      - missing-side defaults to 0 (e.g., code only in current → comparison=0)
//   5. lineItem filter:
//      - omitted → all variances returned
//      - substring match on code (case-insensitive)
//      - no match → empty array
//   6. Scenarios extraction:
//      - scenarios.primary = current?.meta?.scenarioCode
//      - scenarios.comparison = comparison?.meta?.scenarioCode
//      - both undefined when meta missing (no throw)
//   7. Totals extraction:
//      - totals.current_total = current?.totals?.netIncome ?? null
//      - totals.comparison_total = comparison?.totals?.netIncome ?? null
//   8. meta — skill literal 'variance-analysis', entityCode/yearCode from
//      current?.meta?.*, comparedLines = filtered.length.
//   9. Purity — no caller-arg/ctx mutation, fresh data/meta each call,
//      idempotent on identical inputs.
//
// Pairs with finance-skills/index.test.ts, journal-entry.test.ts,
// journal-entry-prep.test.ts, close-management.test.ts, and
// financial-statements.test.ts. Reuses the routedFetchMock helper that
// landed in the financial-statements test slot.

import { varianceAnalysisSkill } from "./variance-analysis";
import type { FinanceSkillContext, FinanceSkillResult } from "./types";

// --- shared fixtures -------------------------------------------------------
const ctx: FinanceSkillContext = {
  tenantId: "tnt_test",
  sessionCookie: "session=abc123",
  baseUrl: "http://localhost:3000",
};

const baseArgs = {
  scenarioId: "scn_actual",
  compareScenarioId: "scn_budget",
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
 *
 * Imported pattern from financial-statements.test.ts. Both fetches in
 * variance-analysis go to the same /income-statement endpoint, so the
 * matcher must inspect scenarioId in the query string to pick the right
 * response.
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

// Common sample IS payloads — mimics what /api/v2/reports/income-statement
// returns in production (just the keys the skill consumes from .meta,
// .sections[].lines[], and .totals).
const currentPayload = {
  sections: [
    {
      code: "REV",
      label: "Revenue",
      lines: [
        { code: "4000", label: "Product Revenue", value: 1_200_000 },
        { code: "4100", label: "Services Revenue", value: 300_000 },
      ],
    },
    {
      code: "COGS",
      label: "Cost of Goods Sold",
      lines: [
        { code: "5000", label: "Product Cost", value: 700_000 },
      ],
    },
  ],
  totals: { netIncome: 800_000 },
  meta: {
    entityCode: "US_HQ",
    scenarioCode: "ACTUAL",
    yearCode: "FY2026",
    rowsRead: 7297,
  },
};

const comparePayload = {
  sections: [
    {
      code: "REV",
      label: "Revenue",
      lines: [
        { code: "4000", label: "Product Revenue", value: 1_000_000 },
        { code: "4100", label: "Services Revenue", value: 250_000 },
      ],
    },
    {
      code: "COGS",
      label: "Cost of Goods Sold",
      lines: [
        { code: "5000", label: "Product Cost", value: 600_000 },
      ],
    },
  ],
  totals: { netIncome: 650_000 },
  meta: {
    entityCode: "US_HQ",
    scenarioCode: "BUDGET",
    yearCode: "FY2026",
    rowsRead: 4001,
  },
};

// Convenience: the two-route mock used in 80% of the dual-fetch tests.
function dualMock() {
  return routedFetchMock([
    {
      match: (u) => u.includes("scn_actual"),
      respond: fakeResponse(isEnvelope(currentPayload)),
    },
    {
      match: (u) => u.includes("scn_budget"),
      respond: fakeResponse(isEnvelope(comparePayload)),
    },
  ]);
}

// =========================================================================
// Static surface
// =========================================================================

describe("varianceAnalysisSkill — static surface", () => {
  test("name is exactly 'do_variance_analysis'", () => {
    expect(varianceAnalysisSkill.name).toBe("do_variance_analysis");
  });

  test("description is a non-empty string ≥ 50 chars", () => {
    expect(typeof varianceAnalysisSkill.description).toBe("string");
    expect(varianceAnalysisSkill.description.length).toBeGreaterThanOrEqual(
      50
    );
  });

  test("description mentions the verbs Copilot routes on", () => {
    // The natural-language router uses these. Drift = silent broken
    // routing on "why did revenue miss budget?" prompts.
    const desc = varianceAnalysisSkill.description.toLowerCase();
    expect(desc).toMatch(/variance|flux|analysis|decomposition/);
  });

  test("description names the driver categories (Price/Volume/Mix/etc.)", () => {
    const desc = varianceAnalysisSkill.description.toLowerCase();
    // At least 3 of the 6 canonical drivers must appear.
    const drivers = ["price", "volume", "mix", "headcount", "rate", "timing"];
    const matched = drivers.filter((d) => desc.includes(d));
    expect(matched.length).toBeGreaterThanOrEqual(3);
  });

  test("description carries example user phrasings for routing", () => {
    // Quoted example prompts in the description ground the router.
    const desc = varianceAnalysisSkill.description.toLowerCase();
    expect(desc).toMatch(/why did|miss budget|analyze variance|explain the gap|flux/);
  });

  test("description enumerates the four required args", () => {
    const desc = varianceAnalysisSkill.description;
    expect(desc).toMatch(/scenarioId/);
    expect(desc).toMatch(/compareScenarioId/);
    expect(desc).toMatch(/entityId/);
    expect(desc).toMatch(/yearCode/);
  });

  test("description signals the comparison scenario kinds", () => {
    // BUDGET/FORECAST/PRIOR_ACTUAL is the canonical set the user will ask.
    const desc = varianceAnalysisSkill.description.toUpperCase();
    expect(desc).toMatch(/BUDGET|FORECAST|PRIOR|ACTUAL/);
  });

  test("inputSchema is a JSON Schema object with required & properties", () => {
    expect(varianceAnalysisSkill.inputSchema.type).toBe("object");
    expect(isPlainObject(varianceAnalysisSkill.inputSchema.properties)).toBe(
      true
    );
    expect(Array.isArray(varianceAnalysisSkill.inputSchema.required)).toBe(
      true
    );
  });

  test("required[] contains all four canonical args (compareScenarioId INCLUDED)", () => {
    // Distinct from financialStatementsSkill where compareScenarioId is
    // optional — here variance analysis is meaningless without a compare.
    expect(varianceAnalysisSkill.inputSchema.required).toEqual([
      "scenarioId",
      "compareScenarioId",
      "entityId",
      "yearCode",
    ]);
  });

  test("compareScenarioId is REQUIRED (not optional like financial-statements)", () => {
    expect(varianceAnalysisSkill.inputSchema.required).toContain(
      "compareScenarioId"
    );
  });

  test("lineItem is OPTIONAL — not in required[]", () => {
    expect(varianceAnalysisSkill.inputSchema.required).not.toContain(
      "lineItem"
    );
  });

  test("inputSchema declares all five properties as strings", () => {
    const props = varianceAnalysisSkill.inputSchema.properties;
    expect(props.scenarioId?.type).toBe("string");
    expect(props.compareScenarioId?.type).toBe("string");
    expect(props.entityId?.type).toBe("string");
    expect(props.yearCode?.type).toBe("string");
    expect(props.lineItem?.type).toBe("string");
  });

  test("scenarioId description names ACTUAL as the canonical primary", () => {
    const d = (varianceAnalysisSkill.inputSchema.properties.scenarioId
      .description ?? "").toUpperCase();
    expect(d).toMatch(/ACTUAL|PRIMARY|SCENARIO|UUID/);
  });

  test("compareScenarioId description names BUDGET / FORECAST / PRIOR", () => {
    const d = (varianceAnalysisSkill.inputSchema.properties.compareScenarioId
      .description ?? "").toUpperCase();
    expect(d).toMatch(/BUDGET|FORECAST|PRIOR|COMPARISON|UUID/);
  });

  test("entityId description identifies it as an entity UUID", () => {
    const d = (varianceAnalysisSkill.inputSchema.properties.entityId
      .description ?? "").toLowerCase();
    expect(d).toMatch(/entity|uuid|grp|consolidated/);
  });

  test("yearCode description carries an FY hint", () => {
    const d = varianceAnalysisSkill.inputSchema.properties.yearCode
      .description ?? "";
    expect(d).toMatch(/FY|year/i);
  });

  test("lineItem description signals it is optional / focuses on one line", () => {
    const d = (varianceAnalysisSkill.inputSchema.properties.lineItem
      .description ?? "").toLowerCase();
    expect(d).toMatch(/optional|focus|one line|line item|account/);
  });

  test("skillPrompt is a non-empty string opening with a markdown heading", () => {
    expect(typeof varianceAnalysisSkill.skillPrompt).toBe("string");
    expect(varianceAnalysisSkill.skillPrompt.length).toBeGreaterThan(200);
    expect(varianceAnalysisSkill.skillPrompt.startsWith("#")).toBe(true);
  });

  test("skillPrompt carries the materiality triggers matrix", () => {
    const sp = varianceAnalysisSkill.skillPrompt;
    expect(sp).toMatch(/materiality/i);
    // Either threshold notation should appear.
    expect(sp).toMatch(/0\.5-1%|10%|15%|20%|5%/);
    expect(sp.toLowerCase()).toMatch(/threshold|trigger/);
  });

  test("skillPrompt names the canonical comparison kinds (Actual vs Budget, MoM)", () => {
    const sp = varianceAnalysisSkill.skillPrompt;
    expect(sp).toMatch(/Actual vs Budget/i);
    expect(sp).toMatch(/Actual vs Prior|Prior Period/i);
    expect(sp).toMatch(/Actual vs Forecast|Forecast/i);
    expect(sp).toMatch(/MoM|month/i);
  });

  test("skillPrompt walks the Volume/Price/Mix decomposition framework", () => {
    const sp = varianceAnalysisSkill.skillPrompt.toLowerCase();
    expect(sp).toContain("volume");
    expect(sp).toContain("price");
    expect(sp).toContain("mix");
    expect(sp).toMatch(/effect|variance/);
  });

  test("skillPrompt walks the Headcount/Rate/Timing decomposition framework", () => {
    const sp = varianceAnalysisSkill.skillPrompt.toLowerCase();
    expect(sp).toContain("headcount");
    expect(sp).toContain("rate variance");
    expect(sp).toContain("timing");
  });

  test("skillPrompt enumerates the investigation priority order", () => {
    const sp = varianceAnalysisSkill.skillPrompt.toLowerCase();
    expect(sp).toMatch(/investigation priority|priority/);
    // At least 3 of the 5 priority cues must appear.
    const cues = [
      "largest absolute",
      "largest percentage",
      "unexpected direction",
      "new variance",
      "cumulative",
    ];
    const matched = cues.filter((c) => sp.includes(c));
    expect(matched.length).toBeGreaterThanOrEqual(3);
  });

  test("skillPrompt calls out narrative DO patterns (quantify driver split)", () => {
    const sp = varianceAnalysisSkill.skillPrompt.toLowerCase();
    expect(sp).toMatch(/quantify|driver split|specific|recommend action/);
  });

  test("skillPrompt calls out narrative anti-patterns (circular / vague)", () => {
    const sp = varianceAnalysisSkill.skillPrompt.toLowerCase();
    expect(sp).toMatch(/anti-pattern|don'?t/);
    expect(sp).toMatch(/circular|vague|various small/);
  });

  test("skillPrompt ends with a compliance reminder phrase", () => {
    const sp = varianceAnalysisSkill.skillPrompt.toLowerCase();
    expect(sp).toMatch(/compliance reminder|management discussion|qualified finance|external reporting/);
  });

  test("execute is an async function with arity 2 (args, ctx)", () => {
    expect(typeof varianceAnalysisSkill.execute).toBe("function");
    expect(varianceAnalysisSkill.execute.length).toBe(2);
  });
});

// =========================================================================
// execute() — result shape
// =========================================================================

describe("varianceAnalysisSkill.execute — result shape", () => {
  test("returns a Promise (then-able)", async () => {
    await withFetch(dualMock(), async () => {
      const ret = varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(typeof (ret as Promise<unknown>).then).toBe("function");
      await ret;
    });
  });

  test("resolved value is a plain object", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(isPlainObject(r)).toBe(true);
    });
  });

  test("has the four FinanceSkillResult keys exactly", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(Object.keys(r).sort()).toEqual(
        ["data", "instructions", "meta", "skill_guidance"].sort()
      );
    });
  });

  test("skill_guidance === skill.skillPrompt (no drift)", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(r.skill_guidance).toBe(varianceAnalysisSkill.skillPrompt);
    });
  });

  test("instructions is a non-empty string ≥ 50 chars", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(typeof r.instructions).toBe("string");
      expect(r.instructions.length).toBeGreaterThanOrEqual(50);
    });
  });

  test("data is a plain object with exactly { scenarios, variances, totals } keys", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(isPlainObject(r.data)).toBe(true);
      expect(Object.keys(r.data).sort()).toEqual(
        ["scenarios", "totals", "variances"].sort()
      );
    });
  });
});

// =========================================================================
// execute() — parallel fetch surface (always dual)
// =========================================================================

describe("varianceAnalysisSkill.execute — parallel fetch surface", () => {
  test("always issues exactly two fetch calls (compareScenarioId required)", async () => {
    const spy = dualMock();
    await withFetch(spy, async () => {
      await varianceAnalysisSkill.execute(baseArgs, ctx);
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test("two fetches issued in PARALLEL (visible in same tick — Promise.all)", async () => {
    // Both fetch calls should be queued before either resolves. We
    // instrument the mock with a deferred resolve and check that both
    // calls land before the first resolution.
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const calls: string[] = [];
    const spy = makeFetchMock(async (url: string) => {
      calls.push(url);
      if (url.includes("scn_actual")) {
        await new Promise<void>((res) => (resolveFirst = res));
        return fakeResponse(isEnvelope(currentPayload));
      }
      if (url.includes("scn_budget")) {
        await new Promise<void>((res) => (resolveSecond = res));
        return fakeResponse(isEnvelope(comparePayload));
      }
      throw new Error(`unrouted: ${url}`);
    });
    await withFetch(spy, async () => {
      const p = varianceAnalysisSkill.execute(baseArgs, ctx);
      // Flush microtasks so both fetches have a chance to be queued.
      await new Promise<void>((res) => setImmediate(res));
      expect(calls.length).toBe(2);
      // Now resolve both.
      resolveFirst();
      resolveSecond();
      await p;
    });
  });

  test("first call targets the primary scenarioId; second targets compareScenarioId", async () => {
    const spy = dualMock();
    await withFetch(spy, async () => {
      await varianceAnalysisSkill.execute(baseArgs, ctx);
    });
    // Promise.all preserves the input order, and so does the mock.calls
    // order of invocation. The primary is queued first by source order.
    const urls = spy.mock.calls.map(([u]) => u as string);
    const primary = urls.find((u) => u.includes(`scenarioId=${baseArgs.scenarioId}`));
    const compare = urls.find((u) =>
      u.includes(`scenarioId=${baseArgs.compareScenarioId}`)
    );
    expect(primary).toBeDefined();
    expect(compare).toBeDefined();
    // Primary URL must NOT contain the compare id, and vice versa.
    expect(primary).not.toContain(baseArgs.compareScenarioId);
    expect(compare).not.toContain(baseArgs.scenarioId);
  });

  test("both URLs target /api/v2/reports/income-statement", async () => {
    const spy = dualMock();
    await withFetch(spy, async () => {
      await varianceAnalysisSkill.execute(baseArgs, ctx);
    });
    for (const [url] of spy.mock.calls) {
      expect(url).toContain("/api/v2/reports/income-statement");
    }
  });

  test("both URLs carry entityId + yearCode verbatim in the query string", async () => {
    const spy = dualMock();
    await withFetch(spy, async () => {
      await varianceAnalysisSkill.execute(baseArgs, ctx);
    });
    for (const [url] of spy.mock.calls) {
      expect(url).toContain(`entityId=${baseArgs.entityId}`);
      expect(url).toContain(`yearCode=${baseArgs.yearCode}`);
    }
  });

  test("uses ctx.baseUrl as the URL prefix on both calls", async () => {
    const spy = dualMock();
    const localCtx: FinanceSkillContext = {
      ...ctx,
      baseUrl: "https://prod.example.com",
    };
    await withFetch(spy, async () => {
      await varianceAnalysisSkill.execute(baseArgs, localCtx);
    });
    for (const [url] of spy.mock.calls) {
      expect(url).toMatch(
        /^https:\/\/prod\.example\.com\/api\/v2\/reports\/income-statement\?/
      );
    }
  });

  test("forwards sessionCookie in Cookie header on both calls", async () => {
    const spy = dualMock();
    await withFetch(spy, async () => {
      await varianceAnalysisSkill.execute(baseArgs, ctx);
    });
    for (const [, init] of spy.mock.calls) {
      expect(init.headers.Cookie).toBe(ctx.sessionCookie);
    }
  });

  test("sends Content-Type: application/json on both calls", async () => {
    const spy = dualMock();
    await withFetch(spy, async () => {
      await varianceAnalysisSkill.execute(baseArgs, ctx);
    });
    for (const [, init] of spy.mock.calls) {
      expect(init.headers["Content-Type"]).toBe("application/json");
    }
  });

  test("lineItem arg does NOT add a third fetch (filter is in-memory)", async () => {
    // lineItem filtering happens AFTER the fetches, on the in-memory
    // variance table. Drift here (e.g., someone moves it to a query
    // param) would change the API contract — pin it.
    const spy = dualMock();
    await withFetch(spy, async () => {
      await varianceAnalysisSkill.execute(
        { ...baseArgs, lineItem: "4000" },
        ctx
      );
    });
    expect(spy).toHaveBeenCalledTimes(2);
    // And lineItem should NOT appear in either URL.
    for (const [url] of spy.mock.calls) {
      expect(url).not.toContain("lineItem");
      expect(url).not.toContain("4000");
    }
  });
});

// =========================================================================
// execute() — variance computation (buildIndex + diff/pct math)
// =========================================================================

describe("varianceAnalysisSkill.execute — variance computation", () => {
  test("variances is an array", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(Array.isArray(r.data.variances)).toBe(true);
    });
  });

  test("each variance row has exactly { code, current, comparison, diff, pct } keys", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      for (const v of r.data.variances) {
        expect(Object.keys(v).sort()).toEqual(
          ["code", "comparison", "current", "diff", "pct"].sort()
        );
      }
    });
  });

  test("codes are the SORTED UNION of all section.lines[].code from both reports", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      const codes = r.data.variances.map((v: any) => v.code);
      // Fixtures: both reports share 4000, 4100, 5000.
      expect(codes).toEqual(["4000", "4100", "5000"]);
    });
  });

  test("diff = current - comparison (sign preserved)", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      for (const v of r.data.variances) {
        expect(v.diff).toBe(v.current - v.comparison);
      }
    });
  });

  test("pct = (diff / comparison) * 100 when comparison ≠ 0", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      const row4000 = r.data.variances.find((v: any) => v.code === "4000");
      // current=1.2M, comparison=1M, diff=200k, pct = 20.
      expect(row4000.current).toBe(1_200_000);
      expect(row4000.comparison).toBe(1_000_000);
      expect(row4000.diff).toBe(200_000);
      expect(row4000.pct).toBeCloseTo(20, 5);
    });
  });

  test("pct === null when comparison === 0 (divide-by-zero guard)", async () => {
    // Build a payload where one code has comparison=0 but current=non-zero.
    const cur = {
      sections: [
        { lines: [{ code: "9999", label: "Phantom", value: 50_000 }] },
      ],
      totals: { netIncome: 50_000 },
      meta: currentPayload.meta,
    };
    const cmp = {
      sections: [],
      totals: { netIncome: 0 },
      meta: comparePayload.meta,
    };
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope(cur)),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(isEnvelope(cmp)),
        },
      ]),
      async () => {
        const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
        const row = r.data.variances.find((v: any) => v.code === "9999");
        expect(row.pct).toBeNull();
        expect(row.current).toBe(50_000);
        expect(row.comparison).toBe(0);
        expect(row.diff).toBe(50_000);
      }
    );
  });

  test("codes present only in current have comparison=0", async () => {
    const cur = {
      sections: [
        { lines: [{ code: "ONLY_CUR", value: 100 }] },
        { lines: [{ code: "SHARED", value: 200 }] },
      ],
      totals: { netIncome: 300 },
      meta: currentPayload.meta,
    };
    const cmp = {
      sections: [{ lines: [{ code: "SHARED", value: 150 }] }],
      totals: { netIncome: 150 },
      meta: comparePayload.meta,
    };
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope(cur)),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(isEnvelope(cmp)),
        },
      ]),
      async () => {
        const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
        const onlyCur = r.data.variances.find((v: any) => v.code === "ONLY_CUR");
        expect(onlyCur.current).toBe(100);
        expect(onlyCur.comparison).toBe(0);
        expect(onlyCur.diff).toBe(100);
        expect(onlyCur.pct).toBeNull();
      }
    );
  });

  test("codes present only in comparison have current=0", async () => {
    const cur = {
      sections: [{ lines: [{ code: "SHARED", value: 200 }] }],
      totals: { netIncome: 200 },
      meta: currentPayload.meta,
    };
    const cmp = {
      sections: [
        { lines: [{ code: "ONLY_CMP", value: 75 }] },
        { lines: [{ code: "SHARED", value: 150 }] },
      ],
      totals: { netIncome: 225 },
      meta: comparePayload.meta,
    };
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope(cur)),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(isEnvelope(cmp)),
        },
      ]),
      async () => {
        const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
        const onlyCmp = r.data.variances.find((v: any) => v.code === "ONLY_CMP");
        expect(onlyCmp.current).toBe(0);
        expect(onlyCmp.comparison).toBe(75);
        expect(onlyCmp.diff).toBe(-75);
        expect(onlyCmp.pct).toBeCloseTo(-100, 5);
      }
    );
  });

  test("duplicate codes across sections are SUMMED (buildIndex aggregates)", async () => {
    // buildIndex iterates all sections and accumulates by code:
    //   idx[l.code] = (idx[l.code] ?? 0) + (l.value ?? 0)
    // So a code that appears twice should aggregate.
    const cur = {
      sections: [
        { lines: [{ code: "DUP", value: 100 }] },
        { lines: [{ code: "DUP", value: 50 }] },
      ],
      totals: { netIncome: 150 },
      meta: currentPayload.meta,
    };
    const cmp = {
      sections: [{ lines: [{ code: "DUP", value: 100 }] }],
      totals: { netIncome: 100 },
      meta: comparePayload.meta,
    };
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope(cur)),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(isEnvelope(cmp)),
        },
      ]),
      async () => {
        const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
        const dup = r.data.variances.find((v: any) => v.code === "DUP");
        expect(dup.current).toBe(150); // 100 + 50
        expect(dup.comparison).toBe(100);
        expect(dup.diff).toBe(50);
      }
    );
  });

  test("missing line.value defaults to 0 (?? 0 fallback)", async () => {
    // A line with no `value` field should not throw — counts as 0.
    const cur = {
      sections: [
        {
          lines: [
            { code: "X", label: "Has value" } as any, // no value field
            { code: "Y", value: 100 },
          ],
        },
      ],
      totals: { netIncome: 100 },
      meta: currentPayload.meta,
    };
    const cmp = {
      sections: [{ lines: [{ code: "X", value: 50 }, { code: "Y", value: 50 }] }],
      totals: { netIncome: 100 },
      meta: comparePayload.meta,
    };
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope(cur)),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(isEnvelope(cmp)),
        },
      ]),
      async () => {
        const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
        const x = r.data.variances.find((v: any) => v.code === "X");
        expect(x.current).toBe(0);
        expect(x.comparison).toBe(50);
        expect(x.diff).toBe(-50);
      }
    );
  });

  test("missing sections array entirely → empty variance list", async () => {
    // `for (const s of rpt?.sections ?? [])` guards null/undefined.
    const cur = { meta: currentPayload.meta }; // no sections
    const cmp = { meta: comparePayload.meta };
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope(cur)),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(isEnvelope(cmp)),
        },
      ]),
      async () => {
        const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
        expect(r.data.variances).toEqual([]);
      }
    );
  });

  test("section with missing lines array → counted as empty (no throw)", async () => {
    // `for (const l of s.lines ?? [])` guards undefined lines.
    const cur = {
      sections: [{ code: "OPREV" } as any], // no lines field
      totals: { netIncome: 0 },
      meta: currentPayload.meta,
    };
    const cmp = {
      sections: [{ code: "OPREV", lines: [{ code: "4000", value: 100 }] }],
      totals: { netIncome: 100 },
      meta: comparePayload.meta,
    };
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope(cur)),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(isEnvelope(cmp)),
        },
      ]),
      async () => {
        const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
        // Only the comparison side has 4000 — variance row should exist.
        const r4000 = r.data.variances.find((v: any) => v.code === "4000");
        expect(r4000).toBeDefined();
        expect(r4000.current).toBe(0);
        expect(r4000.comparison).toBe(100);
      }
    );
  });

  test("null current report → empty variance list, no throw", async () => {
    // `data?.current` is null → buildIndex(null) returns {}.
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(null),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(isEnvelope(comparePayload)),
        },
      ]),
      async () => {
        const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
        expect(Array.isArray(r.data.variances)).toBe(true);
        // All codes come from comparison only — current side is 0.
        for (const v of r.data.variances) {
          expect(v.current).toBe(0);
        }
      }
    );
  });
});

// =========================================================================
// execute() — lineItem filter
// =========================================================================

describe("varianceAnalysisSkill.execute — lineItem filter", () => {
  test("no lineItem → all variances returned", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      // Fixture has 3 codes: 4000, 4100, 5000.
      expect(r.data.variances.length).toBe(3);
    });
  });

  test("lineItem matches a code → only that variance returned", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(
        { ...baseArgs, lineItem: "4000" },
        ctx
      );
      expect(r.data.variances.length).toBe(1);
      expect(r.data.variances[0].code).toBe("4000");
    });
  });

  test("lineItem substring matches multiple codes", async () => {
    // "4" is a substring of both "4000" and "4100" → both should match.
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(
        { ...baseArgs, lineItem: "4" },
        ctx
      );
      const codes = r.data.variances.map((v: any) => v.code).sort();
      expect(codes).toEqual(["4000", "4100"]);
    });
  });

  test("lineItem filter is case-insensitive", async () => {
    // Fixture codes are uppercase-like (numeric). Build a fixture with
    // alpha codes and verify case-insensitive matching.
    const cur = {
      sections: [{ lines: [{ code: "REV_US", value: 100 }, { code: "REV_EU", value: 200 }] }],
      totals: { netIncome: 300 },
      meta: currentPayload.meta,
    };
    const cmp = {
      sections: [{ lines: [{ code: "REV_US", value: 80 }, { code: "REV_EU", value: 180 }] }],
      totals: { netIncome: 260 },
      meta: comparePayload.meta,
    };
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope(cur)),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(isEnvelope(cmp)),
        },
      ]),
      async () => {
        // lowercase "us" should still match the uppercase code "REV_US".
        const r = await varianceAnalysisSkill.execute(
          { ...baseArgs, lineItem: "us" },
          ctx
        );
        expect(r.data.variances.length).toBe(1);
        expect(r.data.variances[0].code).toBe("REV_US");
      }
    );
  });

  test("lineItem with no match → empty variances array", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(
        { ...baseArgs, lineItem: "XYZ_DOES_NOT_EXIST" },
        ctx
      );
      expect(r.data.variances).toEqual([]);
    });
  });

  test("empty-string lineItem behaves like no filter (matches all codes)", async () => {
    // Source: `if (args.lineItem)` — empty string is falsy, so the filter
    // is SKIPPED entirely. Pins the truthy-check contract.
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(
        { ...baseArgs, lineItem: "" },
        ctx
      );
      expect(r.data.variances.length).toBe(3);
    });
  });
});

// =========================================================================
// execute() — scenarios extraction
// =========================================================================

describe("varianceAnalysisSkill.execute — scenarios extraction", () => {
  test("scenarios.primary === current.meta.scenarioCode", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(r.data.scenarios.primary).toBe(currentPayload.meta.scenarioCode);
    });
  });

  test("scenarios.comparison === comparison.meta.scenarioCode", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(r.data.scenarios.comparison).toBe(
        comparePayload.meta.scenarioCode
      );
    });
  });

  test("scenarios object has exactly { primary, comparison } keys", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(Object.keys(r.data.scenarios).sort()).toEqual(
        ["comparison", "primary"].sort()
      );
    });
  });

  test("scenarios.primary === undefined when current.meta missing (no throw)", async () => {
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope({ sections: [] })), // no meta
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(isEnvelope(comparePayload)),
        },
      ]),
      async () => {
        const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
        expect(r.data.scenarios.primary).toBeUndefined();
        expect(r.data.scenarios.comparison).toBe(
          comparePayload.meta.scenarioCode
        );
      }
    );
  });

  test("scenarios.* === undefined when both reports null (no throw)", async () => {
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(null),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(null),
        },
      ]),
      async () => {
        const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
        expect(r.data.scenarios.primary).toBeUndefined();
        expect(r.data.scenarios.comparison).toBeUndefined();
      }
    );
  });
});

// =========================================================================
// execute() — totals extraction
// =========================================================================

describe("varianceAnalysisSkill.execute — totals extraction", () => {
  test("totals.current_total === current.totals.netIncome", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(r.data.totals.current_total).toBe(
        currentPayload.totals.netIncome
      );
    });
  });

  test("totals.comparison_total === comparison.totals.netIncome", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(r.data.totals.comparison_total).toBe(
        comparePayload.totals.netIncome
      );
    });
  });

  test("totals object has exactly { current_total, comparison_total } keys", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(Object.keys(r.data.totals).sort()).toEqual(
        ["comparison_total", "current_total"].sort()
      );
    });
  });

  test("totals.current_total === null when current.totals missing", async () => {
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope({ sections: [], meta: currentPayload.meta })),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(isEnvelope(comparePayload)),
        },
      ]),
      async () => {
        const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
        expect(r.data.totals.current_total).toBeNull();
        expect(r.data.totals.comparison_total).toBe(
          comparePayload.totals.netIncome
        );
      }
    );
  });

  test("totals.* === null when both reports null", async () => {
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(null),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(null),
        },
      ]),
      async () => {
        const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
        expect(r.data.totals.current_total).toBeNull();
        expect(r.data.totals.comparison_total).toBeNull();
      }
    );
  });
});

// =========================================================================
// execute() — instructions
// =========================================================================

describe("varianceAnalysisSkill.execute — instructions", () => {
  test("instructions reference the variance-analysis lens by name", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(r.instructions.toLowerCase()).toMatch(/variance|lens/);
    });
  });

  test("instructions mention materiality / thresholds", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(r.instructions.toLowerCase()).toMatch(/materiality|threshold/);
    });
  });

  test("instructions ask to decompose top variances by driver", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(r.instructions.toLowerCase()).toMatch(/decompose|driver|top/);
    });
  });

  test("instructions end with a compliance / reminder cue", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(r.instructions.toLowerCase()).toMatch(/compliance|reminder/);
    });
  });

  test("instructions are stable across runs (no random/timestamp content)", async () => {
    await withFetch(dualMock(), async () => {
      const r1 = await varianceAnalysisSkill.execute(baseArgs, ctx);
      const r2 = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(r1.instructions).toBe(r2.instructions);
    });
  });
});

// =========================================================================
// execute() — meta extraction
// =========================================================================

describe("varianceAnalysisSkill.execute — meta extraction", () => {
  test("meta.skill is the literal 'variance-analysis'", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(r.meta?.skill).toBe("variance-analysis");
    });
  });

  test("meta.entityCode pulled from current.meta.entityCode", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(r.meta?.entityCode).toBe(currentPayload.meta.entityCode);
    });
  });

  test("meta.yearCode pulled from current.meta.yearCode", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(r.meta?.yearCode).toBe(currentPayload.meta.yearCode);
    });
  });

  test("meta.comparedLines === variances.length (unfiltered)", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(r.meta?.comparedLines).toBe(r.data.variances.length);
      expect(r.meta?.comparedLines).toBe(3); // fixture has 3 codes
    });
  });

  test("meta.comparedLines reflects the FILTERED count when lineItem provided", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(
        { ...baseArgs, lineItem: "4000" },
        ctx
      );
      expect(r.meta?.comparedLines).toBe(1);
      expect(r.meta?.comparedLines).toBe(r.data.variances.length);
    });
  });

  test("meta.comparedLines === 0 when lineItem matches nothing", async () => {
    await withFetch(dualMock(), async () => {
      const r = await varianceAnalysisSkill.execute(
        { ...baseArgs, lineItem: "NONEXISTENT" },
        ctx
      );
      expect(r.meta?.comparedLines).toBe(0);
    });
  });

  test("meta still has skill + comparedLines when current.meta is missing", async () => {
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(isEnvelope({ sections: [] })),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(isEnvelope({ sections: [] })),
        },
      ]),
      async () => {
        const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
        expect(r.meta?.skill).toBe("variance-analysis");
        expect(r.meta?.comparedLines).toBe(0);
        expect(r.meta?.entityCode).toBeUndefined();
        expect(r.meta?.yearCode).toBeUndefined();
      }
    );
  });

  test("meta still has skill when current is null entirely", async () => {
    await withFetch(
      routedFetchMock([
        {
          match: (u) => u.includes("scn_actual"),
          respond: fakeResponse(null),
        },
        {
          match: (u) => u.includes("scn_budget"),
          respond: fakeResponse(null),
        },
      ]),
      async () => {
        const r = await varianceAnalysisSkill.execute(baseArgs, ctx);
        expect(r.meta?.skill).toBe("variance-analysis");
        expect(r.meta?.entityCode).toBeUndefined();
        expect(r.meta?.comparedLines).toBe(0);
      }
    );
  });
});

// =========================================================================
// execute() — purity / non-mutation
// =========================================================================

describe("varianceAnalysisSkill.execute — purity", () => {
  test("does not mutate the caller's args object (no lineItem)", async () => {
    await withFetch(dualMock(), async () => {
      const args = { ...baseArgs };
      const snapshot = JSON.stringify(args);
      await varianceAnalysisSkill.execute(args, ctx);
      expect(JSON.stringify(args)).toBe(snapshot);
    });
  });

  test("does not mutate the caller's args object (with lineItem)", async () => {
    await withFetch(dualMock(), async () => {
      const args = { ...baseArgs, lineItem: "4000" };
      const snapshot = JSON.stringify(args);
      await varianceAnalysisSkill.execute(args, ctx);
      expect(JSON.stringify(args)).toBe(snapshot);
    });
  });

  test("does not mutate the caller's ctx object", async () => {
    await withFetch(dualMock(), async () => {
      const localCtx = { ...ctx };
      const snapshot = JSON.stringify(localCtx);
      await varianceAnalysisSkill.execute(baseArgs, localCtx);
      expect(JSON.stringify(localCtx)).toBe(snapshot);
    });
  });

  test("each call returns a fresh data object (no shared mutable ref)", async () => {
    await withFetch(dualMock(), async () => {
      const r1 = await varianceAnalysisSkill.execute(baseArgs, ctx);
      const r2 = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(r1.data).not.toBe(r2.data);
      expect(r1.data).toEqual(r2.data);
      // Mutating r1.data does not bleed into r2.
      (r1.data as any).variances = [];
      expect((r2.data as any).variances.length).toBeGreaterThan(0);
    });
  });

  test("each call returns a fresh meta object", async () => {
    await withFetch(dualMock(), async () => {
      const r1 = await varianceAnalysisSkill.execute(baseArgs, ctx);
      const r2 = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(r1.meta).not.toBe(r2.meta);
      expect(r1.meta).toEqual(r2.meta);
    });
  });

  test("each call returns a fresh variances array (no shared mutable ref)", async () => {
    await withFetch(dualMock(), async () => {
      const r1 = await varianceAnalysisSkill.execute(baseArgs, ctx);
      const r2 = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(r1.data.variances).not.toBe(r2.data.variances);
      expect(r1.data.variances).toEqual(r2.data.variances);
    });
  });

  test("idempotent on identical inputs (no lineItem)", async () => {
    await withFetch(dualMock(), async () => {
      const r1 = await varianceAnalysisSkill.execute(baseArgs, ctx);
      const r2 = await varianceAnalysisSkill.execute(baseArgs, ctx);
      expect(r1).toEqual(r2);
    });
  });

  test("idempotent on identical inputs (with lineItem)", async () => {
    await withFetch(dualMock(), async () => {
      const a = { ...baseArgs, lineItem: "4" };
      const r1 = await varianceAnalysisSkill.execute(a, ctx);
      const r2 = await varianceAnalysisSkill.execute(a, ctx);
      expect(r1).toEqual(r2);
    });
  });
});

// =========================================================================
// execute() — typed contract
// =========================================================================

describe("varianceAnalysisSkill.execute — typed contract", () => {
  test("FinanceSkillResult interface keys present", async () => {
    await withFetch(dualMock(), async () => {
      const r: FinanceSkillResult = await varianceAnalysisSkill.execute(
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
