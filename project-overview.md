# 🚀 AI-Powered Multi-Company Financial Portal - Complete Specification

## 📋 Project Overview

A NextJS web application that integrates QuickBooks with an AI-powered CFO agent. Allows superadmins, company owners, and clients to manage finances through a unified dashboard with intelligent insights, alerts, and real-time chat assistance.

**USP (Unique Selling Point):** AI CFO Agent that provides real-time financial insights, alerts, recommendations, and personal assistance through chat interface.

---

## 🛠️ Tech Stack

```
Frontend: NextJS (React) with TypeScript
Backend: NextJS API Routes
Database: Supabase (PostgreSQL + Built-in Auth & RLS)
Authentication: Supabase Auth (built-in)
AI Model: Claude API (Free tier initially, migrate to paid later)
External API: QuickBooks Online API
```

---

## 👥 User Roles (3 Roles Only)

```
1. SUPERADMIN (App Owner / Accountant / CFO)
   - Access: All companies, all users, all data
   - Acts as accountant & CFO for all companies
   - Can connect QuickBooks accounts
   - Full financial monitoring & reporting

2. COMPANY (Business Owner)
   - Access: Own company data only
   - Connects their own QuickBooks account
   - Manages clients, invoices, orders

3. CLIENT (Buyer/Seller)
   - Access: Only their orders & invoices
   - Views orders, payments, invoices
   - Limited to their own transactions
```

---

## 🔐 Authentication Flow

```
1. User signs up on portal (Supabase Auth)
   ↓
2. User logs in with email/password
   ↓
3. System checks role (superadmin / company / client)
   ↓
4. Loads role-specific dashboard
   ↓
5. Company owner or Superadmin can connect QuickBooks
   (OAuth flow → token saved in Supabase)
   ↓
6. QB data syncs to portal
```

---

## 📊 Database Schema (Using Supabase Built-in Functions)

> Use Supabase built-in features: Auth, RLS (Row Level Security), Realtime, Edge Functions, and Storage where applicable. All tables should have RLS policies enabled.

### 1. Profiles Table (Extends Supabase Auth)
```
profiles
├── id (UUID, references auth.users.id)
├── name (text)
├── role (text) → 'superadmin' | 'company' | 'client'
├── phone (text, nullable)
├── avatar_url (text, nullable)
├── created_at (timestamptz, default now())
├── updated_at (timestamptz, default now())

RLS Policy:
- Users can read/update their own profile
- Superadmin can read all profiles
```

### 2. Companies Table
```
companies
├── id (UUID, default gen_random_uuid())
├── owner_id (UUID, references profiles.id)
├── name (text)
├── industry (text, nullable)
├── email (text, nullable)
├── phone (text, nullable)
├── address (text, nullable)
├── qb_access_token (text, nullable) → encrypted
├── qb_refresh_token (text, nullable) → encrypted
├── qb_realm_id (text, nullable)
├── qb_connected (boolean, default false)
├── qb_last_sync (timestamptz, nullable)
├── created_at (timestamptz, default now())
├── updated_at (timestamptz, default now())

RLS Policy:
- Owner can read/update their own company
- Superadmin can read/update all companies
- Clients can read companies they are linked to
```

### 3. Client-Company Mapping Table
```
client_company
├── id (UUID, default gen_random_uuid())
├── client_id (UUID, references profiles.id)
├── company_id (UUID, references companies.id)
├── created_at (timestamptz, default now())

RLS Policy:
- Superadmin can read/write all
- Company owner can manage their own clients
- Client can read their own mappings
```

### 4. Orders Table
```
orders
├── id (UUID, default gen_random_uuid())
├── client_id (UUID, references profiles.id)
├── company_id (UUID, references companies.id)
├── order_number (text, unique)
├── amount (numeric)
├── status (text) → 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
├── order_date (timestamptz)
├── delivery_date (timestamptz, nullable)
├── notes (text, nullable)
├── created_at (timestamptz, default now())
├── updated_at (timestamptz, default now())

RLS Policy:
- Superadmin can read all
- Company owner can read/write orders for their company
- Client can read their own orders only
```

