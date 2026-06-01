"use client";

import { I } from "@/components/icons";
import { StatusPill } from "@/components/ui/status-pill";

const QB_BULLETS = [
  "Pull invoices, payments, and expense transactions",
  "Auto-refresh every 6 hours (manual refresh anytime)",
  "Read-only access by default — we never write to your QB data",
  "Token revocation in one click — we never store your QB password",
];

export default function QBConnectPage() {
  return (
    <div className="auth-screen">
      <aside className="auth-aside">
        <div>
          <div className="brand">
            <span className="brand-mark">L</span>
            <span className="brand-name">Ledger<span style={{ fontStyle: "italic" }}>·</span>AI</span>
          </div>
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          <p className="quote">
            Your QuickBooks data, transformed into <span className="em">CFO-grade insights</span>.
          </p>
        </div>
        <div className="footnote">© 2026 Ledger AI · Phase 1</div>
        <div className="deco" />
      </aside>

      <div className="auth-form-wrap">
        <div className="auth-form" style={{ maxWidth: 460 }}>
          <h1>Connect your QuickBooks</h1>
          <p className="sub">
            We pull your invoices, payments, and expenses — then calculate your
            P&amp;L, cash flow, and KPIs inside the app. Data stays in your account.
          </p>

          <div className="qb-card">
            <div className="qb-logo">qb</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 14 }}>QuickBooks Online</div>
              <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 2 }}>
                OAuth 2.0 · read-only by default
              </div>
            </div>
            <StatusPill status="Disconnected" />
          </div>

          <div className="qb-bullets">
            {QB_BULLETS.map((t) => (
              <div key={t} className="qb-bullet">
                <span className="check"><I.Check size={11} /></span>
                <span>{t}</span>
              </div>
            ))}
          </div>

          {/* Link to the server-side OAuth redirect route */}
          <a
            href="/api/quickbooks/connect"
            className="btn btn-primary btn-lg btn-block"
            style={{ display: "flex", justifyContent: "center" }}
          >
            Connect QuickBooks <I.Arrow size={14} />
          </a>

          <a
            href="/dashboard"
            className="btn btn-ghost btn-block"
            style={{ marginTop: 8, display: "flex", justifyContent: "center" }}
          >
            Skip for now (limited features)
          </a>

          <p style={{ marginTop: 18, fontSize: 11, color: "var(--fg-4)", textAlign: "center", lineHeight: 1.5 }}>
            <I.Lock size={10} /> Encrypted in transit (TLS) and at rest (AES-256).
            We meet QuickBooks OAuth 2.0 standards.
          </p>
        </div>
      </div>
    </div>
  );
}
