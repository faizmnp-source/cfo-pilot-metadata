import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "cfo_metadata_token";

// Clear the auth cookie and 303-redirect to /login. 303 is important —
// it forces the browser to GET /login regardless of the verb used here,
// which makes the back button behave (you won't bounce back into the app
// because the cookie is gone).
function clearAndRedirect(req: NextRequest) {
  const url = new URL("/login", req.url);
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

// GET so the sidebar <Link href="/api/auth/logout"> actually triggers
// this route (browser navigations are GET, not POST).
export async function GET(req: NextRequest) {
  return clearAndRedirect(req);
}

// POST kept for any programmatic callers (form submits, fetch, etc).
export async function POST(req: NextRequest) {
  return clearAndRedirect(req);
}