### 5. Invoices Table
```
invoices
├── id (UUID, default gen_random_uuid())
├── company_id (UUID, references companies.id)
├── client_id (UUID, references profiles.id)
├── invoice_number (text, unique)
├── amount (numeric)
├── qb_invoice_id (text, nullable) → link to QuickBooks
├── status (text) → 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue'
├── issued_date (timestamptz)
├── due_date (timestamptz)
├── paid_date (timestamptz, nullable)
├── payment_method (text, nullable)
├── notes (text, nullable)
├── created_at (timestamptz, default now())
├── updated_at (timestamptz, default now())

RLS Policy:
- Superadmin can read all
- Company owner can read/write invoices for their company
- Client can read their own invoices only
```

### 6. Payments Table
```
payments
├── id (UUID, default gen_random_uuid())
├── invoice_id (UUID, references invoices.id)
├── company_id (UUID, references companies.id)
├── client_id (UUID, references profiles.id)
├── amount (numeric)
├── payment_date (timestamptz)
├── payment_method (text, nullable)
├── qb_payment_id (text, nullable)
├── status (text) → 'pending' | 'completed' | 'failed'
├── created_at (timestamptz, default now())

RLS Policy:
- Superadmin can read all
- Company owner can read payments for their company
- Client can read their own payments only
```

### 7. Expenses Table (From QuickBooks Sync)
```
expenses
├── id (UUID, default gen_random_uuid())
├── company_id (UUID, references companies.id)
├── qb_expense_id (text, nullable)
├── category (text)
├── amount (numeric)
├── description (text, nullable)
├── expense_date (timestamptz)
├── vendor (text, nullable)
├── created_at (timestamptz, default now())

RLS Policy:
- Superadmin can read all
- Company owner can read their own expenses
- Clients cannot access
```

### 8. Chat History Table
```
chat_history
├── id (UUID, default gen_random_uuid())
├── user_id (UUID, references profiles.id)
├── company_id (UUID, references companies.id, nullable)
├── conversation_id (UUID) → groups related messages
├── message_text (text)
├── sender (text) → 'user' | 'ai'
├── created_at (timestamptz, default now())

Index: conversation_id for fast lookups

RLS Policy:
- Users can read/write their own chats only
- Superadmin can read all chats
```

### 9. AI Insights Table (Cached Daily)
```
ai_insights
├── id (UUID, default gen_random_uuid())
├── company_id (UUID, references companies.id)
├── user_id (UUID, references profiles.id)
├── insight_type (text) → 'summary' | 'alert' | 'recommendation' | 'tip'
├── content (text)
├── severity (text) → 'high' | 'medium' | 'low'
├── action_required (boolean, default false)
├── generated_at (timestamptz, default now())
├── expires_at (timestamptz) → 24 hour cache

RLS Policy:
- Users can read insights for their assigned companies
- Superadmin can read all
```

### 10. QB Sync Logs Table
```
qb_sync_logs
├── id (UUID, default gen_random_uuid())
├── company_id (UUID, references companies.id)
├── sync_type (text) → 'invoices' | 'customers' | 'payments' | 'expenses'
├── status (text) → 'pending' | 'success' | 'failed'
├── error_message (text, nullable)
├── records_synced (integer, default 0)
├── started_at (timestamptz)
├── completed_at (timestamptz, nullable)

RLS Policy:
- Superadmin can read all
- Company owner can read their own sync logs
```

---

## 🏢 Real-World Example (4 Companies, 8 Users)

### Users

