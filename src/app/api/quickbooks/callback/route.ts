import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { exchangeCodeForTokens } from "@/lib/quickbooks/oauth";
import { db } from "@/db";
import { cfoQbTokens, cfoQbConnections, cfoActivityLogs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { syncCompany } from "@/lib/quickbooks/sync";
import { encryptToken } from "@/lib/quickbooks/tokens";
import { qbGetCompanyInfo } from "@/lib/quickbooks/client";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

// GET /api/quickbooks/callback — Intuit redirects here after OAuth approval
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const realmId = searchParams.get("realmId");
  const state = searchParams.get("state"); // "userId:randomHex"
  const errorParam = searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(`${APP_URL}/qb-connect?error=${errorParam}`);
  }

  if (!code || !realmId || !state) {
    return NextResponse.redirect(`${APP_URL}/qb-connect?error=missing_params`);
  }

  // Extract userId from state
  const userId = state.split(":")[0];
  if (!userId) {
    return NextResponse.redirect(`${APP_URL}/qb-connect?error=invalid_state`);
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Store / update QB tokens
    const existingTokens = await db
      .select({ id: cfoQbTokens.id })
      .from(cfoQbTokens)
      .where(and(eq(cfoQbTokens.userId, userId), eq(cfoQbTokens.realmId, realmId)))
      .limit(1);

    const encryptedAccess = encryptToken(tokens.access_token);
    const encryptedRefresh = encryptToken(tokens.refresh_token);

    if (existingTokens.length > 0) {
      await db
        .update(cfoQbTokens)
        .set({
          accessToken: encryptedAccess,
          refreshToken: encryptedRefresh,
          expiresAt,
          updatedAt: new Date(),
        })
        .where(and(eq(cfoQbTokens.userId, userId), eq(cfoQbTokens.realmId, realmId)));
    } else {
      await db.insert(cfoQbTokens).values({
        userId,
        realmId,
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        expiresAt,
      });
    }

    // Store / update QB connection
    const existingConn = await db
      .select({ id: cfoQbConnections.id })
      .from(cfoQbConnections)
      .where(eq(cfoQbConnections.realmId, realmId))
      .limit(1);

    if (existingConn.length > 0) {
      await db
        .update(cfoQbConnections)
        .set({ isActive: true, syncError: null, connectedAt: new Date() })
        .where(eq(cfoQbConnections.realmId, realmId));
    } else {
      await db.insert(cfoQbConnections).values({
        userId,
        realmId,
        isActive: true,
      });
    }

    await db.insert(cfoActivityLogs).values({
      userId,
      action: "qb_connected",
      status: "success",
      details: { realmId },
    });

    // Fetch company name from QB and persist it (best-effort, non-blocking)
    qbGetCompanyInfo(realmId, userId)
      .then((name) => {
        if (!name) return;
        return db
          .update(cfoQbConnections)
          .set({ companyName: name })
          .where(eq(cfoQbConnections.realmId, realmId));
      })
      .catch(console.error);

    // Trigger initial sync in the background (don't await — let it run async)
    syncCompany(realmId, userId).catch(console.error);

    return NextResponse.redirect(`${APP_URL}/dashboard?qb=connected`);
  } catch (err) {
    console.error("QB callback error:", err);
    return NextResponse.redirect(`${APP_URL}/qb-connect?error=callback_failed`);
  }
}
