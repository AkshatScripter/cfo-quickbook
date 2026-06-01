import { db } from "@/db";
import {
  cfoQbInvoices,
  cfoQbPayments,
  cfoQbExpenses,
  cfoCalculatedReports,
} from "@/db/schema";
import { eq, and, lt, lte, gte, isNull, not } from "drizzle-orm";

// Run all 4 CFO calculations for a realmId and cache results in cfo_calculated_reports
export async function runAllCalculations(realmId: string) {
  const now = new Date();

  await Promise.all([
    calculateRevenue(realmId, now),
    calculateCashFlow(realmId, now),
    calculateKPI(realmId, now),
    calculateRisk(realmId, now),
  ]);
}

// ─── Revenue Analysis ─────────────────────────────────────────────────────────

async function calculateRevenue(realmId: string, now: Date) {
  const invoices = await db
    .select()
    .from(cfoQbInvoices)
    .where(eq(cfoQbInvoices.realmId, realmId));

  // Group by month
  const byMonth: Record<string, number> = {};
  const byCustomer: Record<string, number> = {};
  let totalRevenue = 0;

  for (const inv of invoices) {
    const amount = Number(inv.totalAmount ?? 0);
    if (!inv.txnDate) continue;

    const month = inv.txnDate.slice(0, 7); // YYYY-MM
    byMonth[month] = (byMonth[month] ?? 0) + amount;
    totalRevenue += amount;

    const customer = inv.customerName ?? "Unknown";
    byCustomer[customer] = (byCustomer[customer] ?? 0) + amount;
  }

  // Build sorted 6-month trend
  const months = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, amount]) => ({ month, amount: round(amount) }));

  // Top 5 customers
  const topCustomers = Object.entries(byCustomer)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, amount]) => ({
      name,
      amount: round(amount),
      pct: totalRevenue > 0 ? round((amount / totalRevenue) * 100, 1) : 0,
    }));

  // MTD revenue
  const thisMonth = now.toISOString().slice(0, 7);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toISOString()
    .slice(0, 7);
  const mtd = byMonth[thisMonth] ?? 0;
  const prevMtd = byMonth[lastMonth] ?? 0;
  const momGrowth = prevMtd > 0 ? round(((mtd - prevMtd) / prevMtd) * 100, 1) : null;

  const data = { months, topCustomers, mtd: round(mtd), prevMtd: round(prevMtd), momGrowth, totalRevenue: round(totalRevenue) };
  await saveReport(realmId, "revenue_analysis", data);
  return data;
}

// ─── Cash Flow Forecast ───────────────────────────────────────────────────────

async function calculateCashFlow(realmId: string, now: Date) {
  const [invoices, payments, expenses] = await Promise.all([
    db.select().from(cfoQbInvoices).where(eq(cfoQbInvoices.realmId, realmId)),
    db.select().from(cfoQbPayments).where(eq(cfoQbPayments.realmId, realmId)),
    db.select().from(cfoQbExpenses).where(eq(cfoQbExpenses.realmId, realmId)),
  ]);

  // Total payments received = cash in
  const totalReceived = payments.reduce((s, p) => s + Number(p.totalAmount ?? 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.totalAmount ?? 0), 0);

  // Estimate current cash as received - expenses (approximation without bank balance)
  const cashOnHand = Math.max(0, totalReceived - totalExpenses);

  // Monthly burn rate (last 3 months average)
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const recentExpenses = expenses.filter(
    (e) => e.expenseDate && e.expenseDate >= threeMonthsAgo.toISOString().slice(0, 10)
  );
  const burnRate = round(recentExpenses.reduce((s, e) => s + Number(e.totalAmount ?? 0), 0) / 3);

  // Upcoming inflows: unpaid invoices with due dates
  const future30 = dateStr(now, 30);
  const future60 = dateStr(now, 60);
  const future90 = dateStr(now, 90);
  const today = now.toISOString().slice(0, 10);

  const unpaidInvoices = invoices.filter((i) => i.status === "Open" && Number(i.balance ?? 0) > 0);

  const inflow30 = unpaidInvoices.filter((i) => i.dueDate && i.dueDate <= future30 && i.dueDate >= today).reduce((s, i) => s + Number(i.balance ?? 0), 0);
  const inflow60 = unpaidInvoices.filter((i) => i.dueDate && i.dueDate <= future60 && i.dueDate > future30).reduce((s, i) => s + Number(i.balance ?? 0), 0);
  const inflow90 = unpaidInvoices.filter((i) => i.dueDate && i.dueDate <= future90 && i.dueDate > future60).reduce((s, i) => s + Number(i.balance ?? 0), 0);

  const projected30 = round(cashOnHand + inflow30 - burnRate);
  const projected60 = round(projected30 + inflow60 - burnRate);
  const projected90 = round(projected60 + inflow90 - burnRate);

  const runwayMonths = burnRate > 0 ? round(cashOnHand / burnRate, 1) : null;

  const forecast = [
    { label: "Today", balance: round(cashOnHand) },
    { label: "+30d",  balance: projected30 },
    { label: "+60d",  balance: projected60 },
    { label: "+90d",  balance: projected90 },
  ];

  // Upcoming inflows list
  const upcomingInflows = unpaidInvoices
    .filter((i) => i.dueDate && i.dueDate >= today && i.dueDate <= future90)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    .slice(0, 10)
    .map((i) => ({
      id: i.qbId,
      invoiceNumber: i.invoiceNumber,
      customer: i.customerName,
      amount: round(Number(i.balance ?? 0)),
      dueDate: i.dueDate,
    }));

  const data = { cashOnHand: round(cashOnHand), burnRate, runwayMonths, forecast, upcomingInflows };
  await saveReport(realmId, "cash_flow", data);
  return data;
}