```
SUPERADMIN (1):
├── John (App Owner / Accountant / CFO)
│   Email: john@portal.com
│   Role: superadmin
│   Access: All 4 companies, all data

COMPANY OWNERS (4):
├── Alice → ABC Coffee Suppliers (QB Connected)
├── Bob → XYZ Packaging Ltd (QB Connected)
├── Carol → Fresh Dairy Co (QB Connected)
├── David → Green Energy Cafe (QB Connected)

CLIENTS (3):
├── Restaurant A → Buys from: ABC Coffee + Fresh Dairy
├── Restaurant B → Buys from: ABC Coffee + XYZ Packaging
├── Cafe Chain C → Buys from: ABC Coffee + Fresh Dairy + Green Energy
```

### Data Isolation

```
John (Superadmin):
✓ Sees all 4 companies
✓ Sees all clients
✓ Sees all financial data
✓ Acts as accountant/CFO for all

Alice (ABC Coffee Owner):
✓ Sees ABC Coffee data only
✓ Sees Restaurant A, Restaurant B, Cafe Chain C (her clients)
✗ Cannot see XYZ, Fresh Dairy, Green Energy data

Restaurant A (Client):
✓ Sees orders with ABC Coffee
✓ Sees orders with Fresh Dairy
✗ Cannot see Restaurant B or Cafe Chain C data
✗ Cannot see any company financial data
```

---

## 🎯 Core Features

### 1. Authentication
- Supabase Auth (email/password)
- Role assigned during signup or by superadmin
- Session management via Supabase built-in
- Protected routes based on role

### 2. QuickBooks Integration
- OAuth2 connection flow
- Company owner connects their QB account from dashboard
- Superadmin can also connect QB on behalf of company
- Token storage in Supabase (encrypted)
- Token auto-refresh before expiry
- Data sync: Daily (automatic) + On-demand (manual trigger)
- Sync types: Invoices, Customers, Payments, Expenses
- Error handling & retry logic
- Sync status visible on dashboard

### 3. Dashboard (Role-Specific)

#### Superadmin Dashboard
```
├── Portfolio Overview
│   ├── Total companies: 4
│   ├── Total revenue across all: $145,000
│   ├── Total clients: 15
│   └── Total pending invoices: 12
├── Company Cards (each company)
│   ├── Revenue, expenses, profit
│   ├── QB sync status
│   └── Quick actions
├── All Clients Overview
├── AI CFO Insights (all companies)
├── User Management
└── QB Connection Status
```

#### Company Dashboard
```
├── Financial Summary (from QB)
│   ├── Revenue this month
│   ├── Expenses this month
│   ├── Profit/Loss
│   └── Outstanding invoices
├── My Clients List
│   ├── Client name, orders, amount due
│   └── Payment status
├── Recent Orders
├── Invoice Management
├── AI CFO Insights (my company)
├── AI Chat (quick access)
└── QB Sync Status & Manual Trigger
```

#### Client Dashboard
```
├── My Orders (across all companies)
│   ├── Order status
│   ├── Order history
│   └── Place new order
├── My Invoices
│   ├── Pending invoices
│   ├── Paid invoices
│   └── Overdue invoices
├── Payment Status
│   ├── Amount due
│   ├── Payment history
│   └── Upcoming payments
├── Companies I buy from
└── AI Assistant (spending tips)
```

---

## 🤖 AI CFO Agent

### Overview
AI-powered assistant that analyzes QuickBooks data and provides financial insights, alerts, recommendations, and chat assistance to each user based on their role.

### AI Model
- Start with Claude API free tier / credits
- Migrate to paid tier as user base grows
- Cache AI insights for 24 hours to reduce API calls
- Store all chat history in Supabase

### Dashboard Widgets (Generated Daily + On-Demand)

#### For Superadmin
```
AI Summary:
├── Portfolio health overview (all companies combined)
├── Best/worst performing company
├── Cross-company risk alerts
├── Strategic recommendations
├── Cash flow prediction (all companies)
└── Client churn risk across portfolio
```

#### For Company Owner
```
AI Summary:
├── Monthly revenue/expense summary
├── Top 3 alerts (overdue invoices, expense spikes)
├── 3 actionable recommendations
├── Client behavior patterns
├── Payment trend analysis
├── Profit optimization tips
└── Revenue forecast (next 30 days)
```

