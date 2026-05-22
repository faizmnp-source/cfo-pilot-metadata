// Audit helper for metadata v2 routes. Writes to the new AuditLog table shape
// (before/after JSON, entityType+entityId). The legacy lib/audit.ts uses a
// different signature aligned with the pre-v2 schema and is kept for the
// legacy routes until task #8 finishes migrating them.

import { prisma } from "./prisma";
import type { AuditAction } from "@prisma/client";

export interface AuditV2Params {
  tenantId:   string;
  userId?:    string;
  action:     AuditAction;
  entityType: string;          // e.g. 'dimension_member', 'hierarchy_edge'
  entityId?:  string;
  before?:    unknown;
  after?:     unknown;
  metadata?:  Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function audit(p: AuditV2Params): Promise<void> {
  try {
    // userId FKs to users.id; if the JWT carries an id that doesn't exist
    // in the DB (e.g. demo sessions with sub="demo-1"), the insert would
    // FK-violate and the catch below would swallow it silently — leaving
    // audit_logs empty. Pre-check and null-out the userId in that case so
    // the audit row still persists, just unattributed.
    let resolvedUserId = p.userId ?? null;
    if (resolvedUserId) {
      const userExists = await prisma.user.findUnique({
        where: { id: resolvedUserId },
        select: { id: true },
      });
      if (!userExists) resolvedUserId = null;
    }

    await prisma.auditLog.create({
      data: {
        tenantId:   p.tenantId,
        userId:     resolvedUserId,
        action:     p.action,
        entityType: p.entityType,
        entityId:   p.entityId ?? null,
        before:     p.before === undefined ? undefined : (p.before as any),
        after:      p.after  === undefined ? undefined : (p.after  as any),
        metadata:   { ...(p.metadata ?? {}), ...(resolvedUserId === null && p.userId ? { unresolved_user_id: p.userId } : {}) } as any,
        ipAddress:  p.ipAddress ?? null,
        userAgent:  p.userAgent ?? null,
      },
    });
  } catch (err) {
    // Audit must never block a write. Log to stderr and move on.
    // eslint-disable-next-line no-console
    console.error("[audit-v2] failed to write audit log:", err);
  }
}