// ─── KPI Deep Dive ────────────────────────────────────────────────────────────

async function calculateKPI(realmId: string, now: Date) {
  const [invoices, payments, expenses] = await Promise.all([
    db.select().from(cfoQbInvoices).where(eq(cfoQbInvoices.realmId, realmId)),
    db.select().from(cfoQbPayments).where(eq(cfoQbPayments.realmId, realmId)),
    db.select().from(cfoQbExpenses).where(eq(cfoQbExpenses.realmId, realmId)),
  ]);

  const totalRevenue = invoices.reduce((s, i) => s + Number(i.totalAmount ?? 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.totalAmount ?? 0), 0);

  // Gross margin = (revenue - expenses) / revenue
  const grossMargin = totalRevenue > 0 ? round(((totalRevenue - totalExpenses) / totalRevenue) * 100, 1) : 0;

  // Monthly burn (last 3 months)
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const recentExp = expenses.filter(
    (e) => e.expenseDate && e.expenseDate >= threeMonthsAgo.toISOString().slice(0, 10)
  );
  const burnRate = round(recentExp.reduce((s, e) => s + Number(e.totalAmount ?? 0), 0) / 3);

  // AR Days (DSO) — average days from invoice date to payment
  let totalDays = 0, pairedCount = 0;
  for (const payment of payments) {
    if (!payment.paymentDate) continue;
    const invoiceIds = (payment.invoiceIds as string[]) ?? [];
    for (const invId of invoiceIds) {
      const inv = invoices.find((i) => i.qbId === invId);
      if (inv?.txnDate) {
        const days = daysBetween(inv.txnDate, payment.paymentDate!);
        if (days >= 0 && days < 365) {
          totalDays += days;
          pairedCount++;
        }
      }
    }
  }
  const arDays = pairedCount > 0 ? Math.round(totalDays / pairedCount) : null;

  // Expense breakdown by category
  const byCategory: Record<string, number> = {};
  for (const e of expenses) {
    const cat = e.category ?? "Other";
    byCategory[cat] = (byCategory[cat] ?? 0) + Number(e.totalAmount ?? 0);
  }
  const expenseBreakdown = Object.entries(byCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([category, amount]) => ({
      category,
      amount: round(amount),
      pct: totalExpenses > 0 ? round((amount / totalExpenses) * 100, 1) : 0,
    }));

  // Month-over-month margin trend (last 6 months)
  const monthlyRevenue: Record<string, number> = {};
  const monthlyExpenses: Record<string, number> = {};
  for (const i of invoices) {
    if (i.txnDate) {
      const m = i.txnDate.slice(0, 7);
      monthlyRevenue[m] = (monthlyRevenue[m] ?? 0) + Number(i.totalAmount ?? 0);
    }
  }
  for (const e of expenses) {
    if (e.expenseDate) {
      const m = e.expenseDate.slice(0, 7);
      monthlyExpenses[m] = (monthlyExpenses[m] ?? 0) + Number(e.totalAmount ?? 0);
    }
  }
  const marginTrend = Object.keys(monthlyRevenue)
    .sort()
    .slice(-6)
    .map((month) => {
      const rev = monthlyRevenue[month] ?? 0;
      const exp = monthlyExpenses[month] ?? 0;
      return { month, grossMargin: rev > 0 ? round(((rev - exp) / rev) * 100, 1) : 0 };
    });

  const data = { grossMargin, burnRate, arDays, totalRevenue: round(totalRevenue), totalExpenses: round(totalExpenses), expenseBreakdown, marginTrend };
  await saveReport(realmId, "kpi", data);
  return data;
}

// ─── Risk Assessment ──────────────────────────────────────────────────────────

