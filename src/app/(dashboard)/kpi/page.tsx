"use client";

import { useEffect, useState } from "react";
import { LineChart } from "@/components/ui/line-chart";
import { PageLoader } from "@/components/ui/spinner";
import { Donut } from "@/components/ui/donut";

interface KPIData {
  grossMargin: number;
  burnRate: number;
  arDays: number | null;
  totalRevenue: number;
  totalExpenses: number;
  expenseBreakdown: { category: string; amount: number; pct: number }[];
  marginTrend: { month: string; grossMargin: number }[];
}

const COLORS = ["#0A0A0A", "#CFF53C", "#78716C", "#D6D3D1", "#44403C", "#A8A29E"];

export default function KPIPage() {
  const [data, setData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/kpi")
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><PageLoader /></div>;

  const marginPoints = data?.marginTrend?.map(m => ({ x: m.month.slice(5), y: m.grossMargin })) ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">KPI Deep Dive</h1>
          <p className="page-sub">Margins, burn rate, and AR days — calculated from raw QB data</p>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        {[
          { label: "Gross margin",  value: `${data?.grossMargin ?? 0}%`,  delta: "Revenue minus expenses", pos: true },
          { label: "Total revenue", value: `$${((data?.totalRevenue ?? 0) / 1000).toFixed(1)}K`, delta: "", pos: true },
          { label: "Burn rate",     value: `$${((data?.burnRate ?? 0) / 1000).toFixed(1)}K/mo`, delta: "3-month average", pos: null },
          { label: "AR days (DSO)", value: data?.arDays === null || data?.arDays === undefined ? "—" : `${data.arDays}d`, delta: "Avg days to get paid", pos: (data?.arDays ?? 99) < 45 },
        ].map(k => {
          let deltaClass = "";
          if (k.pos === true) deltaClass = "pos";
          else if (k.pos === false) deltaClass = "neg";
          return (
            <div key={k.label} className="card stat">
              <div className="stat-label">{k.label}</div>
              <div className="stat-value">{k.value}</div>
              {k.delta && <div className={`stat-delta ${deltaClass}`}>{k.delta}</div>}
            </div>
          );
        })}
      </div>

      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        <div className="card flush">
          <div className="card-header">
            <div className="card-title">Gross margin trend</div>
            <div className="muted-2" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>LAST 6 MONTHS</div>
          </div>
          <div style={{ padding: "12px 16px 8px" }}>
            {marginPoints.length > 0
              ? <LineChart points={marginPoints} accent height={220} formatY={v => `${v.toFixed(0)}%`} />
              : <div className="muted" style={{ padding: 32, textAlign: "center" }}>No margin data yet</div>
            }
          </div>
        </div>

        <div className="card flush">
          <div className="card-header">
            <div className="card-title">Expense breakdown</div>
            <div className="muted-2" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>BY CATEGORY</div>
          </div>
          {data?.expenseBreakdown?.length
            ? (
              <div style={{ padding: 16, display: "flex", gap: 24, alignItems: "center" }}>
                <Donut size={140} slices={data.expenseBreakdown.map((x, i) => ({ pct: x.pct, color: COLORS[i % COLORS.length] }))} />
                <div style={{ flex: 1 }}>
                  {data.expenseBreakdown.map((x, i) => (
                    <div key={x.category} className="row gap-3" style={{ marginBottom: 8, fontSize: 13 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{x.category}</span>
                      <span className="amount muted">{x.pct}%</span>
                      <span className="amount" style={{ fontWeight: 500 }}>${x.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
            : <div className="muted" style={{ padding: 32, textAlign: "center" }}>No expense data yet</div>
          }
        </div>
      </div>
    </div>
  );
}
