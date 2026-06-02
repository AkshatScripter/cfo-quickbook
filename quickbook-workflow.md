# QuickBooks Integration Workflow

> Complete, project-specific reference for how QuickBooks Online (QBO) data flows into this app.
> Covers authorization, sync strategy, entity mapping, webhooks, rate limits, and what is automatic vs. manual.
>
> **Source of truth for product requirements: `project-overview.md`**
> **Researched against the QBO Accounting API as of June 2026 (minor version 75).**
> Sources linked at the bottom.

---

## 0. TL;DR — What this app does with QuickBooks

1. A **company** owner (or **super_admin** on their behalf) connects their QuickBooks Online account via OAuth 2.0.
2. We store OAuth tokens server-side in `cfo_qb_tokens` (encrypted at rest with AES-256-GCM) and connection metadata in `cfo_qb_connections`.
3. On connect, on a daily cron (06:00 UTC), and on manual trigger, we **pull** from QBO into our Postgres tables:
   - Invoices → `cfo_qb_invoices`
   - Payments → `cfo_qb_payments`
   - Expenses (Purchases) → `cfo_qb_expenses`
   - Chart of Accounts → `cfo_qb_accounts`
   - Customers → `cfo_qb_customers`
   - Profit & Loss *(planned — via QBO Reports API; currently derived from synced data)*
4. We run **CFO calculations** (revenue, cash flow, KPI, risk) over synced data and cache them in `cfo_calculated_reports`.
5. After each sync, **AI insights are regenerated** per company *(planned — `ai_insights` table not yet built)*.
6. Dashboard pages read **only from our DB** — never live from QBO. The UI is fast and survives QBO outages or rate limits.
7. QBO webhooks push real-time change notifications → we fetch + upsert the changed record immediately.

> **Key principle:** QBO is the source of truth for financial data; our DB is a synced *read replica* scoped per company (`realmId`). The UI calls our `/api/*` routes, which read our DB.

---

## 1. Core QuickBooks concepts (mapped to our schema)

| QBO concept | What it is | Where it lives in our app |
|---|---|---|
| **`realmId`** (Company ID) | Unique ID of one QuickBooks **company file**. Every API call is scoped to one realm. | `cfo_qb_connections.realmId`, `cfo_qb_tokens.realmId`, and `realmId` column on every `cfo_qb_*` table |
| **Access token** | Bearer token, **expires in 60 minutes**. | `cfo_qb_tokens.accessToken` (AES-256-GCM encrypted) + `expiresAt` |
| **Refresh token** | Used to mint new access tokens. **Rotates on every use.** | `cfo_qb_tokens.refreshToken` (AES-256-GCM encrypted) |
| **Entity** | A record type: `Invoice`, `Payment`, `Purchase`, `Customer`, `Account`, etc. | One `cfo_qb_*` table per entity type we sync |
| **`SyncToken`** | Per-record version counter. Required when writing back to QBO. | Stored inside `rawData` JSONB — we don't write back yet |
| **Minor version** | API schema version. Must be **≥ 75** (versions 1–74 deprecated Aug 2025). | `MINOR_VERSION = 75` constant in `client.ts` |

**One company file = one `realmId`.** A single Intuit login may have access to multiple company files; each is authorized and synced independently.

---

## 2. Architecture: how QB data reaches the screen

