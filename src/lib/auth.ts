import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "fallback-dev-secret-min-32-chars-here"
);
const COOKIE_NAME = "cfo_metadata_token";

export interface JWTPayload {
  sub: string;       // userId
  tid: string;       // tenantId
  email: string;
  name: string;
  role: string;
  iat: number;
  exp: number;
}

export async function signToken(payload: Omit<JWTPayload, "iat" | "exp">): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function getAuthUser(req?: NextRequest): Promise<JWTPayload | null> {
  let token: string | undefined;
  if (req) {
    token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
      const auth = req.headers.get("authorization");
      if (auth?.startsWith("Bearer ")) token = auth.slice(7);
    }
  } else {
    token = (await cookies()).get(COOKIE_NAME)?.value;
  }
  if (!token) return null;
  return verifyToken(token);
}

export function setAuthCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24,
    path: "/",
  };
}
