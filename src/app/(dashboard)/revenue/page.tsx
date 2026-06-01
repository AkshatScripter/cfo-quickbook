"use client";

import { useEffect, useState } from "react";
import { I } from "@/components/icons";
import { LineChart } from "@/components/ui/line-chart";
import { PageLoader } from "@/components/ui/spinner";

interface RevenueData {
  mtd: number;
  prevMtd: number;
  momGrowth: number | null;
  totalRevenue: number;
  months: { month: string; amount: number }[];
  topCustomers: { name: string; amount: number; pct: number }[];
}

type Period = "Monthly" | "Quarterly" | "YTD";

export default function RevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("Monthly");

  useEffect(() => {
    fetch("/api/dashboard/revenue")
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><PageLoader /></div>;

  const points = data?.months?.map(m => ({ x: m.month.slice(5), y: m.amount })) ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Revenue Analysis</h1>
          <p className="page-sub">Source: QuickBooks invoices — calculated from raw transaction data</p>
        </div>
        <div className="row gap-3">
          <div className="tabs">
            {(["Monthly", "Quarterly", "YTD"] as Period[]).map(p => (
              <button key={p} type="button" className={`tab ${period === p ? "active" : ""}`} onClick={() => setPeriod(p)}>{p}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="card stat">
          <div className="stat-label">Revenue MTD</div>
          <div className="stat-value">${((data?.mtd ?? 0) / 1000).toFixed(1)}<span className="unit">K</span></div>
          {data?.momGrowth != null && (
            <div className={`stat-delta ${data.momGrowth >= 0 ? "pos" : "neg"}`}>
              {data.momGrowth >= 0 ? <I.ArrowUp size={11} /> : <I.ArrowDown size={11} />}
              {data.momGrowth > 0 ? "+" : ""}{data.momGrowth}% vs last month
            </div>
          )}
        </div>
        <div className="card stat">
          <div className="stat-label">Total revenue (all time)</div>
          <div className="stat-value">${((data?.totalRevenue ?? 0) / 1000).toFixed(1)}<span className="unit">K</span></div>
        </div>
        <div className="card stat">
          <div className="stat-label">Top customers</div>
          <div className="stat-value">{data?.topCustomers?.length ?? 0}</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        <div className="card flush" style={{ gridColumn: "span 2" }}>
          <div className="card-header">
            <div className="card-title">Monthly revenue trend</div>
          </div>
          <div style={{ padding: "12px 16px 8px" }}>
            {points.length > 0
              ? <LineChart points={points} accent height={260} />
              : <div className="muted" style={{ padding: 40, textAlign: "center" }}>No revenue data. Connect QuickBooks and run a sync.</div>
            }
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card flush">
          <div className="card-header">
            <div className="card-title">Top revenue sources</div>
            <div className="muted-2" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>BY CUSTOMER</div>
          </div>
          <div style={{ padding: "16px 16px 4px" }}>
            {data?.topCustomers?.length
              ? data.topCustomers.map((c, i) => (
                <div key={c.name} style={{ marginBottom: 14 }}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                    <span>{c.name}</span>
                    <span className="amount" style={{ fontWeight: 500 }}>
                      ${c.amount.toLocaleString()} <span className="muted" style={{ fontWeight: 400 }}>· {c.pct}%</span>
                    </span>
                  </div>
                  <div style={{ height: 6, background: "var(--bg-2)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(c.pct * 2.5, 100)}%`, height: "100%", background: i === 0 ? "var(--accent)" : "var(--fg)", borderRadius: 99 }} />
                  </div>
                </div>
              ))
              : <div className="muted" style={{ padding: 24, textAlign: "center" }}>No customer data yet</div>
            }
          </div>
        </div>

        <div className="card flush">
          <div className="card-header">
            <div className="card-title">Month-over-month</div>
            <div className="muted-2" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>LAST 6 MONTHS</div>
          </div>
          <div style={{ padding: 16 }}>
            <table className="tbl" style={{ marginTop: -8 }}>
              <thead><tr><th>Month</th><th style={{ textAlign: "right" }}>Revenue</th></tr></thead>
              <tbody>
                {(data?.months?.slice(-6) ?? []).map(m => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td className="amount" style={{ textAlign: "right" }}>${m.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