```
┌─────────────┐   OAuth    ┌──────────────────┐
│  Company /  │──────────▶ │  Intuit OAuth    │
│ super_admin │            │  (appcenter)     │
└─────────────┘            └────────┬─────────┘
       │                            │ code → encrypted tokens
       │                            ▼
       │                   cfo_qb_tokens (AES-256-GCM)
       │                   cfo_qb_connections
       │
       │  QB change event (real-time)
       │  POST /api/quickbooks/webhook ──HMAC verify──▶ cfo_webhook_events
       │                                                       │
       │  manual sync (button)   daily cron (06:00 UTC)        │ async fetch+upsert
       ▼                                   │                   ▼
┌────────────────────────┐                 │        syncEntityById / deleteEntityById
│ POST /api/quickbooks/  │◀────────────────┘
│ sync                   │  POST /api/cron/sync (Bearer CRON_SECRET)
└───────────┬────────────┘
            ▼
   syncCompany(realmId, userId)          src/lib/quickbooks/sync.ts
            │
            │  resolveSyncMode(lastSyncAt)
            ├─── full (first sync or >30d stale) ──▶ fetchAllPages + delete-then-insert
            └─── incremental (<30d)               ──▶ qbCdc + onConflictDoUpdate
            │
            │  QBO /query or /cdc endpoint  (token auto-refreshed)
            ▼
   cfo_qb_invoices / cfo_qb_payments / cfo_qb_expenses
   cfo_qb_accounts / cfo_qb_customers
            │
            ▼
   runAllCalculations(realmId)           src/lib/calculations/index.ts
            │
            ▼
   cfo_calculated_reports  (revenue_analysis | cash_flow | kpi | risk)
            │
            ▼  [planned] regenerate ai_insights per company
            ▼
   GET /api/dashboard/*  ──reads cache──▶  Dashboard pages (UI)
```

---

## 3. Authorization (OAuth 2.0)

### 3.1 The flow (Authorization Code grant)

Implementation: `src/lib/quickbooks/oauth.ts` + `src/app/api/quickbooks/connect/route.ts` + `src/app/api/quickbooks/callback/route.ts`.

```
1. User clicks "Connect QuickBooks"
       → GET /api/quickbooks/connect
       → builds auth URL with CSRF state token, redirects to Intuit

   https://appcenter.intuit.com/connect/oauth2
     ?client_id=QUICKBOOKS_CLIENT_ID
     &redirect_uri=QUICKBOOKS_REDIRECT_URI
     &response_type=code
     &scope=com.intuit.quickbooks.accounting
     &state=<userId:randomHex>

2. User logs into Intuit, selects their company file, approves.
3. Intuit redirects to: /api/quickbooks/callback?code=...&realmId=...&state=...
4. We verify state, exchange code for tokens, encrypt + persist both tokens.
5. Initial full sync runs immediately in the background (fire-and-forget).
```

### 3.2 Endpoints & scope

| Purpose | URL |
|---|---|
| Authorization | `https://appcenter.intuit.com/connect/oauth2` |
| Token exchange / refresh | `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer` |
| Sandbox API base | `https://sandbox-quickbooks.api.intuit.com/v3/company` |
| Production API base | `https://quickbooks.api.intuit.com/v3/company` |

- **Scope:** `com.intuit.quickbooks.accounting` — enough to read all accounting data.
- **Not needed:** `com.intuit.quickbooks.payments` (only required if processing payments through Intuit).
- Token endpoint uses HTTP Basic auth: `base64(client_id:client_secret)`.

### 3.3 Token lifetimes & rotation (critical — affects sync design)

| Token | Lifetime | Notes |
|---|---|---|
| **Access token** | **60 minutes** | We refresh proactively when ≤10 min remain (`getValidToken` in `client.ts`). |
| **Refresh token** | **Rotates on every use**; valid up to **5 years** max (hard cap from Nov 2025). | Old "valid as long as used within 100 days" model is **gone**. |

**What this means for our code:**
- ✅ `forceRefreshToken` in `client.ts` always persists the **new** refresh token from every response — required because rotation invalidates the old one immediately.
- ✅ Both tokens are AES-256-GCM encrypted before DB storage (`src/lib/quickbooks/tokens.ts`).
- ⚠️ We don't yet store `x_refresh_token_expires_in` — adding this would let the UI warn a company before their 5-year token cap is reached.
- ⚠️ If a token refresh fails (`invalid_grant`), we set `cfo_qb_connections.isActive = false` and `syncError` — the UI should surface this so the company owner reconnects.

### 3.4 Token encryption

Tokens are encrypted with **AES-256-GCM** in `src/lib/quickbooks/tokens.ts` before any DB write.

