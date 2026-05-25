/*
 * Packaging-tiers contract tests (Phase 6 — commit b92b06c).
 *
 * Load-bearing contract pins:
 *  - The 4 tier keys (STARTER / GROWTH / ENTERPRISE / FULL_OS) — drift =
 *    paywall regression in the Settings + select-package UI.
 *  - Strict feature-set inclusions per tier (Growth needs forecasting_v2;
 *    Enterprise needs consolidation + ai_copilot_write; etc.) — these
 *    decide what greys-out for which customer.
 *  - Wildcard "*" expansion semantics on FULL_OS — tierHasFeature MUST
 *    return true for any feature key.
 *  - Pricing & seat/entity-count invariants — INR / USD set for paid tiers,
 *    zero for sales-led tier; Starter < Growth < Enterprise.
 *  - tierFor() lookup-by-key with undefined fallthrough — UI relies on
 *    `undefined` (not throw) for unknown keys.
 */

import { TIERS, tierFor, tierHasFeature, type Tier, type TierSpec } from "./tiers";

const ALL_KEYS: Tier[] = ["STARTER", "GROWTH", "ENTERPRISE", "FULL_OS"];

describe("packaging tiers — TIERS catalog", () => {
  it("ships exactly 4 tiers", () => {
    expect(TIERS).toHaveLength(4);
  });

  it("ships tiers in upgrade order (Starter → Growth → Enterprise → Full OS)", () => {
    expect(TIERS.map(t => t.key)).toEqual([
      "STARTER", "GROWTH", "ENTERPRISE", "FULL_OS",
    ]);
  });

  it("every tier has a non-empty label + tagline", () => {
    for (const t of TIERS) {
      expect(typeof t.label).toBe("string");
      expect(t.label.length).toBeGreaterThan(0);
      expect(typeof t.tagline).toBe("string");
      expect(t.tagline.length).toBeGreaterThan(0);
    }
  });

  it("every tier has at least one highlight", () => {
    for (const t of TIERS) {
      expect(Array.isArray(t.highlights)).toBe(true);
      expect(t.highlights.length).toBeGreaterThan(0);
    }
  });

  it("every tier has a features array", () => {
    for (const t of TIERS) {
      expect(Array.isArray(t.features)).toBe(true);
      expect(t.features.length).toBeGreaterThan(0);
    }
  });

  it("keys are UPPER_SNAKE_CASE", () => {
    for (const t of TIERS) {
      expect(t.key).toMatch(/^[A-Z][A-Z_]*[A-Z0-9]$/);
    }
  });

  it("keys are unique across the catalog", () => {
    const keys = TIERS.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("packaging tiers — pricing semantics", () => {
  it("STARTER is priced (INR + USD > 0)", () => {
    const s = tierFor("STARTER")!;
    expect(s.priceInrPerMonth).toBeGreaterThan(0);
    expect(s.priceUsdPerMonth).toBeGreaterThan(0);
  });

  it("GROWTH is priced (INR + USD > 0)", () => {
    const g = tierFor("GROWTH")!;
    expect(g.priceInrPerMonth).toBeGreaterThan(0);
    expect(g.priceUsdPerMonth).toBeGreaterThan(0);
  });

  it("ENTERPRISE is priced (INR + USD > 0)", () => {
    const e = tierFor("ENTERPRISE")!;
    expect(e.priceInrPerMonth).toBeGreaterThan(0);
    expect(e.priceUsdPerMonth).toBeGreaterThan(0);
  });

  it("FULL_OS is contact-sales (INR === 0 + USD === 0)", () => {
    const f = tierFor("FULL_OS")!;
    expect(f.priceInrPerMonth).toBe(0);
    expect(f.priceUsdPerMonth).toBe(0);
  });

  it("paid tier INR pricing is monotonically increasing (Starter < Growth < Enterprise)", () => {
    const s = tierFor("STARTER")!;
    const g = tierFor("GROWTH")!;
    const e = tierFor("ENTERPRISE")!;
    expect(s.priceInrPerMonth).toBeLessThan(g.priceInrPerMonth);
    expect(g.priceInrPerMonth).toBeLessThan(e.priceInrPerMonth);
  });

  it("paid tier USD pricing is monotonically increasing", () => {
    const s = tierFor("STARTER")!;
    const g = tierFor("GROWTH")!;
    const e = tierFor("ENTERPRISE")!;
    expect(s.priceUsdPerMonth).toBeLessThan(g.priceUsdPerMonth);
    expect(g.priceUsdPerMonth).toBeLessThan(e.priceUsdPerMonth);
  });
});

describe("packaging tiers — seats & entities", () => {
  it("STARTER includes 3 seats, 1 entity", () => {
    const s = tierFor("STARTER")!;
    expect(s.seatsIncluded).toBe(3);
    expect(s.entitiesIncluded).toBe(1);
  });

  it("GROWTH includes 10 seats, 5 entities", () => {
    const g = tierFor("GROWTH")!;
    expect(g.seatsIncluded).toBe(10);
    expect(g.entitiesIncluded).toBe(5);
  });

  it("ENTERPRISE includes 25 seats, 25 entities", () => {
    const e = tierFor("ENTERPRISE")!;
    expect(e.seatsIncluded).toBe(25);
    expect(e.entitiesIncluded).toBe(25);
  });

  it("FULL_OS uses 0/0 as the unlimited sentinel", () => {
    const f = tierFor("FULL_OS")!;
    expect(f.seatsIncluded).toBe(0);
    expect(f.entitiesIncluded).toBe(0);
  });

  it("paid tier seat counts are monotonically increasing", () => {
    const s = tierFor("STARTER")!.seatsIncluded;
    const g = tierFor("GROWTH")!.seatsIncluded;
    const e = tierFor("ENTERPRISE")!.seatsIncluded;
    expect(s).toBeLessThan(g);
    expect(g).toBeLessThan(e);
  });
});

describe("packaging tiers — feature gates per tier", () => {
  it("STARTER gates: reporting + dashboard + import + audit", () => {
    expect(tierHasFeature("STARTER", "reporting_basic")).toBe(true);
    expect(tierHasFeature("STARTER", "dashboard_executive")).toBe(true);
    expect(tierHasFeature("STARTER", "data_input")).toBe(true);
    expect(tierHasFeature("STARTER", "audit_trail")).toBe(true);
    expect(tierHasFeature("STARTER", "lineage_drawer")).toBe(true);
  });

  it("STARTER does NOT gate forecasting / workforce / consolidation / copilot", () => {
    expect(tierHasFeature("STARTER", "forecasting_v2")).toBe(false);
    expect(tierHasFeature("STARTER", "workforce_planning")).toBe(false);
    expect(tierHasFeature("STARTER", "consolidation")).toBe(false);
    expect(tierHasFeature("STARTER", "ai_copilot_read")).toBe(false);
    expect(tierHasFeature("STARTER", "ai_copilot_write")).toBe(false);
  });

  it("GROWTH inherits all STARTER features + forecasting + workforce + close + read-only copilot", () => {
    expect(tierHasFeature("GROWTH", "reporting_basic")).toBe(true);
    expect(tierHasFeature("GROWTH", "forecasting_v2")).toBe(true);
    expect(tierHasFeature("GROWTH", "workforce_planning")).toBe(true);
    expect(tierHasFeature("GROWTH", "close_management")).toBe(true);
    expect(tierHasFeature("GROWTH", "ai_copilot_read")).toBe(true);
    expect(tierHasFeature("GROWTH", "budgeting_basic")).toBe(true);
  });

  it("GROWTH does NOT gate consolidation / write-actions / allocations DSL", () => {
    expect(tierHasFeature("GROWTH", "consolidation")).toBe(false);
    expect(tierHasFeature("GROWTH", "translation")).toBe(false);
    expect(tierHasFeature("GROWTH", "intercompany_elimination")).toBe(false);
    expect(tierHasFeature("GROWTH", "ai_copilot_write")).toBe(false);
    expect(tierHasFeature("GROWTH", "allocations_dsl")).toBe(false);
    expect(tierHasFeature("GROWTH", "modal_forecast_python")).toBe(false);
  });

  it("ENTERPRISE gates everything GROWTH does", () => {
    const growth = tierFor("GROWTH")!.features;
    for (const f of growth) {
      expect(tierHasFeature("ENTERPRISE", f)).toBe(true);
    }
  });

  it("ENTERPRISE adds consolidation, translation, IC elim, write-copilot, allocations, Modal forecast", () => {
    expect(tierHasFeature("ENTERPRISE", "consolidation")).toBe(true);
    expect(tierHasFeature("ENTERPRISE", "translation")).toBe(true);
    expect(tierHasFeature("ENTERPRISE", "intercompany_elimination")).toBe(true);
    expect(tierHasFeature("ENTERPRISE", "ai_copilot_write")).toBe(true);
    expect(tierHasFeature("ENTERPRISE", "allocations_dsl")).toBe(true);
    expect(tierHasFeature("ENTERPRISE", "modal_forecast_python")).toBe(true);
    expect(tierHasFeature("ENTERPRISE", "smart_mapping")).toBe(true);
    expect(tierHasFeature("ENTERPRISE", "tally_integration")).toBe(true);
    expect(tierHasFeature("ENTERPRISE", "scenarios_planning")).toBe(true);
    expect(tierHasFeature("ENTERPRISE", "project_planning")).toBe(true);
  });

  it("Tier inclusion is monotone — STARTER ⊂ GROWTH ⊂ ENTERPRISE", () => {
    const starter = tierFor("STARTER")!.features;
    const growth  = tierFor("GROWTH")!.features;
    const ent     = tierFor("ENTERPRISE")!.features;
    const growthSet = new Set(growth);
    const entSet    = new Set(ent);
    for (const f of starter) expect(growthSet.has(f)).toBe(true);
    for (const f of growth)  expect(entSet.has(f)).toBe(true);
  });

  it("ENTERPRISE feature list strictly grows vs GROWTH", () => {
    const g = new Set(tierFor("GROWTH")!.features);
    const e = new Set(tierFor("ENTERPRISE")!.features);
    expect(e.size).toBeGreaterThan(g.size);
  });
});

describe("packaging tiers — FULL_OS wildcard", () => {
  it("FULL_OS features array is literally [\"*\"]", () => {
    const f = tierFor("FULL_OS")!;
    expect(f.features).toEqual(["*"]);
  });

  it("FULL_OS grants any arbitrary feature key", () => {
    expect(tierHasFeature("FULL_OS", "any_random_feature_key")).toBe(true);
    expect(tierHasFeature("FULL_OS", "")).toBe(true);
    expect(tierHasFeature("FULL_OS", "feature_invented_tomorrow")).toBe(true);
  });

  it("FULL_OS grants every feature listed by lower tiers", () => {
    const allLowerFeatures: string[] = [
      ...tierFor("STARTER")!.features,
      ...tierFor("GROWTH")!.features,
      ...tierFor("ENTERPRISE")!.features,
    ];
    for (const f of allLowerFeatures) {
      expect(tierHasFeature("FULL_OS", f)).toBe(true);
    }
  });
});

describe("packaging tiers — tierFor() lookup", () => {
  it("returns each tier by canonical key", () => {
    for (const k of ALL_KEYS) {
      const t = tierFor(k);
      expect(t).toBeDefined();
      expect(t!.key).toBe(k);
    }
  });

  it("returns undefined for an unknown key (no throw)", () => {
    // Cast through unknown to bypass TS — runtime contract is what matters.
    expect(tierFor("WHO_KNOWS" as unknown as Tier)).toBeUndefined();
    expect(tierFor("" as unknown as Tier)).toBeUndefined();
  });

  it("is case-sensitive", () => {
    expect(tierFor("starter" as unknown as Tier)).toBeUndefined();
    expect(tierFor("Growth" as unknown as Tier)).toBeUndefined();
  });

  it("returns the same TierSpec reference across calls (no copy)", () => {
    const a = tierFor("STARTER");
    const b = tierFor("STARTER");
    expect(a).toBe(b);
  });
});

describe("packaging tiers — tierHasFeature() edge cases", () => {
  it("returns false for an unknown tier key (does not throw)", () => {
    expect(tierHasFeature("BOGUS" as unknown as Tier, "reporting_basic")).toBe(false);
  });

  it("returns false for a known tier but unlisted feature", () => {
    expect(tierHasFeature("STARTER", "feature_not_in_starter")).toBe(false);
    expect(tierHasFeature("GROWTH", "consolidation")).toBe(false);
  });

  it("does NOT prefix-match — partial keys are rejected", () => {
    expect(tierHasFeature("ENTERPRISE", "consolidat")).toBe(false);
    expect(tierHasFeature("ENTERPRISE", "consolidation_extra")).toBe(false);
  });

  it("is case-sensitive on the feature key", () => {
    expect(tierHasFeature("STARTER", "Reporting_basic")).toBe(false);
    expect(tierHasFeature("STARTER", "REPORTING_BASIC")).toBe(false);
  });

  it("empty feature on a non-FULL_OS tier returns false", () => {
    expect(tierHasFeature("STARTER", "")).toBe(false);
    expect(tierHasFeature("ENTERPRISE", "")).toBe(false);
  });
});

describe("packaging tiers — purity & immutability assumptions", () => {
  it("TIERS array shape: 4 entries, each conforms to TierSpec at runtime", () => {
    for (const t of TIERS) {
      const keys: (keyof TierSpec)[] = [
        "key", "label", "tagline",
        "priceInrPerMonth", "priceUsdPerMonth",
        "seatsIncluded", "entitiesIncluded",
        "features", "highlights",
      ];
      for (const k of keys) {
        expect(t).toHaveProperty(k);
      }
    }
  });

  it("highlight arrays do not include empty strings", () => {
    for (const t of TIERS) {
      for (const h of t.highlights) {
        expect(typeof h).toBe("string");
        expect(h.length).toBeGreaterThan(0);
      }
    }
  });

  it("feature keys never contain whitespace", () => {
    for (const t of TIERS) {
      for (const f of t.features) {
        expect(f).not.toMatch(/\s/);
      }
    }
  });

  it("seatsIncluded + entitiesIncluded are non-negative integers", () => {
    for (const t of TIERS) {
      expect(Number.isInteger(t.seatsIncluded)).toBe(true);
      expect(Number.isInteger(t.entitiesIncluded)).toBe(true);
      expect(t.seatsIncluded).toBeGreaterThanOrEqual(0);
      expect(t.entitiesIncluded).toBeGreaterThanOrEqual(0);
    }
  });

  it("priceInrPerMonth + priceUsdPerMonth are non-negative numbers", () => {
    for (const t of TIERS) {
      expect(typeof t.priceInrPerMonth).toBe("number");
      expect(typeof t.priceUsdPerMonth).toBe("number");
      expect(t.priceInrPerMonth).toBeGreaterThanOrEqual(0);
      expect(t.priceUsdPerMonth).toBeGreaterThanOrEqual(0);
    }
  });
});
