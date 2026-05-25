// Unit tests for closeManagementSkill.execute().
//
// closeManagementSkill is the Copilot wrapper for the finance plugin's
// `close-management` skill — it generates a month-end close plan with
// task sequencing, dependencies, and owners. Unlike pass-through skills,
// closeManagementSkill performs a single side-effecting fetch:
//
//   fetch(`${ctx.baseUrl}/api/v2/processes/consolidation/recent?limit=5`, …)
//
// …to retrieve the last few consolidation runs (used as context for the
// "bottlenecks specific to this org" section). The fetch is wrapped in
// a try/catch that SWALLOWS errors and falls back to recentRuns=[]. That
// swallow path is the easiest test case to pin — stub fetch to throw and
// assert the no-history fallback shape. We also exercise the happy path
// with a stubbed fetch returning a plausible API envelope.
//
// What this file pins:
//   1. Static surface (name, description, inputSchema, skillPrompt)
//   2. execute() returns FinanceSkillResult with all four required keys
//   3. data carries closePeriod / targetDays / entityId /
//      includeFiscalYearEnd / recentConsolidationRuns
//   4. meta = { skill: "close-management", closePeriod, targetDays }
//   5. targetDays defaulting: only the literal number 3 trips accelerated
//      path; everything else (omitted / undefined / null / 5 / "3" / 4 /
//      0 / NaN) → 5
//   6. entityId defaulting to "consolidated" when omitted
//   7. includeFiscalYearEnd coercion via !! — truthy/falsy semantics pinned
//   8. Fetch failure path (recentRuns=[]) yields documented fallbacks
//   9. Fetch success path populates recentConsolidationRuns from the
//      `j.data.runs` envelope, falling back to `j.data` if runs missing,
//      then `[]` if neither
//  10. Slice(0, 5) cap: never more than 5 runs surfaced regardless of input
//  11. Purity: no caller-arg or ctx mutation, fresh data on each call
//
// Pairs with finance-skills/index.test.ts, journal-entry.test.ts, and
// journal-entry-prep.test.ts. Reuses the makeFetchMock/withFetch helpers
// established in journal-entry-prep.test.ts (same pattern: one fetch,
// swallow on throw, fakeResponse with async json()).

import { closeManagementSkill } from "./close-management";
import type { FinanceSkillContext, FinanceSkillResult } from "./types";

// --- shared fixtures ---
const ctx: FinanceSkillContext = {
  tenantId: "tnt_test",
  sessionCookie: "session=abc123",
  baseUrl: "http://localhost:3000",
};

