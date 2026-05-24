/*
 * Unit tests for the zod schemas in `validations.ts`.
 *
 * These schemas are the *only* server-side gate between the JSON body of
 * every POST/PATCH API route and the database — Prisma columns are not
 * configured with check constraints, so if a schema regresses (a default
 * shifts, an enum loses a value, a length cap relaxes), bad rows land in
 * Postgres before anyone notices.
 *
 * Covers every exported schema:
 *   AccountSchema, EntitySchema, DepartmentSchema, CostCenterSchema,
 *   LoginSchema, PaginationSchema, ScenarioSchema, CurrencySchema,
 *   TimePointSchema, ProductServiceSchema, EmployeeCategorySchema,
 *   DoctorCategorySchema
 *
 * No DB, no I/O — pure zod parse/safeParse. Pins:
 *   - field length caps (50/100/200/500) that drive UI input maxLength
 *   - enum membership (account types, scenario types, etc.) — adding or
 *     removing an enum value silently breaks every form
 *   - defaults applied on missing fields (isActive=true, baseCurrency=USD,
 *     scenarioType=BUDGET, sortOrder=asc, etc.)
 *   - coercion behaviour on PaginationSchema (string → int for query params)
 *   - LoginSchema accepts the documented 7-char demo password ("user123")
 *     and rejects shorter ones (memory: demo creds for admin@dtaxdude.com)
 */

import {
  AccountSchema,
  EntitySchema,
  DepartmentSchema,
  CostCenterSchema,
  LoginSchema,
  PaginationSchema,
  ScenarioSchema,
  CurrencySchema,
  TimePointSchema,
  ProductServiceSchema,
  EmployeeCategorySchema,
  DoctorCategorySchema,
} from "./validations";

describe("AccountSchema", () => {
  const valid = {
    accountCode: "1000",
    accountName: "Cash",
    accountType: "ASSET" as const,
  };

  test("parses a minimal valid Account", () => {
    const r = AccountSchema.parse(valid);
    expect(r.accountCode).toBe("1000");
    expect(r.accountType).toBe("ASSET");
  });

  test("defaults isActive to true when omitted", () => {
    const r = AccountSchema.parse(valid);
    expect(r.isActive).toBe(true);
  });

  test("accepts optional parentId / reportingGroup / description / isActive=false", () => {
    const r = AccountSchema.parse({
      ...valid,
      parentId: "11111111-1111-1111-1111-111111111111",
      reportingGroup: "CurrentAssets",
      description: "Petty cash on hand",
      isActive: false,
    });
    expect(r.parentId).toBe("11111111-1111-1111-1111-111111111111");
    expect(r.isActive).toBe(false);
  });

  test("rejects empty accountCode", () => {
    expect(AccountSchema.safeParse({ ...valid, accountCode: "" }).success).toBe(false);
  });

  test("rejects accountCode > 50 chars", () => {
    expect(AccountSchema.safeParse({ ...valid, accountCode: "A".repeat(51) }).success).toBe(false);
  });

  test("rejects accountCode with spaces or other non-allowed chars", () => {
    expect(AccountSchema.safeParse({ ...valid, accountCode: "12 34" }).success).toBe(false);
    expect(AccountSchema.safeParse({ ...valid, accountCode: "ABC/123" }).success).toBe(false);
  });

  test("accepts accountCode with hyphen, underscore, dot, mixed case", () => {
    for (const code of ["1000", "ABC-123", "ABC_123", "A.B.C", "abc123"]) {
      expect(AccountSchema.safeParse({ ...valid, accountCode: code }).success).toBe(true);
    }
  });

  test("rejects accountName > 200 chars and empty accountName", () => {
    expect(AccountSchema.safeParse({ ...valid, accountName: "" }).success).toBe(false);
    expect(AccountSchema.safeParse({ ...valid, accountName: "A".repeat(201) }).success).toBe(false);
  });

  test("rejects unknown accountType", () => {
    expect(AccountSchema.safeParse({ ...valid, accountType: "INCOME" }).success).toBe(false);
  });

  test("accepts all five canonical accountType values", () => {
    for (const t of ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const) {
      expect(AccountSchema.safeParse({ ...valid, accountType: t }).success).toBe(true);
    }
  });

  test("rejects parentId that is not a uuid", () => {
    expect(AccountSchema.safeParse({ ...valid, parentId: "not-a-uuid" }).success).toBe(false);
  });

  test("rejects description > 500 chars", () => {
    expect(AccountSchema.safeParse({ ...valid, description: "x".repeat(501) }).success).toBe(false);
  });
});

