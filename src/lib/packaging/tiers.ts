/*
 * Packaging tiers — Starter / Growth / Enterprise / Full Finance OS.
 * Each tier gates a set of feature keys. The Settings UI reads this
 * to greys-out unavailable features. Pricing model is illustrative
 * (rupees and USD shown side-by-side).
 */

export type Tier = "STARTER" | "GROWTH" | "ENTERPRISE" | "FULL_OS";

export type TierSpec = {
  key:        Tier;
  label:      string;
  tagline:    string;
  priceInrPerMonth: number;
  priceUsdPerMonth: number;
  seatsIncluded: number;
  entitiesIncluded: number;
  features:   string[];        // feature flags this tier turns on
  highlights: string[];        // marketing-style bullets for the picker
};

export const TIERS: TierSpec[] = [
  {
    key: "STARTER",
    label: "Starter",
    tagline: "Financial reporting & analysis",
    priceInrPerMonth: 24_999,
    priceUsdPerMonth: 299,
    seatsIncluded: 3,
    entitiesIncluded: 1,
    features: [
      "reporting_basic",
      "dashboard_executive",
      "data_input",
      "data_forms",
      "audit_trail",
      "lineage_drawer",
    ],
    highlights: [
      "P&L, Balance Sheet, Cash Flow",
      "Executive dashboard with KPIs",
      "Excel/CSV import",
      "Audit trail + lineage drill",
      "Up to 3 users · 1 entity",
    ],
  },
  {
    key: "GROWTH",
    label: "Growth",
    tagline: "Reporting + forecasting + workforce",
    priceInrPerMonth: 49_999,
    priceUsdPerMonth: 599,
    seatsIncluded: 10,
    entitiesIncluded: 5,
    features: [
      "reporting_basic","dashboard_executive","data_input","data_forms",
      "audit_trail","lineage_drawer",
      "forecasting_v2","workforce_planning","budgeting_basic",
      "ai_copilot_read","close_management",
    ],
    highlights: [
      "Everything in Starter",
      "AI-driven forecasting (JS ensemble)",
      "Workforce planning + attrition modelling",
      "Monthly close checklist + deep-linking",
      "Read-only AI Copilot",
      "Up to 10 users · 5 entities",
    ],
  },
  {
    key: "ENTERPRISE",
    label: "Enterprise",
    tagline: "+ consolidation, allocations, multi-entity",
    priceInrPerMonth: 1_24_999,
    priceUsdPerMonth: 1499,
    seatsIncluded: 25,
    entitiesIncluded: 25,
    features: [
      "reporting_basic","dashboard_executive","data_input","data_forms",
      "audit_trail","lineage_drawer",
      "forecasting_v2","workforce_planning","budgeting_basic",
      "ai_copilot_read","ai_copilot_write","close_management",
      "consolidation","translation","intercompany_elimination",
      "allocations_dsl","scenarios_planning","project_planning",
      "smart_mapping","tally_integration","modal_forecast_python",
    ],
    highlights: [
      "Everything in Growth",
      "Consolidation + IC eliminations + FX translation",
      "AI Copilot WRITE actions (with approval flow)",
      "AI-generated allocation rules from plain English",
      "ARIMA/Prophet via Modal Python service",
      "Tally integration + Smart mapping engine",
      "Up to 25 users · 25 entities",
    ],
  },
  {
    key: "FULL_OS",
    label: "Full Finance OS",
    tagline: "Everything + custom SLAs",
    priceInrPerMonth: 0,        // contact sales
    priceUsdPerMonth: 0,
    seatsIncluded: 0,           // unlimited
    entitiesIncluded: 0,
    features: ["*"],
    highlights: [
      "Everything in Enterprise",
      "Custom dimensions + calc rules",
      "Dedicated success engineer",
      "SOC2 / DPDP compliance package",
      "SLA-backed uptime + 24×7 support",
      "Unlimited users + entities",
      "Contact sales for pricing",
    ],
  },
];

export function tierFor(key: Tier): TierSpec | undefined {
  return TIERS.find(t => t.key === key);
}
export function tierHasFeature(tier: Tier, feature: string): boolean {
  const t = tierFor(tier); if (!t) return false;
  return t.features.includes("*") || t.features.includes(feature);
}
