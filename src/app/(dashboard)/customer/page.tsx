"use client";

import { useEffect, useState } from "react";
import { I } from "@/components/icons";
import { StatusPill } from "@/components/ui/status-pill";
import { PageLoader } from "@/components/ui/spinner";
import { useApp } from "@/lib/app-context";

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
}

type Filter = "All" | "Open" | "Paid" | "Overdue";

export default function CustomerPortal() {
  const { user, openChat } = useApp();
  const [data, setData] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("All");

  useEffect(() => {
    fetch("/api/customer/invoices")
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const invoices = data?.invoices ?? [];
  const filtered = filter === "All" ? invoices : invoices.filter(i => i.status === filter);
  const nextDue = invoices.find(i => i.status === "Open" || i.status === "Overdue");

  if (loading) return <div className="page"><PageLoader /></div>;

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

      {/* Ask CFO prompt */}
      <div className="card" style={{ marginTop: 20, background: "var(--fg)", color: "#FAFAF9", border: "none", padding: 24 }}>
        <div className="row gap-4">
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--accent)", color: "var(--fg)", display: "grid", placeItems: "center", fontFamily: "var(--font-serif)", fontSize: 22, flexShrink: 0 }}>C</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, marginBottom: 4 }}>Quick question?</div>
            <div style={{ color: "rgba(250,250,249,0.7)", fontSize: 13.5, marginBottom: 12 }}>Ask about what you owe, payment dates, or invoice history.</div>
            <div className="row gap-2" style={{ flexWrap: "wrap" }}>
              {["What do I owe right now?", "When is my next payment due?"].map(s => (
                <button key={s} type="button" onClick={openChat} className="suggestion" style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.14)", color: "#FAFAF9" }}>{s}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
