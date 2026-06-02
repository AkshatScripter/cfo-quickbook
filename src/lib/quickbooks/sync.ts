import { db } from "@/db";
import {
  cfoQbInvoices,
  cfoQbPayments,
  cfoQbExpenses,
  cfoQbAccounts,
  cfoQbCustomers,
  cfoQbConnections,
  cfoActivityLogs,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { qbQuery, qbCdc, cdcRows } from "./client";
import { runAllCalculations } from "@/lib/calculations";

// QB query pages cap at 1000 rows; loop through STARTPOSITION until exhausted.
const PAGE_SIZE = 1000;
// Chunk multi-row inserts to stay well under Postgres' bind-parameter limit.
const INSERT_CHUNK = 500;
// CDC can look back at most 30 days. Beyond that, fall back to full sync.
const CDC_MAX_DAYS = 30;

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function syncCompany(realmId: string, userId: string) {
  const results = { invoices: 0, payments: 0, expenses: 0, accounts: 0, customers: 0, mode: "full" as SyncMode };

  try {
    const connection = await getConnection(realmId);
    const lastSyncAt = connection?.lastSyncAt ?? null;
    const mode = resolveSyncMode(lastSyncAt);
    results.mode = mode;

    if (mode === "full") {
      results.invoices  = await fullSyncInvoices(realmId, userId);
      results.payments  = await fullSyncPayments(realmId, userId);
      results.expenses  = await fullSyncExpenses(realmId, userId);
      results.accounts  = await fullSyncAccounts(realmId, userId);
      results.customers = await fullSyncCustomers(realmId, userId);
    } else {
      const counts = await cdcSync(realmId, userId, lastSyncAt!);
      Object.assign(results, counts);
    }

    await runAllCalculations(realmId);

    await db
      .update(cfoQbConnections)
      .set({ lastSyncAt: new Date(), syncError: null })
      .where(eq(cfoQbConnections.realmId, realmId));

    await db.insert(cfoActivityLogs).values({
      userId,
      action: "qb_sync_completed",
      status: "success",
      details: results,
    });

    return results;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown sync error";

    await db.insert(cfoActivityLogs).values({
      userId,
      action: "qb_sync_failed",
      status: "failure",
      details: { error: msg },
    });

    throw error;
  }
}

// ─── Sync mode ───────────────────────────────────────────────────────────────

type SyncMode = "full" | "incremental";

function resolveSyncMode(lastSyncAt: Date | null): SyncMode {
  if (!lastSyncAt) return "full";
  const daysSince = (Date.now() - new Date(lastSyncAt).getTime()) / 86_400_000;
  return daysSince > CDC_MAX_DAYS ? "full" : "incremental";
}

async function getConnection(realmId: string) {
  const [conn] = await db
    .select()
    .from(cfoQbConnections)
    .where(eq(cfoQbConnections.realmId, realmId))
    .limit(1);
  return conn ?? null;
}

// ─── CDC (incremental) sync ───────────────────────────────────────────────────

async function cdcSync(realmId: string, userId: string, changedSince: Date) {
  const cdc = await qbCdc(realmId, userId, ["Invoice", "Payment", "Purchase", "Account", "Customer"], changedSince);

  const invoices  = cdcRows<QBInvoice>(cdc, "Invoice");
  const payments  = cdcRows<QBPayment>(cdc, "Payment");
  const expenses  = cdcRows<QBPurchase>(cdc, "Purchase");
  const accounts  = cdcRows<QBAccount>(cdc, "Account");
  const customers = cdcRows<QBCustomer>(cdc, "Customer");

  await Promise.all([
    upsertInvoices(realmId, invoices),
    upsertPayments(realmId, payments),
    upsertExpenses(realmId, expenses),
    upsertAccounts(realmId, accounts),
    upsertCustomers(realmId, customers),
  ]);

  return {
    invoices: invoices.length,
    payments: payments.length,
    expenses: expenses.length,
    accounts: accounts.length,
    customers: customers.length,
  };
}

// ─── Mappers (shared between full and CDC paths) ──────────────────────────────

function mapInvoice(realmId: string, inv: QBInvoice) {
  return {
    realmId,
    qbId: inv.Id,
    invoiceNumber: inv.DocNumber ?? null,
    customerId: inv.CustomerRef?.value ?? null,
    customerName: inv.CustomerRef?.name ?? null,
    totalAmount: String(inv.TotalAmt ?? 0),
    balance: String(inv.Balance ?? 0),
    dueDate: inv.DueDate ?? null,
    txnDate: inv.TxnDate ?? null,
    status: mapInvoiceStatus(inv),
    rawData: inv,
  };
}

function mapInvoiceStatus(inv: QBInvoice): "Open" | "Paid" | "Voided" | "Draft" {
  if (inv.PrivateNote?.toLowerCase().includes("void")) return "Voided";
  if (Number(inv.Balance ?? 0) <= 0 && Number(inv.TotalAmt ?? 0) > 0) return "Paid";
  if (Number(inv.Balance ?? 0) > 0) return "Open";
  return "Draft";
}

function mapPayment(realmId: string, p: QBPayment) {
  return {
    realmId,
    qbId: p.Id,
    customerId: p.CustomerRef?.value ?? null,
    customerName: p.CustomerRef?.name ?? null,
    totalAmount: String(p.TotalAmt ?? 0),
    paymentDate: p.TxnDate ?? null,
    paymentMethod: p.PaymentMethodRef?.name ?? null,
    invoiceIds: p.Line?.flatMap((l) => l.LinkedTxn?.map((lt) => lt.TxnId) ?? []) ?? [],
    rawData: p,
  };
}

function mapExpense(realmId: string, p: QBPurchase) {
  const line = p.Line?.[0];
  const detail = line?.AccountBasedExpenseLineDetail;
  return {
    realmId,
    qbId: p.Id,
    vendorId: p.EntityRef?.value ?? null,
    vendorName: p.EntityRef?.name ?? null,
    accountId: detail?.AccountRef?.value ?? null,
    accountName: detail?.AccountRef?.name ?? null,
    category: detail?.AccountRef?.name ?? null,
    totalAmount: String(p.TotalAmt ?? 0),
    expenseDate: p.TxnDate ?? null,
    rawData: p,
  };
}

function mapAccount(realmId: string, a: QBAccount) {
  return {
    realmId,
    qbId: a.Id,
    name: a.Name,
    accountType: a.AccountType ?? null,
    accountSubType: a.AccountSubType ?? null,
    currentBalance: a.CurrentBalance != null ? String(a.CurrentBalance) : null,
    isActive: a.Active ?? true,
    rawData: a,
  };
}

function mapCustomer(realmId: string, c: QBCustomer) {
  return {
    realmId,
    qbId: c.Id,
    displayName: c.DisplayName ?? null,
    email: c.PrimaryEmailAddr?.Address ?? null,
    phone: c.PrimaryPhone?.FreeFormNumber ?? null,
    balance: c.Balance != null ? String(c.Balance) : null,
    billAddr: c.BillAddr ?? null,
    isActive: c.Active ?? true,
    rawData: c,
  };
}

// ─── CDC upserts ─────────────────────────────────────────────────────────────

async function upsertInvoices(realmId: string, items: QBInvoice[]) {
  if (items.length === 0) return;
  const rows = items.map((i) => mapInvoice(realmId, i));
  await insertInChunks(rows, (batch) =>
    db.insert(cfoQbInvoices).values(batch).onConflictDoUpdate({
      target: [cfoQbInvoices.realmId, cfoQbInvoices.qbId],
      set: {
        invoiceNumber: sql`excluded.invoice_number`,
        customerId:    sql`excluded.customer_id`,
        customerName:  sql`excluded.customer_name`,
        totalAmount:   sql`excluded.total_amount`,
        balance:       sql`excluded.balance`,
        dueDate:       sql`excluded.due_date`,
        txnDate:       sql`excluded.txn_date`,
        status:        sql`excluded.status`,
        rawData:       sql`excluded.raw_data`,
        syncedAt:      sql`now()`,
      },
    })
  );
}

async function upsertPayments(realmId: string, items: QBPayment[]) {
  if (items.length === 0) return;
  const rows = items.map((p) => mapPayment(realmId, p));
  await insertInChunks(rows, (batch) =>
    db.insert(cfoQbPayments).values(batch).onConflictDoUpdate({
      target: [cfoQbPayments.realmId, cfoQbPayments.qbId],
      set: {
        customerId:    sql`excluded.customer_id`,
        customerName:  sql`excluded.customer_name`,
        totalAmount:   sql`excluded.total_amount`,
        paymentDate:   sql`excluded.payment_date`,
        paymentMethod: sql`excluded.payment_method`,
        invoiceIds:    sql`excluded.invoice_ids`,
        rawData:       sql`excluded.raw_data`,
        syncedAt:      sql`now()`,
      },
    })
  );
}

async function upsertExpenses(realmId: string, items: QBPurchase[]) {
  if (items.length === 0) return;
  const rows = items.map((p) => mapExpense(realmId, p));
  await insertInChunks(rows, (batch) =>
    db.insert(cfoQbExpenses).values(batch).onConflictDoUpdate({
      target: [cfoQbExpenses.realmId, cfoQbExpenses.qbId],
      set: {
        vendorId:    sql`excluded.vendor_id`,
        vendorName:  sql`excluded.vendor_name`,
        accountId:   sql`excluded.account_id`,
        accountName: sql`excluded.account_name`,
        category:    sql`excluded.category`,
        totalAmount: sql`excluded.total_amount`,
        expenseDate: sql`excluded.expense_date`,
        rawData:     sql`excluded.raw_data`,
        syncedAt:    sql`now()`,
      },
    })
  );
}

async function upsertAccounts(realmId: string, items: QBAccount[]) {
  if (items.length === 0) return;
  const rows = items.map((a) => mapAccount(realmId, a));
  await insertInChunks(rows, (batch) =>
    db.insert(cfoQbAccounts).values(batch).onConflictDoUpdate({
      target: [cfoQbAccounts.realmId, cfoQbAccounts.qbId],
      set: {
        name:           sql`excluded.name`,
        accountType:    sql`excluded.account_type`,
        accountSubType: sql`excluded.account_sub_type`,
        currentBalance: sql`excluded.current_balance`,
        isActive:       sql`excluded.is_active`,
        rawData:        sql`excluded.raw_data`,
        syncedAt:       sql`now()`,
      },
    })
  );
}

async function upsertCustomers(realmId: string, items: QBCustomer[]) {
  if (items.length === 0) return;
  const rows = items.map((c) => mapCustomer(realmId, c));
  await insertInChunks(rows, (batch) =>
    db.insert(cfoQbCustomers).values(batch).onConflictDoUpdate({
      target: [cfoQbCustomers.realmId, cfoQbCustomers.qbId],
      set: {
        displayName: sql`excluded.display_name`,
        email:       sql`excluded.email`,
        phone:       sql`excluded.phone`,
        balance:     sql`excluded.balance`,
        billAddr:    sql`excluded.bill_addr`,
        isActive:    sql`excluded.is_active`,
        rawData:     sql`excluded.raw_data`,
        syncedAt:    sql`now()`,
      },
    })
  );
}

// ─── Full sync (delete-then-insert with pagination) ───────────────────────────

async function fetchAllPages<T>(realmId: string, userId: string, entity: string, whereClause = ""): Promise<T[]> {
  const all: T[] = [];
  const where = whereClause ? `${whereClause} ` : "";
  let start = 1;
  for (;;) {
    const q = `SELECT * FROM ${entity} ${where}STARTPOSITION ${start} MAXRESULTS ${PAGE_SIZE}`;
    const data = (await qbQuery(realmId, userId, q)) as { QueryResponse?: Record<string, unknown> };
    const rows = ((data?.QueryResponse?.[entity] ?? []) as T[]);
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }
  return all;
}

async function fullSyncInvoices(realmId: string, userId: string): Promise<number> {
  const items = await fetchAllPages<QBInvoice>(realmId, userId, "Invoice");
  await db.delete(cfoQbInvoices).where(eq(cfoQbInvoices.realmId, realmId));
  if (items.length === 0) return 0;
  await insertInChunks(items.map((i) => mapInvoice(realmId, i)), (b) => db.insert(cfoQbInvoices).values(b));
  return items.length;
}

async function fullSyncPayments(realmId: string, userId: string): Promise<number> {
  const items = await fetchAllPages<QBPayment>(realmId, userId, "Payment");
  await db.delete(cfoQbPayments).where(eq(cfoQbPayments.realmId, realmId));
  if (items.length === 0) return 0;
  await insertInChunks(items.map((p) => mapPayment(realmId, p)), (b) => db.insert(cfoQbPayments).values(b));
  return items.length;
}

async function fullSyncExpenses(realmId: string, userId: string): Promise<number> {
  const items = await fetchAllPages<QBPurchase>(realmId, userId, "Purchase");
  await db.delete(cfoQbExpenses).where(eq(cfoQbExpenses.realmId, realmId));
  if (items.length === 0) return 0;
  await insertInChunks(items.map((p) => mapExpense(realmId, p)), (b) => db.insert(cfoQbExpenses).values(b));
  return items.length;
}

async function fullSyncAccounts(realmId: string, userId: string): Promise<number> {
  const items = await fetchAllPages<QBAccount>(realmId, userId, "Account", "WHERE Active = true");
  await db.delete(cfoQbAccounts).where(eq(cfoQbAccounts.realmId, realmId));
  if (items.length === 0) return 0;
  await insertInChunks(items.map((a) => mapAccount(realmId, a)), (b) => db.insert(cfoQbAccounts).values(b));
  return items.length;
}

async function fullSyncCustomers(realmId: string, userId: string): Promise<number> {
  const items = await fetchAllPages<QBCustomer>(realmId, userId, "Customer");
  await db.delete(cfoQbCustomers).where(eq(cfoQbCustomers.realmId, realmId));
  if (items.length === 0) return 0;
  await insertInChunks(items.map((c) => mapCustomer(realmId, c)), (b) => db.insert(cfoQbCustomers).values(b));
  return items.length;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function insertInChunks<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await insert(rows.slice(i, i + INSERT_CHUNK));
  }
}

