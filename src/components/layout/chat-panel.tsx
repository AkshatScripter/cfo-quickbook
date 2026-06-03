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

  const welcomeMsg: Message = {
    id: "welcome",
    kind: "ai",
    body: role === "customer"
      ? "Hi — I'm your account assistant. Ask me anything about your invoices, payments, or balance."
      : "I'm your CFO assistant, grounded in your live QuickBooks data. Ask about revenue, cash flow, expenses, margins — or tap a quick action.",
    meta: "Just now",
  };

  const sessionId = useRef(crypto.randomUUID());
  const [messages, setMessages] = useState<Message[]>([welcomeMsg]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [streamingBody, setStreamingBody] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // Load previous chat history on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch("/api/ai/chat/history");
        if (!res.ok) return;
        const rows = await res.json() as { id: string; role: string; content: string; createdAt: string }[];
        if (rows.length === 0) return;
        const loaded: Message[] = rows.map(r => ({
          id: r.id,
          kind: r.role === "assistant" ? "ai" : "user",
          body: r.content,
          meta: new Date(r.createdAt).toLocaleString(),
        }));
        setMessages(loaded);
      } catch { /* ignore */ } finally {
        setHistoryLoaded(true);
      }
    }
    loadHistory();
  }, []);

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

    const apiMessages = nextMessages
      .filter(m => m.id !== "welcome")
      .map(m => ({ role: m.kind === "ai" ? "assistant" : "user", content: m.body }));

    try {
      abortRef.current = new AbortController();
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, sessionId: sessionId.current }),
        signal: abortRef.current.signal,
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

        let streamDone = false;
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") { streamDone = true; break; }
          try {
            const token = JSON.parse(payload) as string;
            accumulated += token;
            setStreamingBody(accumulated);
          } catch { /* ignore malformed chunk */ }
        }
        if (streamDone) break;
      }

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
          <button className="btn btn-ghost btn-sm" title="New conversation" onClick={() => { setMessages([welcomeMsg]); sessionId.current = crypto.randomUUID(); }}><I.Plus size={14} /></button>
          <button className="btn btn-ghost btn-sm" title="Close" onClick={closeChat}><I.X size={14} /></button>
        </div>
      </div>

      <div className="chat-body scroll" ref={bodyRef}>
        {!historyLoaded && (
          <div className="msg ai">
            <div className="who">C</div>
            <div><div className="bubble"><span className="typing"><span /><span /><span /></span></div></div>
          </div>
        )}
        {historyLoaded && messages.length === 1 && messages[0].id === "welcome" && streamingBody === null && (
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

        {historyLoaded && !(messages.length === 1 && messages[0].id === "welcome") && messages.map((m, i) => (
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
