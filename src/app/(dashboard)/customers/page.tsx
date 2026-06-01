"use client";

import { useEffect, useState } from "react";
import { I } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { PageLoader } from "@/components/ui/spinner";

interface Customer {
  id: string;
  name: string | null;
  email: string;
  isActive: boolean;
  createdAt: string;
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

  const filtered = customers.filter(c =>
    !search ||
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="page"><PageLoader /></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-sub">Customers you have invited to the portal</p>
        </div>
        <div className="row gap-3">
          <button type="button" className="btn btn-primary btn-sm">
            <I.Plus size={13} /> Invite customer
          </button>
        </div>
      </div>

      <div className="card flush">
        <div className="card-header">
          <div className="card-title">{customers.length} customers</div>
          <div className="search">
            <I.Search size={13} />
            <input
              placeholder="Search customers…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        {filtered.length === 0
          ? (
            <div className="empty" style={{ margin: 24 }}>
              <div className="h-title" style={{ marginBottom: 8 }}>No customers yet</div>
              <p className="muted">Invite customers to let them view their invoices and ask basic AI questions.</p>
            </div>
          )
          : (
            <table className="tbl">
              <thead>
                <tr><th>Customer</th><th>Email</th><th>Status</th><th>Joined</th><th /></tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="clickable">
                    <td>
                      <div className="row gap-3">
                        <Avatar name={c.name ?? c.email} />
                        <span>{c.name ?? "—"}</span>
                      </div>
                    </td>
                    <td className="muted num">{c.email}</td>
                    <td>
                      <span className={`badge ${c.isActive ? "b-positive" : "b-negative"}`}>
                        <span className="dot" />{c.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="muted">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm"><I.More size={14} /></button>
                    </td>
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
