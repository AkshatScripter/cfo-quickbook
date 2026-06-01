"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { I } from "@/components/icons";
import { PageLoader } from "@/components/ui/spinner";
import { LineChart } from "@/components/ui/line-chart";
import { StatusPill } from "@/components/ui/status-pill";
import { useApp } from "@/lib/app-context";

interface Stats {
  revenueMTD: number;
  revenuePrev: number;
  momGrowth: number | null;
  cashOnHand: number;
  burnRate: number;
  runwayMonths: number | null;
  grossMargin: number;
  arDays: number | null;
  overdueCount: number;
  overdueAmount: number;
}

interface DashboardData {
  qbConnected: boolean;
  lastSync: string | null;
  companyName: string | null;
  stats: Stats;
}

interface RevenueData {
  months: { month: string; amount: number }[];
  topCustomers: { name: string; amount: number; pct: number }[];
  mtd: number;
}

interface CashFlowData {
  forecast: { label: string; balance: number }[];
}

interface RiskData {
  risks: { kind: string; tag: string; title: string; body: string }[];
}

interface Invoice {
  id: string;
  invoiceNumber: string | null;
  customer: string | null;
  due: string | null;
  amount: string;
  status: string;
}

function pct(value: number, prev: number) {
  if (!prev) return null;
  const diff = ((value - prev) / prev) * 100;
  return `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`;
}

function fmt(n: number) {
  return `$${(n / 1000).toFixed(1)}K`;
}

