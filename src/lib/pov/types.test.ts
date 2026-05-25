/*
 * src/lib/pov/types.test.ts
 *
 * Comprehensive coverage for the canonical POV (Point-Of-View) shape.
 *
 * Surface pinned:
 *   - povHashKey(p)        — stable cache key, entity-order-independent
 *   - mergePov(base, ovr)  — apply a partial override to a base POV
 *   - validatePov(p)       — shape check, returns string error or null
 *   - PovSpec type contract (compile-time + runtime hash key surface)
 *
 * Pure additive (was 7 tests before this slot — now 81). No source-code
 * change. No schema, no API, no UI. Matches the established autonomous-
 * build "pin the surface" template used on dim-schemas / cron-parser /
 * mapping engine / finance-skills.
 */
import { povHashKey, mergePov, validatePov } from "./types";
import type { PovSpec } from "./types";

// ── povHashKey ───────────────────────────────────────────────────────

describe("povHashKey — input mutation safety", () => {
  it("does NOT mutate the caller's entityCodes array (uses .slice())", () => {
    const input = ["US_HQ", "IN_OPS", "DEL1"];
    const before = [...input];
    povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: input });
    expect(input).toEqual(before);
  });

  it("does NOT throw on a frozen entityCodes array", () => {
    const frozen = Object.freeze(["B", "A", "C"]) as readonly string[];
    expect(() => povHashKey({
      scenarioCode: "ACTUAL", periodCode: "FY2026",
      // cast: production callers ARE allowed to pass readonly arrays.
      entityCodes: frozen as unknown as string[],
    })).not.toThrow();
  });
});

describe("povHashKey — entity order invariance", () => {
  it("same hash regardless of entity order (3 entities, ascending vs descending)", () => {
    const asc = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: ["A","B","C"] });
    const des = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: ["C","B","A"] });
    expect(asc).toBe(des);
  });

  it("same hash regardless of entity order (shuffled)", () => {
    const a = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: ["IN_OPS","US_HQ","DEL1","MUM1"] });
    const b = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: ["MUM1","IN_OPS","DEL1","US_HQ"] });
    expect(a).toBe(b);
  });

  it("hashes a single-entity list correctly", () => {
    const h = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: ["US_HQ"] });
    expect(h).toContain("US_HQ");
  });

  it("sorts duplicate entity codes without de-duping (caller's responsibility)", () => {
    const a = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: ["A","A","B"] });
    const b = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: ["B","A","A"] });
    expect(a).toBe(b);
    // duplicates ARE present in the key
    expect(a.split("|")[3]).toBe("A,A,B");
  });
});

describe("povHashKey — entityCodes absence semantics", () => {
  it("hash is identical for entityCodes: [] vs entityCodes: undefined (both mean 'all leaves')", () => {
    const empty     = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: [] });
    const undef     = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026" });
    expect(empty).toBe(undef);
  });

  it("[] / undefined produce a key with EMPTY entity segment between pipes", () => {
    const h = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026" });
    const parts = h.split("|");
    expect(parts[3]).toBe("");
  });
});

describe("povHashKey — scenario/period/compare are load-bearing", () => {
  it("changes hash when scenarioCode differs", () => {
    const a = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026" });
    const b = povHashKey({ scenarioCode: "BUDGET", periodCode: "FY2026" });
    expect(a).not.toBe(b);
  });

  it("changes hash when periodCode differs", () => {
    const a = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026" });
    const b = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026Q1" });
    expect(a).not.toBe(b);
  });

  it("changes hash when compareScenarioCode is added", () => {
    const a = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026" });
    const b = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", compareScenarioCode: "FORECAST" });
    expect(a).not.toBe(b);
  });

  it("treats compareScenarioCode null vs undefined identically (both → '')", () => {
    const a = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026" });
    const b = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", compareScenarioCode: null });
    expect(a).toBe(b);
  });
});

describe("povHashKey — currency / icp", () => {
  it("changes hash when currencyCode is added", () => {
    const a = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026" });
    const b = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", currencyCode: "INR" });
    expect(a).not.toBe(b);
  });

  it("changes hash when icpCode is added", () => {
    const a = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026" });
    const b = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", icpCode: "ICP_US_HQ" });
    expect(a).not.toBe(b);
  });

  it("treats currencyCode undefined and icpCode undefined as '' segments", () => {
    const h = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026" });
    const parts = h.split("|");
    // [scenario, period, compare, entities, currency, icp, ud1..8]
    expect(parts[4]).toBe(""); // currency
    expect(parts[5]).toBe(""); // icp
  });

  it("treats icpCode: null identically to icpCode: undefined", () => {
    const a = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026" });
    const b = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", icpCode: null });
    expect(a).toBe(b);
  });
});

