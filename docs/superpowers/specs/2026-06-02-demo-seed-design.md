# Demo Seed System & Super Admin Visibility Fix

**Date:** 2026-06-02  
**Status:** Approved  

---

## Problem Statement

1. Super admin does not reliably see all companies and customers due to a likely INNER JOIN dropping QB-unconnected companies and client-side customer filtering.
2. The app has no demo data — new users see empty dashboards, blocking demo readiness.
3. New customers need isolated, realistic QB-style data automatically on first login.

---

## Scope

- Fix super admin visibility of companies and customers (server-side)
- One-time seed script to create a permanent "Demo Company"
- Auto-seed per-customer demo data on first login via `getUser()`
- No seeding for company-role users — they must connect a real QB account

---

## Section 1: Super Admin Visibility Fix

### Files Changed

**`src/app/api/admin/companies/route.ts`**
- Change the `cfo_qb_connections` join from INNER to `leftJoin` so companies without a QB connection still appear.
- Add `orderBy(desc(cfoUsers.createdAt))`.

**`src/app/api/admin/users/route.ts`**
- Add `where(eq(cfoUsers.role, "customer"))` server-side filter.
- Remove reliance on frontend filtering for correctness.

**`src/lib/app-context.tsx`**
- Line 84: change default role from `?? "company"` to `?? "customer"` (least-privilege while auth loads).

### Outcome
All company-role users appear in `/admin/companies` regardless of QB connection status. All customer-role users appear in `/admin/users` via a server-enforced filter.

---

## Section 2: Demo Company Setup (One-Time Script)

### Script

**`src/scripts/seed-demo-company.ts`**

Inserts two rows if they do not already exist (idempotent, checked by email):

| Table | Key values |
|---|---|
| `cfo_users` | `email: "demo-company@system.internal"`, `name: "Demo Company"`, `role: "company"`, `isActive: true` |
| `cfo_qb_connections` | `userId: <generated uuid>`, `realmId: "demo-realm-0000"`, `companyName: "Demo Company"`, `isActive: true` |

### Run once
```bash
npx ts-node src/scripts/seed-demo-company.ts
```

Prints the generated `DEMO_COMPANY_ID` UUID. Operator copies it into `.env`:
```
DEMO_COMPANY_ID=<uuid printed by script>
```

Added to `.env.example`:
```
DEMO_COMPANY_ID=   # UUID of the demo company user; set after running seed-demo-company script
```

### Safety
- Re-running the script is a no-op (checks for existing email before inserting).
- No Supabase auth user is created for the demo company — it is a data-only row not intended for login.

---

## Section 3: Customer Auto-Seed on First Login

### New Module

**`src/lib/demo-seed.ts`**

Exports one function:
```ts
export async function seedDemoCustomer(userId: string, userName: string | null): Promise<void>
```

**Guard conditions (returns early if any fail):**
- `process.env.DEMO_COMPANY_ID` is not set
- A `cfo_qb_customers` row with `qbId = "demo-cust-<userId>"` already exists (idempotency)

**Inserts (all under `realmId = "demo-realm-0000"`):**

| Table | Rows | Detail |
|---|---|---|
| `cfo_qb_customers` | 1 | `qbId = "demo-cust-<userId>"`, `displayName` from user name or email prefix, `isActive: true` |
| `cfo_qb_invoices` | 7 | 3 paid, 2 unpaid, 2 overdue — amounts vary $500–$8,000, dates spread over last 90 days |
| `cfo_qb_payments` | 3 | Linked to the 3 paid invoices via `invoiceIds` array |

**Updates:**
- `cfo_users` row: sets `companyId = DEMO_COMPANY_ID`, `qbCustomerId = "demo-cust-<userId>"`

### Hook Point

**`src/lib/auth.ts` — `getUser()`**

After the new `cfo_users` row is inserted for a first-time customer login:
```ts
if (newUser.role === "customer") {
  await seedDemoCustomer(newUser.id, newUser.name);
}
```

### Demo Invoice Shape

| # | Status | Amount | Due date offset from today |
|---|---|---|---|
| 1 | paid | $2,400 | –60 days |
| 2 | paid | $1,200 | –45 days |
| 3 | paid | $800 | –30 days |
| 4 | unpaid | $3,500 | +15 days |
| 5 | unpaid | $950 | +30 days |
| 6 | overdue | $4,800 | –10 days |
| 7 | overdue | $1,750 | –5 days |

---

## Data Flow (End-to-End)

```
1. Operator runs seed-demo-company.ts once
   → cfo_users (demo company) + cfo_qb_connections (demo-realm-0000) created
   → DEMO_COMPANY_ID added to .env

2. New customer signs up → POST /api/auth/signup
   → Supabase user created with role=customer in metadata

3. Customer logs in for first time → getUser() runs
   → No cfo_users row found → inserts new row (role=customer)
   → Calls seedDemoCustomer(userId, name)
     → Inserts cfo_qb_customers row (qbId = demo-cust-<userId>)
     → Inserts 7 invoices + 3 payments under demo-realm-0000
     → Updates cfo_users: companyId=DEMO_COMPANY_ID, qbCustomerId=demo-cust-<userId>

4. Customer dashboard loads
   → Fetches invoices filtered by qbCustomerId = "demo-cust-<userId>"
   → Sees their own isolated 7-invoice dataset
```

---

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `DEMO_COMPANY_ID` | Yes (for demo) | UUID of the demo company user. Absent = seeding disabled (safe in prod). |

---

## Safety & Production Behaviour

- If `DEMO_COMPANY_ID` is not set, `seedDemoCustomer()` returns immediately — zero effect on production.
- The demo company row is not a loginable Supabase user — no auth credentials exist for it.
- All demo data is scoped to `realmId = "demo-realm-0000"` — no conflict with real QB realms.
- Seed is idempotent — safe to call on every login; checks existence before inserting.

---

## Files Created / Modified

| Action | File |
|---|---|
| Create | `src/lib/demo-seed.ts` |
| Create | `src/scripts/seed-demo-company.ts` |
| Modify | `src/lib/auth.ts` |
| Modify | `src/app/api/admin/companies/route.ts` |
| Modify | `src/app/api/admin/users/route.ts` |
| Modify | `src/lib/app-context.tsx` |
| Modify | `.env.example` |
