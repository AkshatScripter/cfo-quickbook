# Replace Static / Mock Data with Dynamic Data

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every use of `MOCK` and hardcoded placeholder values from the UI, replacing them with real data fetched from the database or QB sync tables.

**Architecture:** Four isolated changes in dependency order — (1) enrich `/api/me` so `AuthUser` carries QB company metadata, (2) wire topbar + chat-panel to read it, (3) swap the customers page to QB customers from `cfo_qb_customers`, (4) fix admin/settings model references and remove non-functional feature flags. No new tables required. No AI features touched.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM (`cfo_qb_connections`, `cfo_qb_customers`), React `useApp()` context, TypeScript.

---

## Static data audit — what exists and where

| Location | Static value | Replaced by |
|---|---|---|
| `topbar.tsx:29` | `MOCK.company.name` | `user?.companyName` from AppContext |
| `chat-panel.tsx:205` | `MOCK.company.lastSync` | `user?.lastSyncAt` from AppContext |
| `customers/page.tsx` | Fetches `/api/customers` (portal users) | Fetches `/api/quickbooks/customers` (QB customers) |
| `admin/settings/page.tsx` | `claude-sonnet-4-20250514` etc. | `llama-3.3-70b-versatile` (Groq); feature flags removed |

---

## Task 1: Enrich `/api/me` + extend `AuthUser` type

Add `companyName` and `lastSyncAt` to the `/api/me` response for company role users. Extend the `AuthUser` interface in `app-context.tsx` so the rest of the app can read these values.

**Files:**
- Modify: `src/app/api/me/route.ts`
- Modify: `src/lib/app-context.tsx`

- [ ] **Step 1: Read both files**

  ```bash
  cat "src/app/api/me/route.ts"
  cat "src/lib/app-context.tsx"
  ```

- [ ] **Step 2: Update `src/app/api/me/route.ts`**

  Replace the entire file content with:

  ```ts
  import { getUser } from "@/lib/auth";
  import { db } from "@/db";
  import { cfoQbConnections } from "@/db/schema";
  import { eq, and } from "drizzle-orm";

  // GET /api/me — returns current user profile + QB connection metadata
  export async function GET() {
    try {
      const user = await getUser();
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

      let qbConnected = false;
      let companyName: string | null = null;
      let lastSyncAt: string | null = null;

      if (user.role === "company") {
        const [conn] = await db
          .select({
            isActive: cfoQbConnections.isActive,
            companyName: cfoQbConnections.companyName,
            lastSyncAt: cfoQbConnections.lastSyncAt,
          })
          .from(cfoQbConnections)
          .where(
            and(
              eq(cfoQbConnections.userId, user.id),
              eq(cfoQbConnections.isActive, true)
            )
          )
          .limit(1);

        qbConnected = !!conn;
        companyName = conn?.companyName ?? null;
        lastSyncAt = conn?.lastSyncAt?.toISOString() ?? null;
      }

      return Response.json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        qbConnected,
        companyName,
        lastSyncAt,
      });
    } catch {
      return Response.json({ error: "Server error" }, { status: 500 });
    }
  }
  ```

- [ ] **Step 3: Extend `AuthUser` in `src/lib/app-context.tsx`**

  Find the `AuthUser` interface and add two fields:

  ```ts
  export interface AuthUser {
    id: string;
    email: string;
    name: string | null;
    role: Role;
    qbConnected: boolean;
    companyName: string | null;   // ← add
    lastSyncAt: string | null;    // ← add (ISO 8601 string or null)
  }
  ```

- [ ] **Step 4: Typecheck**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook" && npx tsc --noEmit 2>&1 | head -20
  ```
  Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook"
  git add src/app/api/me/route.ts src/lib/app-context.tsx
  git commit -m "feat(auth): add companyName and lastSyncAt to /api/me response"
  ```

---

## Task 2: Fix topbar — replace `MOCK.company.name`

The topbar breadcrumb shows `MOCK.company.name` ("Acme Holdings") instead of the real QB company name. After Task 1, `user.companyName` carries the real value.

**Files:**
- Modify: `src/components/layout/topbar.tsx`

- [ ] **Step 1: Read the file**

  ```bash
  cat "src/components/layout/topbar.tsx"
  ```

- [ ] **Step 2: Remove the MOCK import and replace the tenant line**

  Remove this line at the top:
  ```ts
  import { MOCK } from "@/lib/mock";
  ```

  Replace this line:
  ```ts
  const tenant = role === "super_admin" ? "Platform" : role === "company" ? MOCK.company.name : "Acme Holdings";
  ```

  With:
  ```ts
  const tenant =
    role === "super_admin" ? "Platform"
    : role === "company"   ? (user?.companyName ?? user?.name ?? "My Company")
    : (user?.name ?? "My Account");
  ```

  The `user` value is already destructured from `useApp()` on the line above — no new import needed.

