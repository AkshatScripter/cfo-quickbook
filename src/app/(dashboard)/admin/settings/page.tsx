"use client";

import { I } from "@/components/icons";

export default function AdminSettings() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Platform settings</h1>
          <p className="page-sub">Global configuration — AI model, feature flags, rate limits.</p>
        </div>
      </div>

      <div className="grid grid-2" style={{ gap: 20 }}>
        <div className="card flush">
          <div className="card-header"><div className="card-title">AI model</div></div>
          <div style={{ padding: 20 }}>
            <label className="field-label">Active model</label>
            <select className="select" defaultValue="claude-sonnet-4-20250514">
              <option>claude-sonnet-4-20250514</option>
              <option>claude-haiku-4-20250514</option>
              <option>claude-opus-4-20250514</option>
            </select>
            <label className="field-label" style={{ marginTop: 16 }}>Response timeout</label>
            <input className="input" defaultValue="5s" />
            <label className="field-label" style={{ marginTop: 16 }}>Max conversation history</label>
            <input className="input" defaultValue="30 days" />
          </div>
        </div>

        <div className="card flush">
          <div className="card-header"><div className="card-title">Feature flags</div></div>
          <div style={{ padding: 8 }}>
            {[
              { l: "Follow-up suggestions", d: "Show AI-generated next-question chips after each response", on: true  },
              { l: "Customer AI access",    d: "Let customer role ask basic queries about their invoices",   on: true  },
              { l: "Google OAuth login",    d: "Sign in with Google for all roles",                          on: false },
              { l: "Two-factor (Admin)",    d: "Require 2FA for Super Admin sign-in",                        on: true  },
              { l: "CSV export",            d: "Allow Super Admin to export user lists",                     on: false },
            ].map(f => (
              <label key={f.l} className="row gap-3" style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
                <input type="checkbox" defaultChecked={f.on} style={{ accentColor: "var(--fg)" }} />
                <div className="flex-1">
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{f.l}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{f.d}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="card flush">
          <div className="card-header"><div className="card-title">QuickBooks integration</div></div>
          <div style={{ padding: 20 }}>
            <label className="field-label">Auto-refresh interval</label>
            <select className="select" defaultValue="6 hours">
              <option>1 hour</option><option>3 hours</option><option>6 hours</option>
              <option>12 hours</option><option>Manual only</option>
            </select>
            <label className="field-label" style={{ marginTop: 16 }}>Rate limit (per company / hr)</label>
            <input className="input" defaultValue="500 requests" />
            <label className="field-label" style={{ marginTop: 16 }}>Cache TTL</label>
            <input className="input" defaultValue="6 hours (Redis)" />
          </div>
        </div>

        <div className="card flush">
          <div className="card-header"><div className="card-title">Compliance</div></div>
          <div style={{ padding: 20 }}>
            <div className="qb-bullets">
              {["TLS 1.3 for all traffic", "AES-256 at rest", "GDPR data deletion within 30 days", "SOC 2 Type I — in progress"].map(t => (
                <div key={t} className="qb-bullet">
                  <span className="check"><I.Check size={11} /></span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