describe("EntitySchema", () => {
  const valid = { entityCode: "US01", entityName: "US HoldCo" };

  test("parses a minimal valid Entity", () => {
    const r = EntitySchema.parse(valid);
    expect(r.entityCode).toBe("US01");
  });

  test("defaults baseCurrency to USD and isActive to true", () => {
    const r = EntitySchema.parse(valid);
    expect(r.baseCurrency).toBe("USD");
    expect(r.isActive).toBe(true);
  });

  test("rejects baseCurrency that is not exactly 3 chars", () => {
    expect(EntitySchema.safeParse({ ...valid, baseCurrency: "US" }).success).toBe(false);
    expect(EntitySchema.safeParse({ ...valid, baseCurrency: "USDD" }).success).toBe(false);
  });

  test("accepts ownershipPercentage in [0, 100] and rejects out-of-range", () => {
    expect(EntitySchema.safeParse({ ...valid, ownershipPercentage: 0 }).success).toBe(true);
    expect(EntitySchema.safeParse({ ...valid, ownershipPercentage: 50.5 }).success).toBe(true);
    expect(EntitySchema.safeParse({ ...valid, ownershipPercentage: 100 }).success).toBe(true);
    expect(EntitySchema.safeParse({ ...valid, ownershipPercentage: -1 }).success).toBe(false);
    expect(EntitySchema.safeParse({ ...valid, ownershipPercentage: 100.01 }).success).toBe(false);
  });

  test("rejects empty entityCode and entityName", () => {
    expect(EntitySchema.safeParse({ ...valid, entityCode: "" }).success).toBe(false);
    expect(EntitySchema.safeParse({ ...valid, entityName: "" }).success).toBe(false);
  });

  test("rejects entityCode > 50 chars and entityName > 200 chars", () => {
    expect(EntitySchema.safeParse({ ...valid, entityCode: "x".repeat(51) }).success).toBe(false);
    expect(EntitySchema.safeParse({ ...valid, entityName: "x".repeat(201) }).success).toBe(false);
  });
});

describe("DepartmentSchema", () => {
  const valid = { departmentCode: "FIN", departmentName: "Finance" };

  test("parses a minimal valid Department", () => {
    expect(DepartmentSchema.parse(valid).departmentCode).toBe("FIN");
  });

  test("defaults isActive to true", () => {
    expect(DepartmentSchema.parse(valid).isActive).toBe(true);
  });

  test("rejects empty code/name and over-cap lengths", () => {
    expect(DepartmentSchema.safeParse({ ...valid, departmentCode: "" }).success).toBe(false);
    expect(DepartmentSchema.safeParse({ ...valid, departmentName: "" }).success).toBe(false);
    expect(DepartmentSchema.safeParse({ ...valid, departmentCode: "x".repeat(51) }).success).toBe(false);
    expect(DepartmentSchema.safeParse({ ...valid, departmentName: "x".repeat(201) }).success).toBe(false);
  });

  test("rejects parentId / entityId that are not uuids", () => {
    expect(DepartmentSchema.safeParse({ ...valid, parentId: "abc" }).success).toBe(false);
    expect(DepartmentSchema.safeParse({ ...valid, entityId: "abc" }).success).toBe(false);
  });
});

