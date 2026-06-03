import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { cfoUsers, cfoQbConnections, cfoQbInvoices } from "../db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client);

  const customers = await db
    .select({ id: cfoUsers.id, email: cfoUsers.email, companyId: cfoUsers.companyId, qbCustomerId: cfoUsers.qbCustomerId })
    .from(cfoUsers)
    .where(eq(cfoUsers.role, "customer"));
  console.log("CUSTOMERS:", JSON.stringify(customers, null, 2));

  const demoConn = await db.select().from(cfoQbConnections).where(eq(cfoQbConnections.realmId, "demo-realm-0000"));
  console.log("DEMO QB CONNECTION:", JSON.stringify(demoConn, null, 2));

  const invoices = await db
    .select({ qbId: cfoQbInvoices.qbId, customerId: cfoQbInvoices.customerId })
    .from(cfoQbInvoices)
    .where(eq(cfoQbInvoices.realmId, "demo-realm-0000"));
  console.log("DEMO INVOICES COUNT:", invoices.length);

  await client.end();
}

main().catch(console.error);