- [ ] **Step 3: Typecheck + lint**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook" && npx tsc --noEmit 2>&1 | head -10 && npm run lint 2>&1 | grep "topbar" || echo "✅ clean"
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook"
  git add src/components/layout/topbar.tsx
  git commit -m "fix(topbar): replace MOCK company name with real QB company name"
  ```

---

## Task 3: Fix chat-panel — replace `MOCK.company.lastSync`

The chat panel footer shows `MOCK.company.lastSync` ("12 minutes ago"). Replace with real `lastSyncAt` from the user profile, formatted as a human-readable relative time.

**Files:**
- Modify: `src/components/layout/chat-panel.tsx`

- [ ] **Step 1: Read the relevant section**

  ```bash
  grep -n "MOCK\|lastSync\|synced" "src/components/layout/chat-panel.tsx"
  ```

- [ ] **Step 2: Remove MOCK import**

  Remove:
  ```ts
  import { MOCK } from "@/lib/mock";
  ```

- [ ] **Step 3: Add a `formatSync` helper inside the component file**

  Add this function near the top of the file (above the component, not inside it):

  ```ts
  function formatSync(iso: string | null | undefined): string {
    if (!iso) return "never";
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (mins < 1)  return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }
  ```

- [ ] **Step 4: Read `user` from `useApp()` inside the component**

  The chat panel already imports `useApp`. Find where the component destructures from `useApp()` and add `user`:

  ```ts
  const { ..., user } = useApp();
  ```

  (Add `user` alongside whatever is already destructured — do not replace the existing destructure.)

- [ ] **Step 5: Replace the static sync line**

  Find:
  ```ts
  <span>Grounded in QuickBooks · synced {MOCK.company.lastSync}</span>
  ```

  Replace with:
  ```ts
  <span>Grounded in QuickBooks · synced {formatSync(user?.lastSyncAt)}</span>
  ```

- [ ] **Step 6: Typecheck + lint**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook" && npx tsc --noEmit 2>&1 | head -10 && npm run lint 2>&1 | grep "chat-panel" || echo "✅ clean"
  ```
  Expected: no errors.

- [ ] **Step 7: Commit**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook"
  git add src/components/layout/chat-panel.tsx
  git commit -m "fix(chat-panel): replace MOCK lastSync with real QB sync timestamp"
  ```

---

## Task 4: QB customers API route

Create a new route that reads real QB customer records from `cfo_qb_customers` for the logged-in company's realm. The existing `/api/customers` route returns portal users (people who signed up as `customer` role) — leave it untouched; it serves a different purpose.

**Files:**
- Create: `src/app/api/quickbooks/customers/route.ts`

- [ ] **Step 1: Create the file**

  ```ts
  import { requireRole } from "@/lib/auth";
  import { db } from "@/db";
  import { cfoQbConnections, cfoQbCustomers } from "@/db/schema";
  import { and, asc, eq } from "drizzle-orm";

  // GET /api/quickbooks/customers — QB customers synced for the company's realm
  export async function GET() {
    try {
      const user = await requireRole("company");

      const [conn] = await db
        .select({ realmId: cfoQbConnections.realmId })
        .from(cfoQbConnections)
        .where(
          and(
            eq(cfoQbConnections.userId, user.id),
            eq(cfoQbConnections.isActive, true)
          )
        )
        .limit(1);

      if (!conn) return Response.json({ customers: [] });

      const customers = await db
        .select({
          id: cfoQbCustomers.qbId,
          displayName: cfoQbCustomers.displayName,
          email: cfoQbCustomers.email,
          phone: cfoQbCustomers.phone,
          balance: cfoQbCustomers.balance,
          isActive: cfoQbCustomers.isActive,
        })
        .from(cfoQbCustomers)
        .where(eq(cfoQbCustomers.realmId, conn.realmId))
        .orderBy(asc(cfoQbCustomers.displayName));

      return Response.json({ customers });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Server error";
      return Response.json({ error: msg }, { status: 500 });
    }
  }
  ```

- [ ] **Step 2: Typecheck**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook" && npx tsc --noEmit 2>&1 | head -10
  ```
  Expected: exit 0.

