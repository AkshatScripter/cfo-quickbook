"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { I } from "@/components/icons";
import { PageLoader } from "@/components/ui/spinner";

interface PortalUser {
  id: string;
  name: string | null;
  email: string;
  isActive: boolean;
  companyId: string | null;
  qbCustomerId: string | null;
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
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [qbCustomers, setQbCustomers] = useState<QBCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/customers").then((r) => r.json()),
      fetch("/api/quickbooks/customers").then((r) => r.json()),
    ])
      .then(([portalData, qbData]) => {
        setPortalUsers(portalData?.customers ?? []);
        setQbCustomers(qbData?.customers ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function assign(userId: string, qbCustomerId: string) {
    setAssigning(userId);
    try {
      const res = await fetch(`/api/customers/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qbCustomerId: qbCustomerId || null }),
      });
      if (!res.ok) throw new Error("Assignment failed");
      setPortalUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, qbCustomerId: qbCustomerId || null } : u
        )
      );
      toast.success(qbCustomerId ? "Customer linked" : "Customer unlinked");
    } catch {
      toast.error("Failed to update assignment");
    } finally {
      setAssigning(null);
    }
  }

  const filteredQb = qbCustomers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.displayName?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      false
    );
  });

  const linkedCount = portalUsers.filter((u) => u.qbCustomerId).length;
  const totalBalance = qbCustomers.reduce(
    (s, c) => s + Number(c.balance ?? 0),
    0
  );

  if (loading) return <div className="page"><PageLoader /></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-sub">Manage portal access and QB customer assignments</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="card stat">
          <div className="stat-label">Portal users</div>
          <div className="stat-value">{portalUsers.length}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Linked to QB</div>
          <div className="stat-value">
            {linkedCount}
            <span className="unit">/ {portalUsers.length}</span>
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">Open balance (QB)</div>
          <div className="stat-value">${totalBalance.toLocaleString()}</div>
        </div>
      </div>

      {/* Portal users section */}
      <div className="card flush" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Portal users</div>
            <div className="muted-2" style={{ fontSize: 11, marginTop: 2 }}>
              Assign each user to a QuickBooks customer so they see their invoices
            </div>
          </div>
        </div>
        {portalUsers.length === 0 ? (
          <div className="muted" style={{ padding: 24, textAlign: "center" }}>
            No portal users yet — share your signup link to invite customers.
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>User</th>
                <th>QB customer</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[...portalUsers]
                .sort((a, b) => (a.qbCustomerId ? 1 : 0) - (b.qbCustomerId ? 1 : 0))
                .map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{u.name ?? "—"}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{u.email}</div>
                    </td>
                    <td>
                      <select
                        className="select"
                        style={{ width: "100%", maxWidth: 280 }}
                        value={u.qbCustomerId ?? ""}
                        disabled={assigning === u.id}
                        onChange={(e) => assign(u.id, e.target.value)}
                      >
                        <option value="">— not linked —</option>
                        {qbCustomers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.displayName ?? c.id}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {u.qbCustomerId ? (
                        <span className="badge b-positive">Linked ✓</span>
                      ) : (
                        <span className="badge">Not linked</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      {/* QB customers section */}
      <div className="card flush">
        <div className="card-header">
          <div className="card-title">QB customers</div>
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
              {filteredQb.map((c) => (
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