const baseArgs = {
  closePeriod: "2026-04",
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

/** The recent-consolidation envelope: `{ data: { runs: [...] } }`. */
function runsEnvelope(runs: Array<Record<string, any>>): any {
  return { data: { runs } };
}

// =========================================================================
// Static surface
// =========================================================================

describe("closeManagementSkill — static surface", () => {
  test("name is exactly 'plan_month_end_close'", () => {
    expect(closeManagementSkill.name).toBe("plan_month_end_close");
  });

  test("description is a non-empty string ≥ 50 chars", () => {
    expect(typeof closeManagementSkill.description).toBe("string");
    expect(closeManagementSkill.description.length).toBeGreaterThanOrEqual(50);
  });

  test("description mentions the verbs Copilot routes on", () => {
    // Natural-language router keys off these. If marketing rewording removes
    // them, the match-score drops and the skill stops being invoked.
    const desc = closeManagementSkill.description.toLowerCase();
    expect(desc).toMatch(/close|month-end|checklist/);
  });

  test("description enumerates the canonical args (closePeriod, targetDays, entityId)", () => {
    const desc = closeManagementSkill.description;
    expect(desc).toMatch(/closePeriod/);
    expect(desc).toMatch(/targetDays/);
    expect(desc).toMatch(/entityId/);
  });

  test("description hints the YYYY-MM closePeriod format", () => {
    // Drift here would cascade to every period-coded API call.
    expect(closeManagementSkill.description).toMatch(/2026-04|YYYY-MM/);
  });

  test("description mentions both 3-day and 5-day variants", () => {
    expect(closeManagementSkill.description).toMatch(/3/);
    expect(closeManagementSkill.description).toMatch(/5/);
  });

  test("inputSchema is a JSON Schema object with required & properties", () => {
    expect(closeManagementSkill.inputSchema.type).toBe("object");
    expect(isPlainObject(closeManagementSkill.inputSchema.properties)).toBe(
      true
    );
    expect(Array.isArray(closeManagementSkill.inputSchema.required)).toBe(true);
  });

  test("required[] is exactly ['closePeriod']", () => {
    // closePeriod is the only mandatory arg — targetDays / entityId / includeFy
    // all have implicit defaults handled by execute().
    expect(closeManagementSkill.inputSchema.required).toEqual(["closePeriod"]);
  });

  test("targetDays / entityId / includeFy are OPTIONAL — not in required[]", () => {
    const req = closeManagementSkill.inputSchema.required;
    for (const k of ["targetDays", "entityId", "includeFy"]) {
      expect(req).not.toContain(k);
    }
  });

  test("inputSchema declares all four properties with correct types", () => {
    const props = closeManagementSkill.inputSchema.properties;
    expect(props.closePeriod?.type).toBe("string");
    expect(props.targetDays?.type).toBe("number");
    expect(props.entityId?.type).toBe("string");
    expect(props.includeFy?.type).toBe("boolean");
  });

  test("closePeriod description shows the canonical YYYY-MM format", () => {
    const d = closeManagementSkill.inputSchema.properties.closePeriod
      .description ?? "";
    expect(d).toMatch(/2026-04|YYYY-MM|period|April 2026/i);
  });

  test("targetDays description enumerates the 3 / 5 contract + default", () => {
    const d = closeManagementSkill.inputSchema.properties.targetDays
      .description ?? "";
    expect(d).toMatch(/3/);
    expect(d).toMatch(/5/);
    expect(d.toLowerCase()).toMatch(/default|standard|accelerated/);
  });

  test("entityId description mentions the consolidated default", () => {
    const d = (closeManagementSkill.inputSchema.properties.entityId
      .description ?? "").toLowerCase();
    expect(d).toMatch(/consolidat|scope|default/);
  });

  test("includeFy description mentions fiscal-year-end specifics", () => {
    const d = (closeManagementSkill.inputSchema.properties.includeFy
      .description ?? "").toLowerCase();
    expect(d).toMatch(/fiscal|year[- ]end|fy/);
  });

  test("skillPrompt is a non-empty string opening with a markdown heading", () => {
    expect(typeof closeManagementSkill.skillPrompt).toBe("string");
    expect(closeManagementSkill.skillPrompt.length).toBeGreaterThan(200);
    expect(closeManagementSkill.skillPrompt.startsWith("#")).toBe(true);
  });

  test("skillPrompt walks the full T+1..T+5 standard close calendar", () => {
    // These are the load-bearing day labels. Drift here changes Claude's
    // sequencing of the close on every invocation.
    const sp = closeManagementSkill.skillPrompt;
    for (const day of ["T+1", "T+2", "T+3", "T+4", "T+5"]) {
      expect(sp).toContain(day);
    }
  });

  test("skillPrompt covers accelerated 3-day variant", () => {
    const sp = closeManagementSkill.skillPrompt;
    expect(sp).toMatch(/3-day|accelerated/i);
  });

  test("skillPrompt covers the bottleneck → solution matrix verbs", () => {
    const sp = closeManagementSkill.skillPrompt.toLowerCase();
    expect(sp).toMatch(/bottleneck/);
    // The named bottlenecks the prompt enumerates.
    expect(sp).toMatch(/accrual/);
    expect(sp).toMatch(/recon/);
    expect(sp).toMatch(/intercompany|\bic\b/);
  });

  test("skillPrompt ends with retrospective questions + compliance reminder", () => {
    const sp = closeManagementSkill.skillPrompt.toLowerCase();
    expect(sp).toMatch(/retrospective/);
    expect(sp).toMatch(/compliance|reminder/);
  });

  test("execute is an async function with arity 2 (args, ctx)", () => {
    expect(typeof closeManagementSkill.execute).toBe("function");
    expect(closeManagementSkill.execute.length).toBe(2);
  });
});

// =========================================================================
// execute() — result shape (fetch-throws fallback)
// =========================================================================

describe("closeManagementSkill.execute — result shape (fetch-throws path)", () => {
  test("returns a Promise (then-able)", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net down"))),
      async () => {
        const ret = closeManagementSkill.execute(baseArgs, ctx);
        expect(typeof (ret as Promise<unknown>).then).toBe("function");
        await ret;
      }
    );
  });

  test("resolved value is a plain object", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(baseArgs, ctx);
        expect(isPlainObject(r)).toBe(true);
      }
    );
  });

  test("has the four FinanceSkillResult keys", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(baseArgs, ctx);
        expect(Object.keys(r).sort()).toEqual(
          ["data", "instructions", "meta", "skill_guidance"].sort()
        );
      }
    );
  });

  test("skill_guidance === skill.skillPrompt (no drift)", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(baseArgs, ctx);
        expect(r.skill_guidance).toBe(closeManagementSkill.skillPrompt);
      }
    );
  });

  test("instructions is a non-empty string ≥ 50 chars", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(baseArgs, ctx);
        expect(typeof r.instructions).toBe("string");
        expect(r.instructions.length).toBeGreaterThanOrEqual(50);
      }
    );
  });

  test("instructions name the four close-plan sections", async () => {
    // day-by-day, dependency map, bottleneck risks, retrospective questions.
    // If any of these is dropped from the prompt, the close-plan output
    // structure changes — fail on purpose so we update deliberately.
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(baseArgs, ctx);
        const ins = r.instructions.toLowerCase();
        expect(ins).toMatch(/day[- ]by[- ]day|task list/);
        expect(ins).toMatch(/dependenc/);
        expect(ins).toMatch(/bottleneck/);
        expect(ins).toMatch(/retrospective/);
      }
    );
  });

  test("instructions mentions the compliance reminder", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(baseArgs, ctx);
        expect(r.instructions.toLowerCase()).toMatch(/compliance|reminder/);
      }
    );
  });

  test("instructions inject the targetDays + closePeriod values", async () => {
    // The literal closePeriod and targetDays end up in the instruction
    // string. Dynamic templating from args.closePeriod is the contract.
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(
          { closePeriod: "2026-09", targetDays: 3 },
          ctx
        );
        expect(r.instructions).toContain("2026-09");
        expect(r.instructions).toContain("3");
      }
    );
  });

  test("data is a plain object with the five expected keys", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(baseArgs, ctx);
        expect(isPlainObject(r.data)).toBe(true);
        expect(Object.keys(r.data).sort()).toEqual(
          [
            "closePeriod",
            "targetDays",
            "entityId",
            "includeFiscalYearEnd",
            "recentConsolidationRuns",
          ].sort()
        );
      }
    );
  });

  test("data passes through closePeriod verbatim", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(baseArgs, ctx);
        expect(r.data.closePeriod).toBe(baseArgs.closePeriod);
      }
    );
  });

  test("fetch swallow yields recentConsolidationRuns = []", async () => {
    // Documents the swallow-on-throw fallback. If the swallow is ever
    // removed (e.g. to surface the error), this test fails on purpose.
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(baseArgs, ctx);
        expect(Array.isArray(r.data.recentConsolidationRuns)).toBe(true);
        expect(r.data.recentConsolidationRuns).toEqual([]);
      }
    );
  });

  test("meta = { skill: 'close-management', closePeriod, targetDays }", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(baseArgs, ctx);
        expect(r.meta).toEqual({
          skill: "close-management",
          closePeriod: baseArgs.closePeriod,
          targetDays: 5,
        });
      }
    );
  });
});

