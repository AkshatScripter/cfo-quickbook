import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { db } from "@/db";
import { cfoUsers, cfoQbCustomers, cfoQbCompanies } from "@/db/schema";

const bodySchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(["company", "customer"]),
});

// POST /api/auth/signup — creates a Supabase user with email_confirm: true
// so the account is immediately usable without clicking a confirmation email.
// Also inserts into cfo_users + the role-specific table (cfo_qb_customers or cfo_qb_companies).
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name, role } = bodySchema.parse(body);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, role },
      email_confirm: true,
    });

    if (error) return Response.json({ error: error.message }, { status: 400 });

    const userId = data.user?.id;
    if (!userId) return Response.json({ error: "User creation failed" }, { status: 500 });

    // Insert into cfo_users
    await db.insert(cfoUsers).values({
      id: userId,
      email,
      name,
      role,
      isActive: true,
    });

    // Insert into role-specific table
    if (role === "customer") {
      await db.insert(cfoQbCustomers).values({
        userId,
        displayName: name,
        email,
        isActive: true,
      });
    } else {
      // company
      await db.insert(cfoQbCompanies).values({
        userId,
        companyName: name,
        email,
        isActive: true,
      });
    }

    return Response.json({ id: userId }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Signup failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
