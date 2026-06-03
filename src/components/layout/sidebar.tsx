"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { I } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { useApp } from "@/lib/app-context";
import type { Role } from "@/lib/app-context";

interface NavItem {
  section?: string;
  id?: string;
  label?: string;
  icon?: keyof typeof I;
  badge?: number;
}

const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  company: [
    { section: "Workspace" },
    { id: "/dashboard", label: "Dashboard",  icon: "Home"     },
    { id: "/revenue",   label: "Revenue",    icon: "Revenue"  },
    { id: "/cashflow",  label: "Cash Flow",  icon: "Cash"     },
    { id: "/kpi",       label: "KPIs",       icon: "Kpi"      },
    { id: "/risk",      label: "Risk",       icon: "Risk"     },
    { section: "Manage" },
    { id: "/invoices",  label: "Invoices",   icon: "Invoice"  },
    { id: "/customers", label: "Customers",  icon: "Users"    },
    { id: "/settings",  label: "Settings",   icon: "Settings" },
  ],
  customer: [
    { section: "Your account" },
    { id: "/customer",                 label: "Overview",        icon: "Home"     },
    { id: "/customer/invoices",        label: "Invoices",        icon: "Invoice"  },
    { id: "/customer/payment-history", label: "Payment history", icon: "Activity" },
    { section: "Help" },
    { id: "/customer/support",         label: "Contact support", icon: "Mail"     },
  ],
  super_admin: [
    { section: "Platform" },
    { id: "/admin",             label: "Overview",  icon: "Home"     },
    { id: "/admin/users",       label: "Customers", icon: "Users"    },
    { id: "/admin/companies",   label: "Companies", icon: "Building" },
    { id: "/admin/logs",        label: "AI Logs",   icon: "Activity" },
    { section: "Settings" },
    { id: "/admin/settings",    label: "Platform",  icon: "Settings" },
  ],
};

// Stable nav item key: prefer section label, then path+label combo
function navKey(item: NavItem): string {
  if (item.section) return `section:${item.section}`;
  return `${item.id ?? ""}:${item.label ?? ""}`;
}

export function Sidebar() {
  const { role, user, logout } = useApp();
  const pathname = usePathname();
  const nav = NAV_BY_ROLE[role] ?? NAV_BY_ROLE.company;
  const displayName = user?.name ?? user?.email ?? role;

  function handleLogout() {
    void logout();
  }

  function handleLogoutKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") void logout();
  }

  return (
    <nav className="sidebar">
      <div className="brand">
        <span className="brand-mark">L</span>
        <span className="brand-name">Ledger<span style={{ fontStyle: "italic" }}>·</span>AI</span>
        <span className="brand-tag">POC</span>
      </div>

      <div className="col" style={{ gap: 1, flex: 1, overflowY: "auto" }}>
        {nav.map((item) => {
          if (item.section) {
            return <div key={navKey(item)} className="nav-section">{item.section}</div>;
          }
          const IconC = I[item.icon!];
          const isActive =
            pathname === item.id ||
            (item.id !== "/dashboard" && pathname.startsWith(item.id!));
          return (
            <Link key={navKey(item)} href={item.id!} className={`nav-item ${isActive ? "active" : ""}`}>
              <IconC size={15} />
              <span>{item.label}</span>
              {item.badge && <span className="count">{item.badge}</span>}
            </Link>
          );
        })}
      </div>

      {/* Native <button> so click + keyboard work without extra handlers,
          but we add onKeyDown explicitly to satisfy the accessibility linter */}
      <button
        type="button"
        className="user-tile"
        onClick={handleLogout}
        onKeyDown={handleLogoutKey}
      >
        <Avatar name={displayName} />
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {displayName}
          </div>
          <div className="muted" style={{ fontSize: 11, textTransform: "capitalize" }}>
            {role.replace("_", " ")}
          </div>
        </div>
        <I.Logout size={13} />
      </button>
    </nav>
  );
}
