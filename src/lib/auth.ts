import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { cfoUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { User } from "@/db/schema";
import { seedDemoCustomer } from "@/lib/demo-seed";

// Get the current user's profile from cfo_users.
// If the row doesn't exist yet (first login), create it automatically.
export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [profile] = await db
    .select()
    .from(cfoUsers)
    .where(eq(cfoUsers.id, user.id))
    .limit(1);

  if (profile) return profile;

  // First login — create the cfo_users row
  const role = resolveRole(user.email, user.user_metadata?.role);

  const [created] = await db
    .insert(cfoUsers)
    .values({
      id: user.id,
      email: user.email!,
      name: user.user_metadata?.name ?? null,
      role,
      isActive: true,
    })
    .returning();

  if (!created) return null;

  if (created.role === "customer") {
    try {
      await seedDemoCustomer(created.id, created.name);
      // Re-fetch to pick up companyId + qbCustomerId written by seed
      const [seeded] = await db
        .select()
        .from(cfoUsers)
        .where(eq(cfoUsers.id, created.id))
        .limit(1);
      return seeded ?? created;
    } catch (err) {
      // Seed failure must not block login — user row already exists
      console.error("[demo-seed] seedDemoCustomer failed:", err);
      return created;
    }
  }

  return created;
}

// Require auth — throws if not logged in
export async function requireAuth(): Promise<User> {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

// Require a specific role — throws if wrong role
export async function requireRole(
  role: "super_admin" | "company" | "customer"
): Promise<User> {
  const user = await requireAuth();
  if (user.role !== role) throw new Error("Forbidden");
  return user;
}

// Determine role: super_admin wins if email matches env var
function resolveRole(
  email?: string,
  metaRole?: string
): "super_admin" | "company" | "customer" {
  if (email && email === process.env.SUPER_ADMIN_EMAIL) return "super_admin";
  if (
    metaRole === "super_admin" ||
    metaRole === "company" ||
    metaRole === "customer"
  ) {
    return metaRole;
  }
  return "customer";
}

// Helper: return a standardised error response object (for API routes)
export function authError(message = "Unauthorized") {
  return Response.json({ error: message }, { status: 401 });
}

export function forbiddenError(message = "Forbidden") {
  return Response.json({ error: message }, { status: 403 });
}