// =========================================================================
// execute() — fetch call surface
// =========================================================================

describe("closeManagementSkill.execute — fetch is called correctly", () => {
  test("calls fetch exactly once per invocation", async () => {
    const spy = makeFetchMock(() =>
      Promise.resolve(fakeResponse(runsEnvelope([])))
    );
    await withFetch(spy, async () => {
      await closeManagementSkill.execute(baseArgs, ctx);
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("targets /api/v2/processes/consolidation/recent with limit=5", async () => {
    const spy = makeFetchMock(() =>
      Promise.resolve(fakeResponse(runsEnvelope([])))
    );
    await withFetch(spy, async () => {
      await closeManagementSkill.execute(baseArgs, ctx);
    });
    const [url] = spy.mock.calls[0];
    expect(typeof url).toBe("string");
    expect(url).toContain("/api/v2/processes/consolidation/recent");
    expect(url).toContain("limit=5");
  });

  test("uses ctx.baseUrl as the URL prefix", async () => {
    const spy = makeFetchMock(() =>
      Promise.resolve(fakeResponse(runsEnvelope([])))
    );
    const localCtx: FinanceSkillContext = {
      ...ctx,
      baseUrl: "https://prod.example.com",
    };
    await withFetch(spy, async () => {
      await closeManagementSkill.execute(baseArgs, localCtx);
    });
    const [url] = spy.mock.calls[0];
    expect(url).toMatch(
      /^https:\/\/prod\.example\.com\/api\/v2\/processes\/consolidation\/recent/
    );
  });

  test("forwards sessionCookie in the Cookie header", async () => {
    const spy = makeFetchMock(() =>
      Promise.resolve(fakeResponse(runsEnvelope([])))
    );
    await withFetch(spy, async () => {
      await closeManagementSkill.execute(baseArgs, ctx);
    });
    const [, init] = spy.mock.calls[0];
    expect(init.headers.Cookie).toBe(ctx.sessionCookie);
  });

  test("sends Content-Type: application/json header", async () => {
    const spy = makeFetchMock(() =>
      Promise.resolve(fakeResponse(runsEnvelope([])))
    );
    await withFetch(spy, async () => {
      await closeManagementSkill.execute(baseArgs, ctx);
    });
    const [, init] = spy.mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("application/json");
  });
});

// =========================================================================
// execute() — fetch success path: recentConsolidationRuns populated
// =========================================================================

describe("closeManagementSkill.execute — recent-runs envelope parsing", () => {
  const sampleRuns = [
    { id: "run_1", scenario: "ACTUAL", entity: "GRP", finishedAt: "2026-04-05" },
    { id: "run_2", scenario: "ACTUAL", entity: "GRP", finishedAt: "2026-03-05" },
    { id: "run_3", scenario: "ACTUAL", entity: "GRP", finishedAt: "2026-02-05" },
  ];

  test("populates recentConsolidationRuns from j.data.runs envelope", async () => {
    const spy = makeFetchMock(() =>
      Promise.resolve(fakeResponse(runsEnvelope(sampleRuns)))
    );
    await withFetch(spy, async () => {
      const r = await closeManagementSkill.execute(baseArgs, ctx);
      expect(r.data.recentConsolidationRuns).toEqual(sampleRuns);
    });
  });

  test("falls back to j.data when .runs key is missing (legacy envelope)", async () => {
    // `j?.data?.runs ?? j?.data ?? []` — if data IS an array directly,
    // use it. This is the legacy / minimal envelope the endpoint may
    // return.
    const spy = makeFetchMock(() =>
      Promise.resolve(fakeResponse({ data: sampleRuns }))
    );
    await withFetch(spy, async () => {
      const r = await closeManagementSkill.execute(baseArgs, ctx);
      expect(r.data.recentConsolidationRuns).toEqual(sampleRuns);
    });
  });

  test("falls back to [] when neither .data.runs nor .data exist", async () => {
    const spy = makeFetchMock(() => Promise.resolve(fakeResponse({})));
    await withFetch(spy, async () => {
      const r = await closeManagementSkill.execute(baseArgs, ctx);
      expect(r.data.recentConsolidationRuns).toEqual([]);
    });
  });

  test("falls back to [] when API returns null body", async () => {
    const spy = makeFetchMock(() => Promise.resolve(fakeResponse(null)));
    await withFetch(spy, async () => {
      const r = await closeManagementSkill.execute(baseArgs, ctx);
      expect(r.data.recentConsolidationRuns).toEqual([]);
    });
  });

  test("caps recentConsolidationRuns at 5 even when API returns more", async () => {
    // .slice(0, 5) is the last operation. If a backend ever sends 50
    // runs, the skill must still cap.
    const tenRuns = Array.from({ length: 10 }, (_, i) => ({ id: `run_${i}` }));
    const spy = makeFetchMock(() =>
      Promise.resolve(fakeResponse(runsEnvelope(tenRuns)))
    );
    await withFetch(spy, async () => {
      const r = await closeManagementSkill.execute(baseArgs, ctx);
      expect(r.data.recentConsolidationRuns).toHaveLength(5);
      expect(r.data.recentConsolidationRuns[0].id).toBe("run_0");
      expect(r.data.recentConsolidationRuns[4].id).toBe("run_4");
    });
  });

  test("empty runs array passes through as []", async () => {
    const spy = makeFetchMock(() =>
      Promise.resolve(fakeResponse(runsEnvelope([])))
    );
    await withFetch(spy, async () => {
      const r = await closeManagementSkill.execute(baseArgs, ctx);
      expect(r.data.recentConsolidationRuns).toEqual([]);
    });
  });

  test("response.json() throwing is swallowed → recentRuns=[]", async () => {
    const badResp: any = {
      ok: true,
      json: async () => {
        throw new Error("bad JSON");
      },
    };
    const spy = makeFetchMock(() => Promise.resolve(badResp));
    await withFetch(spy, async () => {
      const r = await closeManagementSkill.execute(baseArgs, ctx);
      expect(r.data.recentConsolidationRuns).toEqual([]);
    });
  });
});

// =========================================================================
// execute() — targetDays defaulting (only literal 3 trips accelerated)
// =========================================================================

describe("closeManagementSkill.execute — targetDays defaulting", () => {
  test("omitted targetDays → 5 (standard close)", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(baseArgs, ctx);
        expect(r.data.targetDays).toBe(5);
        expect(r.meta?.targetDays).toBe(5);
      }
    );
  });

  test("explicit undefined targetDays → 5", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(
          { ...baseArgs, targetDays: undefined },
          ctx
        );
        expect(r.data.targetDays).toBe(5);
      }
    );
  });

  test("null targetDays → 5 (null !== 3)", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(
          { ...baseArgs, targetDays: null },
          ctx
        );
        expect(r.data.targetDays).toBe(5);
      }
    );
  });

  test("targetDays === 3 → 3 (accelerated)", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(
          { ...baseArgs, targetDays: 3 },
          ctx
        );
        expect(r.data.targetDays).toBe(3);
        expect(r.meta?.targetDays).toBe(3);
      }
    );
  });

  test("targetDays === 5 → 5 (standard, explicit)", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(
          { ...baseArgs, targetDays: 5 },
          ctx
        );
        expect(r.data.targetDays).toBe(5);
      }
    );
  });

  test("targetDays === 4 → 5 (any non-3 number falls through)", async () => {
    // Ternary is `args.targetDays === 3 ? 3 : 5` — strict equality.
    // Anything else (1, 2, 4, 7, 10) silently maps to 5. Documents the
    // current contract; future validation work may want to reject.
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(
          { ...baseArgs, targetDays: 4 },
          ctx
        );
        expect(r.data.targetDays).toBe(5);
      }
    );
  });

  test("targetDays === '3' (string) → 5 (strict ===)", async () => {
    // Document the strict-equality trap: a stringified 3 does NOT match.
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(
          { ...baseArgs, targetDays: "3" as any },
          ctx
        );
        expect(r.data.targetDays).toBe(5);
      }
    );
  });

  test("targetDays === 0 → 5", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(
          { ...baseArgs, targetDays: 0 },
          ctx
        );
        expect(r.data.targetDays).toBe(5);
      }
    );
  });

  test("targetDays === NaN → 5", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(
          { ...baseArgs, targetDays: NaN },
          ctx
        );
        expect(r.data.targetDays).toBe(5);
      }
    );
  });
});

