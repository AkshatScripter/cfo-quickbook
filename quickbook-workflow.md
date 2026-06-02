# QuickBooks Integration Workflow

> Complete, project-specific reference for how QuickBooks Online (QBO) data flows into this app, how we authorize, sync, store, and display it, and what is automatic vs. manual.
>
> **Researched against the QBO Accounting API as of June 2026 (minor version 75).** Sources are linked at the bottom.

---

## 0. TL;DR — What this app does with QuickBooks

1. A **company** (or a **super_admin** on their behalf) connects their QuickBooks Online account via OAuth 2.0.
2. We store the OAuth tokens server-side (`cfo_qb_tokens`) and the connection metadata (`cfo_qb_connections`).
3. On connect, on a daily cron, and on manual trigger, we **pull** invoices, payments, expenses, and accounts from the QBO API into our own Postgres tables (`cfo_qb_*`).
4. We run derived **CFO calculations** (revenue, cash flow, KPI, risk) over the synced data and cache them in `cfo_calculated_reports`.
5. Dashboard pages read **only from our DB** (never live from QBO), so the UI is fast and works even when QBO is rate-limited or the token is briefly invalid.

> **Key principle:** QBO is the source of truth; our DB is a synced *read replica* scoped per company (`realmId`). The UI never calls QBO directly — it calls our `/api/*` routes, which read our DB.

---

## 1. Core QuickBooks concepts (mapped to our schema)

