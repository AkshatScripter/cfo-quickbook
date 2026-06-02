import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createAdminClient } from "@/lib/supabase/server";

// GET /api/admin/users — all users
export async function GET() {
  try {
    await requireRole("super_admin");

    const users = await db
      .select({
        id: cfoUsers.id,
        email: cfoUsers.email,
        name: cfoUsers.name,
        role: cfoUsers.role,
        companyId: cfoUsers.companyId,
        qbCustomerId: cfoUsers.qbCustomerId,
        isActive: cfoUsers.isActive,
        createdAt: cfoUsers.createdAt,
      })
      .from(cfoUsers)
      .orderBy(cfoUsers.createdAt);

    return Response.json({ users });
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
