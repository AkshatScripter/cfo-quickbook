"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { I } from "@/components/icons";
import { StatusPill } from "@/components/ui/status-pill";
import { Spinner } from "@/components/ui/spinner";
import { useApp } from "@/lib/app-context";

interface ConnectionStatus {
  qbConnected: boolean;
  lastSync: string | null;
  syncError: string | null;
}

export default function SettingsPage() {
  const { user } = useApp();
  const [conn, setConn] = useState<ConnectionStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  useEffect(() => {
    fetch("/api/me")
      .then(r => r.json())
      .then(d => setConn({ qbConnected: d.qbConnected, lastSync: null, syncError: null }))
      .catch(console.error);
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/quickbooks/sync", { method: "POST" });
      const data = await res.json() as { ok?: boolean; synced?: Record<string, number>; error?: string };
      if (data.ok) {
        toast.success("QuickBooks sync complete");
        setSyncMsg(`Synced: ${JSON.stringify(data.synced)}`);
      } else {
        toast.error(data.error ?? "Sync failed");
        setSyncMsg(data.error ?? "Sync failed");
      }
    } catch {
      toast.error("Sync failed — check your QuickBooks connection");
      setSyncMsg("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Workspace and QuickBooks connection</p>
        </div>
      </div>

      <div className="grid grid-2" style={{ gap: 20 }}>
        {/* QB Connection */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>QuickBooks connection</div>
          {conn?.qbConnected
            ? (
              <>
                <div className="qb-card" style={{ padding: 16 }}>
                  <div className="qb-logo" style={{ width: 44, height: 44, fontSize: 22, borderRadius: 10 }}>qb</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>QuickBooks Online</div>
                    <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 2 }}>
                      Connected {conn.lastSync ? `· synced ${new Date(conn.lastSync).toLocaleString()}` : ""}
                    </div>
                  </div>
                  <StatusPill status="Connected" />
                </div>
                {syncMsg && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>{syncMsg}</div>
                )}
                <div className="row gap-3" style={{ marginTop: 14 }}>
                  <button type="button" className="btn btn-sm" onClick={() => void handleSync()} disabled={syncing} style={{ gap: 8 }}>
                    {syncing ? <><Spinner size="sm" /> Syncing…</> : <><I.Refresh size={13} /> Sync now</>}
                  </button>
                  <a href="/api/quickbooks/connect" className="btn btn-sm">Reconnect</a>
                  <button type="button" className="btn btn-sm btn-danger">Disconnect</button>
                </div>
              </>
            )
            : (
              <>
                <div className="qb-card" style={{ padding: 16 }}>
                  <div className="qb-logo" style={{ width: 44, height: 44, fontSize: 22, borderRadius: 10 }}>qb</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>QuickBooks Online</div>
                    <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 2 }}>Not connected</div>
                  </div>
                  <StatusPill status="Disconnected" />
                </div>
                <div style={{ marginTop: 14 }}>
                  <a href="/api/quickbooks/connect" className="btn btn-primary btn-sm">
                    <I.Link size={13} /> Connect QuickBooks
                  </a>
                </div>
              </>
            )
          }
        </div>

        {/* Profile */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Your profile</div>
          <label className="field-label" htmlFor="settings-name">Name</label>
          <input
            id="settings-name"
            className="input"
            defaultValue={user?.name ?? ""}
            style={{ marginBottom: 12 }}
          />
          <label className="field-label" htmlFor="settings-email">Email</label>
          <input
            id="settings-email"
            className="input"
            defaultValue={user?.email ?? ""}
            disabled
            style={{ marginBottom: 16 }}
          />
          <button type="button" className="btn btn-primary btn-sm">Save changes</button>
        </div>
      </div>
    </div>
  );
}
