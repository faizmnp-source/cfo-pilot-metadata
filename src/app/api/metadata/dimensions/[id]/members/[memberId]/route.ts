// Legacy route stub — see src/lib/legacy-deprecated.ts.
// Used DimensionMember.parentId / parent / children which were dropped
// in the v2 schema rewrite (hierarchy now lives in hierarchy_edges).
import { deprecatedRoute } from "@/lib/legacy-deprecated";
export const { GET, POST, PUT, PATCH, DELETE } = deprecatedRoute("/api/v2/members/[dimension]/[id] + /api/v2/hierarchy/[dimension]");