| QBO concept | What it is | Where it lives in our app |
|---|---|---|
| **`realmId`** (Company ID) | Unique ID of one QuickBooks **company file**. Every API call is scoped to one realm. | `cfo_qb_connections.realmId`, `cfo_qb_tokens.realmId`, and `realmId` on every `cfo_qb_*` table |
| **Access token** | Bearer token, **expires in 60 minutes**. | `cfo_qb_tokens.accessToken` + `expiresAt` |
| **Refresh token** | Used to mint new access tokens. Rotates frequently (see §3.3). | `cfo_qb_tokens.refreshToken` |
| **Entity** | A record type: `Invoice`, `Payment`, `Purchase`, `Bill`, `Customer`, `Account`, etc. | One `cfo_qb_*` table per entity we sync |
| **`SyncToken`** | Per-record version counter. Must be sent on updates; also used to detect stale data. | Stored inside `rawData` JSONB (we don't write back yet) |
| **Minor version** | API schema version. **Must be ≥ 75** as of Aug 1, 2025. | Query string `minorversion=` in `client.ts` |

**One company file = one `realmId`.** A QuickBooks login can have access to multiple company files; each is authorized separately and produces its own `realmId`. This maps cleanly to our multi-company model: one `cfo_qb_connections` row per realm.

---

## 2. Architecture: how QB data reaches the screen

```
┌─────────────┐   OAuth    ┌──────────────────┐
│  Company /  │──────────▶ │  Intuit OAuth    │
│ super_admin │            │  (appcenter)     │
└─────────────┘            └────────┬─────────┘
       │                            │ code → tokens
       │                            ▼
       │                   cfo_qb_tokens / cfo_qb_connections
       │
       │  manual sync (button)          daily cron (06:00 UTC)
       ▼                                        │
┌────────────────────────┐                      │
│ POST /api/quickbooks/   │   POST /api/cron/sync (Bearer CRON_SECRET)
│ sync                    │◀─────────────────────┘
└───────────┬─────────────┘
            ▼
   syncCompany(realmId, userId)   ── src/lib/quickbooks/sync.ts
            │
            │  qbQuery(...) → QBO /query endpoint (auto token refresh)
            ▼
   cfo_qb_invoices / cfo_qb_payments / cfo_qb_expenses / cfo_qb_accounts
            │
            ▼
   runAllCalculations(realmId)    ── src/lib/calculations/index.ts
            │
            ▼
   cfo_calculated_reports  (revenue_analysis | cash_flow | kpi | risk)
            │
            ▼
   GET /api/dashboard/*  ──reads cache──▶  Dashboard pages (UI)
```

**The UI never touches QuickBooks.** It reads `cfo_qb_*` and `cfo_calculated_reports` through our API routes. This is why the dashboard stays responsive and survives QBO outages or rate limits.

---

## 3. Authorization (OAuth 2.0)

### 3.1 The flow (Authorization Code grant)

QuickBooks uses standard OAuth 2.0 Authorization Code grant. Our implementation lives in `src/lib/quickbooks/oauth.ts`.

```
1. User clicks "Connect QuickBooks"
       → GET /api/quickbooks/connect
       → builds auth URL, redirects to Intuit
   ┌───────────────────────────────────────────────────────────┐
   │ https://appcenter.intuit.com/connect/oauth2                 │
   │   ?client_id=...                                            │
   │   &redirect_uri=...                                         │
   │   &response_type=code                                       │
   │   &scope=com.intuit.quickbooks.accounting                   │
   │   &state=<csrf-token>                                       │
   └───────────────────────────────────────────────────────────┘
2. User logs into Intuit, picks a company, approves.
3. Intuit redirects back to our redirect_uri with ?code=...&realmId=...&state=...
       → GET /api/quickbooks/callback
4. We verify `state`, then exchange `code` for tokens (POST to token endpoint).
5. We persist tokens (cfo_qb_tokens) + connection (cfo_qb_connections) keyed by realmId.
```

### 3.2 Endpoints & scope

| Purpose | URL |
|---|---|
| Authorization | `https://appcenter.intuit.com/connect/oauth2` |
| Token exchange / refresh | `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer` |
| Sandbox API base | `https://sandbox-quickbooks.api.intuit.com/v3/company` |
| Production API base | `https://quickbooks.api.intuit.com/v3/company` |

- **Scope we need:** `com.intuit.quickbooks.accounting` (read accounting data). We do **not** need `com.intuit.quickbooks.payments` unless we process payments through Intuit.
- Token auth uses HTTP Basic with `base64(client_id:client_secret)` on the token endpoint.

### 3.3 Token lifetimes (⚠️ updated policy — affects our sync design)

| Token | Lifetime | Notes |
|---|---|---|
| **Access token** | **60 minutes** | Refresh proactively; we refresh if it expires within 10 min (`client.ts → getValidToken`). |
| **Refresh token** | **Rotates roughly every 24 hours**; each new refresh token is valid up to **5 years** max. | **Old "valid as long as used within 100 days / effectively permanent" model is gone.** |

**What changed (2023–2025 rollout, formalized Nov 2025):**
- Refresh tokens now have a **hard 5-year cap** (for `accounting` scope, tokens issued from Oct 2023; first expiries land Oct 2028).
- Refresh tokens **rotate**: every token refresh may return a **new refresh token** that you must persist, replacing the old one. Old refresh tokens become invalid.
- The token response now includes a field indicating **when the refresh token expires** — store it so we can warn the user before it lapses.

**Implications for our code (we already do most of this, but verify):**
- ✅ `forceRefreshToken` in `client.ts` already persists `fresh.refresh_token` back to the DB on every refresh — this is **required** because of rotation. Do **not** assume the refresh token is stable.
- ⚠️ We should also persist `x_refresh_token_expires_in` (we currently ignore it) so the UI can prompt reconnect before the 5-year cap.
- ⚠️ If a company's app is idle for a long time and we never refresh, rotation means a stale refresh token will fail with `invalid_grant` → we mark the connection broken (`isActive = false`) and prompt reconnect. This path already exists in `forceRefreshToken`'s catch block.

---

## 4. ⚠️ Known issues in current code (fix before production)

These are concrete mismatches found in the current implementation.

> **Status (2026-06-02):** #1, #2, #3 have been **fixed** — env vars standardized on `QUICKBOOKS_*` with a committed `.env.example`, `minorversion=75`, and the API base URL is now env-driven via `QUICKBOOKS_API_BASE` (defaults to sandbox). #4–#8 remain open.


| # | Issue | Location | Fix |
|---|---|---|---|
| 1 | **Env var name mismatch.** `oauth.ts` reads `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_REDIRECT_URI`, but `CLAUDE.md`/spec use `QB_CLIENT_ID` / `QB_REDIRECT_URI` (and spec also shows `NEXT_PUBLIC_QB_CLIENT_ID`). **OAuth will silently break** if the wrong names are set. | `src/lib/quickbooks/oauth.ts` | Pick one naming convention and align `.env`, code, and docs. Recommend `QUICKBOOKS_*` (matches code). Do **not** make the client ID `NEXT_PUBLIC_` — it is used only server-side. |
| 2 | **Deprecated minor version.** `client.ts` sends `minorversion=65`. Minor versions 1–74 were **deprecated Aug 1, 2025** and are ignored (server falls back to 75). | `src/lib/quickbooks/client.ts` | Change to `minorversion=75`. |
| 3 | **Sandbox URL hardcoded.** `QB_BASE` is the sandbox host. Production will hit the wrong server. | `src/lib/quickbooks/client.ts` | Drive base URL from env (`QUICKBOOKS_API_BASE`), sandbox in dev, `quickbooks.api.intuit.com` in prod. |
| 4 | **No `Customer` sync.** Spec requires syncing customers; we only derive customer names from `CustomerRef` on invoices. | `src/lib/quickbooks/sync.ts` | Add a `syncCustomers` + `cfo_qb_customers` table (see §6). |
| 5 | **No pagination.** Every sync caps at `MAXRESULTS 1000`. Companies with >1000 invoices silently lose data. | `src/lib/quickbooks/sync.ts` | Loop `STARTPOSITION` (see §5.3). |
| 6 | **Full delete-then-insert every sync.** Doesn't scale to 100+ companies (spec goal) and burns rate limit. | `src/lib/quickbooks/sync.ts` | Move to **CDC incremental sync** (see §5.4). |
| 7 | **Webhooks table exists but no handler.** `cfo_webhook_events` is defined but nothing writes to it. | — | Add `/api/quickbooks/webhook` (see §7). |
| 8 | **Tokens stored in plaintext.** Spec requires encryption (Supabase Vault). | `cfo_qb_tokens` | Encrypt at rest before production. |

---

## 5. Syncing data from QuickBooks

### 5.1 The Query Language (current approach)

QBO exposes a SQL-like read endpoint:

```
GET /v3/company/{realmId}/query?query=<url-encoded SQL>&minorversion=75
Authorization: Bearer <access_token>
Accept: application/json
```

Example queries we use today (`sync.ts`):

```sql
SELECT * FROM Invoice  MAXRESULTS 1000
SELECT * FROM Payment  MAXRESULTS 1000
SELECT * FROM Purchase MAXRESULTS 1000          -- expenses
SELECT * FROM Account WHERE Active = true MAXRESULTS 1000
```

### 5.2 Query rules & limits

- **Max 1,000 records per response**, default **100**. There is **no cursor / next-page token**.
- Pagination is manual via `STARTPOSITION` (1-based) and `MAXRESULTS`:
  ```sql
  SELECT * FROM Invoice STARTPOSITION 1    MAXRESULTS 1000
  SELECT * FROM Invoice STARTPOSITION 1001 MAXRESULTS 1000
  ```
- Get totals with `SELECT COUNT(*) FROM Invoice`.
- No `JOIN`s. Filter with `WHERE`, order with `ORDERBY`.

### 5.3 Correct pagination pattern (to replace the 1000 cap)

```ts
async function syncAll(realmId: string, userId: string, entity: string) {
  const PAGE = 1000;
  let start = 1;
  const all: unknown[] = [];
  for (;;) {
    const q = `SELECT * FROM ${entity} STARTPOSITION ${start} MAXRESULTS ${PAGE}`;
    const data = await qbQuery(realmId, userId, q);
    const rows = data?.QueryResponse?.[entity] ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;   // last page
    start += PAGE;
  }
  return all;
}
```

### 5.4 Incremental sync with CDC (recommended for production)

**Change Data Capture (CDC)** returns only records changed since a timestamp — the recommended pattern for periodic polling. It avoids re-reading the entire dataset on every sync.

```
GET /v3/company/{realmId}/cdc
  ?entities=Invoice,Payment,Purchase,Account,Customer
  &changedSince=2026-05-01T00:00:00Z
  &minorversion=75
```

- **Look-back window:** up to **30 days**. If a company's last sync was >30 days ago, fall back to a full paginated sync.
- Returns all changed entities (created/updated/deleted) since `changedSince` in one response.
- **Migration path:** keep delete-then-insert for the *first* sync (seed), then store `lastSyncAt` and use CDC for subsequent syncs, upserting by `(realmId, qbId)` and removing entities QBO marks deleted.

> We already store `cfo_qb_connections.lastSyncAt` — that's the timestamp to feed into `changedSince`.

### 5.5 Seeding (first sync)

"Seeding" = the **initial full pull** right after a company connects:

1. `/api/quickbooks/callback` stores tokens and inserts `cfo_qb_connections`.
2. Immediately call `syncCompany(realmId, userId)` (or enqueue it) to do a **full paginated** pull of all entities.
3. Run `runAllCalculations(realmId)` so the dashboard has data on first load.
4. Set `lastSyncAt`. From here on, use CDC (incremental).

> For **sandbox testing**, Intuit provides a pre-populated sandbox company with sample invoices, customers, and expenses — no manual data entry needed to test the seed path.

### 5.6 Storage strategy (current)

- Each entity table stores **flattened fields we query on** + the **full QBO payload in `rawData` (JSONB)** so we never lose data and can re-derive fields later.
- Current sync is **idempotent by realm** via delete-then-insert. When moving to CDC, switch to **upsert on `(realmId, qbId)`**.

---

## 6. Entity → table field mapping

What we pull and where it lands. (`rawData` always holds the complete QBO object.)

### Invoice → `cfo_qb_invoices`
| QBO field | Column | Notes |
|---|---|---|
| `Id` | `qbId` | QBO record id |
| `DocNumber` | `invoiceNumber` | |
| `CustomerRef.value` / `.name` | `customerId` / `customerName` | |
| `TotalAmt` | `totalAmount` | |
| `Balance` | `balance` | amount still owed; `0` ⇒ paid |
| `DueDate` / `TxnDate` | `dueDate` / `txnDate` | |
| derived | `status` | `Paid` if balance≤0 & total>0; `Open` if balance>0; `Voided` if note contains "void"; else `Draft` (`mapInvoiceStatus`) |

### Payment → `cfo_qb_payments`
| QBO field | Column |
|---|---|
| `Id` | `qbId` |
| `CustomerRef` | `customerId` / `customerName` |
| `TotalAmt` | `totalAmount` |
| `TxnDate` | `paymentDate` |
| `PaymentMethodRef.name` | `paymentMethod` |
| `Line[].LinkedTxn[].TxnId` | `invoiceIds` (JSONB array) — which invoices this payment applied to (drives DSO/AR-days calc) |

### Purchase → `cfo_qb_expenses`
| QBO field | Column |
|---|---|
| `Id` | `qbId` |
| `EntityRef` | `vendorId` / `vendorName` |
| `Line[0].AccountBasedExpenseLineDetail.AccountRef` | `accountId` / `accountName` / `category` |
| `TotalAmt` | `totalAmount` |
| `TxnDate` | `expenseDate` |

> ⚠️ We currently only read `Line[0]`. Multi-line purchases lose lines 2+. For accurate category breakdowns, iterate all lines.

### Account → `cfo_qb_accounts`
| QBO field | Column |
|---|---|
| `Id` | `qbId` |
| `Name` | `name` |
| `AccountType` / `AccountSubType` | `accountType` / `accountSubType` |
| `CurrentBalance` | `currentBalance` |
| `Active` | `isActive` |

### Customer → `cfo_qb_customers` (NOT YET BUILT — spec requires it)
Suggested columns from the QBO `Customer` entity: `qbId` (`Id`), `displayName` (`DisplayName`), `email` (`PrimaryEmailAddr.Address`), `phone`, `balance` (`Balance`), `billAddr` (JSONB), `active`, `rawData`.

### Other useful entities (not synced yet)
- **`Bill`** — accounts *payable* (money we owe vendors). Spec's expense story is currently only `Purchase`; `Bill` gives a fuller AP picture.
- **`SalesReceipt`** — paid-at-point-of-sale income (no invoice). Missing these undercounts revenue.
- **`CreditMemo`** / **`RefundReceipt`** — reduce revenue; ignoring them overstates it.

---

## 7. Webhooks (real-time updates — table exists, handler doesn't)

Webhooks let QBO **push** change notifications instead of us polling. Our schema already has `cfo_webhook_events`.

### How QBO webhooks work
- You register **one webhook URL** per app in the Intuit developer portal and pick which entities to subscribe to (Invoice, Payment, Bill, Customer, Account, etc.).
- On a change, Intuit POSTs a notification containing **`realmId`, entity name, operation (`Create`/`Update`/`Delete`/`Void`/`Merge`), and entity `Id`** — **but not the changed data itself**.
- Notifications can arrive **out of order or more than once** → the handler must be **idempotent**.

### Signature verification (required)
Each request carries an `intuit-signature` header. Verify it:
1. Compute `HMAC-SHA256(rawRequestBody, verifierToken)` where `verifierToken` comes from the portal.
2. Base64-encode the digest and constant-time compare to the `intuit-signature` header.
3. Reject (HTTP 401) if it doesn't match.

### Recommended handler shape
```
POST /api/quickbooks/webhook   (must be in middleware's PUBLIC list)
  1. Read raw body, verify intuit-signature.
  2. For each notification: insert into cfo_webhook_events (processed=false).
  3. Return 200 immediately (ack fast — Intuit retries on non-2xx).
  4. Async: for each event, fetch the changed record by Id, upsert it, mark processed=true.
```

> Webhooks complement (don't replace) the daily cron: use webhooks for near-real-time freshness and the cron + CDC as a safety net for missed deliveries.

---

## 8. Reports API (for Profit & Loss — spec requirement)

The spec wants a **Profit & Loss** summary. Two options:

1. **Derive it ourselves** (what `calculations/index.ts` does today) — revenue from invoices minus expenses. Fast, no extra API calls, but it's an *approximation* (ignores accruals, journal entries, COGS nuances).
2. **Use the QBO Reports API** for accountant-accurate numbers:
   ```
   GET /v3/company/{realmId}/reports/ProfitAndLoss
     ?start_date=2026-01-01&end_date=2026-06-30&minorversion=75
   ```
   Other useful reports: `BalanceSheet`, `CashFlow`, `AgedReceivables` (overdue AR — feeds our risk widget), `AgedPayables`.

> Reports return a **nested row structure**, not flat rows — parse `Rows.Row[]` recursively. Reports do **not** use `STARTPOSITION`/`MAXRESULTS`.

**Recommendation:** keep our derived calcs for the live dashboard widgets (fast, cached), but pull `AgedReceivables` and `ProfitAndLoss` from the Reports API where accountant-grade accuracy matters (super_admin portfolio view).

---

## 9. Rate limits & quotas (design the sync around these)

| Limit | Value | Scope |
|---|---|---|
| Standard requests | **500 / minute** | per company (`realmId`) |
| Concurrent requests | **10** | per app |
| Batch endpoint | **120 / minute** (as of Oct 31 2025 prod) | per `realmId` |
| Resource-intensive endpoints | **200 / minute** | per `realmId` |
| Over limit | **HTTP 429 Too Many Requests** | retry with backoff |

**App Partner Program (since Jul 2025):** read operations are metered. The free **Builder tier allows 500,000 read operations / month**; beyond that, reads are blocked or require a paid tier. → Another reason to use **CDC** (few reads) over full polling (many reads), especially at the spec's target of **100+ companies**.

**Handling 429s:** wrap `callApi` with exponential backoff + jitter; respect any `Retry-After` header. Cap concurrency at ≤10 across all in-flight company syncs.

---

## 10. Automatic vs. manual tasks

### ✅ Automatic
| Task | Trigger | Code |
|---|---|---|
| Access-token refresh | On demand, when token expires within 10 min of an API call | `client.ts → getValidToken` / `forceRefreshToken` |
| Refresh-token rotation persistence | Every refresh writes back the new refresh token | `forceRefreshToken` |
| Daily full/incremental sync | Cron at **06:00 UTC** | `POST /api/cron/sync` → `syncCompany` |
| CFO calculations | After every sync | `runAllCalculations` |
| `lastSyncAt` / `syncError` bookkeeping | After every sync | `syncCompany` |
| Activity logging | After sync success/failure | `cfo_activity_logs` |
| Real-time updates *(once built)* | QBO webhook POST | `/api/quickbooks/webhook` |

### ✋ Manual (requires a human)
| Task | Who | Notes |
|---|---|---|
| Initial QuickBooks connection (OAuth consent) | company owner or super_admin | Can't be automated — Intuit requires interactive login + company selection |
| Reconnect after refresh-token expiry/revoke | company owner or super_admin | Triggered when `isActive=false` / `invalid_grant` |
| On-demand sync ("Sync now" button) | any dashboard user with access | `POST /api/quickbooks/sync` |
| Choosing which QBO company to connect | user | A login may have multiple company files |
| Production go-live: app review | developer/owner | Intuit Technical + Security + Marketing review (weeks to months) |
| Switching sandbox → production keys | developer | Dev and prod keys are **not** interchangeable |

---

## 11. Environments & go-live checklist

| | Sandbox | Production |
|---|---|---|
| API base | `https://sandbox-quickbooks.api.intuit.com` | `https://quickbooks.api.intuit.com` |
| Keys | Development keys only | Production keys only (not interchangeable) |
| Company data | Pre-seeded sample company | Real customer data |

**Before going live:**
- [ ] Fix env-var naming mismatch (§4 #1)
- [ ] `minorversion=75` (§4 #2)
- [ ] Env-driven API base URL (§4 #3)
- [ ] Encrypt tokens at rest (Supabase Vault) (§4 #8)
- [ ] Add pagination (§5.3) and/or CDC (§5.4)
- [ ] Implement webhook handler + signature verification (§7)
- [ ] Backoff/retry on 429 (§9)
- [ ] Complete Intuit app review (Technical → Security → Marketing)
- [ ] Register production redirect URI and webhook URL in the portal

---

## 12. Environment variables (QuickBooks)

> Names below match the **current code** (`oauth.ts`). Align `.env`, `CLAUDE.md`, and `project-overview.md` to these (see §4 #1).

```
QUICKBOOKS_CLIENT_ID        # Intuit app client ID (server-only — do NOT prefix NEXT_PUBLIC_)
QUICKBOOKS_CLIENT_SECRET    # Intuit app client secret
QUICKBOOKS_REDIRECT_URI     # OAuth callback, must exactly match the portal registration
QUICKBOOKS_API_BASE                # sandbox vs production base URL (defaults to sandbox)
QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN  # (when webhooks added) HMAC key for signature verification
CRON_SECRET                 # Bearer token guarding POST /api/cron/sync
```

---

## Sources

- [Minor versions of our API — Intuit Developer](https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/minor-versions)
- [Changes to our Accounting API (minor version 75 / deprecation) — Intuit Developer Community](https://blogs.a.intuit.com/2025/01/21/changes-to-our-accounting-api-that-may-impact-your-application/)
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
