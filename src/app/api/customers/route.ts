import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoUsers } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/customers — list all customer users belonging to this company
export async function GET() {
  try {
    const user = await requireRole("company");

    const customers = await db
      .select({
        id: cfoUsers.id,
        name: cfoUsers.name,
        email: cfoUsers.email,
        isActive: cfoUsers.isActive,
        createdAt: cfoUsers.createdAt,
      })
      .from(cfoUsers)
      .where(eq(cfoUsers.companyId, user.id));

    return Response.json({ customers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
