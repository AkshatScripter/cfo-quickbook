// QuickBooks OAuth 2.0 helpers — no external package, plain fetch

const QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

// Scopes needed for accounting data
const SCOPES = ["com.intuit.quickbooks.accounting"];

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.QUICKBOOKS_CLIENT_ID!,
    redirect_uri: process.env.QUICKBOOKS_REDIRECT_URI!,
    response_type: "code",
    scope: SCOPES.join(" "),
    state,
  });
  return `${QB_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<QBTokens> {
  const res = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basicAuth()}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.QUICKBOOKS_REDIRECT_URI!,
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`QB token exchange failed: ${body}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<QBTokens> {
  const res = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basicAuth()}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!res.ok) throw new Error("QB token refresh failed");
  return res.json();
}

function basicAuth(): string {
  return Buffer.from(
    `${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`
  ).toString("base64");
}

export interface QBTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number; // seconds
  x_refresh_token_expires_in: number; // seconds
}
