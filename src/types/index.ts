export type Role = "ADMIN" | "FINANCE_MANAGER" | "FINANCE_USER" | "VIEWER";

export interface User {
  id: string; tenantId: string; email: string; name: string;
  role: Role; isActive: boolean; lastLoginAt?: string;
}

export interface PaginatedResponse<T> {
  data: T[]; total: number; page: number;
  pageSize: number; totalPages: number;
  hasNext: boolean; hasPrev: boolean;
}

export interface ApiResponse<T> { success: boolean; data: T; }
export interface ApiError { success: boolean; error: string; details?: unknown; }

export interface TreeNode {
  id: string; code: string; name: string; parentId: string | null;
  isActive: boolean; children?: TreeNode[]; level?: number;
  [key: string]: unknown;
}

export interface ValidationError {
  row: number; recordCode: string; recordName: string;
  errorType: string; severity: "ERROR" | "WARNING" | "INFO";
  field: string; message: string; recommendation: string;
  fixable: boolean; suggestedFix?: string;
}

export interface ImportPreviewRow {
  rowNumber: number; data: Record<string, string>;
  isValid: boolean; errors: ValidationError[];
}

export interface DashboardStats {
  accounts: number; entities: number; departments: number;
  costCenters: number; currencies: number; scenarios: number;
  validationErrors: number; recentChanges: number;
  importJobs: number;
}
