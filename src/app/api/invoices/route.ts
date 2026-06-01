import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoQbConnections, cfoQbInvoices } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

// GET /api/invoices — all invoices for the Company user's QB account
export async function GET() {
  try {
    const user = await requireRole("company");
    const [conn] = await db.select().from(cfoQbConnections)
      .where(and(eq(cfoQbConnections.userId, user.id), eq(cfoQbConnections.isActive, true))).limit(1);
    if (!conn) return Response.json({ invoices: [] });

    const invoices = await db
      .select({
        id: cfoQbInvoices.qbId,
        invoiceNumber: cfoQbInvoices.invoiceNumber,
        customer: cfoQbInvoices.customerName,
        issued: cfoQbInvoices.txnDate,
        due: cfoQbInvoices.dueDate,
        amount: cfoQbInvoices.totalAmount,
        balance: cfoQbInvoices.balance,
        status: cfoQbInvoices.status,
      })
      .from(cfoQbInvoices)
      .where(eq(cfoQbInvoices.realmId, conn.realmId))
      .orderBy(desc(cfoQbInvoices.txnDate))
      .limit(200);

    return Response.json({ invoices });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
