import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
  qbCustomerId: z.string().nullable(),
});

// PATCH /api/customers/:id — company owner assigns or removes a QB customer link
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole("company");
    const { id } = await params;
    const body = bodySchema.parse(await request.json());

    // Verify the target customer exists and belongs to this company (or is unlinked)
    const [target] = await db
      .select({ companyId: cfoUsers.companyId })
      .from(cfoUsers)
      .where(eq(cfoUsers.id, id))
      .limit(1);

    if (!target) {
      return Response.json({ error: "Customer not found" }, { status: 404 });
    }
    if (target.companyId && target.companyId !== user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const [updated] = await db
      .update(cfoUsers)
      .set({
        qbCustomerId: body.qbCustomerId,
        // Claim the customer for this company if not yet claimed
        companyId: target.companyId ?? user.id,
        updatedAt: new Date(),
      })
      .where(eq(cfoUsers.id, id))
      .returning();

    return Response.json({ user: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
