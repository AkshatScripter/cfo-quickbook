"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppProvider, useApp } from "@/lib/app-context";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ChatPanel } from "@/components/layout/chat-panel";
import { I } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";

// Routes that belong to each role
const COMPANY_PATHS = ["/dashboard", "/revenue", "/cashflow", "/kpi", "/risk", "/invoices", "/customers", "/settings"];
const ADMIN_PATHS   = ["/admin"];
const CUSTOMER_PATHS = ["/customer", "/customer/invoices", "/customer/payment-history", "/customer/support"];

function DashboardShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const { chatOpen, openChat, role, isLoading } = useApp();
  const pathname = usePathname();
  const router = useRouter();

  // Once auth has resolved, redirect to role-appropriate home if on wrong section
  useEffect(() => {
    if (isLoading) return;

    const onCompanyPath = COMPANY_PATHS.some(p => pathname === p || pathname.startsWith(p + "/"));
    const onAdminPath   = ADMIN_PATHS.some(p => pathname === p || pathname.startsWith(p + "/"));
    const onCustomerPath = CUSTOMER_PATHS.some(p => pathname === p || pathname.startsWith(p + "/"));

    if (onCompanyPath && role !== "company") {
      router.replace(role === "super_admin" ? "/admin" : "/customer");
    } else if (onAdminPath && role !== "super_admin") {
      router.replace(role === "customer" ? "/customer" : "/dashboard");
    } else if (onCustomerPath && role !== "customer") {
      router.replace(role === "super_admin" ? "/admin" : "/dashboard");
    }
  }, [isLoading, role, pathname, router]);

  // Show a spinner while auth loads — avoids a flash of wrong-role content
  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 14 }}>
        <Spinner size="md" />
        <span className="muted" style={{ fontSize: 13 }}>Loading…</span>
      </div>
    );
  }

  return (
    <div className="app" data-chat={chatOpen ? "open" : "closed"}>
      <Sidebar />
      <main className="main">
        <Topbar />
        <div className="main-scroll scroll">
          {children}
        </div>
      </main>
      <ChatPanel />
      {!chatOpen && (
        <button type="button" className="chat-fab" onClick={openChat}>
          <I.Sparkle size={14} /> Ask CFO
        </button>
      )}
    </div>
  );
}

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AppProvider>
      <DashboardShell>{children}</DashboardShell>
    </AppProvider>
  );
}
