import { db } from "@/db";
import {
  cfoQbInvoices,
  cfoQbPayments,
  cfoQbExpenses,
  cfoQbAccounts,
  cfoQbConnections,
  cfoActivityLogs,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { qbQuery } from "./client";
import { runAllCalculations } from "@/lib/calculations";

// Sync all QB data for a single company (realmId + userId)
export async function syncCompany(realmId: string, userId: string) {
  const results = { invoices: 0, payments: 0, expenses: 0, accounts: 0 };

  try {
    results.invoices = await syncInvoices(realmId, userId);
    results.payments = await syncPayments(realmId, userId);
    results.expenses = await syncExpenses(realmId, userId);
    results.accounts = await syncAccounts(realmId, userId);

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

// ─── Invoices ────────────────────────────────────────────────────────────────

async function syncInvoices(realmId: string, userId: string): Promise<number> {
  const data = await qbQuery(realmId, userId, "SELECT * FROM Invoice MAXRESULTS 1000") as QBResponse;
  const items = (data?.QueryResponse?.Invoice ?? []) as QBInvoice[];

  // Delete existing records for this realm, then re-insert
  await db.delete(cfoQbInvoices).where(eq(cfoQbInvoices.realmId, realmId));

  if (items.length === 0) return 0;

  await db.insert(cfoQbInvoices).values(
    items.map((inv) => ({
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
    }))
  );

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
  const data = await qbQuery(realmId, userId, "SELECT * FROM Payment MAXRESULTS 1000") as QBResponse;
  const items = (data?.QueryResponse?.Payment ?? []) as QBPayment[];

  await db.delete(cfoQbPayments).where(eq(cfoQbPayments.realmId, realmId));

  if (items.length === 0) return 0;

  await db.insert(cfoQbPayments).values(
    items.map((p) => ({
      realmId,
      qbId: p.Id,
      customerId: p.CustomerRef?.value ?? null,
      customerName: p.CustomerRef?.name ?? null,
      totalAmount: String(p.TotalAmt ?? 0),
      paymentDate: p.TxnDate ?? null,
      paymentMethod: p.PaymentMethodRef?.name ?? null,
      invoiceIds: p.Line?.flatMap((l) => l.LinkedTxn?.map((lt) => lt.TxnId) ?? []) ?? [],
      rawData: p,
    }))
  );

  return items.length;
}

// ─── Expenses ────────────────────────────────────────────────────────────────

async function syncExpenses(realmId: string, userId: string): Promise<number> {
  const data = await qbQuery(realmId, userId, "SELECT * FROM Purchase MAXRESULTS 1000") as QBResponse;
  const items = (data?.QueryResponse?.Purchase ?? []) as QBPurchase[];

  await db.delete(cfoQbExpenses).where(eq(cfoQbExpenses.realmId, realmId));

  if (items.length === 0) return 0;

  await db.insert(cfoQbExpenses).values(
    items.map((p) => {
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
    })
  );

  return items.length;
}

// ─── Accounts ────────────────────────────────────────────────────────────────

async function syncAccounts(realmId: string, userId: string): Promise<number> {
  const data = await qbQuery(realmId, userId, "SELECT * FROM Account WHERE Active = true MAXRESULTS 1000") as QBResponse;
  const items = (data?.QueryResponse?.Account ?? []) as QBAccount[];

  await db.delete(cfoQbAccounts).where(eq(cfoQbAccounts.realmId, realmId));

  if (items.length === 0) return 0;

  await db.insert(cfoQbAccounts).values(
    items.map((a) => ({
      realmId,
      qbId: a.Id,
      name: a.Name,
      accountType: a.AccountType ?? null,
      accountSubType: a.AccountSubType ?? null,
      currentBalance: a.CurrentBalance != null ? String(a.CurrentBalance) : null,
      isActive: a.Active ?? true,
      rawData: a,
    }))
  );

  return items.length;
}

// ─── QB response type helpers ────────────────────────────────────────────────

interface QBResponse {
  QueryResponse?: {
    Invoice?: QBInvoice[];
    Payment?: QBPayment[];
    Purchase?: QBPurchase[];
    Account?: QBAccount[];
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
