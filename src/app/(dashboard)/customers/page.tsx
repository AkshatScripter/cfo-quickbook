"use client";

import { useEffect, useState } from "react";
import { I } from "@/components/icons";
import { PageLoader } from "@/components/ui/spinner";

interface QBCustomer {
  id: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  balance: string | null;
  isActive: boolean;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<QBCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/quickbooks/customers")
      .then((r) => r.json())
      .then((d) => setCustomers(d?.customers ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = customers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.displayName?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      false
    );
  });

  const activeCount = customers.filter((c) => c.isActive).length;
  const totalBalance = customers.reduce((s, c) => s + Number(c.balance ?? 0), 0);

  if (loading) return <div className="page"><PageLoader /></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-sub">Synced from QuickBooks · {customers.length} total</p>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="card stat">
          <div className="stat-label">Total customers</div>
          <div className="stat-value">{customers.length}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Active</div>
          <div className="stat-value">{activeCount}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Open balance</div>
          <div className="stat-value">${totalBalance.toLocaleString()}</div>
        </div>
      </div>

      <div className="card flush">
        <div className="card-header">
          <div className="card-title">All customers</div>
          <div className="search">
            <I.Search size={13} />
            <input
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="muted" style={{ padding: 32, textAlign: "center" }}>
            {customers.length === 0
              ? "No customers synced yet — connect QuickBooks to pull customer data."
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
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.displayName ?? "—"}</td>
                  <td className="muted">{c.email ?? "—"}</td>
                  <td className="muted">{c.phone ?? "—"}</td>
                  <td style={{ textAlign: "right", fontWeight: 500 }}>
                    {Number(c.balance ?? 0) > 0
                      ? `$${Number(c.balance).toLocaleString()}`
                      : "—"}
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
