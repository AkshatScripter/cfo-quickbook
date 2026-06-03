import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { cfoUsers } from "../db/schema";
import { eq } from "drizzle-orm";
import { seedDemoCustomer } from "../lib/demo-seed";

const CUSTOMER_ID = "1e3cb7e7-83e3-4987-8249-44821c01bcde"; // akshatgoyal+13@bitcot.com

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client);

  // Reset companyId so seedDemoCustomer runs fresh
  await db.update(cfoUsers).set({ companyId: null, qbCustomerId: null, updatedAt: new Date() }).where(eq(cfoUsers.id, CUSTOMER_ID));

  await seedDemoCustomer(CUSTOMER_ID, "new custmor");

  const [updated] = await db.select({ companyId: cfoUsers.companyId, qbCustomerId: cfoUsers.qbCustomerId }).from(cfoUsers).where(eq(cfoUsers.id, CUSTOMER_ID)).limit(1);
  console.log("✓ Customer reassigned:", updated);

  await client.end();
}

main().catch(console.error);
