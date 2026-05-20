import { NextRequest } from "next/server";
import { getAuthUser, JWTPayload } from "./auth";
import { apiError } from "./utils";
import { can, Role, Resource, Action } from "./permissions";

export async function requireAuth(req: NextRequest): Promise<{ auth: JWTPayload } | Response> {
  const auth = await getAuthUser(req);
  if (!auth) return apiError("Unauthorized", 401) as unknown as Response;
  return { auth };
}

export async function requireAuthAndPermission(
  req: NextRequest, resource: Resource, action: Action
): Promise<{ auth: JWTPayload } | Response> {
  const result = await requireAuth(req);
  if (result instanceof Response || "success" in (result as Record<string, unknown>)) return result;
  const { auth } = result as { auth: JWTPayload };
  if (!can(auth.role as Role, resource, action)) return apiError("Forbidden", 403) as unknown as Response;
  return { auth };
}

export function getPaginationParams(params: URLSearchParams) {
  return {
    page: Math.max(1, parseInt(params.get("page") ?? "1")),
    pageSize: Math.min(500, Math.max(1, parseInt(params.get("pageSize") ?? "50"))),
    search: params.get("search") ?? undefined,
    isActive: params.get("isActive") === "false" ? false : params.get("isActive") === "all" ? undefined : true,
    sortBy: params.get("sortBy") ?? "createdAt",
    sortOrder: (params.get("sortOrder") ?? "desc") as "asc" | "desc",
  };
}
