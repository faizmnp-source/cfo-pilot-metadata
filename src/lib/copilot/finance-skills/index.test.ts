// Unit tests pinning the Copilot finance-skills registry surface.
//
// These tests do NOT exercise `execute()` — that needs a real `fetch`
// + session cookie + tenant. Instead they pin the static contract that
// the Copilot endpoint (src/app/api/v2/copilot/chat/route.ts) and
// Anthropic tool-use rely on:
//
//   - FINANCE_SKILLS keys = exactly the published tool names
//   - skillsToToolDefs() shape matches Anthropic Messages API tool format
//   - findSkill() round-trips known names and returns null on miss
//   - per-skill invariants: snake_case name, non-empty description,
//     valid JSON-schema inputSchema, non-empty skillPrompt, async execute
//
// Adding a new finance skill? Update EXPECTED_SKILL_NAMES below and the
// "registry keys are exactly these 8" assertion will catch drift.

import {
  FINANCE_SKILLS,
  findSkill,
  skillsToToolDefs,
} from "./index";
import type { FinanceSkill } from "./types";

// --- pinned skill set (update when adding a skill) ---
const EXPECTED_SKILL_NAMES = [
  "analyze_income_statement",
  "do_variance_analysis",
  "plan_month_end_close",
  "reconcile_account",
  "prepare_journal_entry",
  "prepare_audit_workpaper",
  "plan_sox_test",
  "prepare_close_je_batch",
] as const;

// --- helpers ---
const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

// =========================================================================
// Registry surface
// =========================================================================

