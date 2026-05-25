// POST /api/v2/mappings/seed-demo
// Drops 6 sample MappingRules + a few MappingLearning rows so /mapping
// has something visible on first open. Idempotent — skips if rules already
// exist for this tenant. Safe to call repeatedly.
//
// Useful in the dev preview when no real imports have run yet.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiResponse } from "@/lib/utils";

const SAMPLE_RULES = [
  { kind: "ACCOUNT",   sourceSystem: "tally",    sourceKey: "Salaries & Wages",     targetMemberCode: "6100", confidence: 95, approve: true,  hits: 14 },
  { kind: "ACCOUNT",   sourceSystem: "excel",    sourceKey: "Drug Procurement",     targetMemberCode: "5100", confidence: 92, approve: true,  hits: 9  },
  { kind: "ACCOUNT",   sourceSystem: "tally",    sourceKey: "Electricity Charges",  targetMemberCode: "6300", confidence: 88, approve: true,  hits: 6  },
  { kind: "BANK_TXN",  sourceSystem: "pdf-bank", sourceKey: "NEFT-APOLLO-PHARMACY", targetMemberCode: "5100", confidence: 78, approve: false, hits: 3  },
  { kind: "COLUMN",    sourceSystem: "excel",    sourceKey: "Bill Amt",             targetField: "amount",    confidence: 81, approve: true,  hits: 5  },
  { kind: "COLUMN",    sourceSystem: "excel",    sourceKey: "Txn Date",             targetField: "date",      confidence: 90, approve: true,  hits: 8  },
];

export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;

  // Skip if any mapping rules already exist for this tenant
  const existing = await (prisma as any).mappingRule.count({ where: { tenantId: auth.tid }});
  if (existing > 0) {
    return apiResponse({ skipped: true, existingCount: existing, message: "Mapping rules already exist for this tenant" });
  }

  // Resolve memberCode → memberId for the ACCOUNT/BANK_TXN rules
  const codes = Array.from(new Set(SAMPLE_RULES.map(r => r.targetMemberCode).filter(Boolean) as string[]));
  const members = await prisma.dimensionMember.findMany({
    where: { tenantId: auth.tid, memberCode: { in: codes }, dimension: { code: "account" }},
    select: { id: true, memberCode: true },
  });
  const idByCode = new Map(members.map(m => [m.memberCode, m.id]));

  let created = 0;
  for (const r of SAMPLE_RULES) {
    const targetMemberId = r.targetMemberCode ? idByCode.get(r.targetMemberCode) ?? null : null;
    // Skip ACCOUNT/BANK rules if the account doesn't exist in this tenant
    if ((r.kind === "ACCOUNT" || r.kind === "BANK_TXN") && !targetMemberId) continue;
    await (prisma as any).mappingRule.create({
      data: {
        tenantId: auth.tid, kind: r.kind, sourceSystem: r.sourceSystem,
        sourceKey: r.sourceKey, targetMemberId, targetField: r.targetField ?? null,
        confidence: r.confidence, authoredBy: r.approve ? "ai" : "ai",
        approvedBy: r.approve ? auth.sub : null,
        approvedAt: r.approve ? new Date() : null,
        hitCount: r.hits,
      },
    });
    created++;
  }

  return apiResponse({ created, skipped: false });
}
