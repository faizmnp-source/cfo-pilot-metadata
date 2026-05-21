import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email") ?? "admin@cfopilot.com";
  try {
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase() },
      select: {
        id: true, email: true, name: true, role: true,
        isActive: true, tenantId: true,
        passwordHash: true,
        tenant: { select: { id: true, name: true, isActive: true } },
      },
    });
    if (!user) return NextResponse.json({ found: false, email });
    const { passwordHash, ...safe } = user;
    return NextResponse.json({ found: true, hashPrefix: passwordHash.substring(0, 20), ...safe });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
