// /api/settings — tenant-level app settings.
//
// Persisted today:
//   - appName              → Tenant.name
//   - reportingCurrency    → flips is_base=true on the matching Currency
//                            dim member (creating it if no member exists for
//                            that ISO yet). Drives all FX translation +
//                            "Reporting" currency resolution downstream.
// Other v1 fields (brandColor, fiscalYearStart, dateFormat, numberFormat,
// timezone) are accepted and echoed back for forward-compat — they'll get
// real persistence when a tenant_settings table lands.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureDimension } from "@/lib/ensure-dimension";
import { requireAuth } from "@/lib/api-helpers";
import { apiResponse, apiError } from "@/lib/utils";

/** Returns the ISO code of the currency member flagged is_base=true, or USD if none. */
async function getReportingCurrencyIso(tenantId: string): Promise<string> {
  const baseMember = await prisma.dimensionMember.findFirst({
    where: {
      tenantId, isActive: true,
      dimension: { kind: "CURRENCY" as any },
      properties: { path: ["is_base"], equals: true } as any,
    },
    select: { properties: true },
  });
  const iso = (baseMember?.properties as any)?.iso_code;
  return typeof iso === "string" && iso.length === 3 ? iso : "USD";
}

/**
 * Persists the tenant's reporting currency choice. Idempotent. The picked
 * ISO becomes is_base=true on its currency member; any prior base member
 * loses its is_base flag. Creates the member if no row exists yet for the
 * picked ISO.
 */
async function setReportingCurrencyIso(tenantId: string, userId: string, iso: string): Promise<void> {
  const dim = await ensureDimension(tenantId, "CURRENCY" as any);

  // Clear is_base on any previously-base members
  const prevBase = await prisma.dimensionMember.findMany({
    where: {
      tenantId, dimensionId: dim.id,
      properties: { path: ["is_base"], equals: true } as any,
    },
    select: { id: true, properties: true },
  });
  for (const m of prevBase) {
    const props = ((m.properties as any) ?? {});
    delete props.is_base;
    await prisma.dimensionMember.update({
      where: { id: m.id }, data: { properties: props as any, updatedBy: userId },
    });
  }

  // Find or create the picked ISO member
  const existing = await prisma.dimensionMember.findFirst({
    where: { tenantId, dimensionId: dim.id, memberCode: iso },
  });
  if (existing) {
    const props = ((existing.properties as any) ?? {});
    props.is_base = true;
    props.iso_code = iso;
    await prisma.dimensionMember.update({
      where: { id: existing.id }, data: { properties: props as any, isActive: true, updatedBy: userId },
    });
  } else {
    await prisma.dimensionMember.create({
      data: {
        tenantId, dimensionId: dim.id,
        memberCode: iso, memberName: iso,
        description: `Tenant base currency (${iso})`,
        isActive: true, sortOrder: 100,
        properties: { iso_code: iso, is_base: true } as any,
        createdBy: userId, updatedBy: userId,
      },
    });
  }
}

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const [tenant, reportingCurrency] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: auth.tid },
      select: { id:true, name:true, slug:true, isActive:true, createdAt:true },
    }),
    getReportingCurrencyIso(auth.tid),
  ]);

  return apiResponse({
    tenantId:          auth.tid,
    appName:           tenant?.name ?? "CFO Pilot",
    brandColor:        "#6366f1",
    reportingCurrency,
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

  if (typeof body.appName === "string" && body.appName.trim().length > 0) {
    await prisma.tenant.update({
      where: { id: auth.tid },
      data:  { name: body.appName.trim() },
    });
  }

  // Persist reporting currency: flips is_base on the matching Currency member.
  // Skip if value didn't change (avoids resetting properties on no-op saves).
  if (typeof body.reportingCurrency === "string" && /^[A-Z]{3}$/.test(body.reportingCurrency)) {
    const current = await getReportingCurrencyIso(auth.tid);
    if (current !== body.reportingCurrency) {
      await setReportingCurrencyIso(auth.tid, auth.sub, body.reportingCurrency);
    }
  }

  const [tenant, reportingCurrency] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: auth.tid },
      select: { id:true, name:true, slug:true, isActive:true },
    }),
    getReportingCurrencyIso(auth.tid),
  ]);

  return apiResponse({
    tenantId:          auth.tid,
    appName:           tenant?.name ?? "CFO Pilot",
    brandColor:        typeof body.brandColor        === "string" ? body.brandColor        : "#6366f1",
    reportingCurrency,
    fiscalYearStart:   typeof body.fiscalYearStart   === "number" ? body.fiscalYearStart   : 1,
    dateFormat:        typeof body.dateFormat        === "string" ? body.dateFormat        : "YYYY-MM-DD",
    numberFormat:      typeof body.numberFormat      === "string" ? body.numberFormat      : "1,234.56",
    timezone:          typeof body.timezone          === "string" ? body.timezone          : "UTC",
    isSetupComplete:   true,
  });
}

export async function PATCH(req: NextRequest) { return PUT(req); }
