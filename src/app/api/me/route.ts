import { getUser } from "@/lib/auth";
import { db } from "@/db";
import { cfoQbConnections } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// GET /api/me — returns current user profile + QB connection metadata
export async function GET() {
  try {
    const user = await getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    let qbConnected = false;
    let companyName: string | null = null;
    let lastSyncAt: string | null = null;

    if (user.role === "company") {
      const [conn] = await db
        .select({
          isActive: cfoQbConnections.isActive,
          companyName: cfoQbConnections.companyName,
          lastSyncAt: cfoQbConnections.lastSyncAt,
        })
        .from(cfoQbConnections)
        .where(
          and(
            eq(cfoQbConnections.userId, user.id),
            eq(cfoQbConnections.isActive, true)
          )
        )
        .limit(1);

      qbConnected = !!conn;
      companyName = conn?.companyName ?? null;
      lastSyncAt = conn?.lastSyncAt?.toISOString() ?? null;
    }

    return Response.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      qbConnected,
      companyName,
      lastSyncAt,
    });
  } catch {
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