```
Storage format (single hex string):
  iv (12 bytes / 24 hex) | authTag (16 bytes / 32 hex) | ciphertext (variable)

Key: QUICKBOOKS_TOKEN_ENC_KEY — 64-char hex (32 bytes)
Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> ⚠️ **Spec originally required Supabase Vault** for token storage. We intentionally chose app-level AES-256-GCM instead — it is self-contained, requires no Supabase Vault extension, and is equally secure for our threat model. If Supabase Vault is enabled in future, tokens can be migrated without schema changes (column type stays `text`).

> ⚠️ **Existing plaintext tokens** in `cfo_qb_tokens` will throw a "Token format invalid — please reconnect" error on first use after this change is deployed. Fix: each company reconnects QB once to re-issue encrypted tokens.

---

## 4. Spec requirements vs. current implementation status

This table maps every QB-related requirement from `project-overview.md` to its current state.

### 4.1 QuickBooks integration (from spec §Core Features #2)

| Spec requirement | Status | Notes |
|---|---|---|
| OAuth2 connection flow | ✅ Built | `/api/quickbooks/connect` + `/api/quickbooks/callback` |
| Company owner connects their QB account | ✅ Built | Via `/qb-connect` page |
| Superadmin can connect QB on behalf of company | ✅ Built | State param carries `userId` |
| Token storage — encrypted | ✅ Built | AES-256-GCM in `cfo_qb_tokens` |
| Token auto-refresh before expiry | ✅ Built | `getValidToken` refreshes if ≤10 min remain |
| Daily automatic sync (06:00 UTC) | ✅ Built | `POST /api/cron/sync` with `CRON_SECRET` |
| On-demand manual sync | ✅ Built | `POST /api/quickbooks/sync` |
| Sync: Invoices | ✅ Built | `cfo_qb_invoices`, paginated, CDC-aware |
| Sync: Customers | ✅ Built | `cfo_qb_customers`, paginated, CDC-aware |
| Sync: Payments | ✅ Built | `cfo_qb_payments`, paginated, CDC-aware |
| Sync: Expenses | ✅ Built | `cfo_qb_expenses` (from QB `Purchase` entity), paginated, CDC-aware |
| Sync: Profit & Loss | ⏳ Planned | Spec requires this. Currently *derived* from invoices/expenses in `calculations/index.ts`. For accountant-accurate P&L, use the QBO Reports API (`/reports/ProfitAndLoss`) — see §8. |
| Error handling on sync failure | ✅ Partial | `syncError` logged to `cfo_qb_connections` + `cfo_activity_logs`. **429 backoff/retry not yet implemented** — see §9. |
| Sync status visible on dashboard | ⏳ Planned | `lastSyncAt` + `syncError` are stored in `cfo_qb_connections` but no dashboard UI component reads them yet. |
| Real-time updates via webhooks | ✅ Built | `POST /api/quickbooks/webhook` with HMAC-SHA256 verification |
| Incremental sync (CDC) | ✅ Built | Full sync on first connect or if >30 days stale; CDC thereafter |

### 4.2 Spec DB tables vs. current schema

The spec (`project-overview.md`) defines 10 tables. Here is how each maps to our actual schema:

| Spec table | Our table | Status | Gap |
|---|---|---|---|
| `profiles` | `cfo_users` | ✅ Exists | Missing `phone`, `avatar_url`. Extra: `companyId`, `isActive`. |
| `companies` | *(none)* | ❌ **Not built** | Spec requires a standalone company profile (name, industry, email, phone, address) independent of QB connection. We only have `cfo_qb_connections` which is QB-specific. **Must build.** |
| `client_company` | *(none)* | ❌ **Not built** | Spec requires a join table so one customer can buy from multiple companies. Without it the client dashboard "Companies I buy from" cannot work. **Must build.** |
| `orders` | *(none)* | ❌ **Not built** | Spec requires `orders` with status flow (`pending → confirmed → shipped → delivered → cancelled`). Client dashboard "Place new order" has no backend. **Must build.** |
| `invoices` (portal-managed) | `cfo_qb_invoices` | ⚠️ Partial | We sync QB invoices. Spec also requires *portal-native* invoices (with `qb_invoice_id` as an optional link). Statuses differ: QB = `Open/Paid/Voided/Draft` vs spec = `draft/sent/viewed/paid/overdue`. |
| `payments` (portal-managed) | `cfo_qb_payments` | ⚠️ Partial | We sync QB payments. Spec requires portal-native payments linked to portal invoices. |
| `expenses` | `cfo_qb_expenses` | ✅ Functionally equivalent | Spec uses `company_id` FK; we use `realmId`. Same data. |
| `chat_history` | *(none)* | ❌ **Not built** | AI chat turns are not persisted. Spec: store indefinitely, index on `conversation_id`. **Must build for AI chat feature.** |
| `ai_insights` | *(none)* | ❌ **Not built** | No daily insight cache. Spec: 24-hour expiry, `insight_type`, `severity`. **Must build.** |
| `qb_sync_logs` | `cfo_activity_logs` | ⚠️ Partial | `cfo_activity_logs` captures sync events but lacks: per-entity `sync_type`, `records_synced`, `started_at`, `completed_at`. |

### 4.3 Security gaps (from spec §Security)

| Spec requirement | Status | Notes |
|---|---|---|
| RLS on every table | ❌ **Not built** | Spec: "All tables should have RLS policies enabled." No RLS exists on any `cfo_*` table. Without RLS, data isolation relies entirely on application-layer `requireRole` checks. **Critical before production.** |
| Supabase Vault for QB tokens | ⚠️ Diverged | We use app-level AES-256-GCM instead (see §3.4). Functionally equivalent. |
| Rate limiting on API endpoints | ❌ Not built | Spec mentions it; not implemented. |

### 4.4 Remaining open items (must fix before production)

- [ ] **Companies table** — standalone company profile independent of QB connection
- [ ] **Client-company join table** — multi-company customer relationships
- [ ] **Orders table** — client order placement and tracking
- [ ] **Chat history table** — persist AI chat turns
- [ ] **AI insights table** — 24-hour cached daily insights per company
- [ ] **RLS policies** — on all `cfo_*` tables
- [ ] **429 backoff/retry** — exponential backoff in `client.ts` (see §9)
- [ ] **P&L from Reports API** — accountant-accurate profit & loss
- [ ] **AI insight regeneration** — trigger after every sync (step 8 of spec sync flow)
- [ ] **Sync status UI** — surface `lastSyncAt` + `syncError` on the dashboard
- [ ] **Alert system** — 6 alert types from spec (see §alert-config below)

---

## 5. Alert configuration (from `project-overview.md`)

These thresholds are specified in the spec and must be implemented. No alert code exists yet.

| Alert type | Threshold | Severity | Data source |
|---|---|---|---|
| Overdue Invoice | 10 days past due date | Medium | `cfo_qb_invoices` where `status=Open` and `dueDate < today - 10` |
| Expense Spike | 20% above category average | Medium | `cfo_qb_expenses` — compare last 30d vs prior 30d |
| Revenue Decline | 15% drop from last month | High | `cfo_calculated_reports` (revenue_analysis) |
| Payment Delay | 3 days late | Low | `cfo_qb_invoices` vs `cfo_qb_payments` |
| Client Churn Risk | 50% drop in purchases | High | `cfo_qb_payments` grouped by `customerName` |
| Low Cash Flow | Below 30-day expense run rate | High | `cfo_calculated_reports` (cash_flow) |

**Display:** color-coded cards on all dashboards. Red = High, Yellow = Medium, Green = positive.
**Email alerts:** spec says build the infrastructure but keep disabled by default — add a settings toggle.

---

## 6. Syncing data from QuickBooks

### 6.1 Sync modes

`syncCompany` in `src/lib/quickbooks/sync.ts` picks a mode automatically:

| Condition | Mode | Strategy |
|---|---|---|
| `lastSyncAt` is null (first sync) | **Full** | Paginated delete-then-insert |
| `lastSyncAt` > 30 days ago | **Full** | Same — CDC max look-back is 30 days |
| `lastSyncAt` ≤ 30 days ago | **Incremental (CDC)** | `/cdc?changedSince=lastSyncAt` + upsert |

### 6.2 Full sync — paginated query

```
GET /v3/company/{realmId}/query?query=<SQL>&minorversion=75
Authorization: Bearer <decrypted_access_token>
```

Entities and queries:
```sql
SELECT * FROM Invoice  STARTPOSITION 1 MAXRESULTS 1000   -- paginate until short page
SELECT * FROM Payment  STARTPOSITION 1 MAXRESULTS 1000
SELECT * FROM Purchase STARTPOSITION 1 MAXRESULTS 1000   -- expenses
SELECT * FROM Account  WHERE Active = true STARTPOSITION 1 MAXRESULTS 1000
SELECT * FROM Customer STARTPOSITION 1 MAXRESULTS 1000
```

**Pagination rules:**
- Max 1,000 records per response; no cursor. Increment `STARTPOSITION` by 1,000 until the page is short.
- `fetchAllPages` helper in `sync.ts` handles this loop for all entities.
- Inserts are chunked at 500 rows/batch to stay under Postgres' bind-parameter limit.

### 6.3 Incremental sync — CDC

```
GET /v3/company/{realmId}/cdc
  ?entities=Invoice,Payment,Purchase,Account,Customer
  &changedSince=<lastSyncAt ISO 8601>
  &minorversion=75
