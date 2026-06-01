"use client";

import { usePathname } from "next/navigation";
import { I } from "@/components/icons";
import { useApp } from "@/lib/app-context";
import { MOCK } from "@/lib/mock";

const ROUTE_LABEL: Record<string, string> = {
  "/":                "Dashboard",
  "/dashboard":       "Dashboard",
  "/revenue":         "Revenue Analysis",
  "/cashflow":        "Cash Flow Forecast",
  "/kpi":             "KPI Deep Dive",
  "/risk":            "Risk Assessment",
  "/invoices":        "Invoices",
  "/customers":       "Customers",
  "/settings":        "Settings",
  "/customer":        "Overview",
  "/admin":           "Overview",
  "/admin/users":     "Users",
  "/admin/logs":      "AI Logs",
  "/admin/settings":  "Platform",
};

export function Topbar() {
  const { role, chatOpen, openChat } = useApp();
  const pathname = usePathname();
  const here = ROUTE_LABEL[pathname] ?? "—";
  const tenant = role === "super_admin" ? "Platform" : role === "company" ? MOCK.company.name : "Acme Holdings";

  return (
    <header className="topbar">
      <div className="crumbs">
        <span>{tenant}</span>
        <I.Chevron size={11} />
        <span className="here">{here}</span>
      </div>

      <div className="topbar-right">
        <div className="search">
          <I.Search size={13} />
          <input placeholder="Search…" />
          <span className="kbd">⌘K</span>
        </div>
        <button className="btn btn-ghost btn-sm" title="Notifications" style={{ position: "relative" }}>
          <I.Bell size={14} />
          <span style={{ position: "absolute", top: 4, right: 4, width: 6, height: 6, borderRadius: 99, background: "var(--accent-2)" }} />
        </button>
        {!chatOpen && (
          <button className="btn btn-sm" onClick={openChat}>
            <I.Sparkle size={13} /> Ask CFO
          </button>
        )}
      </div>
    </header>
  );
}
