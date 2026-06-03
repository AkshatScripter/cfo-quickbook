# Groq AI Chat Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded mock in ChatPanel with a real streaming Groq AI assistant that persists conversation history to the database.

**Architecture:** A new `POST /api/ai/chat` route streams tokens from Groq using SSE. Before calling Groq it builds a role-scoped system prompt from cached financial reports (`cfo_calculated_reports`) or customer invoice data. Every completed turn (user + assistant) is saved to a new `cfo_chat_history` table. The ChatPanel replaces its `setTimeout` mock with a real fetch+stream reader.

**Tech Stack:** groq-sdk, Next.js 16 App Router (streaming Response), Drizzle ORM, React 19

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/db/schema.ts` | Modify | Add `cfoChatHistory` table + type exports |
| `src/app/api/ai/chat/route.ts` | Create | Streaming POST route — auth, context, Groq call, DB persist |
| `src/components/layout/chat-panel.tsx` | Modify | Replace mock with real SSE fetch |
| `.env.example` | Modify | Document `GROQ_API_KEY` |

> `.env` already has `GROQ_API_KEY` set. `groq-sdk` is not yet installed.

---

## Task 1: Install groq-sdk

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install the package**

```bash
cd /home/bitcot/Desktop/cfo-quickbook
npm install groq-sdk
```

Expected output: `added N packages` with no errors.

- [ ] **Step 2: Verify it's importable**

```bash
node -e "const Groq = require('groq-sdk'); console.log('ok', typeof Groq)"
```

Expected: `ok function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install groq-sdk"
```

---

## Task 2: Add cfo_chat_history table to schema

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Add table definition**

Open `src/db/schema.ts`. After the `cfoApiErrors` table definition (around line 246), add:

```ts
// ─── cfo_chat_history ─────────────────────────────────────────────────────────
// Persisted AI chat turns — one row per message (user or assistant)