describe("FINANCE_SKILLS registry — surface", () => {
  it("is a plain object", () => {
    expect(isPlainObject(FINANCE_SKILLS)).toBe(true);
  });

  it("has exactly the 8 expected skill keys", () => {
    const keys = Object.keys(FINANCE_SKILLS).sort();
    expect(keys).toEqual([...EXPECTED_SKILL_NAMES].sort());
  });

  it("registry size matches expected set", () => {
    expect(Object.keys(FINANCE_SKILLS)).toHaveLength(EXPECTED_SKILL_NAMES.length);
    expect(EXPECTED_SKILL_NAMES).toHaveLength(8);
  });

  it("every registry key is snake_case", () => {
    for (const key of Object.keys(FINANCE_SKILLS)) {
      expect(key).toMatch(SNAKE_CASE);
    }
  });

  it("every registry key has no spaces, no hyphens, no uppercase", () => {
    for (const key of Object.keys(FINANCE_SKILLS)) {
      expect(key).not.toMatch(/\s/);
      expect(key).not.toMatch(/-/);
      expect(key).toBe(key.toLowerCase());
    }
  });

  it("every registry key maps to a non-null skill", () => {
    for (const key of Object.keys(FINANCE_SKILLS)) {
      expect(FINANCE_SKILLS[key]).toBeDefined();
      expect(FINANCE_SKILLS[key]).not.toBeNull();
    }
  });

  it("every skill.name matches its registry key (self-consistent)", () => {
    for (const [key, skill] of Object.entries(FINANCE_SKILLS)) {
      expect(skill.name).toBe(key);
    }
  });

  it("registry keys are unique (no duplicate names registered)", () => {
    const keys = Object.keys(FINANCE_SKILLS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("registry skill names are unique across all skills", () => {
    const names = Object.values(FINANCE_SKILLS).map(s => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

// =========================================================================
// Per-skill invariants
// =========================================================================

describe("FINANCE_SKILLS — per-skill invariants", () => {
  for (const expectedName of EXPECTED_SKILL_NAMES) {
    describe(`skill: ${expectedName}`, () => {
      let skill: FinanceSkill;
      beforeAll(() => { skill = FINANCE_SKILLS[expectedName]; });

      it("is registered", () => {
        expect(skill).toBeDefined();
      });

      it("has the expected name", () => {
        expect(skill.name).toBe(expectedName);
      });

      it("has a non-empty trimmed description", () => {
        expect(typeof skill.description).toBe("string");
        expect(skill.description.trim()).toBe(skill.description);
        expect(skill.description.length).toBeGreaterThan(0);
      });

      it("description is substantive (≥50 chars — Claude needs context)", () => {
        expect(skill.description.length).toBeGreaterThanOrEqual(50);
      });

      it("has a non-empty skillPrompt (the analytical lens)", () => {
        expect(typeof skill.skillPrompt).toBe("string");
        expect(skill.skillPrompt.length).toBeGreaterThan(100);
      });

      it("skillPrompt opens with a markdown heading", () => {
        expect(skill.skillPrompt.startsWith("# ")).toBe(true);
      });

      it("has an inputSchema object with type 'object'", () => {
        expect(skill.inputSchema).toBeDefined();
        expect(typeof skill.inputSchema).toBe("object");
        expect(skill.inputSchema.type).toBe("object");
      });

      it("inputSchema.properties is a non-empty plain object", () => {
        expect(isPlainObject(skill.inputSchema.properties)).toBe(true);
        expect(Object.keys(skill.inputSchema.properties).length).toBeGreaterThan(0);
      });

      it("every inputSchema property is a plain object with valid identifier name", () => {
        for (const [propName, propDef] of Object.entries(
          skill.inputSchema.properties as Record<string, any>
        )) {
          expect(propDef).toBeDefined();
          expect(isPlainObject(propDef)).toBe(true);
          // propName should be a valid JS identifier (camelCase / snake_case)
          expect(propName).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*$/);
          // If a `type` is given, it must be a JSON-schema primitive.
          // (Some optional free-text fields omit type — Anthropic tolerates this.)
          if (propDef.type !== undefined) {
            expect(typeof propDef.type).toBe("string");
            expect(["string", "number", "boolean", "object", "array", "integer"]).toContain(
              propDef.type
            );
          }
        }
      });

      it("every REQUIRED inputSchema property must have an explicit type", () => {
        // Required fields cannot be ambiguous — Claude needs to know how to
        // shape the argument. Optional fields may omit type (e.g. free text).
        const props = skill.inputSchema.properties as Record<string, any>;
        for (const reqName of skill.inputSchema.required as string[]) {
          const propDef = props[reqName];
          expect(propDef).toBeDefined();
          expect(typeof propDef.type).toBe("string");
          expect(["string", "number", "boolean", "object", "array", "integer"]).toContain(
            propDef.type
          );
        }
      });

      it("inputSchema.required is an array of strings", () => {
        expect(Array.isArray(skill.inputSchema.required)).toBe(true);
        for (const r of skill.inputSchema.required) {
          expect(typeof r).toBe("string");
          expect(r.length).toBeGreaterThan(0);
        }
      });

      it("every required field exists in properties", () => {
        const props = Object.keys(skill.inputSchema.properties);
        for (const r of skill.inputSchema.required as string[]) {
          expect(props).toContain(r);
        }
      });

      it("inputSchema.required has no duplicates", () => {
        const req = skill.inputSchema.required as string[];
        expect(new Set(req).size).toBe(req.length);
      });

      it("execute is a function with arity 2 (args, ctx)", () => {
        expect(typeof skill.execute).toBe("function");
        // Two declared params: (args, ctx). Optional params with defaults
        // would lower this; if a skill's signature changes deliberately,
        // update both source and test.
        expect(skill.execute.length).toBe(2);
      });

      it("execute returns a Promise/thenable when invoked", async () => {
        // Stub fetch globally — some skills wrap fetch in try/catch and
        // still return a valid FinanceSkillResult; others throw. Either
        // way, the returned value must be a Promise (async contract for
        // Anthropic tool-use executor).
        const origFetch = (globalThis as any).fetch;
        (globalThis as any).fetch = () =>
          Promise.resolve({ json: () => Promise.resolve({ data: {} }) });
        try {
          const ret = skill.execute(
            {
              // Provide the union of all known required field names so any
              // skill called from this test has its required args present.
              scenarioId: "s-test",
              compareScenarioId: "s-test-compare",
              entityId: "e-test",
              yearCode: "FY2026",
              closePeriod: "2026-04",
              accountId: "acc-test",
              periodCode: "2026-04",
              kind: "accrual",
              amount: 1000,
              controlId: "ctrl-test",
              controlArea: "Revenue",
              populationSize: 100,
              frequency: "monthly",
            },
            { tenantId: "t", sessionCookie: "", baseUrl: "http://localhost" } as any
          );
          expect(ret).toBeDefined();
          expect(typeof (ret as any).then).toBe("function");
          // resolve it to avoid unhandled rejection warnings; we don't
          // assert on shape because that's the per-skill responsibility.
          await ret.catch(() => {});
        } finally {
          (globalThis as any).fetch = origFetch;
        }
      });
    });
  }
});

// =========================================================================
// Specific skill pinning — required-field contracts that the route relies on
// =========================================================================

describe("FINANCE_SKILLS — pinned required fields", () => {
  it("analyze_income_statement requires scenarioId + entityId + yearCode", () => {
    expect(FINANCE_SKILLS["analyze_income_statement"].inputSchema.required.sort()).toEqual(
      ["entityId", "scenarioId", "yearCode"]
    );
  });

  it("do_variance_analysis requires both scenarios + entityId + yearCode", () => {
    expect(FINANCE_SKILLS["do_variance_analysis"].inputSchema.required.sort()).toEqual(
      ["compareScenarioId", "entityId", "scenarioId", "yearCode"]
    );
  });

  it("plan_month_end_close requires only closePeriod", () => {
    expect(FINANCE_SKILLS["plan_month_end_close"].inputSchema.required).toEqual(
      ["closePeriod"]
    );
  });

  it("reconcile_account requires accountId + entityId + periodCode", () => {
    expect(FINANCE_SKILLS["reconcile_account"].inputSchema.required.sort()).toEqual(
      ["accountId", "entityId", "periodCode"]
    );
  });

  it("prepare_journal_entry requires kind + entityId + periodCode + amount", () => {
    expect(FINANCE_SKILLS["prepare_journal_entry"].inputSchema.required.sort()).toEqual(
      ["amount", "entityId", "kind", "periodCode"]
    );
  });

  it("prepare_audit_workpaper requires controlId + controlArea + populationSize", () => {
    expect(FINANCE_SKILLS["prepare_audit_workpaper"].inputSchema.required.sort()).toEqual(
      ["controlArea", "controlId", "populationSize"]
    );
  });

  it("plan_sox_test requires controlId + frequency", () => {
    expect(FINANCE_SKILLS["plan_sox_test"].inputSchema.required.sort()).toEqual(
      ["controlId", "frequency"]
    );
  });

  it("prepare_close_je_batch requires closePeriod + entityId", () => {
    expect(FINANCE_SKILLS["prepare_close_je_batch"].inputSchema.required.sort()).toEqual(
      ["closePeriod", "entityId"]
    );
  });
});

// =========================================================================
// skillsToToolDefs() — Anthropic Messages API contract
// =========================================================================

describe("skillsToToolDefs()", () => {
  it("returns an array with one entry per registered skill", () => {
    const defs = skillsToToolDefs();
    expect(Array.isArray(defs)).toBe(true);
    expect(defs).toHaveLength(Object.keys(FINANCE_SKILLS).length);
    expect(defs).toHaveLength(EXPECTED_SKILL_NAMES.length);
  });

  it("each tool def has exactly {name, description, input_schema}", () => {
    for (const def of skillsToToolDefs()) {
      expect(Object.keys(def).sort()).toEqual(
        ["description", "input_schema", "name"]
      );
    }
  });

  it("every tool def name matches a registered skill name", () => {
    const registeredNames = new Set(Object.keys(FINANCE_SKILLS));
    for (const def of skillsToToolDefs()) {
      expect(registeredNames.has(def.name)).toBe(true);
    }
  });

  it("tool def names are unique", () => {
    const names = skillsToToolDefs().map(d => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("tool def description matches skill description verbatim", () => {
    for (const def of skillsToToolDefs()) {
      expect(def.description).toBe(FINANCE_SKILLS[def.name].description);
    }
  });

  it("tool def input_schema matches skill inputSchema by reference", () => {
    for (const def of skillsToToolDefs()) {
      // skillsToToolDefs renames `inputSchema` -> `input_schema` but reuses
      // the same object reference (Anthropic API casing).
      expect(def.input_schema).toBe(FINANCE_SKILLS[def.name].inputSchema);
    }
  });

  it("every tool def input_schema is a JSON-schema 'object' shape", () => {
    for (const def of skillsToToolDefs()) {
      expect(def.input_schema.type).toBe("object");
      expect(isPlainObject(def.input_schema.properties)).toBe(true);
      expect(Array.isArray(def.input_schema.required)).toBe(true);
    }
  });

  it("does NOT leak skillPrompt or execute into Anthropic tool defs", () => {
    // Anthropic's tool format only accepts name/description/input_schema.
    // Leaking skillPrompt would balloon every chat token bill; leaking
    // execute would crash the API call.
    for (const def of skillsToToolDefs() as any[]) {
      expect(def.skillPrompt).toBeUndefined();
      expect(def.execute).toBeUndefined();
      expect(def.inputSchema).toBeUndefined(); // wrong casing
    }
  });

  it("is idempotent — calling twice returns equivalent shape", () => {
    const a = skillsToToolDefs();
    const b = skillsToToolDefs();
    expect(a).toHaveLength(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].name).toBe(b[i].name);
      expect(a[i].description).toBe(b[i].description);
    }
  });
});

// =========================================================================
// findSkill()
// =========================================================================

describe("findSkill()", () => {
  for (const name of EXPECTED_SKILL_NAMES) {
    it(`returns the ${name} skill for its exact name`, () => {
      const s = findSkill(name);
      expect(s).not.toBeNull();
      expect(s!.name).toBe(name);
    });
  }

  it("returns the SAME object reference as FINANCE_SKILLS[name]", () => {
    for (const name of EXPECTED_SKILL_NAMES) {
      expect(findSkill(name)).toBe(FINANCE_SKILLS[name]);
    }
  });

  it("returns null for unknown skill name", () => {
    expect(findSkill("nonexistent_tool")).toBeNull();
    expect(findSkill("ANALYZE_INCOME_STATEMENT")).toBeNull(); // wrong case
    expect(findSkill("analyze-income-statement")).toBeNull(); // wrong separator
  });

  it("returns null for empty string", () => {
    expect(findSkill("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(findSkill("   ")).toBeNull();
    expect(findSkill("\t")).toBeNull();
    expect(findSkill("\n")).toBeNull();
  });

  it("returns null even if name with surrounding whitespace (no auto-trim)", () => {
    // findSkill does not trim — registry expects exact key match.
    // If this contract changes, update both findSkill and this test.
    expect(findSkill(" analyze_income_statement")).toBeNull();
    expect(findSkill("analyze_income_statement ")).toBeNull();
  });

  it("does not return Object.prototype noise (proto pollution guard)", () => {
    expect(findSkill("toString")).toBeNull();
    expect(findSkill("hasOwnProperty")).toBeNull();
    expect(findSkill("constructor")).toBeNull();
    expect(findSkill("__proto__")).toBeNull();
  });
});

// =========================================================================
// Cross-cutting: registry / toolDefs / findSkill agree
// =========================================================================

describe("registry / toolDefs / findSkill — cross-cutting consistency", () => {
  it("for every registry key, findSkill returns it and toolDefs lists it", () => {
    const toolNames = new Set(skillsToToolDefs().map(d => d.name));
    for (const key of Object.keys(FINANCE_SKILLS)) {
      expect(findSkill(key)).toBe(FINANCE_SKILLS[key]);
      expect(toolNames.has(key)).toBe(true);
    }
  });

  it("every expected skill name is present in all three surfaces", () => {
    const registryKeys = new Set(Object.keys(FINANCE_SKILLS));
    const toolNames    = new Set(skillsToToolDefs().map(d => d.name));
    for (const name of EXPECTED_SKILL_NAMES) {
      expect(registryKeys.has(name)).toBe(true);
      expect(toolNames.has(name)).toBe(true);
      expect(findSkill(name)).not.toBeNull();
    }
  });
});
