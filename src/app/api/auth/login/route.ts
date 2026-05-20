import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken, setAuthCookie } from "@/lib/auth";
import { LoginSchema } from "@/lib/validations";
import { apiResponse, apiError } from "@/lib/utils";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) return apiError("Invalid credentials format", 400);

    const { email, password } = parsed.data;
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase(), isActive: true },
      include: { tenant: { select: { id:true, name:true, isActive:true } } },
    });

    if (!user || !user.tenant.isActive) return apiError("Invalid email or password", 401);

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return apiError("Invalid email or password", 401);

    const token = await signToken({
      sub: user.id, tid: user.tenantId,
      email: user.email, name: user.name, role: user.role,
    });

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await writeAuditLog({
      tenantId: user.tenantId, tableName: "users", recordId: user.id,
      action: "LOGIN", userId: user.id, userName: user.name, userEmail: user.email,
      userRole: user.role, ipAddress: req.headers.get("x-forwarded-for") ?? "unknown",
    });

    const response = apiResponse({
      user: { id:user.id, email:user.email, name:user.name, role:user.role, tenantId:user.tenantId },
      tenant: user.tenant,
    });
    response.cookies.set(setAuthCookie(token));
    return response;
  } catch (err) {
    console.error("[Auth/Login]", err);
    return apiError("Internal server error", 500);
  }
}
