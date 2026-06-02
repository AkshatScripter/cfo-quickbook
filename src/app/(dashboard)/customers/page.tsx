"use client";

import { useEffect, useState } from "react";
import { I } from "@/components/icons";
import { PageLoader } from "@/components/ui/spinner";
import { Avatar } from "@/components/ui/avatar";

interface PortalCustomer {
  id: string;
  name: string | null;
  email: string;
  isActive: boolean;
  createdAt: string;
}

interface QBCustomer {
  id: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  balance: string | null;
  isActive: boolean;
}

export default function CustomersPage() {
  const [portalCustomers, setPortalCustomers] = useState<PortalCustomer[]>([]);
  const [qbCustomers, setQbCustomers] = useState<QBCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/customers").then(r => r.json()),
      fetch("/api/quickbooks/customers").then(r => r.json()),
    ])
      .then(([portalData, qbData]) => {
        // Only show customers that are assigned to this company (companyId is set)
        setPortalCustomers(
          (portalData?.customers ?? []).filter((c: PortalCustomer & { companyId: string | null }) => c.companyId)
        );
        setQbCustomers(qbData?.customers ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filteredQb = qbCustomers.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.displayName?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || false;
  });

  const totalBalance = qbCustomers.reduce((s, c) => s + Number(c.balance ?? 0), 0);

  if (loading) return <div className="page"><PageLoader /></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-sub">Portal accounts and QuickBooks customers</p>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="card stat">
          <div className="stat-label">Portal customers</div>
          <div className="stat-value">{portalCustomers.length}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">QB customers</div>
          <div className="stat-value">{qbCustomers.length}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Open balance</div>
          <div className="stat-value">${totalBalance.toLocaleString()}</div>
        </div>
      </div>

      {/* Portal customers — people who can log in */}
      <div className="card flush" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Portal accounts</div>
            <div className="muted-2" style={{ fontSize: 11, marginTop: 2 }}>
              Customers who can log in to view their invoices
            </div>
          </div>
        </div>
        {portalCustomers.length === 0 ? (
          <div className="muted" style={{ padding: 24, textAlign: "center" }}>
            No portal accounts yet — ask your admin to assign customers to your company.
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Customer</th><th>Status</th><th>Joined</th></tr>
            </thead>
            <tbody>
              {portalCustomers.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className="row gap-3">
                      <Avatar name={c.name ?? c.email} />
                      <div className="col">
                        <span style={{ fontWeight: 500 }}>{c.name ?? "—"}</span>
                        <span className="muted num" style={{ fontSize: 11 }}>{c.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${c.isActive ? "b-positive" : "b-negative"}`}>
                      <span className="dot" />{c.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="muted">{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* QB customers — from QuickBooks sync */}
      <div className="card flush">
        <div className="card-header">
          <div className="card-title">QuickBooks customers</div>
          <div className="search">
            <I.Search size={13} />
            <input
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {filteredQb.length === 0 ? (
          <div className="muted" style={{ padding: 32, textAlign: "center" }}>
            {qbCustomers.length === 0
              ? "No QB customers synced yet — connect QuickBooks and run a sync."
              : "No customers match your search."}
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th style={{ textAlign: "right" }}>Open balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredQb.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.displayName ?? "—"}</td>
                  <td className="muted">{c.email ?? "—"}</td>
                  <td className="muted">{c.phone ?? "—"}</td>
                  <td style={{ textAlign: "right", fontWeight: 500 }}>
                    {Number(c.balance ?? 0) > 0 ? `$${Number(c.balance).toLocaleString()}` : "—"}
                  </td>
                  <td>
                    <span className={`badge ${c.isActive ? "b-positive" : ""}`}>
                      {c.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
