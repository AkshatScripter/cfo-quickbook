"use client";

import { useEffect, useState } from "react";
import { I } from "@/components/icons";
import { PageLoader } from "@/components/ui/spinner";

interface RiskData {
  totalOverdue: number;
  topCustomerPct: number;
  overdueInvoices: {
    id: string;
    invoiceNumber: string | null;
    customer: string | null;
    amount: number;
    dueDate: string | null;
    daysOverdue: number;
  }[];
  expenseSpikes: {
    category: string;
    current: number;
    previous: number;
    changePct: number | null;
  }[];
  risks: {
    kind: string;
    tag: string;
    title: string;
    body: string;
  }[];
}

function riskIcon(kind: string) {
  if (kind === "warn") return I.Warning;
  if (kind === "neg") return I.TrendDown;
  return I.Check;
}

export default function RiskPage() {
  const [data, setData] = useState<RiskData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/risk")
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><PageLoader /></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Risk Assessment</h1>
          <p className="page-sub">Overdue invoices, expense spikes, and revenue concentration — auto-detected from QB data</p>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="card stat" style={{ borderLeft: "3px solid var(--negative)" }}>
          <div className="stat-label">Overdue invoices</div>
          <div className="stat-value">{data?.overdueInvoices?.length ?? 0}</div>
          <div className="muted" style={{ fontSize: 12 }}>${(data?.totalOverdue ?? 0).toLocaleString()} outstanding</div>
        </div>
        <div className="card stat" style={{ borderLeft: "3px solid var(--warning)" }}>
          <div className="stat-label">Expense spikes</div>
          <div className="stat-value">{data?.expenseSpikes?.length ?? 0}</div>
          <div className="muted" style={{ fontSize: 12 }}>Categories up &gt;20% this month</div>
        </div>
        <div className="card stat" style={{ borderLeft: "3px solid var(--info)" }}>
          <div className="stat-label">Revenue concentration</div>
          <div className="stat-value">{data?.topCustomerPct ?? 0}<span className="unit">%</span></div>
          <div className="muted" style={{ fontSize: 12 }}>Top customer share</div>
        </div>
      </div>

      {/* Risk list */}
      <div className="card flush" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">Active risks</div>
        </div>
        {data?.risks?.length
          ? (
            <div>
              {data.risks.map((r, idx) => {
                const IconC = riskIcon(r.kind);
                return (
                  <div key={`${r.tag}-${idx}`} className="alert-row">
                    <div className={`alert-icon ${r.kind}`}><IconC size={15} /></div>
                    <div style={{ flex: 1 }}>
                      <div className="row gap-3" style={{ marginBottom: 2 }}>
                        <span className="alert-title">{r.title}</span>
                        <span className="badge">{r.tag}</span>
                      </div>
                      <div className="alert-body">{r.body}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
          : <div className="muted" style={{ padding: 24, textAlign: "center" }}>No risks detected — looking good!</div>
        }
      </div>

      {/* Overdue invoices */}
      <div className="card flush" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">Overdue invoices</div>
          <div className="muted-2" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>BALANCE &gt; 0, PAST DUE DATE</div>
        </div>
        {data?.overdueInvoices?.length
          ? (
            <table className="tbl">
              <thead><tr><th>Invoice</th><th>Customer</th><th>Due date</th><th>Days overdue</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
              <tbody>
                {data.overdueInvoices.map(inv => (
                  <tr key={inv.id} className="clickable">
                    <td className="num">{inv.invoiceNumber ?? inv.id}</td>
                    <td>{inv.customer ?? "—"}</td>
                    <td className="muted">{inv.dueDate ?? "—"}</td>
                    <td><span className="badge b-negative">{inv.daysOverdue}d</span></td>
                    <td className="amount" style={{ textAlign: "right" }}>${inv.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
          : <div className="muted" style={{ padding: 24, textAlign: "center" }}>No overdue invoices</div>
        }
      </div>

      {/* Expense spikes */}
      <div className="card flush">
        <div className="card-header">
          <div className="card-title">Expense spikes</div>
          <div className="muted-2" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>VS PREVIOUS 30 DAYS</div>
        </div>
        {data?.expenseSpikes?.length
          ? (
            <table className="tbl">
              <thead><tr><th>Category</th><th style={{ textAlign: "right" }}>This period</th><th style={{ textAlign: "right" }}>Last period</th><th>Change</th></tr></thead>
              <tbody>
                {data.expenseSpikes.map(s => (
                  <tr key={s.category}>
                    <td>{s.category}</td>
                    <td className="amount" style={{ textAlign: "right" }}>${s.current.toLocaleString()}</td>
                    <td className="amount muted" style={{ textAlign: "right" }}>${s.previous.toLocaleString()}</td>
                    <td><span className="badge b-warning">+{s.changePct}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
          : <div className="muted" style={{ padding: 24, textAlign: "center" }}>No significant expense spikes</div>
        }
      </div>
    </div>
  );
}
