import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Paths that do NOT require authentication
const PUBLIC_PATHS = new Set(["/login", "/signup"]);

// API prefixes that are always public
const PUBLIC_API_PREFIXES = [
  "/api/auth",
  "/api/quickbooks/callback", // QB OAuth callback — called by Intuit, no session yet
  "/api/quickbooks/webhook",  // QB webhook — called by Intuit, verified by HMAC signature
  "/api/cron",                // protected by CRON_SECRET header instead
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { pathname } = request.nextUrl;

  // Skip public API routes
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not authenticated → redirect to login (except public pages)
  if (!user && !PUBLIC_PATHS.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Already authenticated → redirect away from login/signup to role-appropriate home
  if (user && PUBLIC_PATHS.has(pathname)) {
    const url = request.nextUrl.clone();
    const metaRole = user.user_metadata?.role as string | undefined;
    const isSuperAdmin =
      metaRole === "super_admin" ||
      user.email === process.env.SUPER_ADMIN_EMAIL;
    const isCustomer = metaRole === "customer";

    if (isSuperAdmin) url.pathname = "/admin";
    else if (isCustomer) url.pathname = "/customer";
    else url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Match all routes except Next.js internals and static files
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
