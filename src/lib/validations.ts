import { z } from "zod";

export const AccountSchema = z.object({
  accountCode: z.string().min(1).max(50).regex(/^[A-Z0-9\-_.]+$/i, "Code must be alphanumeric"),
  accountName: z.string().min(1).max(200),
  accountType: z.enum(["ASSET","LIABILITY","EQUITY","REVENUE","EXPENSE"]),
  parentId: z.string().uuid().optional().nullable(),
  reportingGroup: z.string().max(100).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const EntitySchema = z.object({
  entityCode: z.string().min(1).max(50),
  entityName: z.string().min(1).max(200),
  parentId: z.string().uuid().optional().nullable(),
  ownershipPercentage: z.number().min(0).max(100).optional().nullable(),
  baseCurrency: z.string().length(3).default("USD"),
  country: z.string().max(100).optional().nullable(),
  taxId: z.string().max(50).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const DepartmentSchema = z.object({
  departmentCode: z.string().min(1).max(50),
  departmentName: z.string().min(1).max(200),
  parentId: z.string().uuid().optional().nullable(),
  entityId: z.string().uuid().optional().nullable(),
  costType: z.string().max(50).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const CostCenterSchema = z.object({
  costCenterCode: z.string().min(1).max(50),
  costCenterName: z.string().min(1).max(200),
  parentId: z.string().uuid().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  entityId: z.string().uuid().optional().nullable(),
  costType: z.string().max(50).optional().nullable(),
  budget: z.number().optional().nullable(),
  currency: z.string().length(3).default("USD"),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  // Min 6 to allow demo passwords (user123 is 7 chars). DEMO_USERS list in
  // the login route is the source of truth for canonical demo creds;
  // production accounts created via signup should use a stronger client-side
  // policy (min 12 + complexity) — this is server-side last-ditch validation.
  password: z.string().min(6),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  search: z.string().optional(),
  isActive: z.enum(["true","false","all"]).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc","desc"]).default("asc"),
});

export const ScenarioSchema = z.object({
  scenarioCode: z.string().min(1).max(50),
  scenarioName: z.string().min(1).max(200),
  scenarioType: z.enum(["BUDGET","FORECAST","ACTUALS","ROLLING_FORECAST","STRESS_TEST"]).default("BUDGET"),
  fiscalYear: z.number().int().min(2000).max(2099),
  description: z.string().max(500).optional().nullable(),
  isLocked: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const CurrencySchema = z.object({
  code: z.string().length(3).regex(/^[A-Z]{3}$/),
  name: z.string().min(1).max(100),
  symbol: z.string().min(1).max(10),
  exchangeRate: z.number().positive().default(1),
  isBase: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const TimePointSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  periodType: z.enum(["YEAR","QUARTER","MONTH","WEEK","DAY"]).default("MONTH"),
  fiscalYear: z.number().int().min(2000).max(2099),
  fiscalPeriod: z.number().int().min(1).max(53).optional().nullable(),
  startDate: z.string().or(z.date()),
  endDate: z.string().or(z.date()),
  parentId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const ProductServiceSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  category: z.string().max(100).optional().nullable(),
  unitOfMeasure: z.string().max(50).optional().nullable(),
  unitPrice: z.number().optional().nullable(),
  currency: z.string().length(3).default("USD"),
  isActive: z.boolean().default(true),
});

export const EmployeeCategorySchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  categoryType: z.enum(["FULL_TIME","PART_TIME","CONTRACT","CONSULTANT","INTERN"]).optional().nullable(),
  payGrade: z.string().max(50).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const DoctorCategorySchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  specialty: z.string().max(100).optional().nullable(),
  billableRate: z.number().optional().nullable(),
  currency: z.string().length(3).default("USD"),
  department: z.string().max(100).optional().nullable(),
  isActive: z.boolean().default(true),
});
