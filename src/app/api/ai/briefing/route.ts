import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db";
import { cfoUsers, cfoQbConnections, cfoQbInvoices, cfoCalculatedReports } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

const BriefingSchema = z.object({
  text: z
    .string()
    .describe("2–3 sentence briefing. Plain text only — no markdown, no asterisks."),
  highlights: z
    .array(z.string())
    .describe(
      "Exact substrings from `text` to highlight — amounts, dates, invoice IDs, customer names, metric values."
    ),
  suggestions: z
    .array(z.string())
    .max(3)
    .describe("3 short follow-up question suggestions."),
});

export async function GET() {
  try {
    const user = await requireAuth();
    const today = new Date().toISOString().split("T")[0];

    if (user.role === "customer") {
      return customerBriefing(user, today);
    }

    if (user.role === "company") {
      return companyBriefing(user, today);
    }

    return Response.json({ notLinked: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return Response.json({ error: msg }, { status });
  }
}

// ── Customer briefing ────────────────────────────────────────────────────────

async function customerBriefing(
  user: { companyId: string | null; qbCustomerId: string | null },
  today: string
) {
  if (!user.companyId || !user.qbCustomerId) {
    return Response.json({ notLinked: true });
  }

  const [company] = await db
    .select({ id: cfoUsers.id })
    .from(cfoUsers)
    .where(eq(cfoUsers.id, user.companyId))
    .limit(1);
  if (!company) return Response.json({ notLinked: true });

  const [conn] = await db
    .select()
    .from(cfoQbConnections)
    .where(and(eq(cfoQbConnections.userId, company.id), eq(cfoQbConnections.isActive, true)))
    .limit(1);
  if (!conn) return Response.json({ notLinked: true });

  const rawInvoices = await db
    .select({
      invoiceNumber: cfoQbInvoices.invoiceNumber,
      totalAmount: cfoQbInvoices.totalAmount,
      balance: cfoQbInvoices.balance,
      dueDate: cfoQbInvoices.dueDate,
      txnDate: cfoQbInvoices.txnDate,
      status: cfoQbInvoices.status,
    })
    .from(cfoQbInvoices)
    .where(
      and(
        eq(cfoQbInvoices.realmId, conn.realmId),
        eq(cfoQbInvoices.customerId, user.qbCustomerId)
      )
    )
    .orderBy(desc(cfoQbInvoices.txnDate))
    .limit(50);

  const totalOwed = rawInvoices
    .filter((i) => i.status === "Open")
    .reduce((s, i) => s + Number(i.balance ?? 0), 0);
  const overdueCount = rawInvoices.filter(
    (i) => i.status === "Open" && i.dueDate && i.dueDate < today
  ).length;

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: BriefingSchema,
    prompt: `Generate a friendly, concise 2–3 sentence account briefing for a customer.
Today is ${today}.
Total outstanding balance: $${totalOwed.toFixed(2)}
Overdue invoices: ${overdueCount}
Recent invoices (newest first):
${JSON.stringify(rawInvoices.slice(0, 10), null, 2)}

Guidelines:
- Open with the most important fact (balance owed or next due date)
- Mention any overdue invoices and urgency
- If everything is current, say so reassuringly
- Keep it under 60 words — plain text, no markdown`,
  });

  return Response.json({ ...object, generatedAt: new Date().toISOString() });
}

// ── Company briefing ─────────────────────────────────────────────────────────

async function companyBriefing(user: { id: string }, today: string) {
  const [conn] = await db
    .select()
    .from(cfoQbConnections)
    .where(and(eq(cfoQbConnections.userId, user.id), eq(cfoQbConnections.isActive, true)))
    .limit(1);

  if (!conn) return Response.json({ notLinked: true });

  // Fetch all cached reports in parallel
  const [revenue, cashFlow, kpi, risk] = await Promise.all(
    ["revenue_analysis", "cash_flow", "kpi", "risk"].map((type) =>
      db
        .select({ data: cfoCalculatedReports.data })
        .from(cfoCalculatedReports)
        .where(
          and(
            eq(cfoCalculatedReports.realmId, conn.realmId),
            eq(cfoCalculatedReports.reportType, type)
          )
        )
        .limit(1)
        .then((rows) => rows[0]?.data ?? null)
    )
  );

  if (!revenue && !cashFlow && !kpi && !risk) {
    return Response.json({ notLinked: true });
  }

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: BriefingSchema,
    prompt: `You are a CFO assistant. Write a 2–3 sentence morning briefing for a company owner.
Today is ${today}.
Company: ${conn.companyName ?? "the company"}

Available financial data:
Revenue analysis: ${JSON.stringify(revenue)}
Cash flow: ${JSON.stringify(cashFlow)}
KPI metrics: ${JSON.stringify(kpi)}
Risk/alerts: ${JSON.stringify(risk)}

Guidelines:
- Lead with the single most important financial fact right now
- Mention one opportunity and one risk
- End with an action worth taking today
- Keep it under 70 words — plain text, no markdown`,
  });

  return Response.json({ ...object, generatedAt: new Date().toISOString() });
}