// ─── QB response types ────────────────────────────────────────────────────────

interface QBInvoice {
  Id: string;
  DocNumber?: string;
  CustomerRef?: { value: string; name: string };
  TotalAmt?: number;
  Balance?: number;
  DueDate?: string;
  TxnDate?: string;
  PrivateNote?: string;
}

interface QBPayment {
  Id: string;
  CustomerRef?: { value: string; name: string };
  TotalAmt?: number;
  TxnDate?: string;
  PaymentMethodRef?: { name: string };
  Line?: Array<{ LinkedTxn?: Array<{ TxnId: string; TxnType: string }> }>;
}

interface QBPurchase {
  Id: string;
  EntityRef?: { value: string; name: string };
  TotalAmt?: number;
  TxnDate?: string;
  Line?: Array<{
    AccountBasedExpenseLineDetail?: {
      AccountRef?: { value: string; name: string };
    };
  }>;
}

interface QBAccount {
  Id: string;
  Name: string;
  AccountType?: string;
  AccountSubType?: string;
  CurrentBalance?: number;
  Active?: boolean;
}

interface QBCustomer {
  Id: string;
  DisplayName?: string;
  PrimaryEmailAddr?: { Address?: string };
  PrimaryPhone?: { FreeFormNumber?: string };
  Balance?: number;
  BillAddr?: Record<string, unknown>;
  Active?: boolean;
}
