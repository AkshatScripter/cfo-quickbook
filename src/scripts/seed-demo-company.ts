import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { cfoUsers, cfoQbConnections } from "../db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const DEMO_EMAIL = "demo-company@system.internal";
const DEMO_REALM_ID = "demo-realm-0000";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    console.error("Run: npx tsx --env-file=.env.local src/scripts/seed-demo-company.ts");
    process.exit(1);
  }

  const client = postgres(url, { prepare: false });
  const db = drizzle(client);

  try {
    // Check if demo company already exists
    const [existing] = await db
      .select({ id: cfoUsers.id })
      .from(cfoUsers)
      .where(eq(cfoUsers.email, DEMO_EMAIL))
      .limit(1);

    if (existing) {
      console.log("Demo company already exists — no changes made.");
      console.log(`\nAdd this to your .env.local:\nDEMO_COMPANY_ID=${existing.id}`);
      return;
    }

    const companyId = randomUUID();

    await db.insert(cfoUsers).values({
      id: companyId,
      email: DEMO_EMAIL,
      name: "Demo Company",
      role: "company",
      isActive: true,
    });

    await db.insert(cfoQbConnections).values({
      userId: companyId,
      realmId: DEMO_REALM_ID,
      companyName: "Demo Company",
      isActive: true,
    });

    console.log("✓ Demo company created successfully.");
    console.log(`\nAdd this to your .env.local:\nDEMO_COMPANY_ID=${companyId}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
