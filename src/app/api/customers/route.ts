import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoUsers, cfoQbCustomers } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/customers — all customers from cfo_qb_customers (no company filter)
export async function GET() {
  try {
    await requireRole("company");

    const customers = await db
      .select({
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
      })
      .from(cfoQbCustomers)
      .leftJoin(cfoUsers, eq(cfoUsers.id, cfoQbCustomers.userId));

    return Response.json({ customers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
