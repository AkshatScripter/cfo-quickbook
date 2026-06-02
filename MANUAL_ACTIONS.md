# Manual Actions & Setup Checklist

> Everything in this file **cannot be automated** — it requires a human with
> credentials, portal access, or DB access to complete.
>
> Work through each section in order when setting up a new environment.
> Tick off items as you go. Last updated: **2026-06-02**.

---

## 1. Local environment setup (every developer)

### 1.1 Create `.env.local`
```bash
cp .env.example .env.local
```
Then fill in every value. The sections below explain where each value comes from.

### 1.2 Generate the QB token encryption key
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Paste the output into `.env.local` as:
```
QUICKBOOKS_TOKEN_ENC_KEY=<64-char hex output>
```
> **Critical:** This key must be the same across all instances that share a database.
> If you rotate it, all connected companies must reconnect QuickBooks (existing
> encrypted tokens become unreadable).

---

## 2. Supabase project

### 2.1 Create a Supabase project
Go to [supabase.com](https://supabase.com) → New project. Note the **Project URL**,
**anon key**, and **service role key** from **Settings → API**.

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...      ← server-only, never expose
```

### 2.2 Get the database connection string
Go to **Settings → Database → Connection string → URI** (use the **Session mode**
pooler URL, not direct, for serverless). Paste into:
```
DATABASE_URL=postgresql://postgres.xxxx:password@aws-0-region.pooler.supabase.com:5432/postgres
```

### 2.3 Run database migrations
After setting `DATABASE_URL`, apply all pending Drizzle migrations:
```bash
npm run db:migrate
```
This runs in order:
| Migration | What it creates |
|---|---|
| `0000_lively_patriot.sql` | All base tables (`cfo_users`, `cfo_qb_*`, etc.) |
| `0001_short_ricochet.sql` | `cfo_qb_customers` table |
| `0002_lean_malice.sql` | Unique indexes on `(realm_id, qb_id)` across 5 tables |

> If new migrations appear after a `git pull`, always run `npm run db:migrate` before starting the dev server.

### 2.4 Set the super admin email
```
SUPER_ADMIN_EMAIL=your-admin@email.com
```
The first login from this email is automatically granted the `super_admin` role.

---

## 3. QuickBooks / Intuit developer setup

### 3.1 Create an Intuit developer app
1. Go to [developer.intuit.com](https://developer.intuit.com) and sign in.
2. Click **Dashboard → Create an app → QuickBooks Online and Payments**.
3. Select scope: **Accounting** (`com.intuit.quickbooks.accounting`).
4. Note the **Client ID** and **Client Secret** from the **Keys & credentials** tab.

```
QUICKBOOKS_CLIENT_ID=AB...
QUICKBOOKS_CLIENT_SECRET=...
```

> **Do not** prefix `QUICKBOOKS_CLIENT_ID` with `NEXT_PUBLIC_` — it is server-only.

### 3.2 Register the OAuth redirect URI
In the Intuit portal → **Keys & credentials → Redirect URIs**, add:

| Environment | URI |
|---|---|
| Development | `http://localhost:3000/api/quickbooks/callback` |
| Production | `https://yourdomain.com/api/quickbooks/callback` |

Then set in `.env.local`:
```
QUICKBOOKS_REDIRECT_URI=http://localhost:3000/api/quickbooks/callback
```
> The URI must **exactly** match (including trailing slash if present). Any mismatch
> causes Intuit to reject the OAuth callback with `redirect_uri_mismatch`.

### 3.3 Set the API base URL
| Environment | Value |
|---|---|
| Development (sandbox) | `https://sandbox-quickbooks.api.intuit.com` ← default if unset |
| Production | `https://quickbooks.api.intuit.com` |

```
QUICKBOOKS_API_BASE=https://sandbox-quickbooks.api.intuit.com
```

### 3.4 Set up the webhook verifier token
1. In the Intuit portal → **Webhooks**.
2. Add your webhook endpoint:
   - Development: use a tunnelling tool (e.g. `ngrok http 3000`) to get a public URL, then set `https://<ngrok-id>.ngrok.io/api/quickbooks/webhook`.
   - Production: `https://yourdomain.com/api/quickbooks/webhook`.
3. Subscribe to entities: **Invoice, Payment, Purchase, Account, Customer**.
4. Copy the **Verifier Token** shown by Intuit.
```
QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN=<token from Intuit portal>
```

---

## 4. AI CFO agent (Groq)

### 4.1 Get a Groq API key
1. Go to [console.groq.com](https://console.groq.com) → API Keys → Create.
2. Paste the key into `.env.local`:
```
GROQ_API_KEY=gsk_...
```
> Default model: `llama-3.3-70b-versatile`. The AI chat backend (`POST /api/ai/chat`)
> is not yet implemented — this key will be needed when that feature is built.

---

## 5. Cron job

### 5.1 Generate a cron secret
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
```
CRON_SECRET=<64-char hex>
```

### 5.2 Schedule the daily sync
The daily sync endpoint is `POST /api/cron/sync` with header
`Authorization: Bearer <CRON_SECRET>`. Set this up in whichever scheduler you use:

| Platform | How |
|---|---|
| **Vercel** | Vercel Cron Jobs in `vercel.json` → `{"crons": [{"path": "/api/cron/sync", "schedule": "0 6 * * *"}]}` + set `CRON_SECRET` in Vercel env |
| **Supabase Edge Functions** | Schedule an Edge Function to call the endpoint |
| **External** (cron-job.org, GitHub Actions) | HTTP POST to the endpoint with the `Authorization` header |

Target: **06:00 UTC daily**.

---

## 6. Connecting a QuickBooks company (runtime — per company)

This happens in the running app, not during setup. Each step requires a human.

- [ ] Log in as a **company** user (or **super_admin** acting on their behalf).
- [ ] Navigate to the QB connect page and click **Connect QuickBooks**.
- [ ] Log in to Intuit, select the correct company file, and approve access.
- [ ] After redirect, the initial sync runs automatically in the background.
      The dashboard will show data once the first sync completes (usually < 1 min for sandbox).

> **If a company's QB connection breaks** (token refresh failed, revoked by user,
> or the encryption key was rotated), `cfo_qb_connections.isActive` will be set
> to `false` and `syncError` will show the reason. The fix is to reconnect from
> the dashboard — the OAuth flow issues fresh encrypted tokens.

---

## 7. Production go-live (one-time)

Complete **all** items below before switching to production keys.

### Intuit app review
Intuit requires a formal review before production keys are issued (~6 weeks total):
- [ ] Technical review (~3 business days)
- [ ] Security review (~7 business days)
- [ ] Marketing review (~5 business days)

Start early — submit the review as soon as core features are stable.

### Environment switches
- [ ] Change `QUICKBOOKS_API_BASE` → `https://quickbooks.api.intuit.com`
- [ ] Swap to **production** Client ID + Secret (dev keys don't work with real accounts)
- [ ] Update `QUICKBOOKS_REDIRECT_URI` to the production domain
- [ ] Update webhook endpoint URL in Intuit portal to production domain
- [ ] Rotate `QUICKBOOKS_TOKEN_ENC_KEY` to a new production-only key (then reconnect all companies)
- [ ] Rotate `CRON_SECRET` to a production-only value

### Database
- [ ] Run `npm run db:migrate` against the production database
- [ ] Verify Drizzle Studio (`npm run db:studio`) shows the correct table structure

---

## 8. Pending code features (not yet built — future dev work)

These are tracked in `CLAUDE.md` under **Pending Features** and are not manual
actions — they require code. Listed here so new developers know what's missing.

| Feature | Notes |
|---|---|
| **AI chat API** | `POST /api/ai/chat` — streaming Groq route with role-scoped prompts |
| **Chat history** | `chat_history` table + persistence on every AI turn |
| **AI insights** | `ai_insights` table + daily cron regeneration |
| **Alert system** | Overdue invoices, expense spikes, revenue decline — see `project-overview.md` |
| **Orders** | `orders` table + CRUD for client-placed orders |
| **Companies table** | Separate from QB connection — owner, industry, contact info |
| **Client-company mapping** | `client_company` join table (one customer → many companies) |
| **Supabase RLS** | Row-level security policies on all `cfo_*` tables |
| **Rate-limit backoff** | Exponential backoff + jitter on QB API 429 responses |

---

## Quick reference — all env vars

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `DATABASE_URL` | Supabase → Settings → Database → Connection string |
| `SUPER_ADMIN_EMAIL` | Your choice — the email that gets `super_admin` on first login |
| `QUICKBOOKS_CLIENT_ID` | Intuit developer portal → Keys & credentials |
| `QUICKBOOKS_CLIENT_SECRET` | Intuit developer portal → Keys & credentials |
| `QUICKBOOKS_REDIRECT_URI` | Must match what you register in Intuit portal |
| `QUICKBOOKS_API_BASE` | Sandbox or production URL (see §3.3) |
| `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN` | Intuit developer portal → Webhooks |
| `QUICKBOOKS_TOKEN_ENC_KEY` | Generate locally with `randomBytes(32).toString('hex')` |
| `CRON_SECRET` | Generate locally with `randomBytes(32).toString('hex')` |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) → API Keys |
| `NEXT_PUBLIC_APP_URL` | Your app's base URL (e.g. `http://localhost:3000`) |
| `MIGRATION_DATABASE_URL` | Optional — overrides `DATABASE_URL` for `drizzle-kit` only |