export const cfoChatHistory = pgTable("cfo_chat_history", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    uuid("user_id").notNull(),
  sessionId: uuid("session_id").notNull(),
  role:      text("role").notNull(),       // "user" | "assistant"
  content:   text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

- [ ] **Step 2: Add type exports**

At the bottom of `src/db/schema.ts`, after the existing type exports, add:

```ts
export type ChatHistory = typeof cfoChatHistory.$inferSelect;
export type NewChatHistory = typeof cfoChatHistory.$inferInsert;
```

- [ ] **Step 3: Push schema to DB**

```bash
npm run db:push
```

Expected: Drizzle detects the new table and creates it. Confirm with `Y` if prompted.

- [ ] **Step 4: Verify table exists**

```bash
npm run db:studio
```

Open the studio URL in a browser and confirm `cfo_chat_history` appears in the table list. Then close studio (Ctrl+C).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(db): add cfo_chat_history table for AI chat persistence"
```

---

## Task 3: Create the streaming AI chat API route

**Files:**
- Create: `src/app/api/ai/chat/route.ts`

- [ ] **Step 1: Create the file**

Create `src/app/api/ai/chat/route.ts` with the full implementation:

```ts
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/bitcot/Desktop/cfo-quickbook
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing unrelated errors).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/chat/route.ts
git commit -m "feat(api): add streaming POST /api/ai/chat with Groq + role-scoped context"
```

---

## Task 4: Update ChatPanel to use real streaming API

**Files:**
- Modify: `src/components/layout/chat-panel.tsx`

- [ ] **Step 1: Replace the entire file content**

Replace `src/components/layout/chat-panel.tsx` with:

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { I } from "@/components/icons";
import { useApp } from "@/lib/app-context";

interface QuickAction {
  id: string;
  title: string;
  sub: string;
  icon: keyof typeof I;
  goto?: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: "revenue",  title: "Revenue Analysis",      sub: "Break down revenue by period & source", icon: "Revenue", goto: "/revenue"  },
  { id: "cashflow", title: "Cash Flow Forecast",    sub: "30 / 60 / 90-day projection",           icon: "Cash",    goto: "/cashflow" },
  { id: "kpi",      title: "KPI Deep Dive",         sub: "Margins, burn rate, AR days",           icon: "Kpi",     goto: "/kpi"      },
  { id: "risk",     title: "Risk Assessment",       sub: "Overdue invoices, expense spikes",      icon: "Risk",    goto: "/risk"     },
];

const CUSTOMER_QUICKS: QuickAction[] = [
  { id: "owed",  title: "What do I owe?",     sub: "Outstanding balance",       icon: "Invoice"  },
  { id: "next",  title: "Next payment due",   sub: "Upcoming invoice date",     icon: "Clock"    },
  { id: "hist",  title: "Payment history",    sub: "Last 12 months",            icon: "Activity" },
  { id: "recpt", title: "Download receipt",   sub: "PDF for any paid invoice",  icon: "Download" },
];

interface Message {
  id: string;
  kind: "ai" | "user";
  body: string;
  source?: string;
  meta: string;
}

function formatSync(iso: string | null | undefined): string {
  if (!iso) return "never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ChatPanel() {
  const { user, role, navigate, closeChat, pinInsight, pinned, pendingPrompt, clearPendingPrompt } = useApp();

  const sessionId = useRef(crypto.randomUUID());
  const [messages, setMessages] = useState<Message[]>(() => [{
    id: "welcome",
    kind: "ai",
    body: role === "customer"
      ? "Hi — I'm your account assistant. Ask me anything about your invoices, payments, or balance."
      : "I'm your CFO assistant, grounded in your live QuickBooks data. Ask about revenue, cash flow, expenses, margins — or tap a quick action.",
    meta: "Just now",
  }]);
  const [input, setInput] = useState("");
  const [streamingBody, setStreamingBody] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Keep a stable ref to messages for use inside the stream closure
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, streamingBody]);

  async function send(text?: string) {
    const t = (text ?? input).trim();
    if (!t || streamingBody !== null) return;

    const userMsg: Message = { id: `u-${Date.now()}`, kind: "user", body: t, meta: "Just now" };
    const nextMessages = [...messagesRef.current, userMsg];
    setMessages(nextMessages);
    setInput("");
    setStreamingBody("");

    // Build the messages array to send (role + content only)
    const apiMessages = nextMessages
      .filter(m => m.id !== "welcome")
      .map(m => ({ role: m.kind === "ai" ? "assistant" : "user", content: m.body }));

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, sessionId: sessionId.current }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error ?? "Request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const token = JSON.parse(payload) as string;
            accumulated += token;
            setStreamingBody(accumulated);
          } catch { /* ignore malformed chunk */ }
        }
      }

      // Commit the completed AI message
      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        kind: "ai",
        body: accumulated || "Sorry, I couldn't generate a response.",
        meta: "Just now",
      };
      setMessages(m => [...m, aiMsg]);
    } catch (err) {
      const errMsg: Message = {
        id: `err-${Date.now()}`,
        kind: "ai",
        body: err instanceof Error ? `Error: ${err.message}` : "Something went wrong. Please try again.",
        meta: "Just now",
      };
      setMessages(m => [...m, errMsg]);
    } finally {
      setStreamingBody(null);
    }
  }

  useEffect(() => {
    if (!pendingPrompt) return;
    send(pendingPrompt.text);
    clearPendingPrompt();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  function handleQuick(qa: QuickAction) {
    if (qa.goto) navigate(qa.goto);
    send(qa.title);
  }

  const quicks = role === "customer" ? CUSTOMER_QUICKS : QUICK_ACTIONS;
  const isPinned = (id: string) => pinned.some(p => p.id === id);

  return (
    <aside className="chat-panel">
      <div className="chat-head">
        <div className="chat-title">
          <span className="mark">C</span>
          <span className="t">CFO Assistant</span>
          <span className="sub">llama-3.3-70b</span>
        </div>
        <div className="row gap-2" style={{ marginLeft: "auto" }}>
          <button className="btn btn-ghost btn-sm" title="New conversation" onClick={() => { setMessages([{ id: "welcome", kind: "ai", body: messages[0].body, meta: "Just now" }]); sessionId.current = crypto.randomUUID(); }}><I.Plus size={14} /></button>
          <button className="btn btn-ghost btn-sm" title="Close" onClick={closeChat}><I.X size={14} /></button>
        </div>
      </div>

      <div className="chat-body scroll" ref={bodyRef}>
        {messages.length === 1 && streamingBody === null && (
          <div style={{ paddingBottom: 4 }}>
            <div className="msg ai">
              <div className="who">C</div>
              <div>
                <div className="bubble">{messages[0].body}</div>
                <div className="meta">{messages[0].meta}</div>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div className="h-section" style={{ marginBottom: 10, fontSize: 11 }}>Quick actions</div>
              <div className="quick-grid">
                {quicks.map(qa => {
                  const IconC = I[qa.icon];
                  return (
                    <button key={qa.id} className="quick-action" onClick={() => handleQuick(qa)}>
                      <IconC size={16} />
                      <div className="qa-title">{qa.title}</div>
                      <div className="qa-sub">{qa.sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {messages.length > 1 && messages.map((m, i) => (
          <div key={m.id || i} className={`msg ${m.kind}`}>
            <div className="who">{m.kind === "ai" ? "C" : "Y"}</div>
            <div>
              <div className="bubble">{m.body}</div>
              {m.source && <div className="source"><I.Sparkle size={11} /> {m.source}</div>}
              {m.kind === "ai" && i > 0 && (
                <div style={{ marginTop: 6 }}>
                  <button
                    className={`pin-btn ${isPinned(m.id) ? "pinned" : ""}`}
                    onClick={() => pinInsight({ id: m.id, body: m.body, source: m.source })}
                    title={isPinned(m.id) ? "Pinned to dashboard" : "Pin to dashboard"}
                  >
                    {isPinned(m.id) ? <><I.Check size={11} /> Pinned</> : <><I.Plus size={11} /> Pin to dashboard</>}
                  </button>
                </div>
              )}
              <div className="meta">{m.meta}</div>
            </div>
          </div>
        ))}

        {streamingBody !== null && (
          <div className="msg ai">
            <div className="who">C</div>
            <div>
              <div className="bubble">
                {streamingBody === ""
                  ? <span className="typing"><span /><span /><span /></span>
                  : streamingBody}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="chat-foot">
        <div className="composer">
          <textarea
            placeholder={role === "customer" ? "Ask about your invoices, payments…" : "Ask about revenue, cash flow, expenses…"}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            disabled={streamingBody !== null}
          />
          <div className="composer-tools">
            <button className="btn btn-ghost btn-sm" title="Attach"><I.Attach size={14} /></button>
            <button className="btn btn-ghost btn-sm" title="Suggestions"><I.Sparkle size={14} /></button>
            <button className="composer-send" onClick={() => send()} disabled={!input.trim() || streamingBody !== null} title="Send (↵)">
              <I.Send size={13} />
            </button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: "var(--fg-4)", fontFamily: "var(--font-mono)" }}>
          <span>Grounded in QuickBooks · synced {formatSync(user?.lastSyncAt)}</span>
          <span><span className="kbd">↵</span> send</span>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/chat-panel.tsx
git commit -m "feat(chat): replace mock with real Groq streaming in ChatPanel"
```