// =========================================================================
// execute() — entityId defaulting
// =========================================================================

describe("closeManagementSkill.execute — entityId defaulting", () => {
  test("omitted entityId → 'consolidated'", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(baseArgs, ctx);
        expect(r.data.entityId).toBe("consolidated");
      }
    );
  });

  test("explicit entityId is passed through", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(
          { ...baseArgs, entityId: "ent_us_hq" },
          ctx
        );
        expect(r.data.entityId).toBe("ent_us_hq");
      }
    );
  });

  test("explicit undefined entityId → 'consolidated' (?? default)", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(
          { ...baseArgs, entityId: undefined },
          ctx
        );
        expect(r.data.entityId).toBe("consolidated");
      }
    );
  });

  test("explicit null entityId → null (?? only short-circuits on undefined)", async () => {
    // Per ts source: `args.entityId ?? "consolidated"` — `null` is NOT
    // defaulted because nullish-coalescing treats null and undefined the
    // same way, BUT in the source it's actually `args.entityId ??` which
    // covers BOTH. Sanity-check what we ship.
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(
          { ...baseArgs, entityId: null as any },
          ctx
        );
        // `null ?? "consolidated"` → "consolidated"
        expect(r.data.entityId).toBe("consolidated");
      }
    );
  });

  test("empty-string entityId is preserved (not defaulted)", async () => {
    // `"" ?? "consolidated"` → "" because empty string is NOT nullish.
    // Documents the current contract: a UI that sends "" gets "" back,
    // not the default. If we ever want "" to mean "use default", this
    // test fires and forces a deliberate switch to `|| "consolidated"`.
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(
          { ...baseArgs, entityId: "" },
          ctx
        );
        expect(r.data.entityId).toBe("");
      }
    );
  });
});

