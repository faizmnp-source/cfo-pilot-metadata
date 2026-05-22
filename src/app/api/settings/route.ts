// Legacy route stub — see src/lib/legacy-deprecated.ts.
// Used prisma.tenantSettings which doesn't exist in the v2 schema.
// Tenant configuration is split across /api/v2/tenant-features
// (feature toggles) and the App Settings page UI (other prefs).
import { deprecatedRoute } from "@/lib/legacy-deprecated";
export const { GET, POST, PUT, PATCH, DELETE } = deprecatedRoute("/api/v2/tenant-features (toggles) + App Settings UI (other prefs)");
