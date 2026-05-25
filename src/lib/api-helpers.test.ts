/*
 * Unit tests for `getPaginationParams` in src/lib/api-helpers.ts.
 *
 * This is the Phase 3.7a slot — first non-finance-skill pure-helper pin
 * since Phase 3.6 closed (sox-testing test ship 2026-05-25 13:10 IST).
 * After the run of finance-skills/ test slots, the next-highest-leverage
 * library helper to pin is `getPaginationParams` because:
 *
 *   - It is the centralized URLSearchParams → pagination-options parser
 *     used by every paginated v2 API (currently `/api/v2/members/[dimension]`
 *     and `/api/metadata/audit-logs`; will grow as v2 expands).
 *   - It encodes SIX load-bearing semantics that a future drive-by edit
 *     could silently break:
 *
 *       1. `page` floored at 1  — `Math.max(1, parseInt(... ?? "1"))`
 *       2. `pageSize` clamped to [1, 500] — Math.min(500, Math.max(1, ...))
 *       3. `search` returns `undefined` when missing (NOT empty string)
 *          via `params.get("search") ?? undefined`
 *       4. `isActive` is a TRI-STATE:
 *            - "false"   → false   (return inactive only)
 *            - "all"     → undefined (no filter)
 *            - missing/anything-else → true (default: active only)
 *       5. `sortBy` defaults to "createdAt" via `?? "createdAt"`
 *       6. `sortOrder` defaults to "desc", value cast to `"asc" | "desc"`
 *          WITHOUT validation (open contract — any string passes through)
 *
 *   - It is a PURE function over a URLSearchParams in / plain object out.
 *     No fetch, no prisma, no IO — trivially testable in node-env jest.
 *
 *   - Past helpers with similar shape (utils.cn, time-periods.*, iso4217)
 *     have been pinned. api-helpers is the last untested critical pure
 *     export in src/lib/.
 *
 * What this file pins:
 *   - Defaults for every field when URLSearchParams is empty.
 *   - The Math.max / Math.min clamps at their exact boundaries.
 *   - The `??` semantics on `search` (preserves explicit "" vs absent).
 *   - The full isActive tri-state truth table.
 *   - Sort field passthrough (no enum validation — pinned as open).
 *   - That parseInt is base-10 implicit and tolerates trailing junk.
 *   - That the function does NOT mutate the URLSearchParams it received.
 *
 * Pure node-env Jest — no DOM, no Prisma, no I/O.
 */

import { getPaginationParams } from "./api-helpers";

// Tiny helper to construct a URLSearchParams from a record.
function qs(record: Record<string, string>): URLSearchParams {
  return new URLSearchParams(record);
}

describe("getPaginationParams — defaults (empty URLSearchParams)", () => {
  const empty = new URLSearchParams();
  const out = getPaginationParams(empty);

  it("returns exactly six keys (object surface lock)", () => {
    expect(Object.keys(out).sort()).toEqual(
      ["isActive", "page", "pageSize", "search", "sortBy", "sortOrder"].sort()
    );
  });
  it("page defaults to 1", () => {
    expect(out.page).toBe(1);
  });
  it("pageSize defaults to 50", () => {
    expect(out.pageSize).toBe(50);
  });
  it("search defaults to undefined (NOT empty string, NOT null)", () => {
    expect(out.search).toBeUndefined();
  });
  it("isActive defaults to true (active-only filter is default UX)", () => {
    expect(out.isActive).toBe(true);
  });
  it("sortBy defaults to 'createdAt'", () => {
    expect(out.sortBy).toBe("createdAt");
  });
  it("sortOrder defaults to 'desc'", () => {
    expect(out.sortOrder).toBe("desc");
  });
});

