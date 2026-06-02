# Connect QuickBooks Sandbox — POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exercise the existing QB OAuth + sync pipeline end-to-end against the Intuit sandbox so real sample data appears on the company dashboard — no paid services, no production keys.

**Architecture:** The OAuth flow, sync engine, calculations, and dashboard pages are already built. Three gaps block a clean end-to-end run in dev: (1) Supabase requires email confirmation before login, which blocks test user creation; (2) the QB callback never fetches the company name from Intuit, so the dashboard header is always blank; (3) the `/api/quickbooks/connect` route requires the `company` role — the super_admin cannot initiate a QB connection directly even though the spec requires it. This plan closes all three gaps then walks through the full connect → sync → verify flow.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM, Supabase Auth, `intuit-oauth`, existing `src/lib/quickbooks/` modules, Intuit Developer sandbox.

**POC constraint:** Sandbox only. `QUICKBOOKS_API_BASE=https://sandbox-quickbooks.api.intuit.com` in `.env`. No production keys, no paid Intuit tier.

---

## Pre-flight checklist (verify before starting)

- [ ] `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_REDIRECT_URI` are set in `.env`
- [ ] `QUICKBOOKS_API_BASE=https://sandbox-quickbooks.api.intuit.com` is set in `.env`
- [ ] `QUICKBOOKS_TOKEN_ENC_KEY` is set (64-char hex)
- [ ] Dev server is running: `npm run dev` → `http://localhost:3000`
- [ ] Redirect URI `http://localhost:3000/api/quickbooks/callback` is registered in the Intuit developer portal under your app's **Keys & credentials → Redirect URIs**

---

## Task 1: Disable email confirmation in Supabase (manual — one-time dev config)

Supabase requires users to confirm their email before they can log in. For a POC this blocks test user creation. Disable it for the dev project.

**Files:** None — Supabase dashboard config only.

