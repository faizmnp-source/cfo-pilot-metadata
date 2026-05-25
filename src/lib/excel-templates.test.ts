/*
 * Unit tests for `src/lib/excel-templates.ts`.
 *
 * `TEMPLATES` is the source of truth for two consumers:
 *   1. `/api/v2/template/[dim]` — generates the downloadable .xlsx file
 *      a user fills in for bulk member import.
 *   2. The ExcelImport UI — drives column-recognition + sample-row preview.
 *
 * If a column key, required flag, sample row, or sheet name drifts, BOTH
 * the import endpoint and the import UI silently produce a wrong artifact:
 *   - users get a template that doesn't validate against the actual API
 *   - or worse, the import "succeeds" but writes garbage into the
 *     properties bag (because column keys no longer match the dim-schemas
 *     zod surface).
 *
 * These tests pin the template surface so a typo / accidental delete /
 * key rename surfaces immediately instead of breaking the import flow.
 *
 * Pure node-env Jest — no DOM, no Prisma, no I/O. `SupportedDim` is
 * imported as a TYPE only, so the React-heavy AddMemberDialog.tsx is
 * never loaded at runtime.
 */

import { TEMPLATES, type TemplateSpec } from "./excel-templates";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Expected SupportedDim keys, hard-coded so a drift in either side fails. */
const SUPPORTED_DIMS = [
  "account", "entity", "scenario", "time", "currency", "icp", "origin",
  "ud1", "ud2", "ud3", "ud4", "ud5", "ud6", "ud7", "ud8",
] as const;
type Dim = typeof SUPPORTED_DIMS[number];

const UD_SLOTS = ["ud1", "ud2", "ud3", "ud4", "ud5", "ud6", "ud7", "ud8"] as const;

/** Returns the keys of every column in a template, in order. */
function colKeys(spec: TemplateSpec): string[] {
  return spec.columns.map((c) => c.key);
}

/** Returns the keys of every REQUIRED column in a template. */
function requiredKeys(spec: TemplateSpec): string[] {
  return spec.columns.filter((c) => c.required).map((c) => c.key);
}

// ---------------------------------------------------------------------------
// TEMPLATES surface — every SupportedDim has an entry
// ---------------------------------------------------------------------------

describe("TEMPLATES — surface", () => {
  test("exports an object", () => {
    expect(TEMPLATES).toBeDefined();
    expect(typeof TEMPLATES).toBe("object");
    expect(TEMPLATES).not.toBeNull();
  });

  test.each(SUPPORTED_DIMS)("has an entry for dim %s", (dim) => {
    expect(TEMPLATES[dim]).toBeDefined();
    expect(typeof TEMPLATES[dim]).toBe("object");
  });

  test("has no extra dims beyond SupportedDim", () => {
    const expected = new Set<string>(SUPPORTED_DIMS);
    const actual = new Set(Object.keys(TEMPLATES));
    // every actual key must be in expected (no rogue dims like "foo")
    Array.from(actual).forEach((k) => {
      expect(expected.has(k)).toBe(true);
    });
    // every expected key must be in actual (no missing dims)
    Array.from(expected).forEach((k) => {
      expect(actual.has(k)).toBe(true);
    });
    expect(actual.size).toBe(expected.size);
  });

  test("exactly 15 dims (7 fixed + ICP + origin + 8 UDs - duplicates)", () => {
    // 7 fixed (account/entity/scenario/time/currency/icp/origin) + 8 UDs = 15
    expect(Object.keys(TEMPLATES)).toHaveLength(15);
  });
});

// ---------------------------------------------------------------------------
// TemplateSpec shape — every spec is well-formed
// ---------------------------------------------------------------------------

