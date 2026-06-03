"use client";

import { useEffect, useState } from "react";
import { I } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { PageLoader } from "@/components/ui/spinner";

interface CustomerRow {
  id: string;
  realmId: string | null;
  qbId: string | null;
  userId: string | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  balance: string | null;
  isActive: boolean;
  syncedAt: string;
  // from cfo_users (platform customers only)
  userName: string | null;
  userEmail: string | null;
  companyId: string | null;
  userIsActive: boolean | null;
  userCreatedAt: string | null;
}

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/customers")
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
      c.email?.toLowerCase().includes(q) ||
      c.userName?.toLowerCase().includes(q) ||
      c.userEmail?.toLowerCase().includes(q)
    );
  });

  if (loading) return <div className="page"><PageLoader /></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-sub">All customers — platform accounts and QB-synced</p>
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
        <table className="tbl">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Balance</th>
              <th>Source</th>
              <th>Status</th>
              <th>Since</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const name = c.displayName ?? c.userName ?? "—";
              const email = c.email ?? c.userEmail ?? "—";
              const isPlatform = !!c.userId;

              return (
                <tr key={c.id}>
                  <td>
                    <div className="row gap-3">
                      <Avatar name={name} />
                      <div className="col">
                        <span style={{ fontWeight: 500 }}>{name}</span>
                        {c.qbId && (
                          <span className="muted num" style={{ fontSize: 11 }}>QB: {c.qbId}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="muted">{email}</td>
                  <td className="muted">{c.phone ?? "—"}</td>
                  <td className="num">
                    {c.balance != null ? `$${Number(c.balance).toLocaleString()}` : "—"}
                  </td>
                  <td>
                    <span className={`badge ${isPlatform ? "b-positive" : ""}`}>
                      {isPlatform ? "Platform" : "QuickBooks"}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${c.isActive ? "b-positive" : "b-negative"}`}>
                      <span className="dot" />{c.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="muted">
                    {new Date(c.userCreatedAt ?? c.syncedAt).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 32 }}>
                  No customers found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
