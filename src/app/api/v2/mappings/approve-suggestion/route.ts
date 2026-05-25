// POST /api/v2/mappings/approve-suggestion
// Body: { kind, sourceSystem?, sourceKey, targetMemberId?|targetField?, confidence? }
//
// Atomic: creates or bumps a MappingRule + logs a MappingLearning row in
// the same request. Used by the ingest wizard when a user confirms the
// suggested target for an unknown source key.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const body = await req.json().catch(() => null);
  if (!body?.kind || !body?.sourceKey || (!body?.targetMemberId && !body?.targetField)) {
    return apiError("kind + sourceKey + (targetMemberId or targetField) required", 400);
  }

  // Upsert MappingRule
  const existing = await (prisma as any).mappingRule.findFirst({
    where: { tenantId: auth.tid, kind: body.kind, sourceSystem: body.sourceSystem ?? null, sourceKey: body.sourceKey, targetMemberId: body.targetMemberId ?? null },
  });

  let rule;
  if (existing) {
    // Approval bumps confidence (clamped 0..100) and increments hitCount
    const newConf = Math.min(100, Math.max(existing.confidence, body.confidence ?? existing.confidence + 5));
    rule = await (prisma as any).mappingRule.update({
      where: { id: existing.id },
      data: {
        confidence: newConf, hitCount: { increment: 1 }, lastSeenAt: new Date(),
        approvedBy: auth.sub, approvedAt: new Date(),
        targetField: body.targetField ?? existing.targetField,
        isActive: true,
      },
    });
  } else {
    rule = await (prisma as any).mappingRule.create({
      data: {
        tenantId: auth.tid,
        kind: body.kind,
        sourceSystem: body.sourceSystem ?? null,
        sourceKey:    body.sourceKey,
        targetMemberId: body.targetMemberId ?? null,
        targetField:    body.targetField ?? null,
        confidence:   body.confidence ?? 85,
        authoredBy:   auth.sub,
        approvedBy:   auth.sub,
        approvedAt:   new Date(),
        hitCount:     1,
        lastSeenAt:   new Date(),
      },
    });
  }

  // Log learning row (always — used by the suggester for frequency boost)
  await (prisma as any).mappingLearning.create({
    data: {
      tenantId: auth.tid,
      kind: body.kind,
      sourceKey: body.sourceKey,
      targetMemberId: body.targetMemberId ?? null,
      targetField: body.targetField ?? null,
      userId: auth.sub,
    },
  });

  return apiResponse({ rule, wasExisting: !!existing }, existing ? 200 : 201);
}
