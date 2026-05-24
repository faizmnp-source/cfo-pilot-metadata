// POST /api/v2/auth/mcp-token
//
// Issues a long-lived (90-day) JWT scoped to the caller's tenant + user,
// for use by an MCP server connecting Claude desktop / Cowork / Claude Code
// to this CFO Pilot tenant.
//
// Admin-only. Returns the token in the response body — frontend shows it
// once and the admin pastes it into their MCP client config.
//
// The token has the same JWTPayload shape as the regular session cookie
// (sub/tid/email/name/role) PLUS a `kind: "mcp"` claim so we can rate-limit
// or revoke MCP tokens separately later.

import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { requireAuth } from "@/lib/api-helpers";
import { apiError, apiResponse } from "@/lib/utils";
import { audit } from "@/lib/audit-v2";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "fallback-dev-secret-min-32-chars-here"
);

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req);
  if (authResult instanceof Response) return authResult;
  const { auth } = authResult;

  if (auth.role !== "ADMIN") {
    return apiError("Admin role required to mint MCP tokens", 403);
  }

  const token = await new SignJWT({
    sub:   auth.sub,
    tid:   auth.tid,
    email: auth.email,
    name:  auth.name,
    role:  auth.role,
    kind:  "mcp",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(JWT_SECRET);

  try {
    await audit({
      tenantId:   auth.tid,
      userId:     auth.sub,
      action:     "CREATE",
      entityType: "mcp_token",
      entityId:   `mcp_${Date.now()}`,
      metadata:   { ttl: "90d" } as any,
    });
  } catch { /* never let audit fail token issue */ }

  return apiResponse({
    token,
    expiresInDays: 90,
    instructions: "Set this as CFO_PILOT_TOKEN env var in your MCP client config. See https://github.com/.../cfo-pilot-mcp for install steps.",
  });
}
