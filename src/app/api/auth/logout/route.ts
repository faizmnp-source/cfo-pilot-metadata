import { NextResponse } from "next/server";
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set("cfo_metadata_token", "", { maxAge: 0 });
  return res;
}