```

- Returns all records changed since `changedSince` in one response (no pagination).
- Rows are upserted via `onConflictDoUpdate` on the unique index `(realmId, qbId)`.
- `Delete` operations on the webhook → `deleteEntityById` removes the local row.

### 6.4 Seeding (first sync after OAuth connect)

1. `/api/quickbooks/callback` stores encrypted tokens → inserts `cfo_qb_connections`.
2. Immediately fires `syncCompany(realmId, userId)` in the background (fire-and-forget).
3. Full paginated sync runs for all 5 entities.
4. `runAllCalculations(realmId)` runs → dashboard has data on first load.
5. `lastSyncAt` is set → all future syncs use CDC.

> Intuit's **sandbox** provides a pre-seeded company with sample data — no manual entry needed to test this flow.

### 6.5 Storage strategy

- Every entity table stores **flattened queryable columns** + the **full QBO object in `rawData` (JSONB)** so no data is lost and fields can be re-derived without re-syncing.
- **Full sync path:** delete all rows for the realm, then batch-insert fresh data.
- **CDC path:** upsert by `(realmId, qbId)` using `onConflictDoUpdate` — unique indexes exist on all 5 entity tables (migration `0002`).
- `syncedAt` is refreshed to `now()` on every upsert.

---

## 7. Entity → table field mapping

`rawData` always holds the complete QBO object for each row.

### Invoice → `cfo_qb_invoices`
| QBO field | Column | Notes |
|---|---|---|
| `Id` | `qbId` | |
| `DocNumber` | `invoiceNumber` | |
| `CustomerRef.value` / `.name` | `customerId` / `customerName` | |
| `TotalAmt` | `totalAmount` | |
| `Balance` | `balance` | Amount still owed; `0` = paid |
| `DueDate` / `TxnDate` | `dueDate` / `txnDate` | |
| derived | `status` | `Paid` if balance≤0 & total>0; `Open` if balance>0; `Voided` if PrivateNote contains "void"; else `Draft` |

### Payment → `cfo_qb_payments`
| QBO field | Column | Notes |
|---|---|---|
| `Id` | `qbId` | |
| `CustomerRef` | `customerId` / `customerName` | |
| `TotalAmt` | `totalAmount` | |
| `TxnDate` | `paymentDate` | |
| `PaymentMethodRef.name` | `paymentMethod` | |
| `Line[].LinkedTxn[].TxnId` | `invoiceIds` (JSONB array) | Links payment to invoices — drives DSO/AR-days calc |

### Purchase → `cfo_qb_expenses`
| QBO field | Column | Notes |
|---|---|---|
| `Id` | `qbId` | |
| `EntityRef` | `vendorId` / `vendorName` | |
| `Line[0].AccountBasedExpenseLineDetail.AccountRef` | `accountId` / `accountName` / `category` | ⚠️ Only `Line[0]` — multi-line purchases lose lines 2+ |
| `TotalAmt` | `totalAmount` | |
| `TxnDate` | `expenseDate` | |

### Account → `cfo_qb_accounts`
| QBO field | Column |
|---|---|
| `Id` | `qbId` |
| `Name` | `name` |
| `AccountType` / `AccountSubType` | `accountType` / `accountSubType` |
| `CurrentBalance` | `currentBalance` |
| `Active` | `isActive` |

### Customer → `cfo_qb_customers`
| QBO field | Column |
|---|---|
| `Id` | `qbId` |
| `DisplayName` | `displayName` |
| `PrimaryEmailAddr.Address` | `email` |
| `PrimaryPhone.FreeFormNumber` | `phone` |
| `Balance` | `balance` |
| `BillAddr` | `billAddr` (JSONB) |
| `Active` | `isActive` |

### Entities not yet synced (spec mentions or implied)

| QBO entity | Why it matters | When to add |
|---|---|---|
| **`Bill`** | Accounts payable — money owed to vendors. More complete than `Purchase` alone. | When AP reporting is needed |
| **`SalesReceipt`** | Point-of-sale income with no invoice. Ignoring these undercounts revenue. | Before P&L is accountant-accurate |
| **`CreditMemo` / `RefundReceipt`** | Reduce revenue. Ignoring them overstates revenue. | Same |
| **Profit & Loss (Reports API)** | Spec requires P&L sync. Currently derived/approximated. | When super_admin portfolio view is built |

---

## 8. Profit & Loss — spec requirement

Spec `project-overview.md` §QuickBooks Sync lists "Profit & Loss → summary reports" as a required sync type.

**Current state:** `calculations/index.ts` derives an *approximation* of P&L from synced invoices and expenses. This ignores accruals, journal entries, and COGS adjustments.

**Planned (accountant-accurate):** Use the QBO Reports API:
```
GET /v3/company/{realmId}/reports/ProfitAndLoss
  ?start_date=2026-01-01&end_date=2026-06-30&minorversion=75
