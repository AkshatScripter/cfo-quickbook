import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoQbConnections, cfoCalculatedReports } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET() {
  try {
    const user = await requireRole("company");
    const conn = await getConn(user.id);
    if (!conn) return Response.json({ error: "QuickBooks not connected" }, { status: 400 });

    const [report] = await db
      .select({ data: cfoCalculatedReports.data, calculatedAt: cfoCalculatedReports.calculatedAt })
      .from(cfoCalculatedReports)
      .where(and(eq(cfoCalculatedReports.realmId, conn.realmId), eq(cfoCalculatedReports.reportType, "revenue_analysis")))
      .limit(1);

    return Response.json(report?.data ?? null);
  } catch (err) {
    return errResponse(err);
  }
}

async function getConn(userId: string) {
  const [c] = await db.select().from(cfoQbConnections)
    .where(eq(cfoQbConnections.userId, userId)).limit(1);
  return c ?? null;
}

function errResponse(err: unknown) {
  const msg = err instanceof Error ? err.message : "Server error";
  return Response.json({ error: msg }, { status: msg === "Unauthorized" || msg === "Forbidden" ? 401 : 500 });
}