- [ ] **Step 1: Open Supabase dashboard**

  Go to [supabase.com](https://supabase.com) → your project → **Authentication** → **Providers** → **Email**.

- [ ] **Step 2: Disable "Confirm email"**

  Toggle **"Confirm email"** OFF. Save.

- [ ] **Step 3: Verify**

  You should now be able to sign up and log in immediately without clicking an email link.

> **Why:** This is a dev-only convenience. In production, email confirmation stays on.

---

## Task 2: Fetch and store QB company name after OAuth (code)

After the OAuth callback stores tokens, `cfo_qb_connections.companyName` stays `null` because we never ask QB what the company is called. The dashboard header shows blank. Fix: call the QB `CompanyInfo` endpoint in the callback and persist the name.

**Files:**
- Modify: `src/app/api/quickbooks/callback/route.ts`
- Modify: `src/lib/quickbooks/client.ts` — add `qbGetCompanyInfo`

- [ ] **Step 1: Add `qbGetCompanyInfo` to `client.ts`**

  Open `src/lib/quickbooks/client.ts` and add this export after `qbCdc`:

  ```ts
  // Fetch the QB company name for a connected realm.
  export async function qbGetCompanyInfo(
    realmId: string,
    userId: string
  ): Promise<string | null> {
    try {
      const data = await qbGet(realmId, userId, `companyinfo/${realmId}`);
      const info = (data as { CompanyInfo?: { CompanyName?: string } }).CompanyInfo;
      return info?.CompanyName ?? null;
    } catch {
      return null; // non-critical — dashboard works without a name
    }
  }
  ```

- [ ] **Step 2: Call it in the OAuth callback**

  Open `src/app/api/quickbooks/callback/route.ts`.

  Add the import at the top alongside the other QB imports:
  ```ts
  import { qbGetCompanyInfo } from "@/lib/quickbooks/client";
  ```

  Find the block that inserts or updates `cfoQbConnections`. After the upsert and the activity log insert (before `syncCompany` is called), add:

  ```ts
  // Fetch company name from QB and persist it (best-effort, non-blocking)
  qbGetCompanyInfo(realmId, userId)
    .then((name) => {
      if (!name) return;
      return db
        .update(cfoQbConnections)
        .set({ companyName: name })
        .where(eq(cfoQbConnections.realmId, realmId));
    })
    .catch(console.error);
  ```

- [ ] **Step 3: Typecheck**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Lint**

  ```bash
  npm run lint 2>&1 | grep -iE "callback|client" || echo "✅ clean"
  ```
  Expected: `✅ clean`

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/api/quickbooks/callback/route.ts src/lib/quickbooks/client.ts
  git commit -m "feat(quickbooks): fetch and store company name after OAuth connect"
  ```

---

## Task 3: Allow super_admin to initiate a QB connection (code)

The spec states _"Superadmin can also connect QB on behalf of company"_. Currently `requireRole("company")` in the connect route blocks this. Fix by accepting both roles. The state param already carries `userId`, so no other logic changes.

**Files:**
- Modify: `src/app/api/quickbooks/connect/route.ts`

- [ ] **Step 1: Replace `requireRole` with a two-role check**

  Open `src/app/api/quickbooks/connect/route.ts`. Replace:

  ```ts
  const user = await requireRole("company");
  ```

  With:

  ```ts
  const user = await requireAuth();
  if (user.role !== "company" && user.role !== "super_admin") {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/login?error=Forbidden`
    );
  }
  ```

  Add `requireAuth` to the import:
  ```ts
  import { requireAuth } from "@/lib/auth";
  ```

- [ ] **Step 2: Typecheck + lint**

  ```bash
  npx tsc --noEmit && npm run lint 2>&1 | grep "connect/route" || echo "✅ clean"
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/api/quickbooks/connect/route.ts
  git commit -m "feat(quickbooks): allow super_admin to initiate QB OAuth connect"
  ```

---

## Task 4: Create a company test user (manual)

The dashboard, invoices, and all company API routes are scoped to the `company` role. You need at least one company user to exercise the full flow.

- [ ] **Step 1: Go to `/signup`**

  Open `http://localhost:3000/signup`

- [ ] **Step 2: Fill in the form**

  - Role: **Company** (default)
  - Name: `Test Company`
  - Email: any email you control (e.g. a `+company` variant of your main email)
  - Password: any strong password

  Click **Create account**.

- [ ] **Step 3: Log in**

  Since email confirmation is disabled (Task 1), go straight to `http://localhost:3000/login` and sign in with the company credentials. You should land on `/dashboard` which shows the "Connect QuickBooks" prompt.

---

## Task 5: Connect the QB sandbox company (manual — OAuth flow)

- [ ] **Step 1: Navigate to the connect page**

  From the dashboard, click **Connect QuickBooks**, or go directly to `http://localhost:3000/qb-connect`.

- [ ] **Step 2: Click "Connect QuickBooks"**

  The button triggers `GET /api/quickbooks/connect` → builds the Intuit auth URL → redirects you to `appcenter.intuit.com`.

- [ ] **Step 3: Log in to Intuit with your developer account**

  Use the email/password for your [developer.intuit.com](https://developer.intuit.com) account.

- [ ] **Step 4: Select the sandbox company**

  Intuit shows a list of companies. Select **"Sandbox Company_US_1"** (or whichever sandbox company you have — Intuit pre-seeds it with sample invoices, customers, and expenses).

- [ ] **Step 5: Approve access**

  Click **Connect** to grant the app access. Intuit redirects to `/api/quickbooks/callback`.

- [ ] **Step 6: Wait for redirect back to the dashboard**

  The callback stores encrypted tokens, fires the initial sync in the background, and redirects to `/dashboard?qb=connected`. The page now shows **"QB Connected"** in the header.

  > The initial sync runs in the background. It may take 5–15 seconds. If the dashboard shows zeros, wait a few seconds and refresh.

---

## Task 6: Verify sandbox data on the dashboard (manual)

- [ ] **Step 1: Check the main dashboard**

  Open `http://localhost:3000/dashboard`. Verify:
  - Company name appears in the page subtitle (from Task 2)
  - Revenue MTD, Cash on hand, Runway, AR Days show non-zero numbers
  - Revenue trend chart has bars
  - Cash flow forecast chart has a line
  - "Recent invoices" table has rows

- [ ] **Step 2: Check the invoices page**

  Open `http://localhost:3000/invoices`. Verify a list of invoices from the sandbox company appears.

- [ ] **Step 3: Check the revenue page**

  Open `http://localhost:3000/revenue`. Verify charts and top-customer breakdown appear.

- [ ] **Step 4: Check the risk page**

  Open `http://localhost:3000/risk`. The sandbox company has some overdue invoices — the risk widget should surface them.

- [ ] **Step 5: Trigger a manual sync**

  Click the **Refresh** button in the dashboard header. A toast should appear: "Syncing QuickBooks…" → "Sync complete". The page data refreshes.

- [ ] **Step 6: Verify in Drizzle Studio (optional deeper check)**

  ```bash
  npm run db:studio
  ```

  Open the studio URL (printed in terminal). Navigate to:
  - `cfo_qb_invoices` — should have rows with `realm_id` matching your sandbox
  - `cfo_qb_customers` — should have customer rows
  - `cfo_calculated_reports` — should have 4 rows (revenue_analysis, cash_flow, kpi, risk) per realm

---

## Task 7: Verify as super_admin (manual)

Now confirm Task 3's change lets the admin also connect QB.

- [ ] **Step 1: Log out and log back in as super_admin**

  Use the `SUPER_ADMIN_EMAIL` credentials set in `.env`.

- [ ] **Step 2: Navigate to `/qb-connect`**

  Open `http://localhost:3000/qb-connect`. The page should load (previously it would have failed on the connect button).

- [ ] **Step 3: Click "Connect QuickBooks"**

  You should be redirected to Intuit's OAuth page without a 403. Complete the flow. The super_admin's connection will be stored under their `userId`.

  > For the POC, both the company user and super_admin can have their own QB connections. In a production multi-company setup, connections would be tied to a `companies` table, but that's a future feature.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Clicking "Connect QuickBooks" shows 403 | `requireRole` still blocking — Task 3 not applied | Re-apply Task 3 and restart dev server |
| Intuit shows `redirect_uri_mismatch` | URI in `.env` doesn't match Intuit portal exactly | Check `QUICKBOOKS_REDIRECT_URI` and the portal registration — must be character-for-character identical |
| Dashboard shows all zeros after connect | Sync still running | Wait 10s and refresh — check `cfo_qb_connections.last_sync_at` in Drizzle Studio |
| `Token format invalid — please reconnect` | `QUICKBOOKS_TOKEN_ENC_KEY` was changed after connecting | Reconnect QB to re-issue fresh encrypted tokens |
| Login fails immediately after signup | Email confirmation still on | Verify Task 1 was done in Supabase |
| `invalid_client` on OAuth | Wrong `QUICKBOOKS_CLIENT_ID` or `QUICKBOOKS_CLIENT_SECRET` | Double-check `.env` against Intuit developer portal → Keys & credentials |
| Company name still blank | `qbGetCompanyInfo` call failing silently | Check browser console / server logs for the fetch error; confirm the user has a valid token |
