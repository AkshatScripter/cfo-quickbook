"use client";

import { useEffect, useState } from "react";
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

export default function PaymentHistory() {
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/customer/invoices")
      .then(r => r.json())
      .then(d => setInvoices((d?.invoices ?? []).filter((i: CustomerInvoice) => i.status === "Paid")))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const totalPaid = invoices.reduce((s, i) => s + i.amount, 0);

  if (loading) return <div className="page"><PageLoader /></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Payment history</h1>
          <p className="page-sub">All completed payments</p>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        <div className="card stat">
          <div className="stat-label">Payments made</div>
          <div className="stat-value">{invoices.length}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Total paid</div>
          <div className="stat-value">${totalPaid.toLocaleString()}</div>
        </div>
      </div>

      <div className="card flush">
        <div className="card-header">
          <div className="card-title">Paid invoices</div>
        </div>
        {invoices.length === 0
          ? <div className="muted" style={{ padding: 24, textAlign: "center" }}>No payment history yet</div>
          : (
            <table className="tbl">
              <thead>
                <tr><th>Invoice</th><th>Issued</th><th>Paid on</th><th style={{ textAlign: "right" }}>Amount</th></tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td className="num" style={{ color: "var(--fg-2)" }}>{inv.invoiceNumber ?? inv.id}</td>
                    <td className="muted">{inv.issued ?? "—"}</td>
                    <td className="muted">{inv.due ?? "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 500 }}>${inv.amount.toLocaleString()}</td>
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