describe("povHashKey — ud1..ud8 surface", () => {
  it("includes ud1..ud8 as the LAST 8 pipe-separated segments", () => {
    const h = povHashKey({
      scenarioCode: "ACTUAL", periodCode: "FY2026",
      ud1Code: "P1", ud2Code: "P2", ud3Code: "P3", ud4Code: "P4",
      ud5Code: "P5", ud6Code: "P6", ud7Code: "P7", ud8Code: "P8",
    });
    const parts = h.split("|");
    expect(parts.length).toBe(14); // scenario, period, compare, entities, currency, icp, ud1..ud8
    expect(parts.slice(6)).toEqual(["P1","P2","P3","P4","P5","P6","P7","P8"]);
  });

  it("treats every ud null as '' (matches undefined)", () => {
    const a = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026" });
    const b = povHashKey({
      scenarioCode: "ACTUAL", periodCode: "FY2026",
      ud1Code: null, ud2Code: null, ud3Code: null, ud4Code: null,
      ud5Code: null, ud6Code: null, ud7Code: null, ud8Code: null,
    });
    expect(a).toBe(b);
  });

  it("changes hash when ud3 alone differs", () => {
    const a = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", ud3Code: "DEPT_A" });
    const b = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", ud3Code: "DEPT_B" });
    expect(a).not.toBe(b);
  });

  it("ud5 changing alone changes the hash (mid-segment isolation)", () => {
    const a = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", ud5Code: "X" });
    const b = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", ud5Code: "Y" });
    expect(a).not.toBe(b);
  });

  it("ud8 changing alone changes the hash (last-segment isolation)", () => {
    const a = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", ud8Code: "X" });
    const b = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026", ud8Code: "Y" });
    expect(a).not.toBe(b);
  });
});

