// Stub for legacy /api/metadata/* CRUD routes that referenced Prisma models
// dropped in the v2 schema rewrite (Account, Entity, Department, Currency,
// CostCenter, ICP, Scenario, Project, DimensionDefinition, TimePoint, ImportJob).
//
// Rather than migrate every legacy route one-by-one (they are functional
// duplicates of /api/v2/members/[dimension]), each is reduced to a thin
// re-export of `deprecatedRoute(dim)`. That gives callers a clear 410 with
// a pointer to the new endpoint, instead of a silent 500.
//
// When the UI has been migrated to /api/v2/* everywhere, these route files
// can be deleted outright.

import { NextResponse } from "next/server";

export function deprecatedRoute(replacement: string) {
  const handler = () =>
    NextResponse.json(
      {
        success: false,
        error: "Endpoint deprecated in v2 schema migration",
        replacement,
        hint: `Use ${replacement} instead. Legacy pre-v2 CRUD endpoints have been retired — all dimension members now go through the generic /api/v2/members/[dimension] route.`,
      },
      { status: 410 },
    );
  return { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler };
}
