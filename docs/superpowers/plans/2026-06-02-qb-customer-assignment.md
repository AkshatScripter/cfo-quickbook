# QB Customer Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a company owner link each portal customer to a specific QB customer so the customer dashboard shows real QB invoices.

**Architecture:** One new `qb_customer_id` column on `cfo_users` is the only schema change. A new `PATCH /api/customers/[id]` route sets it (and claims the customer for the company). The invoice lookup is updated to use this reliable QB ID instead of fragile name-matching. The `/customers` page gains a "Portal users" section where the company owner picks the QB customer from a dropdown per row.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM, TypeScript, Zod v4, Sonner toasts.

---

## Task 1: Add `qbCustomerId` to schema and apply migration

**Files:**
- Modify: `src/db/schema.ts`
- Creates: `drizzle/0003_*.sql` (generated)

- [ ] **Step 1: Read `src/db/schema.ts`** — find the `cfoUsers` table definition (it ends with `updatedAt`).

- [ ] **Step 2: Add `qbCustomerId` after `companyId`**

  Find this block inside `cfoUsers`:
  ```ts
    // For customers: the company user who invited them
    companyId: uuid("company_id"),
  ```

  Replace with:
  ```ts
    // For customers: the company user who invited them
    companyId: uuid("company_id"),
    // QB customer ID (qbId from cfo_qb_customers) linking this portal user to a QB customer
    qbCustomerId: text("qb_customer_id"),
  ```

- [ ] **Step 3: Generate migration**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook" && npm run db:generate 2>&1 | tail -5
  ```
  Expected: `[✓] Your SQL migration file ➜ drizzle/0003_*.sql 🚀`

- [ ] **Step 4: Verify migration only adds one column**

  ```bash
  cat drizzle/0003_*.sql
  ```
  Expected: a single `ALTER TABLE "cfo_users" ADD COLUMN "qb_customer_id" text;` — nothing else.

- [ ] **Step 5: Apply migration**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook" && npm run db:migrate 2>&1 | tail -3
  ```
  Expected: `[✓] migrations applied successfully!`

- [ ] **Step 6: Typecheck**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook" && npx tsc --noEmit 2>&1 | head -10
  ```
  Expected: exit 0.

- [ ] **Step 7: Commit**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook"
  git add src/db/schema.ts drizzle/
  git commit -m "feat(schema): add qb_customer_id to cfo_users"
  ```

---

## Task 2: PATCH `/api/customers/[id]` — assignment endpoint

**Files:**
- Create: `src/app/api/customers/[id]/route.ts`

- [ ] **Step 1: Create the directory**

  ```bash
  mkdir -p "/home/shekhar/Important Data/cfo-quickbook/src/app/api/customers/[id]"
  ```

- [ ] **Step 2: Create the file with this exact content**

  ```ts
  import { requireRole } from "@/lib/auth";
  import { db } from "@/db";
  import { cfoUsers } from "@/db/schema";
  import { eq } from "drizzle-orm";
  import { z } from "zod";

  const bodySchema = z.object({
    qbCustomerId: z.string().nullable(),
  });

  // PATCH /api/customers/:id — company owner assigns or removes a QB customer link
  export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
  ) {
    try {
      const user = await requireRole("company");
      const { id } = await params;
      const body = bodySchema.parse(await request.json());

      // Verify the target customer exists and belongs to this company (or is unlinked)
      const [target] = await db
        .select({ companyId: cfoUsers.companyId })
        .from(cfoUsers)
        .where(eq(cfoUsers.id, id))
        .limit(1);

      if (!target) {
        return Response.json({ error: "Customer not found" }, { status: 404 });
      }
      if (target.companyId && target.companyId !== user.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      const [updated] = await db
        .update(cfoUsers)
        .set({
          qbCustomerId: body.qbCustomerId,
          // Claim the customer for this company if not yet claimed
          companyId: target.companyId ?? user.id,
          updatedAt: new Date(),
        })
        .where(eq(cfoUsers.id, id))
        .returning();

      return Response.json({ user: updated });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return Response.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
      }
      const msg = err instanceof Error ? err.message : "Server error";
      return Response.json({ error: msg }, { status: 500 });
    }
  }
  ```

