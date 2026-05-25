// Unit tests for resolve-client.ts — the thin browser-side wrapper around
// POST /api/v2/pov/resolve. The module is small but LOAD-BEARING: every
// page that migrates onto UnifiedPovPicker calls resolvePov() to convert
// PovSpec codes into the entity / scenario / time IDs the v2 APIs accept.
//
// What this file pins:
//   1. Wire contract — URL, method, credentials, headers, body shape
//   2. Cache behaviour
//      a. miss → fetch made
//      b. hit  → no fetch, same reference returned
//      c. key  = povHashKey(pov)
//      d. clearPovCache() drops everything
//      e. POVs that hash identically (entity-order, null≡undefined, etc.)
//         share a cache slot — pin the dependency on povHashKey semantics
//      f. concurrent identical calls both fetch (no in-flight de-dupe) —
//         pin the limitation so a future de-dupe is a conscious choice
//   3. Response envelope — pulls `data` field off the JSON body
//   4. Error path — r.ok=false → throws with j.error or fallback
//   5. Network failure propagates (no swallow)
//   6. No mutation of input POV (caller can reuse)
//   7. clearPovCache forces refetch even for previously cached POV
//
// Pairs with types.test.ts (which pins povHashKey) — together these two
// files pin the entire client-side POV surface that the Wk2 audit pass
// depends on.

import { resolvePov, clearPovCache, type ResolvedIds } from "./resolve-client";
import { povHashKey, type PovSpec } from "./types";

// ---------- shared helpers ----------

type FetchMock = jest.Mock<Promise<any>, any[]>;

function makeFetchMock(impl: (...args: any[]) => Promise<any>): FetchMock {
  return jest.fn(impl) as unknown as FetchMock;
}

function fakeResponse(body: any, init?: { ok?: boolean; status?: number }): any {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  };
}

/** Build a resolve envelope: { data: { ids, unresolved } }. */
function envelope(
  ids: Partial<ResolvedIds> = {},
  unresolved: string[] = []
): any {
  const fullIds: ResolvedIds = {
    scenarioId:        null,
    compareScenarioId: null,
    timeId:            null,
    entityIds:         [],
    currencyId:        null,
    icpId:             null,
    ...ids,
  };
  return { data: { ids: fullIds, unresolved } };
}

const baseSpec: PovSpec = {
  scenarioCode: "ACT",
  periodCode:   "FY2026",
};

// Fresh module state per test — module's `cache` Map is module-scoped, so
// we call clearPovCache() in beforeEach to guarantee isolation. (We also
// swap fetch back to its original after each test.)
let origFetch: any;
beforeEach(() => {
  clearPovCache();
  origFetch = (globalThis as any).fetch;
});
afterEach(() => {
  (globalThis as any).fetch = origFetch;
});

// =========================================================================
// Wire contract — URL, method, credentials, headers, body
// =========================================================================

describe("resolvePov — wire contract", () => {
  test("hits POST /api/v2/pov/resolve exactly once on a cache miss", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov(baseSpec);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v2/pov/resolve");
  });

  test("uses HTTP POST", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov(baseSpec);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
  });

  test("sends credentials: 'include' (cookie-bearing)", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov(baseSpec);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe("include");
  });

  test("sets Content-Type: application/json header", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov(baseSpec);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  test("body is JSON.stringify of the input PovSpec verbatim", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    const spec: PovSpec = {
      scenarioCode: "BUD",
      periodCode:   "2026Q2",
      entityCodes:  ["E1", "E2"],
      currencyCode: "USD",
    };
    await resolvePov(spec);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(JSON.stringify(spec));
  });

  test("body preserves all 14 PovSpec fields (no field stripping)", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    const spec: PovSpec = {
      scenarioCode: "ACT",
      periodCode:   "FY2026",
      compareScenarioCode: "BUD",
      entityCodes: ["E1"],
      currencyCode: "INR",
      icpCode: "ICP1",
      ud1Code: "U1", ud2Code: "U2", ud3Code: "U3", ud4Code: "U4",
      ud5Code: "U5", ud6Code: "U6", ud7Code: "U7", ud8Code: "U8",
    };
    await resolvePov(spec);
    const [, init] = fetchMock.mock.calls[0];
    const parsed = JSON.parse(init.body);
    expect(parsed).toEqual(spec);
  });

  test("only ONE fetch call per resolvePov invocation (no preflight/retry)", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov(baseSpec);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("init object has exactly 4 documented keys (no surprise extras)", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov(baseSpec);
    const [, init] = fetchMock.mock.calls[0];
    expect(Object.keys(init).sort()).toEqual(
      ["body", "credentials", "headers", "method"].sort()
    );
  });
});

