import { db } from "@/db";
import { cfoUsers, cfoQbCustomers, cfoQbInvoices, cfoQbPayments } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const DEMO_REALM_ID = "demo-realm-0000";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Called at customer signup. Requires DEMO_COMPANY_ID env var to be set.
// Idempotent — safe to call multiple times for the same userId.
export async function seedDemoCustomer(
  userId: string,
  userName: string | null
): Promise<void> {
  if (!process.env.DEMO_COMPANY_ID) return;

  const qbId = `demo-cust-${userId}`;
  const displayName = userName ?? userId.slice(0, 8);

  // Idempotency — skip if already seeded
  const [existing] = await db
    .select({ id: cfoQbCustomers.id })
    .from(cfoQbCustomers)
    .where(and(eq(cfoQbCustomers.realmId, DEMO_REALM_ID), eq(cfoQbCustomers.qbId, qbId)))
    .limit(1);

  if (existing) return;

  // QB customer record
  await db.insert(cfoQbCustomers).values({
    realmId: DEMO_REALM_ID,
    qbId,
    displayName,
    isActive: true,
    balance: "12050.00",
  });

  const inv1 = `demo-inv-1-${userId}`;
  const inv2 = `demo-inv-2-${userId}`;
  const inv3 = `demo-inv-3-${userId}`;

  // 7 invoices: 3 paid, 2 open (future), 2 overdue
  await db.insert(cfoQbInvoices).values([
    { realmId: DEMO_REALM_ID, qbId: inv1, invoiceNumber: "INV-1001", customerId: qbId, customerName: displayName, totalAmount: "2400.00", balance: "0.00",    txnDate: daysAgo(90), dueDate: daysAgo(60), status: "Paid" },
    { realmId: DEMO_REALM_ID, qbId: inv2, invoiceNumber: "INV-1002", customerId: qbId, customerName: displayName, totalAmount: "1200.00", balance: "0.00",    txnDate: daysAgo(75), dueDate: daysAgo(45), status: "Paid" },
    { realmId: DEMO_REALM_ID, qbId: inv3, invoiceNumber: "INV-1003", customerId: qbId, customerName: displayName, totalAmount: "800.00",  balance: "0.00",    txnDate: daysAgo(60), dueDate: daysAgo(30), status: "Paid" },
    { realmId: DEMO_REALM_ID, qbId: `demo-inv-4-${userId}`, invoiceNumber: "INV-1004", customerId: qbId, customerName: displayName, totalAmount: "3500.00", balance: "3500.00", txnDate: daysAgo(20), dueDate: daysFromNow(15), status: "Open" },
    { realmId: DEMO_REALM_ID, qbId: `demo-inv-5-${userId}`, invoiceNumber: "INV-1005", customerId: qbId, customerName: displayName, totalAmount: "950.00",  balance: "950.00",  txnDate: daysAgo(15), dueDate: daysFromNow(30), status: "Open" },
    { realmId: DEMO_REALM_ID, qbId: `demo-inv-6-${userId}`, invoiceNumber: "INV-1006", customerId: qbId, customerName: displayName, totalAmount: "4800.00", balance: "4800.00", txnDate: daysAgo(40), dueDate: daysAgo(10), status: "Open" },
    { realmId: DEMO_REALM_ID, qbId: `demo-inv-7-${userId}`, invoiceNumber: "INV-1007", customerId: qbId, customerName: displayName, totalAmount: "1750.00", balance: "1750.00", txnDate: daysAgo(35), dueDate: daysAgo(5),  status: "Open" },
  ]);

  // Payments for the 3 paid invoices
  await db.insert(cfoQbPayments).values([
    { realmId: DEMO_REALM_ID, qbId: `demo-pay-1-${userId}`, customerId: qbId, customerName: displayName, totalAmount: "2400.00", paymentDate: daysAgo(55), paymentMethod: "Check",       invoiceIds: [inv1] },
    { realmId: DEMO_REALM_ID, qbId: `demo-pay-2-${userId}`, customerId: qbId, customerName: displayName, totalAmount: "1200.00", paymentDate: daysAgo(42), paymentMethod: "ACH",         invoiceIds: [inv2] },
    { realmId: DEMO_REALM_ID, qbId: `demo-pay-3-${userId}`, customerId: qbId, customerName: displayName, totalAmount: "800.00",  paymentDate: daysAgo(28), paymentMethod: "Credit Card", invoiceIds: [inv3] },
  ]);

  // Link portal user → demo company + QB customer record
  await db.update(cfoUsers).set({
    companyId:    process.env.DEMO_COMPANY_ID!,
    qbCustomerId: qbId,
    updatedAt:    new Date(),
  }).where(eq(cfoUsers.id, userId));
}