- [ ] **Step 3: Typecheck + lint**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook" && npx tsc --noEmit 2>&1 | head -10 && npm run lint 2>&1 | grep "customers/\[id\]" || echo "✅ clean"
  ```
  Expected: exit 0, no lint issues.

- [ ] **Step 4: Commit**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook"
  git add "src/app/api/customers/[id]/route.ts"
  git commit -m "feat(api): add PATCH /api/customers/:id for QB customer assignment"
  ```

---

## Task 3: Extend `GET /api/customers` to include unlinked portal users

**Files:**
- Modify: `src/app/api/customers/route.ts`

- [ ] **Step 1: Read `src/app/api/customers/route.ts`**

- [ ] **Step 2: Replace the entire file content**

  ```ts
  import { requireRole } from "@/lib/auth";
  import { db } from "@/db";
  import { cfoUsers } from "@/db/schema";
  import { and, eq, isNull, or } from "drizzle-orm";

  // GET /api/customers — portal customers for this company + unlinked portal signups
  export async function GET() {
    try {
      const user = await requireRole("company");

      const customers = await db
        .select({
          id: cfoUsers.id,
          name: cfoUsers.name,
          email: cfoUsers.email,
          isActive: cfoUsers.isActive,
          companyId: cfoUsers.companyId,
          qbCustomerId: cfoUsers.qbCustomerId,
          createdAt: cfoUsers.createdAt,
        })
        .from(cfoUsers)
        .where(
          and(
            eq(cfoUsers.role, "customer"),
            or(eq(cfoUsers.companyId, user.id), isNull(cfoUsers.companyId))
          )
        );

      return Response.json({ customers });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Server error";
      return Response.json({ error: msg }, { status: 500 });
    }
  }
  ```

- [ ] **Step 3: Typecheck + lint**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook" && npx tsc --noEmit 2>&1 | head -10 && npm run lint 2>&1 | grep "api/customers/route" || echo "✅ clean"
  ```
  Expected: exit 0.

- [ ] **Step 4: Commit**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook"
  git add src/app/api/customers/route.ts
  git commit -m "feat(api): extend GET /api/customers to include unlinked portal users"
  ```

---

## Task 4: Update `GET /api/customer/invoices` — use `qbCustomerId`, add `notLinked` flag

**Files:**
- Modify: `src/app/api/customer/invoices/route.ts`

- [ ] **Step 1: Read `src/app/api/customer/invoices/route.ts`**

- [ ] **Step 2: Replace the entire file content**

  ```ts
  import { requireRole } from "@/lib/auth";
  import { db } from "@/db";
  import { cfoUsers, cfoQbConnections, cfoQbInvoices } from "@/db/schema";
  import { and, desc, eq } from "drizzle-orm";

  // GET /api/customer/invoices — invoices for the logged-in customer
  // Uses qbCustomerId (reliable QB ID) instead of name-matching
  export async function GET() {
    try {
      const user = await requireRole("customer");

      // Guard: customer must be linked to both a company and a QB customer
      if (!user.companyId || !user.qbCustomerId) {
        return Response.json({ invoices: [], totalOwed: 0, notLinked: true });
      }

      const [company] = await db
        .select({ id: cfoUsers.id })
        .from(cfoUsers)
        .where(eq(cfoUsers.id, user.companyId))
        .limit(1);
      if (!company) return Response.json({ invoices: [], totalOwed: 0, notLinked: true });

      const [conn] = await db
        .select()
        .from(cfoQbConnections)
        .where(and(eq(cfoQbConnections.userId, company.id), eq(cfoQbConnections.isActive, true)))
        .limit(1);
      if (!conn) return Response.json({ invoices: [], totalOwed: 0, notLinked: true });

      const invoices = await db
        .select()
        .from(cfoQbInvoices)
        .where(
          and(
            eq(cfoQbInvoices.realmId, conn.realmId),
            eq(cfoQbInvoices.customerId, user.qbCustomerId)
          )
        )
        .orderBy(desc(cfoQbInvoices.txnDate))
        .limit(100);

      const totalOwed = invoices
        .filter((i) => i.status === "Open")
        .reduce((s, i) => s + Number(i.balance ?? 0), 0);

      return Response.json({
        invoices: invoices.map((i) => ({
          id: i.qbId,
          invoiceNumber: i.invoiceNumber,
          issued: i.txnDate,
          due: i.dueDate,
          amount: Number(i.totalAmount ?? 0),
          balance: Number(i.balance ?? 0),
          status: i.status,
        })),
        totalOwed,
        notLinked: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Server error";
      return Response.json({ error: msg }, { status: 500 });
    }
  }
  ```