export default function CompanyDashboard() {
  const { user, askAI, highlight, flashHighlight, pinned, unpinInsight, openChat } = useApp();
  const router = useRouter();

  const [data, setData] = useState<DashboardData | null>(null);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowData | null>(null);
  const [risk, setRisk] = useState<RiskData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard/stats").then(r => r.json()),
      fetch("/api/dashboard/revenue").then(r => r.json()),
      fetch("/api/dashboard/cashflow").then(r => r.json()),
      fetch("/api/dashboard/risk").then(r => r.json()),
      fetch("/api/invoices").then(r => r.json()),
    ]).then(([stats, rev, cf, rsk, inv]) => {
      setData(stats);
      setRevenue(rev);
      setCashFlow(cf);
      setRisk(rsk);
      setInvoices(inv?.invoices ?? []);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><PageLoader label="Loading dashboard…" /></div>;

  if (!data?.qbConnected) {
    return (
      <div className="page">
        <div className="empty" style={{ marginTop: 40 }}>
          <div className="h-title" style={{ marginBottom: 8 }}>Connect QuickBooks to get started</div>
          <p className="muted" style={{ marginBottom: 20 }}>
            Your CFO dashboard will populate once you connect your QuickBooks account.
          </p>
          <a href="/qb-connect" className="btn btn-primary">
            <I.Link size={14} /> Connect QuickBooks
          </a>
        </div>
      </div>
    );
  }

  const s = data.stats;
  const revMoM = pct(s.revenueMTD, s.revenuePrev);
  const runwayValue = s.runwayMonths === null ? "—" : `${s.runwayMonths}mo`;
  const runwayDelta = s.burnRate > 0 ? `$${(s.burnRate / 1000).toFixed(1)}K/mo burn` : "";
  const arValue     = s.arDays === null ? "—" : `${s.arDays}d`;
  const revenuePoints = revenue?.months?.map(m => ({ x: m.month.slice(5), y: m.amount })) ?? [];
  const cashPoints = cashFlow?.forecast?.map(p => ({ x: p.label, y: p.balance })) ?? [];

  const QUICK_ACTIONS = [
    { id: "revenue",  title: "Revenue",      sub: "By period & source", icon: "Revenue" as const, goto: "/revenue" },
    { id: "cashflow", title: "Cash Flow",    sub: "30/60/90-day view",  icon: "Cash"    as const, goto: "/cashflow" },
    { id: "kpi",      title: "KPI Deep Dive",sub: "Margins, burn rate", icon: "Kpi"     as const, goto: "/kpi" },
    { id: "risk",     title: "Risk",         sub: "Alerts & overdue",   icon: "Risk"    as const, goto: "/risk" },
  ];

  return (
    <div className="page">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Good morning, {user?.name?.split(" ")[0] ?? "there"}</h1>
          <p className="page-sub">
            {data.companyName ?? "Your company"} — synced {data.lastSync ? new Date(data.lastSync).toLocaleString() : "never"}
          </p>
        </div>
        <div className="row gap-3">
          <span className="badge b-positive"><span className="dot" />QB Connected</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              toast.promise(
                fetch("/api/quickbooks/sync", { method: "POST" }).then(r => r.json()),
                { loading: "Syncing QuickBooks…", success: "Sync complete", error: "Sync failed" }
              );
            }}
          >
            <I.Refresh size={13} /> Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={openChat}>
            <I.Sparkle size={13} /> Ask CFO
          </button>
        </div>
      </div>

      {/* Pinned insights */}
      {pinned.length > 0 && (
        <div className="pin-strip">
          {pinned.map(p => (
            <div key={p.id} className="pin-card">
              <span className="pin-ico">C</span>
              <div className="pin-body">{p.body}</div>
              <button type="button" className="pin-close" onClick={() => unpinInsight(p.id)}><I.X size={11} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        {[
          { key: "revenueMTD", label: "Revenue MTD",    value: fmt(s.revenueMTD),    delta: revMoM ?? "",    pos: (s.revenueMTD >= s.revenuePrev), prompt: "Break down my revenue this month" },
          { key: "cashOnHand", label: "Cash on hand",   value: fmt(s.cashOnHand),    delta: "",               pos: true,                            prompt: "What's driving my cash position?" },
          { key: "runway",     label: "Runway",          value: runwayValue, delta: runwayDelta, pos: (s.runwayMonths ?? 0) > 6, prompt: "How is my runway calculated?" },
          { key: "arDays",     label: "AR Days (DSO)",   value: arValue,     delta: "",         pos: (s.arDays ?? 0) < 45,       prompt: "Which customers are slowing my AR?" },
        ].map(card => (
          <button
            key={card.key}
            type="button"
            className={`card stat hl-target kpi-clickable ${highlight === card.key ? "hl-active" : ""}`}
            onClick={() => { flashHighlight(card.key); askAI(card.prompt, { highlight: card.key }); }}
            style={{ alignItems: "flex-start", textAlign: "left", font: "inherit", color: "inherit" }}
          >
            <div className="stat-label">{card.label}</div>
            <div className="stat-value">{card.value}</div>
            {card.delta && (
              <div className={`stat-delta ${card.pos ? "pos" : "neg"}`}>
                {card.pos ? <I.ArrowUp size={11} /> : <I.ArrowDown size={11} />}
                {card.delta}
              </div>
            )}
            <span className="kpi-ask"><I.Sparkle size={11} /> Ask why</span>
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        <div className="card flush">
          <div className="card-header">
            <div>
              <div className="card-title">Revenue trend</div>
              <div className="muted-2" style={{ fontSize: 11, marginTop: 2, fontFamily: "var(--font-mono)" }}>LAST 6 MONTHS</div>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.push("/revenue")}>Open <I.Chevron size={12} /></button>
          </div>
          <div style={{ padding: "12px 16px 8px" }}>
            {revenuePoints.length > 0
              ? <LineChart points={revenuePoints} accent height={180} />
              : <div className="muted" style={{ padding: 32, textAlign: "center" }}>No revenue data yet</div>
            }
          </div>
        </div>

        <div className="card flush">
          <div className="card-header">
            <div>
              <div className="card-title">Cash flow forecast</div>
              <div className="muted-2" style={{ fontSize: 11, marginTop: 2, fontFamily: "var(--font-mono)" }}>NEXT 90 DAYS</div>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.push("/cashflow")}>Open <I.Chevron size={12} /></button>
          </div>
          <div style={{ padding: "12px 16px 8px" }}>
            {cashPoints.length > 0
              ? <LineChart points={cashPoints} height={180} threshold={{ y: (cashPoints.at(-1)?.y ?? 0) * 0.7, label: "Caution floor" }} />
              : <div className="muted" style={{ padding: 32, textAlign: "center" }}>No cash flow data yet</div>
            }
          </div>
        </div>
      </div>

      {/* Quick CFO actions */}
      <div className="h-section" style={{ marginBottom: 12 }}>CFO INSIGHTS</div>
      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        {QUICK_ACTIONS.map(qa => {
          const IconC = I[qa.icon];
          return (
            <button key={qa.id} type="button" className="card stat" style={{ alignItems: "flex-start", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }} onClick={() => router.push(qa.goto)}>
              <IconC size={18} />
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, marginTop: 6 }}>{qa.title}</div>
              <div className="muted" style={{ fontSize: 12 }}>{qa.sub}</div>
              <div className="row gap-2 muted-2" style={{ fontSize: 11, marginTop: 6 }}>Open <I.Arrow size={11} /></div>
            </button>
          );
        })}
      </div>

      {/* Recent invoices + Risks */}
      <div className="grid grid-2">
        <div className="card flush">
          <div className="card-header">
            <div className="card-title">Recent invoices</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.push("/invoices")}>View all <I.Chevron size={12} /></button>
          </div>
          {invoices.length === 0
            ? <div className="muted" style={{ padding: 24, textAlign: "center" }}>No invoices found</div>
            : (
              <table className="tbl">
                <thead><tr><th>ID</th><th>Customer</th><th>Due</th><th style={{ textAlign: "right" }}>Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {invoices.slice(0, 5).map(inv => (
                    <tr key={inv.id} className="clickable">
                      <td className="num" style={{ color: "var(--fg-2)" }}>{inv.invoiceNumber ?? inv.id}</td>
                      <td>{inv.customer ?? "—"}</td>
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

        <div className="card flush">
          <div className="card-header">
            <div className="card-title">Open risks</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.push("/risk")}>See all <I.Chevron size={12} /></button>
          </div>
          {risk?.risks?.length
            ? (
              <div>
                {risk.risks.slice(0, 4).map((r, idx) => {
                  let IconC = I.Check;
                  if (r.kind === "warn") IconC = I.Warning;
                  else if (r.kind === "neg") IconC = I.TrendDown;
                  return (
                    <div key={`${r.tag}-${idx}`} className="alert-row">
                      <div className={`alert-icon ${r.kind}`}><IconC size={15} /></div>
                      <div style={{ flex: 1 }}>
                        <div className="alert-title">{r.title}</div>
                        <div className="alert-body">{r.body}</div>
                      </div>
                      <span className="badge" style={{ marginTop: 2 }}>{r.tag}</span>
                    </div>
                  );
                })}
              </div>
            )
            : <div className="muted" style={{ padding: 24, textAlign: "center" }}>No risks detected</div>
          }
        </div>
      </div>
    </div>
  );
}