// =========================================================================
// execute() — includeFiscalYearEnd coercion
// =========================================================================

describe("closeManagementSkill.execute — includeFiscalYearEnd coercion", () => {
  test("omitted includeFy → includeFiscalYearEnd === false", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(baseArgs, ctx);
        expect(r.data.includeFiscalYearEnd).toBe(false);
      }
    );
  });

  test("includeFy === true → true", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(
          { ...baseArgs, includeFy: true },
          ctx
        );
        expect(r.data.includeFiscalYearEnd).toBe(true);
      }
    );
  });

  test("includeFy === false → false", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(
          { ...baseArgs, includeFy: false },
          ctx
        );
        expect(r.data.includeFiscalYearEnd).toBe(false);
      }
    );
  });

  test("includeFy === undefined → false (!! coerces)", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(
          { ...baseArgs, includeFy: undefined },
          ctx
        );
        expect(r.data.includeFiscalYearEnd).toBe(false);
      }
    );
  });

  test("includeFy truthy non-boolean → true (!! coerces)", async () => {
    // Documents the boolean-coercion contract — a JSON-deserialized "true"
    // string would also coerce to true. If we ever want strict-boolean
    // validation, this fires.
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(
          { ...baseArgs, includeFy: "yes" as any },
          ctx
        );
        expect(r.data.includeFiscalYearEnd).toBe(true);
      }
    );
  });

  test("includeFy falsy non-boolean → false (!! coerces)", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r = await closeManagementSkill.execute(
          { ...baseArgs, includeFy: 0 as any },
          ctx
        );
        expect(r.data.includeFiscalYearEnd).toBe(false);
      }
    );
  });
});

