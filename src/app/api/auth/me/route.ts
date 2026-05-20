import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return apiError("Unauthorized", 401);
  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: { id:true, email:true, name:true, role:true, tenantId:true, isActive:true, lastLoginAt:true },
  });
  if (!user || !user.isActive) return apiError("User not found", 404);
  return apiResponse(user);
}
