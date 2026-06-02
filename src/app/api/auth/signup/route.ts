import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const bodySchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(["company", "customer"]),
});

// POST /api/auth/signup — creates a Supabase user with email_confirm: true
// so the account is immediately usable without clicking a confirmation email.
// Uses the service role key (server-only). Safe because this route is not
// authenticated — anyone can sign up, but only with a valid body.
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

    return Response.json({ id: data.user?.id }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Signup failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
