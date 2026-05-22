// Per-dim Excel template definition: columns + sample rows.
// Used by /api/v2/template/[dim] to generate downloadable .xlsx files
// AND by the ExcelImport UI to know which columns matter.

import type { SupportedDim } from "@/components/metadata/v2/AddMemberDialog";

export interface TemplateSpec {
  sheetName: string;
  columns: { key: string; label: string; hint?: string; required?: boolean }[];
  sampleRows: Record<string, string | number | boolean>[];
  notes: string[];
}

const COMMON = [
  { key: "code",         label: "Code",         required: true, hint: "Unique within dim" },
  { key: "name",         label: "Name",         required: true },
  { key: "description",  label: "Description",  hint: "Optional" },
  { key: "parent_code",  label: "Parent Code",  hint: "Leave blank for root; references another row by code" },
];

export const TEMPLATES: Record<SupportedDim, TemplateSpec> = {
  account: {
    sheetName: "Accounts",
    columns: [
      ...COMMON,
      { key: "account_type",      label: "Account Type",      required: true, hint: "REVENUE | EXPENSE | ASSET | LIABILITY | EQUITY | STATISTICAL | KPI | NON_FINANCIAL" },
      { key: "time_balance",      label: "Time Balance",      hint: "FLOW | LAST | FIRST | AVG  (default FLOW)" },
      { key: "switch_sign",       label: "Switch Sign",       hint: "true | false (default false)" },
      { key: "storage_type",      label: "Storage Type",      hint: "STORED | DYNAMIC | NEVER_SHARE (default STORED)" },
      { key: "calculation_type",  label: "Calculation Type",  hint: "INPUT | FORMULA | ROLLUP (default INPUT)" },
      { key: "variance_type",     label: "Variance Type",     hint: "EXPENSE | NON_EXPENSE | NEUTRAL (default NEUTRAL)" },
      { key: "currency_behavior", label: "Currency Behavior", hint: "TRANSACTIONAL | TRANSLATED | NONE (default TRANSACTIONAL)" },
      { key: "formula",           label: "Formula",           hint: "Used only when calculation_type=FORMULA" },
    ],
    sampleRows: [
      { code: "4000",    name: "Total Revenue",          description: "Top revenue rollup", parent_code: "",      account_type: "REVENUE", time_balance: "FLOW", switch_sign: "false", storage_type: "STORED", calculation_type: "INPUT", variance_type: "NON_EXPENSE", currency_behavior: "TRANSACTIONAL", formula: "" },
      { code: "4100",    name: "Audit Fees",             description: "",                   parent_code: "4000",  account_type: "REVENUE", time_balance: "FLOW", switch_sign: "false", storage_type: "STORED", calculation_type: "INPUT", variance_type: "NON_EXPENSE", currency_behavior: "TRANSACTIONAL", formula: "" },
      { code: "4200",    name: "Tax Consulting",         description: "",                   parent_code: "4000",  account_type: "REVENUE", time_balance: "FLOW", switch_sign: "false", storage_type: "STORED", calculation_type: "INPUT", variance_type: "NON_EXPENSE", currency_behavior: "TRANSACTIONAL", formula: "" },
      { code: "5000",    name: "Total Expenses",         description: "Top expense rollup", parent_code: "",      account_type: "EXPENSE", time_balance: "FLOW", switch_sign: "false", storage_type: "STORED", calculation_type: "INPUT", variance_type: "EXPENSE",     currency_behavior: "TRANSACTIONAL", formula: "" },
      { code: "5110",    name: "Salaries",               description: "",                   parent_code: "5000",  account_type: "EXPENSE", time_balance: "FLOW", switch_sign: "false", storage_type: "STORED", calculation_type: "INPUT", variance_type: "EXPENSE",     currency_behavior: "TRANSACTIONAL", formula: "" },
      { code: "EBITDA",  name: "EBITDA (computed)",      description: "Sample formula row", parent_code: "",      account_type: "KPI",     time_balance: "FLOW", switch_sign: "false", storage_type: "DYNAMIC", calculation_type: "FORMULA", variance_type: "NEUTRAL", currency_behavior: "NONE",        formula: "[4000] - [5000]" },
    ],
    notes: [
      "REQUIRED columns: code, name, account_type",
      "parent_code references another row's code — use the rollup pattern to build a hierarchy",
      "Booleans accept: true/false (case-insensitive)",
      "Codes must be unique within the Account dimension; duplicates will be rejected",
    ],
  },

  entity: {
    sheetName: "Entities",
    columns: [
      ...COMMON,
      { key: "base_currency",        label: "Base Currency",        required: true, hint: "ISO 4217 (e.g. USD, INR, EUR)" },
      { key: "consolidation_method", label: "Consolidation Method", hint: "FULL | PROPORTIONAL | EQUITY | NONE (default FULL)" },
      { key: "ownership_pct",        label: "Ownership %",          hint: "0-100 (default 100)" },
      { key: "icp_enabled",          label: "ICP Enabled",          hint: "true | false (default false)" },
      { key: "country",              label: "Country (ISO)",        hint: "Optional, e.g. US, IN, UK" },
      { key: "tax_id",               label: "Tax ID",               hint: "Optional" },
    ],
    sampleRows: [
      { code: "DTX",     name: "Dtaxdude Group",     description: "Group consolidation",  parent_code: "",     base_currency: "INR", consolidation_method: "FULL", ownership_pct: 100, icp_enabled: "false", country: "IN", tax_id: "" },
      { code: "DTX-HQ",  name: "Dtaxdude HQ Jaora",  description: "Head office",          parent_code: "DTX",  base_currency: "INR", consolidation_method: "FULL", ownership_pct: 100, icp_enabled: "false", country: "IN", tax_id: "" },
      { code: "DTX-PUN", name: "Dtaxdude Pune",      description: "Pune branch",          parent_code: "DTX",  base_currency: "INR", consolidation_method: "FULL", ownership_pct: 100, icp_enabled: "false", country: "IN", tax_id: "" },
      { code: "DTX-BLR", name: "Dtaxdude Bangalore", description: "Bangalore branch",     parent_code: "DTX",  base_currency: "INR", consolidation_method: "FULL", ownership_pct: 100, icp_enabled: "false", country: "IN", tax_id: "" },
      { code: "DTX-JAI", name: "Dtaxdude Jaipur",    description: "Jaipur branch",        parent_code: "DTX",  base_currency: "INR", consolidation_method: "FULL", ownership_pct: 100, icp_enabled: "false", country: "IN", tax_id: "" },
    ],
    notes: [
      "REQUIRED columns: code, name, base_currency",
      "parent_code builds the entity tree (group → sub-groups → operating entities)",
      "ownership_pct < 100 is used by proportional consolidation",
    ],
  },

  scenario: {
    sheetName: "Scenarios",
    columns: [
      ...COMMON,
      { key: "scenario_type",  label: "Scenario Type",  required: true, hint: "ACTUAL | BUDGET | FORECAST | WHATIF" },
      { key: "version",        label: "Version",        hint: "e.g. v1, FY26-v2" },
      { key: "is_frozen",      label: "Frozen",         hint: "true | false (default false)" },
      { key: "start_period",   label: "Start Period",   hint: "e.g. 2026M01" },
      { key: "end_period",     label: "End Period",     hint: "e.g. 2026M12" },
    ],
    sampleRows: [
      { code: "ACTUAL",        name: "Actual",         description: "Historical actuals",   parent_code: "", scenario_type: "ACTUAL",   version: "v1", is_frozen: "true",  start_period: "2024M04", end_period: "2027M03" },
      { code: "BUDGET",        name: "Budget",         description: "FY26 board-approved",  parent_code: "", scenario_type: "BUDGET",   version: "v1", is_frozen: "false", start_period: "2026M04", end_period: "2027M03" },
      { code: "FORECAST",      name: "Forecast",       description: "Rolling 18-month",     parent_code: "", scenario_type: "FORECAST", version: "v1", is_frozen: "false", start_period: "2026M04", end_period: "2027M09" },
      { code: "BUDGET-V2",     name: "Budget v2",      description: "Reforecast after Q2",  parent_code: "", scenario_type: "BUDGET",   version: "v2", is_frozen: "false", start_period: "2026M04", end_period: "2027M03" },
    ],
    notes: [
      "REQUIRED columns: code, name, scenario_type",
      "Frozen scenarios are read-only — used for locking approved versions",
    ],
  },

  time: {
    sheetName: "TimePeriods",
    columns: [
      ...COMMON,
      { key: "period_type",  label: "Period Type",  required: true, hint: "YEAR | HALF | QUARTER | MONTH" },
      { key: "fiscal_year",  label: "Fiscal Year",  required: true, hint: "e.g. 2026" },
      { key: "start_date",   label: "Start Date",   required: true, hint: "YYYY-MM-DD" },
      { key: "end_date",     label: "End Date",     required: true, hint: "YYYY-MM-DD" },
    ],
    sampleRows: [
      { code: "FY2026",     name: "FY 2026",   description: "Apr 2026 – Mar 2027", parent_code: "",          period_type: "YEAR",    fiscal_year: 2026, start_date: "2026-04-01", end_date: "2027-03-31" },
      { code: "Q1-FY2026",  name: "Q1 FY2026", description: "Apr–Jun",             parent_code: "FY2026",    period_type: "QUARTER", fiscal_year: 2026, start_date: "2026-04-01", end_date: "2026-06-30" },
      { code: "2026M04",    name: "April 2026", description: "",                    parent_code: "Q1-FY2026", period_type: "MONTH",   fiscal_year: 2026, start_date: "2026-04-01", end_date: "2026-04-30" },
      { code: "2026M05",    name: "May 2026",   description: "",                    parent_code: "Q1-FY2026", period_type: "MONTH",   fiscal_year: 2026, start_date: "2026-05-01", end_date: "2026-05-31" },
      { code: "2026M06",    name: "June 2026",  description: "",                    parent_code: "Q1-FY2026", period_type: "MONTH",   fiscal_year: 2026, start_date: "2026-06-01", end_date: "2026-06-30" },
    ],
    notes: [
      "REQUIRED columns: code, name, period_type, fiscal_year, start_date, end_date",
      "Year → Quarter → Month is the conventional hierarchy",
      "Use Settings → Time Periods Auto-Generate for large ranges; this template is for ad-hoc edits",
    ],
  },

  currency: {
    sheetName: "Currencies",
    columns: [
      ...COMMON.filter((c) => c.key !== "parent_code"),
      { key: "iso_code", label: "ISO Code", required: true, hint: "3-letter ISO 4217 (USD, INR, EUR…)" },
      { key: "is_base",  label: "Is Base",  hint: "true for the tenant's reporting currency (only one)" },
    ],
    sampleRows: [
      { code: "INR", name: "Indian Rupee", description: "Tenant base currency", iso_code: "INR", is_base: "true"  },
      { code: "USD", name: "US Dollar",    description: "",                     iso_code: "USD", is_base: "false" },
      { code: "EUR", name: "Euro",         description: "",                     iso_code: "EUR", is_base: "false" },
    ],
    notes: [
      "REQUIRED columns: code, name, iso_code",
      "Exactly one currency should have is_base=true",
    ],
  },

  icp: {
    sheetName: "ICPs",
    columns: [
      ...COMMON.filter((c) => c.key !== "parent_code"),
      { key: "entity_code", label: "Entity Code", required: true, hint: "References a member from the Entity dim" },
    ],
    sampleRows: [
      { code: "ICP-DTX-HQ",  name: "ICP Jaora HQ",      description: "Tags intercompany with HQ",   entity_code: "DTX-HQ" },
      { code: "ICP-DTX-PUN", name: "ICP Pune branch",   description: "Tags intercompany with Pune", entity_code: "DTX-PUN" },
    ],
    notes: [
      "REQUIRED columns: code, name, entity_code",
      "NOTE: ICP is now system-managed — toggle icp_enabled on an Entity instead. This template is kept for legacy imports only.",
    ],
  },

  origin: {
    sheetName: "Origins",
    columns: [
      ...COMMON.filter((c) => c.key !== "parent_code"),
      { key: "origin_type", label: "Origin Type", required: true, hint: "IMPORT | FORM | AI | CALC | ELIM | CONSOL | TRANSLATION | ALLOC | JOURNAL" },
    ],
    sampleRows: [
      { code: "Import",  name: "Import",            description: "Loaded from external file",   origin_type: "IMPORT" },
      { code: "Form",    name: "Form Input",        description: "Entered via the data form",   origin_type: "FORM" },
      { code: "AI",      name: "AI Generated",      description: "Forecasted / suggested by AI", origin_type: "AI" },
      { code: "Calc",    name: "Calculated",        description: "Derived by calc engine",      origin_type: "CALC" },
    ],
    notes: [
      "Every fact row carries an originId so you can filter by data source.",
      "REQUIRED columns: code, name, origin_type",
      "'Import' is seeded automatically — re-uploading it is a no-op (409).",
    ],
  },

  // UD1..UD8 — free-form, same columns
  ud1: makeUdTemplate("UD1"), ud2: makeUdTemplate("UD2"), ud3: makeUdTemplate("UD3"), ud4: makeUdTemplate("UD4"),
  ud5: makeUdTemplate("UD5"), ud6: makeUdTemplate("UD6"), ud7: makeUdTemplate("UD7"), ud8: makeUdTemplate("UD8"),
};

function makeUdTemplate(slot: string): TemplateSpec {
  return {
    sheetName: slot,
    columns: [...COMMON, { key: "category", label: "Category", hint: "Free-form tag" }],
    sampleRows: [
      { code: `${slot}-ROOT`,  name: `${slot} Root`,  description: "Root grouping",      parent_code: "",            category: "group" },
      { code: `${slot}-CHILD1`,name: `${slot} Item 1`,description: "",                   parent_code: `${slot}-ROOT`,category: "item"  },
      { code: `${slot}-CHILD2`,name: `${slot} Item 2`,description: "",                   parent_code: `${slot}-ROOT`,category: "item"  },
    ],
    notes: [
      "REQUIRED columns: code, name",
      "Customer-defined dimension — fields are free-form. Add any extra columns you need; they'll be stored in the properties bag.",
    ],
  };
}
