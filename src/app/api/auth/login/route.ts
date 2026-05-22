import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken, setAuthCookie } from "@/lib/auth";
import { LoginSchema } from "@/lib/validations";
import { apiResponse, apiError } from "@/lib/utils";
import { writeAuditLog } from "@/lib/audit";
import { ensureUser } from "@/lib/ensure-dimension";

// Demo users for when DATABASE_URL is not configured
const DEMO_USERS = [
  { id: "demo-1", email: "admin@demo.com",   password: "admin123",   name: "Admin User",    role: "ADMIN",           tenantId: "demo-tenant" },
  { id: "demo-2", email: "manager@demo.com", password: "manager123", name: "Finance Manager", role: "FINANCE_MANAGER", tenantId: "demo-tenant" },
  { id: "demo-3", email: "user@demo.com",    password: "user123",    name: "Finance User",  role: "FINANCE_USER",    tenantId: "demo-tenant" },
  { id: "demo-4", email: "viewer@demo.com",  password: "viewer123",  name: "Viewer",        role: "VIEWER",          tenantId: "demo-tenant" },
];
const DEMO_TENANT = { id: "demo-tenant", name: "CFO Pilot Demo", isActive: true };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) return apiError("Invalid credentials format", 400);

    const { email, password } = parsed.data;

    // --- Try database first ---
    if (process.env.DATABASE_URL) {
      try {
        const user = await prisma.user.findFirst({
          where: { email: email.toLowerCase(), isActive: true },
          include: { tenant: { select: { id:true, name:true, isActive:true } } },
        });

        if (user && user.tenant.isActive) {
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
        }

        if (user && !user.tenant.isActive) return apiError("Invalid email or password", 401);
        // user not found — fall through to demo check
      } catch (dbErr) {
        console.warn("[Auth/Login] DB error, falling back to demo mode:", dbErr);
      }
    }

    // --- Demo fallback (no DB or user not in DB) ---
    const demo = DEMO_USERS.find((u) => u.email === email.toLowerCase());
    if (!demo || demo.password !== password) return apiError("Invalid email or password", 401);

    // Persist a User row for the demo identity so audit-logs FK can resolve.
    // Without this, every audit() call from v2 routes silently FK-violated on
    // users.id (caught by QA case AUD-001) and audit_logs stayed empty.
    // ensureUser also upserts the parent Tenant — safe to swallow errors
    // when DATABASE_URL is absent (truly DB-less demo mode).
    try {
      await ensureUser({
        id:       demo.id,
        tenantId: demo.tenantId,
        email:    demo.email,
        name:     demo.name,
        role:     demo.role,
      });
    } catch (e) {
      console.warn("[Auth/Login] ensureUser swallowed (likely no DB):", e instanceof Error ? e.message : e);
    }

    const token = await signToken({
      sub: demo.id, tid: demo.tenantId,
      email: demo.email, name: demo.name, role: demo.role,
    });

    const response = apiResponse({
      user: { id:demo.id, email:demo.email, name:demo.name, role:demo.role, tenantId:demo.tenantId },
      tenant: DEMO_TENANT,
      demo: true,
    });
    response.cookies.set(setAuthCookie(token));
    return response;
  } catch (err) {
    console.error("[Auth/Login]", err);
    return apiError("Internal server error", 500);
  }
}
