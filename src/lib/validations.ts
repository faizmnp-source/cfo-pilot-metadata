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
  password: z.string().min(8),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  search: z.string().optional(),
  isActive: z.enum(["true","false","all"]).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc","desc"]).default("asc"),
});
