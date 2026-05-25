/*
 * Unit tests for `src/lib/utils.ts`.
 *
 * These helpers are imported by ~every API route and React component
 * in the app: `cn` styles every Tailwind className, `apiResponse` /
 * `apiError` wrap every JSON handler, `paginate` + `buildWhereClause`
 * back every list endpoint, and `formatCurrency` / `formatPercent` /
 * `formatDate` drive every report cell and dashboard tile.
 *
 * A regression here ripples through the entire UI (numbers stop
 * formatting), the API contract (response shapes shift), or the seed
 * scripts (`generateCode` output collides). These tests pin the exact
 * surface behaviour the rest of the codebase implicitly depends on.
 *
 * Pure node-env Jest — no DOM, no Prisma, no I/O.
 */

import {
  cn,
  apiResponse,
  apiError,
  paginate,
  buildWhereClause,
  formatDate,
  generateCode,
  formatCurrency,
  formatPercent,
} from "./utils";

// ─────────────────────────────────────────────────────────────────────
// cn — tailwind-merge + clsx combiner
// ─────────────────────────────────────────────────────────────────────

describe("cn", () => {
  test("concatenates plain class strings with a single space", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  test("drops falsy inputs (null/undefined/false/'')", () => {
    expect(cn("a", null, undefined, false, "", "b")).toBe("a b");
  });

  test("supports the clsx object form", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
  });

  test("supports nested arrays from clsx", () => {
    expect(cn(["a", ["b", "c"]])).toBe("a b c");
  });

  test("deduplicates conflicting Tailwind padding utilities (keeps last)", () => {
    expect(cn("p-1", "p-2")).toBe("p-2");
  });

  test("deduplicates conflicting Tailwind colour utilities (keeps last)", () => {
    expect(cn("text-red-500", "text-blue-600")).toBe("text-blue-600");
  });

  test("preserves non-conflicting utilities alongside conflicts", () => {
    expect(cn("p-4 m-2", "p-6")).toBe("m-2 p-6");
  });

  test("returns an empty string when given no inputs", () => {
    expect(cn()).toBe("");
  });

  test("returns an empty string when every input is falsy", () => {
    expect(cn(null, undefined, false, "")).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────
// apiResponse — `{success:true, data}` wrapper
// ─────────────────────────────────────────────────────────────────────

describe("apiResponse", () => {
  test("defaults status to 200", async () => {
    const r = apiResponse({ foo: "bar" });
    expect(r.status).toBe(200);
  });

  test("returns the `{ success: true, data }` envelope", async () => {
    const r = apiResponse({ id: 42 });
    const body = await r.json();
    expect(body).toEqual({ success: true, data: { id: 42 } });
  });

  test("honours an explicit status code (201)", async () => {
    const r = apiResponse({ created: true }, 201);
    expect(r.status).toBe(201);
  });

  test("honours an explicit status code (202)", () => {
    const r = apiResponse({ queued: true }, 202);
    expect(r.status).toBe(202);
  });

  test("data field accepts arrays unchanged", async () => {
    const r = apiResponse([1, 2, 3]);
    const body = await r.json();
    expect(body.data).toEqual([1, 2, 3]);
  });

  test("data field accepts null", async () => {
    const r = apiResponse(null);
    const body = await r.json();
    expect(body).toEqual({ success: true, data: null });
  });

  test("sets Content-Type to application/json", () => {
    const r = apiResponse({ ok: true });
    expect(r.headers.get("content-type")).toMatch(/application\/json/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// apiError — `{success:false, error, details}` wrapper
// ─────────────────────────────────────────────────────────────────────

describe("apiError", () => {
  test("defaults status to 400", () => {
    const r = apiError("bad request");
    expect(r.status).toBe(400);
  });

  test("returns the `{ success: false, error, details }` envelope", async () => {
    const r = apiError("oops", 422, { field: "name" });
    const body = await r.json();
    expect(body).toEqual({
      success: false,
      error: "oops",
      details: { field: "name" },
    });
  });

  test("omits details by leaving it undefined when not passed", async () => {
    const r = apiError("missing");
    const body = await r.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("missing");
    // JSON.stringify drops undefined keys — `details` should be absent on the wire
    expect(Object.prototype.hasOwnProperty.call(body, "details")).toBe(false);
  });

  test("honours explicit 500 status", () => {
    const r = apiError("internal", 500);
    expect(r.status).toBe(500);
  });

  test("honours explicit 404 status", () => {
    const r = apiError("not found", 404);
    expect(r.status).toBe(404);
  });

  test("accepts a string `details` payload", async () => {
    const r = apiError("validation failed", 400, "expected number");
    const body = await r.json();
    expect(body.details).toBe("expected number");
  });
});

// ─────────────────────────────────────────────────────────────────────
// paginate — pure array slicer + metadata
// ─────────────────────────────────────────────────────────────────────

describe("paginate", () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }));

  test("page 1 of 25 with pageSize 10 returns the first 10 items", () => {
    const r = paginate(items, 1, 10);
    expect(r.data.map((x) => x.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test("page 2 of 25 with pageSize 10 returns items 11–20", () => {
    const r = paginate(items, 2, 10);
    expect(r.data.map((x) => x.id)).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
  });

  test("page 3 of 25 with pageSize 10 returns the remaining 5 items", () => {
    const r = paginate(items, 3, 10);
    expect(r.data.map((x) => x.id)).toEqual([21, 22, 23, 24, 25]);
  });

  test("reports total, page, pageSize and totalPages correctly", () => {
    const r = paginate(items, 2, 10);
    expect(r.total).toBe(25);
    expect(r.page).toBe(2);
    expect(r.pageSize).toBe(10);
    expect(r.totalPages).toBe(3);
  });

  test("hasPrev/hasNext are false on a single-page result", () => {
    const r = paginate(items.slice(0, 5), 1, 10);
    expect(r.hasPrev).toBe(false);
    expect(r.hasNext).toBe(false);
    expect(r.totalPages).toBe(1);
  });

  test("hasPrev is false on page 1 of multi-page result", () => {
    const r = paginate(items, 1, 10);
    expect(r.hasPrev).toBe(false);
    expect(r.hasNext).toBe(true);
  });

  test("hasNext is false on the last page", () => {
    const r = paginate(items, 3, 10);
    expect(r.hasNext).toBe(false);
    expect(r.hasPrev).toBe(true);
  });

  test("empty list yields total=0, totalPages=0, no next/prev", () => {
    const r = paginate([], 1, 10);
    expect(r.data).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.totalPages).toBe(0);
    expect(r.hasNext).toBe(false);
    expect(r.hasPrev).toBe(false);
  });

  test("requesting past-the-end page yields empty data slice", () => {
    const r = paginate(items, 99, 10);
    expect(r.data).toEqual([]);
    expect(r.hasNext).toBe(false);
    expect(r.hasPrev).toBe(true);
  });

  test("pageSize larger than total returns everything in one page", () => {
    const r = paginate(items, 1, 500);
    expect(r.data.length).toBe(25);
    expect(r.totalPages).toBe(1);
    expect(r.hasNext).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// buildWhereClause — query-string → Prisma where + search term
// ─────────────────────────────────────────────────────────────────────

describe("buildWhereClause", () => {
  test("always scopes by tenantId", () => {
    const p = new URLSearchParams("");
    const { where } = buildWhereClause(p, "tenant-abc");
    expect(where.tenantId).toBe("tenant-abc");
  });

  test("omits isActive when the query string does not include it", () => {
    const p = new URLSearchParams("");
    const { where } = buildWhereClause(p, "t1");
    expect("isActive" in where).toBe(false);
  });

  test("translates ?isActive=true into where.isActive=true", () => {
    const p = new URLSearchParams("isActive=true");
    const { where } = buildWhereClause(p, "t1");
    expect(where.isActive).toBe(true);
  });

  test("translates ?isActive=false into where.isActive=false", () => {
    const p = new URLSearchParams("isActive=false");
    const { where } = buildWhereClause(p, "t1");
    expect(where.isActive).toBe(false);
  });

  test("any non-'true' value (including 'TRUE') is treated as false", () => {
    // current implementation does an exact `=== "true"` check
    const p = new URLSearchParams("isActive=TRUE");
    const { where } = buildWhereClause(p, "t1");
    expect(where.isActive).toBe(false);
  });

  test("returns the raw `search` query value (or null when absent)", () => {
    const a = buildWhereClause(new URLSearchParams("search=cash"), "t1");
    expect(a.search).toBe("cash");

    const b = buildWhereClause(new URLSearchParams(""), "t1");
    expect(b.search).toBeNull();
  });

  test("returns a fresh `where` object on each call (no shared mutation)", () => {
    const a = buildWhereClause(new URLSearchParams(""), "t1");
    const b = buildWhereClause(new URLSearchParams(""), "t1");
    expect(a.where).not.toBe(b.where);
  });
});

// ─────────────────────────────────────────────────────────────────────
// formatDate — en-US "MMM dd, yyyy" output
// ─────────────────────────────────────────────────────────────────────

describe("formatDate", () => {
  test("formats an ISO date string as 'MMM dd, yyyy'", () => {
    // toLocaleDateString uses the local timezone, but the YYYY-MM-DD
    // form is fairly stable in en-US output here.
    expect(formatDate("2026-05-25T12:00:00Z")).toMatch(/May \d{2}, 2026/);
  });

  test("accepts a Date instance", () => {
    const d = new Date(Date.UTC(2026, 0, 1, 12));
    expect(formatDate(d)).toMatch(/Jan \d{2}, 2026/);
  });

  test("uses 4-digit year, abbreviated month, 2-digit day", () => {
    const s = formatDate(new Date(Date.UTC(2026, 5, 7, 12)));
    expect(s).toMatch(/^[A-Z][a-z]{2} \d{2}, \d{4}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// generateCode — `${prefix}-${(count+1).padStart(5,'0')}`
// ─────────────────────────────────────────────────────────────────────

describe("generateCode", () => {
  test("count=0 → prefix-00001 (first row)", () => {
    expect(generateCode("ACC", 0)).toBe("ACC-00001");
  });

  test("count=1 → prefix-00002", () => {
    expect(generateCode("ACC", 1)).toBe("ACC-00002");
  });

  test("rolls past three digits without overflow (count=99 → 00100)", () => {
    expect(generateCode("ACC", 99)).toBe("ACC-00100");
  });

  test("five-digit pad caps at 99999 (count=99999 → 100000, no truncation)", () => {
    // padStart pads to a *minimum* width, so 6 digits is still allowed.
    expect(generateCode("ACC", 99999)).toBe("ACC-100000");
  });

  test("works with non-default prefix", () => {
    expect(generateCode("EMP", 9)).toBe("EMP-00010");
  });
});

// ─────────────────────────────────────────────────────────────────────
// formatCurrency — compact B/M/K + Intl USD fallback
// ─────────────────────────────────────────────────────────────────────

describe("formatCurrency", () => {
  test("billions: 1_500_000_000 → '$1.5B'", () => {
    expect(formatCurrency(1_500_000_000)).toBe("$1.5B");
  });

  test("billions: exactly 1B threshold", () => {
    expect(formatCurrency(1_000_000_000)).toBe("$1.0B");
  });

  test("millions: 2_500_000 → '$2.5M'", () => {
    expect(formatCurrency(2_500_000)).toBe("$2.5M");
  });

  test("millions: 1_000_000 → '$1.0M' (boundary)", () => {
    expect(formatCurrency(1_000_000)).toBe("$1.0M");
  });

  test("thousands: 1_500 → '$2K' (rounded to nearest int K)", () => {
    expect(formatCurrency(1_500)).toBe("$2K");
  });

  test("thousands: 1_000 → '$1K' (boundary)", () => {
    expect(formatCurrency(1_000)).toBe("$1K");
  });

  test("sub-thousand: 999 falls through to Intl USD", () => {
    expect(formatCurrency(999)).toBe("$999");
  });

  test("zero formats as '$0'", () => {
    expect(formatCurrency(0)).toBe("$0");
  });

  test("non-compact mode always uses Intl USD (no B/M/K suffix)", () => {
    expect(formatCurrency(1_500_000, false)).toBe("$1,500,000");
  });

  test("non-compact mode rounds to zero decimal places", () => {
    expect(formatCurrency(1234.78, false)).toBe("$1,235");
  });

  test("compact handles negative thousands via Intl (since |val|<1000 false here)", () => {
    // -1500 has abs >= 1000, hits K branch
    expect(formatCurrency(-1500)).toBe("$-2K");
  });

  test("non-compact negative formats with leading minus", () => {
    expect(formatCurrency(-1500, false)).toBe("-$1,500");
  });
});

// ─────────────────────────────────────────────────────────────────────
// formatPercent — signed/decimal-controlled percent string
// ─────────────────────────────────────────────────────────────────────

describe("formatPercent", () => {
  test("positive value gets a '+' prefix and default 1 decimal", () => {
    expect(formatPercent(5.234)).toBe("+5.2%");
  });

  test("negative value keeps the natural '-' from toFixed (no extra +)", () => {
    expect(formatPercent(-3.7)).toBe("-3.7%");
  });

  test("zero is treated as non-positive (no '+' prefix)", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });

  test("decimals=0 truncates to integer percent", () => {
    expect(formatPercent(12.6, 0)).toBe("+13%");
  });

  test("decimals=2 produces 2-decimal output", () => {
    expect(formatPercent(0.5, 2)).toBe("+0.50%");
  });

  test("rounding follows toFixed semantics", () => {
    // toFixed rounds half-away-from-zero on positive values
    expect(formatPercent(1.25, 1)).toBe("+1.3%");
  });

  test("very small positive value still gets '+'", () => {
    expect(formatPercent(0.01)).toBe("+0.0%");
  });
});