async function calculateRisk(realmId: string, now: Date) {
  const [invoices, expenses] = await Promise.all([
    db.select().from(cfoQbInvoices).where(eq(cfoQbInvoices.realmId, realmId)),
    db.select().from(cfoQbExpenses).where(eq(cfoQbExpenses.realmId, realmId)),
  ]);

  const today = now.toISOString().slice(0, 10);

  // Overdue invoices (balance > 0, due date in past)
  const overdueInvoices = invoices
    .filter((i) => i.status === "Open" && Number(i.balance ?? 0) > 0 && i.dueDate && i.dueDate < today)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    .map((i) => ({
      id: i.qbId,
      invoiceNumber: i.invoiceNumber,
      customer: i.customerName,
      amount: round(Number(i.balance ?? 0)),
      dueDate: i.dueDate,
      daysOverdue: daysBetween(i.dueDate!, today),
    }));

  const totalOverdue = overdueInvoices.reduce((s, i) => s + i.amount, 0);

  // Expense spikes — compare last 30 days vs previous 30 days by category
  const last30Start = dateStr(now, -30);
  const prev30Start = dateStr(now, -60);

  const recentExpenses: Record<string, number> = {};
  const prevExpenses: Record<string, number> = {};

  for (const e of expenses) {
    const cat = e.category ?? "Other";
    const d = e.expenseDate ?? "";
    if (d >= last30Start && d <= today) {
      recentExpenses[cat] = (recentExpenses[cat] ?? 0) + Number(e.totalAmount ?? 0);
    } else if (d >= prev30Start && d < last30Start) {
      prevExpenses[cat] = (prevExpenses[cat] ?? 0) + Number(e.totalAmount ?? 0);
    }
  }

  const expenseSpikes = Object.entries(recentExpenses)
    .map(([category, current]) => {
      const previous = prevExpenses[category] ?? 0;
      const changePct = previous > 0 ? round(((current - previous) / previous) * 100, 1) : null;
      return { category, current: round(current), previous: round(previous), changePct };
    })
    .filter((s) => s.changePct !== null && s.changePct > 20)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))
    .slice(0, 5);

  // Revenue concentration (top customer %)
  const byCustomer: Record<string, number> = {};
  for (const inv of invoices) {
    const c = inv.customerName ?? "Unknown";
    byCustomer[c] = (byCustomer[c] ?? 0) + Number(inv.totalAmount ?? 0);
  }
  const totalRevenue = Object.values(byCustomer).reduce((s, v) => s + v, 0);
  const topCustomerPct = totalRevenue > 0
    ? round((Math.max(...Object.values(byCustomer)) / totalRevenue) * 100, 1)
    : 0;

  // Build risk list
  const risks: RiskItem[] = [];
  if (overdueInvoices.length > 0) {
    risks.push({
      kind: "neg",
      tag: "AR Risk",
      title: `${overdueInvoices.length} overdue invoice${overdueInvoices.length > 1 ? "s" : ""}`,
      body: `$${totalOverdue.toLocaleString()} outstanding. Oldest: ${overdueInvoices[0]?.customer} — ${overdueInvoices[0]?.daysOverdue} days late.`,
    });
  }
  for (const spike of expenseSpikes.slice(0, 2)) {
    risks.push({
      kind: "warn",
      tag: "Expense",
      title: `${spike.category} up ${spike.changePct}% this month`,
      body: `$${spike.current.toLocaleString()} vs $${spike.previous.toLocaleString()} last period.`,
    });
  }
  if (topCustomerPct > 40) {
    risks.push({
      kind: "warn",
      tag: "Concentration",
      title: "High revenue concentration",
      body: `Top customer accounts for ${topCustomerPct}% of total revenue.`,
    });
  }

  const data = { overdueInvoices: overdueInvoices.slice(0, 10), totalOverdue: round(totalOverdue), expenseSpikes, topCustomerPct, risks };
  await saveReport(realmId, "risk", data);
  return data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function saveReport(realmId: string, reportType: string, data: unknown) {
  // Delete old cached report of this type, then insert fresh
  await db
    .delete(cfoCalculatedReports)
    .where(
      and(
        eq(cfoCalculatedReports.realmId, realmId),
        eq(cfoCalculatedReports.reportType, reportType)
      )
    );

  await db.insert(cfoCalculatedReports).values({
    realmId,
    reportType,
    data,
    calculatedAt: new Date(),
  });
}

function round(n: number, dp = 0): number {
  return Number(n.toFixed(dp));
}

function dateStr(from: Date, offsetDays: number): string {
  const d = new Date(from);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000);
}

interface RiskItem {
  kind: "pos" | "warn" | "neg";
  tag: string;
  title: string;
  body: string;
}

// Re-export individual calculations so API routes can call them directly
export { calculateRevenue, calculateCashFlow, calculateKPI, calculateRisk };
