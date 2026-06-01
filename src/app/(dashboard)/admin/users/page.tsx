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
  isActive: boolean;
  createdAt: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/users")
      .then(r => r.json())
      .then(d => setUsers(d?.users ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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
            <input placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th><th /></tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const statusBadge = u.isActive ? "b-positive" : "b-negative";
              const statusLabel = u.isActive ? "Active" : "Suspended";
              const toggleLabel = u.isActive ? "Suspend" : "Activate";
              return (
                <tr key={u.id} className="clickable">
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
                    <span className={`badge ${statusBadge}`}>
                      <span className="dot" />{statusLabel}
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
                      {toggling === u.id ? <Spinner size="sm" /> : toggleLabel}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