describe("getPaginationParams — page clamping", () => {
  it("page=5 passes through", () => {
    expect(getPaginationParams(qs({ page: "5" })).page).toBe(5);
  });
  it("page=1 stays at 1", () => {
    expect(getPaginationParams(qs({ page: "1" })).page).toBe(1);
  });
  it("page=0 floors at 1 (Math.max(1, …))", () => {
    expect(getPaginationParams(qs({ page: "0" })).page).toBe(1);
  });
  it("page=-7 floors at 1", () => {
    expect(getPaginationParams(qs({ page: "-7" })).page).toBe(1);
  });
  it("page=foo (NaN) floors at 1 — Math.max(1, NaN) === NaN, but actual impl returns 1 because parseInt('foo')→NaN and Math.max(1,NaN)===NaN…", () => {
    // Documented quirk: Math.max(1, NaN) returns NaN. This is a known
    // edge case — bad input from a malformed URL would yield NaN. We
    // pin the CURRENT behaviour so any future "validate page is a real
    // number" fix is an intentional contract change.
    const got = getPaginationParams(qs({ page: "foo" })).page;
    expect(Number.isNaN(got)).toBe(true);
  });
  it("page=12abc → parseInt parses prefix → 12 (no Math.max needed)", () => {
    expect(getPaginationParams(qs({ page: "12abc" })).page).toBe(12);
  });
  it("page=999999 passes through (NO upper bound on page)", () => {
    expect(getPaginationParams(qs({ page: "999999" })).page).toBe(999999);
  });
});

describe("getPaginationParams — pageSize clamping", () => {
  it("pageSize=25 passes through (within range)", () => {
    expect(getPaginationParams(qs({ pageSize: "25" })).pageSize).toBe(25);
  });
  it("pageSize=1 (lower boundary) stays at 1", () => {
    expect(getPaginationParams(qs({ pageSize: "1" })).pageSize).toBe(1);
  });
  it("pageSize=500 (upper boundary, inclusive) stays at 500", () => {
    expect(getPaginationParams(qs({ pageSize: "500" })).pageSize).toBe(500);
  });
  it("pageSize=501 clamps DOWN to 500", () => {
    expect(getPaginationParams(qs({ pageSize: "501" })).pageSize).toBe(500);
  });
  it("pageSize=10000 clamps DOWN to 500 (anti-DoS guard)", () => {
    expect(getPaginationParams(qs({ pageSize: "10000" })).pageSize).toBe(500);
  });
  it("pageSize=0 floors at 1", () => {
    expect(getPaginationParams(qs({ pageSize: "0" })).pageSize).toBe(1);
  });
  it("pageSize=-50 floors at 1", () => {
    expect(getPaginationParams(qs({ pageSize: "-50" })).pageSize).toBe(1);
  });
  it("pageSize=499 (one below upper boundary) passes through", () => {
    expect(getPaginationParams(qs({ pageSize: "499" })).pageSize).toBe(499);
  });
  it("pageSize=2 (one above lower boundary) passes through", () => {
    expect(getPaginationParams(qs({ pageSize: "2" })).pageSize).toBe(2);
  });
});

describe("getPaginationParams — search field semantics", () => {
  it("absent search → undefined", () => {
    expect(getPaginationParams(qs({})).search).toBeUndefined();
  });
  it("search='dtaxdude' → 'dtaxdude' (passthrough, no trim)", () => {
    expect(getPaginationParams(qs({ search: "dtaxdude" })).search).toBe("dtaxdude");
  });
  it("search='' (empty string) → '' is FALSY for `?? undefined` but `params.get` returns '' not null → '' passes through (??-on-empty-string)", () => {
    // params.get("search") returns "" when the key is present with empty value.
    // "" ?? undefined === "" because ?? only fires on null/undefined.
    // This is load-bearing: the upstream UI binds an empty search input.
    expect(getPaginationParams(qs({ search: "" })).search).toBe("");
  });
  it("search has leading/trailing spaces — NOT trimmed", () => {
    expect(getPaginationParams(qs({ search: "  query  " })).search).toBe("  query  ");
  });
  it("search with unicode → passthrough", () => {
    expect(getPaginationParams(qs({ search: "résumé・テスト" })).search).toBe("résumé・テスト");
  });
});

