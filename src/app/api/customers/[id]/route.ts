import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoUsers, cfoQbConnections, cfoQbCustomers } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
  companyId: z.string().uuid().nullable(),
  qbCustomerId: z.string().nullable().optional(), // explicit override; if omitted, auto-match is used
});

// PATCH /api/customers/:id — super_admin assigns a portal customer to a company.
// When companyId is set, auto-matches the portal user to a QB customer by email
// (falls back to display name match) and stores qbCustomerId automatically.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("super_admin");
    const { id } = await params;
    const body = bodySchema.parse(await request.json());

    const [target] = await db
      .select({ id: cfoUsers.id, role: cfoUsers.role, email: cfoUsers.email, name: cfoUsers.name })
      .from(cfoUsers)
      .where(eq(cfoUsers.id, id))
      .limit(1);

    if (!target) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }
    if (target.role !== "customer") {
      return Response.json({ error: "Only customer users can be assigned" }, { status: 400 });
    }

    // Use explicit override if provided; otherwise auto-match by email/name
    let qbCustomerId: string | null = null;
    if (body.qbCustomerId !== undefined) {
      qbCustomerId = body.qbCustomerId;
    } else if (body.companyId) {
      const [conn] = await db
        .select({ realmId: cfoQbConnections.realmId })
        .from(cfoQbConnections)
        .where(eq(cfoQbConnections.userId, body.companyId))
        .limit(1);

      if (conn) {
        // Try email match first, then display name match
        const qbCustomers = await db
          .select({ qbId: cfoQbCustomers.qbId, email: cfoQbCustomers.email, displayName: cfoQbCustomers.displayName })
          .from(cfoQbCustomers)
          .where(eq(cfoQbCustomers.realmId, conn.realmId));

        const byEmail = target.email
          ? qbCustomers.find(c => c.email?.toLowerCase() === target.email.toLowerCase())
          : null;
        const byName = target.name
          ? qbCustomers.find(c => c.displayName?.toLowerCase() === target.name!.toLowerCase())
          : null;

        qbCustomerId = byEmail?.qbId ?? byName?.qbId ?? null;
      }
    } // else companyId is null → unassigning, qbCustomerId stays null

    const [updated] = await db
      .update(cfoUsers)
      .set({
        companyId: body.companyId,
        qbCustomerId,
        updatedAt: new Date(),
      })
      .where(eq(cfoUsers.id, id))
      .returning();

    return Response.json({ user: updated, qbMatched: !!qbCustomerId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
