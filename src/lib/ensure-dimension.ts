// Auto-provision Dimension rows for a tenant on first access. Lets the v2
// API "just work" out of the box — no manual seed step required.
//
// When the v2 routes look up Dimension(tenantId, kind) and find nothing,
// they call ensureDimension() to create it with sensible defaults. The 5
// always-on dims + ICP get auto-created; UD1-UD8 are auto-created too but
// flagged isCustom=true so the UI knows they're rename-able.

import { prisma } from "./prisma";
import type { Dimension, DimensionKind } from "@prisma/client";

const DEFAULT_LABELS: Record<string, string> = {
  ACCOUNT:  "Account",
  ENTITY:   "Entity",
  SCENARIO: "Scenario",
  TIME:     "Time Period",
  CURRENCY: "Currency",
  ICP:      "Intercompany Partner",
  UD1: "User Dim 1", UD2: "User Dim 2", UD3: "User Dim 3", UD4: "User Dim 4",
  UD5: "User Dim 5", UD6: "User Dim 6", UD7: "User Dim 7", UD8: "User Dim 8",
};

export async function ensureDimension(
  tenantId: string,
  kind: DimensionKind,
): Promise<Dimension> {
  const existing = await prisma.dimension.findFirst({
    where: { tenantId, kind },
  });
  if (existing) return existing;

  // Defensive: make sure the parent Tenant row exists before we attempt to
  // create a Dimension that FK-references it. Demo logins (admin@demo.com
  // etc.) mint a JWT with tid="demo-tenant" but never seed the Tenant row,
  // so any first write would crash with a FK violation otherwise.
  await ensureTenant(tenantId);

  const kindStr = String(kind);
  return prisma.dimension.create({
    data: {
      tenantId,
      kind,
      code: kindStr.toLowerCase(),
      label: DEFAULT_LABELS[kindStr] ?? kindStr,
      isEnabled: true,
      isCustom: kindStr.startsWith("UD"),
    },
  });
}

/**
 * Idempotent Tenant upsert. Safe to call on every request — does nothing if
 * the row already exists. The slug is derived from the tenantId itself, which
 * guarantees uniqueness without requiring the caller to know the human name.
 */
export async function ensureTenant(tenantId: string): Promise<void> {
  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: {},
    create: {
      id: tenantId,
      name: tenantId === "demo-tenant" ? "CFO Pilot Demo" : tenantId,
      slug: tenantId,
      isActive: true,
    },
  });
}

/**
 * Idempotent User upsert. Demo logins mint a JWT with sub="demo-1" etc but
 * never seed the User row, so every audit() call FK-violated on userId and
 * the exception was swallowed inside the route's try/catch (audit trail
 * silently empty — caught by QA case AUD-001).
 *
 * Called from /api/auth/login's demo-fallback branch so by the time any v2
 * route runs `audit({ userId: auth.sub, ... })`, the User row already exists.
 *
 * passwordHash is a placeholder marker — demo users authenticate via the
 * hard-coded DEMO_USERS list in the login route, not via bcrypt comparison
 * against this column. If DATABASE_URL is configured AND a matching User
 * row exists with a real hash, login takes the DB path first and never
 * reaches the demo fallback.
 */
export async function ensureUser(args: {
  id:       string;
  tenantId: string;
  email:    string;
  name:     string;
  role:     string;  // UserRole enum value; passed as string to avoid coupling here
}): Promise<void> {
  await ensureTenant(args.tenantId); // parent FK
  await prisma.user.upsert({
    where: { id: args.id },
    update: {
      // Refresh display fields if the demo seed list changed
      email: args.email,
      name:  args.name,
      role:  args.role as any,
    },
    create: {
      id:           args.id,
      tenantId:     args.tenantId,
      email:        args.email,
      name:         args.name,
      role:         args.role as any,
      passwordHash: "$demo$placeholder$not-used-for-auth",
      isActive:     true,
    },
  });
}
