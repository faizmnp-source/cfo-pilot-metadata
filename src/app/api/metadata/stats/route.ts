// /api/metadata/stats — dashboard counters.
//
// Migrated from the pre-v2 schema (which had per-dim Prisma tables like
// `prisma.account`, `prisma.entity` etc — all removed). Now everything
// lives on the generic `dimensionMember` table partitioned by `dimension.kind`,
// so a single groupBy gets us all the counts in one round trip.
//
// Shape kept identical to what the existing /metadata Overview page expects
// (see src/app/metadata/page.tsx → interface Stats).

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return apiError("Unauthorized", 401);
  const tid = auth.tid;
  const since24h = new Date(Date.now() - 86400000);

  try {
    // One groupBy gets every dimension's active-member count.
    const grouped = await prisma.dimensionMember.groupBy({
      by: ["dimensionId"],
      where: { tenantId: tid, isActive: true },
      _count: { _all: true },
    });

    // Resolve dimensionId → kind so we can roll up per-kind totals.
    const dims = await prisma.dimension.findMany({
      where: { tenantId: tid },
      select: { id: true, kind: true, isEnabled: true, isCustom: true },
    });
    const dimById = new Map(dims.map((d) => [d.id, d]));

    const countByKind: Record<string, number> = {};
    for (const row of grouped) {
      const dim = dimById.get(row.dimensionId);
      if (!dim) continue;
      const k = String(dim.kind);
      countByKind[k] = (countByKind[k] ?? 0) + row._count._all;
    }

    // Enabled, custom (UDx) dimensions — count of configured slots, not members.
    const userDimensions = dims.filter(
      (d) => d.isCustom && d.isEnabled && String(d.kind).startsWith("UD"),
    ).length;

    const [recentChanges] = await Promise.all([
      prisma.auditLog.count({
        where: { tenantId: tid, createdAt: { gte: since24h } },
      }),
    ]);

    return apiResponse({
      accounts:       countByKind["ACCOUNT"]  ?? 0,
      entities:       countByKind["ENTITY"]   ?? 0,
      scenarios:      countByKind["SCENARIO"] ?? 0,
      timePoints:     countByKind["TIME"]     ?? 0,
      currencies:     countByKind["CURRENCY"] ?? 0,
      icps:           countByKind["ICP"]      ?? 0,
      // Departments / cost centers / projects no longer have dedicated kinds;
      // tenants model them via UD slots, so we surface 0 here. The UI hides
      // these cards when count is 0 and the corresponding feature flag is off.
      departments:    0,
      costCenters:    0,
      projects:       0,
      userDimensions,
      recentChanges,
      // Import jobs + validation errors are not modelled in the v2 schema yet
      // (Slice 2 brings them back). Return 0 so the UI renders cleanly.
      importJobs:        0,
      validationErrors:  0,
    });
  } catch (err) {
    console.error("[api/metadata/stats]", err);
    return apiError("Failed to compute stats", 500);
  }
}
