import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoQbConnections, cfoQbCustomers } from "@/db/schema";
import { asc, eq } from "drizzle-orm";

// GET /api/admin/qb-customers?companyId=<userId>
// Returns QB customers for a given company user's active realm
export async function GET(request: Request) {
  try {
    await requireRole("super_admin");

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    if (!companyId) return Response.json({ customers: [] });

    const [conn] = await db
      .select({ realmId: cfoQbConnections.realmId })
      .from(cfoQbConnections)
      .where(eq(cfoQbConnections.userId, companyId))
      .limit(1);

    if (!conn) return Response.json({ customers: [] });

    const customers = await db
      .select({
        id: cfoQbCustomers.qbId,
        displayName: cfoQbCustomers.displayName,
      })
      .from(cfoQbCustomers)
      .where(eq(cfoQbCustomers.realmId, conn.realmId))
      .orderBy(asc(cfoQbCustomers.displayName));

    return Response.json({ customers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
