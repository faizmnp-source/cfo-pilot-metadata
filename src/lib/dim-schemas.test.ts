/*
 * Unit tests for src/lib/dim-schemas.ts — the zod schemas that pin every
 * dimension's typed `properties` JSON bag at the API boundary.
 *
 * These schemas are imported by the v2 members API and gate every member
 * write. A regression here would silently widen or narrow what payloads the
 * API accepts — exactly the kind of silent regression unit tests are for.
 *
 * Covers:
 *   - Each per-dim properties schema (Account, Entity, Scenario, Time,
 *     Currency, ICP, Origin, UD) — required vs defaulted vs optional fields,
 *     enum membership, strict-mode rejection of unknown keys, format
 *     constraints (3-letter currency codes, YYYY-MM-DD dates, fiscal_year
 *     range, ownership_pct range).
 *   - MemberBaseSchema envelope — memberCode/memberName required, defaults.
 *   - CreateMemberInputByDim — every DimensionKind has a schema, every
 *     schema accepts a valid sample, properties get validated.
 *   - UpdateMemberInputByDim — partial-of-create (everything optional).
 *   - DIM_SLUG_TO_KIND + resolveDimKind — case-insensitive lookups, unknown
 *     slugs return null, every kind round-trips through a slug.
 *
 * No DB, no I/O. Pure schema validation. Pinned because the entire member
 * write path depends on these.
 */

import {
  AccountPropertiesSchema,
  EntityPropertiesSchema,
  ScenarioPropertiesSchema,
  TimePropertiesSchema,
  CurrencyPropertiesSchema,
  IcpPropertiesSchema,
  OriginPropertiesSchema,
  UdPropertiesSchema,
  MemberBaseSchema,
  CreateMemberInputByDim,
  UpdateMemberInputByDim,
  DIM_SLUG_TO_KIND,
  resolveDimKind,
} from "./dim-schemas";
import {
  AccountType,
  TimeBalance,
  VarianceType,
  CurrencyBehavior,
  ConsolidationMethod,
  ScenarioType,
  TimePeriodType,
  StorageType,
  CalculationType,
  DimensionKind,
} from "./dim-enums";

// ---------------------------------------------------------------------------
// AccountPropertiesSchema
// ---------------------------------------------------------------------------

