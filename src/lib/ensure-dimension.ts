// Auto-provision Dimension rows for a tenant on first access. Lets the v2
// API "just work" out of the box — no manual seed step required.
//
// When the v2 routes look up Dimension(tenantId, kind) and find nothing,
// they call ensureDimension() to create it with sensible defaults. The 5
// always-on dims + ICP get auto-created; UD1-UD8 are auto-created too but
// flagged isCustom=true so the UI knows they're rename-able.

import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { Dimension, DimensionKind } from "@prisma/client";

const DEFAULT_LABELS: Record<string, string> = {
  ACCOUNT:  "Account",
  ENTITY:   "Entity",
  SCENARIO: "Scenario",
  TIME:     "Time Period",
  CURRENCY: "Currency",
  ICP:      "Intercompany Partner",
  ORIGIN:   "Origin",
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
 * passwordHash MUST be a real bcrypt hash of the demo password — once the
 * User row is persisted, the login route's DB-first branch will find it
 * and bcrypt-compare on subsequent logins. Storing a placeholder bricks
 * future logins (regression caught in QA's library-ui run: every non-admin
 * demo login returned 401 because bcrypt-compare against the placeholder
 * failed). Caller must pass the actual plaintext password so we can hash it.
 */
export async function ensureUser(args: {
  id:       string;
  tenantId: string;
  email:    string;
  name:     string;
  role:     string;  // UserRole enum value; passed as string to avoid coupling here
  password: string;  // plaintext; bcrypted before insert
}): Promise<void> {
  await ensureTenant(args.tenantId); // parent FK
  const passwordHash = await bcrypt.hash(args.password, 10);
  await prisma.user.upsert({
    where: { id: args.id },
    update: {
      // Refresh display fields + hash so legacy placeholder rows recover
      email:        args.email,
      name:         args.name,
      role:         args.role as any,
      passwordHash,
    },
    create: {
      id:           args.id,
      tenantId:     args.tenantId,
      email:        args.email,
      name:         args.name,
      role:         args.role as any,
      passwordHash,
      isActive:     true,
    },
  });
}