describe("CostCenterSchema", () => {
  const valid = { costCenterCode: "CC100", costCenterName: "HQ Operations" };

  test("parses a minimal valid CostCenter", () => {
    expect(CostCenterSchema.parse(valid).costCenterCode).toBe("CC100");
  });

  test("defaults currency to USD and isActive to true", () => {
    const r = CostCenterSchema.parse(valid);
    expect(r.currency).toBe("USD");
    expect(r.isActive).toBe(true);
  });

  test("rejects currency that is not exactly 3 chars", () => {
    expect(CostCenterSchema.safeParse({ ...valid, currency: "USDD" }).success).toBe(false);
  });

  test("accepts numeric budget and nullable budget", () => {
    expect(CostCenterSchema.safeParse({ ...valid, budget: 123456.78 }).success).toBe(true);
    expect(CostCenterSchema.safeParse({ ...valid, budget: null }).success).toBe(true);
  });
});

describe("LoginSchema", () => {
  test("accepts a valid email + 6-char password", () => {
    expect(
      LoginSchema.safeParse({ email: "x@y.com", password: "abcdef" }).success,
    ).toBe(true);
  });

  test("accepts documented demo password 'user123' (7 chars)", () => {
    expect(
      LoginSchema.safeParse({ email: "admin@dtaxdude.com", password: "user123" }).success,
    ).toBe(true);
  });

  test("rejects password shorter than 6 chars", () => {
    expect(
      LoginSchema.safeParse({ email: "x@y.com", password: "abcde" }).success,
    ).toBe(false);
  });

  test("rejects malformed email", () => {
    expect(
      LoginSchema.safeParse({ email: "not-an-email", password: "abcdef" }).success,
    ).toBe(false);
  });
});

describe("PaginationSchema", () => {
  test("applies defaults when nothing is passed", () => {
    const r = PaginationSchema.parse({});
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(50);
    expect(r.sortOrder).toBe("asc");
  });

  test("coerces string page/pageSize (query-param flow) to int", () => {
    const r = PaginationSchema.parse({ page: "3", pageSize: "25" });
    expect(r.page).toBe(3);
    expect(r.pageSize).toBe(25);
  });

  test("rejects page < 1 and pageSize > 500", () => {
    expect(PaginationSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(PaginationSchema.safeParse({ pageSize: 501 }).success).toBe(false);
    expect(PaginationSchema.safeParse({ pageSize: 0 }).success).toBe(false);
  });

  test("isActive enum is true/false/all only", () => {
    expect(PaginationSchema.safeParse({ isActive: "true" }).success).toBe(true);
    expect(PaginationSchema.safeParse({ isActive: "false" }).success).toBe(true);
    expect(PaginationSchema.safeParse({ isActive: "all" }).success).toBe(true);
    expect(PaginationSchema.safeParse({ isActive: "maybe" }).success).toBe(false);
  });

  test("sortOrder enum is asc/desc only", () => {
    expect(PaginationSchema.safeParse({ sortOrder: "asc" }).success).toBe(true);
    expect(PaginationSchema.safeParse({ sortOrder: "desc" }).success).toBe(true);
    expect(PaginationSchema.safeParse({ sortOrder: "DESC" }).success).toBe(false);
  });

  test("rejects non-integer page values", () => {
    expect(PaginationSchema.safeParse({ page: 1.5 }).success).toBe(false);
  });
});

describe("ScenarioSchema", () => {
  const valid = { scenarioCode: "FY26", scenarioName: "FY2026 Budget", fiscalYear: 2026 };

  test("parses a minimal valid Scenario", () => {
    expect(ScenarioSchema.parse(valid).scenarioCode).toBe("FY26");
  });

  test("defaults scenarioType to BUDGET, isLocked to false, isActive to true", () => {
    const r = ScenarioSchema.parse(valid);
    expect(r.scenarioType).toBe("BUDGET");
    expect(r.isLocked).toBe(false);
    expect(r.isActive).toBe(true);
  });

  test("accepts all five scenarioType values and rejects unknown", () => {
    for (const t of ["BUDGET", "FORECAST", "ACTUALS", "ROLLING_FORECAST", "STRESS_TEST"] as const) {
      expect(ScenarioSchema.safeParse({ ...valid, scenarioType: t }).success).toBe(true);
    }
    expect(ScenarioSchema.safeParse({ ...valid, scenarioType: "PLAN" }).success).toBe(false);
  });

  test("rejects fiscalYear outside [2000, 2099]", () => {
    expect(ScenarioSchema.safeParse({ ...valid, fiscalYear: 1999 }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...valid, fiscalYear: 2100 }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...valid, fiscalYear: 2000 }).success).toBe(true);
    expect(ScenarioSchema.safeParse({ ...valid, fiscalYear: 2099 }).success).toBe(true);
  });

  test("rejects non-integer fiscalYear", () => {
    expect(ScenarioSchema.safeParse({ ...valid, fiscalYear: 2026.5 }).success).toBe(false);
  });
});

