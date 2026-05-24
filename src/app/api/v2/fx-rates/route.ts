// FX rates CRUD.
//   GET    /api/v2/fx-rates?fromCcy=&periodCode=  → list
//   PUT    /api/v2/fx-rates                       → upsert one
//          body: { fromCcy, toCcy, periodCode, rateType, rate, source? }
//   DELETE /api/v2/fx-rates?id=                   → delete one
//
// Used by /process/fx-rates page and during consolidation.

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { audit } from "@/lib/audit-v2";

export async function GET(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;

  const url = new URL(req.url);
  const fromCcy    = url.searchParams.get("fromCcy");
  const periodCode = url.searchParams.get("periodCode");

  const where: any = { tenantId: auth.tid };
  if (fromCcy)    where.fromCcy = fromCcy;
  if (periodCode) where.periodCode = periodCode;

  const rates = await prisma.fxRate.findMany({
    where,
    orderBy: [{ periodCode: "asc" }, { fromCcy: "asc" }, { rateType: "asc" }],
    take: 500,
  });

  return apiResponse({
    data: rates.map(r => ({ ...r, rate: Number(r.rate) })),
    total: rates.length,
  });
}

const UpsertSchema = z.object({
  fromCcy:    z.string().length(3),
  toCcy:      z.string().length(3),
  periodCode: z.string().min(4),
  rateType:   z.enum(["CLOSING", "AVERAGE", "OPENING", "HISTORICAL"]),
  rate:       z.number().positive(),
  source:     z.string().optional().nullable(),
});

export async function PUT(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  if (auth.role !== "ADMIN" && auth.role !== "FINANCE_MANAGER") return apiError("Admin/FM required", 403);

  let body: any;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 422, { issues: parsed.error.issues });
  const i = parsed.data;

  const saved = await prisma.fxRate.upsert({
    where: { fx_rate_key: { tenantId: auth.tid, fromCcy: i.fromCcy, toCcy: i.toCcy, periodCode: i.periodCode, rateType: i.rateType } },
    update: { rate: i.rate, source: i.source ?? "manual", uploadedBy: auth.sub },
    create: { tenantId: auth.tid, fromCcy: i.fromCcy, toCcy: i.toCcy, periodCode: i.periodCode, rateType: i.rateType, rate: i.rate, source: i.source ?? "manual", uploadedBy: auth.sub },
  });

  try { await audit({ tenantId: auth.tid, userId: auth.sub, action: "BULK_UPDATE", entityType: "fx_rate", entityId: saved.id, after: { ...saved, rate: Number(saved.rate) }, metadata: { op: "fx_rate_upsert" } }); } catch {}

  return apiResponse({ ...saved, rate: Number(saved.rate) });
}

export async function DELETE(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  if (auth.role !== "ADMIN") return apiError("Admin required", 403);

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return apiError("id query param required", 400);

  const row = await prisma.fxRate.findFirst({ where: { tenantId: auth.tid, id } });
  if (!row) return apiError("Not found", 404);
  await prisma.fxRate.delete({ where: { id } });
  try { await audit({ tenantId: auth.tid, userId: auth.sub, action: "DELETE", entityType: "fx_rate", entityId: id }); } catch {}
  return apiResponse({ deleted: true });
}
