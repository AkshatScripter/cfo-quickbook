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

interface QBCustomerOption {
  id: string;
  displayName: string | null;
}

interface CompanyOption {
  id: string;
  name: string | null;
  email: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  // QB customers per companyId — loaded when needed
  const [qbMap, setQbMap] = useState<Record<string, QBCustomerOption[]>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then(r => r.json()),
      fetch("/api/admin/companies").then(r => r.json()),
    ])
      .then(([usersData, companiesData]) => {
        const allUsers: UserRow[] = usersData?.users ?? [];
        setUsers(allUsers);
        setCompanies(companiesData?.companies ?? []);
        // Pre-load QB customers for companies that already have assigned customers
        const assignedCompanyIds = [...new Set(
          allUsers.filter(u => u.companyId).map(u => u.companyId!)
        )];
        assignedCompanyIds.forEach(cid => loadQbCustomers(cid));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function loadQbCustomers(companyId: string) {
    if (!companyId || qbMap[companyId]) return;
    try {
      const res = await fetch(`/api/admin/qb-customers?companyId=${companyId}`);
      const data = await res.json();
      setQbMap(prev => ({ ...prev, [companyId]: data?.customers ?? [] }));
    } catch { /* leave empty */ }
  }

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
      const data = await res.json();
      setUsers(prev =>
        prev.map(u => u.id === userId
          ? { ...u, companyId: companyId || null, qbCustomerId: data.user?.qbCustomerId ?? null }
          : u
        )
      );
      if (!companyId) {
        toast.success("Customer unassigned");
      } else if (data.qbMatched) {
        toast.success("Customer assigned — QB customer matched automatically ✓");
      } else {
        toast.warning("Company assigned — please select the QB customer manually below");
        // Load QB customers so the dropdown appears immediately
        if (companyId) loadQbCustomers(companyId);
      }
    } catch {
      toast.error("Failed to assign customer");
    } finally {
      setAssigning(null);
    }
  }

  async function assignQbCustomer(userId: string, companyId: string, qbCustomerId: string) {
    setAssigning(userId);
    try {
      const res = await fetch(`/api/customers/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, qbCustomerId: qbCustomerId || null }),
      });
      if (!res.ok) throw new Error("Assignment failed");
      setUsers(prev =>
        prev.map(u => u.id === userId ? { ...u, qbCustomerId: qbCustomerId || null } : u)
      );
      toast.success(qbCustomerId ? "QB customer linked ✓" : "QB customer unlinked");
    } catch {
      toast.error("Failed to link QB customer");
    } finally {
      setAssigning(null);
    }
  }

  const customers = users;
  const filtered = customers.filter(u =>
    !search ||
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="page"><PageLoader /></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-sub">Portal customer accounts — assign to a company to activate</p>
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
              <th>Company</th>
              <th>QB customer</th>
              <th>Status</th>
              <th>Joined</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const qbOptions = u.companyId ? (qbMap[u.companyId] ?? []) : [];
              return (
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

                  {/* Company picker */}
                  <td>
                    <div className="row gap-2" style={{ alignItems: "center" }}>
                      <select
                        className="select"
                        style={{ minWidth: 160 }}
                        value={u.companyId ?? ""}
                        disabled={assigning === u.id}
                        onChange={async (e) => {
                          const cid = e.target.value;
                          if (cid) await loadQbCustomers(cid);
                          assignCompany(u.id, cid);
                        }}
                      >
                        <option value="">— not assigned —</option>
                        {companies.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name ?? c.email}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>

                  {/* QB customer picker — shown once company is selected */}
                  <td>
                    {u.companyId ? (
                      <div className="row gap-2" style={{ alignItems: "center" }}>
                        <select
                          className="select"
                          style={{ minWidth: 180 }}
                          value={u.qbCustomerId ?? ""}
                          disabled={assigning === u.id || qbOptions.length === 0}
                          onChange={(e) => assignQbCustomer(u.id, u.companyId!, e.target.value)}
                        >
                          <option value="">
                            {qbOptions.length === 0 ? "Loading…" : "— select QB customer —"}
                          </option>
                          {qbOptions.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.displayName ?? c.id}
                            </option>
                          ))}
                        </select>
                        {assigning === u.id && <Spinner size="sm" />}
                        {u.qbCustomerId && (
                          <span className="badge b-positive" style={{ whiteSpace: "nowrap" }}>✓</span>
                        )}
                      </div>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>Assign company first</span>
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
