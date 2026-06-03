import { requireAuth } from "@/lib/auth";
import { db } from "@/db";
import { cfoChatHistory } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

// GET /api/ai/chat/history — returns the last 40 messages for the authenticated user
export async function GET() {
  try {
    const user = await requireAuth();

    const rows = await db
      .select({
        id:        cfoChatHistory.id,
        sessionId: cfoChatHistory.sessionId,
        role:      cfoChatHistory.role,
        content:   cfoChatHistory.content,
        createdAt: cfoChatHistory.createdAt,
      })
      .from(cfoChatHistory)
      .where(eq(cfoChatHistory.userId, user.id))
      .orderBy(desc(cfoChatHistory.createdAt))
      .limit(40);

    // Return in chronological order
    return Response.json(rows.reverse());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return Response.json({ error: msg }, { status });
  }
}
