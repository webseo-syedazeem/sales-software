"use client";

import React, { useMemo, useState } from "react";
import {
  TrendingUp,
  Zap,
  Calendar,
  Wallet,
  AlertTriangle,
  FileText,
  Users,
  SlidersHorizontal,
  Download,
  Plus,
  Target,
  ChevronRight,
  ArrowRight,
  Clock,
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
import { exportToCSV, formatCompactUSD, formatUSD, formatUSDate } from "@/lib/utils";
import {
  GlassCard,
  KpiTile,
  Modal,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from "@/components/ui/Primitives";

export type ClientERPState = Omit<ERPDatabaseState, "users"> & { users: SafeUser[] };

const DEFAULT_WIDGETS = [
  { id: "ceo-strip", label: "Company at a glance strip" },
  { id: "kpi-grid", label: "Hero sales & KPI cards" },
  { id: "revenue-chart", label: "Revenue & sales trend" },
  { id: "branch-performance", label: "Branch performance" },
  { id: "top-products", label: "Top products" },
  { id: "top-customers", label: "Top customers" },
  { id: "alerts-panel", label: "Alerts & low stock" },
  { id: "recent-activity", label: "Recent invoices & payments" },
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
    const pendingInvoices = activeInvoices.filter((i) => i.balanceDue > 0);
    const pendingAmount = pendingInvoices.reduce((s, i) => s + i.balanceDue, 0);

    const totalExpenses = state.expenses.reduce((s, e) => s + e.amount, 0);
    const totalPayables = state.suppliers.reduce((s, v) => s + v.currentPayable, 0);
    const totalCOGS = activeInvoices.reduce(
      (s, inv) => s + inv.items.reduce((ls, item) => ls + item.costBasis * item.quantity, 0),
      0
    );
    const grossProfit = totalSales - totalCOGS;
    const grossMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;
    const avgOrder = activeInvoices.length > 0 ? totalSales / activeInvoices.length : 0;
    const inventoryValuation = state.inventoryLots.reduce(
      (s, lot) => s + lot.availableStock * lot.unitCost,
      0
    );

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

    const branchData = state.branches.map((b) => {
      const sales = activeInvoices
        .filter((i) => i.branchId === b.id)
        .reduce((s, i) => s + i.total, 0);
      return {
        name: b.code,
        fullName: b.name,
        sales: Math.round(sales),
        target: b.monthlyTarget,
      };
    });

    const monthlyTrend: Array<{ month: string; revenue: number; cashIn: number; expenses: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short" });
      monthlyTrend.push({
        month: label,
        revenue: Math.round(
          activeInvoices.filter((inv) => inv.issueDate.startsWith(ym)).reduce((s, inv) => s + inv.total, 0)
        ),
        cashIn: Math.round(
          state.payments
            .filter((p) => p.date.startsWith(ym) && p.paymentType !== "Refund" && p.paymentType !== "Reversal")
            .reduce((s, p) => s + p.amount, 0)
        ),
        expenses: Math.round(
          state.expenses.filter((e) => e.date.startsWith(ym)).reduce((s, e) => s + e.amount, 0)
        ),
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
      pendingInvoices,
      pendingAmount,
      totalExpenses,
      totalPayables,
      grossProfit,
      grossMargin,
      avgOrder,
      inventoryValuation,
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

  const todayFormatted = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const stripPillars = [
    { label: "Revenue", val: formatCompactUSD(metrics.yearlySales), onClick: () => openInvoiceDrilldown("YTD Revenue", (i) => i.status !== "Cancelled") },
    { label: "Sales", val: `${state.salesOrders.length} orders`, onClick: () => onNavigate("sales") },
    { label: "Profit", val: formatCompactUSD(metrics.grossProfit), onClick: () => onNavigate("accounting") },
    { label: "Expenses", val: formatCompactUSD(metrics.totalExpenses), onClick: () => onNavigate("accounting") },
    { label: "Inventory", val: formatCompactUSD(metrics.inventoryValuation), onClick: () => onNavigate("inventory") },
    { label: "Receivables", val: formatCompactUSD(metrics.totalReceivables), onClick: () => onNavigate("ledger") },
    { label: "Payables", val: formatCompactUSD(metrics.totalPayables), onClick: () => onNavigate("purchasing") },
    { label: "Customers", val: String(state.customers.length), onClick: () => onNavigate("customers") },
    { label: "Branches", val: String(state.branches.length), onClick: () => onNavigate("operations") },
    { label: "Employees", val: String(state.employees.length), onClick: () => onNavigate("operations") },
  ];

  return (
    <div className="space-y-6">
      {/* Nexora Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-1">
        <div>
          <h1 className="h text-[26px] font-bold text-[#111317] m-0">Executive overview</h1>
          <p className="mt-1.5 text-[14px] text-[#5F636C]">
            Welcome back, {user.name.split(" ")[0]} · {todayFormatted} · Consolidated across{" "}
            {state.branches.length} branch(es)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={() => setCustomizeOpen((v) => !v)}>
            <SlidersHorizontal className="h-4 w-4" /> Customize
          </SecondaryButton>
          <SecondaryButton
            onClick={() =>
              exportToCSV("nexora-executive-invoices.csv", state.invoices as unknown as Record<string, unknown>[])
            }
          >
            <Download className="h-4 w-4" /> Export
          </SecondaryButton>
          <PrimaryButton onClick={() => onNavigate("sales")}>
            <Plus className="h-4 w-4" /> New sale
          </PrimaryButton>
        </div>
      </div>

      {/* Inline Nexora Lime-Tinted Customize Bar */}
      {customizeOpen && (
        <div className="nexora-card p-5 border-[#CFE98A] bg-[#FAFCF4] space-y-3.5">
          <div className="flex items-center gap-3">
            <span className="h font-bold text-[16px] text-[#111317]">Customize your dashboard</span>
            <span className="text-[13px] text-[#5F636C]">Choose the widgets management sees first.</span>
            <PrimaryButton
              className="ml-auto min-h-[32px] text-[12.5px] px-3"
              onClick={async () => {
                await onRunAction("user:dashboard-layout", { layout: enabledWidgets });
                setCustomizeOpen(false);
              }}
            >
              Done & Save
            </PrimaryButton>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {DEFAULT_WIDGETS.map((w) => (
              <label
                key={w.id}
                className="flex items-center gap-2.5 min-h-[42px] px-3.5 border border-[#E0DDD5] rounded-[12px] bg-white text-[13.5px] font-semibold text-[#111317] cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="nexora-toggle"
                  checked={enabledWidgets.includes(w.id)}
                  onChange={() => toggleWidget(w.id)}
                />
                {w.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Exact Nexora Obsidian "COMPANY AT A GLANCE" Strip */}
      {show("ceo-strip") && (
        <div className="bg-[#111317] rounded-[14px] px-3.5 py-3 shadow-[0_24px_50px_-30px_rgba(17,19,23,0.8)]">
          <div className="flex items-center gap-2 px-2.5 pt-1 pb-2 text-[#CFE98A] text-[11.5px] font-bold tracking-[0.08em]">
            <Target className="h-3.5 w-3.5 text-[#C5F04A]" />
            COMPANY AT A GLANCE · CLICK ANY NUMBER TO SEE THE TRANSACTIONS BEHIND IT
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {stripPillars.map((p, idx) => (
              <React.Fragment key={p.label}>
                <button
                  onClick={p.onClick}
                  className="flex-1 min-w-[92px] min-h-[60px] text-left px-2.5 py-2 rounded-[10px] hover:bg-[#2A2E37] transition-colors cursor-pointer"
                >
                  <div className="text-[10.5px] text-[#A3A8B3] font-semibold tracking-[0.06em] uppercase">
                    {p.label}
                  </div>
                  <div className="h num text-[16.5px] font-bold text-white mt-1">{p.val}</div>
                </button>
                {idx < stripPillars.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-[#C5F04A] hidden xl:block shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Hero Dark Ink Total Sales Card + 6 Crisp White Nexora KPI Cards */}
      {show("kpi-grid") && (
        <div className="flex flex-wrap gap-4 items-stretch">
          {/* Hero Dark Obsidian Sales Card */}
          <button
            onClick={() => openInvoiceDrilldown("Year-to-Date Sales Invoices", (i) => i.status !== "Cancelled")}
            className="flex-1 basis-[360px] min-w-0 relative overflow-hidden border border-[#23262E] rounded-[14px] bg-[#111317] text-white px-6 pt-5 pb-0 text-left cursor-pointer flex flex-col shadow-[0_24px_50px_-30px_rgba(17,19,23,0.9)] hover:border-[#3A3F4A] transition-colors"
          >
            <div aria-hidden="true" className="pointer-events-none absolute -right-[80px] -top-[80px] w-[250px] h-[250px] rounded-full border border-[#23262E]" />
            <div aria-hidden="true" className="pointer-events-none absolute -right-[30px] -top-[30px] w-[150px] h-[150px] rounded-full border border-[#23262E]" />

            <div className="flex items-center gap-2.5 relative z-10">
              <span className="w-[34px] h-[34px] rounded-[9px] bg-[#C5F04A] text-[#111317] flex items-center justify-center">
                <TrendingUp className="h-[17px] w-[17px]" />
              </span>
              <span className="text-[13px] font-semibold text-[#A3A8B3] flex-1">
                Total sales · Year to date
              </span>
              <span className="rounded-[6px] px-2 py-0.5 text-[11.5px] font-semibold bg-[#C5F04A]/15 text-[#C5F04A]">
                Live MongoDB
              </span>
            </div>

            <div className="h num text-[40px] sm:text-[44px] font-extrabold mt-4 relative z-10 leading-none">
              {formatUSD(metrics.yearlySales)}
            </div>
            <div className="text-[13px] text-[#A3A8B3] mt-2 relative z-10">
              {state.salesOrders.length} orders · {state.invoices.length} invoices recorded
            </div>

            <div className="mt-4 -mx-6 relative z-10">
              <svg width="100%" height="88" preserveAspectRatio="none" viewBox="0 0 420 96" aria-hidden="true" className="overflow-visible">
                <path
                  d="M20 80 C70 72, 120 75, 175 56 C230 44, 290 36, 355 24 C380 19, 395 16, 402 14 L402 96 L20 96 Z"
                  fill="#C5F04A"
                  fillOpacity="0.10"
                />
                <path
                  d="M20 80 C70 72, 120 75, 175 56 C230 44, 290 36, 355 24 C380 19, 395 16, 402 14"
                  fill="none"
                  stroke="#C5F04A"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  pathLength={100}
                  className="nexora-draw"
                />
              </svg>
            </div>

            <div className="grid grid-cols-3 -mx-6 mt-auto border-t border-[#23262E] relative z-10">
              <div className="px-5 py-3.5 border-r border-[#23262E]">
                <div className="text-[10.5px] text-[#8C919C] font-semibold tracking-[0.06em]">GROSS MARGIN</div>
                <div className="h num text-[16px] font-bold mt-0.5">{metrics.grossMargin.toFixed(1)}%</div>
              </div>
              <div className="px-5 py-3.5 border-r border-[#23262E]">
                <div className="text-[10.5px] text-[#8C919C] font-semibold tracking-[0.06em]">PRODUCTS</div>
                <div className="h num text-[16px] font-bold mt-0.5">{state.products.length}</div>
              </div>
              <div className="px-5 py-3.5">
                <div className="text-[10.5px] text-[#8C919C] font-semibold tracking-[0.06em]">AVG. ORDER</div>
                <div className="h num text-[16px] font-bold mt-0.5">{formatCompactUSD(metrics.avgOrder)}</div>
              </div>
            </div>
          </button>

          {/* 6 Crisp White Nexora KPI Tiles */}
          <div className="flex-[2] basis-[540px] min-w-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiTile
              label="Today's sales"
              value={formatUSD(metrics.todaySales)}
              delta={`${state.salesOrders.filter((o) => o.date === new Date().toISOString().slice(0, 10)).length} today`}
              positive
              sublabel="Same-day invoiced"
              icon={<Zap className="h-[17px] w-[17px]" />}
              tone="blue"
              delay={0.04}
              onClick={() => openInvoiceDrilldown("Today's Invoices", (i) => i.issueDate === new Date().toISOString().slice(0, 10))}
            />
            <KpiTile
              label="Sales this month"
              value={formatUSD(metrics.monthlySales)}
              delta="Live MTD"
              positive
              sublabel={`${state.branches.length} active branch(es)`}
              icon={<Calendar className="h-[17px] w-[17px]" />}
              tone="emerald"
              delay={0.08}
              onClick={() => openInvoiceDrilldown("Current Month Invoices", (i) => i.issueDate.startsWith(new Date().toISOString().slice(0, 7)))}
            />
            <KpiTile
              label="Total receivables"
              value={formatUSD(metrics.totalReceivables)}
              delta={`${metrics.pendingInvoices.length} open`}
              positive={metrics.totalReceivables === 0}
              sublabel="Open customer balances"
              icon={<Wallet className="h-[17px] w-[17px]" />}
              tone="amber"
              delay={0.12}
              onClick={() => onNavigate("ledger")}
            />
            <KpiTile
              label="Overdue payments"
              value={formatUSD(metrics.overdueAmount)}
              delta={`${metrics.overdueInvoices.length} past due`}
              positive={metrics.overdueInvoices.length === 0}
              sublabel="Follow-up queue"
              icon={<AlertTriangle className="h-[17px] w-[17px]" />}
              tone="rose"
              delay={0.16}
              onClick={() => onNavigate("ledger")}
            />
            <KpiTile
              label="Pending invoices"
              value={formatUSD(metrics.pendingAmount)}
              delta={`${metrics.pendingInvoices.length} unpaid`}
              positive={metrics.pendingInvoices.length === 0}
              sublabel="Awaiting settlement"
              icon={<FileText className="h-[17px] w-[17px]" />}
              tone="indigo"
              delay={0.2}
              onClick={() => onNavigate("invoices")}
            />
            <KpiTile
              label="Total customers"
              value={String(state.customers.length)}
              delta={`${state.customers.filter((c) => c.segment === "VIP").length} VIP`}
              positive
              sublabel="Active CRM accounts"
              icon={<Users className="h-[17px] w-[17px]" />}
              tone="blue"
              delay={0.24}
              onClick={() => onNavigate("customers")}
            />
          </div>
        </div>
      )}

      {/* Charts Row — Exact Nexora Palette (#16181D Ink, #9BCB2E Lime, #F2A766 Orange) */}
      {(show("revenue-chart") || show("branch-performance")) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {show("revenue-chart") && (
            <GlassCard className="lg:col-span-7">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="h text-[17px] font-bold text-[#111317]">Revenue & cash-flow trend</h2>
                  <p className="text-[13px] text-[#5F636C] mt-0.5">
                    6-month live roll-up directly from MongoDB invoices, payments & expenses
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[12px] text-[#5F636C]">
                  <span className="inline-flex items-center gap-1.5"><span className="w-3 h-[3px] rounded bg-[#16181D]" />Revenue</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-3 h-[3px] rounded bg-[#9BCB2E]" />Cash In</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-3 h-[3px] rounded bg-[#F2A766]" />Expenses</span>
                </div>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics.monthlyTrend}>
                    <defs>
                      <linearGradient id="nexInkGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#16181D" stopOpacity={0.14} />
                        <stop offset="95%" stopColor="#16181D" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="nexLimeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#9BCB2E" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="#9BCB2E" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEECE7" />
                    <XAxis dataKey="month" stroke="#6B6F78" fontSize={12} />
                    <YAxis stroke="#6B6F78" fontSize={12} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#111317", color: "#fff", border: "none", borderRadius: "10px", fontSize: "12px" }}
                      formatter={(val: number) => formatUSD(val)}
                    />
                    <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#16181D" strokeWidth={2.5} fill="url(#nexInkGrad)" />
                    <Area type="monotone" dataKey="cashIn" name="Cash Collected" stroke="#9BCB2E" strokeWidth={2.2} fill="url(#nexLimeGrad)" />
                    <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#F2A766" strokeWidth={2} fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          )}

          {show("branch-performance") && (
            <GlassCard className="lg:col-span-5">
              <div className="mb-4">
                <h2 className="h text-[17px] font-bold text-[#111317]">Branch performance</h2>
                <p className="text-[13px] text-[#5F636C] mt-0.5">
                  Actual invoiced sales vs monthly target by branch
                </p>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.branchData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEECE7" />
                    <XAxis dataKey="name" stroke="#6B6F78" fontSize={12} />
                    <YAxis stroke="#6B6F78" fontSize={12} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#111317", color: "#fff", border: "none", borderRadius: "10px", fontSize: "12px" }}
                      formatter={(val: number) => formatUSD(val)}
                    />
                    <Bar dataKey="sales" name="Actual Sales" fill="#16181D" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="target" name="Target" fill="#C5F04A" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {/* Mid Row: Top Products, Top Customers, Alerts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {show("top-products") && (
          <GlassCard className="lg:col-span-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="h text-[16px] font-bold text-[#111317]">Top products</h2>
              <button onClick={() => onNavigate("products")} className="text-[12.5px] font-semibold text-[#111317] hover:underline cursor-pointer inline-flex items-center gap-1">
                All products <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            {metrics.topProducts.length === 0 ? (
              <p className="text-[13px] text-[#5F636C] py-6 text-center">
                No product sales yet. Create your first order in Sales to populate live rankings.
              </p>
            ) : (
              <div className="space-y-2">
                {metrics.topProducts.slice(0, 5).map((p, idx) => (
                  <div key={p.sku} className="flex items-center justify-between rounded-[10px] bg-[#F6F5F1] px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold text-[#111317] truncate">
                        <span className="num text-[12px] text-[#5F636C] mr-1.5">#{idx + 1}</span>
                        {p.name}
                      </p>
                      <p className="text-[11.5px] text-[#5F636C] num">{p.sku} · {p.qty} sold</p>
                    </div>
                    <div className="text-right">
                      <p className="num text-[13.5px] font-bold text-[#111317]">{formatUSD(p.rev)}</p>
                      <p className="text-[11px] text-[#05603F] font-semibold">GP {formatCompactUSD(p.profit)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        )}

        {show("top-customers") && (
          <GlassCard className="lg:col-span-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="h text-[16px] font-bold text-[#111317]">Top customers</h2>
              <button onClick={() => onNavigate("customers")} className="text-[12.5px] font-semibold text-[#111317] hover:underline cursor-pointer inline-flex items-center gap-1">
                CRM <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            {metrics.topCustomers.length === 0 ? (
              <p className="text-[13px] text-[#5F636C] py-6 text-center">
                No customers added yet. Add accounts in Customers & CRM.
              </p>
            ) : (
              <div className="space-y-2">
                {metrics.topCustomers.slice(0, 5).map((c) => (
                  <div key={c.id} className="rounded-[10px] bg-[#F6F5F1] px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13.5px] font-semibold text-[#111317] truncate">{c.companyName}</p>
                      <StatusBadge status={c.segment} />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[12px] text-[#5F636C]">
                      <span>Billed: <b className="num text-[#111317]">{formatUSD(c.billed)}</b></span>
                      <span className="num font-semibold text-[#7F4505]">Bal: {formatUSD(c.currentBalance)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        )}

        {show("alerts-panel") && (
          <GlassCard className="lg:col-span-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="h text-[16px] font-bold text-[#111317]">Alerts & low stock</h2>
              <AlertTriangle className="h-4 w-4 text-[#7F4505]" />
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {metrics.overdueInvoices.map((inv) => (
                <div key={inv.id} onClick={() => onNavigate("ledger")} className="rounded-[10px] bg-[#FCE8E8] p-3 cursor-pointer">
                  <div className="flex justify-between text-[12px] font-bold text-[#A11A1A] num">
                    <span>OVERDUE · {inv.invoiceNo}</span>
                    <span>{formatUSD(inv.balanceDue)}</span>
                  </div>
                  <p className="text-[11.5px] text-[#4A4E57] mt-0.5">
                    {state.customers.find((c) => c.id === inv.customerId)?.companyName} · Due {formatUSDate(inv.dueDate)}
                  </p>
                </div>
              ))}
              {metrics.lowStockProducts.slice(0, 4).map(({ product, qty }) => (
                <div key={product.id} onClick={() => onNavigate("inventory")} className="rounded-[10px] bg-[#FDF0DC] p-3 cursor-pointer">
                  <div className="flex justify-between text-[12px] font-bold text-[#7F4505]">
                    <span>LOW STOCK · {product.name}</span>
                    <span className="num">{qty} / {product.reorderLevel}</span>
                  </div>
                  <p className="text-[11.5px] text-[#4A4E57] mt-0.5">
                    SKU {product.sku} below reorder threshold.
                  </p>
                </div>
              ))}
              {metrics.overdueInvoices.length === 0 && metrics.lowStockProducts.length === 0 && (
                <p className="text-[13px] text-[#05603F] bg-[#E3F5EC] rounded-[10px] p-4 text-center font-semibold">
                  All inventory & receivable alerts are clear.
                </p>
              )}
            </div>
          </GlassCard>
        )}
      </div>

      {/* Bottom Row: Recent Invoices & Payments */}
      {show("recent-activity") && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <GlassCard className="lg:col-span-7 p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEECE7] flex items-center justify-between">
              <h2 className="h text-[16px] font-bold text-[#111317]">Recent invoices</h2>
              <button onClick={() => onNavigate("invoices")} className="text-[12.5px] font-semibold text-[#111317] hover:underline cursor-pointer">
                View all
              </button>
            </div>
            {state.invoices.length === 0 ? (
              <p className="text-[13px] text-[#5F636C] py-8 text-center">No invoices created yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-[#F8F7F3] text-[#6B6F78] uppercase text-[11px] border-b border-[#E6E3DC]">
                    <tr>
                      <th className="px-5 py-2.5">Invoice #</th>
                      <th className="px-5 py-2.5">Customer</th>
                      <th className="px-5 py-2.5 text-right">Total</th>
                      <th className="px-5 py-2.5 text-right">Balance</th>
                      <th className="px-5 py-2.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEECE7]">
                    {state.invoices.slice(0, 6).map((inv) => (
                      <tr key={inv.id} className="hover:bg-[#F8F7F3]">
                        <td className="px-5 py-3 num font-bold text-[#111317]">{inv.invoiceNo}</td>
                        <td className="px-5 py-3 text-[#4A4E57]">{state.customers.find((c) => c.id === inv.customerId)?.companyName}</td>
                        <td className="px-5 py-3 text-right num font-semibold">{formatUSD(inv.total)}</td>
                        <td className="px-5 py-3 text-right num font-bold text-[#7F4505]">{formatUSD(inv.balanceDue)}</td>
                        <td className="px-5 py-3 text-right"><StatusBadge status={inv.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>

          <GlassCard className="lg:col-span-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="h text-[16px] font-bold text-[#111317] flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#05603F]" /> Recent payments
              </h2>
              <button onClick={() => onNavigate("ledger")} className="text-[12.5px] font-semibold text-[#111317] hover:underline cursor-pointer">
                Ledger
              </button>
            </div>
            {state.payments.length === 0 ? (
              <p className="text-[13px] text-[#5F636C] py-8 text-center">No payments recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {state.payments.slice(0, 5).map((pay) => (
                  <div key={pay.id} className="flex items-center justify-between rounded-[10px] bg-[#F6F5F1] px-3.5 py-2.5 text-[13px]">
                    <div>
                      <p className="num font-bold text-[#111317]">{pay.receiptNo} · {pay.method}</p>
                      <p className="text-[12px] text-[#5F636C]">{state.customers.find((c) => c.id === pay.customerId)?.companyName}</p>
                    </div>
                    <span className="num font-bold text-[#05603F]">+{formatUSD(pay.amount)}</span>
                  </div>
                ))}
              </div>
            )}
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
        {drilldown &&
          (drilldown.rows.length === 0 ? (
            <p className="text-xs text-[#5F636C] py-6 text-center">No records found yet.</p>
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#F8F7F3] text-[#6B6F78] uppercase text-[11px] border-b border-[#E6E3DC]">
                <tr>
                  <th className="px-3 py-2">Ref</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEECE7]">
                {drilldown.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2.5 num font-bold text-[#111317]">{r.col1}</td>
                    <td className="px-3 py-2.5">{r.col2}</td>
                    <td className="px-3 py-2.5 text-[#5F636C]">{r.col3}</td>
                    <td className="px-3 py-2.5 text-right num font-bold">{r.amount}</td>
                    <td className="px-3 py-2.5 text-right"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </Modal>
    </div>
  );
}