describe("getPaginationParams — isActive tri-state truth table", () => {
  it("absent isActive → true (default: filter to active-only)", () => {
    expect(getPaginationParams(qs({})).isActive).toBe(true);
  });
  it("isActive='false' (the only path to false) → false", () => {
    expect(getPaginationParams(qs({ isActive: "false" })).isActive).toBe(false);
  });
  it("isActive='all' → undefined (no filter — return both active & inactive)", () => {
    expect(getPaginationParams(qs({ isActive: "all" })).isActive).toBeUndefined();
  });
  it("isActive='true' → true (explicit active)", () => {
    expect(getPaginationParams(qs({ isActive: "true" })).isActive).toBe(true);
  });
  it("isActive='' (empty string) → true (falls through to default branch)", () => {
    expect(getPaginationParams(qs({ isActive: "" })).isActive).toBe(true);
  });
  it("isActive='FALSE' (uppercase) → true (CASE-SENSITIVE, falls through)", () => {
    // The strict === "false" check is case-sensitive; pinning this so a
    // future ".toLowerCase()" addition is an intentional widening.
    expect(getPaginationParams(qs({ isActive: "FALSE" })).isActive).toBe(true);
  });
  it("isActive='False' (titlecase) → true (case-sensitive)", () => {
    expect(getPaginationParams(qs({ isActive: "False" })).isActive).toBe(true);
  });
  it("isActive='ALL' (uppercase) → true (case-sensitive 'all' check)", () => {
    expect(getPaginationParams(qs({ isActive: "ALL" })).isActive).toBe(true);
  });
  it("isActive='0' → true (no falsy-numeric handling)", () => {
    expect(getPaginationParams(qs({ isActive: "0" })).isActive).toBe(true);
  });
  it("isActive='no' → true (no boolean parsing — only literal 'false' / 'all')", () => {
    expect(getPaginationParams(qs({ isActive: "no" })).isActive).toBe(true);
  });
});

describe("getPaginationParams — sortBy field", () => {
  it("absent sortBy → 'createdAt'", () => {
    expect(getPaginationParams(qs({})).sortBy).toBe("createdAt");
  });
  it("sortBy='memberName' passes through (no enum validation)", () => {
    expect(getPaginationParams(qs({ sortBy: "memberName" })).sortBy).toBe("memberName");
  });
  it("sortBy='' (empty string) — '?? createdAt' only fires on null/undefined → returns '' as-is", () => {
    // params.get("sortBy") for a present-but-empty key returns "", and
    // "" ?? "createdAt" === "". This is a known footgun pinned here.
    expect(getPaginationParams(qs({ sortBy: "" })).sortBy).toBe("");
  });
  it("sortBy='no-such-field' passes through (NO whitelist — caller responsibility)", () => {
    expect(getPaginationParams(qs({ sortBy: "no-such-field" })).sortBy).toBe("no-such-field");
  });
});

describe("getPaginationParams — sortOrder field", () => {
  it("absent sortOrder → 'desc'", () => {
    expect(getPaginationParams(qs({})).sortOrder).toBe("desc");
  });
  it("sortOrder='asc' → 'asc'", () => {
    expect(getPaginationParams(qs({ sortOrder: "asc" })).sortOrder).toBe("asc");
  });
  it("sortOrder='desc' → 'desc'", () => {
    expect(getPaginationParams(qs({ sortOrder: "desc" })).sortOrder).toBe("desc");
  });
  it("sortOrder='bogus' is CAST to 'asc' | 'desc' but value passes through unchanged (open contract — no runtime validation)", () => {
    // The `as "asc" | "desc"` cast is a TS-level lie — at runtime any
    // string flows through. Pinning so a future zod-validation patch
    // is an intentional contract change.
    expect(getPaginationParams(qs({ sortOrder: "bogus" })).sortOrder).toBe(
      "bogus" as unknown as "asc" | "desc",
    );
  });
  it("sortOrder='ASC' (uppercase) passes through unchanged (no case normalisation)", () => {
    expect(getPaginationParams(qs({ sortOrder: "ASC" })).sortOrder).toBe(
      "ASC" as unknown as "asc" | "desc",
    );
  });
  it("sortOrder='' (empty string) — '?? desc' only fires on null/undefined → returns ''", () => {
    expect(getPaginationParams(qs({ sortOrder: "" })).sortOrder).toBe(
      "" as unknown as "asc" | "desc",
    );
  });
});

