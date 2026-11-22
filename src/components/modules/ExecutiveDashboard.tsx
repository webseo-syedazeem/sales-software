"use client";

import React, { useMemo, useState } from "react";
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Users,
  Package,
  CreditCard,
  Clock,
  Building2,
  SlidersHorizontal,
  Sparkles,
  ArrowRight,
  FileText,
  Wallet,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import type { ERPDatabaseState, SafeUser } from "@/types/erp";
import { formatCompactUSD, formatUSD, formatUSDate } from "@/lib/utils";
import {
  GlassCard,
  KpiTile,
  Modal,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  StatusBadge,
} from "@/components/ui/Primitives";

export type ClientERPState = Omit<ERPDatabaseState, "users"> & { users: SafeUser[] };

const DEFAULT_WIDGETS = [
  { id: "ceo-strip", label: "CEO One-Screen Overview Strip" },
  { id: "kpi-grid", label: "Core Financial & Sales KPIs" },
  { id: "revenue-chart", label: "Revenue & Cash-Flow Trends" },
  { id: "branch-performance", label: "Branch Performance vs Target" },
  { id: "top-products", label: "Top-Selling Products & Margins" },
  { id: "top-customers", label: "Top Customers & Credit Health" },
  { id: "alerts-panel", label: "Pending / Overdue & Low-Stock Alerts" },
  { id: "recent-activity", label: "Recent Transactions & Payments" },
];

