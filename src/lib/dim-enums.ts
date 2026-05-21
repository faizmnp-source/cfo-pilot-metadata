// Dimension property enums.
//
// IMPORTANT: Prisma's generated client only includes enums that appear in
// model columns. Enums we use *only* inside the JSON `properties` bag
// (e.g. AccountType, TimeBalance, VarianceType) get stripped and become
// undefined at runtime. So we define those here as TS-level enums.
//
// Enums Prisma actually generates (because they're column-typed) are
// re-exported below for ergonomics.

import { z } from "zod";

// ─── Re-exports from Prisma (column-typed, safe to use from @prisma/client) ─

export {
  DimensionKind,
  StorageType,
  CalculationType,
  AggregationOperator,
  AuditAction,
} from "@prisma/client";

// ─── Local TS-level enums (Prisma strips these — they live in JSON bags) ───

export const AccountType = {
  ASSET:          "ASSET",
  LIABILITY:      "LIABILITY",
  EQUITY:         "EQUITY",
  REVENUE:        "REVENUE",
  EXPENSE:        "EXPENSE",
  STATISTICAL:    "STATISTICAL",
  KPI:            "KPI",
  NON_FINANCIAL:  "NON_FINANCIAL",
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const TimeBalance = {
  FLOW:  "FLOW",
  LAST:  "LAST",
  FIRST: "FIRST",
  AVG:   "AVG",
} as const;
export type TimeBalance = (typeof TimeBalance)[keyof typeof TimeBalance];

export const VarianceType = {
  EXPENSE:     "EXPENSE",
  NON_EXPENSE: "NON_EXPENSE",
  NEUTRAL:     "NEUTRAL",
} as const;
export type VarianceType = (typeof VarianceType)[keyof typeof VarianceType];

export const CurrencyBehavior = {
  TRANSACTIONAL: "TRANSACTIONAL",
  TRANSLATED:    "TRANSLATED",
  NONE:          "NONE",
} as const;
export type CurrencyBehavior = (typeof CurrencyBehavior)[keyof typeof CurrencyBehavior];

export const ConsolidationMethod = {
  FULL:         "FULL",
  PROPORTIONAL: "PROPORTIONAL",
  EQUITY:       "EQUITY",
  NONE:         "NONE",
} as const;
export type ConsolidationMethod = (typeof ConsolidationMethod)[keyof typeof ConsolidationMethod];

export const ScenarioType = {
  ACTUAL:   "ACTUAL",
  BUDGET:   "BUDGET",
  FORECAST: "FORECAST",
  WHATIF:   "WHATIF",
} as const;
export type ScenarioType = (typeof ScenarioType)[keyof typeof ScenarioType];

export const TimePeriodType = {
  MONTH:    "MONTH",
  QUARTER:  "QUARTER",
  HALF:     "HALF",
  YEAR:     "YEAR",
} as const;
export type TimePeriodType = (typeof TimePeriodType)[keyof typeof TimePeriodType];

// ─── Zod helpers ──────────────────────────────────────────────────

export const ZAccountType         = z.nativeEnum(AccountType);
export const ZTimeBalance         = z.nativeEnum(TimeBalance);
export const ZVarianceType        = z.nativeEnum(VarianceType);
export const ZCurrencyBehavior    = z.nativeEnum(CurrencyBehavior);
export const ZConsolidationMethod = z.nativeEnum(ConsolidationMethod);
export const ZScenarioType        = z.nativeEnum(ScenarioType);
export const ZTimePeriodType      = z.nativeEnum(TimePeriodType);
