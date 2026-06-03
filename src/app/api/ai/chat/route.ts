import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, type ToolSet } from "ai";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db";
import { cfoQbConnections } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { buildSystemPrompt } from "@/lib/prompts";
import { createGetFinancialSummaryTool } from "@/lib/tools/getFinancialSummary";
import { createGetInvoicesTool, createGetMyInvoicesTool } from "@/lib/tools/getInvoices";

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const { message, history = [] } = await req.json();

    if (!message || typeof message !== "string") {
      return Response.json({ error: "message is required" }, { status: 400 });
    }

    // Resolve QB realm for company/super_admin users, or the company they belong to for customers
    const conn = await resolveConnection(user);

    const systemPrompt = buildSystemPrompt(user, conn?.companyName ?? undefined);

    const tools = buildTools(user.role, conn?.realmId, user.qbCustomerId);

    const result = await generateText({
      model: openai("gpt-4o-mini"),
      system: systemPrompt,
      messages: [...history, { role: "user", content: message }],
      tools,
      stopWhen: stepCountIs(5),
    });

    return Response.json({ answer: result.text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return Response.json({ error: msg }, { status });
  }
}

async function resolveConnection(user: { id: string; role: string; companyId: string | null }) {
  // Company user: look up their own QB connection
  if (user.role === "company") {
    const [conn] = await db
      .select()
      .from(cfoQbConnections)
      .where(and(eq(cfoQbConnections.userId, user.id), eq(cfoQbConnections.isActive, true)))
      .limit(1);
    return conn ?? null;
  }

  // Customer: look up the company they belong to
  if (user.role === "customer" && user.companyId) {
    const [conn] = await db
      .select()
      .from(cfoQbConnections)
      .where(and(eq(cfoQbConnections.userId, user.companyId), eq(cfoQbConnections.isActive, true)))
      .limit(1);
    return conn ?? null;
  }

  // super_admin: no specific realm — tools won't be registered
  return null;
}

function buildTools(
  role: string,
  realmId: string | undefined,
  qbCustomerId: string | null | undefined
): ToolSet {
  if (!realmId) return {};

  if (role === "customer" && qbCustomerId) {
    return { getMyInvoices: createGetMyInvoicesTool(realmId, qbCustomerId) };
  }

  return {
    getFinancialSummary: createGetFinancialSummaryTool(realmId),
    getInvoices: createGetInvoicesTool(realmId),
  };
}
