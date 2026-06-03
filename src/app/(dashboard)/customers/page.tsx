"use client";

import { useEffect, useState } from "react";
import { I } from "@/components/icons";
import { PageLoader } from "@/components/ui/spinner";
import { Avatar } from "@/components/ui/avatar";

interface Customer {
  id: string;
  qbId: string | null;
  userId: string | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  balance: string | null;
  isActive: boolean;
  syncedAt: string;
  userName: string | null;
  userEmail: string | null;
  createdAt: string | null;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/customers")
      .then(r => r.json())
      .then(d => setCustomers(d?.customers ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = customers.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.displayName?.toLowerCase().includes(q) ||
      c.userName?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.userEmail?.toLowerCase().includes(q)
    );
  });

  const totalBalance = customers.reduce((s, c) => s + Number(c.balance ?? 0), 0);
  const portalCount = customers.filter(c => !!c.userId).length;
  const qbCount = customers.filter(c => !c.userId).length;

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
          <div className="stat-value">{portalCount}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">QB customers</div>
          <div className="stat-value">{qbCount}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Open balance</div>
          <div className="stat-value">${totalBalance.toLocaleString()}</div>
        </div>
      </div>

      <div className="card flush">
        <div className="card-header">
          <div className="card-title">{customers.length} customers</div>
          <div className="search">
            <I.Search size={13} />
            <input
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="muted" style={{ padding: 32, textAlign: "center" }}>
            {customers.length === 0 ? "No customers yet." : "No customers match your search."}
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Email</th>
                <th>Phone</th>
                <th style={{ textAlign: "right" }}>Balance</th>
                <th>Source</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const name  = c.displayName ?? c.userName ?? "—";
                const email = c.email ?? c.userEmail ?? "—";
                const isPlatform = !!c.userId;
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="row gap-3">
                        <Avatar name={name} />
                        <span style={{ fontWeight: 500 }}>{name}</span>
                      </div>
                    </td>
                    <td className="muted">{email}</td>
                    <td className="muted">{c.phone ?? "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 500 }}>
                      {Number(c.balance ?? 0) > 0 ? `$${Number(c.balance).toLocaleString()}` : "—"}
                    </td>
                    <td>
                      <span className={`badge ${isPlatform ? "b-positive" : ""}`}>
                        {isPlatform ? "Portal" : "QuickBooks"}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${c.isActive ? "b-positive" : "b-negative"}`}>
                        <span className="dot" />{c.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