// =========================================================================
// Response envelope — pulls `data` field
// =========================================================================

describe("resolvePov — response envelope", () => {
  test("returns the `data` field of the JSON body (not the whole envelope)", async () => {
    const ids: ResolvedIds = {
      scenarioId:        "scn_1",
      compareScenarioId: null,
      timeId:            "tm_1",
      entityIds:         ["e_1", "e_2"],
      currencyId:        "cur_1",
      icpId:             null,
    };
    (globalThis as any).fetch = makeFetchMock(async () =>
      fakeResponse({ data: { ids, unresolved: ["X1"] }, meta: "ignored" })
    );
    const out = await resolvePov(baseSpec);
    expect(out).toEqual({ ids, unresolved: ["X1"] });
  });

  test("returns { ids, unresolved } shape exactly", async () => {
    (globalThis as any).fetch = makeFetchMock(async () =>
      fakeResponse(envelope({ scenarioId: "s1" }, ["bad-code"]))
    );
    const out = await resolvePov(baseSpec);
    expect(Object.keys(out).sort()).toEqual(["ids", "unresolved"].sort());
  });

  test("ids retains all six ResolvedIds keys", async () => {
    (globalThis as any).fetch = makeFetchMock(async () =>
      fakeResponse(envelope({ scenarioId: "s1", timeId: "t1", entityIds: ["e1"] }))
    );
    const out = await resolvePov(baseSpec);
    expect(Object.keys(out.ids).sort()).toEqual(
      [
        "compareScenarioId",
        "currencyId",
        "entityIds",
        "icpId",
        "scenarioId",
        "timeId",
      ].sort()
    );
  });

  test("unresolved preserves order (no sorting)", async () => {
    (globalThis as any).fetch = makeFetchMock(async () =>
      fakeResponse(envelope({}, ["Z", "A", "M", "B"]))
    );
    const out = await resolvePov(baseSpec);
    expect(out.unresolved).toEqual(["Z", "A", "M", "B"]);
  });

  test("empty unresolved comes through as []", async () => {
    (globalThis as any).fetch = makeFetchMock(async () =>
      fakeResponse(envelope({}, []))
    );
    const out = await resolvePov(baseSpec);
    expect(out.unresolved).toEqual([]);
  });
});

// =========================================================================
// Error path — r.ok=false
// =========================================================================