```

Other useful reports: `BalanceSheet`, `CashFlow`, `AgedReceivables` (feeds our risk widget), `AgedPayables`.

> Reports return a **nested row structure** (`Rows.Row[]`), not flat objects. Parse recursively. Reports do **not** support `STARTPOSITION`/`MAXRESULTS`.

**Recommendation:** Keep derived calcs for the live dashboard widgets (fast, no extra API call). Use the Reports API for the super_admin portfolio view where accountant-grade accuracy is required.

---

## 9. Webhooks

### How they work

- Register one webhook URL in the Intuit developer portal; subscribe to entities.
- On any change, Intuit POSTs a notification with: `realmId`, entity name, entity `Id`, operation (`Create`/`Update`/`Delete`/`Void`/`Merge`) — **but not the changed data**.
- Our handler fetches the current record from QBO and upserts it.
- Notifications can arrive out of order or more than once — handler is idempotent.

### Current implementation (`src/app/api/quickbooks/webhook/route.ts`)

```
POST /api/quickbooks/webhook  (in PUBLIC_API_PREFIXES — no auth session required)

1. Read raw body as text (required for HMAC — parsed JSON body won't match).
2. Verify: HMAC-SHA256(rawBody, QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN) == intuit-signature header.
   Uses timingSafeEqual to prevent timing attacks. Returns 401 on mismatch.
3. Batch-insert all events into cfo_webhook_events (processed=false).
4. Return 200 immediately — Intuit retries on non-2xx.
5. Fire-and-forget processEvents():
   - For each event: look up userId from cfo_qb_connections.
   - "Delete" operation → deleteEntityById(realmId, entityType, qbId)
   - All other operations → syncEntityById(realmId, userId, entityType, qbId)
     (fetches single record from QBO by Id, upserts into correct local table)
   - Mark processed=true. Failed events stay processed=false for debugging.
```

> Webhooks complement (don't replace) the daily cron. Use webhooks for near-real-time freshness; use the daily CDC sync as a safety net for any missed deliveries.

---

## 10. Rate limits & quotas

| Limit | Value | Scope |
|---|---|---|
| Standard requests | **500 / minute** | per `realmId` |
| Concurrent requests | **10** | per app |
| Batch endpoint | **120 / minute** (prod since Oct 2025) | per `realmId` |
| Resource-intensive endpoints | **200 / minute** | per `realmId` |
| Over limit response | **HTTP 429 Too Many Requests** | — |

**App Partner Program (live Jul 2025):** free Builder tier = **500,000 read operations/month**. Beyond that, reads are blocked. CDC (few reads per sync) vs full polling (many reads) matters significantly at the spec target of **100+ companies**.

**⚠️ 429 backoff not yet implemented.** `client.ts` currently throws immediately on non-2xx. Required before production:
- Exponential backoff with jitter on 429 responses.
- Respect the `Retry-After` header if present.
- Cap total concurrency to ≤10 in-flight company syncs at once.

---

## 11. Automatic vs. manual tasks

### ✅ Automatic (no human needed)

| Task | Trigger | Code |
|---|---|---|
| Access token refresh | On any API call when token ≤10 min from expiry | `client.ts → getValidToken / forceRefreshToken` |
| Refresh token rotation persistence | Every token refresh persists the new token | `forceRefreshToken` |
| Daily full/incremental sync | Cron at **06:00 UTC** | `POST /api/cron/sync` → `syncCompany` |
| First-time seed sync | After OAuth callback | `callback/route.ts` → `syncCompany` (fire-and-forget) |
| CDC vs full decision | Each sync call | `resolveSyncMode(lastSyncAt)` |
| CFO calculations | After every sync | `runAllCalculations` |
| `lastSyncAt` / `syncError` bookkeeping | After every sync | `syncCompany` |
| Activity logging | After sync success/failure | `cfo_activity_logs` |
| Webhook processing | On Intuit POST to `/api/quickbooks/webhook` | `processEvents` (fire-and-forget) |

### ✋ Manual (requires a human)

| Task | Who | Notes |
|---|---|---|
| Initial QuickBooks connection (OAuth consent) | Company owner or super_admin | Intuit requires interactive login + company selection — cannot be automated |
| Reconnect after token expiry / revocation | Company owner or super_admin | Triggered when `isActive=false` or `invalid_grant`; the UI must surface this |
| Reconnect after `QUICKBOOKS_TOKEN_ENC_KEY` rotation | Company owner or super_admin | Rotating the key invalidates all existing encrypted tokens |
| On-demand sync ("Sync now" button) | Any dashboard user with company access | `POST /api/quickbooks/sync` |
| Registering webhook URL in Intuit portal | Developer | One-time per environment; copy verifier token to `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN` |
| Production go-live: app review | Developer / owner | Technical + Security + Marketing review (~6 weeks total) |
| Switching sandbox → production keys | Developer | Dev and prod keys are not interchangeable |
| Running DB migrations | Developer / DevOps | `npm run db:migrate` after every `git pull` that adds migrations |

---

## 12. Environments & go-live checklist

| | Sandbox | Production |
|---|---|---|
| API base | `https://sandbox-quickbooks.api.intuit.com` (default if `QUICKBOOKS_API_BASE` unset) | `https://quickbooks.api.intuit.com` |
| Keys | Development keys only | Production keys only |
| Data | Pre-seeded sample company | Real customer data |
| Webhook URL | ngrok or similar tunnel | Public HTTPS domain |

**Go-live checklist:**
- [x] Env vars standardized on `QUICKBOOKS_*` + `.env.example` committed
- [x] `minorversion=75`
- [x] API base URL env-driven (`QUICKBOOKS_API_BASE`)
- [x] Customer sync
- [x] Pagination (`STARTPOSITION` loop)
- [x] CDC incremental sync
- [x] Webhook handler + HMAC-SHA256 signature verification
- [x] Token encryption at rest (AES-256-GCM)
- [ ] Companies table (standalone, independent of QB)
- [ ] Client-company join table
- [ ] Orders table
- [ ] Chat history table
- [ ] AI insights table (24h cache)
- [ ] RLS policies on all `cfo_*` tables
- [ ] Alert system (6 thresholds from spec)
- [ ] 429 backoff/retry in `client.ts`
- [ ] Profit & Loss via QBO Reports API (for super_admin view)
- [ ] Sync status UI on dashboard
- [ ] AI insight regeneration after each sync
- [ ] Complete Intuit app review (Technical → Security → Marketing)
- [ ] Register production redirect URI + webhook URL in Intuit portal
- [ ] Rotate all secrets to production values

---

## 13. Environment variables (QuickBooks)

```
QUICKBOOKS_CLIENT_ID               # Intuit app client ID (server-only — never NEXT_PUBLIC_)
QUICKBOOKS_CLIENT_SECRET           # Intuit app client secret
QUICKBOOKS_REDIRECT_URI            # OAuth callback — must exactly match Intuit portal registration
QUICKBOOKS_API_BASE                # Sandbox or production base URL (defaults to sandbox if unset)
QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN  # HMAC-SHA256 key from Intuit portal — required for webhook security
QUICKBOOKS_TOKEN_ENC_KEY           # 64-char hex (32 bytes) AES-256-GCM key for token encryption at rest
CRON_SECRET                        # Bearer token guarding POST /api/cron/sync
```

See `MANUAL_ACTIONS.md` for where to get each value and how to generate the keys.

---

## 14. Architectural decisions (divergences from spec)

| Spec said | What we built | Why |
|---|---|---|
| Tokens in `companies` table | Separate `cfo_qb_tokens` + `cfo_qb_connections` tables | Better separation of concerns — OAuth tokens have a different lifecycle than company metadata |
| Supabase Vault for token encryption | App-level AES-256-GCM (`tokens.ts`) | Self-contained, no Vault extension dependency, equally secure. Can migrate to Vault later without schema changes. |
| Supabase Edge Functions for cron | Next.js API route (`/api/cron/sync`) | Simpler — one codebase. Any external scheduler (Vercel Cron, GitHub Actions) can call the endpoint. |
| `superadmin` / `client` role names | `super_admin` / `customer` in code | Snake-case matches Postgres enum conventions; `customer` avoids reserved-word conflicts. Spec uses `client` — keep `customer` in code everywhere. |
| `profiles` table | `cfo_users` table | Prefixed to avoid collision with Supabase internal tables; adds `companyId` + `isActive` needed for our role model. |
| AI: Claude API | Groq API (`llama-3.3-70b-versatile`) | No Claude API key available; Groq provides equivalent capability with the available key. |

---

## Sources

- [Minor versions of our API — Intuit Developer](https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/minor-versions)
- [Changes to our Accounting API (minor version 75 deprecation)](https://blogs.a.intuit.com/2025/01/21/changes-to-our-accounting-api-that-may-impact-your-application/)
- [Important changes to refresh token policy — Intuit Developer](https://blogs.intuit.com/2025/11/12/important-changes-to-refresh-token-policy/)
- [Set up OAuth 2.0 — Intuit Developer](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0)
- [OAuth 2.0 & authorization FAQ — Intuit Developer](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/faq)
- [Change Data Capture (CDC) — Intuit Developer](https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/change-data-capture)
- [Query operations and syntax — Intuit Developer](https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/data-queries)
- [Webhooks — Intuit Developer](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks)
- [API call limits and throttling — Intuit Help](https://help.developer.intuit.com/s/article/API-call-limits-and-throttling)
- [Sandboxes and testing tools — Intuit Developer](https://developer.intuit.com/app/developer/qbo/docs/develop/sandboxes)
- [Invoice / Payment / Customer / Bill API references — Intuit Developer](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice)
- [Best Practices for Intuit API Optimization — Intuit Developer Community](https://blogs.intuit.com/2025/08/11/best-practices-for-intuit-api-optimization-part-1/)
