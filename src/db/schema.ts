import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  date,
  numeric,
  jsonb,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "company",
  "customer",
]);

export const activityStatusEnum = pgEnum("activity_status", [
  "success",
  "failure",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "Open",
  "Paid",
  "Voided",
  "Draft",
]);

// ─── cfo_users ────────────────────────────────────────────────────────────────
// Extends Supabase auth.users — one row per registered user

export const cfoUsers = pgTable("cfo_users", {
  id: uuid("id").primaryKey(), // matches auth.users.id from Supabase
  email: text("email").notNull(),
  name: text("name"),
  role: userRoleEnum("role").notNull().default("customer"),
  // For customers: the company user who invited them
  companyId: uuid("company_id"),
  // QB customer ID (qbId from cfo_qb_customers) linking this portal user to a QB customer
  qbCustomerId: text("qb_customer_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── cfo_qb_connections ───────────────────────────────────────────────────────
// One row per company that has connected their QuickBooks account

export const cfoQbConnections = pgTable("cfo_qb_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(), // FK → cfo_users.id (company role)
  realmId: text("realm_id").notNull(), // QB company ID
  companyName: text("company_name"),
  isActive: boolean("is_active").notNull().default(true),
  connectedAt: timestamp("connected_at").notNull().defaultNow(),
  lastSyncAt: timestamp("last_sync_at"),
  syncError: text("sync_error"), // last sync error message if any
});

// ─── cfo_qb_tokens ────────────────────────────────────────────────────────────
// QB OAuth tokens — never exposed to the frontend

export const cfoQbTokens = pgTable("cfo_qb_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(), // FK → cfo_users.id (company role)
  realmId: text("realm_id").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(), // access token expiry (1 hour)
  tokenType: text("token_type").notNull().default("bearer"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── cfo_qb_transactions ──────────────────────────────────────────────────────
// Raw income and expense transactions synced from QB

export const cfoQbTransactions = pgTable("cfo_qb_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  realmId: text("realm_id").notNull(),
  qbId: text("qb_id").notNull(), // QB's internal ID
  txnType: text("txn_type").notNull(), // Invoice, Bill, Payment, Expense, etc.
  txnDate: date("txn_date"),
  amount: numeric("amount", { precision: 12, scale: 2 }),
  customerRef: text("customer_ref"),
  customerName: text("customer_name"),
  vendorRef: text("vendor_ref"),
  vendorName: text("vendor_name"),
  description: text("description"),
  rawData: jsonb("raw_data"), // full QB response
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
});

// ─── cfo_qb_invoices ──────────────────────────────────────────────────────────
// Raw invoices synced from QB

export const cfoQbInvoices = pgTable("cfo_qb_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  realmId: text("realm_id").notNull(),
  qbId: text("qb_id").notNull(),
  invoiceNumber: text("invoice_number"),
  customerId: text("customer_id"),
  customerName: text("customer_name"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }),
  balance: numeric("balance", { precision: 12, scale: 2 }), // amount still owed
  dueDate: date("due_date"),
  txnDate: date("txn_date"), // invoice date
  status: invoiceStatusEnum("status").notNull().default("Open"),
  rawData: jsonb("raw_data"),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("cfo_qb_invoices_realm_qb_idx").on(t.realmId, t.qbId),
]);

// ─── cfo_qb_payments ──────────────────────────────────────────────────────────
// Raw payments synced from QB

export const cfoQbPayments = pgTable("cfo_qb_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  realmId: text("realm_id").notNull(),
  qbId: text("qb_id").notNull(),
  customerId: text("customer_id"),
  customerName: text("customer_name"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }),
  paymentDate: date("payment_date"),
  paymentMethod: text("payment_method"),
  invoiceIds: jsonb("invoice_ids"), // array of QB invoice IDs this payment covers
  rawData: jsonb("raw_data"),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("cfo_qb_payments_realm_qb_idx").on(t.realmId, t.qbId),
]);

// ─── cfo_qb_expenses ──────────────────────────────────────────────────────────
// Raw expenses (bills, purchases) synced from QB

export const cfoQbExpenses = pgTable("cfo_qb_expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  realmId: text("realm_id").notNull(),
  qbId: text("qb_id").notNull(),
  vendorId: text("vendor_id"),
  vendorName: text("vendor_name"),
  accountId: text("account_id"),
  accountName: text("account_name"),
  category: text("category"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }),
  expenseDate: date("expense_date"),
  rawData: jsonb("raw_data"),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("cfo_qb_expenses_realm_qb_idx").on(t.realmId, t.qbId),
]);

// ─── cfo_qb_accounts ──────────────────────────────────────────────────────────
// Chart of accounts from QB

