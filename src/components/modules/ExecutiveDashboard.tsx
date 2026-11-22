"use client";

import React, { useMemo, useState } from "react";
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
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
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const curMonth = todayIso.slice(0, 7);
    const curYear = todayIso.slice(0, 4);

    const activeInvoices = state.invoices.filter(
      (i) => i.status !== "Cancelled" && i.status !== "Refunded"
    );
    const totalSales = activeInvoices.reduce((s, i) => s + i.total, 0);
    const todaySales = activeInvoices
      .filter((i) => i.issueDate === todayIso)
      .reduce((s, i) => s + i.total, 0);
    const monthlySales = activeInvoices
      .filter((i) => i.issueDate.startsWith(curMonth))
      .reduce((s, i) => s + i.total, 0);
    const yearlySales = activeInvoices
      .filter((i) => i.issueDate.startsWith(curYear))
      .reduce((s, i) => s + i.total, 0);

    const totalReceivables = activeInvoices.reduce((s, i) => s + i.balanceDue, 0);
    const overdueInvoices = activeInvoices.filter(
      (i) => i.balanceDue > 0 && (i.status === "Overdue" || i.dueDate < todayIso)
    );
    const overdueAmount = overdueInvoices.reduce((s, i) => s + i.balanceDue, 0);
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
      .filter((a) => a.subType === "Bank" || a.code === "1000")
      .reduce((s, a) => s + a.balance, 0);

    const lowStockProducts = state.products
      .map((p) => {
        const qty = state.inventoryLots
          .filter((l) => l.productId === p.id)
          .reduce((s, l) => s + l.availableStock, 0);
        return { product: p, qty };
      })
      .filter((x) => x.qty <= x.product.reorderLevel);

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

    const topCustomers = state.customers
      .map((c) => {
        const billed = activeInvoices
          .filter((i) => i.customerId === c.id)
          .reduce((s, i) => s + i.total, 0);
        return { ...c, billed };
      })
      .sort((a, b) => b.billed - a.billed);

    // 100% live Branch Performance from actual invoices
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
        sales: Math.round(sales),
        target: b.monthlyTarget,
        expenses: Math.round(branchExp),
      };
    });

    // 100% live Last 6 Months Trend computed strictly from MongoDB records
    const monthlyTrend: Array<{ month: string; revenue: number; cashIn: number; expenses: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short" });
      const rev = activeInvoices
        .filter((inv) => inv.issueDate.startsWith(ym))
        .reduce((s, inv) => s + inv.total, 0);
      const cash = state.payments
        .filter((p) => p.date.startsWith(ym) && p.paymentType !== "Refund" && p.paymentType !== "Reversal")
        .reduce((s, p) => s + p.amount, 0);
      const exp = state.expenses
        .filter((e) => e.date.startsWith(ym))
        .reduce((s, e) => s + e.amount, 0);
      monthlyTrend.push({
        month: label,
        revenue: Math.round(rev),
        cashIn: Math.round(cash),
        expenses: Math.round(exp),
      });
    }

    return {
      totalSales,
      todaySales,
      monthlySales,
      yearlySales,
      totalReceivables,
      overdueInvoices,
      overdueAmount,
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
      curYear,
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
      subtitle: `${filtered.length} live database records`,
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
        badge="Executive Command Center · 100% Live MongoDB Telemetry"
        title={`Welcome, ${user.name.split(" ")[0]}`}
        subtitle={`Real-time consolidated ledger & operations for ${state.settings.activeCompany}. Every figure updates instantaneously from live database transactions.`}
        actions={
          <>
            <SecondaryButton onClick={() => setCustomizeOpen(true)}>
              <SlidersHorizontal className="h-4 w-4" />
              Customize Dashboard
            </SecondaryButton>
            <PrimaryButton onClick={() => onNavigate("sales")}>
              + New Sales Order
            </PrimaryButton>
            <SecondaryButton onClick={() => onNavigate("analytics")}>
              <Sparkles className="h-4 w-4 text-blue-400" />
              Ask NexAI
            </SecondaryButton>
          </>
        }
      />

      {show("ceo-strip") && (
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-widest text-blue-400">
              CEO 360° Live Company Overview — Click Any Pillar to Drill Down
            </span>
            <span className="text-[11px] text-[var(--text-muted)] font-mono-num">
              FY {metrics.curYear} · USD · {state.branches.length} Branch(es) · {state.employees.length} Staff
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
            {[
              { label: "YTD Revenue", val: formatCompactUSD(metrics.yearlySales), tab: "analytics", color: "text-emerald-400" },
              { label: "Total Sales", val: formatCompactUSD(metrics.totalSales), tab: "sales", color: "text-blue-400" },
              { label: "Gross Profit", val: formatCompactUSD(metrics.grossProfit), tab: "accounting", color: "text-emerald-400" },
              { label: "Expenses", val: formatCompactUSD(metrics.totalExpenses), tab: "accounting", color: "text-amber-400" },
              { label: "Inventory", val: formatCompactUSD(metrics.inventoryValuation), tab: "inventory", color: "text-cyan-400" },
              { label: "Receivables", val: formatCompactUSD(metrics.totalReceivables), tab: "ledger", color: "text-rose-400" },
              { label: "Payables", val: formatCompactUSD(metrics.totalPayables), tab: "purchasing", color: "text-amber-400" },
              { label: "Customers", val: String(state.customers.length), tab: "customers", color: "text-indigo-400" },
              { label: "Products", val: String(state.products.length), tab: "products", color: "text-blue-400" },
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

      {show("kpi-grid") && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            label="Total Invoiced Sales"
            value={formatUSD(metrics.totalSales)}
            delta={`MTD ${formatCompactUSD(metrics.monthlySales)}`}
            positive
            sublabel={`Today: ${formatUSD(metrics.todaySales)}`}
            icon={<DollarSign className="h-5 w-5" />}
            tone="blue"
            delay={0.02}
            onClick={() => openInvoiceDrilldown("All Active Sales Invoices", (i) => i.status !== "Cancelled")}
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
            onClick={() => openInvoiceDrilldown("Outstanding Receivables", (i) => i.balanceDue > 0)}
          />
          <KpiTile
            label="Cash & Bank Balance"
            value={formatUSD(metrics.cashPosition)}
            delta={`Net ${formatCompactUSD(metrics.netProfit)}`}
            positive={metrics.netProfit >= 0}
            sublabel={`${state.payments.length} recorded payments`}
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

      {(show("revenue-chart") || show("branch-performance")) && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {show("revenue-chart") && (
            <GlassCard className="lg:col-span-7">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    Revenue, Cash Collected & Expense Trend
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Live 6-month roll-up directly from MongoDB invoices, payments & expenses
                  </p>
                </div>
                <TrendingUp className="h-4 w-4 text-emerald-400" />
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
                    <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "rgba(148,163,184,0.25)", borderRadius: "12px", fontSize: "12px" }}
                      formatter={(val: number) => formatUSD(val)}
                    />
                    <Area type="monotone" dataKey="revenue" name="Invoiced Revenue" stroke="#3b82f6" strokeWidth={2.5} fill="url(#revGrad)" />
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
                    Live invoiced sales per configured branch location
                  </p>
                </div>
                <Building2 className="h-4 w-4 text-blue-400" />
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.branchData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "rgba(148,163,184,0.25)", borderRadius: "12px", fontSize: "12px" }}
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {show("top-products") && (
          <GlassCard className="lg:col-span-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Top-Selling Products
              </h3>
              <button onClick={() => onNavigate("products")} className="text-xs font-semibold text-blue-400 hover:underline cursor-pointer inline-flex items-center gap-1">
                Catalog <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            {metrics.topProducts.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-6 text-center">
                No product sales recorded yet. Create an order to rank live product revenue.
              </p>
            ) : (
              <div className="space-y-2.5">
                {metrics.topProducts.slice(0, 5).map((p, idx) => (
                  <div key={p.sku} className="flex items-center justify-between rounded-xl bg-[var(--bg-elevated)] px-3.5 py-2.5 border border-[var(--border-subtle)]">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        <span className="font-mono-num text-xs text-blue-400 mr-1.5">#{idx + 1}</span>
                        {p.name}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] font-mono-num">{p.sku} · {p.qty} units</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold font-mono-num text-emerald-400">{formatUSD(p.rev)}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">GP {formatCompactUSD(p.profit)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        )}

        {show("top-customers") && (
          <GlassCard className="lg:col-span-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Top Customers & Balances
              </h3>
              <button onClick={() => onNavigate("customers")} className="text-xs font-semibold text-blue-400 hover:underline cursor-pointer inline-flex items-center gap-1">
                CRM <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            {metrics.topCustomers.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-6 text-center">
                No customers registered yet. Add your first client in Customers & CRM.
              </p>
            ) : (
              <div className="space-y-2.5">
                {metrics.topCustomers.slice(0, 5).map((c) => (
                  <div key={c.id} className="rounded-xl bg-[var(--bg-elevated)] px-3.5 py-2.5 border border-[var(--border-subtle)]">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{c.companyName}</p>
                      <StatusBadge status={c.segment} />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-[var(--text-muted)]">Billed: <strong className="font-mono-num text-[var(--text-primary)]">{formatUSD(c.billed)}</strong></span>
                      <span className="font-mono-num text-amber-400 font-semibold">Bal: {formatUSD(c.currentBalance)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        )}

        {show("alerts-panel") && (
          <GlassCard className="lg:col-span-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Live Operational Alerts
              </h3>
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            </div>
            <div className="space-y-2.5 max-h-64 overflow-y-auto">
              {metrics.overdueInvoices.map((inv) => (
                <div key={inv.id} onClick={() => onNavigate("ledger")} className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 cursor-pointer">
                  <div className="flex items-center justify-between text-xs font-bold text-rose-300 font-mono-num">
                    <span>OVERDUE · {inv.invoiceNo}</span>
                    <span>{formatUSD(inv.balanceDue)}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    {state.customers.find((c) => c.id === inv.customerId)?.companyName} — Due {formatUSDate(inv.dueDate)}
                  </p>
                </div>
              ))}
              {metrics.lowStockProducts.slice(0, 4).map(({ product, qty }) => (
                <div key={product.id} onClick={() => onNavigate("inventory")} className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 cursor-pointer">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                    <span>LOW STOCK · {product.name}</span>
                    <span className="font-mono-num">{qty} / {product.reorderLevel}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">Stock in or issue PO to replenish {product.sku}.</p>
                </div>
              ))}
              {metrics.overdueInvoices.length === 0 && metrics.lowStockProducts.length === 0 && (
                <p className="text-xs text-emerald-400 py-6 text-center">All operational metrics healthy.</p>
              )}
            </div>
          </GlassCard>
        )}
      </div>

      {show("recent-activity") && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <GlassCard className="lg:col-span-7">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-400" /> Recent Invoices
              </h3>
              <button onClick={() => onNavigate("sales")} className="text-xs font-semibold text-blue-400 hover:underline cursor-pointer">
                View All
              </button>
            </div>
            {state.invoices.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-6 text-center">No invoices created yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase">
                      <th className="pb-2">Invoice #</th>
                      <th className="pb-2">Customer</th>
                      <th className="pb-2 text-right">Total</th>
                      <th className="pb-2 text-right">Balance</th>
                      <th className="pb-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {state.invoices.slice(0, 6).map((inv) => (
                      <tr key={inv.id}>
                        <td className="py-2 font-mono-num font-semibold text-blue-400">{inv.invoiceNo}</td>
                        <td className="py-2">{state.customers.find((c) => c.id === inv.customerId)?.companyName}</td>
                        <td className="py-2 text-right font-mono-num">{formatUSD(inv.total)}</td>
                        <td className="py-2 text-right font-mono-num text-amber-400">{formatUSD(inv.balanceDue)}</td>
                        <td className="py-2 text-right"><StatusBadge status={inv.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>

          <GlassCard className="lg:col-span-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Clock className="h-4 w-4 text-emerald-400" /> Recent Payments
              </h3>
              <button onClick={() => onNavigate("ledger")} className="text-xs font-semibold text-blue-400 hover:underline cursor-pointer">
                Payment Hub
              </button>
            </div>
            {state.payments.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] py-6 text-center">No payments recorded yet.</p>
            ) : (
              <div className="space-y-2.5">
                {state.payments.slice(0, 5).map((pay) => (
                  <div key={pay.id} className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-xs">
                    <div>
                      <p className="font-mono-num font-bold text-emerald-400">{pay.receiptNo} · {pay.method}</p>
                      <p className="text-[var(--text-primary)]">{state.customers.find((c) => c.id === pay.customerId)?.companyName}</p>
                    </div>
                    <p className="font-mono-num font-bold text-emerald-400">+{formatUSD(pay.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>
      )}

      <Modal open={Boolean(drilldown)} onClose={() => setDrilldown(null)} title={drilldown?.title || ""} subtitle={drilldown?.subtitle} maxWidth="max-w-3xl">
        {drilldown && (
          drilldown.rows.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-6 text-center">No matching records in MongoDB yet.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase">
                  <th className="pb-2">Ref</th>
                  <th className="pb-2">Party</th>
                  <th className="pb-2">Due</th>
                  <th className="pb-2 text-right">Amount</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {drilldown.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2 font-mono-num font-semibold text-blue-400">{r.col1}</td>
                    <td className="py-2">{r.col2}</td>
                    <td className="py-2">{r.col3}</td>
                    <td className="py-2 text-right font-mono-num font-bold">{r.amount}</td>
                    <td className="py-2 text-right"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </Modal>

      <Modal open={customizeOpen} onClose={() => setCustomizeOpen(false)} title="Customize Executive Dashboard" maxWidth="max-w-lg">
        <div className="space-y-2.5">
          {DEFAULT_WIDGETS.map((w) => (
            <label key={w.id} className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-3 cursor-pointer">
              <span className="text-sm font-medium">{w.label}</span>
              <input type="checkbox" checked={enabledWidgets.includes(w.id)} onChange={() => toggleWidget(w.id)} className="h-4 w-4 accent-blue-500" />
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <SecondaryButton onClick={() => setCustomizeOpen(false)}>Cancel</SecondaryButton>
          <PrimaryButton onClick={async () => { await onRunAction("user:dashboard-layout", { layout: enabledWidgets }); setCustomizeOpen(false); }}>
            Save Layout
          </PrimaryButton>
        </div>
      </Modal>
    </div>
  );
}
