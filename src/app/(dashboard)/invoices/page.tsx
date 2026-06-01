"use client";

import { useEffect, useState } from "react";
import { I } from "@/components/icons";
import { StatusPill } from "@/components/ui/status-pill";
import { PageLoader } from "@/components/ui/spinner";

interface Invoice {
  id: string;
  invoiceNumber: string | null;
  customer: string | null;
  issued: string | null;
  due: string | null;
  amount: string;
  balance: string;
  status: string;
}

type Filter = "All" | "Open" | "Paid" | "Overdue";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("All");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/invoices")
      .then(r => r.json())
      .then(d => setInvoices(d?.invoices ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = invoices.filter(inv => {
    const matchesFilter = filter === "All" || inv.status === filter;
    const matchesSearch = !search || [inv.invoiceNumber, inv.customer].some(v => v?.toLowerCase().includes(search.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const outstanding = invoices.filter(i => i.status === "Open").reduce((s, i) => s + Number(i.balance), 0);
  const overdue     = invoices.filter(i => i.status === "Overdue");
  const paid        = invoices.filter(i => i.status === "Paid").reduce((s, i) => s + Number(i.amount), 0);

  if (loading) return <div className="page"><PageLoader /></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-sub">All invoices synced from QuickBooks</p>
        </div>
        <div className="row gap-3">
          <button type="button" className="btn btn-primary btn-sm">
            <I.Plus size={13} /> New invoice
          </button>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <div className="card stat"><div className="stat-label">Outstanding</div><div className="stat-value">${(outstanding / 1000).toFixed(1)}<span className="unit">K</span></div></div>
        <div className="card stat"><div className="stat-label">Paid (all time)</div><div className="stat-value">${(paid / 1000).toFixed(1)}<span className="unit">K</span></div></div>
        <div className="card stat"><div className="stat-label">Overdue</div><div className="stat-value">{overdue.length}</div><div className="muted" style={{ fontSize: 12 }}>Need follow-up</div></div>
        <div className="card stat"><div className="stat-label">Total invoices</div><div className="stat-value">{invoices.length}</div></div>
      </div>

      <div className="card flush">
        <div className="card-header">
          <div className="tabs">
            {(["All", "Open", "Paid", "Overdue"] as Filter[]).map(f => (
              <button key={f} type="button" className={`tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
          <div className="search">
            <I.Search size={13} />
            <input
              placeholder="Search invoices…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        {filtered.length === 0
          ? <div className="muted" style={{ padding: 32, textAlign: "center" }}>No invoices found</div>
          : (
            <table className="tbl">
              <thead>
                <tr><th>Invoice</th><th>Customer</th><th>Issued</th><th>Due</th><th style={{ textAlign: "right" }}>Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {filtered.map(inv => (
                  <tr key={inv.id} className="clickable">
                    <td className="num" style={{ color: "var(--fg-2)" }}>{inv.invoiceNumber ?? inv.id}</td>
                    <td>{inv.customer ?? "—"}</td>
                    <td className="muted">{inv.issued ?? "—"}</td>
                    <td className="muted">{inv.due ?? "—"}</td>
                    <td className="amount" style={{ textAlign: "right", fontWeight: 500 }}>${Number(inv.amount).toLocaleString()}</td>
                    <td><StatusPill status={inv.status} /></td>
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
