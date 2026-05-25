// GET  /api/v2/search/favourites           — user's saved favourites
// POST /api/v2/search/favourites           — body: { href, title, kind } — toggle on
// DELETE /api/v2/search/favourites?href=   — toggle off
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const rows = await (prisma as any).userPreference.findMany({
    where: { tenantId: auth.tid, userId: auth.sub, kind: "cmdk_favourite" },
    orderBy: { updatedAt: "desc" },
  });
  return apiResponse({ data: rows.map((r: any) => r.value) });
}

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const body = await req.json().catch(() => null);
  if (!body?.href) return apiError("href required", 400);
  await (prisma as any).userPreference.upsert({
    where: { tenantId_userId_kind_key: { tenantId: auth.tid, userId: auth.sub, kind: "cmdk_favourite", key: body.href }},
    update: { value: { href: body.href, title: body.title ?? body.href, kind: body.kind ?? "Page" }},
    create: { tenantId: auth.tid, userId: auth.sub, kind: "cmdk_favourite", key: body.href,
              value: { href: body.href, title: body.title ?? body.href, kind: body.kind ?? "Page" } },
  });
  return apiResponse({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const href = new URL(req.url).searchParams.get("href");
  if (!href) return apiError("href required", 400);
  await (prisma as any).userPreference.deleteMany({
    where: { tenantId: auth.tid, userId: auth.sub, kind: "cmdk_favourite", key: href },
  });
  return apiResponse({ ok: true });
}