describe("CurrencySchema", () => {
  const valid = { code: "USD", name: "US Dollar", symbol: "$" };

  test("parses a minimal valid Currency", () => {
    expect(CurrencySchema.parse(valid).code).toBe("USD");
  });

  test("defaults exchangeRate to 1, isBase to false, isActive to true", () => {
    const r = CurrencySchema.parse(valid);
    expect(r.exchangeRate).toBe(1);
    expect(r.isBase).toBe(false);
    expect(r.isActive).toBe(true);
  });

  test("requires code to be 3 uppercase letters", () => {
    expect(CurrencySchema.safeParse({ ...valid, code: "us1" }).success).toBe(false);
    expect(CurrencySchema.safeParse({ ...valid, code: "usd" }).success).toBe(false);
    expect(CurrencySchema.safeParse({ ...valid, code: "US" }).success).toBe(false);
    expect(CurrencySchema.safeParse({ ...valid, code: "USDD" }).success).toBe(false);
    expect(CurrencySchema.safeParse({ ...valid, code: "EUR" }).success).toBe(true);
  });

  test("rejects non-positive exchangeRate", () => {
    expect(CurrencySchema.safeParse({ ...valid, exchangeRate: 0 }).success).toBe(false);
    expect(CurrencySchema.safeParse({ ...valid, exchangeRate: -0.5 }).success).toBe(false);
  });

  test("rejects empty/oversized symbol and name", () => {
    expect(CurrencySchema.safeParse({ ...valid, symbol: "" }).success).toBe(false);
    expect(CurrencySchema.safeParse({ ...valid, symbol: "x".repeat(11) }).success).toBe(false);
    expect(CurrencySchema.safeParse({ ...valid, name: "" }).success).toBe(false);
    expect(CurrencySchema.safeParse({ ...valid, name: "x".repeat(101) }).success).toBe(false);
  });
});

