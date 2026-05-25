import { TIERS, tierFor, tierHasFeature } from "./tiers";

describe("packaging tiers", () => {
  it("ships 4 tiers", () => {
    expect(TIERS).toHaveLength(4);
    expect(TIERS.map(t => t.key)).toEqual(["STARTER","GROWTH","ENTERPRISE","FULL_OS"]);
  });

  it("STARTER does not include forecasting_v2", () => {
    expect(tierHasFeature("STARTER", "forecasting_v2")).toBe(false);
  });

  it("ENTERPRISE includes ai_copilot_write", () => {
    expect(tierHasFeature("ENTERPRISE", "ai_copilot_write")).toBe(true);
  });

  it("FULL_OS uses wildcard — has every feature", () => {
    expect(tierHasFeature("FULL_OS", "any_random_feature_key")).toBe(true);
  });

  it("INR pricing is set for tiers below FULL_OS", () => {
    for (const t of TIERS) {
      if (t.key === "FULL_OS") continue;
      expect(t.priceInrPerMonth).toBeGreaterThan(0);
      expect(t.priceUsdPerMonth).toBeGreaterThan(0);
    }
  });
});
