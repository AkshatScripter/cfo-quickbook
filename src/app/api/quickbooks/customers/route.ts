import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoQbConnections, cfoQbCustomers } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";

// GET /api/quickbooks/customers — QB customers synced for the company's realm
export async function GET() {
  try {
    const user = await requireRole("company");

    const [conn] = await db
      .select({ realmId: cfoQbConnections.realmId })
      .from(cfoQbConnections)
      .where(
        and(
          eq(cfoQbConnections.userId, user.id),
          eq(cfoQbConnections.isActive, true)
        )
      )
      .limit(1);

    if (!conn) return Response.json({ customers: [] });

    const customers = await db
      .select({
        id: cfoQbCustomers.qbId,
        displayName: cfoQbCustomers.displayName,
        email: cfoQbCustomers.email,
        phone: cfoQbCustomers.phone,
        balance: cfoQbCustomers.balance,
        isActive: cfoQbCustomers.isActive,
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
