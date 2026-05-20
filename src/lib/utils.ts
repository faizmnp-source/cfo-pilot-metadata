import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { NextResponse } from "next/server";

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

export function apiResponse<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function apiError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ success: false, error: message, details }, { status });
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const data = items.slice((page - 1) * pageSize, page * pageSize);
  return { data, total, page, pageSize, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

export function buildWhereClause(params: URLSearchParams, tenantId: string) {
  const where: Record<string, unknown> = { tenantId };
  const search = params.get("search");
  const isActive = params.get("isActive");
  if (isActive !== null) where.isActive = isActive === "true";
  return { where, search };
}

export function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", { year:"numeric", month:"short", day:"2-digit" });
}

export function generateCode(prefix: string, count: number) {
  return `${prefix}-${String(count + 1).padStart(5, "0")}`;
}

export function formatCurrency(value: number, compact = true): string {
  if (compact) {
    if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}
