import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { buildAuthUrl } from "@/lib/quickbooks/oauth";
import crypto from "crypto";

// GET /api/quickbooks/connect — redirect Company or super_admin user to QB OAuth
export async function GET() {
  try {
    const user = await requireAuth();
    if (user.role !== "company" && user.role !== "super_admin") {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/login?error=Forbidden`
      );
    }

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
