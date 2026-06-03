import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoQbConnections, cfoCalculatedReports } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET() {
  try {
    const user = await requireRole("company");
    const [conn] = await db.select().from(cfoQbConnections)
      .where(eq(cfoQbConnections.userId, user.id)).limit(1);
    if (!conn) return Response.json({ error: "QuickBooks not connected" }, { status: 400 });

    const [report] = await db.select({ data: cfoCalculatedReports.data })
      .from(cfoCalculatedReports)
      .where(and(eq(cfoCalculatedReports.realmId, conn.realmId), eq(cfoCalculatedReports.reportType, "risk")))
      .limit(1);

    return Response.json(report?.data ?? null);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