#### For Client
```
AI Summary:
├── Spending overview (by company)
├── Cost-saving opportunities
├── Payment reminders
├── Bulk discount eligibility
├── Smart ordering suggestions
└── Payment optimization tips
```

### Chat Interface (Personal CFO Assistant)

```
Features:
├── Real-time chat with AI
├── Context-aware (knows user's financial data)
├── Ask questions about finances
├── Get explanations for trends
├── Generate email drafts
├── Request custom reports
├── Get payment reminders
├── Ask for predictions & forecasts
└── All chats stored in Supabase
```

#### Example Chat Interactions

**Company Owner asks:**
```
User: "Why are my expenses high this month?"

AI CFO: "Your packaging costs jumped 25% compared to last month.
Here's the breakdown:
• Supplier X charged $15/unit (was $12)
• You ordered 20% more volume
• Shipping costs increased by $500

Suggestions:
1. Negotiate with Supplier X for bulk pricing
2. Consider alternative supplier (found 2 cheaper options)
3. Consolidate shipments to save $300/month"
```

**Client asks:**
```
User: "When is my next payment due?"

AI CFO: "You have 2 upcoming payments:
• ABC Coffee: $5,000 due in 5 days (June 6)
• Fresh Dairy: $2,000 due in 12 days (June 13)

Tip: Pay ABC Coffee within 3 days to get 2% early payment
discount — saves you $100."
```

**Superadmin asks:**
```
User: "Which company needs attention?"

AI CFO: "XYZ Packaging needs immediate attention:
• Expenses up 25% (highest spike across all companies)
• 3 invoices overdue ($8,500 total)
• Profit margin dropped from 45% to 32%
• 1 client showing churn signals

Recommended actions:
1. Audit supplier contracts
2. Follow up on overdue invoices
3. Schedule call with at-risk client"
```

### AI Prompts

#### System Prompt for Company Owner
```
You are an AI CFO assistant for {company_name}.

You have access to:
- Revenue: {revenue_data}
- Expenses: {expense_data}
- Invoices: {invoice_data}
- Client payments: {payment_data}
- Historical trends: {trend_data}

Rules:
1. Always be specific with numbers and dates
2. Give actionable recommendations (not vague advice)
3. Flag risks immediately
4. Compare with previous months
5. Suggest concrete next steps
6. Keep responses concise but thorough
```

#### System Prompt for Superadmin
```
You are an AI CFO monitoring {count} companies: {company_list}

You have access to all company financial data.

Rules:
1. Compare performance across companies
2. Identify portfolio-wide risks
3. Rank companies by health
4. Suggest cross-company optimizations
5. Flag any company needing urgent attention
6. Provide strategic portfolio recommendations
```

#### System Prompt for Client
```
You are a financial assistant for {client_name}.

You have access to:
- Their orders with {companies}
- Their invoices and payment history
- Product pricing

Rules:
1. Focus on cost savings
2. Remind about upcoming payments
3. Suggest bulk ordering benefits
4. Never show other clients' data
5. Keep it simple and helpful
```

---

## 📊 Alert Configuration (Medium Sensitivity)

```
Alert Type              Threshold              Severity
──────────────────────  ─────────────────────  ────────
Overdue Invoice         10 days past due       medium
Expense Spike           20% above average      medium
Revenue Decline         15% drop from last mo  high
Payment Delay           3 days late            low
Client Churn Risk       50% drop in purchases  high
Low Cash Flow           Below 30-day expenses  high
```

### Alert Display
- Show on dashboard as color-coded cards
- Red: High severity (take action now)
- Yellow: Medium severity (monitor)
- Green: Positive insights (keep doing this)

### Future Enhancement
- Email alerts (infrastructure ready, disabled by default)
- Make alert thresholds configurable per company
- Push notifications

---

## 🔄 QuickBooks Sync Details

### Data Synced from QB
```
1. Invoices → amount, date, status, customer
2. Customers → name, email, balance
3. Payments → amount, date, method
4. Expenses → amount, category, vendor, date
5. Profit & Loss → summary reports
```

