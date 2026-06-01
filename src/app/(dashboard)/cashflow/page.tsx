"use client";

import { useEffect, useState } from "react";
import { LineChart } from "@/components/ui/line-chart";
import { PageLoader } from "@/components/ui/spinner";

interface CashFlowData {
  cashOnHand: number;
  burnRate: number;
  runwayMonths: number | null;
  forecast: { label: string; balance: number }[];
  upcomingInflows: { id: string; invoiceNumber: string | null; customer: string | null; amount: number; dueDate: string | null }[];
}

export default function CashflowPage() {
  const [data, setData] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/cashflow")
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><PageLoader /></div>;

  const points = data?.forecast?.map(p => ({ x: p.label, y: p.balance })) ?? [];
  const floor = data ? data.cashOnHand * 0.7 : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Cash Flow Forecast</h1>
          <p className="page-sub">Calculated from invoices, payments, and expenses — not the QB Reports API</p>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="card stat">
          <div className="stat-label">Estimated cash today</div>
          <div className="stat-value">${((data?.cashOnHand ?? 0) / 1000).toFixed(1)}<span className="unit">K</span></div>
          <div className="muted" style={{ fontSize: 12 }}>Receipts minus expenses</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Monthly burn rate</div>
          <div className="stat-value">${((data?.burnRate ?? 0) / 1000).toFixed(1)}<span className="unit">K</span></div>
          <div className="muted" style={{ fontSize: 12 }}>3-month average</div>
        </div>
        <div className="card stat" style={{ background: "var(--accent-soft)", border: "1px solid #DBEE9C" }}>
          <div className="stat-label" style={{ color: "#4D5E0F" }}>Runway</div>
          <div className="stat-value">{data?.runwayMonths === null || data?.runwayMonths === undefined ? "—" : data.runwayMonths}<span className="unit">months</span></div>
          <div style={{ fontSize: 12, color: "#4D5E0F" }}>At current burn rate</div>
        </div>
      </div>

      <div className="card flush" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">Projected balance</div>
          <div className="muted-2" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>NEXT 90 DAYS</div>
        </div>
        <div style={{ padding: "12px 16px 8px" }}>
          {points.length > 0
            ? <LineChart points={points} height={240} threshold={floor > 0 ? { y: floor, label: "Caution floor" } : null} />
            : <div className="muted" style={{ padding: 40, textAlign: "center" }}>No forecast data. Connect QuickBooks and run a sync.</div>
          }
        </div>
      </div>

      <div className="card flush">
        <div className="card-header">
          <div className="card-title">Upcoming inflows</div>
          <div className="muted-2" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>UNPAID INVOICES DUE NEXT 90 DAYS</div>
        </div>
        {data?.upcomingInflows?.length
          ? (
            <table className="tbl">
              <thead><tr><th>Invoice</th><th>Customer</th><th>Due date</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
              <tbody>
                {data.upcomingInflows.map(inv => (
                  <tr key={inv.id} className="clickable">
                    <td className="num">{inv.invoiceNumber ?? inv.id}</td>
                    <td>{inv.customer ?? "—"}</td>
                    <td className="muted">{inv.dueDate ?? "—"}</td>
                    <td className="amount" style={{ textAlign: "right" }}>${inv.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
          : <div className="muted" style={{ padding: 24, textAlign: "center" }}>No upcoming inflows</div>
        }
      </div>
    </div>
  );
}