describe("povHashKey — key shape (structural pins)", () => {
  it("always returns a string", () => {
    expect(typeof povHashKey({ scenarioCode: "X", periodCode: "Y" })).toBe("string");
  });

  it("uses '|' as the segment separator (14 segments → 13 pipes)", () => {
    const h = povHashKey({ scenarioCode: "X", periodCode: "Y" });
    expect((h.match(/\|/g) ?? []).length).toBe(13);
  });

  it("uses ',' as the entity separator (NOT '|')", () => {
    const h = povHashKey({ scenarioCode: "X", periodCode: "Y", entityCodes: ["A","B"] });
    const parts = h.split("|");
    expect(parts[3]).toBe("A,B");
  });

  it("preserves scenario / period as the first two segments verbatim", () => {
    const h = povHashKey({ scenarioCode: "ACTUAL", periodCode: "FY2026" });
    const parts = h.split("|");
    expect(parts[0]).toBe("ACTUAL");
    expect(parts[1]).toBe("FY2026");
  });

  it("does NOT escape pipes inside member codes — codes with '|' break the key (documented limitation)", () => {
    // Pinned to surface this limitation. Tenant member codes must not contain '|'.
    const h = povHashKey({ scenarioCode: "A|B", periodCode: "C" });
    // The first segment is "A" — anything after the embedded '|' bleeds into period segment.
    expect(h.split("|")[0]).toBe("A");
    expect(h.split("|")[1]).toBe("B");
    expect(h.split("|")[2]).toBe("C");
  });

  it("is deterministic (same input → same output across repeat calls)", () => {
    const spec: PovSpec = {
      scenarioCode: "ACTUAL", periodCode: "FY2026",
      entityCodes: ["IN_OPS","US_HQ"], currencyCode: "USD", ud3Code: "X",
    };
    const a = povHashKey(spec);
    const b = povHashKey(spec);
    const c = povHashKey(spec);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

// ── mergePov ────────────────────────────────────────────────────────

describe("mergePov — partial overrides", () => {
  it("overrides only specified fields, preserves others", () => {
    const r = mergePov(
      { scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: ["IN_OPS"] },
      { periodCode: "FY2026Q2" },
    );
    expect(r.scenarioCode).toBe("ACTUAL");
    expect(r.periodCode).toBe("FY2026Q2");
    expect(r.entityCodes).toEqual(["IN_OPS"]);
  });

  it("empty override returns shape equivalent to base", () => {
    const base: PovSpec = { scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: ["A"] };
    const r = mergePov(base, {});
    expect(r).toEqual(base);
  });

  it("can override the scenarioCode alone", () => {
    const r = mergePov({ scenarioCode: "ACTUAL", periodCode: "FY2026" }, { scenarioCode: "BUDGET" });
    expect(r.scenarioCode).toBe("BUDGET");
    expect(r.periodCode).toBe("FY2026");
  });

  it("can override the periodCode alone", () => {
    const r = mergePov({ scenarioCode: "ACTUAL", periodCode: "FY2026" }, { periodCode: "FY2026Q4" });
    expect(r.periodCode).toBe("FY2026Q4");
  });

  it("can set compareScenarioCode from undefined to a value", () => {
    const r = mergePov({ scenarioCode: "ACTUAL", periodCode: "FY2026" }, { compareScenarioCode: "FORECAST" });
    expect(r.compareScenarioCode).toBe("FORECAST");
  });

  it("can clear compareScenarioCode with explicit null override", () => {
    const r = mergePov(
      { scenarioCode: "ACTUAL", periodCode: "FY2026", compareScenarioCode: "FORECAST" },
      { compareScenarioCode: null },
    );
    expect(r.compareScenarioCode).toBeNull();
  });

  it("can replace entityCodes with an empty array (= 'all leaves')", () => {
    const r = mergePov(
      { scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: ["IN_OPS"] },
      { entityCodes: [] },
    );
    expect(r.entityCodes).toEqual([]);
  });

  it("can replace entityCodes with a longer list", () => {
    const r = mergePov(
      { scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: ["IN_OPS"] },
      { entityCodes: ["IN_OPS","US_HQ","DEL1"] },
    );
    expect(r.entityCodes).toEqual(["IN_OPS","US_HQ","DEL1"]);
  });

  it("can set ud1..ud8 fields", () => {
    const r = mergePov(
      { scenarioCode: "ACTUAL", periodCode: "FY2026" },
      { ud1Code: "P1", ud4Code: "P4", ud8Code: "P8" },
    );
    expect(r.ud1Code).toBe("P1");
    expect(r.ud4Code).toBe("P4");
    expect(r.ud8Code).toBe("P8");
  });

  it("preserves base ud fields when override doesn't touch them", () => {
    const r = mergePov(
      { scenarioCode: "ACTUAL", periodCode: "FY2026", ud3Code: "BASE" },
      { periodCode: "FY2026Q1" },
    );
    expect(r.ud3Code).toBe("BASE");
  });

  it("can clear ud field with explicit null override", () => {
    const r = mergePov(
      { scenarioCode: "ACTUAL", periodCode: "FY2026", ud3Code: "BASE" },
      { ud3Code: null },
    );
    expect(r.ud3Code).toBeNull();
  });

  it("override can replace currencyCode", () => {
    const r = mergePov(
      { scenarioCode: "ACTUAL", periodCode: "FY2026", currencyCode: "INR" },
      { currencyCode: "USD" },
    );
    expect(r.currencyCode).toBe("USD");
  });

  it("override compareScenarioCode = '' coerces to empty string (NOT null)", () => {
    const r = mergePov(
      { scenarioCode: "ACTUAL", periodCode: "FY2026", compareScenarioCode: "FORECAST" },
      { compareScenarioCode: "" },
    );
    // documented: caller must use null to clear; '' lands as '' on the resulting object.
    expect(r.compareScenarioCode).toBe("");
  });
});

describe("mergePov — no mutation", () => {
  it("does NOT mutate the base argument", () => {
    const base: PovSpec = { scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: ["A"] };
    const baseCopy = JSON.parse(JSON.stringify(base));
    mergePov(base, { periodCode: "FY2026Q1", entityCodes: ["B"] });
    expect(base).toEqual(baseCopy);
  });

  it("does NOT mutate the override argument", () => {
    const ovr = { periodCode: "FY2026Q1", entityCodes: ["B"] };
    const ovrCopy = JSON.parse(JSON.stringify(ovr));
    mergePov({ scenarioCode: "ACTUAL", periodCode: "FY2026" }, ovr);
    expect(ovr).toEqual(ovrCopy);
  });

  it("returns a NEW object reference, not the base reference", () => {
    const base: PovSpec = { scenarioCode: "ACTUAL", periodCode: "FY2026" };
    const r = mergePov(base, { scenarioCode: "BUDGET" });
    expect(r).not.toBe(base);
  });

  it("returns a NEW object even when override is empty", () => {
    const base: PovSpec = { scenarioCode: "ACTUAL", periodCode: "FY2026" };
    const r = mergePov(base, {});
    expect(r).not.toBe(base);
    expect(r).toEqual(base);
  });

  it("entityCodes reference is shared from override (shallow merge — pinned)", () => {
    // Documented behaviour: mergePov is `{ ...base, ...override }`, so override
    // arrays land in the result by reference, not by clone. If caller mutates
    // afterwards, it WILL leak into the merged POV.
    const ovrEntities = ["X","Y"];
    const r = mergePov({ scenarioCode: "ACTUAL", periodCode: "FY2026" }, { entityCodes: ovrEntities });
    expect(r.entityCodes).toBe(ovrEntities); // same reference
  });
});

// ── validatePov ─────────────────────────────────────────────────────

describe("validatePov — happy path", () => {
  it("returns null for a minimal valid POV", () => {
    expect(validatePov({ scenarioCode: "ACTUAL", periodCode: "FY2026" })).toBeNull();
  });

  it("returns null for a POV with all optional fields filled", () => {
    expect(validatePov({
      scenarioCode: "ACTUAL", periodCode: "FY2026",
      compareScenarioCode: "FORECAST",
      entityCodes: ["IN_OPS","US_HQ"],
      currencyCode: "INR", icpCode: "ICP_US_HQ",
      ud1Code: "P1", ud2Code: "P2", ud3Code: "P3", ud4Code: "P4",
      ud5Code: "P5", ud6Code: "P6", ud7Code: "P7", ud8Code: "P8",
    })).toBeNull();
  });

  it("accepts entityCodes: [] (empty array = all leaves)", () => {
    expect(validatePov({ scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: [] })).toBeNull();
  });

  it("accepts entityCodes: undefined (omitted)", () => {
    expect(validatePov({ scenarioCode: "ACTUAL", periodCode: "FY2026" })).toBeNull();
  });

  it("accepts arbitrary single-letter scenario / period codes", () => {
    expect(validatePov({ scenarioCode: "A", periodCode: "B" })).toBeNull();
  });

  it("ignores unknown extra keys (returns null — non-strict shape check)", () => {
    expect(validatePov({
      scenarioCode: "ACTUAL", periodCode: "FY2026",
      unknownKey: "anything",
      anotherWeirdField: 42,
    })).toBeNull();
  });
});

describe("validatePov — required-field rejections", () => {
  it("rejects missing scenarioCode", () => {
    const r = validatePov({ periodCode: "FY2026" });
    expect(r).toMatch(/scenarioCode/);
  });

  it("rejects missing periodCode", () => {
    const r = validatePov({ scenarioCode: "ACTUAL" });
    expect(r).toMatch(/periodCode/);
  });

  it("rejects empty-string scenarioCode (falsy guard)", () => {
    const r = validatePov({ scenarioCode: "", periodCode: "FY2026" });
    expect(r).toMatch(/scenarioCode/);
  });

  it("rejects empty-string periodCode (falsy guard)", () => {
    const r = validatePov({ scenarioCode: "ACTUAL", periodCode: "" });
    expect(r).toMatch(/periodCode/);
  });

  it("rejects non-string scenarioCode (number)", () => {
    const r = validatePov({ scenarioCode: 123, periodCode: "FY2026" });
    expect(r).toMatch(/scenarioCode/);
  });

  it("rejects non-string periodCode (boolean)", () => {
    const r = validatePov({ scenarioCode: "ACTUAL", periodCode: true });
    expect(r).toMatch(/periodCode/);
  });

  it("rejects null scenarioCode", () => {
    const r = validatePov({ scenarioCode: null, periodCode: "FY2026" });
    expect(r).toMatch(/scenarioCode/);
  });

  it("rejects undefined scenarioCode explicitly", () => {
    const r = validatePov({ scenarioCode: undefined, periodCode: "FY2026" });
    expect(r).toMatch(/scenarioCode/);
  });

  it("rejects scenarioCode missing BEFORE checking periodCode (scenario error wins)", () => {
    const r = validatePov({});
    expect(r).toMatch(/scenarioCode/);
    expect(r).not.toMatch(/periodCode/);
  });
});

describe("validatePov — root-shape rejections", () => {
  it("rejects null POV", () => {
    expect(validatePov(null)).toMatch(/POV/);
  });

  it("rejects undefined POV", () => {
    expect(validatePov(undefined)).toMatch(/POV/);
  });

  it("rejects a string masquerading as POV", () => {
    expect(validatePov("not a pov")).toMatch(/POV/);
  });

  it("rejects a number masquerading as POV", () => {
    expect(validatePov(42)).toMatch(/POV/);
  });

  it("rejects a boolean masquerading as POV", () => {
    expect(validatePov(true)).toMatch(/POV/);
  });

  it("does NOT reject arrays (typeof [] === 'object') — caller's responsibility, pinned", () => {
    // Documented limitation: validatePov only checks `typeof === 'object'`,
    // which is true for arrays too. The scenarioCode-required guard catches
    // arrays in practice (array.scenarioCode is undefined), so the surface
    // is still safe.
    const r = validatePov([]);
    // arrays without scenarioCode → fails on scenarioCode, not POV shape.
    expect(r).toMatch(/scenarioCode/);
  });
});

describe("validatePov — entityCodes shape", () => {
  it("rejects entityCodes as a single string", () => {
    const r = validatePov({ scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: "IN_OPS" });
    expect(r).toMatch(/entityCodes/);
  });

  it("rejects entityCodes as a number", () => {
    const r = validatePov({ scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: 42 });
    expect(r).toMatch(/entityCodes/);
  });

  it("rejects entityCodes as an object", () => {
    const r = validatePov({ scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: { 0: "A" } });
    expect(r).toMatch(/entityCodes/);
  });

  it("accepts entityCodes as a single-item array", () => {
    expect(validatePov({ scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: ["IN_OPS"] })).toBeNull();
  });

  it("accepts entityCodes containing duplicates (caller's responsibility)", () => {
    expect(validatePov({ scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: ["A","A","B"] })).toBeNull();
  });

  it("accepts entityCodes containing non-string entries (validatePov is shallow)", () => {
    // Pinned: validatePov does NOT iterate entries. Strict per-entry typing
    // is delegated to the resolver layer.
    expect(validatePov({ scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: ["A", 42 as any, null as any] })).toBeNull();
  });

  it("checks entityCodes ONLY when present (undefined → null)", () => {
    expect(validatePov({ scenarioCode: "ACTUAL", periodCode: "FY2026" })).toBeNull();
  });
});

describe("validatePov — error-message contract", () => {
  it("error message is a STRING (not Error object)", () => {
    expect(typeof validatePov({})).toBe("string");
  });

  it("happy path return type is null (not undefined)", () => {
    expect(validatePov({ scenarioCode: "ACTUAL", periodCode: "FY2026" })).toBe(null);
  });

  it("error message identifies the failing field by name", () => {
    expect(validatePov({})).toContain("scenarioCode");
    expect(validatePov({ scenarioCode: "ACTUAL" })).toContain("periodCode");
    expect(validatePov({ scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: "x" })).toContain("entityCodes");
  });
});

describe("validatePov — does not mutate input", () => {
  it("leaves input unchanged on success", () => {
    const input = { scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: ["A"] };
    const copy  = JSON.parse(JSON.stringify(input));
    validatePov(input);
    expect(input).toEqual(copy);
  });

  it("leaves input unchanged on failure", () => {
    const input = { scenarioCode: "", periodCode: "FY2026" };
    const copy  = JSON.parse(JSON.stringify(input));
    validatePov(input);
    expect(input).toEqual(copy);
  });
});

// ── Cross-helper integration ────────────────────────────────────────

describe("validatePov ∘ mergePov", () => {
  it("merged POV passes validation when base does", () => {
    const base: PovSpec = { scenarioCode: "ACTUAL", periodCode: "FY2026" };
    const merged = mergePov(base, { entityCodes: ["A","B"] });
    expect(validatePov(merged)).toBeNull();
  });

  it("merged POV FAILS validation when override clears scenarioCode (pinned)", () => {
    // Currently mergePov is `{...base, ...override}` so explicit '' in override
    // overwrites the base. Pinned so a future "preserve required fields" guard
    // is a conscious choice.
    const base: PovSpec = { scenarioCode: "ACTUAL", periodCode: "FY2026" };
    const merged = mergePov(base, { scenarioCode: "" as any });
    expect(validatePov(merged)).toMatch(/scenarioCode/);
  });
});

describe("povHashKey ∘ mergePov", () => {
  it("hash differs after mergePov changes a load-bearing field", () => {
    const base: PovSpec = { scenarioCode: "ACTUAL", periodCode: "FY2026" };
    const a = povHashKey(base);
    const b = povHashKey(mergePov(base, { scenarioCode: "BUDGET" }));
    expect(a).not.toBe(b);
  });

  it("hash unchanged when mergePov is a no-op (empty override)", () => {
    const base: PovSpec = { scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: ["A","B"] };
    const a = povHashKey(base);
    const b = povHashKey(mergePov(base, {}));
    expect(a).toBe(b);
  });

  it("hash same after merging a different-order entityCodes override", () => {
    const base: PovSpec = { scenarioCode: "ACTUAL", periodCode: "FY2026", entityCodes: ["A","B","C"] };
    const a = povHashKey(base);
    const b = povHashKey(mergePov(base, { entityCodes: ["C","A","B"] }));
    expect(a).toBe(b);
  });
});
