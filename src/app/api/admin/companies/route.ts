import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoUsers, cfoQbCompanies, cfoQbConnections } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/admin/companies — companies from cfo_qb_companies joined with auth + QB connection
export async function GET() {
  try {
    await requireRole("super_admin");

    const [companies, connections] = await Promise.all([
      db
        .select({
          id:          cfoQbCompanies.id,
          userId:      cfoQbCompanies.userId,
          companyName: cfoQbCompanies.companyName,
          email:       cfoQbCompanies.email,
          phone:       cfoQbCompanies.phone,
          industry:    cfoQbCompanies.industry,
          isActive:    cfoQbCompanies.isActive,
          createdAt:   cfoQbCompanies.createdAt,
          // Auth user fields
          userName:    cfoUsers.name,
          userEmail:   cfoUsers.email,
        })
        .from(cfoQbCompanies)
        .leftJoin(cfoUsers, eq(cfoUsers.id, cfoQbCompanies.userId)),

      db.select().from(cfoQbConnections),
    ]);

    const connMap = new Map(connections.map(c => [c.userId, c]));

    const result = companies.map(c => {
      const conn = connMap.get(c.userId);
      return {
        ...c,
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
