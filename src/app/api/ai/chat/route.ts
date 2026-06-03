import { NextRequest } from "next/server";
import Groq from "groq-sdk";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db";
import {
  cfoQbConnections,
  cfoCalculatedReports,
  cfoQbInvoices,
  cfoChatHistory,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json() as { messages: ChatMessage[]; sessionId: string };
    const { messages, sessionId } = body;

    if (!Array.isArray(messages) || !sessionId) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const systemPrompt = await buildSystemPrompt(user);
    const trimmed = messages.slice(-20);

    const groqStream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: systemPrompt }, ...trimmed],
      stream: true,
      max_tokens: 1024,
    });

    let fullResponse = "";
    const userMessage = trimmed[trimmed.length - 1];

    const readable = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of groqStream) {
            const token = chunk.choices[0]?.delta?.content ?? "";
            if (token) {
              fullResponse += token;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(token)}\n\n`));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } finally {
          controller.close();
          // Persist both turns after stream completes
          if (userMessage?.content && fullResponse) {
            await db.insert(cfoChatHistory).values([
              { userId: user.id, sessionId, role: "user",      content: userMessage.content },
              { userId: user.id, sessionId, role: "assistant", content: fullResponse },
            ]);
          }
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type":  "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection":    "keep-alive",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return Response.json({ error: msg }, { status });
  }
}

// ─── System prompt builders ───────────────────────────────────────────────────

async function buildSystemPrompt(user: Awaited<ReturnType<typeof requireAuth>>): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);

  if (user.role === "customer") {
    return buildCustomerPrompt(user.id, user.qbCustomerId, today);
  }
  return buildCFOPrompt(user.id, user.role, today);
}

async function buildCFOPrompt(userId: string, role: string, today: string): Promise<string> {
  // For company: find their QB connection. For super_admin: get all active connections.
  const connections = role === "super_admin"
    ? await db.select().from(cfoQbConnections).where(eq(cfoQbConnections.isActive, true)).limit(5)
    : await db.select().from(cfoQbConnections)
        .where(and(eq(cfoQbConnections.userId, userId), eq(cfoQbConnections.isActive, true)))
        .limit(1);

  if (connections.length === 0) {
    return `You are an expert CFO assistant. Today is ${today}. The user has not connected QuickBooks yet — remind them to connect at /qb-connect. Answer general financial questions until then.`;
  }

  const reportSections: string[] = [];
  for (const conn of connections) {
    const reports = await db
      .select({ reportType: cfoCalculatedReports.reportType, data: cfoCalculatedReports.data, calculatedAt: cfoCalculatedReports.calculatedAt })
      .from(cfoCalculatedReports)
      .where(eq(cfoCalculatedReports.realmId, conn.realmId));

    const byType: Record<string, unknown> = {};
    for (const r of reports) byType[r.reportType] = r.data;

    reportSections.push(`
## Company: ${conn.companyName ?? conn.realmId} (last sync: ${conn.lastSyncAt?.toISOString().slice(0, 10) ?? "never"})
Revenue Analysis: ${JSON.stringify(byType["revenue_analysis"] ?? "no data")}
Cash Flow: ${JSON.stringify(byType["cash_flow"] ?? "no data")}
KPI: ${JSON.stringify(byType["kpi"] ?? "no data")}
Risk: ${JSON.stringify(byType["risk"] ?? "no data")}`.trim());
  }

  return `You are an expert CFO assistant. Today is ${today}.
Respond concisely. Use specific numbers from the data. Always cite which metric you are referencing.
Suggest follow-up questions when relevant. Keep answers under 200 words unless the user asks for detail.

FINANCIAL CONTEXT (from QuickBooks):
${reportSections.join("\n\n")}`;
}

async function buildCustomerPrompt(userId: string, qbCustomerId: string | null, today: string): Promise<string> {
  if (!qbCustomerId) {
    return `You are an account assistant. Today is ${today}. This account has not been linked to a QuickBooks customer yet. Tell the user to contact their account manager.`;
  }

  const invoices = await db
    .select({
      invoiceNumber: cfoQbInvoices.invoiceNumber,
      totalAmount:   cfoQbInvoices.totalAmount,
      balance:       cfoQbInvoices.balance,
      dueDate:       cfoQbInvoices.dueDate,
      txnDate:       cfoQbInvoices.txnDate,
      status:        cfoQbInvoices.status,
    })
    .from(cfoQbInvoices)
    .where(eq(cfoQbInvoices.customerId, qbCustomerId))
    .limit(50);

  const open = invoices.filter(i => i.status === "Open");
  const totalOwed = open.reduce((s, i) => s + Number(i.balance ?? 0), 0);
  const nextDue = open.filter(i => i.dueDate).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0];

  return `You are an account assistant. Today is ${today}.
Only discuss this customer's own invoices and payments. Do not reveal other customers' data.
Keep answers concise.

ACCOUNT CONTEXT:
Total outstanding balance: $${totalOwed.toFixed(2)}
Next payment due: ${nextDue ? `${nextDue.invoiceNumber} — $${Number(nextDue.balance).toFixed(2)} due ${nextDue.dueDate}` : "none"}
All invoices (last 50): ${JSON.stringify(invoices)}`;
}
