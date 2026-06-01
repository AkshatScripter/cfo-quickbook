import { redirect } from "next/navigation";

// Both app/page.tsx and this file resolve to "/".
// app/page.tsx wins in Next.js — this redirect is a safety fallback.
export default function DashboardRoot() {
  redirect("/dashboard");
}
