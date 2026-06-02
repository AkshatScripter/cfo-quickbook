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

// ─── Public API ───────────────────────────────────────────────────────────────

// Run a QBO Query Language statement and return the raw response.
// Handles token expiry + automatic refresh.
export async function qbQuery(
  realmId: string,
  userId: string,
  query: string
): Promise<Record<string, unknown>> {
  return qbGet(
    realmId,
    userId,
    `query?query=${encodeURIComponent(query)}&minorversion=${MINOR_VERSION}`
  );
}

// Fetch incremental changes since changedSince via the CDC endpoint.
// Look-back window is capped at 30 days by QBO; callers must fall back to a
// full sync when changedSince is older than that.
export async function qbCdc(
  realmId: string,
  userId: string,
  entities: QBEntity[],
  changedSince: Date
): Promise<QBCDCResponse> {
  const params = new URLSearchParams({
    entities: entities.join(","),
    changedSince: changedSince.toISOString(),
    minorversion: String(MINOR_VERSION),
  });
  return qbGet(realmId, userId, `cdc?${params}`) as Promise<QBCDCResponse>;
}

// Extract one entity's changed rows from a CDC response.
export function cdcRows<T>(cdc: QBCDCResponse, entity: QBEntity): T[] {
  const queryResponses = cdc.CDCResponse?.[0]?.QueryResponse ?? [];
  for (const qr of queryResponses) {
    if (entity in qr) return (qr[entity] as T[]) ?? [];
  }
  return [];
}

// ─── Core HTTP ───────────────────────────────────────────────────────────────

// Authenticated GET to any path under /v3/company/{realmId}/.
// Transparently refreshes the access token once on 401.
async function qbGet(
  realmId: string,
  userId: string,
  path: string
): Promise<Record<string, unknown>> {
  const token = await getValidToken(realmId, userId);
  const url = `${QB_BASE}/${realmId}/${path}`;

  const res = await fetchWithToken(url, token);
  if (res.status === 401) {
    const refreshed = await forceRefreshToken(realmId, userId);
    const retried = await fetchWithToken(url, refreshed);
    if (!retried.ok) throw new Error(`QB API error ${retried.status}: ${await retried.text()}`);
    return retried.json();
  }
  if (!res.ok) throw new Error(`QB API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function fetchWithToken(url: string, accessToken: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
}

// ─── Token management ────────────────────────────────────────────────────────

// Return a valid access token, refreshing if it expires within 10 minutes.
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

// ─── Types ───────────────────────────────────────────────────────────────────

export type QBEntity = "Invoice" | "Payment" | "Purchase" | "Account" | "Customer";

export interface QBCDCResponse {
  CDCResponse?: Array<{
    // Each entry in QueryResponse corresponds to one entity type
    QueryResponse?: Array<Record<string, unknown>>;
  }>;
  time?: string;
}