---

## Task 5: Update .env.example and verify end-to-end

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add GROQ_API_KEY to .env.example**

Open `.env.example`. Find the `# ── AI CFO agent (Groq)` section. Ensure it reads:

```
# ── AI CFO agent (Groq) ──────────────────────────────────────────────────────
GROQ_API_KEY=your_groq_api_key_here
```

- [ ] **Step 2: Start the dev server**

```bash
npm run dev
```

Expected: server starts on http://localhost:3000 with no build errors.

- [ ] **Step 3: Manual smoke test**

1. Open http://localhost:3000 in a browser and log in
2. Open the chat panel (it should already be open)
3. Type: `What is my revenue this month?`
4. Press Enter
5. Verify: typing indicator appears, then real AI tokens stream in word-by-word
6. Verify: no console errors in browser devtools

- [ ] **Step 4: Verify DB persistence**

```bash
npm run db:studio
```

Open the studio URL, click `cfo_chat_history` — you should see two rows from your test message (one `user`, one `assistant` with the same `session_id`).

- [ ] **Step 5: Final commit**

```bash
git add .env.example
git commit -m "chore: document GROQ_API_KEY in .env.example"
```

---

## Done

The integration is complete when:
- Chat panel shows streaming token-by-token responses from Groq
- `cfo_chat_history` table contains persisted turns after each conversation
- TypeScript compiles cleanly
- New conversation button resets the session (new `sessionId`)
