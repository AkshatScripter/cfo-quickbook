"use client";

import { useEffect, useState } from "react";
import { I } from "@/components/icons";
import { StatusPill } from "@/components/ui/status-pill";
import { PageLoader } from "@/components/ui/spinner";

interface CustomerInvoice {
  id: string;
  invoiceNumber: string | null;
  issued: string | null;
  due: string | null;
  amount: number;
  balance: number;
  status: string;
}

type Filter = "All" | "Open" | "Paid" | "Overdue";

export default function CustomerInvoices() {
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("All");

  useEffect(() => {
    fetch("/api/customer/invoices")
      .then(r => r.json())
      .then(d => setInvoices(d?.invoices ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === "All" ? invoices : invoices.filter(i => i.status === filter);

  if (loading) return <div className="page"><PageLoader /></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-sub">All your invoices in one place</p>
        </div>
      </div>

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
          ? <div className="muted" style={{ padding: 24, textAlign: "center" }}>No invoices found</div>
          : (
            <table className="tbl">
              <thead>
                <tr><th>Invoice</th><th>Issued</th><th>Due</th><th style={{ textAlign: "right" }}>Amount</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {filtered.map(inv => (
                  <tr key={inv.id}>
                    <td className="num" style={{ color: "var(--fg-2)" }}>{inv.invoiceNumber ?? inv.id}</td>
                    <td className="muted">{inv.issued ?? "—"}</td>
                    <td className="muted">{inv.due ?? "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 500 }}>${inv.amount.toLocaleString()}</td>
                    <td><StatusPill status={inv.status} /></td>
                    <td>
                      <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
                        <button type="button" className="btn btn-ghost btn-sm" title="View"><I.Eye size={13} /></button>
                        <button type="button" className="btn btn-ghost btn-sm" title="Download"><I.Download size={13} /></button>
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
