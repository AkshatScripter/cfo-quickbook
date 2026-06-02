import { db } from "@/db";
import { cfoQbTokens, cfoQbConnections } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { refreshAccessToken } from "./oauth";

// QBO Accounting API minor version. Versions 1–74 were deprecated Aug 1, 2025;
// requests below 75 are ignored and served as 75.
const MINOR_VERSION = 75;

// Defaults to sandbox for safety. Production must set QUICKBOOKS_API_BASE to
// https://quickbooks.api.intuit.com
const QB_BASE = `${process.env.QUICKBOOKS_API_BASE ?? "https://sandbox-quickbooks.api.intuit.com"}/v3/company`;

// Run a QB Query Language query and return the raw response.
// Handles token expiry + automatic refresh automatically.
export async function qbQuery(
  realmId: string,
  userId: string,
  query: string
): Promise<Record<string, unknown>> {
  const token = await getValidToken(realmId, userId);
  return callApi(realmId, token, query, async () => {
    const refreshed = await forceRefreshToken(realmId, userId);
    return callApi(realmId, refreshed, query);
  });
}

async function callApi(
  realmId: string,
  accessToken: string,
  query: string,
  onUnauthorized?: () => Promise<Record<string, unknown>>
): Promise<Record<string, unknown>> {
  const url = `${QB_BASE}/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=${MINOR_VERSION}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (res.status === 401 && onUnauthorized) return onUnauthorized();
  if (!res.ok) throw new Error(`QB API error ${res.status}: ${await res.text()}`);
  return res.json();
}

// Return a valid access token, refreshing if it expires within 10 minutes
async function getValidToken(realmId: string, userId: string): Promise<string> {
  const [token] = await db
    .select()
    .from(cfoQbTokens)
    .where(and(eq(cfoQbTokens.realmId, realmId), eq(cfoQbTokens.userId, userId)))
    .limit(1);

  if (!token) throw new Error("QB token not found — please reconnect QuickBooks");

  const tenMinutes = 10 * 60 * 1000;
  if (new Date(token.expiresAt).getTime() - Date.now() < tenMinutes) {
    return forceRefreshToken(realmId, userId);
  }

  return token.accessToken;
}

async function forceRefreshToken(realmId: string, userId: string): Promise<string> {
  const [token] = await db
    .select()
    .from(cfoQbTokens)
    .where(and(eq(cfoQbTokens.realmId, realmId), eq(cfoQbTokens.userId, userId)))
    .limit(1);

  if (!token) throw new Error("QB token not found for refresh");

  try {
    const fresh = await refreshAccessToken(token.refreshToken);
    const expiresAt = new Date(Date.now() + fresh.expires_in * 1000);

    await db
      .update(cfoQbTokens)
      .set({ accessToken: fresh.access_token, refreshToken: fresh.refresh_token, expiresAt, updatedAt: new Date() })
      .where(and(eq(cfoQbTokens.realmId, realmId), eq(cfoQbTokens.userId, userId)));

    return fresh.access_token;
  } catch {
    // Mark connection as broken so the UI can prompt reconnect
    await db
      .update(cfoQbConnections)
      .set({ isActive: false, syncError: "Token refresh failed — please reconnect QuickBooks" })
      .where(eq(cfoQbConnections.realmId, realmId));

    throw new Error("QB token refresh failed — please reconnect QuickBooks");
  }
}
