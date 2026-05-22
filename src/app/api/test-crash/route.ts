// /api/test-crash — intentional 5xx for tests that need to verify the
// server returns proper JSON errors rather than empty bodies. Used by
// XC-003 (5xx never empty) and AUD-004 (audit failure path).
//
// Same TEST_TOKEN gate as /api/test-reset. Default: throws after writing
// a JSON 500 body. ?mode=empty makes it throw BEFORE writing — simulates
// the original FK-violation behaviour we'd want to catch.

import { NextRequest, NextResponse } from "next/server";

const TEST_TOKEN = process.env.TEST_TOKEN;
const IS_PROD = process.env.NODE_ENV === "production"
             && process.env.VERCEL_ENV === "production";

export async function GET(req: NextRequest) {
  if (IS_PROD) {
    if (!TEST_TOKEN || req.headers.get("x-test-token") !== TEST_TOKEN) {
      return NextResponse.json(
        { success: false, error: "Endpoint not available" },
        { status: 410 },
      );
    }
  }

  const mode = new URL(req.url).searchParams.get("mode") ?? "json";

  if (mode === "empty") {
    // Throw without returning anything — Vercel will surface a generic 500
    // with empty body. This is the scenario we want our wrapper to catch.
    throw new Error("intentional crash: empty body 5xx");
  }

  // Default: return a structured 500 so callers can verify the contract
  // (success:false, error string).
  return NextResponse.json(
    { success: false, error: "intentional crash", mode },
    { status: 500 },
  );
}
