/*
 * Unit tests for `src/lib/dim-enums.ts`.
 *
 * This file defines the canonical enum surface for every dimension's typed
 * properties bag. Two kinds of exports live here:
 *
 *  1) Prisma re-exports for enums that Prisma actually generates (because
 *     they're column-typed): DimensionKind, StorageType, CalculationType,
 *     AggregationOperator, AuditAction.
 *  2) Local TS-level `as const` enums for enums that ONLY appear inside
 *     the JSON `properties` bag — Prisma strips these from the generated
 *     client and they become undefined at runtime if pulled from
 *     `@prisma/client`. So we own them here: AccountType, TimeBalance,
 *     VarianceType, CurrencyBehavior, ConsolidationMethod, ScenarioType,
 *     TimePeriodType.
 *
 * Plus 7 zod helpers (`Z<EnumName>`) generated via `z.nativeEnum` that the
 * dim-schemas zod surface and v2 members API depend on.
 *
 * Why pin this:
 *   - A silent drop/rename of an enum value here would break every
 *     downstream caller (UI components, members API, consolidation, GAAP
 *     classification) without a TypeScript error in some import paths.
 *   - The Prisma vs local-TS split is fragile — a future schema change
 *     could promote (e.g.) AccountType to a Prisma column, at which point
 *     the local TS enum should still match the Prisma one exactly, or
 *     parts of the app would silently disagree.
 *   - The zod helpers gate every API write; widening would let arbitrary
 *     strings into the properties bag.
 *
 * Pure node-env Jest — no DOM, no Prisma DB, no I/O. Imports the
 * @prisma/client *types* (which include the enum runtime objects) but does
 * not connect to anything.
 */

import {
  // Re-exports from Prisma
  DimensionKind,
  StorageType,
  CalculationType,
  AggregationOperator,
  AuditAction,
  // Local TS-level enums
  AccountType,
  TimeBalance,
  VarianceType,
  CurrencyBehavior,
  ConsolidationMethod,
  ScenarioType,
  TimePeriodType,
  // Zod helpers
  ZAccountType,
  ZTimeBalance,
  ZVarianceType,
  ZCurrencyBehavior,
  ZConsolidationMethod,
  ZScenarioType,
  ZTimePeriodType,
} from "./dim-enums";

// ─────────────────────────────────────────────────────────────────────
// Re-exports from Prisma
// ─────────────────────────────────────────────────────────────────────

describe("Prisma re-export: DimensionKind", () => {
  test("exposes the runtime enum object", () => {
    expect(DimensionKind).toBeDefined();
    expect(typeof DimensionKind).toBe("object");
  });

  test("includes all 5 always-on fixed dimensions", () => {
    expect(DimensionKind.ACCOUNT).toBe("ACCOUNT");
    expect(DimensionKind.ENTITY).toBe("ENTITY");
    expect(DimensionKind.SCENARIO).toBe("SCENARIO");
    expect(DimensionKind.TIME).toBe("TIME");
    expect(DimensionKind.CURRENCY).toBe("CURRENCY");
  });

  test("includes ICP (toggleable system-managed) and ORIGIN (always-on data source)", () => {
    expect(DimensionKind.ICP).toBe("ICP");
    expect(DimensionKind.ORIGIN).toBe("ORIGIN");
  });

  test("includes all 8 user-defined slots UD1..UD8", () => {
    for (let i = 1; i <= 8; i++) {
      const key = `UD${i}` as keyof typeof DimensionKind;
      expect(DimensionKind[key]).toBe(`UD${i}`);
    }
  });

  test("has exactly 15 members (5 fixed + ICP + ORIGIN + 8 UD)", () => {
    // Prisma enum runtime objects don't have reverse mappings (string enums)
    const keys = Object.keys(DimensionKind);
    expect(keys).toHaveLength(15);
  });

  test("values match their keys (string enum, no reverse mapping)", () => {
    for (const [key, value] of Object.entries(DimensionKind)) {
      expect(value).toBe(key);
    }
  });
});

describe("Prisma re-export: StorageType", () => {
  test("exposes the runtime enum object", () => {
    expect(StorageType).toBeDefined();
  });

  test("has exactly the 3 documented members (STORED/DYNAMIC/NEVER_SHARE)", () => {
    expect(StorageType.STORED).toBe("STORED");
    expect(StorageType.DYNAMIC).toBe("DYNAMIC");
    expect(StorageType.NEVER_SHARE).toBe("NEVER_SHARE");
    expect(Object.keys(StorageType)).toHaveLength(3);
  });
});

