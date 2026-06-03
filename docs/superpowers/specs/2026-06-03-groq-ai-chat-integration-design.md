# Groq AI Chat Integration — Design Spec

**Date:** 2026-06-03  
**Status:** Approved  
**Approach:** Option A — Streaming SSE with full history persistence

---

## Overview

Replace the hardcoded `pickResponse()` mock in `ChatPanel` with a real streaming Groq AI integration. Every conversation turn is persisted to a new `cfo_chat_history` DB table. The system prompt is role-scoped, injecting live financial context from `cfo_calculated_reports` (for company/super_admin) or QB invoice data (for customers).

---

## 1. Database Schema

Add `cfo_chat_history` table to `src/db/schema.ts`:

```ts
export const cfoChatHistory = pgTable("cfo_chat_history", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    uuid("user_id").notNull(),        // FK → cfo_users.id
  sessionId: uuid("session_id").notNull(),     // groups a conversation; generated client-side
  role:      text("role").notNull(),           // "user" | "assistant"
  content:   text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

Push with `npm run db:push` (dev). No migration file needed at this stage.

---

## 2. API Route — `POST /api/ai/chat`

**File:** `src/app/api/ai/chat/route.ts`

### Request body
```ts
{ messages: { role: "user" | "assistant"; content: string }[]; sessionId: string }
```

### Steps

1. **Auth** — `requireAuth()`. Resolve `realmId`:
   - `company`: from `cfo_qb_connections` where `userId = user.id`
   - `super_admin`: same lookup (uses whichever company they manage)
   - `customer`: no realmId needed; use `user.qbCustomerId`

2. **Build system prompt** — role-scoped:
   - `super_admin` / `company`: query `cfo_calculated_reports` for all 4 report types (`revenue_analysis`, `cash_flow`, `kpi`, `risk`) for their `realmId`. Serialize as compact JSON and inject into system prompt.
   - `customer`: query `cfo_qb_invoices` where `customerId = user.qbCustomerId`. Summarize open balance, due dates, recent payments.

3. **Groq call** — `new Groq({ apiKey: process.env.GROQ_API_KEY })`, model `llama-3.3-70b-versatile`, `stream: true`. Pass system prompt + last 20 message turns.

4. **Stream response** — return `new Response(ReadableStream, { headers: { 'Content-Type': 'text/event-stream' } })`. Forward each chunk as `data: <token>\n\n`. Signal end with `data: [DONE]\n\n`.

5. **Persist** — after stream completes, insert the user turn and the fully assembled assistant response into `cfo_chat_history` (both rows, same `sessionId`).

### Error handling
- No realmId found (company not connected QB yet): return system prompt with a note to connect QB first; still stream a helpful response.
- Groq API error: return `500` JSON, do not stream partial content.

---

## 3. System Prompt Templates

### super_admin / company
```
You are an expert CFO assistant for [companyName]. 
Today is [date]. Respond concisely. Use dollar amounts and percentages.
Always cite which data you're drawing from.

FINANCIAL CONTEXT (last sync):
Revenue Analysis: <json>
Cash Flow: <json>
KPI: <json>
Risk: <json>
```

### customer
```
You are an account assistant for [customerName].
Today is [date]. Only discuss this customer's own invoices and payments.

ACCOUNT CONTEXT:
Open invoices: <list>
Total owed: $X
Next due: <date>
```

---

## 4. ChatPanel Client Changes

**File:** `src/components/layout/chat-panel.tsx`

- Remove `pickResponse()` function entirely.
- Add `sessionId` ref: `useRef(crypto.randomUUID())` — stable per mount.
- Add `streamingBody` state (`string | null`) — the in-progress assistant message being streamed.
- Rewrite `send(text)`:
  1. Append user message to `messages` state.
  2. Set `streamingBody = ""`.
  3. `fetch('/api/ai/chat', { method: 'POST', body: JSON.stringify({ messages, sessionId }) })`.
  4. Read `response.body` as a stream; for each `data:` chunk, append token to `streamingBody`.
  5. On `[DONE]`, push completed message to `messages`, clear `streamingBody`.
- Render: while `streamingBody !== null`, show it as the last AI bubble (typing indicator replaced by live text).
- Send last 20 turns to the API to keep token usage bounded.
- Remove `flashHighlight` calls (were mock-only).
- Keep quick-action buttons — they call `send(qa.title)` which now hits the real API.

---

## 5. Dependencies

- Install `groq-sdk`: `npm install groq-sdk`
- Add `GROQ_API_KEY` to `.env` and `.env.example`

---

## 6. Files Changed

| File | Change |
|---|---|
| `src/db/schema.ts` | Add `cfoChatHistory` table + type exports |
| `src/app/api/ai/chat/route.ts` | New streaming API route |
| `src/components/layout/chat-panel.tsx` | Replace mock with real streaming fetch |
| `.env` / `.env.example` | Add `GROQ_API_KEY` |
| `package.json` | Add `groq-sdk` dependency |

---

## 7. Out of Scope (this iteration)

- Daily AI insights / `ai_insights` table
- Chat history UI (loading previous sessions)
- Token auto-refresh for QB
- Supabase Vault for token storage