- [ ] **Step 3: Commit**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook"
  git add src/app/api/quickbooks/customers/route.ts
  git commit -m "feat(api): add /api/quickbooks/customers route reading from cfo_qb_customers"
  ```

---

## Task 5: Update customers page to show QB customers

The `/customers` page currently fetches `/api/customers` (portal users with `id`, `name`, `email`, `isActive`, `createdAt`). Replace with a fetch to `/api/quickbooks/customers` and update the display to show QB customer fields: display name, email, phone, open balance, active status.

**Files:**
- Modify: `src/app/(dashboard)/customers/page.tsx`

- [ ] **Step 1: Read the current file**

  ```bash
  cat "src/app/(dashboard)/customers/page.tsx"
  ```

- [ ] **Step 2: Replace the entire file content**

  ```tsx
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
  ```

- [ ] **Step 3: Typecheck + lint**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook" && npx tsc --noEmit 2>&1 | head -10 && npm run lint 2>&1 | grep "customers/page" || echo "✅ clean"
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook"
  git add "src/app/(dashboard)/customers/page.tsx"
  git commit -m "feat(customers): show real QB customers from cfo_qb_customers"
  ```

---

## Task 6: Fix admin/settings — Groq model names, remove non-functional feature flags

The admin settings page hardcodes Claude model options and feature flag toggles that have no database backing and reference the wrong AI provider. Replace model options with Groq models. Remove the feature flags section entirely (YAGNI — no backing store exists).

**Files:**
- Modify: `src/app/(dashboard)/admin/settings/page.tsx`

- [ ] **Step 1: Read the current file**

  ```bash
  cat "src/app/(dashboard)/admin/settings/page.tsx"
  ```

- [ ] **Step 2: Replace the entire file content**

  ```tsx
  "use client";

  export default function AdminSettings() {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Platform settings</h1>
            <p className="page-sub">Global configuration — AI model, sync schedule, rate limits.</p>
          </div>
        </div>

        <div className="grid grid-2" style={{ gap: 20 }}>
          <div className="card flush">
            <div className="card-header"><div className="card-title">AI model</div></div>
            <div style={{ padding: 20 }}>
              <label className="field-label">Active model</label>
              <select className="select" defaultValue="llama-3.3-70b-versatile">
                <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (default)</option>
                <option value="llama-3.1-70b-versatile">llama-3.1-70b-versatile</option>
                <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (fast)</option>
              </select>
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Powered by Groq API · set <code>GROQ_API_KEY</code> in your environment.
              </p>

              <label className="field-label" style={{ marginTop: 16 }}>Response timeout</label>
              <input className="input" defaultValue="15s" />

              <label className="field-label" style={{ marginTop: 16 }}>Max conversation history</label>
              <input className="input" defaultValue="30 days" />
            </div>
          </div>

          <div className="card flush">
            <div className="card-header"><div className="card-title">Sync schedule</div></div>
            <div style={{ padding: 20 }}>
              <label className="field-label">Daily sync time (UTC)</label>
              <input className="input" defaultValue="06:00" />
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Trigger: <code>POST /api/cron/sync</code> with <code>Authorization: Bearer CRON_SECRET</code>
              </p>

              <label className="field-label" style={{ marginTop: 16 }}>QB API minor version</label>
              <input className="input" defaultValue="75" readOnly />
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Versions 1–74 deprecated Aug 2025. Fixed at 75.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 3: Typecheck + lint**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook" && npx tsc --noEmit 2>&1 | head -10 && npm run lint 2>&1 | grep "admin/settings" || echo "✅ clean"
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook"
  git add "src/app/(dashboard)/admin/settings/page.tsx"
  git commit -m "fix(admin): replace Claude model options with Groq, remove non-functional feature flags"
  ```

---

## Task 7: Delete `mock.ts`

After Tasks 2 and 3, `MOCK` is no longer imported anywhere. Delete the file.

**Files:**
- Delete: `src/lib/mock.ts`

- [ ] **Step 1: Verify no remaining imports**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook" && grep -r "from.*mock\|MOCK" src/ --include="*.ts" --include="*.tsx"
  ```
  Expected: no output (zero matches).

- [ ] **Step 2: Delete the file**

  ```bash
  rm "/home/shekhar/Important Data/cfo-quickbook/src/lib/mock.ts"
  ```

- [ ] **Step 3: Typecheck**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook" && npx tsc --noEmit 2>&1 | head -10
  ```
  Expected: exit 0.

- [ ] **Step 4: Commit**

  ```bash
  cd "/home/shekhar/Important Data/cfo-quickbook"
  git rm src/lib/mock.ts
  git commit -m "chore: delete mock.ts — no longer used anywhere"
  ```

---

## Verification checklist

After all tasks are complete, verify end-to-end in the browser:

- [ ] Log in as a company user who has connected QB → topbar breadcrumb shows the real QB company name (e.g. "Sandbox Company_US_1")
- [ ] Open the chat panel → footer shows "synced X min ago" based on the actual last sync time
- [ ] Navigate to `/customers` → table shows QB customers with name, email, phone, balance columns; stat cards show real counts
- [ ] Log in as super_admin → navigate to `/admin/settings` → model dropdown shows Groq models; no feature flags section
- [ ] `src/lib/mock.ts` no longer exists in the repo

