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
import { eq } from "drizzle-orm";
import { qbQuery } from "./client";
import { runAllCalculations } from "@/lib/calculations";

// QB query pages cap at 1000 rows; we page through STARTPOSITION until exhausted.
const PAGE_SIZE = 1000;
// Chunk multi-row inserts to stay well under Postgres' bind-parameter limit.
const INSERT_CHUNK = 500;

// Sync all QB data for a single company (realmId + userId)
export async function syncCompany(realmId: string, userId: string) {
  const results = { invoices: 0, payments: 0, expenses: 0, accounts: 0, customers: 0 };

  try {
    results.invoices = await syncInvoices(realmId, userId);
    results.payments = await syncPayments(realmId, userId);
    results.expenses = await syncExpenses(realmId, userId);
    results.accounts = await syncAccounts(realmId, userId);
    results.customers = await syncCustomers(realmId, userId);

    // Run calculations on the fresh data
    await runAllCalculations(realmId);

    // Update last sync time
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

// ─── Sync helpers ────────────────────────────────────────────────────────────

// Fetch every record of an entity, paging through STARTPOSITION until a short
// page signals the end. Replaces the old single MAXRESULTS-1000 fetch.
async function fetchAllPages<T>(
  realmId: string,
  userId: string,
  entity: QBEntity,
  whereClause = ""
): Promise<T[]> {
  const all: T[] = [];
  const where = whereClause ? `${whereClause} ` : "";
  let start = 1;

  for (;;) {
    const query = `SELECT * FROM ${entity} ${where}STARTPOSITION ${start} MAXRESULTS ${PAGE_SIZE}`;
    const data = (await qbQuery(realmId, userId, query)) as QBResponse;
    const rows = (data?.QueryResponse?.[entity] ?? []) as T[];

    all.push(...rows);
    if (rows.length < PAGE_SIZE) break; // last page
    start += PAGE_SIZE;
  }

  return all;
}

// Insert rows in bounded batches so large companies don't blow the parameter limit.
async function insertInChunks<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await insert(rows.slice(i, i + INSERT_CHUNK));
  }
}

// ─── Invoices ────────────────────────────────────────────────────────────────

async function syncInvoices(realmId: string, userId: string): Promise<number> {
  const items = await fetchAllPages<QBInvoice>(realmId, userId, "Invoice");

  // Delete existing records for this realm, then re-insert
  await db.delete(cfoQbInvoices).where(eq(cfoQbInvoices.realmId, realmId));

  if (items.length === 0) return 0;

  const values = items.map((inv) => ({
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
  }));

  await insertInChunks(values, (batch) => db.insert(cfoQbInvoices).values(batch));

  return items.length;
}

function mapInvoiceStatus(inv: QBInvoice): "Open" | "Paid" | "Voided" | "Draft" {
  if (inv.PrivateNote?.toLowerCase().includes("void")) return "Voided";
  if (Number(inv.Balance ?? 0) <= 0 && Number(inv.TotalAmt ?? 0) > 0) return "Paid";
  if (Number(inv.Balance ?? 0) > 0) return "Open";
  return "Draft";
}

// ─── Payments ────────────────────────────────────────────────────────────────

async function syncPayments(realmId: string, userId: string): Promise<number> {
  const items = await fetchAllPages<QBPayment>(realmId, userId, "Payment");

  await db.delete(cfoQbPayments).where(eq(cfoQbPayments.realmId, realmId));

  if (items.length === 0) return 0;

  const values = items.map((p) => ({
    realmId,
    qbId: p.Id,
    customerId: p.CustomerRef?.value ?? null,
    customerName: p.CustomerRef?.name ?? null,
    totalAmount: String(p.TotalAmt ?? 0),
    paymentDate: p.TxnDate ?? null,
    paymentMethod: p.PaymentMethodRef?.name ?? null,
    invoiceIds: p.Line?.flatMap((l) => l.LinkedTxn?.map((lt) => lt.TxnId) ?? []) ?? [],
    rawData: p,
  }));

  await insertInChunks(values, (batch) => db.insert(cfoQbPayments).values(batch));

  return items.length;
}

// ─── Expenses ────────────────────────────────────────────────────────────────

async function syncExpenses(realmId: string, userId: string): Promise<number> {
  const items = await fetchAllPages<QBPurchase>(realmId, userId, "Purchase");

  await db.delete(cfoQbExpenses).where(eq(cfoQbExpenses.realmId, realmId));

  if (items.length === 0) return 0;

  const values = items.map((p) => {
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
  });

  await insertInChunks(values, (batch) => db.insert(cfoQbExpenses).values(batch));

  return items.length;
}

// ─── Accounts ────────────────────────────────────────────────────────────────

async function syncAccounts(realmId: string, userId: string): Promise<number> {
  const items = await fetchAllPages<QBAccount>(realmId, userId, "Account", "WHERE Active = true");

  await db.delete(cfoQbAccounts).where(eq(cfoQbAccounts.realmId, realmId));

  if (items.length === 0) return 0;

  const values = items.map((a) => ({
    realmId,
    qbId: a.Id,
    name: a.Name,
    accountType: a.AccountType ?? null,
    accountSubType: a.AccountSubType ?? null,
    currentBalance: a.CurrentBalance != null ? String(a.CurrentBalance) : null,
    isActive: a.Active ?? true,
    rawData: a,
  }));

  await insertInChunks(values, (batch) => db.insert(cfoQbAccounts).values(batch));

  return items.length;
}

// ─── Customers ───────────────────────────────────────────────────────────────

async function syncCustomers(realmId: string, userId: string): Promise<number> {
  const items = await fetchAllPages<QBCustomer>(realmId, userId, "Customer");

  await db.delete(cfoQbCustomers).where(eq(cfoQbCustomers.realmId, realmId));

  if (items.length === 0) return 0;

  const values = items.map((c) => ({
    realmId,
    qbId: c.Id,
    displayName: c.DisplayName ?? null,
    email: c.PrimaryEmailAddr?.Address ?? null,
    phone: c.PrimaryPhone?.FreeFormNumber ?? null,
    balance: c.Balance != null ? String(c.Balance) : null,
    billAddr: c.BillAddr ?? null,
    isActive: c.Active ?? true,
    rawData: c,
  }));

  await insertInChunks(values, (batch) => db.insert(cfoQbCustomers).values(batch));

  return items.length;
}

// ─── QB response type helpers ────────────────────────────────────────────────

type QBEntity = "Invoice" | "Payment" | "Purchase" | "Account" | "Customer";

interface QBResponse {
  QueryResponse?: {
    Invoice?: QBInvoice[];
    Payment?: QBPayment[];
    Purchase?: QBPurchase[];
    Account?: QBAccount[];
    Customer?: QBCustomer[];
  };
}

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
