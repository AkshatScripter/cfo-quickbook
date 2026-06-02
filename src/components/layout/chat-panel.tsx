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
  followups?: string[];
  highlights?: string[];
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

function pickResponse(text: string, role: string) {
  const q = text.toLowerCase();
  if (role === "customer") {
    if (q.includes("owe") || q.includes("balance")) return { body: "You currently owe $12,400 across 1 unpaid invoice. INV-1042 (issued May 18) is due on Jun 17, 2026.", source: "Based on your invoice ledger from Acme Holdings", followups: ["See full invoice history", "Download INV-1042 as PDF", "Set up a payment reminder"] };
    if (q.includes("due") || q.includes("when")) return { body: "Your next payment of $12,400 is due Jun 17, 2026 — that's in 20 days. No other invoices are scheduled within the next 90 days.", source: "Based on open invoices from Acme Holdings", followups: ["What's my payment history?", "Email me a reminder", "Download invoice"] };
    return { body: "I can help with invoices, payment history, and amounts due. Try one of the suggestions below.", followups: ["What do I owe?", "When is my next payment?", "Show my paid invoices"] };
  }
  if (q.includes("revenue") || q.includes("sales") || q.includes("top customer")) return { body: "Revenue this month is $184,320 — that's +13.2% MoM and your best month in the trailing 6. Customer A drove 26% of MTD revenue ($48,200), with the top 4 customers accounting for 68% combined.", source: "Based on your Q2 P&L and invoice ledger", highlights: ["revenueMTD"], followups: ["Compare to same period last year", "Show me revenue by product", "Which customer grew fastest?"] };
  if (q.includes("cash") || q.includes("runway") || q.includes("forecast")) return { body: "Projected cash in 90 days: $328,600 — down $84,300 from today. At your current burn ($38,500/mo) you have ~10.7 months of runway.", source: "Based on Cash Flow Statement + AR/AP aging", highlights: ["cashOnHand", "runway"], followups: ["What if we pause hiring?", "Show me upcoming large outflows", "Compare burn to last quarter"] };
  if (q.includes("expense") || q.includes("spike") || q.includes("cost")) return { body: "Expenses are up 8% MoM, driven mostly by Software (+41% vs Q1). The single largest jump was a new annual SaaS contract booked in April.", source: "Based on Expenses by Category, last 6 months", followups: ["Why is software up so much?", "Show all expenses over $1,000", "Compare to industry benchmark"] };
  if (q.includes("overdue") || q.includes("risk") || q.includes("late") || q.includes("dso") || q.includes("ar days")) return { body: "3 invoices are 30+ days overdue, totaling $14,860. Customer C is the largest at $6,200 (47 days late). Your DSO climbed from 28 to 32 days this quarter.", source: "Based on Accounts Receivable Aging", highlights: ["arDays"], followups: ["Send a reminder to Customer C", "Show DSO trend over the year", "Flag any payment patterns"] };
  if (q.includes("margin") || q.includes("kpi") || q.includes("burn")) return { body: "Gross margin sits at 62% (+3.2 pts QoQ) and net margin at 18%. Burn rate is steady at $38,500/mo. AR days improved slightly to 32 from 35.", source: "Based on P&L + AR aging across last 3 quarters", highlights: ["runway", "arDays"], followups: ["What's driving margin improvement?", "Compare KPIs to last year", "Show category-level expense ratios"] };
  return { body: "I can analyze your QuickBooks data — try asking about revenue, cash flow, expenses, margins, or specific customers.", followups: ["Summarize this month's P&L", "What's my biggest expense category?", "Which customer pays slowest?"] };
}

export function ChatPanel() {
  const { user, role, navigate, closeChat, flashHighlight, pinInsight, pinned, pendingPrompt, clearPendingPrompt } = useApp();

  const [messages, setMessages] = useState<Message[]>(() => [{
    id: "welcome",
    kind: "ai",
    body: role === "customer"
      ? "Hi — I'm your account assistant. Ask me anything about your invoices, payments, or balance."
      : "I'm your CFO assistant, grounded in your live QuickBooks data. Ask about revenue, cash flow, expenses, margins — or tap a quick action.",
    meta: "Just now",
  }]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, typing]);

  function send(text?: string) {
    const t = (text ?? input).trim();
    if (!t) return;
    const userId = `u-${Date.now()}`;
    setMessages(m => [...m, { id: userId, kind: "user", body: t, meta: "Just now" }]);
    setInput("");
    setTyping(true);
    setTimeout(() => {
      const r = pickResponse(t, role);
      const aiId = `ai-${Date.now()}`;
      setMessages(m => [...m, { id: aiId, kind: "ai", body: r.body, source: r.source, followups: r.followups, highlights: r.highlights, meta: "Just now" }]);
      setTyping(false);
      if (r.highlights) r.highlights.forEach((h, idx) => setTimeout(() => flashHighlight(h), idx * 700));
    }, 900);
  }

  useEffect(() => {
    if (!pendingPrompt) return;
    if (pendingPrompt.highlight) flashHighlight(pendingPrompt.highlight);
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
          <span className="sub">claude-sonnet-4</span>
        </div>
        <div className="row gap-2" style={{ marginLeft: "auto" }}>
          <button className="btn btn-ghost btn-sm" title="New conversation"><I.Plus size={14} /></button>
          <button className="btn btn-ghost btn-sm" title="Close" onClick={closeChat}><I.X size={14} /></button>
        </div>
      </div>

      <div className="chat-body scroll" ref={bodyRef}>
        {messages.length === 1 && (
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
              {m.followups && (
                <div style={{ marginTop: 4 }}>
                  {m.followups.map(f => (
                    <button key={f} className="suggestion" onClick={() => send(f)}>{f}</button>
                  ))}
                </div>
              )}
              <div className="meta">{m.meta}</div>
            </div>
          </div>
        ))}

        {typing && (
          <div className="msg ai">
            <div className="who">C</div>
            <div>
              <div className="bubble"><span className="typing"><span /><span /><span /></span></div>
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
          />
          <div className="composer-tools">
            <button className="btn btn-ghost btn-sm" title="Attach"><I.Attach size={14} /></button>
            <button className="btn btn-ghost btn-sm" title="Suggestions"><I.Sparkle size={14} /></button>
            <button className="composer-send" onClick={() => send()} disabled={!input.trim()} title="Send (↵)">
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
