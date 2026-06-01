import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoUsers, cfoQbConnections, cfoQbInvoices } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

// GET /api/customer/invoices — invoices for the logged-in Customer
// Matches by customer name (QB doesn't have email-based customer IDs)
export async function GET() {
  try {
    const user = await requireRole("customer");

    // Get the company this customer belongs to
    if (!user.companyId) return Response.json({ invoices: [], totalOwed: 0 });

    const [company] = await db.select({ id: cfoUsers.id }).from(cfoUsers).where(eq(cfoUsers.id, user.companyId)).limit(1);
    if (!company) return Response.json({ invoices: [], totalOwed: 0 });

    const [conn] = await db.select().from(cfoQbConnections)
      .where(and(eq(cfoQbConnections.userId, company.id), eq(cfoQbConnections.isActive, true))).limit(1);
    if (!conn) return Response.json({ invoices: [], totalOwed: 0 });

    // Find invoices that match the customer's name or email
    const customerName = user.name ?? user.email;
    const invoices = await db
      .select()
      .from(cfoQbInvoices)
      .where(and(eq(cfoQbInvoices.realmId, conn.realmId), eq(cfoQbInvoices.customerName, customerName)))
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
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
