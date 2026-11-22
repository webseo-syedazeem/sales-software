"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid,
  ShoppingCart,
  FileText,
  Users,
  BookOpen,
  Calculator,
  Package,
  Warehouse,
  Truck,
  BarChart3,
  ShieldCheck,
  Search,
  Bell,
  LogOut,
  Building2,
  Sparkles,
  Filter,
  X,
  Send,
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

const AI_QUICK_QUESTIONS = [
  "Which products generated the highest revenue this month?",
  "Which customers have overdue payments?",
  "Show me sales compared with last month.",
  "Which products are running low?",
  "Who are our top 10 customers?",
  "Why did sales change this month?",
];

const SCREEN_TITLES: Record<string, string> = {
  dashboard: "Executive dashboard",
  sales: "Sales orders",
  invoices: "Invoices",
  customers: "Customers & CRM",
  ledger: "Customer ledger & receivables",
  accounting: "Accounting & tax",
  products: "Products",
  inventory: "Inventory",
  purchasing: "Purchasing & payables",
  operations: "Approvals & operations",
  analytics: "Reports & analytics",
  admin: "Administration & security",
};

export function EnterpriseShell() {
  const [booting, setBooting] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [user, setUser] = useState<SafeUser | null>(null);
  const [state, setState] = useState<ClientERPState | null>(null);
  const [storageMode, setStorageMode] = useState("local-dev");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [branchFilter, setBranchFilter] = useState("all");

  // Global Search Modal
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
  const [searchType, setSearchType] = useState("All");

  // Notifications Dropdown
  const [notifOpen, setNotifOpen] = useState(false);

  // Nexora Slide-Over Ask AI Drawer
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMsgs, setAiMsgs] = useState<
    Array<{ role: "user" | "bot"; text: string; highlights?: Array<{ label: string; value: string }> }>
  >([]);

  const [toasts, setToasts] = useState<Array<{ id: number; text: string; type: "ok" | "err" }>>([]);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushToast = useCallback((text: string, type: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const loadBootstrap = useCallback(async () => {
    const res = await fetch("/api/erp/bootstrap", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setState(data.state);
      setStorageMode(data.storage?.mode || "local-dev");
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();
        setStorageMode(data.storage?.mode || "local-dev");
        setSetupRequired(Boolean(data.setupRequired));
        if (data.error) setBootError(data.error);
        if (data.authenticated && data.user) {
          setUser(data.user);
          setAiMsgs([
            {
              role: "bot",
              text: `Hi ${data.user.name.split(" ")[0]} — ask me anything about live sales, stock, customers, overdue balances, or cash flow.`,
            },
          ]);
          await loadBootstrap();
        }
      } catch {
        setBootError("Unable to reach ERP backend service.");
      } finally {
        setBooting(false);
      }
    })();
  }, [loadBootstrap]);

  // Ctrl+K / Cmd+K Global Search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setAiOpen(false);
        setNotifOpen(false);
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

  // Idle Auto-Logout Security Protocol
  useEffect(() => {
    if (!user || !state) return;
    const timeoutMs = (state.settings.sessionTimeoutMinutes || 30) * 60 * 1000;
    const resetIdle = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        pushToast("Session signed out automatically due to inactivity.", "err");
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
          pushToast(data.error || "Action failed.", "err");
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

  const askDrawerAI = async (question: string) => {
    const q = question.trim();
    if (!q || aiLoading) return;
    setAiMsgs((prev) => [...prev, { role: "user", text: q }]);
    setAiInput("");
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: q }),
      });
      const data = await res.json();
      setAiMsgs((prev) => [
        ...prev,
        {
          role: "bot",
          text: data.answer || data.error || "Unable to compute live telemetry.",
          highlights: data.highlights,
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  // Live rail badge counts computed strictly from MongoDB
  const badges = useMemo(() => {
    if (!state) return { pendingOrders: 0, overdueInv: 0, lowStock: 0, pendingApprovals: 0 };
    const todayIso = new Date().toISOString().slice(0, 10);
    const pendingOrders = state.salesOrders.filter(
      (o) => o.status === "Pending" || o.status === "Processing" || o.status === "Draft"
    ).length;
    const overdueInv = state.invoices.filter(
      (i) => i.balanceDue > 0 && (i.status === "Overdue" || i.dueDate < todayIso)
    ).length;
    const lowStock = state.products.filter((p) => {
      const qty = state.inventoryLots
        .filter((l) => l.productId === p.id)
        .reduce((s, l) => s + l.availableStock, 0);
      return qty <= p.reorderLevel;
    }).length;
    const pendingApprovals = state.approvals.filter((a) => a.status === "Pending").length;
    return { pendingOrders, overdueInv, lowStock, pendingApprovals };
  }, [state]);

  // Global Search Results
  const searchResults = useMemo(() => {
    if (!state) return [];
    const q = globalQuery.trim().toLowerCase();
    const out: Array<{
      kind: string;
      ab: string;
      bg: string;
      fg: string;
      title: string;
      subtitle: string;
      amount?: string;
      tab: string;
    }> = [];

    if (searchType === "All" || searchType === "Customers") {
      state.customers.forEach((c) => {
        if (!q || c.companyName.toLowerCase().includes(q) || c.customerCode.toLowerCase().includes(q)) {
          out.push({
            kind: "Customer",
            ab: "CU",
            bg: "#E6EDFD",
            fg: "#1E3FAE",
            title: c.companyName,
            subtitle: `${c.customerCode} · ${c.contactPerson} (${c.state})`,
            amount: formatUSD(c.currentBalance),
            tab: "customers",
          });
        }
      });
    }
    if (searchType === "All" || searchType === "Products") {
      state.products.forEach((p) => {
        if (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.includes(q)) {
          out.push({
            kind: "Product",
            ab: "PR",
            bg: "#E3F5EC",
            fg: "#05603F",
            title: p.name,
            subtitle: `${p.sku} · ${p.category}`,
            amount: formatUSD(p.sellingPrice),
            tab: "products",
          });
        }
      });
    }
    if (searchType === "All" || searchType === "Invoices") {
      state.invoices.forEach((i) => {
        const cust = state.customers.find((c) => c.id === i.customerId)?.companyName || "";
        if (!q || i.invoiceNo.toLowerCase().includes(q) || cust.toLowerCase().includes(q)) {
          out.push({
            kind: "Invoice",
            ab: "IN",
            bg: "#EEF6DA",
            fg: "#3D5A0A",
            title: i.invoiceNo,
            subtitle: `${cust} · Due ${formatUSDate(i.dueDate)} · ${i.status}`,
            amount: formatUSD(i.total),
            tab: "invoices",
          });
        }
      });
    }
    if (searchType === "All" || searchType === "Orders") {
      state.salesOrders.forEach((o) => {
        const cust = state.customers.find((c) => c.id === o.customerId)?.companyName || "";
        if (!q || o.orderNo.toLowerCase().includes(q) || cust.toLowerCase().includes(q)) {
          out.push({
            kind: "Order",
            ab: "SO",
            bg: "#FDF0DC",
            fg: "#7F4505",
            title: o.orderNo,
            subtitle: `${cust} · ${o.status}`,
            amount: formatUSD(o.grandTotal),
            tab: "sales",
          });
        }
      });
    }
    if (searchType === "All" || searchType === "Payments") {
      state.payments.forEach((p) => {
        const cust = state.customers.find((c) => c.id === p.customerId)?.companyName || "";
        if (!q || p.receiptNo.toLowerCase().includes(q) || cust.toLowerCase().includes(q)) {
          out.push({
            kind: "Payment",
            ab: "PM",
            bg: "#E3F5EC",
            fg: "#05603F",
            title: p.receiptNo,
            subtitle: `${cust} · ${p.method}`,
            amount: formatUSD(p.amount),
            tab: "ledger",
          });
        }
      });
    }

    return out.slice(0, 20);
  }, [state, globalQuery, searchType]);

  if (booting) {
    return (
      <div className="min-h-screen bg-[#111317] flex flex-col items-center justify-center gap-3 text-[#A3A8B3]">
        <span className="w-12 h-12 rounded-[14px] bg-[#C5F04A] flex items-center justify-center shadow-[0_12px_30px_-10px_rgba(197,240,74,0.85)] animate-pulse">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111317" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 19V5l14 14V5" />
          </svg>
        </span>
        <p className="text-xs font-semibold uppercase tracking-[0.2em]">
          Loading Nexora Enterprise...
        </p>
      </div>
    );
  }

  if (!user || !state) {
    return (
      <LoginScreen
        storageMode={storageMode}
        setupRequired={setupRequired}
        bootError={bootError}
        onAuthenticated={async (authenticatedUser) => {
          setSetupRequired(false);
          setBootError(null);
          setUser(authenticatedUser);
          setAiMsgs([
            {
              role: "bot",
              text: `Hi ${authenticatedUser.name.split(" ")[0]} — ask me anything about live sales, stock, customers, overdue balances, or cash flow.`,
            },
          ]);
          await loadBootstrap();
        }}
      />
    );
  }

  const unreadNotifs = state.notifications.filter((n) => !n.read).length;
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const currentMonthName = new Date().toLocaleDateString("en-US", { month: "long" });
  const currentYear = new Date().getFullYear();

  const railGroups: Array<
    Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }>
  > = [
    [{ id: "dashboard", label: "Home", icon: LayoutGrid }],
    [
      { id: "sales", label: "Sales", icon: ShoppingCart, badge: badges.pendingOrders },
      { id: "invoices", label: "Invoices", icon: FileText },
      { id: "customers", label: "Customers", icon: Users },
    ],
    [
      { id: "ledger", label: "Ledger", icon: BookOpen, badge: badges.overdueInv },
      { id: "accounting", label: "Accounts", icon: Calculator },
    ],
    [
      { id: "products", label: "Products", icon: Package },
      { id: "inventory", label: "Inventory", icon: Warehouse, badge: badges.lowStock },
      { id: "purchasing", label: "Purchasing", icon: Truck },
    ],
    [
      { id: "analytics", label: "Reports", icon: BarChart3 },
      { id: "admin", label: "Admin", icon: ShieldCheck, badge: badges.pendingApprovals },
    ],
  ];

  return (
    <div className="min-h-screen bg-[#111317] flex flex-col md:flex-row items-stretch gap-[10px] p-[10px] md:p-[12px_12px_12px_4px]">
      {/* Exact Nexora 92px Slim Obsidian Icon Rail */}
      <aside
        aria-label="Main navigation"
        className="no-print md:w-[92px] shrink-0 flex flex-row md:flex-col items-center justify-between md:justify-start gap-1 py-2 md:py-[10px] overflow-x-auto md:overflow-visible md:sticky md:top-3 md:h-[calc(100vh-24px)]"
      >
        {/* Signature Lime Brand Logo Tile */}
        <button
          onClick={() => setActiveTab("dashboard")}
          aria-label="Nexora Home"
          className="w-[50px] h-[50px] shrink-0 rounded-[16px] bg-[#C5F04A] flex items-center justify-center md:mb-3 shadow-[0_12px_30px_-12px_rgba(197,240,74,0.9)] cursor-pointer hover:scale-[1.03] transition-transform"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111317" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 19V5l14 14V5" />
          </svg>
        </button>

        <div className="flex flex-row md:flex-col items-center gap-0.5 md:overflow-y-auto md:flex-1">
          {railGroups.map((group, gIdx) => (
            <React.Fragment key={gIdx}>
              {gIdx > 0 && <span className="rdiv hidden md:block" aria-hidden="true" />}
              {group.map((item) => {
                const Icon = item.icon;
                const on = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`ritem shrink-0 ${on ? "on" : ""}`}
                    aria-current={on ? "page" : undefined}
                  >
                    <span className="ric">
                      <Icon className="h-[19px] w-[19px]" />
                      {Boolean(item.badge && item.badge > 0) && (
                        <span className="rbadge">{item.badge}</span>
                      )}
                    </span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        {/* Bottom Sign Out & Lime-Ringed Avatar */}
        <div className="hidden md:flex flex-col items-center gap-2.5 pt-3 mt-auto">
          <button
            onClick={handleLogout}
            className="ritem"
            title="Sign out"
            aria-label="Sign out"
          >
            <span className="ric">
              <LogOut className="h-[18px] w-[18px]" />
            </span>
          </button>
          <div
            title={`${user.name} (${user.role})`}
            className="w-[42px] h-[42px] rounded-full bg-[#2A2E37] text-white font-bold text-[13px] flex items-center justify-center shadow-[0_0_0_2px_#111317,0_0_0_4px_#C5F04A]"
          >
            {initials}
          </div>
        </div>
      </aside>

      {/* Exact Nexora Rounded Alabaster Paper Sheet (#F4F3EF) */}
      <main className="nexora-sheet flex-1 min-w-0 flex flex-col overflow-x-clip">
        {/* Exact Nexora Top Utility Header */}
        <header className="no-print flex flex-wrap items-center gap-3 px-5 sm:px-9 pt-[18px] pb-2">
          <div className="flex flex-col gap-0.5 mr-2 min-w-0">
            <span className="text-[12px] text-[#6B6F78] font-semibold flex items-center gap-1.5">
              <span className="truncate max-w-[200px]">{state.settings.activeCompany}</span>
              <span className="text-[#B4B0A6]">/</span>
              <span className="text-[#111317]">{SCREEN_TITLES[activeTab] || "Workspace"}</span>
            </span>
            <span className="text-[12px] text-[#6B6F78] flex items-center gap-1.5">
              <span className="w-[7px] h-[7px] rounded-full bg-[#22C55E] shadow-[0_0_0_3px_#DCFCE7]" />
              Live · FY {currentYear} · {currentMonthName} ·{" "}
              {storageMode === "mongodb" ? "MongoDB Atlas" : "Local Dev"}
            </span>
          </div>

          {/* Global Search Bar Trigger */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex-1 basis-[240px] max-w-[460px] mx-auto min-h-[40px] flex items-center gap-2.5 pl-3.5 pr-2.5 border border-[#E0DDD5] rounded-[10px] bg-white text-[#6B6F78] text-[13.5px] cursor-pointer text-left shadow-[0_1px_2px_rgba(17,19,23,0.04)] hover:border-[#CFCBC1] transition-colors"
          >
            <Search className="h-[17px] w-[17px] shrink-0 text-[#5F636C]" />
            <span className="flex-1 truncate">Search customers, products, invoices…</span>
            <Filter className="h-[15px] w-[15px] text-[#8C919C]" />
          </button>

          {/* Branch Switcher Pill */}
          <label className="inline-flex items-center gap-2 min-h-[40px] pl-3.5 pr-2 border border-[#E0DDD5] rounded-[10px] bg-white shadow-[0_1px_1px_rgba(17,19,23,0.04)]">
            <Building2 className="h-4 w-4 text-[#5F636C] shrink-0" />
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="border-0 outline-none bg-transparent text-[13.5px] font-semibold text-[#111317] min-h-[38px] pr-2 cursor-pointer"
            >
              <option value="all">All branches ({state.branches.length})</option>
              {state.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          {/* Signature Nexora Ask AI Ink Button with Lime Sparkle */}
          <button
            onClick={() => {
              setAiOpen(true);
              setNotifOpen(false);
            }}
            className="inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded-[10px] bg-[#111317] text-white font-semibold text-[13.5px] hover:bg-[#2A2E37] active:scale-[0.98] transition-all cursor-pointer shadow-[0_1px_2px_rgba(17,19,23,0.25)]"
          >
            <Sparkles className="h-4 w-4 text-[#C5F04A]" />
            Ask AI
          </button>

          {/* Notifications Bell with Pulsing Orange Dot */}
          <div className="relative">
            <button
              onClick={() => setNotifOpen((v) => !v)}
              aria-label="Notifications"
              className="relative w-[40px] h-[40px] rounded-[10px] border border-[#E0DDD5] bg-white text-[#334155] hover:bg-[#F1EFEA] flex items-center justify-center cursor-pointer transition-colors"
            >
              <Bell className="h-[18px] w-[18px]" />
              {unreadNotifs > 0 && (
                <>
                  <span className="absolute top-[8px] right-[9px] w-[9px] h-[9px] rounded-full bg-[#FF6A3D] border-2 border-white" />
                  <span className="nexora-ping absolute top-[8px] right-[9px] w-[9px] h-[9px] rounded-full bg-[#FF6A3D]" />
                </>
              )}
            </button>

            <AnimatePresence>
              {notifOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.97 }}
                  className="absolute right-0 mt-2 w-80 sm:w-96 rounded-[14px] border border-[#E3E0D8] bg-white shadow-[0_24px_50px_-18px_rgba(17,19,23,0.3)] overflow-hidden z-50"
                >
                  <div className="flex items-center justify-between border-b border-[#EEECE7] bg-[#FAF9F6] px-4 py-3">
                    <span className="text-[12px] font-bold uppercase tracking-wider text-[#111317]">
                      Notifications ({unreadNotifs} unread)
                    </span>
                    <button
                      onClick={() => runAction("notification:read", { id: "all" })}
                      className="text-[12px] font-semibold text-[#1E3FAE] hover:underline cursor-pointer"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-[#EEECE7]">
                    {state.notifications.length === 0 ? (
                      <p className="p-6 text-center text-xs text-[#5F636C]">
                        No notifications yet.
                      </p>
                    ) : (
                      state.notifications.slice(0, 8).map((n) => (
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
                          className={`px-4 py-3 text-xs cursor-pointer hover:bg-[#F8F7F3] ${
                            !n.read ? "bg-[#FAFCF4]" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-[#111317]">{n.title}</span>
                            <StatusBadge status={n.severity} />
                          </div>
                          <p className="text-[#5F636C] mt-1">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        {/* Active Screen Canvas */}
        <div className="flex-1 px-5 sm:px-9 py-5 pb-14 w-full max-w-[1560px] mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
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
              {activeTab === "sales" && (
                <SalesInvoicingModule
                  state={state}
                  initialTab="orders"
                  onRunAction={async (a, p) => {
                    await runAction(a, p);
                  }}
                />
              )}
              {activeTab === "invoices" && (
                <SalesInvoicingModule
                  state={state}
                  initialTab="invoices"
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
              {activeTab === "ledger" && (
                <LedgerReceivablesPaymentsModule
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
              {activeTab === "purchasing" && (
                <PurchasingPayablesModule
                  state={state}
                  onRunAction={async (a, p) => {
                    await runAction(a, p);
                  }}
                />
              )}
              {activeTab === "analytics" && <AnalyticsAIModule state={state} />}
              {activeTab === "admin" && (
                <div className="space-y-8">
                  <AdminSecurityModule
                    state={state}
                    storageMode={storageMode}
                    onRunAction={runAction}
                  />
                  <OperationsWorkforceModule
                    state={state}
                    onRunAction={async (a, p) => {
                      await runAction(a, p);
                    }}
                  />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Nexora Global Search Modal */}
      <Modal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Global Enterprise Search"
        subtitle="Instant search across customers, products, invoices, orders, and payments in MongoDB."
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <input
            autoFocus
            value={globalQuery}
            onChange={(e) => setGlobalQuery(e.target.value)}
            placeholder="Search by name, SKU, invoice #, order #, or receipt #..."
            className="erp-input"
          />
          <div className="flex flex-wrap gap-1.5">
            {["All", "Customers", "Products", "Invoices", "Orders", "Payments"].map((t) => (
              <button
                key={t}
                onClick={() => setSearchType(t)}
                className={`min-h-[32px] px-3 rounded-[8px] text-[12.5px] font-semibold cursor-pointer border transition-colors ${
                  searchType === t
                    ? "bg-[#111317] border-[#111317] text-white"
                    : "bg-white border-[#E0DDD5] text-[#4A4E57] hover:border-[#B9C0CC]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-[#EEECE7]">
            {searchResults.map((r, i) => (
              <button
                key={i}
                onClick={() => {
                  setActiveTab(r.tab);
                  setSearchOpen(false);
                }}
                className="w-full flex items-center gap-3.5 px-2.5 py-2.5 rounded-[10px] hover:bg-[#F6F5F1] text-left cursor-pointer transition-colors"
              >
                <span
                  className="w-8 h-8 rounded-[8px] flex items-center justify-center text-[11px] font-bold shrink-0"
                  style={{ backgroundColor: r.bg, color: r.fg }}
                >
                  {r.ab}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold text-[#111317] truncate">{r.title}</p>
                  <p className="text-[12px] text-[#5F636C] truncate">{r.subtitle}</p>
                </div>
                {r.amount && (
                  <span className="num text-[13.5px] font-bold text-[#111317] shrink-0">
                    {r.amount}
                  </span>
                )}
              </button>
            ))}
            {searchResults.length === 0 && (
              <p className="py-8 text-center text-xs text-[#5F636C]">No matching records found.</p>
            )}
          </div>
        </div>
      </Modal>

      {/* Nexora Right Slide-Over AI Assistant Drawer */}
      <AnimatePresence>
        {aiOpen && (
          <div className="fixed inset-0 z-50 no-print">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAiOpen(false)}
              className="fixed inset-0 bg-[#111317]/40 backdrop-blur-[3px]"
            />
            <motion.aside
              initial={{ x: 560 }}
              animate={{ x: 0 }}
              exit={{ x: 560 }}
              transition={{ duration: 0.32, ease: [0.2, 0.7, 0.2, 1] }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-[500px] bg-white z-60 shadow-[-24px_0_60px_-24px_rgba(17,19,23,0.4)] flex flex-col"
            >
              <div className="flex items-center justify-between px-6 py-4 bg-[#111317] text-white">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-[10px] bg-[#C5F04A] text-[#111317] flex items-center justify-center">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="h text-[16px] font-bold">Nexora AI Assistant</h2>
                    <p className="text-[11.5px] text-[#A3A8B3]">
                      Live MongoDB telemetry & executive Q&A
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setAiOpen(false)}
                  className="rounded-lg p-1.5 text-[#A3A8B3] hover:bg-[#23262E] hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-5 py-3 bg-[#FAFCF4] border-b border-[#E6E3DC]">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#3D5A0A] mb-2">
                  Suggested Executive Questions
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {AI_QUICK_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => askDrawerAI(q)}
                      className="text-left text-[12px] font-medium px-2.5 py-1 rounded-[8px] border border-[#DCEBB5] bg-white text-[#111317] hover:bg-[#EEF6DA] transition-colors cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-[#F4F3EF]">
                {aiMsgs.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-[14px] px-4 py-3 text-[13px] leading-relaxed whitespace-pre-line ${
                        m.role === "user"
                          ? "bg-[#111317] text-white"
                          : "bg-white border border-[#E3E0D8] text-[#111317] shadow-sm"
                      }`}
                    >
                      {m.text}
                      {m.highlights && m.highlights.length > 0 && (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {m.highlights.map((h, i) => (
                            <div key={i} className="rounded-[9px] bg-[#F6F5F1] border border-[#E6E3DC] px-2.5 py-1.5">
                              <p className="text-[10px] text-[#5F636C] truncate">{h.label}</p>
                              <p className="num text-[12px] font-bold text-[#111317] mt-0.5">{h.value}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="text-xs font-semibold text-[#3D5A0A] animate-pulse">
                    Querying live MongoDB collections...
                  </div>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  askDrawerAI(aiInput);
                }}
                className="p-4 border-t border-[#E6E3DC] bg-white flex gap-2"
              >
                <input
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="Ask about revenue, overdue customers, stock..."
                  className="erp-input"
                />
                <button
                  type="submit"
                  disabled={aiLoading}
                  className="inline-flex items-center justify-center gap-1.5 px-4 rounded-[10px] bg-[#111317] text-white text-[13px] font-semibold hover:bg-[#2A2E37] cursor-pointer disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5 text-[#C5F04A]" /> Send
                </button>
              </form>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Nexora Bottom-Center Ink Toast Stack */}
      <div className="fixed bottom-5 right-5 z-50 space-y-2 no-print max-w-sm">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10 }}
              className={`flex items-center gap-2.5 rounded-[12px] px-4 py-3 text-[13px] font-semibold shadow-[0_20px_40px_-14px_rgba(17,19,23,0.45)] ${
                t.type === "ok"
                  ? "bg-[#111317] text-white border border-[#2A2E37]"
                  : "bg-[#FCE8E8] text-[#A11A1A] border border-[#F5C2C2]"
              }`}
            >
              {t.type === "ok" ? (
                <CheckCircle2 className="h-4 w-4 text-[#C5F04A] shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-[#A11A1A] shrink-0" />
              )}
              <span>{t.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
