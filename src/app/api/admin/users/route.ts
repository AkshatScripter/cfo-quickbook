import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoUsers, cfoQbCompanies, cfoQbCustomers } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/admin/users — all users enriched with role-specific table data
export async function GET() {
  try {
    await requireRole("super_admin");

    const [users, companies, customers] = await Promise.all([
      db.select({
        id: cfoUsers.id,
        email: cfoUsers.email,
        name: cfoUsers.name,
        role: cfoUsers.role,
        companyId: cfoUsers.companyId,
        qbCustomerId: cfoUsers.qbCustomerId,
        isActive: cfoUsers.isActive,
        createdAt: cfoUsers.createdAt,
      }).from(cfoUsers).orderBy(cfoUsers.createdAt),

      // Company details from cfo_qb_companies
      db.select({
        userId: cfoQbCompanies.userId,
        companyName: cfoQbCompanies.companyName,
        industry: cfoQbCompanies.industry,
        phone: cfoQbCompanies.phone,
      }).from(cfoQbCompanies),

      // All customers from cfo_qb_customers
      db.select({
        userId: cfoQbCustomers.userId,
        displayName: cfoQbCustomers.displayName,
        balance: cfoQbCustomers.balance,
        phone: cfoQbCustomers.phone,
      }).from(cfoQbCustomers),
    ]);

    const companyMap = new Map(companies.map(c => [c.userId, c]));
    const customerMap = new Map(customers.map(c => [c.userId!, c]));

    const enriched = users.map(u => ({
      ...u,
      ...(u.role === "company" ? companyMap.get(u.id) ?? {} : {}),
      ...(u.role === "customer" ? customerMap.get(u.id) ?? {} : {}),
    }));

    return Response.json({ users: enriched });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/admin/users — update a user (deactivate, change role, etc.)
export async function PATCH(request: Request) {
  try {
    await requireRole("super_admin");
    const body = await request.json() as { id: string; isActive?: boolean; role?: string };

    const updates: Partial<typeof cfoUsers.$inferInsert> = {};
    if (typeof body.isActive === "boolean") updates.isActive = body.isActive;
    if (body.role === "super_admin" || body.role === "company" || body.role === "customer") {
      updates.role = body.role;
    }

    const [updated] = await db
      .update(cfoUsers)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(cfoUsers.id, body.id))
      .returning();

    return Response.json({ user: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
