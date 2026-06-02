import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
  companyId: z.string().uuid().nullable(),
  qbCustomerId: z.string().nullable(),
});

// PATCH /api/customers/:id — super_admin assigns a portal customer to a company + QB customer
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("super_admin");
    const { id } = await params;
    const body = bodySchema.parse(await request.json());

    const [target] = await db
      .select({ id: cfoUsers.id, role: cfoUsers.role })
      .from(cfoUsers)
      .where(eq(cfoUsers.id, id))
      .limit(1);

    if (!target) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }
    if (target.role !== "customer") {
      return Response.json({ error: "Only customer users can be assigned" }, { status: 400 });
    }

    const [updated] = await db
      .update(cfoUsers)
      .set({
        companyId: body.companyId,
        qbCustomerId: body.qbCustomerId,
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
