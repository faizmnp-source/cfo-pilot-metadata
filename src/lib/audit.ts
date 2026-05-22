// Legacy audit helper — superseded by src/lib/audit-v2.ts.
// Kept as a no-op shim so legacy import sites don't crash. The v2 schema
// dropped the DimensionType enum and renamed tableName → entityType, so
// the original implementation no longer typechecks. All new write paths
// should import { audit } from "@/lib/audit-v2" instead.

export type LegacyAuditPayload = Record<string, unknown>;

export async function writeAuditLog(_payload: LegacyAuditPayload): Promise<void> {
  // Intentional no-op. Legacy callers in soon-to-be-stubbed routes will
  // disappear naturally. If you find this being called from a NEW code
  // path, switch to audit-v2.audit() instead.
  if (process.env.NODE_ENV !== "production") {
    console.warn("[audit.ts] legacy writeAuditLog called — migrate to audit-v2.audit()");
  }
}

// Re-export the v2 helper so call sites that want either flavor can switch
// over with a one-line import change.
export { audit } from "./audit-v2";