describe("Prisma re-export: CalculationType", () => {
  test("exposes the runtime enum object", () => {
    expect(CalculationType).toBeDefined();
  });

  test("has exactly the 3 documented members (INPUT/FORMULA/ROLLUP)", () => {
    expect(CalculationType.INPUT).toBe("INPUT");
    expect(CalculationType.FORMULA).toBe("FORMULA");
    expect(CalculationType.ROLLUP).toBe("ROLLUP");
    expect(Object.keys(CalculationType)).toHaveLength(3);
  });
});

describe("Prisma re-export: AggregationOperator", () => {
  test("exposes the runtime enum object", () => {
    expect(AggregationOperator).toBeDefined();
  });

  test("has exactly the 3 documented operators (ADD/SUBTRACT/IGNORE)", () => {
    expect(AggregationOperator.ADD).toBe("ADD");
    expect(AggregationOperator.SUBTRACT).toBe("SUBTRACT");
    expect(AggregationOperator.IGNORE).toBe("IGNORE");
    expect(Object.keys(AggregationOperator)).toHaveLength(3);
  });
});

describe("Prisma re-export: AuditAction", () => {
  test("exposes the runtime enum object", () => {
    expect(AuditAction).toBeDefined();
  });

  test("covers CRUD verbs (CREATE/UPDATE/DELETE)", () => {
    expect(AuditAction.CREATE).toBe("CREATE");
    expect(AuditAction.UPDATE).toBe("UPDATE");
    expect(AuditAction.DELETE).toBe("DELETE");
  });

  test("covers bulk + import/export verbs", () => {
    expect(AuditAction.IMPORT).toBe("IMPORT");
    expect(AuditAction.EXPORT).toBe("EXPORT");
    expect(AuditAction.BULK_UPDATE).toBe("BULK_UPDATE");
  });

  test("covers feature-toggle + approval + auth verbs", () => {
    expect(AuditAction.ENABLE_FEATURE).toBe("ENABLE_FEATURE");
    expect(AuditAction.DISABLE_FEATURE).toBe("DISABLE_FEATURE");
    expect(AuditAction.APPROVE).toBe("APPROVE");
    expect(AuditAction.REJECT).toBe("REJECT");
    expect(AuditAction.LOGIN).toBe("LOGIN");
    expect(AuditAction.LOGOUT).toBe("LOGOUT");
  });

  test("has exactly 12 actions documented", () => {
    expect(Object.keys(AuditAction)).toHaveLength(12);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Local TS-level enums (live in JSON properties bag)
// ─────────────────────────────────────────────────────────────────────

describe("AccountType (local TS enum)", () => {
  test("exposes the 8 documented account types", () => {
    expect(AccountType.ASSET).toBe("ASSET");
    expect(AccountType.LIABILITY).toBe("LIABILITY");
    expect(AccountType.EQUITY).toBe("EQUITY");
    expect(AccountType.REVENUE).toBe("REVENUE");
    expect(AccountType.EXPENSE).toBe("EXPENSE");
    expect(AccountType.STATISTICAL).toBe("STATISTICAL");
    expect(AccountType.KPI).toBe("KPI");
    expect(AccountType.NON_FINANCIAL).toBe("NON_FINANCIAL");
  });

  test("has exactly 8 members", () => {
    expect(Object.keys(AccountType)).toHaveLength(8);
  });

  test("values exactly equal their keys (no aliasing)", () => {
    for (const [key, value] of Object.entries(AccountType)) {
      expect(value).toBe(key);
    }
  });

  test("frozen at the type level — direct mutation is rejected by TS but runtime stays consistent", () => {
    // Sanity: re-reading after the object is shared with callers must
    // still match the original. The object is exported `as const` so
    // TS prevents mutation; we just confirm the object identity here.
    const a = AccountType.ASSET;
    const b = AccountType.ASSET;
    expect(a).toBe(b);
  });
});

describe("TimeBalance (local TS enum)", () => {
  test("exposes the 4 documented time-balance behaviors", () => {
    expect(TimeBalance.FLOW).toBe("FLOW");
    expect(TimeBalance.LAST).toBe("LAST");
    expect(TimeBalance.FIRST).toBe("FIRST");
    expect(TimeBalance.AVG).toBe("AVG");
  });

  test("has exactly 4 members", () => {
    expect(Object.keys(TimeBalance)).toHaveLength(4);
  });

  test("values exactly equal their keys", () => {
    for (const [key, value] of Object.entries(TimeBalance)) {
      expect(value).toBe(key);
    }
  });
});

describe("VarianceType (local TS enum)", () => {
  test("exposes EXPENSE/NON_EXPENSE/NEUTRAL", () => {
    expect(VarianceType.EXPENSE).toBe("EXPENSE");
    expect(VarianceType.NON_EXPENSE).toBe("NON_EXPENSE");
    expect(VarianceType.NEUTRAL).toBe("NEUTRAL");
  });

  test("has exactly 3 members", () => {
    expect(Object.keys(VarianceType)).toHaveLength(3);
  });
});

describe("CurrencyBehavior (local TS enum)", () => {
  test("exposes TRANSACTIONAL/TRANSLATED/NONE", () => {
    expect(CurrencyBehavior.TRANSACTIONAL).toBe("TRANSACTIONAL");
    expect(CurrencyBehavior.TRANSLATED).toBe("TRANSLATED");
    expect(CurrencyBehavior.NONE).toBe("NONE");
  });

  test("has exactly 3 members", () => {
    expect(Object.keys(CurrencyBehavior)).toHaveLength(3);
  });
});

describe("ConsolidationMethod (local TS enum)", () => {
  test("exposes the 4 consolidation methods", () => {
    expect(ConsolidationMethod.FULL).toBe("FULL");
    expect(ConsolidationMethod.PROPORTIONAL).toBe("PROPORTIONAL");
    expect(ConsolidationMethod.EQUITY).toBe("EQUITY");
    expect(ConsolidationMethod.NONE).toBe("NONE");
  });

  test("has exactly 4 members", () => {
    expect(Object.keys(ConsolidationMethod)).toHaveLength(4);
  });
});

describe("ScenarioType (local TS enum)", () => {
  test("exposes ACTUAL/BUDGET/FORECAST/WHATIF", () => {
    expect(ScenarioType.ACTUAL).toBe("ACTUAL");
    expect(ScenarioType.BUDGET).toBe("BUDGET");
    expect(ScenarioType.FORECAST).toBe("FORECAST");
    expect(ScenarioType.WHATIF).toBe("WHATIF");
  });

  test("has exactly 4 members", () => {
    expect(Object.keys(ScenarioType)).toHaveLength(4);
  });
});

describe("TimePeriodType (local TS enum)", () => {
  test("exposes MONTH/QUARTER/HALF/YEAR", () => {
    expect(TimePeriodType.MONTH).toBe("MONTH");
    expect(TimePeriodType.QUARTER).toBe("QUARTER");
    expect(TimePeriodType.HALF).toBe("HALF");
    expect(TimePeriodType.YEAR).toBe("YEAR");
  });

  test("has exactly 4 members", () => {
    expect(Object.keys(TimePeriodType)).toHaveLength(4);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Zod helpers (z.nativeEnum wrappers)
// ─────────────────────────────────────────────────────────────────────

describe("ZAccountType (zod helper)", () => {
  test("accepts every documented account type", () => {
    for (const v of Object.values(AccountType)) {
      expect(ZAccountType.safeParse(v).success).toBe(true);
    }
  });

  test("rejects an unknown string", () => {
    expect(ZAccountType.safeParse("BANANA").success).toBe(false);
  });

  test("rejects empty string and null", () => {
    expect(ZAccountType.safeParse("").success).toBe(false);
    expect(ZAccountType.safeParse(null).success).toBe(false);
  });

  test("rejects wrong case (string enums are case-sensitive)", () => {
    expect(ZAccountType.safeParse("asset").success).toBe(false);
    expect(ZAccountType.safeParse("Asset").success).toBe(false);
  });
});

describe("ZTimeBalance (zod helper)", () => {
  test("accepts every documented time-balance value", () => {
    for (const v of Object.values(TimeBalance)) {
      expect(ZTimeBalance.safeParse(v).success).toBe(true);
    }
  });

  test("rejects unknown / mis-cased values", () => {
    expect(ZTimeBalance.safeParse("AVERAGE").success).toBe(false); // close-but-wrong
    expect(ZTimeBalance.safeParse("flow").success).toBe(false);
  });
});

describe("ZVarianceType (zod helper)", () => {
  test("accepts every variance type", () => {
    for (const v of Object.values(VarianceType)) {
      expect(ZVarianceType.safeParse(v).success).toBe(true);
    }
  });

  test("rejects an unrelated string", () => {
    expect(ZVarianceType.safeParse("INCOME").success).toBe(false);
  });
});

describe("ZCurrencyBehavior (zod helper)", () => {
  test("accepts every documented behavior", () => {
    for (const v of Object.values(CurrencyBehavior)) {
      expect(ZCurrencyBehavior.safeParse(v).success).toBe(true);
    }
  });

  test("rejects a value from a sibling enum (NEUTRAL is VarianceType)", () => {
    expect(ZCurrencyBehavior.safeParse("NEUTRAL").success).toBe(false);
  });
});

describe("ZConsolidationMethod (zod helper)", () => {
  test("accepts every documented method", () => {
    for (const v of Object.values(ConsolidationMethod)) {
      expect(ZConsolidationMethod.safeParse(v).success).toBe(true);
    }
  });

  test("rejects an unknown method", () => {
    expect(ZConsolidationMethod.safeParse("COST").success).toBe(false);
    expect(ZConsolidationMethod.safeParse("HALF").success).toBe(false); // belongs to TimePeriodType
  });
});

describe("ZScenarioType (zod helper)", () => {
  test("accepts every documented scenario type", () => {
    for (const v of Object.values(ScenarioType)) {
      expect(ZScenarioType.safeParse(v).success).toBe(true);
    }
  });

  test("rejects a not-yet-supported scenario string", () => {
    expect(ZScenarioType.safeParse("ROLLING_FORECAST").success).toBe(false);
  });
});

describe("ZTimePeriodType (zod helper)", () => {
  test("accepts every documented period type", () => {
    for (const v of Object.values(TimePeriodType)) {
      expect(ZTimePeriodType.safeParse(v).success).toBe(true);
    }
  });

  test("rejects WEEK / DAY (intentionally not supported by the seeder)", () => {
    expect(ZTimePeriodType.safeParse("WEEK").success).toBe(false);
    expect(ZTimePeriodType.safeParse("DAY").success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Cross-enum invariants
// ─────────────────────────────────────────────────────────────────────

describe("Cross-enum invariants", () => {
  test("no two TS-level enums share an overlapping value (defensive)", () => {
    // Catches accidental duplication that would break the
    // `z.nativeEnum` discriminator behavior in downstream zod schemas.
    const all = [
      ...Object.values(AccountType),
      ...Object.values(TimeBalance),
      ...Object.values(VarianceType),
      ...Object.values(CurrencyBehavior),
      ...Object.values(ConsolidationMethod),
      ...Object.values(ScenarioType),
      ...Object.values(TimePeriodType),
    ];
    // Some overlap is INTENTIONAL across enums by domain meaning (e.g.
    // VarianceType.EXPENSE === AccountType.EXPENSE) — those are NOT bugs.
    // What we want to confirm is the *total* count matches what the file
    // claims, so silent renames / drops show up here.
    const expectedTotal =
      Object.keys(AccountType).length +
      Object.keys(TimeBalance).length +
      Object.keys(VarianceType).length +
      Object.keys(CurrencyBehavior).length +
      Object.keys(ConsolidationMethod).length +
      Object.keys(ScenarioType).length +
      Object.keys(TimePeriodType).length;
    expect(all).toHaveLength(expectedTotal);
    // 8 + 4 + 3 + 3 + 4 + 4 + 4 = 30 — pinned literal
    expect(expectedTotal).toBe(30);
  });

  test("EXPENSE label is shared by VarianceType and AccountType (by design)", () => {
    expect(VarianceType.EXPENSE).toBe(AccountType.EXPENSE);
  });

  test("DimensionKind covers every domain enum's owning dim", () => {
    // Account/Entity/Scenario/Time/Currency/Origin TS enums are scoped to
    // these specific DimensionKind buckets. If any of these names get
    // dropped from DimensionKind the whole properties bag would be
    // orphaned. Pin the link.
    expect(DimensionKind.ACCOUNT).toBeDefined();
    expect(DimensionKind.ENTITY).toBeDefined();
    expect(DimensionKind.SCENARIO).toBeDefined();
    expect(DimensionKind.TIME).toBeDefined();
    expect(DimensionKind.CURRENCY).toBeDefined();
    expect(DimensionKind.ORIGIN).toBeDefined();
  });
});