// =========================================================================
// execute() — purity / non-mutation
// =========================================================================

describe("closeManagementSkill.execute — purity", () => {
  test("does not mutate the caller's args object", async () => {
    await withFetch(
      makeFetchMock(() => Promise.resolve(fakeResponse(runsEnvelope([])))),
      async () => {
        const args = {
          ...baseArgs,
          targetDays: 3,
          entityId: "ent_x",
          includeFy: true,
        };
        const snapshot = JSON.stringify(args);
        await closeManagementSkill.execute(args, ctx);
        expect(JSON.stringify(args)).toBe(snapshot);
      }
    );
  });

  test("does not mutate the caller's ctx object", async () => {
    await withFetch(
      makeFetchMock(() => Promise.resolve(fakeResponse(runsEnvelope([])))),
      async () => {
        const localCtx = { ...ctx };
        const snapshot = JSON.stringify(localCtx);
        await closeManagementSkill.execute(baseArgs, localCtx);
        expect(JSON.stringify(localCtx)).toBe(snapshot);
      }
    );
  });

  test("each call returns a fresh data object (no shared mutable ref)", async () => {
    await withFetch(
      makeFetchMock(() => Promise.resolve(fakeResponse(runsEnvelope([])))),
      async () => {
        const r1 = await closeManagementSkill.execute(baseArgs, ctx);
        const r2 = await closeManagementSkill.execute(baseArgs, ctx);
        expect(r1.data).not.toBe(r2.data);
        expect(r1.data).toEqual(r2.data);
        // Mutating r1.data does not bleed into r2.
        (r1.data as any).closePeriod = "MUTATED";
        expect(r2.data.closePeriod).toBe(baseArgs.closePeriod);
      }
    );
  });

  test("each call returns a fresh meta object", async () => {
    await withFetch(
      makeFetchMock(() => Promise.resolve(fakeResponse(runsEnvelope([])))),
      async () => {
        const r1 = await closeManagementSkill.execute(baseArgs, ctx);
        const r2 = await closeManagementSkill.execute(baseArgs, ctx);
        expect(r1.meta).not.toBe(r2.meta);
        expect(r1.meta).toEqual(r2.meta);
      }
    );
  });

  test("idempotent on the no-history fallback path", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r1 = await closeManagementSkill.execute(baseArgs, ctx);
        const r2 = await closeManagementSkill.execute(baseArgs, ctx);
        expect(r1).toEqual(r2);
      }
    );
  });

  test("does not mutate the API response runs array", async () => {
    // The skill slices the runs array; we want to verify we don't mutate
    // it (e.g. via .reverse() or .sort() — neither is currently used,
    // but pinning this stops a future regression).
    const sourceRuns = [
      { id: "run_a" },
      { id: "run_b" },
      { id: "run_c" },
    ];
    const snapshot = JSON.stringify(sourceRuns);
    const spy = makeFetchMock(() =>
      Promise.resolve(fakeResponse(runsEnvelope(sourceRuns)))
    );
    await withFetch(spy, async () => {
      await closeManagementSkill.execute(baseArgs, ctx);
    });
    expect(JSON.stringify(sourceRuns)).toBe(snapshot);
  });
});

// =========================================================================
// execute() — typed contract
// =========================================================================

describe("closeManagementSkill.execute — typed contract", () => {
  test("FinanceSkillResult interface keys present", async () => {
    await withFetch(
      makeFetchMock(() => Promise.reject(new Error("net"))),
      async () => {
        const r: FinanceSkillResult = await closeManagementSkill.execute(
          baseArgs,
          ctx
        );
        expect(r.skill_guidance).toBeDefined();
        expect(r.data).toBeDefined();
        expect(r.instructions).toBeDefined();
        expect(r.meta).toBeDefined();
      }
    );
  });
});
