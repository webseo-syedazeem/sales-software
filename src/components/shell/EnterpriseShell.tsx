"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Package,
  Warehouse,
  Users,
  ShoppingCart,
  BookOpen,
  Truck,
  Landmark,
  GitBranch,
  BrainCircuit,
  ShieldCheck,
  Search,
  Bell,
  LogOut,
  Sun,
  Moon,
  Building2,
  Menu,
  X,
  Database,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { SafeUser } from "@/types/erp";
import { formatUSD, formatUSDate } from "@/lib/utils";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { ExecutiveDashboard, type ClientERPState } from "@/components/modules/ExecutiveDashboard";
import { ProductsModule } from "@/components/modules/ProductsModule";
import { InventoryModule } from "@/components/modules/InventoryModule";
import { CustomersCRMModule } from "@/components/modules/CustomersCRMModule";
import { SalesInvoicingModule } from "@/components/modules/SalesInvoicingModule";
import { LedgerReceivablesPaymentsModule } from "@/components/modules/LedgerReceivablesPaymentsModule";
import { PurchasingPayablesModule } from "@/components/modules/PurchasingPayablesModule";
import { AccountingExpensesTaxModule } from "@/components/modules/AccountingExpensesTaxModule";
import { OperationsWorkforceModule } from "@/components/modules/OperationsWorkforceModule";
import { AnalyticsAIModule } from "@/components/modules/AnalyticsAIModule";
import { AdminSecurityModule } from "@/components/modules/AdminSecurityModule";
import { Modal, StatusBadge } from "@/components/ui/Primitives";

const NAV_GROUPS = [
  {
    group: "Executive",
    items: [
      { id: "dashboard", label: "Executive Dashboard", icon: LayoutDashboard },
      { id: "analytics", label: "Analytics & NexAI", icon: BrainCircuit },
    ],
  },
  {
    group: "Commerce & Supply",
    items: [
      { id: "products", label: "Product Master", icon: Package },
      { id: "inventory", label: "Inventory & Warehouses", icon: Warehouse },
      { id: "customers", label: "Customers & CRM", icon: Users },
      { id: "sales", label: "Sales & US Invoicing", icon: ShoppingCart },
    ],
  },
  {
    group: "Financial Core",
    items: [
      { id: "ledger", label: "Customer Ledger & AR", icon: BookOpen },
      { id: "purchasing", label: "Suppliers, PO & AP", icon: Truck },
      { id: "accounting", label: "Accounting, Exp & Tax", icon: Landmark },
    ],
  },
  {
    group: "Enterprise Governance",
    items: [
      { id: "operations", label: "Approvals, Branches & HR", icon: GitBranch },
      { id: "admin", label: "Security, Audit & Admin", icon: ShieldCheck },
    ],
  },
];

