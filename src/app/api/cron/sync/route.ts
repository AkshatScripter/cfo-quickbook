import type { NextRequest } from "next/server";
import { db } from "@/db";
import { cfoQbConnections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { syncCompany } from "@/lib/quickbooks/sync";

// GET /api/cron/sync — run every 6 hours (call with X-Cron-Secret header)
// Set up in Vercel Cron or call from external scheduler
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all active QB connections
  const connections = await db
    .select()
    .from(cfoQbConnections)
    .where(eq(cfoQbConnections.isActive, true));

  const results: Array<{ realmId: string; status: string; error?: string }> = [];

  for (const conn of connections) {
    try {
      await syncCompany(conn.realmId, conn.userId);
      results.push({ realmId: conn.realmId, status: "ok" });
    } catch (err) {
      results.push({
        realmId: conn.realmId,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  return Response.json({ synced: results.length, results });
}