- [ ] **Step 3: Typecheck + lint**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook" && npx tsc --noEmit 2>&1 | head -10 && npm run lint 2>&1 | grep "customer/invoices" || echo "✅ clean"
  ```
  Expected: exit 0.

- [ ] **Step 4: Commit**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook"
  git add src/app/api/customer/invoices/route.ts
  git commit -m "feat(api): use qbCustomerId for invoice lookup, add notLinked flag"
  ```

---

## Task 5: Update `/customers` page — two sections with assignment dropdown

**Files:**
- Modify: `src/app/(dashboard)/customers/page.tsx`

- [ ] **Step 1: Read the current `src/app/(dashboard)/customers/page.tsx`**

- [ ] **Step 2: Replace the entire file content**

  ```tsx
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
  ```

- [ ] **Step 3: Typecheck + lint**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook" && npx tsc --noEmit 2>&1 | head -10 && npm run lint 2>&1 | grep "customers/page" || echo "✅ clean"
  ```
  Expected: exit 0.

- [ ] **Step 4: Commit**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook"
  git add "src/app/(dashboard)/customers/page.tsx"
  git commit -m "feat(customers): add portal user assignment UI with QB customer dropdown"
  ```

---

## Task 6: Add `notLinked` empty state to customer portal

**Files:**
- Modify: `src/app/(dashboard)/customer/page.tsx`

- [ ] **Step 1: Read `src/app/(dashboard)/customer/page.tsx`**

- [ ] **Step 2: Extend `CustomerData` interface**

  Find:
  ```ts
  interface CustomerData {
    invoices: CustomerInvoice[];
    totalOwed: number;
  }
  ```
  Replace with:
  ```ts
  interface CustomerData {
    invoices: CustomerInvoice[];
    totalOwed: number;
    notLinked?: boolean;
  }
  ```

- [ ] **Step 3: Add the `notLinked` guard after the loading check**

  Find:
  ```ts
  if (loading) return <div className="page"><PageLoader /></div>;
  ```
  Replace with:
  ```ts
  if (loading) return <div className="page"><PageLoader /></div>;

  if (data?.notLinked) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Hi {user?.name?.split(" ")[0] ?? "there"},</h1>
            <p className="page-sub">Here&apos;s your account overview.</p>
          </div>
        </div>
        <div className="empty" style={{ marginTop: 40 }}>
          <div className="h-title" style={{ marginBottom: 8 }}>Account not linked yet</div>
          <p className="muted" style={{ maxWidth: 360, textAlign: "center" }}>
            Your account hasn&apos;t been linked to a company yet.
            Contact your account manager to get set up.
          </p>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 4: Typecheck + lint**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook" && npx tsc --noEmit 2>&1 | head -10 && npm run lint 2>&1 | grep "customer/page" || echo "✅ clean"
  ```
  Expected: exit 0.

- [ ] **Step 5: Commit**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook"
  git add "src/app/(dashboard)/customer/page.tsx"
  git commit -m "feat(customer): show notLinked empty state when account is unassigned"
  ```

---

## Verification checklist

After all tasks, verify end-to-end in the browser:

- [ ] Log in as company owner → `/customers` → see "Portal users" section with dropdown + "QB customers" section
- [ ] Select a QB customer in the dropdown for a portal user → toast "Customer linked" → badge changes to "Linked ✓"
- [ ] Log in as that portal customer → `/customer` → see real invoices from QB (not blank, not "not linked")
- [ ] Log in as a portal customer with NO assignment → see "Account not linked yet" message
- [ ] Drizzle Studio: `cfo_users` row for the portal customer now has `qb_customer_id` set and `company_id` set
