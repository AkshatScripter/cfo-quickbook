import { requireRole } from "@/lib/auth";
import { db } from "@/db";
import { cfoQbConnections, cfoCalculatedReports, cfoQbInvoices } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// GET /api/dashboard/stats — main KPI cards for the Company dashboard
export async function GET() {
  try {
    const user = await requireRole("company");

    const [conn] = await db
      .select()
      .from(cfoQbConnections)
      .where(and(eq(cfoQbConnections.userId, user.id), eq(cfoQbConnections.isActive, true)))
      .limit(1);

    if (!conn) {
      return Response.json({ error: "QuickBooks not connected", qbConnected: false }, { status: 200 });
    }

    const realmId = conn.realmId;

    // Get cached calculated reports
    const reports = await db
      .select()
      .from(cfoCalculatedReports)
      .where(eq(cfoCalculatedReports.realmId, realmId));

    const revenue = reports.find((r) => r.reportType === "revenue_analysis")?.data as RevenueData | undefined;
    const cashFlow = reports.find((r) => r.reportType === "cash_flow")?.data as CashFlowData | undefined;
    const kpi = reports.find((r) => r.reportType === "kpi")?.data as KPIData | undefined;
    const risk = reports.find((r) => r.reportType === "risk")?.data as RiskData | undefined;

    return Response.json({
      qbConnected: true,
      lastSync: conn.lastSyncAt,
      companyName: conn.companyName,
      stats: {
        revenueMTD: revenue?.mtd ?? 0,
        revenuePrev: revenue?.prevMtd ?? 0,
        momGrowth: revenue?.momGrowth ?? null,
        cashOnHand: cashFlow?.cashOnHand ?? 0,
        burnRate: cashFlow?.burnRate ?? 0,
        runwayMonths: cashFlow?.runwayMonths ?? null,
        grossMargin: kpi?.grossMargin ?? 0,
        arDays: kpi?.arDays ?? null,
        overdueCount: risk?.overdueInvoices?.length ?? 0,
        overdueAmount: risk?.totalOverdue ?? 0,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const status = msg === "Unauthorized" || msg === "Forbidden" ? 401 : 500;
    return Response.json({ error: msg }, { status });
  }
}

interface RevenueData { mtd: number; prevMtd: number; momGrowth: number | null }
interface CashFlowData { cashOnHand: number; burnRate: number; runwayMonths: number | null }
interface KPIData { grossMargin: number; arDays: number | null }
interface RiskData { overdueInvoices: unknown[]; totalOverdue: number }
