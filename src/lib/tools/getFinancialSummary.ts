import { tool } from "ai";
import { z } from "zod";
import { db } from "@/db";
import { cfoCalculatedReports } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const reportTypeEnum = z.enum(["revenue_analysis", "cash_flow", "kpi", "risk"]);

export function createGetFinancialSummaryTool(realmId: string) {
  return tool({
    description:
      "Fetch a cached CFO financial report for the company. Use this when the user asks about revenue, cash flow, KPIs, margins, burn rate, or financial risk. Choose the most relevant report type based on the question.",
    inputSchema: z.object({
      reportType: reportTypeEnum.describe(
        "revenue_analysis — revenue & top customers; cash_flow — cash position & runway; kpi — margins, burn rate, AR days; risk — overdue invoices & expense spikes"
      ),
    }),
    execute: async ({ reportType }) => {
      const [report] = await db
        .select({ data: cfoCalculatedReports.data, calculatedAt: cfoCalculatedReports.calculatedAt })
        .from(cfoCalculatedReports)
        .where(and(eq(cfoCalculatedReports.realmId, realmId), eq(cfoCalculatedReports.reportType, reportType)))
        .limit(1);

      if (!report) return { error: "No report available. Data may not have been synced yet." };

      return {
        reportType,
        calculatedAt: report.calculatedAt,
        data: report.data,
      };
    },
  });
}
