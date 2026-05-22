import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return apiError("Unauthorized", 401);

  // Look up the User row when it exists in the DB; demo sessions may not
  // have a User row at all (we removed the ensureUser side-effect after
  // it caused an auth regression). Fall back to the JWT claims for those.
  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: { id:true, email:true, name:true, role:true, tenantId:true, isActive:true, lastLoginAt:true },
  });

  // Always include the Tenant row (with its display name) so the sidebar
  // can show the app name without a second round-trip.
  const tenant = await prisma.tenant.findUnique({
    where: { id: auth.tid },
    select: { id:true, name:true, slug:true, isActive:true },
  });

  return apiResponse({
    id:        user?.id    ?? auth.sub,
    email:     user?.email ?? auth.email,
    name:      user?.name  ?? auth.name,
    role:      user?.role  ?? auth.role,
    tenantId:  user?.tenantId ?? auth.tid,
    isActive:  user?.isActive ?? true,
    lastLoginAt: user?.lastLoginAt ?? null,
    tenant,                                     // { id, name, slug, isActive } | null
  });
}
