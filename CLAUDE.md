# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start development server on http://localhost:3000
npm run build    # Production build
npm run lint     # Run ESLint

# Database
npm run db:generate   # Generate a new Drizzle migration from schema changes
npm run db:migrate    # Run pending migrations
npm run db:push       # Push schema directly to DB (dev only, skips migration files)
npm run db:studio     # Open Drizzle Studio GUI
```

No test runner is configured yet.

## Stack

- **Next.js 16** with App Router (not Pages Router)
- **React 19** with React Compiler enabled (`reactCompiler: true` in `next.config.ts`)
- **TypeScript**
- **Tailwind CSS v4** — configured via `@import "tailwindcss"` in `globals.css`, theme tokens defined with `@theme inline` (not `tailwind.config.js`)
- **Drizzle ORM** over a Postgres DB (via `DATABASE_URL`) — all data reads/writes use Drizzle
- **Supabase** (`@supabase/ssr`) — used for **auth only** (sessions, cookies, `auth.users`); data lives in the same Postgres instance but is queried via Drizzle
- **QuickBooks** — OAuth via `intuit-oauth`, data synced and stored locally in the DB
- **Groq API** — AI CFO agent (chat + daily insights); key is `GROQ_API_KEY`. Use the `groq-sdk` npm package and default to model `llama-3.3-70b-versatile` unless a faster/cheaper model is needed.
- **Zod v4** — schema validation; **Sonner** — toast notifications

## Product Overview

An AI-powered multi-company financial portal. Three user roles manage finances through role-specific dashboards with a persistent AI CFO chat panel:

- **`super_admin`** — sees all companies, all data; acts as accountant/CFO across the portfolio
- **`company`** — sees only their own company; connects QuickBooks, manages clients/invoices
- **`customer`** (spec calls this "client") — sees only their own orders and invoices across companies they buy from

The **AI CFO Agent** is the core differentiator: context-aware Claude API chat + daily cached AI insights, all scoped to the user's role and data access.

## Architecture

### Route Groups

`src/app/` contains two route groups:

- `(auth)/` — unauthenticated pages (`/login`, `/signup`, `/qb-connect`). Minimal layout, no sidebar.
- `(dashboard)/` — all authenticated views. Layout wraps every page in `AppProvider` → `Sidebar` + `Topbar` + `ChatPanel`.

Middleware at `src/middleware.ts` enforces authentication for all routes except `/login`, `/signup`, `/api/auth/**`, `/api/quickbooks/callback`, and `/api/cron/**`. Cron routes are protected by a `CRON_SECRET` header instead.

### Role Model

Three roles in `src/db/schema.ts` (`userRoleEnum`): `super_admin`, `company`, `customer`.

- Role is determined at first login in `src/lib/auth.ts → getUser()`. Email matching `SUPER_ADMIN_EMAIL` env var → `super_admin`; otherwise role comes from `user.user_metadata.role` set at signup.
- Use `requireAuth()` / `requireRole(role)` from `src/lib/auth.ts` in every API route.
- `DashboardShell` in `src/app/(dashboard)/layout.tsx` enforces client-side role-based redirects (company → `/dashboard`, super_admin → `/admin`, customer → `/customer`).

### Database Layer

- Schema: `src/db/schema.ts` — all tables in one file, prefixed `cfo_`.
- DB client: `src/db/index.ts` — exports `db` (Drizzle connected via `DATABASE_URL`).
- Drizzle config: `drizzle.config.ts` — migrations output to `drizzle/`, `MIGRATION_DATABASE_URL` overrides `DATABASE_URL` for migrations.
- **Always use Supabase client for auth operations; use Drizzle `db` for everything else.**

Key tables currently in schema:
- `cfo_users` — mirrors `auth.users`, adds `role` and `companyId`
- `cfo_qb_connections` / `cfo_qb_tokens` — one row per connected QB company; tokens never sent to frontend
- `cfo_qb_invoices`, `cfo_qb_payments`, `cfo_qb_expenses`, `cfo_qb_accounts` — raw QB data; synced via delete-then-insert (not upsert); capped at 1 000 records per entity type
- `cfo_calculated_reports` — cached CFO report results (delete-then-insert per `reportType`); types: `revenue_analysis`, `cash_flow`, `kpi`, `risk`
- `cfo_activity_logs` / `cfo_api_errors` / `cfo_webhook_events` — audit and observability

### QuickBooks Sync Pipeline

`/api/quickbooks/connect` → OAuth redirect → `/api/quickbooks/callback` stores tokens in `cfo_qb_tokens`.

Manual sync: `POST /api/quickbooks/sync`. Scheduled sync: `POST /api/cron/sync` (requires `Authorization: Bearer <CRON_SECRET>`, runs daily at 06:00 UTC).

Both call `syncCompany(realmId, userId)` in `src/lib/quickbooks/sync.ts`, which:
1. Deletes and re-inserts invoices, payments, expenses, and accounts from the QB API.
2. Calls `runAllCalculations(realmId)` in `src/lib/calculations/index.ts`.
3. Updates `cfo_qb_connections.lastSyncAt` and writes an activity log.

`runAllCalculations` runs four calculations in parallel and saves each result to `cfo_calculated_reports`. Dashboard API routes (`/api/dashboard/*`) read from that cache rather than recomputing.

### AI CFO Agent (ChatPanel)

The `ChatPanel` component (`src/components/layout/chat-panel.tsx`) is the persistent AI chat UI present on every dashboard page. It reads `pendingPrompt` from `AppContext` so any page can pre-fill the chat via `askAI()`.

**Backend not yet wired:** The Groq API integration (`GROQ_API_KEY`) needs to be implemented as a streaming API route (e.g. `POST /api/ai/chat`). Use the `groq-sdk` package (`Groq` client). The route must:
- Inject role-scoped financial context (from `cfo_calculated_reports` / live QB tables) into the system prompt — see prompt templates in `project-overview.md`
- Persist each turn to a `chat_history` table (schema not yet added)
- Cache daily `ai_insights` per company (schema not yet added)
- Respect the 90-day data window and 24-hour insight cache described in the spec

### AppContext (`src/lib/app-context.tsx`)

Client-only context (`"use client"`) that owns:
- Auth state (`user`, `isLoading`, `login`, `logout`) — fetches profile from `/api/me`
- Chat panel state (`chatOpen`, `openChat`, `closeChat`, `askAI`, `pendingPrompt`)
- UI density (`comfortable` / `compact`, reflected as `data-density` on `<html>`)
- Pinned insights and pending AI prompts

All dashboard pages consume this via `useApp()`. Never import AppContext in Server Components.

### Key Next.js 16 / React 19 Notes

- Server Components are the default; add `"use client"` only when you need browser APIs, event handlers, or state.
- The React Compiler is active — avoid manually memoizing with `useMemo`/`useCallback` unless you have a measured reason.
- Tailwind v4 has no `tailwind.config.js` — extend the theme via `@theme` blocks in CSS files.
- Before implementing a Next.js feature, check `node_modules/next/dist/docs/` for the authoritative v16 API.

## Pending Features (from `project-overview.md`)

Features specified but not yet implemented, in MVP priority order:

| Feature | What to build |
|---|---|
| **AI chat API** | `POST /api/ai/chat` — streaming Claude API route with role-scoped system prompts |
| **Chat history** | `chat_history` DB table + persistence on every AI turn |
| **AI insights** | `ai_insights` table; daily cron regeneration; dashboard widgets per role |
| **Alert system** | Alert thresholds (overdue invoices, expense spikes, revenue decline, etc.) — see spec for exact thresholds |
| **Orders** | `orders` table + CRUD for client-placed orders |
| **Companies table** | Separate `companies` table (owner, industry, contact) independent of QB connection |
| **Client-company mapping** | `client_company` join table so one customer can buy from multiple companies |
| **Supabase Vault / RLS** | QB tokens should be stored via Supabase Vault; RLS policies needed on all tables for data isolation |
| **Token auto-refresh** | QB access token auto-refresh before expiry during sync |

> **Terminology note:** The spec uses "client" — the codebase uses `customer` for the same role. Keep using `customer` in code.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY   # Supabase anon key (public)
SUPABASE_SERVICE_ROLE_KEY       # Used by admin client (server only)
DATABASE_URL                    # Postgres connection string for Drizzle
MIGRATION_DATABASE_URL          # Optional override for drizzle-kit migrations
SUPER_ADMIN_EMAIL               # Email that always gets super_admin role on first login
QUICKBOOKS_CLIENT_ID            # Intuit OAuth client ID (server-only)
QUICKBOOKS_CLIENT_SECRET        # Intuit OAuth client secret
QUICKBOOKS_REDIRECT_URI         # OAuth callback URL registered with Intuit (/api/quickbooks/callback)
QUICKBOOKS_API_BASE             # QBO API base; defaults to sandbox, set to https://quickbooks.api.intuit.com in prod
QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN # HMAC-SHA256 key for verifying intuit-signature on webhook requests
CRON_SECRET                     # Bearer token required by /api/cron/* routes
GROQ_API_KEY                    # Groq API key for AI CFO chat + insights
NEXT_PUBLIC_APP_URL             # App base URL (e.g. http://localhost:3000)
```

## Custom Skills

| Command | File | Purpose |
|---|---|---|
| `/best-practices` | `.claude/commands/best-practices.md` | Audit code against Next.js 16, React 19, TypeScript, Tailwind v4, and security best practices. |

## Workflow Hooks

A `PreToolUse` hook in `.claude/settings.json` pauses before every `Edit` / `Write` / `MultiEdit` tool call and asks for confirmation. Press **Enter** to allow, **Ctrl+C** to cancel.