export function EnterpriseShell() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<SafeUser | null>(null);
  const [state, setState] = useState<ClientERPState | null>(null);
  const [storageMode, setStorageMode] = useState("local-seeded");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [lightTheme, setLightTheme] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Global Search Palette (Section 21)
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
  const [searchStatusFilter, setSearchStatusFilter] = useState("ALL");

  // Notifications Popover (Section 22)
  const [notifOpen, setNotifOpen] = useState(false);

  // Toast Stack
  const [toasts, setToasts] = useState<Array<{ id: number; text: string; type: "ok" | "err" }>>([]);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushToast = useCallback((text: string, type: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const loadBootstrap = useCallback(async () => {
    const res = await fetch("/api/erp/bootstrap", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setState(data.state);
      setStorageMode(data.storage?.mode || "local-seeded");
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();
        setStorageMode(data.storage?.mode || "local-seeded");
        if (data.authenticated && data.user) {
          setUser(data.user);
          await loadBootstrap();
        }
      } finally {
        setBooting(false);
      }
    })();
  }, [loadBootstrap]);

  // Ctrl+K / Cmd+K Global Search Shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleLogout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setState(null);
  }, []);

  // Automatic Idle Logout Security Protocol
  useEffect(() => {
    if (!user || !state) return;
    const timeoutMs = (state.settings.sessionTimeoutMinutes || 30) * 60 * 1000;

    const resetIdle = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        pushToast("Session expired due to inactivity.", "err");
        handleLogout();
      }, timeoutMs);
    };

    const events = ["mousemove", "keydown", "click", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, resetIdle));
    resetIdle();

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetIdle));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [user, state, handleLogout, pushToast]);

  const runAction = useCallback(
    async (action: string, payload?: Record<string, unknown>) => {
      try {
        const res = await fetch("/api/erp/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, payload }),
        });
        const data = await res.json();
        if (!res.ok) {
          pushToast(data.error || "Action blocked or failed.", "err");
          return;
        }
        if (data.state) setState(data.state);
        if (data.message) pushToast(data.message, "ok");
        return data.extraData as Record<string, unknown> | undefined;
      } catch {
        pushToast("Network error while communicating with ERP server.", "err");
      }
    },
    [pushToast]
  );

  // Global Search Results (Section 21)
  const searchResults = useMemo(() => {
    if (!state) return [];
    const q = globalQuery.trim().toLowerCase();
    const results: Array<{
      kind: string;
      title: string;
      subtitle: string;
      status: string;
      amount?: string;
      tab: string;
    }> = [];

    state.customers.forEach((c) => {
      if (!q || c.companyName.toLowerCase().includes(q) || c.customerCode.toLowerCase().includes(q)) {
        results.push({
          kind: "Customer",
          title: c.companyName,
          subtitle: `${c.customerCode} · ${c.contactPerson} (${c.state})`,
          status: c.segment,
          amount: formatUSD(c.currentBalance),
          tab: "customers",
        });
      }
    });

    state.products.forEach((p) => {
      if (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.includes(q)) {
        results.push({
          kind: "Product",
          title: p.name,
          subtitle: `${p.sku} · ${p.category}`,
          status: p.status,
          amount: formatUSD(p.sellingPrice),
          tab: "products",
        });
      }
    });

    state.invoices.forEach((i) => {
      const cust = state.customers.find((c) => c.id === i.customerId)?.companyName || "";
      if (
        (!q || i.invoiceNo.toLowerCase().includes(q) || cust.toLowerCase().includes(q)) &&
        (searchStatusFilter === "ALL" || i.status === searchStatusFilter)
      ) {
        results.push({
          kind: "Invoice",
          title: `${i.invoiceNo} — ${cust}`,
          subtitle: `Issued ${formatUSDate(i.issueDate)} · Due ${formatUSDate(i.dueDate)}`,
          status: i.status,
          amount: formatUSD(i.total),
          tab: "sales",
        });
      }
    });

    state.payments.forEach((p) => {
      const cust = state.customers.find((c) => c.id === p.customerId)?.companyName || "";
      if (!q || p.receiptNo.toLowerCase().includes(q) || cust.toLowerCase().includes(q) || p.reference.toLowerCase().includes(q)) {
        results.push({
          kind: "Payment",
          title: `${p.receiptNo} — ${cust}`,
          subtitle: `${p.method} · ${formatUSDate(p.date)}`,
          status: p.reconciled ? "Reconciled" : "Pending",
          amount: formatUSD(p.amount),
          tab: "ledger",
        });
      }
    });

    return results.slice(0, 18);
  }, [state, globalQuery, searchStatusFilter]);

  if (booting) {
    return (
      <div className="min-h-screen enterprise-mesh flex flex-col items-center justify-center gap-3 text-slate-300">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 animate-pulse" />
        <p className="text-xs font-semibold uppercase tracking-[0.2em]">
          Initializing ApexLedger Enterprise Security...
        </p>
      </div>
    );
  }

  if (!user || !state) {
    return (
      <LoginScreen
        storageMode={storageMode}
        onAuthenticated={async (authenticatedUser) => {
          setUser(authenticatedUser);
          await loadBootstrap();
        }}
      />
    );
  }

  const unreadNotifs = state.notifications.filter((n) => !n.read).length;

  return (
    <div className={lightTheme ? "theme-light" : ""}>
      <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] enterprise-mesh flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex lg:w-68 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 backdrop-blur-xl no-print sticky top-0 h-screen">
          <div className="flex items-center gap-3 px-5 py-5 border-b border-[var(--border-subtle)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-600/25">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-extrabold tracking-tight truncate">
                ApexLedger <span className="text-blue-400">ERP</span>
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] truncate">
                {state.settings.currency} Enterprise Suite
              </p>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
            {NAV_GROUPS.map((grp) => (
              <div key={grp.group}>
                <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  {grp.group}
                </p>
                <div className="space-y-1">
                  {grp.items.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`relative w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                          active
                            ? "text-white"
                            : "text-[var(--text-secondary)] hover:bg-blue-500/10 hover:text-[var(--text-primary)]"
                        }`}
                      >
                        {active && (
                          <motion.div
                            layoutId="activeNavPill"
                            className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 shadow-md shadow-blue-600/25"
                            transition={{ type: "spring", stiffness: 360, damping: 30 }}
                          />
                        )}
                        <Icon className="relative z-10 h-4 w-4 shrink-0" />
                        <span className="relative z-10 truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer User & DB Badge */}
          <div className="border-t border-[var(--border-subtle)] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between rounded-xl bg-[var(--bg-elevated)] px-3 py-2 text-[11px] border border-[var(--border-subtle)]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-400">
                <Database className="h-3.5 w-3.5" />
                {storageMode === "mongodb" ? "MongoDB Atlas" : "Local Seeded"}
              </span>
              <span className="font-mono-num text-[10px] text-[var(--text-muted)]">TLS · JWT</span>
            </div>

            <div className="flex items-center justify-between gap-2 px-1">
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{user.name}</p>
                <p className="text-[10px] text-blue-400 font-semibold">{user.role}</p>
              </div>
              <button
                onClick={handleLogout}
                title="Sign Out"
                className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-rose-500/15 hover:text-rose-400 transition-colors cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Column */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Top Executive Utility Bar */}
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/85 backdrop-blur-xl px-4 sm:px-6 py-3 no-print">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden rounded-lg p-2 text-[var(--text-secondary)] hover:bg-slate-800/60 cursor-pointer"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>

              {/* Global Enterprise Search Trigger */}
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3.5 py-2 text-xs text-[var(--text-secondary)] hover:border-blue-500/50 transition-colors w-48 sm:w-80 cursor-pointer"
              >
                <Search className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span className="truncate flex-1 text-left">
                  Search customers, SKUs, invoices, payments...
                </span>
                <kbd className="hidden sm:inline-block rounded bg-slate-800 px-1.5 py-0.5 font-mono-num text-[10px] text-slate-300">
                  ⌘K
                </kbd>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden xl:inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                {state.settings.activeCompany}
              </span>

              <button
                onClick={() => setLightTheme((v) => !v)}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2 text-[var(--text-secondary)] hover:text-blue-400 transition-colors cursor-pointer"
                title="Toggle Executive Dark / Light Theme"
              >
                {lightTheme ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>

              {/* Notifications Bell */}
              <div className="relative">
                <button
                  onClick={() => setNotifOpen((v) => !v)}
                  className="relative rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2 text-[var(--text-secondary)] hover:text-blue-400 transition-colors cursor-pointer"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  {unreadNotifs > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {unreadNotifs}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {notifOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.97 }}
                      className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-card-solid)] shadow-2xl overflow-hidden z-50"
                    >
                      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
                        <span className="text-xs font-bold uppercase tracking-wider">
                          Enterprise Alerts ({unreadNotifs})
                        </span>
                        <button
                          onClick={() => runAction("notification:read", { id: "all" })}
                          className="text-[11px] font-semibold text-blue-400 hover:underline cursor-pointer"
                        >
                          Mark all read
                        </button>
                      </div>
                      <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border-subtle)]">
                        {state.notifications.slice(0, 8).map((n) => (
                          <div
                            key={n.id}
                            onClick={() => {
                              runAction("notification:read", { id: n.id });
                              if (n.actionModule) {
                                const map: Record<string, string> = {
                                  inventory: "inventory",
                                  receivables: "ledger",
                                  approvals: "operations",
                                  sales: "sales",
                                  customers: "customers",
                                  payments: "ledger",
                                };
                                setActiveTab(map[n.actionModule] || "dashboard");
                              }
                              setNotifOpen(false);
                            }}
                            className={`px-4 py-3 text-xs cursor-pointer hover:bg-blue-500/10 ${
                              !n.read ? "bg-blue-500/5" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-[var(--text-primary)]">{n.title}</span>
                              <StatusBadge status={n.severity} />
                            </div>
                            <p className="text-[var(--text-secondary)] mt-1">{n.message}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </header>

          {/* Active Module Canvas */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                {activeTab === "dashboard" && (
                  <ExecutiveDashboard
                    state={state}
                    user={user}
                    onNavigate={setActiveTab}
                    onRunAction={async (a, p) => {
                      await runAction(a, p);
                    }}
                  />
                )}
                {activeTab === "products" && (
                  <ProductsModule
                    state={state}
                    onRunAction={async (a, p) => {
                      await runAction(a, p);
                    }}
                  />
                )}
                {activeTab === "inventory" && (
                  <InventoryModule
                    state={state}
                    onRunAction={async (a, p) => {
                      await runAction(a, p);
                    }}
                  />
                )}
                {activeTab === "customers" && (
                  <CustomersCRMModule
                    state={state}
                    onNavigate={setActiveTab}
                    onRunAction={async (a, p) => {
                      await runAction(a, p);
                    }}
                  />
                )}
                {activeTab === "sales" && (
                  <SalesInvoicingModule
                    state={state}
                    onRunAction={async (a, p) => {
                      await runAction(a, p);
                    }}
                  />
                )}
                {activeTab === "ledger" && (
                  <LedgerReceivablesPaymentsModule
                    state={state}
                    onRunAction={async (a, p) => {
                      await runAction(a, p);
                    }}
                  />
                )}
                {activeTab === "purchasing" && (
                  <PurchasingPayablesModule
                    state={state}
                    onRunAction={async (a, p) => {
                      await runAction(a, p);
                    }}
                  />
                )}
                {activeTab === "accounting" && (
                  <AccountingExpensesTaxModule
                    state={state}
                    onRunAction={async (a, p) => {
                      await runAction(a, p);
                    }}
                  />
                )}
                {activeTab === "operations" && (
                  <OperationsWorkforceModule
                    state={state}
                    onRunAction={async (a, p) => {
                      await runAction(a, p);
                    }}
                  />
                )}
                {activeTab === "analytics" && <AnalyticsAIModule state={state} />}
                {activeTab === "admin" && (
                  <AdminSecurityModule
                    state={state}
                    storageMode={storageMode}
                    onRunAction={runAction}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        {/* Mobile Drawer Navigation */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-50 lg:hidden flex">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileMenuOpen(false)}
                className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
              />
              <motion.aside
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                className="relative z-10 w-72 bg-[var(--bg-surface)] h-full flex flex-col border-r border-[var(--border-strong)] p-4 overflow-y-auto"
              >
                <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
                  <span className="font-extrabold text-base">
                    ApexLedger <span className="text-blue-400">ERP</span>
                  </span>
                  <button onClick={() => setMobileMenuOpen(false)} className="p-1.5">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-4 space-y-4">
                  {NAV_GROUPS.map((grp) => (
                    <div key={grp.group}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">
                        {grp.group}
                      </p>
                      {grp.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              setActiveTab(item.id);
                              setMobileMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold ${
                              activeTab === item.id ? "bg-blue-600 text-white" : "text-[var(--text-secondary)]"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </motion.aside>
            </div>
          )}
        </AnimatePresence>

        {/* Global Enterprise Search Modal (Section 21) */}
        <Modal
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          title="Global Enterprise Search"
          subtitle="Search customers, products, invoices, payments, orders, and ledger records simultaneously."
          maxWidth="max-w-3xl"
        >
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                autoFocus
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                placeholder="Type SKU, customer name, invoice # (e.g. Acrylic, Horizon, INV-2026)..."
                className="erp-input flex-1"
              />
              <select
                value={searchStatusFilter}
                onChange={(e) => setSearchStatusFilter(e.target.value)}
                className="erp-input sm:w-44 text-xs"
              >
                <option value="ALL">All Statuses</option>
                <option value="Overdue">Overdue Only</option>
                <option value="Paid">Paid</option>
                <option value="Sent">Sent / Open</option>
                <option value="Partial">Partial</option>
              </select>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-[var(--border-subtle)]">
              {searchResults.map((r, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setActiveTab(r.tab);
                    setSearchOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-3 py-3 px-2 text-left hover:bg-blue-500/10 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-blue-400">
                        {r.kind}
                      </span>
                      <p className="text-xs font-bold text-[var(--text-primary)] truncate">{r.title}</p>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{r.subtitle}</p>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    {r.amount && <span className="font-mono-num text-xs font-bold">{r.amount}</span>}
                    <StatusBadge status={r.status} />
                  </div>
                </button>
              ))}
              {searchResults.length === 0 && (
                <p className="py-8 text-center text-xs text-[var(--text-muted)]">
                  No matching enterprise records found.
                </p>
              )}
            </div>
          </div>
        </Modal>

        {/* Animated Toast Stack */}
        <div className="fixed bottom-4 right-4 z-50 space-y-2 no-print max-w-sm">
          <AnimatePresence>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.96 }}
                className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-semibold shadow-2xl backdrop-blur-xl ${
                  t.type === "ok"
                    ? "border-emerald-500/40 bg-slate-900/95 text-emerald-300"
                    : "border-rose-500/40 bg-slate-900/95 text-rose-300"
                }`}
              >
                {t.type === "ok" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span>{t.text}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
