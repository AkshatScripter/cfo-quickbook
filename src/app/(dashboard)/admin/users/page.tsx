"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { I } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { PageLoader, Spinner } from "@/components/ui/spinner";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
  companyId: string | null;
  qbCustomerId: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/users")
      .then(r => r.json())
      .then(d => setUsers(d?.users ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const companyUsers = users.filter(u => u.role === "company");

  async function toggleActive(id: string, isActive: boolean) {
    setToggling(id);
    try {
      await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive: !isActive }),
      });
      setUsers(prev => prev.map(u => u.id === id ? { ...u, isActive: !isActive } : u));
      toast.success(isActive ? "User suspended" : "User activated");
    } catch {
      toast.error("Failed to update user");
    } finally {
      setToggling(null);
    }
  }

  async function assignCompany(userId: string, companyId: string) {
    setAssigning(userId);
    try {
      const res = await fetch(`/api/customers/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: companyId || null }),
      });
      if (!res.ok) throw new Error("Assignment failed");
      setUsers(prev =>
        prev.map(u => u.id === userId ? { ...u, companyId: companyId || null } : u)
      );
      toast.success(companyId ? "Customer assigned to company" : "Customer unassigned");
    } catch {
      toast.error("Failed to assign customer");
    } finally {
      setAssigning(null);
    }
  }

  const filtered = users.filter(u =>
    !search ||
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="page"><PageLoader /></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">All users</h1>
          <p className="page-sub">Every account across the platform</p>
        </div>
      </div>

      <div className="card flush">
        <div className="card-header">
          <div className="card-title">{users.length} users</div>
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
              <th>User</th>
              <th>Role</th>
              <th>Assigned company</th>
              <th>Status</th>
              <th>Joined</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id}>
                <td>
                  <div className="row gap-3">
                    <Avatar name={u.name ?? u.email} />
                    <div className="col">
                      <span style={{ fontWeight: 500 }}>{u.name ?? "—"}</span>
                      <span className="muted num" style={{ fontSize: 11 }}>{u.email}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="badge" style={{ textTransform: "capitalize" }}>
                    {u.role.replace("_", " ")}
                  </span>
                </td>
                <td>
                  {u.role === "customer" ? (
                    <div className="row gap-2" style={{ alignItems: "center" }}>
                      <select
                        className="select"
                        style={{ minWidth: 180 }}
                        value={u.companyId ?? ""}
                        disabled={assigning === u.id}
                        onChange={(e) => assignCompany(u.id, e.target.value)}
                      >
                        <option value="">— not assigned —</option>
                        {companyUsers.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name ?? c.email}
                          </option>
                        ))}
                      </select>
                      {assigning === u.id && <Spinner size="sm" />}
                    </div>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>—</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${u.isActive ? "b-positive" : "b-negative"}`}>
                    <span className="dot" />{u.isActive ? "Active" : "Suspended"}
                  </span>
                </td>
                <td className="muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={toggling === u.id}
                    onClick={() => void toggleActive(u.id, u.isActive)}
                  >
                    {toggling === u.id ? <Spinner size="sm" /> : (u.isActive ? "Suspend" : "Activate")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
