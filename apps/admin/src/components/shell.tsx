"use client";

import {
  BarChart3, Boxes, ChevronRight, Headphones, Images, LayoutDashboard, LogOut, Megaphone, Moon, Package,
  Search, Settings, ShoppingCart, Sun, Tag, Truck, Undo2, Users, type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "./session";

type NavItem = { label: string; icon: LucideIcon; href?: string; milestone?: string };

// Kleawip-only menu (docs/research/SHOPIFY_ADMIN_REFERENCE.md §1). Items without href are later milestones.
const NAV: NavItem[] = [
  { label: "Overview", icon: LayoutDashboard, milestone: "Milestone 1 · soon" },
  { label: "Orders", icon: ShoppingCart, milestone: "Milestone 2" },
  { label: "Products", icon: Package, href: "/products" },
  { label: "Inventory", icon: Boxes, milestone: "API ready · screen soon" },
  { label: "Media", icon: Images, milestone: "API ready · screen soon" },
  { label: "Campaigns", icon: Megaphone, milestone: "API ready · screen soon" },
  { label: "Customers", icon: Users, milestone: "Milestone 2" },
  { label: "Promotions", icon: Tag, milestone: "Milestone 2" },
  { label: "Returns & Refunds", icon: Undo2, milestone: "Milestone 3" },
  { label: "Support Desk", icon: Headphones, milestone: "Milestone 3" },
  { label: "Shipping", icon: Truck, milestone: "Milestone 2" },
  { label: "Reports", icon: BarChart3, milestone: "Milestone 3" },
];

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  catalogue_manager: "Catalogue manager",
  marketing_editor: "Marketing editor",
  operations: "Operations",
  support: "Support",
  viewer: "Viewer",
};

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("kleawip-admin-theme");
      if (saved === "dark") setTheme("dark");
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("kleawip-admin-theme", theme);
    } catch {}
  }, [theme]);
  return [theme, () => setTheme((current) => (current === "light" ? "dark" : "light"))] as const;
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { staff, signOut } = useSession();
  const [theme, toggleTheme] = useTheme();
  const [query, setQuery] = useState("");

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/products" className="brand">
          <Image src="/Kleawip-logo.webp" alt="Kleawip" width={116} height={32} priority />
          <span>Operations</span>
        </Link>
        <nav aria-label="Admin">
          {NAV.map(({ label, icon: Icon, href, milestone }) =>
            href ? (
              <Link key={label} href={href} className={`nav-item${pathname.startsWith(href) ? " active" : ""}`}>
                <Icon size={16} aria-hidden />
                {label}
              </Link>
            ) : (
              <span key={label} className="nav-item disabled" aria-disabled="true" title={milestone}>
                <Icon size={16} aria-hidden />
                {label}
                <small>{milestone?.startsWith("API") ? "Soon" : milestone?.replace("Milestone ", "M")}</small>
              </span>
            ),
          )}
        </nav>
        <div className="sidebar-foot">
          <span className="nav-item disabled" aria-disabled="true" title="Settings arrive with staff management">
            <Settings size={16} aria-hidden /> Settings <small>Soon</small>
          </span>
          <div className="staff-card">
            <span className="avatar" aria-hidden>{staff.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
            <span>
              <strong>{staff.name}</strong>
              <small>{ROLE_LABEL[staff.role] ?? staff.role}</small>
            </span>
            <button className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <form
            className="top-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              router.push(`/products?q=${encodeURIComponent(query)}`);
            }}
          >
            <Search size={15} aria-hidden />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products by title or SKU" aria-label="Search products" />
          </form>
          <span className="env-pill" title="This admin is running against the local development database">
            <i aria-hidden /> Local development
          </span>
          <button className="icon-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={item.label}>
          {index > 0 && <ChevronRight size={12} aria-hidden />}
          {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

