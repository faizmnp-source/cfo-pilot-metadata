// Zod schemas for the typed `properties` JSON on dimension_members.
// One schema per DimensionKind. The v2 members API validates against the
// matching schema before writing. This is what enforces "typed enums, never
// magic strings" at the API boundary.

import { z } from "zod";
// AccountType, TimeBalance, VarianceType, CurrencyBehavior, ConsolidationMethod,
// ScenarioType, TimePeriodType are TS-level enums (Prisma strips them because
// they're not on a column — see dim-enums.ts for the why).
// StorageType, CalculationType, AggregationOperator, DimensionKind ARE column-
// typed in the schema, so they're safe to use from @prisma/client (re-exported
// through dim-enums.ts for one consistent import path).
import {
  AccountType, TimeBalance, StorageType, AggregationOperator,
  CalculationType, VarianceType, CurrencyBehavior,
  ConsolidationMethod, ScenarioType, TimePeriodType,
  DimensionKind,
} from "./dim-enums";

// ─── Account ─────────────────────────────────────────────────────

export const AccountPropertiesSchema = z.object({
  account_type:       z.nativeEnum(AccountType),
  time_balance:       z.nativeEnum(TimeBalance),
  switch_sign:        z.boolean().default(false),
  storage_type:       z.nativeEnum(StorageType).default(StorageType.STORED),
  calculation_type:   z.nativeEnum(CalculationType).default(CalculationType.INPUT),
  variance_type:      z.nativeEnum(VarianceType).default(VarianceType.NEUTRAL),
  currency_behavior:  z.nativeEnum(CurrencyBehavior).default(CurrencyBehavior.TRANSACTIONAL),
  allow_input:        z.boolean().default(true),
  is_consolidated:    z.boolean().default(true),
  // is_icp: when true, fact-load validators reject rows where the ICP
  // dimension is [None]. Standard EPM practice for intercompany AR/AP,
  // intercompany revenue/expense, IC interest — every row must carry an
  // ICP partner. Per EPM-architect's Q5 review: non-negotiable for
  // elimination correctness.
  is_icp:             z.boolean().default(false),
  formula:            z.string().nullable().optional(),
}).strict();

// ─── Entity ──────────────────────────────────────────────────────

export const EntityPropertiesSchema = z.object({
  base_currency:        z.string().length(3, "ISO 4217 (3 letters)"),
  consolidation_method: z.nativeEnum(ConsolidationMethod).default(ConsolidationMethod.FULL),
  ownership_pct:        z.number().min(0).max(100).default(100),
  icp_enabled:          z.boolean().default(false),
  country:              z.string().optional(),
  tax_id:               z.string().optional(),
}).strict();

// ─── Scenario ────────────────────────────────────────────────────

export const ScenarioPropertiesSchema = z.object({
  scenario_type:  z.nativeEnum(ScenarioType),
  is_frozen:      z.boolean().default(false),
  version:        z.string().default("v1"),
  start_period:   z.string().optional(),  // e.g. '2026M01'
  end_period:     z.string().optional(),  // e.g. '2026M12'
}).strict();

// ─── Time ────────────────────────────────────────────────────────

export const TimePropertiesSchema = z.object({
  period_type:    z.nativeEnum(TimePeriodType),
  fiscal_year:    z.number().int().min(2000).max(2099),
  start_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  end_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  month_index:    z.number().int().min(0).max(11).optional(),
  quarter_index:  z.number().int().min(1).max(4).optional(),
}).strict();

// ─── Currency ────────────────────────────────────────────────────

export const CurrencyPropertiesSchema = z.object({
  iso_code:   z.string().length(3, "ISO 4217 (3 letters)"),
  is_base:    z.boolean().default(false),
}).strict();

// ─── ICP (Intercompany Partner) ──────────────────────────────────

// ICP is system-managed (see src/lib/sync-icp.ts). Three valid shapes:
//   1. { is_system: true }                              ← the [None] row
//   2. { entity_id, source_entity, auto_derived: true } ← auto-derived from Entity
//   3. { entity_id }                                    ← legacy manual rows
//
// All three are allowed at the schema level. Direct user writes to ICP are
// blocked at the route layer (system-managed dim — toggle Entity.icp_enabled
// instead). Schema stays permissive so the system writer's payload always
// passes validation.
export const IcpPropertiesSchema = z.object({
  entity_id:     z.string().uuid("Must reference an Entity member id").optional(),
  source_entity: z.string().optional(),
  auto_derived:  z.boolean().optional(),
  is_system:     z.boolean().optional(),
}).strict();

// ─── Origin (Data Source) ────────────────────────────────────────

