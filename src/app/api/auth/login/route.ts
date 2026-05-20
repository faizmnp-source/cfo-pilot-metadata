import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken, setAuthCookie } from "@/lib/auth";
import { LoginSchema } from "@/lib/validations";
import { apiResponse, apiError } from "@/lib/utils";
import { writeAuditLog } from "@/lib/audit";

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
            sub: user.id