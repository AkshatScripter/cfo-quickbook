"use client";

export default function AdminSettings() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Platform settings</h1>
          <p className="page-sub">Global configuration — AI model, sync schedule, rate limits.</p>
        </div>
      </div>

      <div className="grid grid-2" style={{ gap: 20 }}>
        <div className="card flush">
          <div className="card-header"><div className="card-title">AI model</div></div>
          <div style={{ padding: 20 }}>
            <label className="field-label">Active model</label>
            <select className="select" defaultValue="llama-3.3-70b-versatile">
              <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (default)</option>
              <option value="llama-3.1-70b-versatile">llama-3.1-70b-versatile</option>
              <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (fast)</option>
            </select>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Powered by Groq API · set <code>GROQ_API_KEY</code> in your environment.
            </p>

            <label className="field-label" style={{ marginTop: 16 }}>Response timeout</label>
            <input className="input" defaultValue="15s" />

            <label className="field-label" style={{ marginTop: 16 }}>Max conversation history</label>
            <input className="input" defaultValue="30 days" />
          </div>
        </div>

        <div className="card flush">
          <div className="card-header"><div className="card-title">Sync schedule</div></div>
          <div style={{ padding: 20 }}>
            <label className="field-label">Daily sync time (UTC)</label>
            <input className="input" defaultValue="06:00" />
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Trigger: <code>POST /api/cron/sync</code> with <code>Authorization: Bearer CRON_SECRET</code>
            </p>

            <label className="field-label" style={{ marginTop: 16 }}>QB API minor version</label>
            <input className="input" defaultValue="75" readOnly />
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Versions 1–74 deprecated Aug 2025. Fixed at 75.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
