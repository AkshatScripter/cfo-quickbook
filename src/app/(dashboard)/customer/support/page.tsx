"use client";

import { useState } from "react";
import { toast } from "sonner";
import { I } from "@/components/icons";

export default function ContactSupport() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setTimeout(() => {
      toast.success("Message sent — we'll get back to you within 24 hours.");
      setSubject("");
      setMessage("");
      setSending(false);
    }, 800);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Contact support</h1>
          <p className="page-sub">Get help with your account or invoices</p>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 20, alignItems: "start" }}>
        <div className="card" style={{ padding: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Send a message</h2>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label className="field-label">Subject</label>
              <input
                className="input"
                placeholder="e.g. Question about invoice INV-1004"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="field-label">Message</label>
              <textarea
                className="input"
                placeholder="Describe your issue or question…"
                rows={5}
                value={message}
                onChange={e => setMessage(e.target.value)}
                required
                style={{ resize: "vertical" }}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={sending}>
              {sending ? "Sending…" : <><I.Send size={13} /> Send message</>}
            </button>
          </form>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card" style={{ padding: 20 }}>
            <div className="row gap-3" style={{ marginBottom: 8 }}>
              <I.Mail size={16} />
              <span style={{ fontWeight: 500 }}>Email</span>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>support@ledger.ai</p>
          </div>
          <div className="card" style={{ padding: 20 }}>
            <div className="row gap-3" style={{ marginBottom: 8 }}>
              <I.Clock size={16} />
              <span style={{ fontWeight: 500 }}>Response time</span>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>We typically respond within 24 hours on business days.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
