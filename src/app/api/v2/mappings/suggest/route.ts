import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { score, type Candidate } from "@/lib/mapping/engine";

// POST /api/v2/mappings/suggest
// Body: { kind: "ACCOUNT"|"BANK_TXN"|"MEMBER"|"COLUMN", sourceKey: string, sourceSystem?: string, top?: number }
// Returns: ranked candidates with confidence scores.
export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const body = await req.json().catch(() => null);
  if (!body) return apiError("Invalid JSON", 400);
  const { kind, sourceKey, sourceSystem = null, top = 5 } = body;
  if (!kind || !sourceKey) return apiError("kind and sourceKey are required", 400);

  // 1. Look for exact-match historical rules (highest priority)
  const exact = await (prisma as any).mappingRule.findFirst({
    where: { tenantId: auth.tid, kind, sourceKey, sourceSystem, isActive: true },
    orderBy: { hitCount: "desc" },
  });
  if (exact) {
    return apiResponse({
      candidates: [{
        targetMemberId: exact.targetMemberId, targetField: exact.targetField,
        confidence: Math.min(100, 80 + Math.min(20, exact.hitCount)),
        reason: `Historical rule with ${exact.hitCount} prior hits`,
        source: "RULE",
      }] as Candidate[],
    });
  }

  // 2. For ACCOUNT/MEMBER kinds, score all candidate dim members
  let candidates: Candidate[] = [];
  if (kind === "ACCOUNT" || kind === "MEMBER") {
    const dimCode = kind === "ACCOUNT" ? "account" : null;
    const members = await prisma.dimensionMember.findMany({
      where: {
        tenantId: auth.tid, isActive: true,
        ...(dimCode ? { dimension: { code: dimCode }} : {}),
      },
      select: { id: true, memberCode: true, memberName: true },
      take: 1000,
    });

    // Frequency boost: any prior MappingLearning rows for similar keys
    const history = await (prisma as any).mappingLearning.findMany({
      where: { tenantId: auth.tid, kind },
      orderBy: { createdAt: "desc" }, take: 500,
    });
    const histByTarget = new Map<string, number>();
    for (const h of history) {
      if (!h.targetMemberId) continue;
      histByTarget.set(h.targetMemberId, (histByTarget.get(h.targetMemberId) ?? 0) + 1);
    }

    candidates = members
      .map(m => {
        const hits = histByTarget.get(m.id) ?? 0;
        const sc = score(sourceKey, { name: m.memberName, code: m.memberCode }, hits);
        return {
          targetMemberId: m.id,
          targetCode: m.memberCode, targetName: m.memberName,
          confidence: sc,
          reason: hits > 0 ? `${hits} prior pick(s) + name similarity` : "Name similarity",
          source: hits > 0 ? "FREQUENCY" : "SIMILARITY",
        } as Candidate;
      })
      .filter(c => c.confidence >= 20)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, top);
  } else if (kind === "BANK_TXN") {
    // Bank txns map to accounts. Same scoring but using account members.
    const members = await prisma.dimensionMember.findMany({
      where: { tenantId: auth.tid, isActive: true, dimension: { code: "account" }},
      select: { id: true, memberCode: true, memberName: true }, take: 1000,
    });
    candidates = members
      .map(m => ({
        targetMemberId: m.id, targetCode: m.memberCode, targetName: m.memberName,
        confidence: score(sourceKey, { name: m.memberName, code: m.memberCode }, 0),
        reason: "Bank narration similarity",
        source: "SIMILARITY",
      } as Candidate))
      .filter(c => c.confidence >= 25)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, top);
  } else if (kind === "COLUMN") {
    // COLUMN mapping: source column header → canonical field name
    const canonical = ["date","amount","narration","account","entity","scenario","currency","reference","debit","credit"];
    candidates = canonical
      .map(f => ({
        targetField: f, targetName: f, confidence: score(sourceKey, { name: f, code: f }, 0),
        reason: "Header similarity", source: "SIMILARITY",
      } as Candidate))
      .filter(c => c.confidence >= 30)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, top);
  }

  return apiResponse({ candidates });
}
