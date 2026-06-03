"use client";

import { useEffect, useState } from "react";
import { I } from "@/components/icons";
import { StatusPill } from "@/components/ui/status-pill";
import { PageLoader } from "@/components/ui/spinner";
import { useApp } from "@/lib/app-context";

interface Briefing {
  text: string;
  highlights: string[];
  suggestions: string[];
  generatedAt: string;
}

function highlightText(text: string, highlights: string[]): React.ReactNode[] {
  if (!highlights.length) return [text];

  // Build a regex that matches any of the highlight phrases (longest first to avoid partial matches)
  const sorted = [...highlights].sort((a, b) => b.length - a.length);
  const pattern = sorted.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`(${pattern})`, "g");

  const parts = text.split(regex);
  return parts.map((part, i) =>
    highlights.includes(part)
      ? <span key={i} className="hl">{part}</span>
      : part
  );
}

function formatGenerated(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

interface CustomerInvoice {
  id: string;
  invoiceNumber: string | null;
  issued: string | null;
  due: string | null;
  amount: number;
  balance: number;
  status: string;
}

interface CustomerData {
  invoices: CustomerInvoice[];
  totalOwed: number;
  notLinked?: boolean;
}

type Filter = "All" | "Open" | "Paid" | "Overdue";

export default function CustomerPortal() {
  const { user, openChat, askAI } = useApp();
  const [data, setData] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("All");
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(true);

  useEffect(() => {
    fetch("/api/customer/invoices")
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));

    fetch("/api/ai/briefing")
      .then(r => r.json())
      .then(d => { if (!d.notLinked && !d.error) setBriefing(d); })
      .catch(console.error)
      .finally(() => setBriefingLoading(false));
  }, []);

  const invoices = data?.invoices ?? [];
  const filtered = filter === "All" ? invoices : invoices.filter(i => i.status === filter);
  const nextDue = invoices.find(i => i.status === "Open" || i.status === "Overdue");

  if (loading) return <div className="page"><PageLoader /></div>;

  if (data?.notLinked) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Hi {user?.name?.split(" ")[0] ?? "there"},</h1>
            <p className="page-sub">Here&apos;s your account overview.</p>
          </div>
        </div>
        <div className="empty" style={{ marginTop: 40 }}>
          <div className="h-title" style={{ marginBottom: 8 }}>Account not set up yet</div>
          <p className="muted" style={{ maxWidth: 400, textAlign: "center" }}>
            Your account isn&apos;t fully set up yet. Contact your account manager —
            they need to assign you to a company and ensure your name or email
            matches your QuickBooks record.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Hi {user?.name?.split(" ")[0] ?? "there"},</h1>
          <p className="page-sub">Here&apos;s your account overview.</p>
        </div>
        <div className="row gap-3">
          <button type="button" className="btn btn-primary btn-sm" onClick={openChat}>
            <I.Sparkle size={13} /> Ask
          </button>
        </div>
      </div>

      {/* AI Briefing */}
      {(briefing || briefingLoading) && (
        <div className="briefing">
          <div className="briefing-deco" />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div className="briefing-eyebrow">
              <span className="pulse" />
              Account Briefing
              <span style={{ opacity: 0.5 }}>·</span>
              {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}
            </div>

            {briefingLoading ? (
              <div className="briefing-body" style={{ opacity: 0.35, fontSize: 20 }}>
                Generating your account summary…
              </div>
            ) : briefing ? (
              <>
                <div className="briefing-body">
                  {highlightText(briefing.text, briefing.highlights)}
                </div>
                <div className="briefing-foot">
                  {briefing.suggestions.map(s => (
                    <button
                      key={s}
                      className="suggestion"
                      onClick={() => { openChat(); askAI(s); }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="briefing-meta">
                  Generated {formatGenerated(briefing.generatedAt)} · grounded in QuickBooks · gpt-4o-mini
                </div>
              </>
            ) : null}
          </div>

          <div className="briefing-side">
            <span className="badge b-accent">
              <I.Sparkle size={11} /> AI · CFO
            </span>
          </div>
        </div>
      )}

      {/* Outstanding balance hero */}
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "28px 32px", marginBottom: 20 }}>
        <div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Total outstanding balance</div>
          <div className="amount xl" style={{ fontSize: 48 }}>${(data?.totalOwed ?? 0).toLocaleString()}</div>
          {nextDue && (
            <div className="row gap-3 muted" style={{ marginTop: 12, fontSize: 13 }}>
              <I.Clock size={12} style={{ marginRight: 4 }} />
              Next due {nextDue.due ?? "—"} · {nextDue.invoiceNumber ?? nextDue.id}
            </div>
          )}
        </div>
        <div className="col gap-3">
          <button type="button" className="btn btn-primary btn-lg">Pay now <I.Arrow size={13} /></button>
          <button type="button" className="btn btn-block">Set up auto-pay</button>
        </div>
      </div>

      {/* Invoice list */}
      <div className="card flush">
        <div className="card-header">
          <div className="row gap-3">
            <div className="card-title">Invoices</div>
            <div className="tabs">
              {(["All", "Open", "Paid", "Overdue"] as Filter[]).map(f => (
                <button key={f} type="button" className={`tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>{f}</button>
              ))}
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>{invoices.length} total</div>
        </div>
        {filtered.length === 0
          ? <div className="muted" style={{ padding: 24, textAlign: "center" }}>No invoices</div>
          : (
            <table className="tbl">
              <thead>
                <tr><th>Invoice</th><th>Issued</th><th>Due</th><th style={{ textAlign: "right" }}>Amount</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {filtered.map(inv => (
                  <tr key={inv.id} className="clickable">
                    <td className="num" style={{ color: "var(--fg-2)" }}>{inv.invoiceNumber ?? inv.id}</td>
                    <td className="muted">{inv.issued ?? "—"}</td>
                    <td className="muted">{inv.due ?? "—"}</td>
                    <td className="amount" style={{ textAlign: "right", fontWeight: 500 }}>${inv.amount.toLocaleString()}</td>
                    <td><StatusPill status={inv.status} /></td>
                    <td>
                      <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
                        <button type="button" className="btn btn-ghost btn-sm" title="View"><I.Eye size={13} /></button>
                        <button type="button" className="btn btn-ghost btn-sm" title="Download PDF"><I.Download size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>

     
    </div>
  );
}