describe("AccountPropertiesSchema", () => {
  it("accepts a minimal valid payload (account_type + time_balance) and fills defaults", () => {
    const parsed = AccountPropertiesSchema.parse({
      account_type: AccountType.REVENUE,
      time_balance: TimeBalance.FLOW,
    });
    expect(parsed.account_type).toBe("REVENUE");
    expect(parsed.time_balance).toBe("FLOW");
    expect(parsed.switch_sign).toBe(false);
    expect(parsed.storage_type).toBe(StorageType.STORED);
    expect(parsed.calculation_type).toBe(CalculationType.INPUT);
    expect(parsed.variance_type).toBe(VarianceType.NEUTRAL);
    expect(parsed.currency_behavior).toBe(CurrencyBehavior.TRANSACTIONAL);
    expect(parsed.allow_input).toBe(true);
    expect(parsed.is_consolidated).toBe(true);
    expect(parsed.is_icp).toBe(false);
  });

  it("rejects when account_type is missing", () => {
    const r = AccountPropertiesSchema.safeParse({ time_balance: TimeBalance.FLOW });
    expect(r.success).toBe(false);
  });

  it("rejects when time_balance is missing", () => {
    const r = AccountPropertiesSchema.safeParse({ account_type: AccountType.ASSET });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid AccountType value", () => {
    const r = AccountPropertiesSchema.safeParse({
      account_type: "INVALID",
      time_balance: TimeBalance.FLOW,
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown keys (strict mode)", () => {
    const r = AccountPropertiesSchema.safeParse({
      account_type: AccountType.ASSET,
      time_balance: TimeBalance.LAST,
      mystery_field: true,
    });
    expect(r.success).toBe(false);
  });

  it("accepts every AccountType enum value", () => {
    for (const t of Object.values(AccountType)) {
      const r = AccountPropertiesSchema.safeParse({
        account_type: t,
        time_balance: TimeBalance.FLOW,
      });
      expect(r.success).toBe(true);
    }
  });

  it("accepts every TimeBalance enum value", () => {
    for (const tb of Object.values(TimeBalance)) {
      const r = AccountPropertiesSchema.safeParse({
        account_type: AccountType.ASSET,
        time_balance: tb,
      });
      expect(r.success).toBe(true);
    }
  });

  it("preserves explicit overrides for boolean and enum defaults", () => {
    const parsed = AccountPropertiesSchema.parse({
      account_type: AccountType.EXPENSE,
      time_balance: TimeBalance.FLOW,
      switch_sign: true,
      allow_input: false,
      is_consolidated: false,
      is_icp: true,
      variance_type: VarianceType.EXPENSE,
      storage_type: StorageType.DYNAMIC,
      calculation_type: CalculationType.FORMULA,
      currency_behavior: CurrencyBehavior.TRANSLATED,
    });
    expect(parsed.switch_sign).toBe(true);
    expect(parsed.allow_input).toBe(false);
    expect(parsed.is_consolidated).toBe(false);
    expect(parsed.is_icp).toBe(true);
    expect(parsed.variance_type).toBe("EXPENSE");
    expect(parsed.storage_type).toBe(StorageType.DYNAMIC);
    expect(parsed.calculation_type).toBe(CalculationType.FORMULA);
    expect(parsed.currency_behavior).toBe("TRANSLATED");
  });

  it("accepts a nullable formula (string, null, or omitted)", () => {
    expect(
      AccountPropertiesSchema.safeParse({
        account_type: AccountType.KPI,
        time_balance: TimeBalance.FLOW,
        formula: "revenue / opex",
      }).success,
    ).toBe(true);
    expect(
      AccountPropertiesSchema.safeParse({
        account_type: AccountType.KPI,
        time_balance: TimeBalance.FLOW,
        formula: null,
      }).success,
    ).toBe(true);
    expect(
      AccountPropertiesSchema.safeParse({
        account_type: AccountType.KPI,
        time_balance: TimeBalance.FLOW,
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// EntityPropertiesSchema
// ---------------------------------------------------------------------------

describe("EntityPropertiesSchema", () => {
  it("accepts a minimal payload with just base_currency", () => {
    const parsed = EntityPropertiesSchema.parse({ base_currency: "USD" });
    expect(parsed.base_currency).toBe("USD");
    expect(parsed.consolidation_method).toBe(ConsolidationMethod.FULL);
    expect(parsed.ownership_pct).toBe(100);
    expect(parsed.icp_enabled).toBe(false);
  });

  it("rejects when base_currency is missing", () => {
    const r = EntityPropertiesSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("rejects a base_currency that is not exactly 3 chars (length-only invariant)", () => {
    expect(EntityPropertiesSchema.safeParse({ base_currency: "US" }).success).toBe(false);
    expect(EntityPropertiesSchema.safeParse({ base_currency: "USDD" }).success).toBe(false);
    expect(EntityPropertiesSchema.safeParse({ base_currency: "" }).success).toBe(false);
  });

  it("accepts ownership_pct at boundary 0 and 100", () => {
    expect(
      EntityPropertiesSchema.safeParse({ base_currency: "USD", ownership_pct: 0 }).success,
    ).toBe(true);
    expect(
      EntityPropertiesSchema.safeParse({ base_currency: "USD", ownership_pct: 100 }).success,
    ).toBe(true);
  });

  it("rejects ownership_pct outside [0,100]", () => {
    expect(
      EntityPropertiesSchema.safeParse({ base_currency: "USD", ownership_pct: -1 }).success,
    ).toBe(false);
    expect(
      EntityPropertiesSchema.safeParse({ base_currency: "USD", ownership_pct: 100.01 }).success,
    ).toBe(false);
  });

  it("accepts every ConsolidationMethod", () => {
    for (const m of Object.values(ConsolidationMethod)) {
      const r = EntityPropertiesSchema.safeParse({
        base_currency: "USD",
        consolidation_method: m,
      });
      expect(r.success).toBe(true);
    }
  });

  it("rejects unknown keys (strict mode)", () => {
    const r = EntityPropertiesSchema.safeParse({
      base_currency: "EUR",
      legal_form: "Ltd",
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ScenarioPropertiesSchema
// ---------------------------------------------------------------------------

describe("ScenarioPropertiesSchema", () => {
  it("accepts minimal payload with scenario_type and fills defaults", () => {
    const p = ScenarioPropertiesSchema.parse({ scenario_type: ScenarioType.ACTUAL });
    expect(p.scenario_type).toBe("ACTUAL");
    expect(p.is_frozen).toBe(false);
    expect(p.version).toBe("v1");
  });

  it("rejects when scenario_type is missing", () => {
    expect(ScenarioPropertiesSchema.safeParse({}).success).toBe(false);
  });

  it("accepts every ScenarioType", () => {
    for (const t of Object.values(ScenarioType)) {
      const r = ScenarioPropertiesSchema.safeParse({ scenario_type: t });
      expect(r.success).toBe(true);
    }
  });

  it("rejects unknown keys (strict mode)", () => {
    const r = ScenarioPropertiesSchema.safeParse({
      scenario_type: ScenarioType.BUDGET,
      stretch_target: true,
    });
    expect(r.success).toBe(false);
  });

  it("accepts optional start_period and end_period", () => {
    const p = ScenarioPropertiesSchema.parse({
      scenario_type: ScenarioType.FORECAST,
      start_period: "2026M01",
      end_period: "2026M12",
    });
    expect(p.start_period).toBe("2026M01");
    expect(p.end_period).toBe("2026M12");
  });
});

// ---------------------------------------------------------------------------
// TimePropertiesSchema
// ---------------------------------------------------------------------------

describe("TimePropertiesSchema", () => {
  const valid = {
    period_type: TimePeriodType.MONTH,
    fiscal_year: 2026,
    start_date: "2026-01-01",
    end_date: "2026-01-31",
    month_index: 0,
  };

  it("accepts a fully-formed month payload", () => {
    expect(TimePropertiesSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects when period_type, fiscal_year, start_date or end_date is missing", () => {
    for (const drop of [
      "period_type",
      "fiscal_year",
      "start_date",
      "end_date",
    ] as const) {
      const bad = { ...valid } as Record<string, unknown>;
      delete bad[drop];
      expect(TimePropertiesSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("rejects fiscal_year outside [2000, 2099]", () => {
    expect(
      TimePropertiesSchema.safeParse({ ...valid, fiscal_year: 1999 }).success,
    ).toBe(false);
    expect(
      TimePropertiesSchema.safeParse({ ...valid, fiscal_year: 2100 }).success,
    ).toBe(false);
  });

  it("accepts fiscal_year at boundaries 2000 and 2099", () => {
    expect(
      TimePropertiesSchema.safeParse({ ...valid, fiscal_year: 2000 }).success,
    ).toBe(true);
    expect(
      TimePropertiesSchema.safeParse({ ...valid, fiscal_year: 2099 }).success,
    ).toBe(true);
  });

  it("requires fiscal_year to be an integer", () => {
    expect(
      TimePropertiesSchema.safeParse({ ...valid, fiscal_year: 2026.5 }).success,
    ).toBe(false);
  });

  it("enforces YYYY-MM-DD on start_date and end_date", () => {
    expect(
      TimePropertiesSchema.safeParse({ ...valid, start_date: "2026/01/01" }).success,
    ).toBe(false);
    expect(
      TimePropertiesSchema.safeParse({ ...valid, end_date: "31-01-2026" }).success,
    ).toBe(false);
    expect(
      TimePropertiesSchema.safeParse({ ...valid, start_date: "2026-1-1" }).success,
    ).toBe(false);
  });

  it("accepts every TimePeriodType", () => {
    for (const pt of Object.values(TimePeriodType)) {
      expect(
        TimePropertiesSchema.safeParse({ ...valid, period_type: pt }).success,
      ).toBe(true);
    }
  });

  it("constrains month_index to [0,11] and quarter_index to [1,4]", () => {
    expect(
      TimePropertiesSchema.safeParse({ ...valid, month_index: -1 }).success,
    ).toBe(false);
    expect(
      TimePropertiesSchema.safeParse({ ...valid, month_index: 12 }).success,
    ).toBe(false);
    expect(
      TimePropertiesSchema.safeParse({ ...valid, month_index: 11 }).success,
    ).toBe(true);
    expect(
      TimePropertiesSchema.safeParse({
        ...valid,
        period_type: TimePeriodType.QUARTER,
        quarter_index: 0,
      }).success,
    ).toBe(false);
    expect(
      TimePropertiesSchema.safeParse({
        ...valid,
        period_type: TimePeriodType.QUARTER,
        quarter_index: 5,
      }).success,
    ).toBe(false);
    expect(
      TimePropertiesSchema.safeParse({
        ...valid,
        period_type: TimePeriodType.QUARTER,
        quarter_index: 4,
      }).success,
    ).toBe(true);
  });

  it("rejects unknown keys (strict mode)", () => {
    const r = TimePropertiesSchema.safeParse({ ...valid, calendar: "gregorian" });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CurrencyPropertiesSchema
// ---------------------------------------------------------------------------

describe("CurrencyPropertiesSchema", () => {
  it("accepts a minimal payload with iso_code", () => {
    const p = CurrencyPropertiesSchema.parse({ iso_code: "USD" });
    expect(p.iso_code).toBe("USD");
    expect(p.is_base).toBe(false);
  });

  it("rejects when iso_code is missing", () => {
    expect(CurrencyPropertiesSchema.safeParse({}).success).toBe(false);
  });

  it("rejects iso_code not exactly 3 chars", () => {
    expect(CurrencyPropertiesSchema.safeParse({ iso_code: "US" }).success).toBe(false);
    expect(CurrencyPropertiesSchema.safeParse({ iso_code: "USDD" }).success).toBe(false);
  });

  it("rejects unknown keys (strict mode)", () => {
    const r = CurrencyPropertiesSchema.safeParse({ iso_code: "USD", country: "US" });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// IcpPropertiesSchema
// ---------------------------------------------------------------------------

describe("IcpPropertiesSchema", () => {
  it("accepts the system [None] shape ({ is_system: true })", () => {
    expect(IcpPropertiesSchema.safeParse({ is_system: true }).success).toBe(true);
  });

  it("accepts the auto-derived shape with a uuid entity_id", () => {
    const r = IcpPropertiesSchema.safeParse({
      entity_id: "11111111-2222-3333-4444-555555555555",
      source_entity: "US_HQ",
      auto_derived: true,
    });
    expect(r.success).toBe(true);
  });

  it("accepts the legacy manual shape (just entity_id uuid)", () => {
    expect(
      IcpPropertiesSchema.safeParse({
        entity_id: "11111111-2222-3333-4444-555555555555",
      }).success,
    ).toBe(true);
  });

  it("accepts an empty object (all fields optional)", () => {
    expect(IcpPropertiesSchema.safeParse({}).success).toBe(true);
  });

  it("rejects a non-uuid entity_id", () => {
    expect(IcpPropertiesSchema.safeParse({ entity_id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects unknown keys (strict mode)", () => {
    const r = IcpPropertiesSchema.safeParse({ is_system: true, partner_code: "X" });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OriginPropertiesSchema
// ---------------------------------------------------------------------------

describe("OriginPropertiesSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    expect(OriginPropertiesSchema.safeParse({}).success).toBe(true);
  });

  it("accepts every documented origin_type value", () => {
    const types = [
      "IMPORT",
      "FORM",
      "AI",
      "CALC",
      "ELIM",
      "CONSOL",
      "TRANSLATION",
      "ALLOC",
      "JOURNAL",
    ] as const;
    for (const t of types) {
      const r = OriginPropertiesSchema.safeParse({ origin_type: t });
      expect(r.success).toBe(true);
    }
  });

  it("rejects an unknown origin_type", () => {
    const r = OriginPropertiesSchema.safeParse({ origin_type: "MIGRATION" });
    expect(r.success).toBe(false);
  });

  it("accepts is_system and description side fields", () => {
    expect(
      OriginPropertiesSchema.safeParse({
        origin_type: "IMPORT",
        is_system: true,
        description: "Bootstrap row",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown keys (strict mode)", () => {
    const r = OriginPropertiesSchema.safeParse({ origin_type: "IMPORT", lineage: "src" });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UdPropertiesSchema
// ---------------------------------------------------------------------------

describe("UdPropertiesSchema", () => {
  it("accepts an empty object", () => {
    expect(UdPropertiesSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a mix of string/number/boolean/null values", () => {
    const r = UdPropertiesSchema.safeParse({
      department: "Engineering",
      cost_center: 42,
      is_active: true,
      sunset_date: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty-string keys", () => {
    const r = UdPropertiesSchema.safeParse({ "": "value" });
    expect(r.success).toBe(false);
  });

  it("rejects nested objects (only primitive leaves allowed)", () => {
    const r = UdPropertiesSchema.safeParse({ meta: { inner: "no" } });
    expect(r.success).toBe(false);
  });

  it("rejects array values", () => {
    const r = UdPropertiesSchema.safeParse({ tags: ["a", "b"] });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MemberBaseSchema
// ---------------------------------------------------------------------------

describe("MemberBaseSchema", () => {
  it("accepts the minimal envelope and fills isActive/sortOrder defaults", () => {
    const parsed = MemberBaseSchema.parse({
      memberCode: "REV_001",
      memberName: "Subscription Revenue",
    });
    expect(parsed.memberCode).toBe("REV_001");
    expect(parsed.memberName).toBe("Subscription Revenue");
    expect(parsed.isActive).toBe(true);
    expect(parsed.sortOrder).toBe(0);
  });

  it("rejects missing memberCode or empty memberCode", () => {
    expect(
      MemberBaseSchema.safeParse({ memberName: "x" }).success,
    ).toBe(false);
    expect(
      MemberBaseSchema.safeParse({ memberCode: "", memberName: "x" }).success,
    ).toBe(false);
  });

  it("rejects missing memberName or empty memberName", () => {
    expect(
      MemberBaseSchema.safeParse({ memberCode: "x" }).success,
    ).toBe(false);
    expect(
      MemberBaseSchema.safeParse({ memberCode: "x", memberName: "" }).success,
    ).toBe(false);
  });

  it("enforces memberCode max length 64", () => {
    const long = "A".repeat(65);
    expect(
      MemberBaseSchema.safeParse({ memberCode: long, memberName: "x" }).success,
    ).toBe(false);
    expect(
      MemberBaseSchema.safeParse({ memberCode: "A".repeat(64), memberName: "x" }).success,
    ).toBe(true);
  });

  it("enforces memberName max length 256", () => {
    expect(
      MemberBaseSchema.safeParse({
        memberCode: "x",
        memberName: "n".repeat(257),
      }).success,
    ).toBe(false);
    expect(
      MemberBaseSchema.safeParse({
        memberCode: "x",
        memberName: "n".repeat(256),
      }).success,
    ).toBe(true);
  });

  it("requires sortOrder to be an integer", () => {
    expect(
      MemberBaseSchema.safeParse({
        memberCode: "x",
        memberName: "y",
        sortOrder: 1.5,
      }).success,
    ).toBe(false);
  });

  it("accepts nullable description, storageType, calculationType, formula", () => {
    expect(
      MemberBaseSchema.safeParse({
        memberCode: "x",
        memberName: "y",
        description: null,
        storageType: null,
        calculationType: null,
        formula: null,
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CreateMemberInputByDim
// ---------------------------------------------------------------------------

describe("CreateMemberInputByDim", () => {
  it("has an entry for every DimensionKind", () => {
    const kinds: DimensionKind[] = [
      "ACCOUNT" as DimensionKind,
      "ENTITY" as DimensionKind,
      "SCENARIO" as DimensionKind,
      "TIME" as DimensionKind,
      "CURRENCY" as DimensionKind,
      "ICP" as DimensionKind,
      "ORIGIN" as DimensionKind,
      "UD1" as DimensionKind,
      "UD2" as DimensionKind,
      "UD3" as DimensionKind,
      "UD4" as DimensionKind,
      "UD5" as DimensionKind,
      "UD6" as DimensionKind,
      "UD7" as DimensionKind,
      "UD8" as DimensionKind,
    ];
    for (const k of kinds) {
      expect(CreateMemberInputByDim[k]).toBeDefined();
    }
  });

  it("validates a valid ACCOUNT create payload end-to-end", () => {
    const r = CreateMemberInputByDim.ACCOUNT.safeParse({
      memberCode: "4000",
      memberName: "Subscription Revenue",
      properties: {
        account_type: AccountType.REVENUE,
        time_balance: TimeBalance.FLOW,
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects an ACCOUNT create payload missing properties", () => {
    const r = CreateMemberInputByDim.ACCOUNT.safeParse({
      memberCode: "4000",
      memberName: "Subscription Revenue",
    });
    expect(r.success).toBe(false);
  });

  it("validates a valid ENTITY create payload end-to-end", () => {
    const r = CreateMemberInputByDim.ENTITY.safeParse({
      memberCode: "US_HQ",
      memberName: "US Headquarters",
      properties: { base_currency: "USD" },
    });
    expect(r.success).toBe(true);
  });

  it("validates a valid TIME create payload end-to-end", () => {
    const r = CreateMemberInputByDim.TIME.safeParse({
      memberCode: "FY2026M01",
      memberName: "January 2026",
      properties: {
        period_type: TimePeriodType.MONTH,
        fiscal_year: 2026,
        start_date: "2026-01-01",
        end_date: "2026-01-31",
        month_index: 0,
      },
    });
    expect(r.success).toBe(true);
  });

  it("accepts a UD member with empty properties (default applied)", () => {
    const r = CreateMemberInputByDim.UD3.safeParse({
      memberCode: "POS_001",
      memberName: "Engineer L4",
    });
    expect(r.success).toBe(true);
  });

  it("accepts an ORIGIN member with empty properties (default applied)", () => {
    const r = CreateMemberInputByDim.ORIGIN.safeParse({
      memberCode: "Import",
      memberName: "Import",
    });
    expect(r.success).toBe(true);
  });

  it("propagates the dim's strict-mode rejection (unknown property keys)", () => {
    const r = CreateMemberInputByDim.ENTITY.safeParse({
      memberCode: "DE_GMBH",
      memberName: "Germany GmbH",
      properties: { base_currency: "EUR", legal_form: "GmbH" },
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UpdateMemberInputByDim
// ---------------------------------------------------------------------------

describe("UpdateMemberInputByDim", () => {
  it("accepts an empty object (all fields optional after .partial())", () => {
    expect(UpdateMemberInputByDim.ACCOUNT.safeParse({}).success).toBe(true);
    expect(UpdateMemberInputByDim.ENTITY.safeParse({}).success).toBe(true);
    expect(UpdateMemberInputByDim.TIME.safeParse({}).success).toBe(true);
    expect(UpdateMemberInputByDim.UD1.safeParse({}).success).toBe(true);
  });

  it("accepts a partial ACCOUNT update with only memberName", () => {
    const r = UpdateMemberInputByDim.ACCOUNT.safeParse({ memberName: "Renamed" });
    expect(r.success).toBe(true);
  });

  it("has an entry for every DimensionKind (mirror of create)", () => {
    for (const k of Object.keys(CreateMemberInputByDim)) {
      expect(UpdateMemberInputByDim[k as DimensionKind]).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// DIM_SLUG_TO_KIND + resolveDimKind
// ---------------------------------------------------------------------------

describe("DIM_SLUG_TO_KIND + resolveDimKind", () => {
  it("maps every fixed-dim lowercase slug to its uppercase kind", () => {
    expect(DIM_SLUG_TO_KIND.account).toBe("ACCOUNT");
    expect(DIM_SLUG_TO_KIND.entity).toBe("ENTITY");
    expect(DIM_SLUG_TO_KIND.scenario).toBe("SCENARIO");
    expect(DIM_SLUG_TO_KIND.time).toBe("TIME");
    expect(DIM_SLUG_TO_KIND.currency).toBe("CURRENCY");
    expect(DIM_SLUG_TO_KIND.icp).toBe("ICP");
    expect(DIM_SLUG_TO_KIND.origin).toBe("ORIGIN");
  });

  it("maps all 8 UD slugs ud1..ud8", () => {
    for (let i = 1; i <= 8; i++) {
      const slug = `ud${i}`;
      expect(DIM_SLUG_TO_KIND[slug]).toBe(`UD${i}`);
    }
  });

  it("has exactly 15 fixed-dim entries (7 fixed + 8 UDs)", () => {
    expect(Object.keys(DIM_SLUG_TO_KIND).length).toBe(15);
  });

  it("resolveDimKind is case-insensitive", () => {
    expect(resolveDimKind("ACCOUNT")).toBe("ACCOUNT");
    expect(resolveDimKind("Account")).toBe("ACCOUNT");
    expect(resolveDimKind("account")).toBe("ACCOUNT");
    expect(resolveDimKind("UD3")).toBe("UD3");
    expect(resolveDimKind("Ud3")).toBe("UD3");
  });

  it("resolveDimKind returns null for unknown slugs", () => {
    expect(resolveDimKind("unknown")).toBeNull();
    expect(resolveDimKind("ud9")).toBeNull(); // only ud1..ud8 exist
    expect(resolveDimKind("")).toBeNull();
    expect(resolveDimKind("a count")).toBeNull();
  });

  it("every kind round-trips through a slug (kind → slug→kind)", () => {
    const kinds: DimensionKind[] = [
      "ACCOUNT" as DimensionKind,
      "ENTITY" as DimensionKind,
      "SCENARIO" as DimensionKind,
      "TIME" as DimensionKind,
      "CURRENCY" as DimensionKind,
      "ICP" as DimensionKind,
      "ORIGIN" as DimensionKind,
      "UD1" as DimensionKind,
      "UD8" as DimensionKind,
    ];
    for (const k of kinds) {
      const slug = (k as string).toLowerCase();
      expect(resolveDimKind(slug)).toBe(k);
    }
  });
});
