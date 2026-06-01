import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoUsers, cfoQbConnections } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/admin/companies — all company users with their QB connection status
export async function GET() {
  try {
    await requireRole("super_admin");

    const companies = await db
      .select({
        id: cfoUsers.id,
        email: cfoUsers.email,
        name: cfoUsers.name,
        isActive: cfoUsers.isActive,
        createdAt: cfoUsers.createdAt,
      })
      .from(cfoUsers)
      .where(eq(cfoUsers.role, "company"));

    // Attach QB connection info
    const connections = await db.select().from(cfoQbConnections);
    const connMap = new Map(connections.map((c) => [c.userId, c]));

    const result = companies.map((c) => {
      const conn = connMap.get(c.id);
      return {
        ...c,
        qbConnected: conn?.isActive ?? false,
        realmId: conn?.realmId ?? null,
        lastSync: conn?.lastSyncAt ?? null,
        syncError: conn?.syncError ?? null,
      };
    });

    return Response.json({ companies: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
