import { tool } from "ai";
import { z } from "zod";
import { db } from "@/db";
import { cfoQbInvoices } from "@/db/schema";
import { and, eq, lte, isNotNull } from "drizzle-orm";

/** For company/super_admin — fetches open or overdue invoices across the QB realm */
export function createGetInvoicesTool(realmId: string) {
  return tool({
    description:
      "Fetch open or overdue invoices for the company's QuickBooks account. Use when the user asks about unpaid invoices, accounts receivable, overdue amounts, or specific customers who owe money.",
    inputSchema: z.object({
      filter: z
        .enum(["all_open", "overdue"])
        .default("all_open")
        .describe("all_open — all unpaid invoices; overdue — only invoices past their due date"),
      limit: z.number().int().min(1).max(50).default(20).describe("Max invoices to return"),
    }),
    execute: async ({ filter, limit }) => {
      const today = new Date().toISOString().split("T")[0];

      const conditions = [eq(cfoQbInvoices.realmId, realmId), eq(cfoQbInvoices.status, "Open")];
      if (filter === "overdue") {
        conditions.push(isNotNull(cfoQbInvoices.dueDate));
        conditions.push(lte(cfoQbInvoices.dueDate, today));
      }

      const invoices = await db
        .select({
          invoiceNumber: cfoQbInvoices.invoiceNumber,
          customerName: cfoQbInvoices.customerName,
          totalAmount: cfoQbInvoices.totalAmount,
          balance: cfoQbInvoices.balance,
          dueDate: cfoQbInvoices.dueDate,
          txnDate: cfoQbInvoices.txnDate,
          status: cfoQbInvoices.status,
        })
        .from(cfoQbInvoices)
        .where(and(...conditions))
        .limit(limit);

      return {
        filter,
        count: invoices.length,
        today,
        invoices,
      };
    },
  });
}

/** For customer role — fetches only their own invoices by QB customer ID */
export function createGetMyInvoicesTool(realmId: string, qbCustomerId: string) {
  return tool({
    description:
      "Fetch the current customer's own invoices. Use when the customer asks what they owe, their outstanding balance, upcoming payments, or payment history.",
    inputSchema: z.object({
      status: z
        .enum(["Open", "Paid", "all"])
        .default("all")
        .describe("Filter by invoice status"),
    }),
    execute: async ({ status }) => {
      const conditions = [
        eq(cfoQbInvoices.realmId, realmId),
        eq(cfoQbInvoices.customerId, qbCustomerId),
      ];
      if (status !== "all") {
        conditions.push(eq(cfoQbInvoices.status, status));
      }

      const invoices = await db
        .select({
          invoiceNumber: cfoQbInvoices.invoiceNumber,
          totalAmount: cfoQbInvoices.totalAmount,
          balance: cfoQbInvoices.balance,
          dueDate: cfoQbInvoices.dueDate,
          txnDate: cfoQbInvoices.txnDate,
          status: cfoQbInvoices.status,
        })
        .from(cfoQbInvoices)
        .where(and(...conditions))
        .limit(50);

      const totalOwed = invoices
        .filter((i) => i.status === "Open")
        .reduce((sum, i) => sum + Number(i.balance ?? 0), 0);

      return { status, totalOwed, invoices };
    },
  });
}
