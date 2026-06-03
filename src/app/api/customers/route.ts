import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoUsers, cfoQbCustomers, cfoQbConnections } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

// GET /api/customers — all customers from cfo_qb_customers for this company:
// - QB-synced customers (realmId matches this company's QB connection)
// - Portal customers (userId links to a cfo_users row with companyId = this company)
export async function GET() {
  try {
    const user = await requireRole("company");

    // Run lookups in parallel
    const [connResult, portalUsers] = await Promise.all([
      db.select({ realmId: cfoQbConnections.realmId })
        .from(cfoQbConnections)
        .where(and(eq(cfoQbConnections.userId, user.id), eq(cfoQbConnections.isActive, true)))
        .limit(1),

      db.select({ id: cfoUsers.id })
        .from(cfoUsers)
        .where(and(eq(cfoUsers.role, "customer"), eq(cfoUsers.companyId, user.id))),
    ]);

    const realmId = connResult[0]?.realmId ?? null;
    const portalUserIds = portalUsers.map(u => u.id);

    const selectFields = {
      id:          cfoQbCustomers.id,
      qbId:        cfoQbCustomers.qbId,
      userId:      cfoQbCustomers.userId,
      displayName: cfoQbCustomers.displayName,
      email:       cfoQbCustomers.email,
      phone:       cfoQbCustomers.phone,
      balance:     cfoQbCustomers.balance,
      isActive:    cfoQbCustomers.isActive,
      syncedAt:    cfoQbCustomers.syncedAt,
      userName:    cfoUsers.name,
      userEmail:   cfoUsers.email,
      createdAt:   cfoUsers.createdAt,
    };

    type CustomerRow = {
      id: string; qbId: string | null; userId: string | null;
      displayName: string | null; email: string | null; phone: string | null;
      balance: string | null; isActive: boolean; syncedAt: Date;
      userName: string | null; userEmail: string | null; createdAt: Date | null;
    };

    const results: CustomerRow[][] = await Promise.all([
      // QB-synced customers for this company's realm
      realmId
        ? db.select(selectFields).from(cfoQbCustomers)
            .leftJoin(cfoUsers, eq(cfoUsers.id, cfoQbCustomers.userId))
            .where(and(eq(cfoQbCustomers.realmId, realmId), isNull(cfoQbCustomers.userId)))
        : Promise.resolve([]),

      // Portal customers assigned to this company
      portalUserIds.length > 0
        ? db.select(selectFields).from(cfoQbCustomers)
            .leftJoin(cfoUsers, eq(cfoUsers.id, cfoQbCustomers.userId))
            .where(inArray(cfoQbCustomers.userId, portalUserIds))
        : Promise.resolve([]),
    ]);

    // Deduplicate by id in case a portal customer is also a QB customer
    const seen = new Set<string>();
    const customers = results.flat().filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    return Response.json({ customers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