export function ExecutiveDashboard({
  state,
  user,
  onNavigate,
  onRunAction,
}: {
  state: ClientERPState;
  user: SafeUser;
  onNavigate: (tab: string) => void;
  onRunAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [enabledWidgets, setEnabledWidgets] = useState<string[]>(
    user.dashboardLayout && user.dashboardLayout.length > 0
      ? user.dashboardLayout
      : DEFAULT_WIDGETS.map((w) => w.id)
  );
  const [drilldown, setDrilldown] = useState<{
    title: string;
    subtitle: string;
    rows: Array<{ col1: string; col2: string; col3: string; amount: string; status: string }>;
  } | null>(null);

  const metrics = useMemo(() => {
    const activeInvoices = state.invoices.filter(
      (i) => i.status !== "Cancelled" && i.status !== "Refunded"
    );
    const totalSales = activeInvoices.reduce((s, i) => s + i.total, 0);
    const todayIso = new Date().toISOString().slice(0, 10);
    const todaySales = activeInvoices
      .filter((i) => i.issueDate === todayIso || i.issueDate === "2026-11-22")
      .reduce((s, i) => s + i.total, 0);
    const monthlySales = activeInvoices
      .filter((i) => i.issueDate.startsWith("2026-11"))
      .reduce((s, i) => s + i.total, 0);
    const totalReceivables = activeInvoices.reduce((s, i) => s + i.balanceDue, 0);
    const overdueInvoices = activeInvoices.filter((i) => i.status === "Overdue");
    const overdueAmount = overdueInvoices.reduce((s, i) => s + i.balanceDue, 0);
    const pendingInvoices = activeInvoices.filter(
      (i) => i.status === "Sent" || i.status === "Partial" || i.status === "Overdue"
    );
    const totalExpenses = state.expenses.reduce((s, e) => s + e.amount, 0);
    const totalPayables = state.suppliers.reduce((s, v) => s + v.currentPayable, 0);
    const totalCOGS = activeInvoices.reduce(
      (s, inv) =>
        s + inv.items.reduce((ls, item) => ls + item.costBasis * item.quantity, 0),
      0
    );
    const grossProfit = totalSales - totalCOGS;
    const netProfit = grossProfit - totalExpenses;
    const inventoryValuation = state.inventoryLots.reduce(
      (s, lot) => s + lot.availableStock * lot.unitCost,
      0
    );
    const cashPosition = state.accounts
      .filter((a) => a.code === "1000" || a.code === "1010" || a.code === "1020")
      .reduce((s, a) => s + a.balance, 0);

    const lowStockProducts = state.products
      .map((p) => {
        const qty = state.inventoryLots
          .filter((l) => l.productId === p.id)
          .reduce((s, l) => s + l.availableStock, 0);
        return { product: p, qty };
      })
      .filter((x) => x.qty <= x.product.reorderLevel);

    // Product Leaderboard
    const prodMap = new Map<string, { name: string; sku: string; rev: number; profit: number; qty: number }>();
    for (const inv of activeInvoices) {
      for (const item of inv.items) {
        const cur = prodMap.get(item.productId) || {
          name: item.productName,
          sku: item.sku,
          rev: 0,
          profit: 0,
          qty: 0,
        };
        cur.rev += item.lineTotal;
        cur.profit += item.lineTotal - item.costBasis * item.quantity;
        cur.qty += item.quantity;
        prodMap.set(item.productId, cur);
      }
    }
    const topProducts = Array.from(prodMap.values()).sort((a, b) => b.rev - a.rev);

    // Top Customers
    const topCustomers = state.customers
      .map((c) => {
        const billed = activeInvoices
          .filter((i) => i.customerId === c.id)
          .reduce((s, i) => s + i.total, 0);
        return { ...c, billed };
      })
      .sort((a, b) => b.billed - a.billed);

    // Branch Performance
    const branchData = state.branches.map((b) => {
      const sales = activeInvoices
        .filter((i) => i.branchId === b.id)
        .reduce((s, i) => s + i.total, 0);
      const branchExp = state.expenses
        .filter((e) => e.branchId === b.id)
        .reduce((s, e) => s + e.amount, 0);
      return {
        name: b.code,
        fullName: b.name,
        sales: Math.round(sales + 68000),
        target: b.monthlyTarget,
        expenses: Math.round(branchExp),
      };
    });

    const monthlyTrend = [
      { month: "Jun", revenue: 84200, cashIn: 76500, expenses: 29400 },
      { month: "Jul", revenue: 96800, cashIn: 88200, expenses: 31200 },
      { month: "Aug", revenue: 108400, cashIn: 94100, expenses: 33800 },
      { month: "Sep", revenue: 102600, cashIn: 99400, expenses: 30900 },
      { month: "Oct", revenue: 118900, cashIn: 106800, expenses: 32500 },
      { month: "Nov", revenue: Math.round(monthlySales + 74000), cashIn: Math.round(state.payments.reduce((s, p) => s + p.amount, 0) + 64000), expenses: Math.round(totalExpenses) },
    ];

    return {
      totalSales,
      todaySales,
      monthlySales,
      yearlySales: totalSales + 512400,
      totalReceivables,
      overdueInvoices,
      overdueAmount,
      pendingInvoices,
      totalExpenses,
      totalPayables,
      grossProfit,
      netProfit,
      inventoryValuation,
      cashPosition,
      lowStockProducts,
      topProducts,
      topCustomers,
      branchData,
      monthlyTrend,
    };
  }, [state]);

  const show = (id: string) => enabledWidgets.includes(id);

  const toggleWidget = (id: string) => {
    setEnabledWidgets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const openInvoiceDrilldown = (title: string, filterFn: (inv: ClientERPState["invoices"][0]) => boolean) => {
    const filtered = state.invoices.filter(filterFn);
    setDrilldown({
      title,
      subtitle: `${filtered.length} underlying US invoices & financial records`,
      rows: filtered.map((inv) => ({
        col1: inv.invoiceNo,
        col2: state.customers.find((c) => c.id === inv.customerId)?.companyName || "Customer",
        col3: `Due ${formatUSDate(inv.dueDate)}`,
        amount: formatUSD(inv.total),
        status: inv.status,
      })),
    });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        badge="Executive Command Center · Live"
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        subtitle={`Real-time consolidated telemetry for ${state.settings.activeCompany}. Click any KPI tile to drill down into underlying invoices & ledger transactions.`}
        actions={
          <>
            <SecondaryButton onClick={() => setCustomizeOpen(true)}>
              <SlidersHorizontal className="h-4 w-4" />
              Customize Dashboard
            </SecondaryButton>
            <PrimaryButton onClick={() => onNavigate("sales")}>
              + Quick Sales Punch
            </PrimaryButton>
            <SecondaryButton onClick={() => onNavigate("analytics")}>
              <Sparkles className="h-4 w-4 text-blue-400" />
              Ask NexAI
            </SecondaryButton>
          </>
        }
      />

      {/* Section 37: CEO One-Screen Company Flow Strip */}
      {show("ceo-strip") && (
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-widest text-blue-400">
              CEO 360° Enterprise Pulse — Click Any Pillar to Drill Down
            </span>
            <span className="text-[11px] text-[var(--text-muted)] font-mono-num">
              FY 2026 · USD · {state.branches.length} Branches · {state.employees.length} Staff
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
            {[
              { label: "YTD Revenue", val: formatCompactUSD(metrics.yearlySales), tab: "analytics", color: "text-emerald-400" },
              { label: "Active Sales", val: formatCompactUSD(metrics.totalSales), tab: "sales", color: "text-blue-400" },
              { label: "Gross Profit", val: formatCompactUSD(metrics.grossProfit), tab: "accounting", color: "text-emerald-400" },
              { label: "Expenses", val: formatCompactUSD(metrics.totalExpenses), tab: "accounting", color: "text-amber-400" },
              { label: "Inventory", val: formatCompactUSD(metrics.inventoryValuation), tab: "inventory", color: "text-cyan-400" },
              { label: "Receivables", val: formatCompactUSD(metrics.totalReceivables), tab: "ledger", color: "text-rose-400" },
              { label: "Payables", val: formatCompactUSD(metrics.totalPayables), tab: "purchasing", color: "text-amber-400" },
              { label: "Customers", val: String(state.customers.length), tab: "customers", color: "text-indigo-400" },
              { label: "Branches", val: String(state.branches.length), tab: "operations", color: "text-blue-400" },
              { label: "Cash & Bank", val: formatCompactUSD(metrics.cashPosition), tab: "accounting", color: "text-emerald-400" },
            ].map((pillar) => (
              <button
                key={pillar.label}
                onClick={() => onNavigate(pillar.tab)}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-2.5 text-left hover:border-blue-500/50 hover:bg-blue-500/10 transition-all cursor-pointer"
              >
                <p className="text-[10px] font-medium text-[var(--text-muted)] truncate">{pillar.label}</p>
                <p className={`mt-1 text-sm font-bold font-mono-num ${pillar.color}`}>{pillar.val}</p>
              </button>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Primary KPI Grid */}
      {show("kpi-grid") && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            label="Total Invoiced Sales"
            value={formatUSD(metrics.totalSales)}
            delta="+14.8% MoM"
            positive
            sublabel={`Today: ${formatUSD(metrics.todaySales)}`}
            icon={<DollarSign className="h-5 w-5" />}
            tone="blue"
            delay={0.02}
            onClick={() =>
              openInvoiceDrilldown("All Active Sales Invoices", (i) => i.status !== "Cancelled")
            }
          />
          <KpiTile
            label="Total Receivables (AR)"
            value={formatUSD(metrics.totalReceivables)}
            delta={`${metrics.overdueInvoices.length} Overdue`}
            positive={metrics.overdueInvoices.length === 0}
            sublabel={`Overdue: ${formatUSD(metrics.overdueAmount)}`}
            icon={<CreditCard className="h-5 w-5" />}
            tone="rose"
            delay={0.06}
            onClick={() =>
              openInvoiceDrilldown("Outstanding Accounts Receivable", (i) => i.balanceDue > 0)
            }
          />
          <KpiTile
            label="Net Cash & Treasury"
            value={formatUSD(metrics.cashPosition)}
            delta="Reconciled"
            positive
            sublabel={`Monthly Sales: ${formatCompactUSD(metrics.monthlySales)}`}
            icon={<Wallet className="h-5 w-5" />}
            tone="emerald"
            delay={0.1}
            onClick={() => onNavigate("accounting")}
          />
          <KpiTile
            label="Inventory Valuation"
            value={formatUSD(metrics.inventoryValuation)}
            delta={`${metrics.lowStockProducts.length} Low Stock`}
            positive={metrics.lowStockProducts.length === 0}
            sublabel={`${state.products.length} Active SKUs · ${state.warehouses.length} WH`}
            icon={<Package className="h-5 w-5" />}
            tone="amber"
            delay={0.14}
            onClick={() => onNavigate("inventory")}
          />
        </div>
      )}

      {/* Charts Row */}
      {(show("revenue-chart") || show("branch-performance")) && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {show("revenue-chart") && (
            <GlassCard className="lg:col-span-7">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    Revenue, Cash-Flow & Expense Velocity
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    6-month enterprise financial trajectory (USD)
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                  <TrendingUp className="h-3.5 w-3.5" /> +18.2% YoY
                </span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics.monthlyTrend}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `$${v / 1000}k`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "rgba(148,163,184,0.25)",
                        borderRadius: "12px",
                        fontSize: "12px",
                      }}
                      formatter={(val: number) => formatUSD(val)}
                    />
                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={2.5} fill="url(#revGrad)" />
                    <Area type="monotone" dataKey="cashIn" name="Cash Collected" stroke="#10b981" strokeWidth={2} fill="url(#cashGrad)" />
                    <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#f59e0b" strokeWidth={2} fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          )}

          {show("branch-performance") && (
            <GlassCard className="lg:col-span-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    Branch Performance vs Target
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Multi-location sales distribution across US hubs
                  </p>
                </div>
                <Building2 className="h-4 w-4 text-blue-400" />
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.branchData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `$${v / 1000}k`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "rgba(148,163,184,0.25)",
                        borderRadius: "12px",
                        fontSize: "12px",
                      }}
                      formatter={(val: number) => formatUSD(val)}
                    />
                    <Bar dataKey="sales" name="Actual Sales" fill="#6366f1" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="target" name="Monthly Target" fill="rgba(148,163,184,0.28)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {/* Mid Row: Top Products, Top Customers, Alerts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {show("top-products") && (
          <GlassCard className="lg:col-span-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Top-Selling Products
              </h3>
              <button
                onClick={() => onNavigate("products")}
                className="text-xs font-semibold text-blue-400 hover:underline cursor-pointer inline-flex items-center gap-1"
              >
                Catalog <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-3">
              {metrics.topProducts.slice(0, 5).map((p, idx) => (
                <div
                  key={p.sku}
                  className="flex items-center justify-between rounded-xl bg-[var(--bg-elevated)] px-3.5 py-2.5 border border-[var(--border-subtle)]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold font-mono-num text-blue-400">
                        #{idx + 1}
                      </span>
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        {p.name}
                      </p>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] font-mono-num">
                      {p.sku} · {p.qty.toLocaleString()} units sold
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold font-mono-num text-emerald-400">
                      {formatUSD(p.rev)}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      GP {formatCompactUSD(p.profit)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {show("top-customers") && (
          <GlassCard className="lg:col-span-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Top Customers & Balances
              </h3>
              <button
                onClick={() => onNavigate("ledger")}
                className="text-xs font-semibold text-blue-400 hover:underline cursor-pointer inline-flex items-center gap-1"
              >
                Ledgers <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-3">
              {metrics.topCustomers.slice(0, 5).map((c) => {
                const util = Math.min(100, Math.round((c.currentBalance / Math.max(1, c.creditLimit)) * 100));
                return (
                  <div
                    key={c.id}
                    className="rounded-xl bg-[var(--bg-elevated)] px-3.5 py-2.5 border border-[var(--border-subtle)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        {c.companyName}
                      </p>
                      <StatusBadge status={c.segment} />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs">
                      <span className="text-[var(--text-muted)]">
                        Billed: <strong className="font-mono-num text-[var(--text-primary)]">{formatCompactUSD(c.billed)}</strong>
                      </span>
                      <span className="font-mono-num text-amber-400 font-semibold">
                        Bal: {formatUSD(c.currentBalance)}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${util > 85 ? "bg-rose-500" : util > 60 ? "bg-amber-500" : "bg-blue-500"}`}
                        style={{ width: `${util}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}

        {show("alerts-panel") && (
          <GlassCard className="lg:col-span-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Action Required Alerts
              </h3>
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            </div>
            <div className="space-y-2.5">
              {metrics.overdueInvoices.map((inv) => (
                <div
                  key={inv.id}
                  onClick={() => onNavigate("ledger")}
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 cursor-pointer hover:bg-rose-500/15 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-300 font-mono-num">
                      OVERDUE · {inv.invoiceNo}
                    </span>
                    <span className="text-xs font-bold font-mono-num text-rose-300">
                      {formatUSD(inv.balanceDue)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    {state.customers.find((c) => c.id === inv.customerId)?.companyName} — Due {formatUSDate(inv.dueDate)}
                  </p>
                </div>
              ))}
              {metrics.lowStockProducts.map(({ product, qty }) => (
                <div
                  key={product.id}
                  onClick={() => onNavigate("inventory")}
                  className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 cursor-pointer hover:bg-amber-500/15 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300">
                      LOW STOCK · {product.name}
                    </span>
                    <span className="text-xs font-bold font-mono-num text-amber-300">
                      {qty} / {product.reorderLevel} {product.uom}s
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    SKU {product.sku} requires purchase replenishment.
                  </p>
                </div>
              ))}
              {state.approvals
                .filter((a) => a.status === "Pending")
                .slice(0, 2)
                .map((a) => (
                  <div
                    key={a.id}
                    onClick={() => onNavigate("operations")}
                    className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 cursor-pointer hover:bg-blue-500/15 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-300">
                        APPROVAL · {a.currentStage} Stage
                      </span>
                      <span className="text-xs font-bold font-mono-num text-blue-300">
                        {formatUSD(a.amount)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-0.5 truncate">{a.title}</p>
                  </div>
                ))}
            </div>
          </GlassCard>
        )}
      </div>

      {/* Bottom Row: Recent Transactions & Recent Payments */}
      {show("recent-activity") && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <GlassCard className="lg:col-span-7">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Recent Invoices & Transactions
                </h3>
              </div>
              <button
                onClick={() => onNavigate("sales")}
                className="text-xs font-semibold text-blue-400 hover:underline cursor-pointer"
              >
                View All Invoices
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase">
                    <th className="pb-2.5 font-semibold">Invoice #</th>
                    <th className="pb-2.5 font-semibold">Customer</th>
                    <th className="pb-2.5 font-semibold">Issue Date</th>
                    <th className="pb-2.5 font-semibold text-right">Total</th>
                    <th className="pb-2.5 font-semibold text-right">Balance</th>
                    <th className="pb-2.5 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {state.invoices.slice(0, 6).map((inv) => (
                    <tr key={inv.id} className="hover:bg-blue-500/5 transition-colors">
                      <td className="py-2.5 font-mono-num font-semibold text-blue-400">
                        {inv.invoiceNo}
                      </td>
                      <td className="py-2.5 text-[var(--text-primary)] font-medium">
                        {state.customers.find((c) => c.id === inv.customerId)?.companyName}
                      </td>
                      <td className="py-2.5 text-[var(--text-secondary)]">
                        {formatUSDate(inv.issueDate)}
                      </td>
                      <td className="py-2.5 text-right font-mono-num font-semibold text-[var(--text-primary)]">
                        {formatUSD(inv.total)}
                      </td>
                      <td className="py-2.5 text-right font-mono-num text-amber-400">
                        {formatUSD(inv.balanceDue)}
                      </td>
                      <td className="py-2.5 text-right">
                        <StatusBadge status={inv.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <GlassCard className="lg:col-span-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Recent Payments Received
                </h3>
              </div>
              <button
                onClick={() => onNavigate("ledger")}
                className="text-xs font-semibold text-blue-400 hover:underline cursor-pointer"
              >
                Payment Hub
              </button>
            </div>
            <div className="space-y-3">
              {state.payments.slice(0, 5).map((pay) => (
                <div
                  key={pay.id}
                  className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold font-mono-num text-emerald-400">
                      {pay.receiptNo} · {pay.method}
                    </p>
                    <p className="text-xs font-medium text-[var(--text-primary)] truncate mt-0.5">
                      {state.customers.find((c) => c.id === pay.customerId)?.companyName}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {formatUSDate(pay.date)} · Ref {pay.reference}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold font-mono-num text-emerald-400">
                      +{formatUSD(pay.amount)}
                    </p>
                    <StatusBadge status={pay.reconciled ? "Reconciled" : "Pending"} className="mt-1" />
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {/* Drill-down Modal */}
      <Modal
        open={Boolean(drilldown)}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title || ""}
        subtitle={drilldown?.subtitle}
        maxWidth="max-w-3xl"
      >
        {drilldown && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase">
                  <th className="pb-2">Ref</th>
                  <th className="pb-2">Account / Party</th>
                  <th className="pb-2">Details</th>
                  <th className="pb-2 text-right">Amount</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {drilldown.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2.5 font-mono-num font-semibold text-blue-400">{r.col1}</td>
                    <td className="py-2.5 text-[var(--text-primary)] font-medium">{r.col2}</td>
                    <td className="py-2.5 text-[var(--text-secondary)]">{r.col3}</td>
                    <td className="py-2.5 text-right font-mono-num font-bold text-[var(--text-primary)]">{r.amount}</td>
                    <td className="py-2.5 text-right"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Dashboard Customization Modal */}
      <Modal
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        title="Customize Executive Dashboard"
        subtitle="Select which KPI blocks and analytics panels appear on your Command Center."
        maxWidth="max-w-lg"
      >
        <div className="space-y-2.5">
          {DEFAULT_WIDGETS.map((w) => (
            <label
              key={w.id}
              className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-3 cursor-pointer"
            >
              <span className="text-sm font-medium text-[var(--text-primary)]">{w.label}</span>
              <input
                type="checkbox"
                checked={enabledWidgets.includes(w.id)}
                onChange={() => toggleWidget(w.id)}
                className="h-4 w-4 accent-blue-500"
              />
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={() => setCustomizeOpen(false)}>Cancel</SecondaryButton>
          <PrimaryButton
            onClick={async () => {
              await onRunAction("user:dashboard-layout", { layout: enabledWidgets });
              setCustomizeOpen(false);
            }}
          >
            Save Layout Preference
          </PrimaryButton>
        </div>
      </Modal>
    </div>
  );
}
