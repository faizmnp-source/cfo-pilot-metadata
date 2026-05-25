/*
 * Pure-function unit tests for the Copilot write-action registry
 * (Phase 6 — commit b92b06c). Targets the surface that does NOT touch
 * prisma: KNOWN_ACTIONS, isKnownAction, describeAction. executeAction
 * is intentionally NOT covered here — it requires a prisma mock and is
 * the natural next slot.
 *
 * Load-bearing contract pins:
 *  - KNOWN_ACTIONS list (verbatim 8 entries, ordering) — drift would
 *    silently shift the dropdown options in the approval UI.
 *  - isKnownAction narrow function — type guard semantics, no false-
 *    positives for similarly-named keys.
 *  - describeAction string formats — these are user-facing in the
 *    approval dialog; drift = customer-visible regression.
 *  - undefined / null arg coercion via optional chaining + template
 *    literals (these surface as "undefined" / "null" strings).
 */

import {
  KNOWN_ACTIONS,
  isKnownAction,
  describeAction,
  type ActionKind,
} from "./copilot-actions";

describe("packaging/copilot-actions — KNOWN_ACTIONS", () => {
  it("ships exactly 8 known actions", () => {
    expect(KNOWN_ACTIONS).toHaveLength(8);
  });

  it("contains the canonical Phase 6 v1 set", () => {
    expect([...KNOWN_ACTIONS]).toEqual([
      "CREATE_ENTITY",
      "CREATE_ACCOUNT",
      "LOCK_PERIOD",
      "UNLOCK_PERIOD",
      "RUN_CONSOLIDATION",
      "RUN_TRANSLATION",
      "RUN_CALC_RULE",
      "SEED_DEMO_MAPPINGS",
    ]);
  });

  it("is a readonly tuple — runtime mutation does not affect type union", () => {
    // TS-level: ActionKind is the tuple element union.
    const k: ActionKind = "CREATE_ENTITY";
    expect(KNOWN_ACTIONS.includes(k)).toBe(true);
  });

  it("contains both period-lifecycle pair members", () => {
    expect((KNOWN_ACTIONS as readonly string[]).includes("LOCK_PERIOD")).toBe(true);
    expect((KNOWN_ACTIONS as readonly string[]).includes("UNLOCK_PERIOD")).toBe(true);
  });

  it("contains both create-member primitives (entity + account)", () => {
    expect((KNOWN_ACTIONS as readonly string[]).includes("CREATE_ENTITY")).toBe(true);
    expect((KNOWN_ACTIONS as readonly string[]).includes("CREATE_ACCOUNT")).toBe(true);
  });

  it("contains all 3 delegated process kinds", () => {
    expect((KNOWN_ACTIONS as readonly string[]).includes("RUN_CONSOLIDATION")).toBe(true);
    expect((KNOWN_ACTIONS as readonly string[]).includes("RUN_TRANSLATION")).toBe(true);
    expect((KNOWN_ACTIONS as readonly string[]).includes("RUN_CALC_RULE")).toBe(true);
  });

  it("entries are uppercase + underscore-separated (registry naming convention)", () => {
    for (const k of KNOWN_ACTIONS) {
      expect(k).toMatch(/^[A-Z][A-Z_]*[A-Z]$/);
    }
  });

  it("entries are unique (no duplicates)", () => {
    const set = new Set<string>(KNOWN_ACTIONS as readonly string[]);
    expect(set.size).toBe(KNOWN_ACTIONS.length);
  });
});

describe("packaging/copilot-actions — isKnownAction", () => {
  it("returns true for every entry in the registry", () => {
    for (const k of KNOWN_ACTIONS) {
      expect(isKnownAction(k)).toBe(true);
    }
  });

  it("returns false for an unknown kind", () => {
    expect(isKnownAction("DELETE_ENTITY")).toBe(false);
    expect(isKnownAction("HACK_PRODUCTION")).toBe(false);
    expect(isKnownAction("")).toBe(false);
  });

  it("is case-sensitive — does NOT accept lowercase", () => {
    expect(isKnownAction("create_entity")).toBe(false);
    expect(isKnownAction("Create_Entity")).toBe(false);
  });

  it("does not match by prefix", () => {
    expect(isKnownAction("CREATE_")).toBe(false);
    expect(isKnownAction("CREATE_ENTITY_AND_MORE")).toBe(false);
  });

  it("does not match by substring", () => {
    expect(isKnownAction("ENTITY")).toBe(false);
    expect(isKnownAction("RUN")).toBe(false);
  });

  it("rejects whitespace variants", () => {
    expect(isKnownAction(" CREATE_ENTITY")).toBe(false);
    expect(isKnownAction("CREATE_ENTITY ")).toBe(false);
    expect(isKnownAction("CREATE ENTITY")).toBe(false);
  });

  it("narrows the type when true (compile-time check at runtime)", () => {
    const raw: string = "CREATE_ENTITY";
    if (isKnownAction(raw)) {
      // TS: now narrowed to ActionKind.
      const narrowed: ActionKind = raw;
      expect(narrowed).toBe("CREATE_ENTITY");
    }
  });

  it("rejects an empty string", () => {
    expect(isKnownAction("")).toBe(false);
  });
});

