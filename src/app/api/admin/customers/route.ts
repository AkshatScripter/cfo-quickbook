import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoQbCustomers, cfoUsers } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/admin/customers — all customers from cfo_qb_customers
// Includes both QB-synced customers and platform-created customers (joined with cfo_users)
export async function GET() {
  try {
    await requireRole("super_admin");

    const rows = await db
      .select({
        // cfo_qb_customers fields
        id:          cfoQbCustomers.id,
        realmId:     cfoQbCustomers.realmId,
        qbId:        cfoQbCustomers.qbId,
        userId:      cfoQbCustomers.userId,
        displayName: cfoQbCustomers.displayName,
        email:       cfoQbCustomers.email,
        phone:       cfoQbCustomers.phone,
        balance:     cfoQbCustomers.balance,
        isActive:    cfoQbCustomers.isActive,
        syncedAt:    cfoQbCustomers.syncedAt,
        // cfo_users fields (null for QB-only customers with no portal account)
        userName:      cfoUsers.name,
        userEmail:     cfoUsers.email,
        companyId:     cfoUsers.companyId,
        qbCustomerId:  cfoUsers.qbCustomerId,
        userIsActive:  cfoUsers.isActive,
        userCreatedAt: cfoUsers.createdAt,
      })
      .from(cfoQbCustomers)
      .leftJoin(cfoUsers, eq(cfoUsers.id, cfoQbCustomers.userId))
      .orderBy(cfoQbCustomers.syncedAt);

    return Response.json({ customers: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return Response.json({ error: msg }, { status });
  }
}
