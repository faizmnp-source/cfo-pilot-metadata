// /api/settings — tenant-level app settings.
//
// MVP storage: appName → Tenant.name (single source of truth). Other v1
// fields (brand color, reporting currency, fiscal year start, etc) are
// surfaced read-only from defaults until a tenant_settings table lands.
//
// GET   → returns current settings + defaults (any auth)
// PUT   → admin-only; updates Tenant.name when appName changes
// PATCH → alias of PUT

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiResponse, apiError } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const tenant = await prisma.tenant.findUnique({
    where: { id: auth.tid },
    select: { id:true, name:true, slug:true, isActive:true, createdAt:true },
  });

  return apiResponse({
    tenantId:          auth.tid,
    appName:           tenant?.name ?? "CFO Pilot",
    brandColor:        "#6366f1",
    reportingCurrency: "USD",
    fiscalYearStart:   1,
    dateFormat:        "YYYY-MM-DD",
    numberFormat:      "1,234.56",
    timezone:          "UTC",
    isSetupComplete:   true,
  });
}

export async function PUT(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  if (auth.role !== "ADMIN") {
    return apiError("Admin role required to change settings", 403);
  }

  let body: any = {};
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  // Only persisted field today is appName → Tenant.name. Everything else is
  // accepted silently for forward-compat with the existing UI form.
  if (typeof body.appName === "string" && body.appName.trim().length > 0) {
    await prisma.tenant.update({
      where: { id: auth.tid },
      data:  { name: body.appName.trim() },
    });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: auth.tid },
    select: { id:true, name:true, slug:true, isActive:true },
  });

  return apiResponse({
    tenantId:          auth.tid,
    appName:           tenant?.name ?? "CFO Pilot",
    brandColor:        typeof body.brandColor        === "string" ? body.brandColor        : "#6366f1",
    reportingCurrency: typeof body.reportingCurrency === "string" ? body.reportingCurrency : "USD",
    fiscalYearStart:   typeof body.fiscalYearStart   === "number" ? body.fiscalYearStart   : 1,
    dateFormat:        typeof body.dateFormat        === "string" ? body.dateFormat        : "YYYY-MM-DD",
    numberFormat:      typeof body.numberFormat      === "string" ? body.numberFormat      : "1,234.56",
    timezone:          typeof body.timezone          === "string" ? body.timezone          : "UTC",
    isSetupComplete:   true,
  });
}

export async function PATCH(req: NextRequest) { return PUT(req); }