describe("TimePointSchema", () => {
  const valid = {
    code: "2026M01",
    name: "Jan 2026",
    fiscalYear: 2026,
    startDate: "2026-01-01",
    endDate: "2026-01-31",
  };

  test("parses a minimal valid TimePoint", () => {
    expect(TimePointSchema.parse(valid).code).toBe("2026M01");
  });

  test("defaults periodType to MONTH, isActive to true, sortOrder to 0", () => {
    const r = TimePointSchema.parse(valid);
    expect(r.periodType).toBe("MONTH");
    expect(r.isActive).toBe(true);
    expect(r.sortOrder).toBe(0);
  });

  test("accepts all five periodType enum values and rejects unknown", () => {
    for (const t of ["YEAR", "QUARTER", "MONTH", "WEEK", "DAY"] as const) {
      expect(TimePointSchema.safeParse({ ...valid, periodType: t }).success).toBe(true);
    }
    expect(TimePointSchema.safeParse({ ...valid, periodType: "DECADE" }).success).toBe(false);
  });

  test("fiscalPeriod range [1, 53] when provided", () => {
    expect(TimePointSchema.safeParse({ ...valid, fiscalPeriod: 1 }).success).toBe(true);
    expect(TimePointSchema.safeParse({ ...valid, fiscalPeriod: 53 }).success).toBe(true);
    expect(TimePointSchema.safeParse({ ...valid, fiscalPeriod: 0 }).success).toBe(false);
    expect(TimePointSchema.safeParse({ ...valid, fiscalPeriod: 54 }).success).toBe(false);
  });

  test("accepts startDate/endDate as either string or Date instance", () => {
    expect(
      TimePointSchema.safeParse({
        ...valid,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-31"),
      }).success,
    ).toBe(true);
  });

  test("rejects fiscalYear outside [2000, 2099]", () => {
    expect(TimePointSchema.safeParse({ ...valid, fiscalYear: 1999 }).success).toBe(false);
    expect(TimePointSchema.safeParse({ ...valid, fiscalYear: 2100 }).success).toBe(false);
  });
});

describe("ProductServiceSchema", () => {
  const valid = { code: "SKU001", name: "Consulting Hour" };

  test("parses a minimal valid ProductService", () => {
    expect(ProductServiceSchema.parse(valid).code).toBe("SKU001");
  });

  test("defaults currency to USD and isActive to true", () => {
    const r = ProductServiceSchema.parse(valid);
    expect(r.currency).toBe("USD");
    expect(r.isActive).toBe(true);
  });

  test("rejects currency not exactly 3 chars", () => {
    expect(ProductServiceSchema.safeParse({ ...valid, currency: "USDD" }).success).toBe(false);
  });

  test("accepts nullable unitPrice and over-cap rejection for category", () => {
    expect(ProductServiceSchema.safeParse({ ...valid, unitPrice: null }).success).toBe(true);
    expect(ProductServiceSchema.safeParse({ ...valid, unitPrice: 99.99 }).success).toBe(true);
    expect(ProductServiceSchema.safeParse({ ...valid, category: "x".repeat(101) }).success).toBe(false);
  });
});

describe("EmployeeCategorySchema", () => {
  const valid = { code: "ENG", name: "Engineering FTE" };

  test("parses a minimal valid EmployeeCategory", () => {
    expect(EmployeeCategorySchema.parse(valid).code).toBe("ENG");
  });

  test("defaults isActive to true", () => {
    expect(EmployeeCategorySchema.parse(valid).isActive).toBe(true);
  });

  test("categoryType is optional but enforces enum when provided", () => {
    for (const t of ["FULL_TIME", "PART_TIME", "CONTRACT", "CONSULTANT", "INTERN"] as const) {
      expect(EmployeeCategorySchema.safeParse({ ...valid, categoryType: t }).success).toBe(true);
    }
    expect(EmployeeCategorySchema.safeParse({ ...valid, categoryType: "VENDOR" }).success).toBe(false);
  });
});

describe("DoctorCategorySchema", () => {
  const valid = { code: "CARD", name: "Cardiology" };

  test("parses a minimal valid DoctorCategory", () => {
    expect(DoctorCategorySchema.parse(valid).code).toBe("CARD");
  });

  test("defaults currency to USD and isActive to true", () => {
    const r = DoctorCategorySchema.parse(valid);
    expect(r.currency).toBe("USD");
    expect(r.isActive).toBe(true);
  });

  test("accepts billableRate numeric or null; rejects bad currency length", () => {
    expect(DoctorCategorySchema.safeParse({ ...valid, billableRate: 250 }).success).toBe(true);
    expect(DoctorCategorySchema.safeParse({ ...valid, billableRate: null }).success).toBe(true);
    expect(DoctorCategorySchema.safeParse({ ...valid, currency: "USDD" }).success).toBe(false);
  });
});
