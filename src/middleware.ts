import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health", "/api/debug"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Check auth token
  const token = req.cookies.get("cfo_metadata_token")?.value
    ?? req.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const payload = await verifyToken(token);
  if (!payload) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Token invalid or expired" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Inject user context into headers for API routes
  const res = NextResponse.next();
  res.headers.set("x-user-id", payload.sub);
  res.headers.set("x-tenant-id", payload.tid);
  res.headers.set("x-user-role", payload.role);
  res.headers.set("x-user-email", payload.email);
  res.headers.set("x-user-name", payload.name);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
