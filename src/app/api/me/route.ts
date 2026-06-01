import { getUser } from "@/lib/auth";
import { db } from "@/db";
import { cfoQbConnections } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// GET /api/me — returns current user profile + QB connection status
export async function GET() {
  try {
    const user = await getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    let qbConnected = false;
    if (user.role === "company") {
      const [conn] = await db
        .select({ isActive: cfoQbConnections.isActive })
        .from(cfoQbConnections)
        .where(
          and(
            eq(cfoQbConnections.userId, user.id),
            eq(cfoQbConnections.isActive, true)
          )
        )
        .limit(1);
      qbConnected = !!conn;
    }

    return Response.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      qbConnected,
    });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
