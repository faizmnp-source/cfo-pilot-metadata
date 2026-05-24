// CalcRule spec types.
//
// A CalcRule is a SAVED declarative calc — no LLM at run-time. The spec
// is generated either manually or via "vibe coding" (NL → AI → spec, user
// reviews + saves). Once ACTIVE, it executes pure deterministic math.

export type CalcRuleKind =
  | "PERCENTAGE"     // apply % to filtered facts (e.g. "10% tax on revenue")
  | "ALLOCATION"     // spread one account to many by driver
  | "SUM"            // aggregate filtered facts to a target account
  | "FX_CONVERT"     // apply FX rate
  | "COMP_BUILD"     // total comp from base × multipliers (workforce)
  | "CUSTOM";        // sandboxed JS expression (Phase 2)

export interface RuleFilters {
  scenarioId?:        string;
  scenarioCode?:      string;        // resolved at run-time if id missing
  entityIds?:         string[];
  entityCodes?:       string[];
  accountIds?:        string[];
  accountCodes?:      string[];
  accountTypePrefix?: string;        // e.g. "4" for revenue, "5" for COGS
  periodCodes?:       string[];      // e.g. ["2026-01", "2026-02"]
  yearCode?:          string;        // e.g. "FY2026"
}

export interface PercentageFormula {
  kind:   "percentage";
  factor: number;                    // 0.10 = 10%
  basis?: "amount" | "abs";          // default 'amount'
}

export interface SumFormula {
  kind: "sum";
  // No params — just sum what filters match
}

export interface AllocationFormula {
  kind:        "allocation";
  driverAccountId?:   string;        // driver lookup
  driverAccountCode?: string;
  // Each target gets: source × (driver_target / driver_total)
}

export interface FxConvertFormula {
  kind: "fx_convert";
  fromCcy: string;                   // ISO 4217 (e.g. "USD")
  toCcy:   string;                   // ISO 4217 (e.g. "INR")
  rateType?: "avg" | "spot" | "end"; // default 'avg'
}

export interface CompBuildFormula {
  kind: "comp_build";
  baseAccountCode:    string;        // e.g. "BASE_SALARY"
  multipliers:        Record<string, number>;  // e.g. { "BENEFITS": 0.20, "BONUS": 0.10 }
}

export type RuleFormula =
  | PercentageFormula
  | SumFormula
  | AllocationFormula
  | FxConvertFormula
  | CompBuildFormula
  | { kind: "custom"; expression: string };

export interface RuleOutput {
  accountId?:         string;
  accountCode?:       string;
  scenarioId?:        string;
  scenarioCode?:      string;
  origin:             "AI" | "Calc";  // origin label for written rows
  overwriteExisting?: boolean;        // default false (append)
}

export interface RuleSpec {
  filters: RuleFilters;
  formula: RuleFormula;
  output:  RuleOutput;
}

export interface RuleRunResult {
  status:      "SUCCEEDED" | "FAILED";
  rowsRead:    number;
  rowsWritten: number;
  startedAt:   string;
  finishedAt:  string;
  message?:    string;
  errorMessage?: string;
}
