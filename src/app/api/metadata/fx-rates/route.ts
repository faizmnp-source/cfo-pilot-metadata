import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission, getPaginationParams } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const FxRateSchema = z.object({
  fromCurrency:  z.string().length(3).toUpperCase(),
  toCurrency:    z.string().length(3).toUpperCase(),
  rate:          z.number().positive(),
  effectiveDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  source:        z.enum(["MANUAL", "MARKET", "IMPORTED"]).default("MANUAL"),
  isActive:      z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "currency", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const sp = req.nextUrl.searchParams;
  const p  = getPaginationParams(sp);
  const fromCurrency = sp.get("from") ?? undefined;
  const toCurrency   = sp.get("to")   ?? undefined;
  const date         = sp.get("date") ?? undefined;

  const where: Record<string, unknown> = {
    tenantId: auth.tid,
    ...(fromCurrency && { fromCurrency: fromCurrency.toUpperCase() }),
    ...(toCurrency   && { toCurrency:   toCurrency.toUpperCase()   }),
    ...(date         && { effectiveDate: new Date(date)             }),
    ...(p.isActive !== undefined && { isActive: p.isActive }),
  };

  const [data, total] = await Promise.all([
    prisma.fxRate.findMany({
      where,
      skip:    (p.page - 1) * p.pageSize,
      take:    p.pageSize,
      orderBy: [{ effectiveDate: "desc" }, { fromCurrency: "asc" }],
    }),
    prisma.fxRate.count({ where }),
  ]);

  return apiResponse({ data, total, page: p.page, pageSize: p.pageSize, totalPages: Math.ceil(total / p.pageSize) });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "currency", "create");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const body   = await req.json();
  const parsed = FxRateSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  const effectiveDate = new Date(parsed.data.effectiveDate);

  // Check for existing rate on same day (upsert semantics)
  const existing = await prisma.fxRate.findUnique({
    where: {
      tenantId_fromCurrency_toCurrency_effectiveDate: {
        tenantId:     auth.tid,
        fromCurrency: parsed.data.fromCurrency,
        toCurrency:   parsed.data.toCurrency,
        effectiveDate,
      },
    },
  });

  if (existing) return apiError("FX rate for this pair and date already exists. Use PUT to update.", 409);

  const record = await prisma.fxRate.create({
    data: {
      tenantId:      auth.tid,
      fromCurrency:  parsed.data.fromCurrency,
      toCurrency:    parsed.data.toCurrency,
      rate:          parsed.data.rate,
      effectiveDate,
      source:        parsed.data.source,
      isActive:      parsed.data.isActive,
    },
  });

  await writeAuditLog({
    tenantId:  auth.tid,
    tableName: "fx_rates",
    recordId:  record.id,
    action:    "CREATE",
    newValue:  record as unknown as Record<string, unknown>,
    userId:    auth.sub,
    userName:  auth.name,
    userEmail: auth.email,
    userRole:  auth.role,
  });

  return apiResponse(record, 201);
}

// Bulk upsert endpoint: POST /api/metadata/fx-rates with { bulk: true, rates: [...] }
export async function PATCH(req: NextRequest) {
  const authResult = await requireAuthAndPermission(req, "currency", "create");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const body = await req.json();
  const BulkSchema = z.object({
    rates: z.array(FxRateSchema).min(1).max(500),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  });

  const parsed = BulkSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  const effectiveDate = new Date(parsed.data.effectiveDate);
  let upserted = 0;

  for (const rate of parsed.data.rates) {
    await prisma.fxRate.upsert({
      where: {
        tenantId_fromCurrency_toCurrency_effectiveDate: {
          tenantId:     auth.tid,
          fromCurrency: rate.fromCurrency,
          toCurrency:   rate.toCurrency,
          effectiveDate,
        },
      },
      update: { rate: rate.rate, source: rate.source, isActive: rate.isActive },
      create: {
        tenantId:     auth.tid,
        fromCurrency: rate.fromCurrency,
        toCurrency:   rate.toCurrency,
        rate:         rate.rate,
        effectiveDate,
        source:       rate.source,
        isActive:     rate.isActive,
      },
    });
    upserted++;
  }

  return apiResponse({ upserted, effectiveDate: parsed.data.effectiveDate });
}