// OneStream-style Origin dim. Every fact_row carries an originId so we can
// filter by source — Import, Form, AI, Calculation, Elimination, Consol,
// Translation, etc. We seed 'Import' on first access; admins extend as
// needed. Unlike ICP, this dim IS user-writable (admins can add custom
// origins for their tenant) — we just guarantee 'Import' always exists.
export const OriginPropertiesSchema = z.object({
  // 'origin_type' tags how facts of this origin should be treated by
  // downstream consumers (read-only-from-import vs editable-via-form vs
  // derived-by-calc). Optional today — V1 seed only sets it on Import.
  origin_type:  z.enum(["IMPORT", "FORM", "AI", "CALC", "ELIM", "CONSOL", "TRANSLATION", "ALLOC", "JOURNAL"]).optional(),
  is_system:    z.boolean().optional(),
  description:  z.string().optional(),
}).strict();

// ─── UD1..UD8 (user-defined) ─────────────────────────────────────

// Customer-defined slot — no fixed property schema. We accept any object
// with string-keyed values that pass minimal sanity checks.
export const UdPropertiesSchema = z.record(
  z.string().min(1),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

// ─── Common member envelope ──────────────────────────────────────

export const MemberBaseSchema = z.object({
  memberCode:       z.string().min(1).max(64),
  memberName:       z.string().min(1).max(256),
  description:      z.string().max(2048).optional().nullable(),
  isActive:         z.boolean().default(true),
  sortOrder:        z.number().int().default(0),
  storageType:      z.nativeEnum(StorageType).optional().nullable(),
  calculationType:  z.nativeEnum(CalculationType).optional().nullable(),
  formula:          z.string().optional().nullable(),
});

// ─── Per-dim full create/update payload ──────────────────────────

export const CreateMemberInputByDim: Record<DimensionKind, z.ZodTypeAny> = {
  ACCOUNT:  MemberBaseSchema.extend({ properties: AccountPropertiesSchema }),
  ENTITY:   MemberBaseSchema.extend({ properties: EntityPropertiesSchema }),
  SCENARIO: MemberBaseSchema.extend({ properties: ScenarioPropertiesSchema }),
  TIME:     MemberBaseSchema.extend({ properties: TimePropertiesSchema }),
  CURRENCY: MemberBaseSchema.extend({ properties: CurrencyPropertiesSchema }),
  ICP:      MemberBaseSchema.extend({ properties: IcpPropertiesSchema }),
  ORIGIN:   MemberBaseSchema.extend({ properties: OriginPropertiesSchema.default({}) }),
  UD1: MemberBaseSchema.extend({ properties: UdPropertiesSchema.default({}) }),
  UD2: MemberBaseSchema.extend({ properties: UdPropertiesSchema.default({}) }),
  UD3: MemberBaseSchema.extend({ properties: UdPropertiesSchema.default({}) }),
  UD4: MemberBaseSchema.extend({ properties: UdPropertiesSchema.default({}) }),
  UD5: MemberBaseSchema.extend({ properties: UdPropertiesSchema.default({}) }),
  UD6: MemberBaseSchema.extend({ properties: UdPropertiesSchema.default({}) }),
  UD7: MemberBaseSchema.extend({ properties: UdPropertiesSchema.default({}) }),
  UD8: MemberBaseSchema.extend({ properties: UdPropertiesSchema.default({}) }),
};

// Update = create payload but all fields optional
export const UpdateMemberInputByDim: Record<DimensionKind, z.ZodTypeAny> =
  Object.fromEntries(
    (Object.entries(CreateMemberInputByDim) as [DimensionKind, z.ZodObject<any>][])
      .map(([k, schema]) => [k, schema.partial()])
  ) as unknown as Record<DimensionKind, z.ZodTypeAny>;

// ─── URL-slug → DimensionKind mapping ────────────────────────────

// API URLs use lowercase slugs; map to the typed enum.
export const DIM_SLUG_TO_KIND: Record<string, DimensionKind> = {
  account: "ACCOUNT" as DimensionKind,
  entity: "ENTITY" as DimensionKind,
  scenario: "SCENARIO" as DimensionKind,
  time: "TIME" as DimensionKind,
  currency: "CURRENCY" as DimensionKind,
  icp: "ICP" as DimensionKind,
  origin: "ORIGIN" as DimensionKind,
  ud1: "UD1" as DimensionKind, ud2: "UD2" as DimensionKind,
  ud3: "UD3" as DimensionKind, ud4: "UD4" as DimensionKind,
  ud5: "UD5" as DimensionKind, ud6: "UD6" as DimensionKind,
  ud7: "UD7" as DimensionKind, ud8: "UD8" as DimensionKind,
};

export function resolveDimKind(slug: string): DimensionKind | null {
  return DIM_SLUG_TO_KIND[slug.toLowerCase()] ?? null;
}
