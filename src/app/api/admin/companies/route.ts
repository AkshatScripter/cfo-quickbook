import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoUsers, cfoQbCompanies, cfoQbConnections } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/admin/companies — all company users with QB connection status
// Primary table is cfo_users so existing companies without a cfo_qb_companies row still appear
export async function GET() {
  try {
    await requireRole("super_admin");

    const [companies, connections] = await Promise.all([
      db
        .select({
          id:          cfoUsers.id,
          // Company name: prefer cfo_qb_companies.companyName, fall back to cfo_users.name
          name:        cfoQbCompanies.companyName,
          userName:    cfoUsers.name,
          email:       cfoUsers.email,
          phone:       cfoQbCompanies.phone,
          industry:    cfoQbCompanies.industry,
          isActive:    cfoUsers.isActive,
          createdAt:   cfoUsers.createdAt,
        })
        .from(cfoUsers)
        .leftJoin(cfoQbCompanies, eq(cfoQbCompanies.userId, cfoUsers.id))
        .where(eq(cfoUsers.role, "company")),

      db.select().from(cfoQbConnections),
    ]);

    const connMap = new Map(connections.map(c => [c.userId, c]));

    const result = companies.map(c => {
      const conn = connMap.get(c.id);
      return {
        ...c,
        // Use companyName if set, otherwise fall back to the user's own name
        name:        c.name ?? c.userName ?? null,
        qbConnected: conn?.isActive ?? false,
        realmId:     conn?.realmId ?? null,
        lastSync:    conn?.lastSyncAt ?? null,
        syncError:   conn?.syncError ?? null,
      };
    });

    return Response.json({ companies: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