describe("resolvePov — error handling", () => {
  test("r.ok=false + j.error → throws Error with j.error message", async () => {
    (globalThis as any).fetch = makeFetchMock(async () =>
      fakeResponse({ error: "scenario not found" }, { ok: false, status: 404 })
    );
    await expect(resolvePov(baseSpec)).rejects.toThrow("scenario not found");
  });

  test("r.ok=false + no j.error → falls back to 'HTTP {status}'", async () => {
    (globalThis as any).fetch = makeFetchMock(async () =>
      fakeResponse({}, { ok: false, status: 500 })
    );
    await expect(resolvePov(baseSpec)).rejects.toThrow("HTTP 500");
  });

  test("r.ok=false + null j.error → falls back to 'HTTP {status}'", async () => {
    (globalThis as any).fetch = makeFetchMock(async () =>
      fakeResponse({ error: null }, { ok: false, status: 401 })
    );
    await expect(resolvePov(baseSpec)).rejects.toThrow("HTTP 401");
  });

  test("r.ok=false + undefined j.error → falls back to 'HTTP {status}'", async () => {
    (globalThis as any).fetch = makeFetchMock(async () =>
      fakeResponse({ error: undefined }, { ok: false, status: 403 })
    );
    await expect(resolvePov(baseSpec)).rejects.toThrow("HTTP 403");
  });

  test("error path does NOT populate the cache", async () => {
    (globalThis as any).fetch = makeFetchMock(async () =>
      fakeResponse({ error: "boom" }, { ok: false, status: 500 })
    );
    await expect(resolvePov(baseSpec)).rejects.toThrow("boom");
    // Second call must fetch again (cache empty for this key)
    const ok = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = ok;
    await resolvePov(baseSpec);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  test("network failure (fetch rejects) propagates", async () => {
    (globalThis as any).fetch = makeFetchMock(() =>
      Promise.reject(new Error("net down"))
    );
    await expect(resolvePov(baseSpec)).rejects.toThrow("net down");
  });

  test("json() failure propagates", async () => {
    (globalThis as any).fetch = makeFetchMock(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("invalid json");
      },
    }));
    await expect(resolvePov(baseSpec)).rejects.toThrow("invalid json");
  });

  test("network failure does NOT populate cache (retry will refetch)", async () => {
    (globalThis as any).fetch = makeFetchMock(() =>
      Promise.reject(new Error("net"))
    );
    await expect(resolvePov(baseSpec)).rejects.toThrow();
    const ok = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = ok;
    await resolvePov(baseSpec);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  test("thrown error is a real Error instance (not a string)", async () => {
    (globalThis as any).fetch = makeFetchMock(async () =>
      fakeResponse({ error: "x" }, { ok: false, status: 400 })
    );
    try {
      await resolvePov(baseSpec);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
    }
  });
});

// =========================================================================
// Cache behaviour
// =========================================================================

describe("resolvePov — cache: miss & hit", () => {
  test("first call MISS → fetch made once", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov(baseSpec);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("second call same POV HIT → no fetch", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov(baseSpec);
    await resolvePov(baseSpec);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("third+ call same POV still HIT → no fetch", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov(baseSpec);
    await resolvePov(baseSpec);
    await resolvePov(baseSpec);
    await resolvePov(baseSpec);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("HIT returns the SAME reference as the cached value", async () => {
    (globalThis as any).fetch = makeFetchMock(async () =>
      fakeResponse(envelope({ scenarioId: "s1" }))
    );
    const a = await resolvePov(baseSpec);
    const b = await resolvePov(baseSpec);
    expect(b).toBe(a);
  });

  test("HIT preserves ids reference identity (caller can rely on ===)", async () => {
    (globalThis as any).fetch = makeFetchMock(async () =>
      fakeResponse(envelope({ entityIds: ["e1", "e2"] }))
    );
    const a = await resolvePov(baseSpec);
    const b = await resolvePov(baseSpec);
    expect(b.ids).toBe(a.ids);
    expect(b.ids.entityIds).toBe(a.ids.entityIds);
  });
});

describe("resolvePov — cache: key uses povHashKey", () => {
  test("different scenarioCode → different cache slot (refetch)", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov({ ...baseSpec, scenarioCode: "ACT" });
    await resolvePov({ ...baseSpec, scenarioCode: "BUD" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("different periodCode → different cache slot (refetch)", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov({ ...baseSpec, periodCode: "FY2026" });
    await resolvePov({ ...baseSpec, periodCode: "2026Q2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("different entityCodes → different cache slot (refetch)", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov({ ...baseSpec, entityCodes: ["E1"] });
    await resolvePov({ ...baseSpec, entityCodes: ["E2"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("each of ud1..ud8 distinctly affects cache key", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov(baseSpec);
    await resolvePov({ ...baseSpec, ud1Code: "X" });
    await resolvePov({ ...baseSpec, ud2Code: "X" });
    await resolvePov({ ...baseSpec, ud3Code: "X" });
    await resolvePov({ ...baseSpec, ud4Code: "X" });
    await resolvePov({ ...baseSpec, ud5Code: "X" });
    await resolvePov({ ...baseSpec, ud6Code: "X" });
    await resolvePov({ ...baseSpec, ud7Code: "X" });
    await resolvePov({ ...baseSpec, ud8Code: "X" });
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });

  test("compareScenarioCode change → different cache slot", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov({ ...baseSpec, compareScenarioCode: "BUD" });
    await resolvePov({ ...baseSpec, compareScenarioCode: "FCST" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("currencyCode change → different cache slot", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov({ ...baseSpec, currencyCode: "USD" });
    await resolvePov({ ...baseSpec, currencyCode: "INR" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("icpCode change → different cache slot", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov({ ...baseSpec, icpCode: "ICP1" });
    await resolvePov({ ...baseSpec, icpCode: "ICP2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("resolvePov — cache: povHashKey-equivalent POVs share a slot", () => {
  test("entityCodes order does NOT affect cache (povHashKey sorts)", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov({ ...baseSpec, entityCodes: ["E1", "E2", "E3"] });
    await resolvePov({ ...baseSpec, entityCodes: ["E3", "E2", "E1"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("entityCodes undefined ≡ [] (povHashKey contract)", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov({ ...baseSpec, entityCodes: undefined });
    await resolvePov({ ...baseSpec, entityCodes: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("compareScenarioCode null ≡ undefined (povHashKey contract)", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov({ ...baseSpec, compareScenarioCode: null });
    await resolvePov({ ...baseSpec, compareScenarioCode: undefined });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("currencyCode undefined ≡ absent (povHashKey contract)", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov(baseSpec);
    await resolvePov({ ...baseSpec, currencyCode: undefined });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("ud1..ud8 null ≡ undefined ≡ absent across all 8 slots", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov({
      ...baseSpec,
      ud1Code: null, ud2Code: null, ud3Code: null, ud4Code: null,
      ud5Code: null, ud6Code: null, ud7Code: null, ud8Code: null,
    });
    await resolvePov(baseSpec); // all undefined
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("cache key derives from povHashKey directly (sanity)", async () => {
    // Two specs with same hash must share cache; two with different hashes
    // must NOT — the strongest possible contract test.
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    const a: PovSpec = { ...baseSpec, entityCodes: ["E1", "E2"] };
    const b: PovSpec = { ...baseSpec, entityCodes: ["E2", "E1"] };
    expect(povHashKey(a)).toBe(povHashKey(b));
    await resolvePov(a);
    await resolvePov(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const c: PovSpec = { ...baseSpec, entityCodes: ["E1", "E3"] };
    expect(povHashKey(a)).not.toBe(povHashKey(c));
    await resolvePov(c);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("resolvePov — cache: clearPovCache", () => {
  test("after clearPovCache() previously-cached POV refetches", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov(baseSpec);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clearPovCache();
    await resolvePov(baseSpec);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("clearPovCache() drops ALL entries, not just one", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov({ ...baseSpec, scenarioCode: "ACT" });
    await resolvePov({ ...baseSpec, scenarioCode: "BUD" });
    await resolvePov({ ...baseSpec, scenarioCode: "FCST" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    clearPovCache();
    await resolvePov({ ...baseSpec, scenarioCode: "ACT" });
    await resolvePov({ ...baseSpec, scenarioCode: "BUD" });
    await resolvePov({ ...baseSpec, scenarioCode: "FCST" });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  test("clearPovCache() returns undefined (void contract)", () => {
    expect(clearPovCache()).toBeUndefined();
  });

  test("clearPovCache() on already-empty cache is a no-op (no throw)", () => {
    clearPovCache();
    expect(() => clearPovCache()).not.toThrow();
  });

  test("clearPovCache() does not crash mid-resolve (race tolerant)", async () => {
    (globalThis as any).fetch = makeFetchMock(async () => fakeResponse(envelope()));
    const p = resolvePov(baseSpec);
    clearPovCache();
    await expect(p).resolves.toBeDefined();
  });
});

describe("resolvePov — cache: concurrent calls", () => {
  test("two concurrent calls with same POV BOTH fetch (no in-flight dedupe)", async () => {
    // This pin documents the current limitation: there is no in-flight
    // request de-duplication. If two pages mount simultaneously with the
    // same POV, both will fire a fetch. If a future change adds in-flight
    // de-duplication this test will fail and the author must update both
    // the implementation and the test deliberately.
    let resolveFirst: (v: any) => void;
    const first = new Promise<any>((res) => { resolveFirst = res; });
    let calls = 0;
    const fetchMock = makeFetchMock(async () => {
      calls++;
      if (calls === 1) return first;
      return fakeResponse(envelope());
    });
    (globalThis as any).fetch = fetchMock;
    const p1 = resolvePov(baseSpec);
    const p2 = resolvePov(baseSpec);
    resolveFirst!(fakeResponse(envelope()));
    await Promise.all([p1, p2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("after both concurrent calls settle, the cache holds the LAST set value", async () => {
    let calls = 0;
    const fetchMock = makeFetchMock(async () => {
      calls++;
      return fakeResponse(envelope({ scenarioId: `s${calls}` }));
    });
    (globalThis as any).fetch = fetchMock;
    const [a, b] = await Promise.all([resolvePov(baseSpec), resolvePov(baseSpec)]);
    // Both calls returned their own freshly-fetched value
    expect(a.ids.scenarioId).toBe("s1");
    expect(b.ids.scenarioId).toBe("s2");
    // Subsequent call should hit cache and return whatever landed last
    const c = await resolvePov(baseSpec);
    expect(c.ids.scenarioId).toBe("s2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// =========================================================================
// Input mutation safety — caller passes POV by reference
// =========================================================================

describe("resolvePov — input mutation safety", () => {
  test("does NOT mutate the input PovSpec on success", async () => {
    (globalThis as any).fetch = makeFetchMock(async () => fakeResponse(envelope()));
    const spec: PovSpec = {
      scenarioCode: "ACT",
      periodCode:   "FY2026",
      entityCodes:  ["E1", "E2"],
    };
    const snapshot = JSON.parse(JSON.stringify(spec));
    await resolvePov(spec);
    expect(spec).toEqual(snapshot);
  });

  test("does NOT mutate the input entityCodes array on success", async () => {
    (globalThis as any).fetch = makeFetchMock(async () => fakeResponse(envelope()));
    const ents = ["B", "A", "C"];
    await resolvePov({ ...baseSpec, entityCodes: ents });
    expect(ents).toEqual(["B", "A", "C"]); // not sorted in place
  });

  test("does NOT mutate the input PovSpec on error", async () => {
    (globalThis as any).fetch = makeFetchMock(async () =>
      fakeResponse({ error: "x" }, { ok: false, status: 400 })
    );
    const spec: PovSpec = {
      scenarioCode: "ACT",
      periodCode:   "FY2026",
      entityCodes:  ["E1"],
    };
    const snapshot = JSON.parse(JSON.stringify(spec));
    await expect(resolvePov(spec)).rejects.toThrow();
    expect(spec).toEqual(snapshot);
  });

  test("frozen input PovSpec works without throwing", async () => {
    (globalThis as any).fetch = makeFetchMock(async () => fakeResponse(envelope()));
    const spec = Object.freeze({
      scenarioCode: "ACT",
      periodCode:   "FY2026",
    }) as PovSpec;
    await expect(resolvePov(spec)).resolves.toBeDefined();
  });
});

// =========================================================================
// Return value identity — separate ResolvedIds typed inside `out`
// =========================================================================

describe("resolvePov — return value shape", () => {
  test("returns a plain object", async () => {
    (globalThis as any).fetch = makeFetchMock(async () => fakeResponse(envelope()));
    const out = await resolvePov(baseSpec);
    expect(typeof out).toBe("object");
    expect(out).not.toBeNull();
  });

  test("out.ids carries the six ResolvedIds keys exactly", async () => {
    (globalThis as any).fetch = makeFetchMock(async () => fakeResponse(envelope()));
    const out = await resolvePov(baseSpec);
    expect("scenarioId" in out.ids).toBe(true);
    expect("compareScenarioId" in out.ids).toBe(true);
    expect("timeId" in out.ids).toBe(true);
    expect("entityIds" in out.ids).toBe(true);
    expect("currencyId" in out.ids).toBe(true);
    expect("icpId" in out.ids).toBe(true);
  });

  test("out.unresolved is always an array", async () => {
    (globalThis as any).fetch = makeFetchMock(async () => fakeResponse(envelope()));
    const out = await resolvePov(baseSpec);
    expect(Array.isArray(out.unresolved)).toBe(true);
  });

  test("function is async (returns a Promise)", () => {
    (globalThis as any).fetch = makeFetchMock(async () => fakeResponse(envelope()));
    const ret = resolvePov(baseSpec);
    expect(typeof (ret as Promise<unknown>).then).toBe("function");
    return ret; // settle so afterEach can restore fetch
  });
});

// =========================================================================
// Integration — chained resolutions across multiple POVs
// =========================================================================

describe("resolvePov — integration: mixed cache hits & misses", () => {
  test("realistic Wk2 audit pass shape: dashboard hits then reports miss", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    // Dashboard loads with default POV
    await resolvePov({ scenarioCode: "ACT", periodCode: "FY2026" });
    // User changes period — new POV, new fetch
    await resolvePov({ scenarioCode: "ACT", periodCode: "2026Q2" });
    // User goes to /reports/income-statement (same POV as dashboard)
    await resolvePov({ scenarioCode: "ACT", periodCode: "2026Q2" });
    // User returns to dashboard (same POV)
    await resolvePov({ scenarioCode: "ACT", periodCode: "2026Q2" });
    // Total fetches: only 2 (first dashboard + period change)
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("user-driven cache invalidation via clearPovCache between flows", async () => {
    const fetchMock = makeFetchMock(async () => fakeResponse(envelope()));
    (globalThis as any).fetch = fetchMock;
    await resolvePov(baseSpec);
    await resolvePov(baseSpec); // hit
    clearPovCache(); // tenant switches, metadata might have changed
    await resolvePov(baseSpec); // refetch
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("error on one POV does not poison cache for other POVs", async () => {
    let n = 0;
    (globalThis as any).fetch = makeFetchMock(async () => {
      n++;
      if (n === 1) return fakeResponse({ error: "bad" }, { ok: false, status: 400 });
      return fakeResponse(envelope({ scenarioId: "ok" }));
    });
    await expect(resolvePov({ ...baseSpec, scenarioCode: "BAD" })).rejects.toThrow();
    const ok = await resolvePov({ ...baseSpec, scenarioCode: "GOOD" });
    expect(ok.ids.scenarioId).toBe("ok");
  });
});