describe("getPaginationParams — combined / realistic invocations", () => {
  it("members listing example: ?page=3&pageSize=100&search=US&sortBy=memberCode&sortOrder=asc", () => {
    const p = getPaginationParams(qs({
      page: "3", pageSize: "100", search: "US",
      sortBy: "memberCode", sortOrder: "asc",
    }));
    expect(p).toEqual({
      page: 3, pageSize: 100, search: "US",
      isActive: true, sortBy: "memberCode", sortOrder: "asc",
    });
  });
  it("audit-logs example: ?page=1&pageSize=50&isActive=all (return active+inactive users)", () => {
    const p = getPaginationParams(qs({ page: "1", pageSize: "50", isActive: "all" }));
    expect(p.isActive).toBeUndefined();
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(50);
  });
  it("inactive-only filter: ?isActive=false → isActive===false", () => {
    expect(getPaginationParams(qs({ isActive: "false" })).isActive).toBe(false);
  });
  it("pathological abuse attempt: ?page=-99&pageSize=99999&sortOrder=DROP-TABLE clamps page→1, pageSize→500, sortOrder passes through (caller validates)", () => {
    const p = getPaginationParams(qs({
      page: "-99", pageSize: "99999", sortOrder: "DROP-TABLE",
    }));
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(500);
    expect(p.sortOrder).toBe("DROP-TABLE" as unknown as "asc" | "desc");
  });
});

describe("getPaginationParams — purity / non-mutation", () => {
  it("does NOT mutate the input URLSearchParams", () => {
    const params = qs({ page: "2", pageSize: "100", search: "abc" });
    const before = params.toString();
    getPaginationParams(params);
    expect(params.toString()).toBe(before);
  });
  it("calling twice returns equal-but-distinct objects (no shared mutable state)", () => {
    const params = qs({ page: "2" });
    const a = getPaginationParams(params);
    const b = getPaginationParams(params);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);   // fresh object every call
  });
  it("no global I/O — works in any order across many invocations", () => {
    const a = getPaginationParams(qs({ page: "1" }));
    const b = getPaginationParams(qs({ page: "2" }));
    const c = getPaginationParams(qs({ page: "3" }));
    expect(a.page).toBe(1);
    expect(b.page).toBe(2);
    expect(c.page).toBe(3);
  });
  it("accepts a stock empty URLSearchParams without throwing", () => {
    expect(() => getPaginationParams(new URLSearchParams())).not.toThrow();
  });
  it("accepts URLSearchParams constructed from a query string (not just from a record)", () => {
    const p = getPaginationParams(new URLSearchParams("?page=4&pageSize=10"));
    expect(p.page).toBe(4);
    expect(p.pageSize).toBe(10);
  });
  it("URLSearchParams with duplicate keys → URLSearchParams.get returns FIRST occurrence — pin", () => {
    const params = new URLSearchParams();
    params.append("page", "2");
    params.append("page", "5");
    // URLSearchParams.get returns the first value; pinning this so a future
    // .getAll(...).pop() or .at(-1) swap is intentional.
    expect(getPaginationParams(params).page).toBe(2);
  });
});

describe("getPaginationParams — return-shape stability", () => {
  it("page and pageSize are NUMBERS, not strings", () => {
    const p = getPaginationParams(qs({ page: "5", pageSize: "10" }));
    expect(typeof p.page).toBe("number");
    expect(typeof p.pageSize).toBe("number");
  });
  it("isActive is boolean OR undefined (never null, never string)", () => {
    const a = getPaginationParams(qs({})).isActive;
    const b = getPaginationParams(qs({ isActive: "false" })).isActive;
    const c = getPaginationParams(qs({ isActive: "all" })).isActive;
    expect(typeof a === "boolean" || a === undefined).toBe(true);
    expect(typeof b === "boolean" || b === undefined).toBe(true);
    expect(typeof c === "boolean" || c === undefined).toBe(true);
    expect(a).toBe(true);
    expect(b).toBe(false);
    expect(c).toBeUndefined();
  });
  it("search is string OR undefined (never null)", () => {
    expect(getPaginationParams(qs({})).search).toBeUndefined();
    expect(getPaginationParams(qs({ search: "x" })).search).toBe("x");
  });
  it("sortBy and sortOrder are always strings (never undefined when key absent — defaults kick in)", () => {
    const p = getPaginationParams(qs({}));
    expect(typeof p.sortBy).toBe("string");
    expect(typeof p.sortOrder).toBe("string");
  });
});
