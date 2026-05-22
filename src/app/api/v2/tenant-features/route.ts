// Tenant feature flags — replaces the localStorage flag store used by the
// Settings page in v1. Sidebar reads from here to render optional dims.
//
// URL shape:
//   GET   /api/v2/tenant-features                → all flags for tenant
//   PUT   /api/v2/tenant-features                → upsert one or many (canonical)
//   PATCH /api/v2/tenant-features                → alias of PUT (callers expect it)
//        body: { featureKey: 'intercompany_enabled', isEnabled: true }   ← single
//          or: { flags: { intercompany_enabled: true, ... } }            ← bulk by key
//          or: { intercompany_enabled: true, ... }                       ← bulk flat
//
// The flat-bulk shape was added because real callers (and QA's test suite)
// PATCH with `{ intercompany_enabled: true }` rather than wrapping in `flags:`.
// Now accepted in addition to the older single/bulk shapes.

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse as apiSuccess } from "@/lib/utils";
import { audit } from "@/lib/audit-v2";

// Single source of truth for the supported keys + their defaults. The UI
// reads this via the GET response (flags + knownKeys); the API rejects
// unknown keys. NOT exported from this file: Next.js App Router rejects
// any export from route.ts that isn't an HTTP verb or one of its config
// symbols (runtime, dynamic, revalidate, etc). If another module needs
// this list, factor it into src/lib/tenant-features-config.ts.
const KNOWN_FEATURES = {
  multi_entity_enabled:        false,
  multi_currency_enabled:      false,
  intercompany_enabled:        false,
  alternate_hierarchy_enabled: true,
  // department_enabled / cost_center_enabled / project_enabled dropped
  // per EPM-architect call: any tenant that wants those configures a UD
  // slot (UD1=Department etc.) via Configure Dimensions. No special-case
  // flags. Saves ~150 lines of code + 4 toggle paths.
} as const;

type FeatureKey = keyof typeof KNOWN_FEATURES;
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

// Flat shape: { intercompany_enabled: true, department_enabled: false }
// Accepts any subset of KNOWN_FEATURES at the top level.
const FlatBulkSchema = z.object(
  Object.fromEntries(FEATURE_KEYS.map((k) => [k, z.boolean().optional()])) as any
).refine(
  (obj) => Object.keys(obj).some((k) => (FEATURE_KEYS as readonly string[]).includes(k)),
  "At least one known feature key must be present",
);

// ─── GET ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  const rows = await prisma.tenantFeature.findMany({
    where: { tenantId: auth.tid },
  });
  const stored: Record<string, boolean> = {};
  // Filter out keys that have been REMOVED from KNOWN_FEATURES (dept/cc/project)
  // so legacy DB rows don't keep surfacing flags that have no UI or behavior.
  const allowed = new Set(FEATURE_KEYS as readonly string[]);
  for (const r of rows) {
    if (allowed.has(r.featureKey)) stored[r.featureKey] = r.isEnabled;
  }

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

  // Admin-only. Caught by QA case FEAT-004 / PERM-002: previously any
  // authenticated user could toggle features. Tenant features control
  // which dims are active / whether intercompany consolidation runs —
  // a compliance + correctness risk, not just a permission nit.
  if (auth.role !== "ADMIN") {
    return apiError("Admin role required to change tenant features", 403);
  }

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  // Accept single, bulk (flags-wrapped), or flat-bulk shape
  const single = SingleUpdateSchema.safeParse(body);
  const bulk   = BulkUpdateSchema.safeParse(body);
  const flat   = FlatBulkSchema.safeParse(body);
  if (!single.success && !bulk.success && !flat.success) {
    return apiError("Validation failed", 422, {
      issues: {
        single: single.error?.issues,
        bulk:   bulk.error?.issues,
        flat:   flat.error?.issues,
      },
    });
  }

  let updates: Array<{ key: FeatureKey; isEnabled: boolean }>;
  if (single.success) {
    updates = [{ key: single.data.featureKey, isEnabled: single.data.isEnabled }];
  } else if (bulk.success) {
    updates = Object.entries(bulk.data!.flags).map(([k, v]) => ({ key: k as FeatureKey, isEnabled: v }));
  } else {
    // flat-bulk: only keep keys that match a known feature
    updates = Object.entries(flat.data!)
      .filter(([k, v]) => typeof v === "boolean" && (FEATURE_KEYS as readonly string[]).includes(k))
      .map(([k, v]) => ({ key: k as FeatureKey, isEnabled: v as boolean }));
  }

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

    // ── Sync the corresponding Dimension row's isEnabled flag ───────────
    // The v2/members/[dimension] route gates reads on Dimension.isEnabled.
    // Without this sync, toggling a tenant feature silently no-ops the gate.
    // Only ICP currently has a 1:1 mapping; UD slots have their own
    // per-Dimension toggle via the Library UI.
    const FEATURE_TO_DIM_KIND: Partial<Record<FeatureKey, string>> = {
      intercompany_enabled: "ICP",
    };
    const linkedKind = FEATURE_TO_DIM_KIND[u.key];
    if (linkedKind) {
      try {
        await prisma.dimension.updateMany({
          where: { tenantId: auth.tid, kind: linkedKind as any },
          data:  { isEnabled: u.isEnabled },
        });
      } catch { /* never let dim-sync fail the feature toggle */ }
    }

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

  // Return the full current flag set so callers don't need a second GET.
  const allRows = await prisma.tenantFeature.findMany({ where: { tenantId: auth.tid } });
  const flags: Record<FeatureKey, boolean> = { ...KNOWN_FEATURES };
  for (const r of allRows) flags[r.featureKey as FeatureKey] = r.isEnabled;

  return apiSuccess({ updated: results, flags });
}

// PATCH is just an alias for PUT — same semantics. Added because real callers
// (and QA's test suite) reach for PATCH for partial updates. Avoids 405 noise.
export const PATCH = PUT;