### Sync Schedule
```
- Daily: 6 AM UTC (all active companies)
- On-Demand: Manual trigger from dashboard
- Token Refresh: Auto-refresh before expiry
```

### Sync Flow
```
1. Cron job or Supabase Edge Function triggers at 6 AM
   ↓
2. For each company with qb_connected = true
   ↓
3. Check if qb_access_token is valid
   ↓
4. If expired → refresh using qb_refresh_token
   ↓
5. Fetch data from QB API (invoices, payments, etc.)
   ↓
6. Upsert into Supabase tables
   ↓
7. Log sync result in qb_sync_logs
   ↓
8. Trigger AI insight regeneration
```

---

## 🔐 Security

### Supabase Built-in Security
- Use Supabase Auth for all authentication
- Enable RLS on every table
- Use Supabase Vault for storing QB tokens (encrypted)
- Use Supabase Edge Functions for server-side logic

### Access Control
- Always verify role server-side (never trust client)
- RLS policies enforce data isolation at database level
- Company owners see only their data
- Clients see only their transactions
- Superadmin sees everything

### Data Protection
- HTTPS everywhere
- QB tokens encrypted at rest
- Audit logging for sensitive operations
- Input validation on all forms
- Rate limiting on API endpoints

---

## ⚙️ Configuration (.env.local)

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# QuickBooks
QUICKBOOKS_CLIENT_ID=your_qb_client_id
QUICKBOOKS_CLIENT_SECRET=your_qb_client_secret
QUICKBOOKS_REDIRECT_URI=http://localhost:3000/api/quickbooks/callback
QUICKBOOKS_API_BASE=https://sandbox-quickbooks.api.intuit.com  # prod: https://quickbooks.api.intuit.com

# AI CFO agent (Groq — not Claude/Anthropic for this project)
GROQ_API_KEY=your_groq_api_key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 📈 Performance Optimization

### Database
- Index: company_id, user_id, created_at on all tables
- Use Supabase Realtime for live updates
- Materialized views for dashboard aggregations

### AI
- Cache AI insights for 24 hours in ai_insights table
- Limit context to recent 90 days of data
- Summarize large datasets before sending to Claude
- Store all chat history (no expiry)

### Frontend
- Code splitting by route
- Lazy load dashboard widgets
- Use Supabase Realtime subscriptions for live data
- Cache QB data locally after sync

---

## 🧪 Testing Checklist

- [ ] Signup & login (all 3 roles)
- [ ] Role-based dashboard loading
- [ ] Data isolation (company can't see other company data)
- [ ] Data isolation (client can't see other client data)
- [ ] QB OAuth connection
- [ ] QB token refresh
- [ ] QB data sync (daily + manual)
- [ ] AI chat (all 3 roles)
- [ ] AI dashboard insights generation
- [ ] Alert triggering & display
- [ ] Order creation (client)
- [ ] Invoice viewing (client)
- [ ] Multi-company view (superadmin)
- [ ] Chat history storage & retrieval
- [ ] RLS policies working correctly

---

## 📝 Important Notes

1. **MVP Priority:** Auth → QB Sync → Dashboards → AI Chat → Alerts
2. **Supabase First:** Use Supabase built-in features (Auth, RLS, Edge Functions, Realtime, Vault) before building custom solutions
3. **Free AI Tier:** Start with Claude API free credits. Monitor usage. Migrate to paid when needed
4. **Data Isolation is Critical:** Test RLS policies thoroughly. A client should never see another client's data
5. **QB Token Security:** Always encrypt tokens. Use Supabase Vault. Never expose in frontend
6. **Chat Storage:** Store all chats indefinitely. This data improves AI responses over time
7. **Alert Emails:** Build the infrastructure now but keep disabled. Make it a toggle in settings for future
8. **Scalability:** Design database for 100+ companies from day 1

---

**Document Version:** 1.1
**Status:** Ready for Development
**Last Updated:** June 2026