// GET  /api/v2/search/recents          — last 20 opened items for the user
// POST /api/v2/search/recents          — body: { href, title, kind } — log an open
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const rows = await (prisma as any).userPreference.findMany({
    where: { tenantId: auth.tid, userId: auth.sub, kind: "cmdk_recent" },
    orderBy: { updatedAt: "desc" }, take: 20,
  });
  return apiResponse({ data: rows.map((r: any) => ({ ...r.value, openedAt: r.updatedAt })) });
}

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const body = await req.json().catch(() => null);
  if (!body?.href) return apiError("href required", 400);

  await (prisma as any).userPreference.upsert({
    where: { tenantId_userId_kind_key: { tenantId: auth.tid, userId: auth.sub, kind: "cmdk_recent", key: body.href }},
    update: { value: { href: body.href, title: body.title ?? body.href, kind: body.kind ?? "Page" }, updatedAt: new Date() },
    create: { tenantId: auth.tid, userId: auth.sub, kind: "cmdk_recent", key: body.href,
              value: { href: body.href, title: body.title ?? body.href, kind: body.kind ?? "Page" } },
  });
  return apiResponse({ ok: true });
}
