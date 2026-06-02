import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoUsers, cfoQbConnections, cfoQbInvoices } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

// GET /api/customer/invoices — invoices for the logged-in customer
// Uses qbCustomerId (reliable QB ID) instead of name-matching
export async function GET() {
  try {
    const user = await requireRole("customer");

    // Guard: customer must be linked to both a company and a QB customer
    if (!user.companyId || !user.qbCustomerId) {
      return Response.json({ invoices: [], totalOwed: 0, notLinked: true });
    }

    const [company] = await db
      .select({ id: cfoUsers.id })
      .from(cfoUsers)
      .where(eq(cfoUsers.id, user.companyId))
      .limit(1);
    if (!company) return Response.json({ invoices: [], totalOwed: 0, notLinked: true });

    const [conn] = await db
      .select()
      .from(cfoQbConnections)
      .where(and(eq(cfoQbConnections.userId, company.id), eq(cfoQbConnections.isActive, true)))
      .limit(1);
    if (!conn) return Response.json({ invoices: [], totalOwed: 0, notLinked: true });

    const invoices = await db
      .select()
      .from(cfoQbInvoices)
      .where(
        and(
          eq(cfoQbInvoices.realmId, conn.realmId),
          eq(cfoQbInvoices.customerId, user.qbCustomerId)
        )
      )
      .orderBy(desc(cfoQbInvoices.txnDate))
      .limit(100);

    const totalOwed = invoices
      .filter((i) => i.status === "Open")
      .reduce((s, i) => s + Number(i.balance ?? 0), 0);

    return Response.json({
      invoices: invoices.map((i) => ({
        id: i.qbId,
        invoiceNumber: i.invoiceNumber,
        issued: i.txnDate,
        due: i.dueDate,
        amount: Number(i.totalAmount ?? 0),
        balance: Number(i.balance ?? 0),
        status: i.status,
      })),
      totalOwed,
      notLinked: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
