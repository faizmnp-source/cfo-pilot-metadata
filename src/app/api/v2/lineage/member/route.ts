import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;

  const url = new URL(req.url);
  let memberId = url.searchParams.get("memberId");

  if (!memberId) {
    const dimensionCode = url.searchParams.get("dimensionCode");
    const memberCode    = url.searchParams.get("memberCode");
    if (!dimensionCode || !memberCode) return apiError("Either memberId, or (dimensionCode + memberCode) is required", 400);
    const m = await prisma.dimensionMember.findFirst({
      where: { tenantId: auth.tid, memberCode, dimension: { code: dimensionCode }},
      select: { id: true },
    });
    if (!m) return apiError("Member not found", 404);
    memberId = m.id;
  }

  const member = await prisma.dimensionMember.findFirst({
    where: { id: memberId, tenantId: auth.tid },
    include: { dimension: { select: { id: true, code: true, label: true, kind: true }}},
  }) as any;
  if (!member) return apiError("Member not found in this tenant", 404);

  const audits = await prisma.auditLog.findMany({
    where: { tenantId: auth.tid, entityType: "dimension_member", entityId: memberId },
    orderBy: { createdAt: "desc" }, take: 200,
  });

  const userIds = Array.from(new Set(audits.map(a => a.userId).filter(Boolean) as string[]));
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds }}, select: { id: true, email: true, name: true }}) : [];

  return apiResponse({
    member: { id: member.id, code: member.memberCode, name: member.memberName, dimension: member.dimension, isActive: member.isActive, createdAt: member.createdAt, updatedAt: member.updatedAt },
    audits, users,
    summary: { total: audits.length, firstChangeAt: audits[audits.length - 1]?.createdAt ?? null, lastChangeAt: audits[0]?.createdAt ?? null },
  });
}
