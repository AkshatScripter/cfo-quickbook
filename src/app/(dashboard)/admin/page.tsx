"use client";

import { useEffect, useState } from "react";
import { I } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { StatusPill } from "@/components/ui/status-pill";
import { PageLoader } from "@/components/ui/spinner";

interface Company {
  id: string;
  name: string | null;
  email: string;
  isActive: boolean;
  qbConnected: boolean;
  lastSync: string | null;
  syncError: string | null;
  createdAt: string;
}

export default function AdminHome() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/companies")
      .then(r => r.json())
      .then(d => setCompanies(d?.companies ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = companies.filter(c =>
    !search ||
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  const connected = companies.filter(c => c.qbConnected).length;

  if (loading) return <div className="page"><PageLoader /></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Platform overview</h1>
          <p className="page-sub">All companies, customers, and QB connections</p>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <div className="card stat"><div className="stat-label">Companies</div><div className="stat-value">{companies.length}</div></div>
        <div className="card stat"><div className="stat-label">QB connected</div><div className="stat-value">{connected}<span className="unit">/ {companies.length}</span></div></div>
        <div className="card stat"><div className="stat-label">Active</div><div className="stat-value">{companies.filter(c => c.isActive).length}</div></div>
        <div className="card stat"><div className="stat-label">Sync errors</div><div className="stat-value">{companies.filter(c => c.syncError).length}</div></div>
      </div>

      <div className="card flush">
        <div className="card-header">
          <div className="card-title">Companies</div>
          <div className="row gap-3">
            <div className="search">
              <I.Search size={13} />
              <input
                placeholder="Search companies…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
        {filtered.length === 0
          ? <div className="muted" style={{ padding: 24, textAlign: "center" }}>No companies found</div>
          : (
            <table className="tbl">
              <thead>
                <tr><th>Company</th><th>QuickBooks</th><th>Status</th><th>Last sync</th><th>Joined</th></tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="clickable">
                    <td>
                      <div className="row gap-3">
                        <Avatar name={c.name ?? c.email} />
                        <div className="col">
                          <span style={{ fontWeight: 500 }}>{c.name ?? "—"}</span>
                          <span className="muted" style={{ fontSize: 11 }}>{c.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {c.syncError
                        ? <span className="badge b-negative"><span className="dot" />Error</span>
                        : <StatusPill status={c.qbConnected ? "Connected" : "Disconnected"} />
                      }
                    </td>
                    <td>
                      <span className={`badge ${c.isActive ? "b-positive" : "b-negative"}`}>
                        <span className="dot" />{c.isActive ? "Active" : "Suspended"}
                      </span>
                    </td>
                    <td className="muted">{c.lastSync ? new Date(c.lastSync).toLocaleString() : "Never"}</td>
                    <td className="muted">{new Date(c.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>
    </div>
  );
}