export const cfoQbAccounts = pgTable("cfo_qb_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  realmId: text("realm_id").notNull(),
  qbId: text("qb_id").notNull(),
  name: text("name").notNull(),
  accountType: text("account_type"), // Asset, Liability, Income, Expense, etc.
  accountSubType: text("account_sub_type"),
  currentBalance: numeric("current_balance", { precision: 12, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  rawData: jsonb("raw_data"),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("cfo_qb_accounts_realm_qb_idx").on(t.realmId, t.qbId),
]);

// ─── cfo_qb_customers ─────────────────────────────────────────────────────────
// Customers — both QB-synced (realmId+qbId set) and platform-created (userId set, QB fields null)

export const cfoQbCustomers = pgTable("cfo_qb_customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable for platform-created customers (QB sync populates these)
  realmId: text("realm_id"),
  qbId: text("qb_id"),
  // Set for platform-created customers, null for QB-only records
  userId: uuid("user_id"),
  displayName: text("display_name"),
  email: text("email"),
  phone: text("phone"),
  balance: numeric("balance", { precision: 12, scale: 2 }),
  billAddr: jsonb("bill_addr"),
  isActive: boolean("is_active").notNull().default(true),
  rawData: jsonb("raw_data"),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
}, (t) => [
  // NULL values are distinct in Postgres unique indexes — QB rows (non-null) deduplicate correctly
  uniqueIndex("cfo_qb_customers_realm_qb_idx").on(t.realmId, t.qbId),
]);

// ─── cfo_qb_companies ─────────────────────────────────────────────────────────
// Platform-created company users (QB connection is separate via cfo_qb_connections)

export const cfoQbCompanies = pgTable("cfo_qb_companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(), // FK → cfo_users.id
  companyName: text("company_name"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  industry: text("industry"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── cfo_calculated_reports ───────────────────────────────────────────────────
// Cached results of calculated CFO reports (Revenue, Cash Flow, KPI, Risk)

export const cfoCalculatedReports = pgTable("cfo_calculated_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  realmId: text("realm_id").notNull(),
  reportType: text("report_type").notNull(), // revenue_analysis | cash_flow | kpi | risk
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  data: jsonb("data").notNull(), // calculated report payload
  calculatedAt: timestamp("calculated_at").notNull().defaultNow(),
});

// ─── cfo_webhook_events ───────────────────────────────────────────────────────
// Incoming QB webhook events (entity changes notifications)

export const cfoWebhookEvents = pgTable("cfo_webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  realmId: text("realm_id"),
  entityType: text("entity_type"), // Invoice, Payment, Bill, etc.
  entityId: text("entity_id"),
  eventType: text("event_type"), // Create | Update | Delete | Merge | Void
  rawPayload: jsonb("raw_payload"),
  processed: boolean("processed").notNull().default(false),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
});

// ─── cfo_activity_logs ────────────────────────────────────────────────────────
// Audit trail for all significant actions

export const cfoActivityLogs = pgTable("cfo_activity_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"), // nullable — system actions have no user
  action: text("action").notNull(), // e.g. "qb_connected", "sync_started", "invoice_viewed"
  status: activityStatusEnum("status").notNull().default("success"),
  details: jsonb("details"), // any extra context
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── cfo_api_errors ───────────────────────────────────────────────────────────
// Log API errors for debugging and monitoring

export const cfoApiErrors = pgTable("cfo_api_errors", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  endpoint: text("endpoint"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  requestData: jsonb("request_data"),
  happenedAt: timestamp("happened_at").notNull().defaultNow(),
});

// ─── cfo_chat_history ─────────────────────────────────────────────────────────
// Persisted AI chat turns — one row per message (user or assistant)

export const cfoChatHistory = pgTable("cfo_chat_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  sessionId: uuid("session_id").notNull(),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Type exports ─────────────────────────────────────────────────────────────
// Inferred TypeScript types for inserts and selects

export type User = typeof cfoUsers.$inferSelect;
export type NewUser = typeof cfoUsers.$inferInsert;

export type QbConnection = typeof cfoQbConnections.$inferSelect;
export type NewQbConnection = typeof cfoQbConnections.$inferInsert;

export type QbToken = typeof cfoQbTokens.$inferSelect;
export type NewQbToken = typeof cfoQbTokens.$inferInsert;

export type QbInvoice = typeof cfoQbInvoices.$inferSelect;
export type NewQbInvoice = typeof cfoQbInvoices.$inferInsert;

export type QbPayment = typeof cfoQbPayments.$inferSelect;
export type NewQbPayment = typeof cfoQbPayments.$inferInsert;

export type QbExpense = typeof cfoQbExpenses.$inferSelect;
export type NewQbExpense = typeof cfoQbExpenses.$inferInsert;

export type QbCustomer = typeof cfoQbCustomers.$inferSelect;
export type NewQbCustomer = typeof cfoQbCustomers.$inferInsert;

export type QbCompany = typeof cfoQbCompanies.$inferSelect;
export type NewQbCompany = typeof cfoQbCompanies.$inferInsert;

export type CalculatedReport = typeof cfoCalculatedReports.$inferSelect;
export type NewCalculatedReport = typeof cfoCalculatedReports.$inferInsert;

export type ActivityLog = typeof cfoActivityLogs.$inferSelect;

export type ChatHistory = typeof cfoChatHistory.$inferSelect;
export type NewChatHistory = typeof cfoChatHistory.$inferInsert;
