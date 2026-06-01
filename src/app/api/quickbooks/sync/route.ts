import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoQbConnections } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { syncCompany } from "@/lib/quickbooks/sync";

// POST /api/quickbooks/sync — manually trigger a sync for the logged-in Company user
export async function POST(request: NextRequest) {
  try {
    const user = await requireRole("company");

    const [conn] = await db
      .select()
      .from(cfoQbConnections)
      .where(
        and(
          eq(cfoQbConnections.userId, user.id),
          eq(cfoQbConnections.isActive, true)
        )
      )
      .limit(1);

    if (!conn) {
      return Response.json({ error: "QuickBooks not connected" }, { status: 400 });
    }

    const results = await syncCompany(conn.realmId, user.id);
    return Response.json({ ok: true, synced: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sync failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
