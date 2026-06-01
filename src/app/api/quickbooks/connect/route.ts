import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { buildAuthUrl } from "@/lib/quickbooks/oauth";
import crypto from "crypto";

// GET /api/quickbooks/connect — redirect Company user to QB OAuth
export async function GET() {
  try {
    const user = await requireRole("company");

    const state = `${user.id}:${crypto.randomBytes(16).toString("hex")}`;
    const authUrl = buildAuthUrl(state);
    return NextResponse.redirect(authUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/login?error=${encodeURIComponent(msg)}`
    );
  }
}
