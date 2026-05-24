import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";

// POST /api/v2/mappings/learn — log a chosen mapping for future suggestions.
export async function POST(req: NextRequest) {
  const a = await requireAuth(req);
  if (a instanceof Response) return a;
  const { auth } = a;
  const body = await req.json().catch(() => null);
  if (!body) return apiError("Invalid JSON", 400);
  const { kind, sourceKey, targetMemberId = null, targetField = null } = body;
  if (!kind || !sourceKey) return apiError("kind and sourceKey are required", 400);
  if (!targetMemberId && !targetField) return apiError("targetMemberId or targetField required", 400);

  const row = await (prisma as any).mappingLearning.create({
    data: { tenantId: auth.tid, kind, sourceKey, targetMemberId, targetField, userId: auth.sub },
  });
  return apiResponse(row, 201);
}
