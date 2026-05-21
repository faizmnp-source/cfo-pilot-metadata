// Tenant feature flags — replaces the localStorage flag store used by the
// Settings page in v1. Sidebar reads from here to render optional dims.
//
// URL shape:
//   GET /api/v2/tenant-features                  → all flags for tenant
//   PUT /api/v2/tenant-features                  → upsert one or many
//        body: { featureKey: 'intercompany_enabled', isEnabled: true }
//          or: { flags: { intercompany_enabled: true, department_enabled: false } }

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse as apiSuccess } from "@/lib/utils";
import { audit } from "@/lib/audit-v2";

// Single source of truth for the supported keys + their defaults. The UI
// reads this to render the toggle list; the API rejects unknown keys.
export const KNOWN_FEATURES = {
  multi_entity_enabled:        false,
  multi_currency_enabled:      false,
  intercompany_enabled:        false,
  alternate_hierarchy_enabled: true,
  department_enabled:          true,
  cost_center_enabled:         false,
  project_enabled:             false,
} as const;

export type FeatureKey = keyof typeof KNOWN_FEATURES;
const FEATURE_KEYS = Object.keys(KNOWN_FEATURES) as FeatureKey[];

const SingleUpdateSchema = z.object({
  featureKey: z.enum(FEATURE_KEYS as [FeatureKey, ...FeatureKey[]]),
  isEnabled:  z.boolean(),
});

const BulkUpdateSchema = z.object({
  flags: z.record(
    z.enum(FEATURE_KEYS as [FeatureKey, ...FeatureKey[]]),
    z.boolean(),
  ),
});

// ─── GET ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const rows = await prisma.tenantFeature.findMany({
    where: { tenantId: auth.tid },
  });
  const stored: Record<string, boolean> = {};
  for (const r of rows) stored[r.featureKey] = r.isEnabled;

  // Merge with defaults — keys not yet persisted return their default
  const flags: Record<FeatureKey, boolean> = { ...KNOWN_FEATURES };
  for (const k of FEATURE_KEYS) {
    if (k in stored) flags[k] = stored[k];
  }

  return apiSuccess({ flags, knownKeys: FEATURE_KEYS });
}

// ─── PUT (upsert one or many) ────────────────────────────────────

export async function PUT(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  // Accept either single or bulk shape
  const single = SingleUpdateSchema.safeParse(body);
  const bulk   = BulkUpdateSchema.safeParse(body);
  if (!single.success && !bulk.success) {
    return apiError("Validation failed", 422, {
      issues: { single: single.error?.issues, bulk: bulk.error?.issues },
    });
  }

  const updates: Array<{ key: FeatureKey; isEnabled: boolean }> = single.success
    ? [{ key: single.data.featureKey, isEnabled: single.data.isEnabled }]
    : Object.entries(bulk.data!.flags).map(([k, v]) => ({ key: k as FeatureKey, isEnabled: v }));

  const results: Array<{ key: string; isEnabled: boolean }> = [];
  for (const u of updates) {
    const upserted = await prisma.tenantFeature.upsert({
      where: {
        tenantId_featureKey: { tenantId: auth.tid, featureKey: u.key },
      },
      create: {
        tenantId: auth.tid,
        featureKey: u.key,
        isEnabled: u.isEnabled,
        enabledAt: u.isEnabled ? new Date() : null,
        enabledBy: u.isEnabled ? auth.sub : null,
      },
      update: {
        isEnabled: u.isEnabled,
        enabledAt: u.isEnabled ? new Date() : null,
        enabledBy: u.isEnabled ? auth.sub : null,
      },
    });
    results.push({ key: upserted.featureKey, isEnabled: upserted.isEnabled });

    try {
      await audit({
        tenantId: auth.tid,
        userId: auth.sub,
        action: u.isEnabled ? "ENABLE_FEATURE" : "DISABLE_FEATURE",
        entityType: "tenant_feature",
        entityId: upserted.id,
        after: upserted,
        metadata: { featureKey: u.key },
      });
    } catch { /* ignore */ }
  }

  return apiSuccess({ updated: results });
}