describe("packaging/copilot-actions — describeAction", () => {
  describe("CREATE_ENTITY", () => {
    it("formats with code + name", () => {
      const s = describeAction("CREATE_ENTITY", { code: "ENT1", name: "New Entity" });
      expect(s).toBe('Create new entity "ENT1" — New Entity');
    });
    it("surfaces undefined when code missing", () => {
      const s = describeAction("CREATE_ENTITY", { name: "Only Name" });
      expect(s).toBe('Create new entity "undefined" — Only Name');
    });
    it("surfaces undefined when name missing", () => {
      const s = describeAction("CREATE_ENTITY", { code: "ENT1" });
      expect(s).toBe('Create new entity "ENT1" — undefined');
    });
    it("handles args = null gracefully via optional chaining", () => {
      const s = describeAction("CREATE_ENTITY", null);
      expect(s).toBe('Create new entity "undefined" — undefined');
    });
    it("handles args = undefined gracefully", () => {
      const s = describeAction("CREATE_ENTITY", undefined);
      expect(s).toBe('Create new entity "undefined" — undefined');
    });
  });

  describe("CREATE_ACCOUNT", () => {
    it("formats with code + name + type", () => {
      const s = describeAction("CREATE_ACCOUNT", { code: "4001", name: "Revenue A", type: "REVENUE" });
      expect(s).toBe('Create new account "4001" — Revenue A (type: REVENUE)');
    });
    it("type field is shown verbatim even if not a known account type", () => {
      const s = describeAction("CREATE_ACCOUNT", { code: "X", name: "Y", type: "WEIRD" });
      expect(s).toContain("(type: WEIRD)");
    });
    it("surfaces undefined type when omitted", () => {
      const s = describeAction("CREATE_ACCOUNT", { code: "4001", name: "Revenue A" });
      expect(s).toBe('Create new account "4001" — Revenue A (type: undefined)');
    });
    it("handles null args gracefully", () => {
      const s = describeAction("CREATE_ACCOUNT", null);
      expect(s).toBe('Create new account "undefined" — undefined (type: undefined)');
    });
  });

  describe("LOCK_PERIOD / UNLOCK_PERIOD", () => {
    it("LOCK_PERIOD formats with periodCode + warning suffix", () => {
      const s = describeAction("LOCK_PERIOD", { periodCode: "2026-03" });
      expect(s).toBe("Lock period 2026-03 — no further postings allowed");
    });
    it("UNLOCK_PERIOD formats minimally", () => {
      const s = describeAction("UNLOCK_PERIOD", { periodCode: "2026-03" });
      expect(s).toBe("Unlock period 2026-03");
    });
    it("LOCK_PERIOD surfaces undefined when periodCode missing", () => {
      const s = describeAction("LOCK_PERIOD", {});
      expect(s).toBe("Lock period undefined — no further postings allowed");
    });
    it("UNLOCK_PERIOD surfaces undefined when periodCode missing", () => {
      const s = describeAction("UNLOCK_PERIOD", {});
      expect(s).toBe("Unlock period undefined");
    });
    it("UNLOCK_PERIOD does NOT include warning suffix (asymmetric copy)", () => {
      const s = describeAction("UNLOCK_PERIOD", { periodCode: "X" });
      expect(s).not.toMatch(/postings/);
    });
  });

  describe("RUN_CONSOLIDATION / RUN_TRANSLATION", () => {
    it("RUN_CONSOLIDATION joins scenario/period with slash", () => {
      const s = describeAction("RUN_CONSOLIDATION", { scenarioCode: "ACTUAL", periodCode: "FY2026" });
      expect(s).toBe("Run consolidation for ACTUAL/FY2026");
    });
    it("RUN_TRANSLATION joins scenario/period with slash", () => {
      const s = describeAction("RUN_TRANSLATION", { scenarioCode: "ACTUAL", periodCode: "FY2026" });
      expect(s).toBe("Run FX translation for ACTUAL/FY2026");
    });
    it("RUN_CONSOLIDATION surfaces undefined when scenario missing", () => {
      const s = describeAction("RUN_CONSOLIDATION", { periodCode: "FY2026" });
      expect(s).toBe("Run consolidation for undefined/FY2026");
    });
    it("RUN_TRANSLATION surfaces undefined when period missing", () => {
      const s = describeAction("RUN_TRANSLATION", { scenarioCode: "ACTUAL" });
      expect(s).toBe("Run FX translation for ACTUAL/undefined");
    });
  });

  describe("RUN_CALC_RULE", () => {
    it("formats with ruleCode", () => {
      const s = describeAction("RUN_CALC_RULE", { ruleCode: "RULE_001" });
      expect(s).toBe("Run calc rule RULE_001");
    });
    it("surfaces undefined when ruleCode missing", () => {
      const s = describeAction("RUN_CALC_RULE", {});
      expect(s).toBe("Run calc rule undefined");
    });
  });

  describe("SEED_DEMO_MAPPINGS", () => {
    it("returns a fixed string regardless of args", () => {
      const s1 = describeAction("SEED_DEMO_MAPPINGS", {});
      const s2 = describeAction("SEED_DEMO_MAPPINGS", { anything: "here" });
      const s3 = describeAction("SEED_DEMO_MAPPINGS", null);
      expect(s1).toBe("Seed sample MappingRules for the tenant");
      expect(s2).toBe("Seed sample MappingRules for the tenant");
      expect(s3).toBe("Seed sample MappingRules for the tenant");
    });
    it("does NOT vary per tenant or per arg", () => {
      const s = describeAction("SEED_DEMO_MAPPINGS", { tenantId: "abc" });
      expect(s).not.toContain("abc");
    });
  });

  describe("default / unknown kind", () => {
    it("falls through to default with JSON.stringify of args", () => {
      const s = describeAction("MYSTERY_ACTION", { foo: 1, bar: "x" });
      expect(s).toBe('MYSTERY_ACTION with args {"foo":1,"bar":"x"}');
    });
    it("falls through for an empty string kind", () => {
      const s = describeAction("", { x: 1 });
      expect(s).toBe(' with args {"x":1}');
    });
    it("uses JSON.stringify (objects rendered, not [object Object])", () => {
      const s = describeAction("X", { a: { nested: true } });
      expect(s).toContain('{"a":{"nested":true}}');
      expect(s).not.toContain("[object Object]");
    });
    it("handles arrays in default branch", () => {
      const s = describeAction("X", [1, 2, 3]);
      expect(s).toBe("X with args [1,2,3]");
    });
    it("handles null in default branch", () => {
      const s = describeAction("X", null);
      expect(s).toBe("X with args null");
    });
    it("handles undefined args → JSON.stringify returns undefined", () => {
      // JSON.stringify(undefined) === undefined (not the string)
      // so the template literal renders it as "undefined".
      const s = describeAction("X", undefined);
      expect(s).toBe("X with args undefined");
    });
  });

  describe("kind dispatch — case sensitivity", () => {
    it("lowercase kind falls through to default branch (does not match)", () => {
      const s = describeAction("create_entity", { code: "X", name: "Y" });
      expect(s).toMatch(/^create_entity with args /);
      // confirm it didn't match the CREATE_ENTITY branch:
      expect(s).not.toMatch(/Create new entity/);
    });
    it("titlecase kind falls through to default branch", () => {
      const s = describeAction("Create_Entity", { code: "X", name: "Y" });
      expect(s).toMatch(/^Create_Entity with args /);
    });
  });

  describe("purity — describeAction is deterministic + non-mutating", () => {
    it("same kind + same args → same output", () => {
      const a = describeAction("CREATE_ENTITY", { code: "E1", name: "Foo" });
      const b = describeAction("CREATE_ENTITY", { code: "E1", name: "Foo" });
      expect(a).toBe(b);
    });
    it("does not mutate the args object", () => {
      const args = { code: "E1", name: "Foo" };
      const snap = JSON.stringify(args);
      describeAction("CREATE_ENTITY", args);
      expect(JSON.stringify(args)).toBe(snap);
    });
    it("never throws on weird inputs (each branch tolerates missing keys)", () => {
      for (const kind of KNOWN_ACTIONS) {
        expect(() => describeAction(kind, {})).not.toThrow();
        expect(() => describeAction(kind, null)).not.toThrow();
        expect(() => describeAction(kind, undefined)).not.toThrow();
      }
      expect(() => describeAction("UNKNOWN", null)).not.toThrow();
    });
  });
});
