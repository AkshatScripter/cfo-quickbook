import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Transaction-mode pooler (port 6543) — used by the app at runtime
// `prepare: false` is required for pgBouncer / Supabase transaction pooler
const client = postgres(process.env.DATABASE_URL!, { prepare: false });

export const db = drizzle(client, { schema });

export type DB = typeof db;
