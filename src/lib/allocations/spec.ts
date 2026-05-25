/*
 * Allocation DSL — single declarative spec drives every kind of allocation.
 * Pure types + executor. AI generation in /api/v2/allocations/from-nl.
 */

export type AllocationDriverKind =
  | "EQUAL"       // split equally across targets
  | "FIXED_PCT"   // weights[targetId] = pct
  | "FACT_BASED"  // weight = sum of a fact slice per target (e.g. revenue, beds, headcount)
  ;

export type AllocationSpec = {
  // Source: which fact value to distribute
  sourceAccountCode: string;         // e.g. "6300" (IT cost)
  sourceEntityCode:  string;         // e.g. "APOLLO_GRP"
  sourceScenarioCode: string;        // e.g. "Actual"
  sourcePeriodCode:  string;         // e.g. "2026M04" or "FY2026"

  // Target dim (always Entity for now; future: any dim)
  targetDim: "ENTITY";
  targetEntityCodes: string[];       // e.g. ["IN_OPS","US_HQ","UK_OPS","AE_OPS"]

  // Driver = how to compute the weights
  driver: {
    kind: AllocationDriverKind;
    pcts?:               Record<string, number>;   // FIXED_PCT — must sum to 100
    factAccountCode?:    string;                   // FACT_BASED — e.g. "PATIENT_BEDS"
    factScenarioCode?:   string;
    factPeriodCode?:     string;
  };

  // Destination — typically same account, but pushed to each target entity.
  // Source row stays (negative offset optional via reverseSource flag).
  destAccountCode?: string;          // defaults to sourceAccountCode
  reverseSource:   boolean;          // true → write a negative offset to the source entity
  notes?: string;
};

export type AllocationRowToWrite = {
  scenarioCode: string;
  periodCode:   string;
  entityCode:   string;
  accountCode:  string;
  value:        number;
  reason:       string;             // for lineage drawer
};

export function computeAllocationRows(
  spec: AllocationSpec,
  sourceValue: number,
  driverValues: Record<string, number>,  // entityCode → driver value (already fetched)
): AllocationRowToWrite[] {
  if (!spec.targetEntityCodes.length) return [];

  // Determine weights
  let weights: Record<string, number>;
  switch (spec.driver.kind) {
    case "EQUAL": {
      const w = 1 / spec.targetEntityCodes.length;
      weights = Object.fromEntries(spec.targetEntityCodes.map(c => [c, w]));
      break;
    }
    case "FIXED_PCT": {
      const total = Object.values(spec.driver.pcts ?? {}).reduce((a, b) => a + b, 0) || 1;
      weights = Object.fromEntries(spec.targetEntityCodes.map(c => [c, (spec.driver.pcts?.[c] ?? 0) / total]));
      break;
    }
    case "FACT_BASED": {
      const total = Object.values(driverValues).reduce((a, b) => a + b, 0) || 1;
      weights = Object.fromEntries(spec.targetEntityCodes.map(c => [c, (driverValues[c] ?? 0) / total]));
      break;
    }
    default:
      throw new Error(`Unknown driver kind: ${(spec.driver as any).kind}`);
  }

  const destAccount = spec.destAccountCode ?? spec.sourceAccountCode;
  const rows: AllocationRowToWrite[] = spec.targetEntityCodes.map(code => ({
    scenarioCode: spec.sourceScenarioCode,
    periodCode:   spec.sourcePeriodCode,
    entityCode:   code,
    accountCode:  destAccount,
    value:        sourceValue * weights[code],
    reason:       `Allocated from ${spec.sourceEntityCode} via ${spec.driver.kind} (${(weights[code] * 100).toFixed(1)}%)`,
  }));

  if (spec.reverseSource) {
    rows.push({
      scenarioCode: spec.sourceScenarioCode,
      periodCode:   spec.sourcePeriodCode,
      entityCode:   spec.sourceEntityCode,
      accountCode:  destAccount,
      value:        -sourceValue,
      reason:       `Allocation offset — original cost reversed at source entity`,
    });
  }
  return rows;
}