describe.each(SUPPORTED_DIMS)("TEMPLATES[%s] — shape", (dim) => {
  const spec = TEMPLATES[dim];

  test("has a non-empty string sheetName", () => {
    expect(typeof spec.sheetName).toBe("string");
    expect(spec.sheetName.length).toBeGreaterThan(0);
  });

  test("sheetName has no leading/trailing whitespace", () => {
    expect(spec.sheetName).toBe(spec.sheetName.trim());
  });

  test("has a non-empty columns array", () => {
    expect(Array.isArray(spec.columns)).toBe(true);
    expect(spec.columns.length).toBeGreaterThan(0);
  });

  test("every column has a non-empty string key and label", () => {
    for (const c of spec.columns) {
      expect(typeof c.key).toBe("string");
      expect(c.key.length).toBeGreaterThan(0);
      expect(typeof c.label).toBe("string");
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  test("column keys are unique", () => {
    const keys = colKeys(spec);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("column keys are snake_case-safe (no spaces / no uppercase)", () => {
    for (const c of spec.columns) {
      expect(c.key).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  test("has at least one required column", () => {
    expect(requiredKeys(spec).length).toBeGreaterThan(0);
  });

  test("code and name are required (when present)", () => {
    const req = new Set(requiredKeys(spec));
    if (colKeys(spec).includes("code")) expect(req.has("code")).toBe(true);
    if (colKeys(spec).includes("name")) expect(req.has("name")).toBe(true);
  });

  test("has a sampleRows array (at least 1 row)", () => {
    expect(Array.isArray(spec.sampleRows)).toBe(true);
    expect(spec.sampleRows.length).toBeGreaterThan(0);
  });

  test("every sample row sets every REQUIRED column", () => {
    for (const row of spec.sampleRows) {
      for (const k of requiredKeys(spec)) {
        expect(row[k]).toBeDefined();
        // empty string is NOT acceptable for a required column
        expect(row[k]).not.toBe("");
      }
    }
  });

  test("every sample row uses only declared column keys", () => {
    const declared = new Set(colKeys(spec));
    for (const row of spec.sampleRows) {
      for (const k of Object.keys(row)) {
        expect(declared.has(k)).toBe(true);
      }
    }
  });

  test("sample row codes are unique within the dim", () => {
    const codes = spec.sampleRows.map((r) => r.code).filter((v) => v !== undefined && v !== "");
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("has a non-empty notes array of strings", () => {
    expect(Array.isArray(spec.notes)).toBe(true);
    expect(spec.notes.length).toBeGreaterThan(0);
    for (const n of spec.notes) {
      expect(typeof n).toBe("string");
      expect(n.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// COMMON columns — code/name/description/parent_code
// ---------------------------------------------------------------------------

describe("COMMON columns (code/name/description/parent_code)", () => {
  /**
   * Dims that should include parent_code (hierarchical members).
   * Currency/ICP/Origin are flat catalogs.
   */
  const HIERARCHICAL: Dim[] = [
    "account", "entity", "scenario", "time",
    "ud1", "ud2", "ud3", "ud4", "ud5", "ud6", "ud7", "ud8",
  ];
  const FLAT: Dim[] = ["currency", "icp", "origin"];

  test.each(HIERARCHICAL)("%s includes parent_code", (dim) => {
    expect(colKeys(TEMPLATES[dim])).toContain("parent_code");
  });

  test.each(FLAT)("%s does NOT include parent_code (flat catalog)", (dim) => {
    expect(colKeys(TEMPLATES[dim])).not.toContain("parent_code");
  });

  test.each(SUPPORTED_DIMS)("%s includes code/name/description", (dim) => {
    const keys = colKeys(TEMPLATES[dim]);
    expect(keys).toContain("code");
    expect(keys).toContain("name");
    expect(keys).toContain("description");
  });

  test.each(SUPPORTED_DIMS)("%s puts code FIRST and name SECOND", (dim) => {
    const keys = colKeys(TEMPLATES[dim]);
    expect(keys[0]).toBe("code");
    expect(keys[1]).toBe("name");
  });
});

// ---------------------------------------------------------------------------
// Hierarchy invariant — sample rows' parent_code must reference a row
// in the same sheet (or be empty).
// ---------------------------------------------------------------------------

describe("sample-row hierarchy integrity", () => {
  test.each(SUPPORTED_DIMS)("%s parent_code values resolve within the dim", (dim) => {
    const spec = TEMPLATES[dim];
    const codes = new Set(spec.sampleRows.map((r) => String(r.code)));
    for (const row of spec.sampleRows) {
      const parent = row.parent_code;
      if (parent === undefined || parent === "" || parent === null) continue;
      expect(codes.has(String(parent))).toBe(true);
    }
  });

  test.each(SUPPORTED_DIMS)("%s has at least one ROOT row (no parent)", (dim) => {
    const spec = TEMPLATES[dim];
    // For flat dims (no parent_code column), trivially true.
    if (!colKeys(spec).includes("parent_code")) return;
    const rootRows = spec.sampleRows.filter(
      (r) => r.parent_code === "" || r.parent_code === undefined || r.parent_code === null
    );
    expect(rootRows.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// account — the most complex template
// ---------------------------------------------------------------------------

describe("TEMPLATES.account", () => {
  const spec = TEMPLATES.account;

  test("sheetName is 'Accounts'", () => {
    expect(spec.sheetName).toBe("Accounts");
  });

  test("requires code, name, account_type", () => {
    expect(new Set(requiredKeys(spec))).toEqual(new Set(["code", "name", "account_type"]));
  });

  test("includes every account-shape column", () => {
    const keys = colKeys(spec);
    expect(keys).toEqual(expect.arrayContaining([
      "code", "name", "description", "parent_code",
      "account_type", "time_balance", "switch_sign",
      "storage_type", "calculation_type", "variance_type",
      "currency_behavior", "formula",
    ]));
  });

  test("EBITDA sample row uses calculation_type FORMULA with a formula", () => {
    const ebitda = spec.sampleRows.find((r) => r.code === "EBITDA");
    expect(ebitda).toBeDefined();
    expect(ebitda?.calculation_type).toBe("FORMULA");
    expect(ebitda?.formula).toMatch(/\[\d+\]/); // references like [4000]
  });

  test("REVENUE rollup row '4000' has empty parent_code (root)", () => {
    const r = spec.sampleRows.find((row) => row.code === "4000");
    expect(r).toBeDefined();
    expect(r?.parent_code).toBe("");
    expect(r?.account_type).toBe("REVENUE");
  });

  test("child rows 4100 / 4200 roll up to 4000", () => {
    const child1 = spec.sampleRows.find((r) => r.code === "4100");
    const child2 = spec.sampleRows.find((r) => r.code === "4200");
    expect(child1?.parent_code).toBe("4000");
    expect(child2?.parent_code).toBe("4000");
  });
});

// ---------------------------------------------------------------------------
// entity — base_currency + consolidation surface
// ---------------------------------------------------------------------------

describe("TEMPLATES.entity", () => {
  const spec = TEMPLATES.entity;

  test("sheetName is 'Entities'", () => {
    expect(spec.sheetName).toBe("Entities");
  });

  test("requires code, name, base_currency", () => {
    expect(new Set(requiredKeys(spec))).toEqual(new Set(["code", "name", "base_currency"]));
  });

  test("includes entity-specific columns", () => {
    expect(colKeys(spec)).toEqual(expect.arrayContaining([
      "base_currency", "consolidation_method", "ownership_pct",
      "icp_enabled", "country", "tax_id",
    ]));
  });

  test("DTX root entity is INR-base FULL-consol 100%", () => {
    const dtx = spec.sampleRows.find((r) => r.code === "DTX");
    expect(dtx).toBeDefined();
    expect(dtx?.base_currency).toBe("INR");
    expect(dtx?.consolidation_method).toBe("FULL");
    expect(dtx?.ownership_pct).toBe(100);
  });

  test("all child entities roll up to DTX", () => {
    const children = spec.sampleRows.filter((r) => r.code !== "DTX");
    for (const c of children) {
      expect(c.parent_code).toBe("DTX");
    }
  });
});

// ---------------------------------------------------------------------------
// scenario
// ---------------------------------------------------------------------------

describe("TEMPLATES.scenario", () => {
  const spec = TEMPLATES.scenario;

  test("requires code, name, scenario_type", () => {
    expect(new Set(requiredKeys(spec))).toEqual(new Set(["code", "name", "scenario_type"]));
  });

  test("ACTUAL sample row is frozen", () => {
    const actual = spec.sampleRows.find((r) => r.code === "ACTUAL");
    expect(actual?.is_frozen).toBe("true");
  });

  test("at least one of each ACTUAL / BUDGET / FORECAST is present", () => {
    const types = new Set(spec.sampleRows.map((r) => r.scenario_type));
    expect(types.has("ACTUAL")).toBe(true);
    expect(types.has("BUDGET")).toBe(true);
    expect(types.has("FORECAST")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// time — period structure
// ---------------------------------------------------------------------------

describe("TEMPLATES.time", () => {
  const spec = TEMPLATES.time;

  test("sheetName is 'TimePeriods'", () => {
    expect(spec.sheetName).toBe("TimePeriods");
  });

  test("requires code, name, period_type, fiscal_year, start_date, end_date", () => {
    expect(new Set(requiredKeys(spec))).toEqual(
      new Set(["code", "name", "period_type", "fiscal_year", "start_date", "end_date"])
    );
  });

  test("FY2026 is root (no parent)", () => {
    const fy = spec.sampleRows.find((r) => r.code === "FY2026");
    expect(fy?.parent_code).toBe("");
    expect(fy?.period_type).toBe("YEAR");
  });

  test("Q1-FY2026 rolls up to FY2026", () => {
    const q1 = spec.sampleRows.find((r) => r.code === "Q1-FY2026");
    expect(q1?.parent_code).toBe("FY2026");
    expect(q1?.period_type).toBe("QUARTER");
  });

  test("month rows 2026M04..06 roll up to Q1-FY2026", () => {
    for (const code of ["2026M04", "2026M05", "2026M06"]) {
      const m = spec.sampleRows.find((r) => r.code === code);
      expect(m?.parent_code).toBe("Q1-FY2026");
      expect(m?.period_type).toBe("MONTH");
    }
  });

  test("all sample fiscal_year values are 2026 (number, not string)", () => {
    for (const r of spec.sampleRows) {
      expect(r.fiscal_year).toBe(2026);
      expect(typeof r.fiscal_year).toBe("number");
    }
  });

  test("start_date and end_date are YYYY-MM-DD format", () => {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    for (const r of spec.sampleRows) {
      expect(String(r.start_date)).toMatch(iso);
      expect(String(r.end_date)).toMatch(iso);
    }
  });
});

// ---------------------------------------------------------------------------
// currency
// ---------------------------------------------------------------------------

describe("TEMPLATES.currency", () => {
  const spec = TEMPLATES.currency;

  test("requires code, name, iso_code", () => {
    expect(new Set(requiredKeys(spec))).toEqual(new Set(["code", "name", "iso_code"]));
  });

  test("exactly one sample row has is_base=true", () => {
    const bases = spec.sampleRows.filter((r) => r.is_base === "true");
    expect(bases).toHaveLength(1);
    expect(bases[0].iso_code).toBe("INR");
  });

  test("ISO codes match the row code", () => {
    for (const r of spec.sampleRows) {
      expect(r.code).toBe(r.iso_code);
    }
  });
});

// ---------------------------------------------------------------------------
// icp
// ---------------------------------------------------------------------------

describe("TEMPLATES.icp", () => {
  const spec = TEMPLATES.icp;

  test("requires code, name, entity_code", () => {
    expect(new Set(requiredKeys(spec))).toEqual(new Set(["code", "name", "entity_code"]));
  });

  test("notes mention the system-managed migration", () => {
    expect(spec.notes.some((n) => /system-managed/i.test(n))).toBe(true);
  });

  test("sample rows reference Entity codes from the entity template", () => {
    const entityCodes = new Set(TEMPLATES.entity.sampleRows.map((r) => r.code));
    for (const r of spec.sampleRows) {
      expect(entityCodes.has(r.entity_code as string)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// origin
// ---------------------------------------------------------------------------

describe("TEMPLATES.origin", () => {
  const spec = TEMPLATES.origin;

  test("requires code, name, origin_type", () => {
    expect(new Set(requiredKeys(spec))).toEqual(new Set(["code", "name", "origin_type"]));
  });

  test("sample rows cover IMPORT / FORM / AI / CALC", () => {
    const types = new Set(spec.sampleRows.map((r) => r.origin_type));
    for (const t of ["IMPORT", "FORM", "AI", "CALC"]) {
      expect(types.has(t)).toBe(true);
    }
  });

  test("notes mention 'Import' is seeded automatically", () => {
    expect(spec.notes.some((n) => /seeded automatically/i.test(n))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UD1..UD8 — uniform structure
// ---------------------------------------------------------------------------

describe("UD slots (ud1..ud8)", () => {
  test.each(UD_SLOTS)("%s shares the same column shape", (slot) => {
    const spec = TEMPLATES[slot];
    expect(colKeys(spec)).toEqual(["code", "name", "description", "parent_code", "category"]);
  });

  test.each(UD_SLOTS)("%s sheetName is the uppercased slot", (slot) => {
    expect(TEMPLATES[slot].sheetName).toBe(slot.toUpperCase());
  });

  test.each(UD_SLOTS)("%s root sample row code is <SLOT>-ROOT", (slot) => {
    const spec = TEMPLATES[slot];
    const expectedRoot = `${slot.toUpperCase()}-ROOT`;
    const root = spec.sampleRows.find((r) => r.code === expectedRoot);
    expect(root).toBeDefined();
    expect(root?.parent_code).toBe("");
  });

  test.each(UD_SLOTS)("%s child sample rows roll up to the root", (slot) => {
    const spec = TEMPLATES[slot];
    const root = `${slot.toUpperCase()}-ROOT`;
    const children = spec.sampleRows.filter((r) => r.code !== root);
    expect(children.length).toBeGreaterThan(0);
    for (const c of children) {
      expect(c.parent_code).toBe(root);
    }
  });

  test("all 8 UD slots have IDENTICAL column structure", () => {
    const first = JSON.stringify(colKeys(TEMPLATES.ud1));
    for (const slot of UD_SLOTS) {
      expect(JSON.stringify(colKeys(TEMPLATES[slot]))).toBe(first);
    }
  });

  test("all 8 UD slots have IDENTICAL required-column sets", () => {
    const first = JSON.stringify(requiredKeys(TEMPLATES.ud1).sort());
    for (const slot of UD_SLOTS) {
      expect(JSON.stringify(requiredKeys(TEMPLATES[slot]).sort())).toBe(first);
    }
  });

  test("all 8 UD slots have IDENTICAL notes", () => {
    const first = JSON.stringify(TEMPLATES.ud1.notes);
    for (const slot of UD_SLOTS) {
      expect(JSON.stringify(TEMPLATES[slot].notes)).toBe(first);
    }
  });
});

// ---------------------------------------------------------------------------
// notes invariants — every template's notes mention the REQUIRED columns
// ---------------------------------------------------------------------------

describe("notes mention REQUIRED columns", () => {
  test.each(SUPPORTED_DIMS)("%s notes call out 'REQUIRED'", (dim) => {
    const spec = TEMPLATES[dim];
    const blob = spec.notes.join(" | ");
    expect(blob).toMatch(/REQUIRED/);
  });
});
