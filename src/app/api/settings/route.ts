import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission } from "@/lib/api-helpers";

const SettingsSchema = z.object({
  appName:           z.string().min(1).max(100).optional(),
  reportingCurrency: z.string().length(3).optional(),
  fiscalYearStart:   z.number().int().min(1).max(12).optional(),
  dateFormat:        z.string().max(30).optional(),
  numberFormat:      z.string().max(30).optional(),
  timezone:          z.string().max(60).optional(),
  logoUrl:           z.string().url().optional().nullable(),
  primaryColor:      z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  isSetupComplete:   z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "settings", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  let settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: auth.tid },
  });

  // Auto-create defaults if not yet set up
  if (!settings) {
    settings = await prisma.tenantSettings.create({
      data: {
        tenantId:          auth.tid,
        appName:           "CFO Pilot",
        reportingCurrency: "USD",
        fiscalYearStart:   1,
        isSetupComplete:   false,
      },
    });
  }

  return apiResponse(settings);
}

export async function PUT(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "settings", "update");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const body = await req.json();
  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  const settings = await prisma.tenantSettings.upsert({
    where:  { tenantId: auth.tid },
    update: parsed.data,
    create: {
      tenantId: auth.tid,
      ...parsed.data,
    },
  });

  return apiResponse(settings);
}
