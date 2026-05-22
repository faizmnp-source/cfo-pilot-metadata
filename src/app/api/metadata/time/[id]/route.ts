// Legacy route stub — see src/lib/legacy-deprecated.ts.
// This file used to reference pre-v2 Prisma models (Account, Entity, etc)
// which were removed in the schema rewrite. Every call now returns 410.
import { deprecatedRoute } from "@/lib/legacy-deprecated";

export const { GET, POST, PUT, PATCH, DELETE } = deprecatedRoute("/api/v2/members/time/[id]");
