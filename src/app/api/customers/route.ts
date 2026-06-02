import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoUsers } from "@/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";

// GET /api/customers — portal customers for this company + unlinked portal signups
export async function GET() {
  try {
    const user = await requireRole("company");

    const customers = await db
      .select({
        id: cfoUsers.id,
        name: cfoUsers.name,
        email: cfoUsers.email,
        isActive: cfoUsers.isActive,
        companyId: cfoUsers.companyId,
        qbCustomerId: cfoUsers.qbCustomerId,
        createdAt: cfoUsers.createdAt,
      })
      .from(cfoUsers)
      .where(
        and(
          eq(cfoUsers.role, "customer"),
          or(eq(cfoUsers.companyId, user.id), isNull(cfoUsers.companyId))
        )
      );

    return Response.json({ customers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
