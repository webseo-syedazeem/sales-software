"use client";

import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  Building2,
  Truck,
  Check,
  X,
} from "lucide-react";
import type { ERPDatabaseState, SafeUser } from "@/types/erp";
import { daysBetween, exportToCSV, formatCompactUSD, formatUSD, formatUSDate } from "@/lib/utils";
import {
  GlassCard,
  KpiTile,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from "@/components/ui/Primitives";

export type ClientERPState = Omit<ERPDatabaseState, "users"> & { users: SafeUser[] };

const DEFAULT_WIDGETS = [
  { id: "kpi", label: "Hero sales & KPI cards" },
  { id: "rev", label: "Revenue & sales trend" },
  { id: "fin", label: "Cash-flow overview" },
  { id: "charts", label: "Sales by category donut" },
  { id: "topp", label: "Top-selling products" },
  { id: "topc", label: "Top customers" },
  { id: "out", label: "Receivables aging" },
  { id: "profit", label: "Profit & expenses" },
  { id: "inv", label: "Low-stock alerts" },
];

const DONUT_COLORS = ["#16181D", "#9BCB2E", "#CFE98A", "#E8711C", "#F7BE8A", "#5C6B2E", "#94A3B8"];
const AVATAR_TONES = [
  { bg: "#E6EDFD", fg: "#1E3FAE" },
  { bg: "#EEF6DA", fg: "#3D5A0A" },
  { bg: "#FDF0DC", fg: "#7F4505" },
  { bg: "#E3F5EC", fg: "#05603F" },
  { bg: "#FCE8E8", fg: "#A11A1A" },
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
  const [revMode, setRevMode] = useState<"monthly" | "yearly">("monthly");
  const [txTab, setTxTab] = useState<"all" | "sales" | "payments">("all");
  const [enabledWidgets, setEnabledWidgets] = useState<string[]>(
    user.dashboardLayout && user.dashboardLayout.length > 0
      ? user.dashboardLayout
      : DEFAULT_WIDGETS.map((w) => w.id)
  );
  const [drill, setDrill] = useState<{
    title: string;
    value: string;
    sub: string;
    split: Array<{ l: string; v: string }>;
    rows: Array<{ ref: string; cust: string; date: string; status: string; amt: string; tab: string }>;
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
    const netProfit = grossProfit - totalExpenses;
    const grossMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;
    const netMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;
    const avgOrder = activeInvoices.length > 0 ? totalSales / activeInvoices.length : 0;
    const inventoryValuation = state.inventoryLots.reduce(
      (s, lot) => s + lot.availableStock * lot.unitCost,
      0
    );

    // 12-month live revenue series for Monthly chart
    const months12: Array<{ label: string; ym: string; rev: number }> = [];
    for (let m = 0; m < 12; m++) {
      const d = new Date(now.getFullYear(), m, 1);
      const ym = `${d.getFullYear()}-${String(m + 1).padStart(2, "0")}`;
      const rev = activeInvoices
        .filter((i) => i.issueDate.startsWith(ym))
        .reduce((s, i) => s + i.total, 0);
      months12.push({ label: d.toLocaleDateString("en-US", { month: "short" }), ym, rev });
    }
    const maxMonthRev = Math.max(1000, ...months12.map((m) => m.rev));

    // Yearly 5-year buckets
    const yearly5 = [4, 3, 2, 1, 0].map((offset) => {
      const yr = String(now.getFullYear() - offset);
      const rev = activeInvoices
        .filter((i) => i.issueDate.startsWith(yr))
        .reduce((s, i) => s + i.total, 0);
      return { year: offset === 0 ? `${yr} YTD` : yr, rev, isCurrent: offset === 0 };
    });
    const maxYearRev = Math.max(1000, ...yearly5.map((y) => y.rev));

    // Cash-flow last 6 months
    const cash6: Array<{ label: string; inflow: number; outflow: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const inflow = state.payments
        .filter((p) => p.date.startsWith(ym) && p.paymentType !== "Refund" && p.paymentType !== "Reversal")
        .reduce((s, p) => s + p.amount, 0);
      const outflow =
        state.expenses.filter((e) => e.date.startsWith(ym)).reduce((s, e) => s + e.amount, 0) +
        state.purchaseOrders.filter((po) => po.date.startsWith(ym)).reduce((s, po) => s + po.amountPaid, 0);
      cash6.push({ label: d.toLocaleDateString("en-US", { month: "short" }), inflow, outflow });
    }
    const totalInflow = cash6.reduce((s, c) => s + c.inflow, 0);
    const totalOutflow = cash6.reduce((s, c) => s + c.outflow, 0);
    const maxCash = Math.max(1000, ...cash6.flatMap((c) => [c.inflow, c.outflow]));

    // Product breakdown (for Donut + Top Products)
    const prodMap = new Map<string, { id: string; name: string; sku: string; rev: number; qty: number }>();
    for (const p of state.products) {
      prodMap.set(p.id, { id: p.id, name: p.name, sku: p.sku, rev: 0, qty: 0 });
    }
    for (const inv of activeInvoices) {
      for (const item of inv.items) {
        const cur = prodMap.get(item.productId) || {
          id: item.productId,
          name: item.productName,
          sku: item.sku,
          rev: 0,
          qty: 0,
        };
        cur.rev += item.lineTotal;
        cur.qty += item.quantity;
        prodMap.set(item.productId, cur);
      }
    }
    const allProdRanked = Array.from(prodMap.values()).sort((a, b) => b.rev - a.rev);
    const totalProdRev = allProdRanked.reduce((s, p) => s + p.rev, 0);
    let runningOffset = 0;
    const donutSlices = allProdRanked.slice(0, 7).map((p, idx) => {
      const pct = totalProdRev > 0 ? (p.rev / totalProdRev) * 100 : 100 / Math.max(1, Math.min(7, allProdRanked.length));
      const dash = Math.max(0, pct - 0.6);
      const offset = -runningOffset;
      runningOffset += pct;
      return {
        name: p.name,
        pct: totalProdRev > 0 ? Math.round(pct) : 0,
        dash,
        offset,
        color: DONUT_COLORS[idx % DONUT_COLORS.length],
      };
    });

    const maxProdRev = Math.max(1, allProdRanked[0]?.rev || 1);

    // Top Customers
    const topCustomers = state.customers
      .map((c, idx) => {
        const billed = activeInvoices
          .filter((i) => i.customerId === c.id)
          .reduce((s, i) => s + i.total, 0);
        const ini = c.companyName
          .split(" ")
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        return {
          ...c,
          billed,
          ini,
          tone: AVATAR_TONES[idx % AVATAR_TONES.length],
        };
      })
      .sort((a, b) => b.billed - a.billed);

    // Branch performance
    const branchStats = state.branches.map((b) => {
      const sales = activeInvoices
        .filter((i) => i.branchId === b.id)
        .reduce((s, i) => s + i.total, 0);
      const target = b.monthlyTarget || 100000;
      const pct = Math.min(100, Math.round((sales / Math.max(1, target)) * 100));
      return { ...b, sales, target, pct };
    });

    // Receivables Aging (5 buckets)
    const ag = { cur: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
    for (const inv of pendingInvoices) {
      const d = daysBetween(inv.dueDate, todayIso);
      if (d <= 0) ag.cur += inv.balanceDue;
      else if (d <= 30) ag.d30 += inv.balanceDue;
      else if (d <= 60) ag.d60 += inv.balanceDue;
      else if (d <= 90) ag.d90 += inv.balanceDue;
      else ag.d90p += inv.balanceDue;
    }
    const agDenom = Math.max(1, totalReceivables);
    const agingBuckets = [
      { l: "Current (not due)", v: ag.cur, pct: Math.round((ag.cur / agDenom) * 100), c: "#16181D" },
      { l: "1–30 days", v: ag.d30, pct: Math.round((ag.d30 / agDenom) * 100), c: "#9BCB2E" },
      { l: "31–60 days", v: ag.d60, pct: Math.round((ag.d60 / agDenom) * 100), c: "#F7BE8A" },
      { l: "61–90 days", v: ag.d90, pct: Math.round((ag.d90 / agDenom) * 100), c: "#E8711C" },
      { l: "90+ days", v: ag.d90p, pct: Math.round((ag.d90p / agDenom) * 100), c: "#B91C1C" },
    ];

    // Expenses by category
    const expMap = new Map<string, number>();
    for (const e of state.expenses) {
      expMap.set(e.category, (expMap.get(e.category) || 0) + e.amount);
    }
    const expCats = Array.from(expMap.entries())
      .map(([l, v]) => ({ l, v }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 4);
    const maxExpCat = Math.max(1, expCats[0]?.v || 1);

    // Low stock products
    const lowStock = state.products
      .map((p) => {
        const qty = state.inventoryLots
          .filter((l) => l.productId === p.id)
          .reduce((s, l) => s + l.availableStock, 0);
        const pct = Math.min(100, Math.round((qty / Math.max(1, p.reorderLevel)) * 100));
        return { product: p, qty, pct };
      })
      .filter((x) => x.qty <= x.product.reorderLevel)
      .sort((a, b) => a.qty - b.qty);

    // Unified recent transactions feed
    const recentTx = [
      ...state.invoices.map((i) => ({
        kind: "sales" as const,
        ab: "IN",
        bg: "#EEF6DA",
        fg: "#3D5A0A",
        ref: i.invoiceNo,
        cust: state.customers.find((c) => c.id === i.customerId)?.companyName || "Customer",
        date: i.issueDate,
        status: i.status,
        amt: formatUSD(i.total),
      })),
      ...state.payments.map((p) => ({
        kind: "payments" as const,
        ab: "PM",
        bg: "#E3F5EC",
        fg: "#05603F",
        ref: p.receiptNo,
        cust: state.customers.find((c) => c.id === p.customerId)?.companyName || "Customer",
        date: p.date,
        status: p.reconciled ? "Reconciled" : "Pending",
        amt: `+${formatUSD(p.amount)}`,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));

    const pendingApprovals = state.approvals.filter((a) => a.status === "Pending");

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
      netProfit,
      grossMargin,
      netMargin,
      avgOrder,
      inventoryValuation,
      months12,
      maxMonthRev,
      yearly5,
      maxYearRev,
      cash6,
      totalInflow,
      totalOutflow,
      maxCash,
      allProdRanked,
      maxProdRev,
      donutSlices,
      topCustomers,
      branchStats,
      agingBuckets,
      expCats,
      maxExpCat,
      lowStock,
      recentTx,
      pendingApprovals,
    };
  }, [state]);

  const show = (id: string) => enabledWidgets.includes(id);
  const toggleWidget = (id: string) => {
    setEnabledWidgets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const openDrill = (
    title: string,
    value: string,
    sub: string,
    filterFn: (inv: ClientERPState["invoices"][0]) => boolean
  ) => {
    const matched = state.invoices.filter(filterFn);
    setDrill({
      title,
      value,
      sub,
      split: [
        { l: "Invoices", v: String(matched.length) },
        { l: "Billed", v: formatCompactUSD(matched.reduce((s, i) => s + i.total, 0)) },
        { l: "Open balance", v: formatCompactUSD(matched.reduce((s, i) => s + i.balanceDue, 0)) },
      ],
      rows: matched.slice(0, 12).map((inv) => ({
        ref: inv.invoiceNo,
        cust: state.customers.find((c) => c.id === inv.customerId)?.companyName || "Customer",
        date: formatUSDate(inv.issueDate),
        status: inv.status,
        amt: formatUSD(inv.total),
        tab: "invoices",
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
    { label: "Revenue", val: formatCompactUSD(metrics.yearlySales), onClick: () => openDrill("Revenue · YTD", formatUSD(metrics.yearlySales), "Active invoiced revenue", (i) => i.status !== "Cancelled") },
    { label: "Sales", val: `${state.salesOrders.length} orders`, onClick: () => onNavigate("sales") },
    { label: "Profit", val: formatCompactUSD(metrics.grossProfit), onClick: () => onNavigate("accounting") },
    { label: "Expenses", val: formatCompactUSD(metrics.totalExpenses), onClick: () => onNavigate("accounting") },
    { label: "Inventory", val: formatCompactUSD(metrics.inventoryValuation), onClick: () => onNavigate("inventory") },
    { label: "Receivables", val: formatCompactUSD(metrics.totalReceivables), onClick: () => openDrill("Total Receivables", formatUSD(metrics.totalReceivables), "Open balances awaiting payment", (i) => i.balanceDue > 0) },
    { label: "Payables", val: formatCompactUSD(metrics.totalPayables), onClick: () => onNavigate("purchasing") },
    { label: "Customers", val: String(state.customers.length), onClick: () => onNavigate("customers") },
    { label: "Branches", val: String(state.branches.length), onClick: () => onNavigate("admin") },
    { label: "Employees", val: String(state.employees.length), onClick: () => onNavigate("analytics") },
  ];

  const visibleTx = metrics.recentTx.filter((t) => txTab === "all" || t.kind === txTab).slice(0, 7);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-1">
        <div>
          <h1 className="h text-[26px] font-bold text-[#111317] m-0">Executive overview</h1>
          <p className="mt-1.5 text-[14px] text-[#5F636C]">
            Welcome back, {user.name.split(" ")[0]} · {todayFormatted} · Consolidated across {state.branches.length} branch(es)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={() => setCustomizeOpen((v) => !v)}>
            <SlidersHorizontal className="h-4 w-4" /> Customize
          </SecondaryButton>
          <SecondaryButton
            onClick={() =>
              exportToCSV("nexora-invoices.csv", state.invoices as unknown as Record<string, unknown>[])
            }
          >
            <Download className="h-4 w-4" /> Export
          </SecondaryButton>
          <PrimaryButton onClick={() => onNavigate("sales")}>
            <Plus className="h-4 w-4" /> New sale
          </PrimaryButton>
        </div>
      </div>

      {/* Inline Nexora Customize Bar */}
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
              Done
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

      {/* Row 1: COMPANY AT A GLANCE Strip */}
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

      {/* Row 2: Hero Dark Total Sales Card + 6 Crisp White KPI Cards */}
      {show("kpi") && (
        <div className="flex flex-wrap gap-4 items-stretch">
          <button
            onClick={() => openDrill("Total sales · Year to date", formatUSD(metrics.yearlySales), `${state.salesOrders.length} orders · Live MongoDB`, (i) => i.status !== "Cancelled")}
            className="flex-1 basis-[360px] min-w-0 relative overflow-hidden border border-[#23262E] rounded-[14px] bg-[#111317] text-white px-6 pt-5 pb-0 text-left cursor-pointer flex flex-col shadow-[0_24px_50px_-30px_rgba(17,19,23,0.9)]"
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
                Live
              </span>
            </div>

            <div className="h num text-[40px] sm:text-[44px] font-extrabold mt-4 relative z-10 leading-none">
              {formatUSD(metrics.yearlySales)}
            </div>
            <div className="text-[13px] text-[#A3A8B3] mt-2 relative z-10">
              {state.salesOrders.length} orders · {state.invoices.length} invoices issued
            </div>

            <div className="mt-4 -mx-6 relative z-10">
              <svg width="100%" height="88" preserveAspectRatio="none" viewBox="0 0 420 96" aria-hidden="true" className="overflow-visible">
                <path d="M20 80 C70 72, 120 75, 175 56 C230 44, 290 36, 355 24 C380 19, 395 16, 402 14 L402 96 L20 96 Z" fill="#C5F04A" fillOpacity="0.10" />
                <path d="M20 80 C70 72, 120 75, 175 56 C230 44, 290 36, 355 24 C380 19, 395 16, 402 14" fill="none" stroke="#C5F04A" strokeWidth="2.2" strokeLinecap="round" pathLength={100} className="nexora-draw" />
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

          <div className="flex-[2] basis-[540px] min-w-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiTile
              label="Today's sales"
              value={formatUSD(metrics.todaySales)}
              delta="Today"
              positive
              sublabel={`${state.branches.length} branch(es)`}
              icon={<Zap className="h-[17px] w-[17px]" />}
              tone="blue"
              onClick={() => openDrill("Today's sales", formatUSD(metrics.todaySales), "Same-day invoiced orders", (i) => i.issueDate === new Date().toISOString().slice(0, 10))}
            />
            <KpiTile
              label="Sales this month"
              value={formatUSD(metrics.monthlySales)}
              delta="MTD"
              positive
              sublabel="Current fiscal period"
              icon={<Calendar className="h-[17px] w-[17px]" />}
              tone="emerald"
              onClick={() => openDrill("Sales this month", formatUSD(metrics.monthlySales), "Month-to-date invoices", (i) => i.issueDate.startsWith(new Date().toISOString().slice(0, 7)))}
            />
            <KpiTile
              label="Total receivables"
              value={formatUSD(metrics.totalReceivables)}
              delta={`${metrics.pendingInvoices.length} open`}
              positive={metrics.totalReceivables === 0}
              sublabel="Outstanding AR"
              icon={<Wallet className="h-[17px] w-[17px]" />}
              tone="amber"
              onClick={() => openDrill("Total receivables", formatUSD(metrics.totalReceivables), "Open balances awaiting settlement", (i) => i.balanceDue > 0)}
            />
            <KpiTile
              label="Overdue payments"
              value={formatUSD(metrics.overdueAmount)}
              delta={`${metrics.overdueInvoices.length} overdue`}
              positive={metrics.overdueInvoices.length === 0}
              sublabel="Past due date"
              icon={<AlertTriangle className="h-[17px] w-[17px]" />}
              tone="rose"
              onClick={() => openDrill("Overdue payments", formatUSD(metrics.overdueAmount), "Past due invoices", (i) => i.balanceDue > 0 && (i.status === "Overdue" || i.dueDate < new Date().toISOString().slice(0, 10)))}
            />
            <KpiTile
              label="Pending invoices"
              value={formatUSD(metrics.pendingAmount)}
              delta={`${metrics.pendingInvoices.length} open`}
              positive={metrics.pendingInvoices.length === 0}
              sublabel="Awaiting payment"
              icon={<FileText className="h-[17px] w-[17px]" />}
              tone="indigo"
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
              onClick={() => onNavigate("customers")}
            />
          </div>
        </div>
      )}

      {/* Row 3: Revenue & Sales Trend (Monthly/Yearly) + Cash-Flow Overview (Dual Bar) */}
      {(show("rev") || show("fin")) && (
        <div className="flex flex-wrap gap-4">
          {show("rev") && (
            <GlassCard className="flex-[2] basis-[560px] min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="h text-[17px] font-bold text-[#111317]">Revenue &amp; sales trend</h2>
                  <p className="text-[13px] text-[#5F636C] mt-0.5">Live MongoDB invoiced revenue by period</p>
                </div>
                <div className="inline-flex gap-1 p-[3px] rounded-[10px] bg-[#E9E6DF]">
                  <button
                    onClick={() => setRevMode("monthly")}
                    className={`min-h-[32px] px-3 rounded-[8px] text-[13px] font-semibold cursor-pointer ${
                      revMode === "monthly" ? "bg-white text-[#111317] shadow-sm" : "text-[#5F636C]"
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setRevMode("yearly")}
                    className={`min-h-[32px] px-3 rounded-[8px] text-[13px] font-semibold cursor-pointer ${
                      revMode === "yearly" ? "bg-white text-[#111317] shadow-sm" : "text-[#5F636C]"
                    }`}
                  >
                    Yearly
                  </button>
                </div>
              </div>

              {revMode === "monthly" ? (
                <div className="mt-5">
                  <div className="flex items-end gap-2 h-[220px] pt-4">
                    {metrics.months12.map((m) => {
                      const pct = Math.max(4, Math.round((m.rev / metrics.maxMonthRev) * 100));
                      return (
                        <div key={m.ym} className="flex-1 flex flex-col items-center justify-end gap-2 h-full group relative">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-2 bg-[#111317] text-white text-[11px] px-2 py-1 rounded-[7px] whitespace-nowrap z-10 num">
                            {m.label}: {formatUSD(m.rev)}
                          </div>
                          <div className="w-full flex-1 flex items-end justify-center">
                            <div
                              className="nexora-bar w-[68%] max-w-[32px] rounded-t-[6px] rounded-b-[2px]"
                              style={{
                                height: `${pct}%`,
                                background: m.rev > 0 ? "#16181D" : "#E9E6DF",
                              }}
                            />
                          </div>
                          <span className="text-[11.5px] text-[#5F636C]">{m.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex items-end gap-3 h-[220px] mt-5 pt-4">
                  {metrics.yearly5.map((y) => {
                    const pct = Math.max(6, Math.round((y.rev / metrics.maxYearRev) * 100));
                    return (
                      <div key={y.year} className="flex-1 flex flex-col items-center justify-end gap-2 h-full group relative">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-2 bg-[#111317] text-white text-[11px] px-2 py-1 rounded-[7px] whitespace-nowrap z-10 num">
                          {y.year}: {formatUSD(y.rev)}
                        </div>
                        <div className="w-full flex-1 flex items-end justify-center">
                          <div
                            className="nexora-bar w-[52%] max-w-[64px] rounded-t-[10px] rounded-b-[4px]"
                            style={{
                              height: `${pct}%`,
                              background: y.isCurrent ? "#16181D" : "#D9D6CE",
                            }}
                          />
                        </div>
                        <span className="text-[12px] font-semibold text-[#5F636C]">{y.year}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </GlassCard>
          )}

          {show("fin") && (
            <GlassCard className="flex-1 basis-[320px] min-w-0 flex flex-col">
              <h2 className="h text-[17px] font-bold text-[#111317]">Cash-flow overview</h2>
              <p className="text-[13px] text-[#5F636C] mt-0.5">Inflows vs outflows · last 6 months</p>
              <div className="flex gap-5 my-4 flex-wrap">
                <div>
                  <div className="text-[12px] text-[#5F636C] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-[2px] bg-[#16181D]" /> Inflow
                  </div>
                  <div className="h num text-[19px] font-bold text-[#111317]">{formatCompactUSD(metrics.totalInflow)}</div>
                </div>
                <div>
                  <div className="text-[12px] text-[#5F636C] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-[2px] bg-[#F2A766]" /> Outflow
                  </div>
                  <div className="h num text-[19px] font-bold text-[#111317]">{formatCompactUSD(metrics.totalOutflow)}</div>
                </div>
                <div>
                  <div className="text-[12px] text-[#5F636C]">Net cash</div>
                  <div className="h num text-[19px] font-bold text-[#05603F]">
                    {metrics.totalInflow - metrics.totalOutflow >= 0 ? "+" : ""}
                    {formatCompactUSD(metrics.totalInflow - metrics.totalOutflow)}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 flex-1 min-h-[165px]">
                {metrics.cash6.map((c) => {
                  const inPct = Math.max(5, Math.round((c.inflow / metrics.maxCash) * 100));
                  const outPct = Math.max(5, Math.round((c.outflow / metrics.maxCash) * 100));
                  return (
                    <div key={c.label} className="flex-1 flex flex-col items-center gap-2 h-full group relative">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-5 bg-[#111317] text-white text-[11px] px-2 py-1 rounded-[7px] whitespace-nowrap z-10 num">
                        In {formatCompactUSD(c.inflow)} · Out {formatCompactUSD(c.outflow)}
                      </div>
                      <div className="flex-1 flex items-end justify-center gap-1 w-full">
                        <div className="nexora-bar w-[38%] max-w-[18px] bg-[#16181D] rounded-t-[6px] rounded-b-[2px]" style={{ height: `${inPct}%` }} />
                        <div className="nexora-bar w-[38%] max-w-[18px] bg-[#F2A766] rounded-t-[6px] rounded-b-[2px]" style={{ height: `${outPct}%` }} />
                      </div>
                      <span className="text-[11.5px] text-[#5F636C]">{c.label}</span>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {/* Row 4: Sales by Category Donut + Top-Selling Products + Top Customers */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {show("charts") && (
          <GlassCard>
            <h2 className="h text-[17px] font-bold text-[#111317]">Sales by category</h2>
            <p className="text-[13px] text-[#5F636C] mt-0.5">Share of revenue across configured products</p>
            <div className="flex items-center gap-5 mt-4 flex-wrap">
              <div className="relative w-[156px] h-[156px] shrink-0">
                <svg width="156" height="156" viewBox="0 0 42 42" className="-rotate-90">
                  <circle cx="21" cy="21" r="15.915" fill="none" stroke="#EEECE7" strokeWidth="5.2" />
                  {metrics.donutSlices.map((sl) => (
                    <circle
                      key={sl.name}
                      cx="21"
                      cy="21"
                      r="15.915"
                      fill="none"
                      stroke={sl.color}
                      strokeWidth="5.2"
                      strokeDasharray={`${sl.dash} ${100 - sl.dash}`}
                      strokeDashoffset={sl.offset}
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="h num text-[19px] font-bold text-[#111317]">
                    {formatCompactUSD(metrics.totalSales)}
                  </span>
                  <span className="text-[11.5px] text-[#5F636C]">total sales</span>
                </div>
              </div>
              <div className="flex-1 min-w-[130px] space-y-2">
                {metrics.donutSlices.map((sl) => (
                  <div key={sl.name} className="flex items-center gap-2 text-[12.5px]">
                    <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ backgroundColor: sl.color }} />
                    <span className="flex-1 truncate text-[#111317]">{sl.name}</span>
                    <span className="num font-semibold text-[#111317]">{sl.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>
        )}

        {show("topp") && (
          <GlassCard>
            <div className="flex items-center justify-between">
              <h2 className="h text-[17px] font-bold text-[#111317]">Top-selling products</h2>
              <button onClick={() => onNavigate("products")} className="text-[13px] font-semibold text-[#111317] hover:underline cursor-pointer">
                View all
              </button>
            </div>
            <div className="space-y-4 mt-4">
              {metrics.allProdRanked.slice(0, 5).map((p, idx) => {
                const w = p.rev > 0 ? Math.max(8, Math.round((p.rev / metrics.maxProdRev) * 100)) : 4;
                return (
                  <div key={p.sku}>
                    <div className="flex items-center gap-2.5 text-[13.5px]">
                      <span className="w-6 h-6 rounded-[7px] bg-[#F0EEE8] text-[12px] font-bold flex items-center justify-center text-[#4A4E57]">
                        {idx + 1}
                      </span>
                      <span className="flex-1 font-semibold text-[#111317] truncate">{p.name}</span>
                      <span className="num font-bold text-[#111317]">{formatUSD(p.rev)}</span>
                    </div>
                    <div className="flex items-center gap-2.5 mt-2">
                      <div className="flex-1 h-2 rounded-full bg-[#ECEAE4] overflow-hidden">
                        <div className="nexora-barx h-full rounded-full bg-[#16181D]" style={{ width: `${w}%` }} />
                      </div>
                      <span className="text-[12px] text-[#5F636C] w-16 text-right num">{p.qty} units</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}

        {show("topc") && (
          <GlassCard>
            <div className="flex items-center justify-between">
              <h2 className="h text-[17px] font-bold text-[#111317]">Top customers</h2>
              <button onClick={() => onNavigate("customers")} className="text-[13px] font-semibold text-[#111317] hover:underline cursor-pointer">
                Open CRM
              </button>
            </div>
            {metrics.topCustomers.length === 0 ? (
              <p className="text-[13px] text-[#5F636C] py-10 text-center">
                No customers added yet. Click <b>Open CRM</b> to add your first account.
              </p>
            ) : (
              <div className="space-y-1.5 mt-3">
                {metrics.topCustomers.slice(0, 5).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onNavigate("customers")}
                    className="w-full flex items-center gap-3 p-2 rounded-[10px] hover:bg-[#F6F5F1] text-left cursor-pointer transition-colors"
                  >
                    <span
                      className="w-9 h-9 rounded-full font-bold text-[12.5px] flex items-center justify-center shrink-0"
                      style={{ backgroundColor: c.tone.bg, color: c.tone.fg }}
                    >
                      {c.ini}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-semibold text-[#111317] truncate">{c.companyName}</p>
                      <p className="text-[12px] text-[#5F636C] truncate">{c.customerCode} · {c.state}</p>
                    </div>
                    <div className="text-right">
                      <p className="num text-[13.5px] font-bold text-[#111317]">{formatCompactUSD(c.billed)}</p>
                      <p className="text-[11.5px] text-[#05603F] font-semibold">{c.segment}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </GlassCard>
        )}
      </div>

      {/* Row 5: Branch Performance + Receivables Aging + Profit & Expenses */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <GlassCard>
          <h2 className="h text-[17px] font-bold text-[#111317]">Branch performance</h2>
          <p className="text-[13px] text-[#5F636C] mt-0.5">Actual sales vs target</p>
          <div className="space-y-4 mt-4">
            {metrics.branchStats.map((b) => (
              <div key={b.id}>
                <div className="flex items-center gap-2.5">
                  <span className="w-[34px] h-[34px] rounded-[10px] bg-[#F0EEE8] flex items-center justify-center text-[#111317]">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[13.5px] text-[#111317] truncate">{b.name}</p>
                    <p className="text-[12px] text-[#5F636C]">{b.city}, {b.state}</p>
                  </div>
                  <div className="text-right">
                    <p className="num font-bold text-[13.5px]">{formatCompactUSD(b.sales)}</p>
                    <span className="rounded-[6px] bg-[#EEF6DA] text-[#3D5A0A] px-1.5 py-0.5 text-[11px] font-semibold num">
                      {b.pct}%
                    </span>
                  </div>
                </div>
                <div className="h-2.5 rounded-full bg-[#ECEAE4] overflow-hidden mt-2.5">
                  <div className="nexora-barx h-full rounded-full bg-[#16181D]" style={{ width: `${Math.max(4, b.pct)}%` }} />
                </div>
                <p className="text-[12px] text-[#5F636C] mt-1">
                  Target: {formatCompactUSD(b.target)}
                </p>
              </div>
            ))}
          </div>
        </GlassCard>

        {show("out") && (
          <GlassCard>
            <div className="flex items-center justify-between">
              <h2 className="h text-[17px] font-bold text-[#111317]">Receivables aging</h2>
              <button onClick={() => onNavigate("ledger")} className="text-[13px] font-semibold text-[#111317] hover:underline cursor-pointer">
                Collections
              </button>
            </div>
            <div className="h num text-[26px] font-bold text-[#111317] mt-3">
              {formatUSD(metrics.totalReceivables)}
            </div>
            <p className="text-[13px] text-[#5F636C]">
              Total outstanding · {formatUSD(metrics.overdueAmount)} past due
            </p>
            <div className="flex h-3.5 rounded-full overflow-hidden gap-[3px] my-4 bg-[#ECEAE4]">
              {metrics.agingBuckets.map((a) =>
                a.pct > 0 ? (
                  <div key={a.l} className="nexora-barx h-full" style={{ width: `${a.pct}%`, backgroundColor: a.c }} />
                ) : null
              )}
            </div>
            <div className="space-y-2">
              {metrics.agingBuckets.map((a) => (
                <div key={a.l} className="flex items-center gap-2.5 text-[13.5px]">
                  <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ backgroundColor: a.c }} />
                  <span className="flex-1 text-[#111317]">{a.l}</span>
                  <span className="text-[12.5px] text-[#5F636C] num">{a.pct}%</span>
                  <span className="num font-semibold w-24 text-right">{formatUSD(a.v)}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {show("profit") && (
          <GlassCard>
            <h2 className="h text-[17px] font-bold text-[#111317]">Profit &amp; expenses</h2>
            <p className="text-[13px] text-[#5F636C] mt-0.5">Live operating margins</p>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="p-3.5 rounded-[12px] bg-[#F5F9EA]">
                <div className="text-[12px] text-[#4A4E57] font-semibold">Gross profit</div>
                <div className="h num text-[19px] font-bold text-[#111317] mt-1">{formatCompactUSD(metrics.grossProfit)}</div>
                <div className="text-[12px] text-[#05603F] font-semibold">{metrics.grossMargin.toFixed(1)}% margin</div>
              </div>
              <div className="p-3.5 rounded-[12px] bg-[#F2FAF6]">
                <div className="text-[12px] text-[#4A4E57] font-semibold">Net profit</div>
                <div className="h num text-[19px] font-bold text-[#111317] mt-1">{formatCompactUSD(metrics.netProfit)}</div>
                <div className="text-[12px] text-[#05603F] font-semibold">{metrics.netMargin.toFixed(1)}% margin</div>
              </div>
            </div>
            <div className="text-[13px] font-semibold mt-4 mb-2.5 text-[#4A4E57]">
              Expenses by category · {formatUSD(metrics.totalExpenses)}
            </div>
            {metrics.expCats.length === 0 ? (
              <p className="text-[12.5px] text-[#5F636C]">No operating expenses logged yet.</p>
            ) : (
              <div className="space-y-2.5">
                {metrics.expCats.map((e) => (
                  <div key={e.l} className="flex items-center gap-2.5 text-[12.5px]">
                    <span className="w-24 truncate text-[#111317]">{e.l}</span>
                    <div className="flex-1 h-2 rounded-full bg-[#ECEAE4] overflow-hidden">
                      <div
                        className="nexora-barx h-full rounded-full bg-[#F2A766]"
                        style={{ width: `${Math.round((e.v / metrics.maxExpCat) * 100)}%` }}
                      />
                    </div>
                    <span className="num w-16 text-right font-semibold">{formatCompactUSD(e.v)}</span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        )}
      </div>

      {/* Row 6: Recent Transactions (with All/Sales/Payments tabs) + Low Stock & Pending Approvals */}
      <div className="flex flex-wrap gap-4 items-start">
        <GlassCard className="flex-[2] basis-[580px] min-w-0 p-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-[#EEECE7]">
            <div>
              <h2 className="h text-[17px] font-bold text-[#111317]">Recent transactions</h2>
              <p className="text-[13px] text-[#5F636C] mt-0.5">Invoices and payments · live MongoDB</p>
            </div>
            <div className="inline-flex gap-1 p-[3px] rounded-[10px] bg-[#E9E6DF]">
              {(["all", "sales", "payments"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTxTab(t)}
                  className={`min-h-[30px] px-3 rounded-[8px] text-[12.5px] font-semibold capitalize cursor-pointer ${
                    txTab === t ? "bg-white text-[#111317] shadow-sm" : "text-[#5F636C]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {visibleTx.length === 0 ? (
            <p className="text-[13px] text-[#5F636C] py-10 text-center">
              No transactions recorded yet. Create an invoice or payment to see live entries.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13.5px]">
                <thead className="bg-[#F8F7F3] text-[#6B6F78] uppercase text-[11px] border-b border-[#E6E3DC]">
                  <tr>
                    <th className="px-5 py-2.5">Reference</th>
                    <th className="px-5 py-2.5">Customer</th>
                    <th className="px-5 py-2.5">Date</th>
                    <th className="px-5 py-2.5">Status</th>
                    <th className="px-5 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEECE7]">
                  {visibleTx.map((t, i) => (
                    <tr key={i} className="hover:bg-[#F8F7F3]">
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-2.5">
                          <span
                            className="w-8 h-8 rounded-[9px] text-[11px] font-bold flex items-center justify-center"
                            style={{ backgroundColor: t.bg, color: t.fg }}
                          >
                            {t.ab}
                          </span>
                          <span className="num font-semibold text-[#111317]">{t.ref}</span>
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[#111317]">{t.cust}</td>
                      <td className="px-5 py-3 text-[#5F636C]">{formatUSDate(t.date)}</td>
                      <td className="px-5 py-3"><StatusBadge status={t.status} /></td>
                      <td className="px-5 py-3 text-right num font-bold text-[#111317]">{t.amt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        <div className="flex-1 basis-[320px] min-w-0 space-y-4">
          {show("inv") && (
            <GlassCard>
              <div className="flex items-center justify-between gap-2">
                <h2 className="h text-[17px] font-bold text-[#111317]">Low-stock alerts</h2>
                <span className="rounded-[6px] bg-[#FCE8E8] text-[#A11A1A] px-2 py-0.5 text-[11.5px] font-semibold">
                  {metrics.lowStock.length} items
                </span>
              </div>
              <div className="space-y-3.5 mt-4">
                {metrics.lowStock.slice(0, 4).map(({ product, qty, pct }) => (
                  <div key={product.id}>
                    <div className="flex items-center gap-2 text-[13.5px]">
                      <span className="flex-1 font-semibold text-[#111317]">{product.name}</span>
                      <span className="num font-bold text-[#A11A1A]">{qty}</span>
                      <span className="text-[12px] text-[#5F636C]">/ {product.reorderLevel}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#ECEAE4] overflow-hidden mt-1.5">
                      <div className="nexora-barx h-full rounded-full bg-[#A11A1A]" style={{ width: `${Math.max(4, pct)}%` }} />
                    </div>
                  </div>
                ))}
                {metrics.lowStock.length === 0 && (
                  <p className="text-[13px] text-[#05603F]">All SKUs stocked above reorder level.</p>
                )}
              </div>
              <SecondaryButton onClick={() => onNavigate("purchasing")} className="w-full mt-4">
                <Truck className="h-4 w-4" /> Create purchase orders
              </SecondaryButton>
            </GlassCard>
          )}

          <GlassCard>
            <div className="flex items-center justify-between gap-2">
              <h2 className="h text-[17px] font-bold text-[#111317]">Pending approvals</h2>
              <span className="rounded-[6px] bg-[#EEF6DA] text-[#3D5A0A] px-2 py-0.5 text-[11.5px] font-semibold">
                {metrics.pendingApprovals.length}
              </span>
            </div>
            <div className="space-y-2.5 mt-3.5">
              {metrics.pendingApprovals.slice(0, 3).map((a) => (
                <div key={a.id} className="border border-[#EEECE7] rounded-[12px] p-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-[6px] bg-[#EEF6DA] text-[#3D5A0A] px-2 py-0.5 text-[11px] font-semibold">
                      {a.type}
                    </span>
                    <span className="text-[12px] text-[#5F636C]">{a.requestedBy}</span>
                  </div>
                  <p className="text-[13.5px] font-semibold text-[#111317] mt-2">{a.title}</p>
                  <div className="flex gap-2 mt-2.5">
                    <PrimaryButton
                      className="min-h-[30px] text-[12px] px-2.5"
                      onClick={() => onRunAction("approval:advance", { approvalId: a.id, decision: "Approved" })}
                    >
                      <Check className="h-3.5 w-3.5" /> Approve
                    </PrimaryButton>
                    <SecondaryButton
                      className="min-h-[30px] text-[12px] px-2.5"
                      onClick={() => onRunAction("approval:advance", { approvalId: a.id, decision: "Rejected" })}
                    >
                      Reject
                    </SecondaryButton>
                  </div>
                </div>
              ))}
              {metrics.pendingApprovals.length === 0 && (
                <p className="text-center py-4 text-[13.5px] text-[#5F636C]">
                  All caught up — nothing waiting on you.
                </p>
              )}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Exact Nexora Right Slide-Over Drill-Down Drawer */}
      <AnimatePresence>
        {drill && (
          <div className="fixed inset-0 z-50 no-print">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrill(null)}
              className="fixed inset-0 bg-[#111317]/40 backdrop-blur-[3px]"
            />
            <motion.aside
              initial={{ x: 560 }}
              animate={{ x: 0 }}
              exit={{ x: 560 }}
              transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-[540px] bg-white z-60 shadow-[-24px_0_60px_-24px_rgba(17,19,23,0.4)] flex flex-col overflow-y-auto"
            >
              <div className="p-6 border-b border-[#EEECE7] flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11.5px] font-bold tracking-[0.08em] text-[#16181D]">DRILL-DOWN</div>
                  <div className="h text-[22px] font-bold text-[#111317] mt-1">{drill.title}</div>
                  <div className="h num text-[32px] font-bold text-[#111317] mt-1.5">{drill.value}</div>
                  <div className="text-[13px] text-[#5F636C]">{drill.sub}</div>
                </div>
                <button
                  onClick={() => setDrill(null)}
                  className="w-10 h-10 rounded-[10px] border border-[#E0DDD5] bg-white flex items-center justify-center hover:bg-[#F1EFEA] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 grid grid-cols-3 gap-2.5">
                {drill.split.map((s) => (
                  <div key={s.l} className="border border-[#EEECE7] rounded-[12px] p-3">
                    <div className="text-[12px] text-[#5F636C]">{s.l}</div>
                    <div className="num font-bold text-[15px] mt-1">{s.v}</div>
                  </div>
                ))}
              </div>
              <div className="px-6 pb-2 text-[13px] font-bold text-[#4A4E57]">Underlying transactions</div>
              <div className="px-3 pb-6 space-y-1">
                {drill.rows.length === 0 ? (
                  <p className="text-center py-8 text-[13px] text-[#5F636C]">No matching transactions recorded yet.</p>
                ) : (
                  drill.rows.map((r, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setDrill(null);
                        onNavigate(r.tab);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] hover:bg-[#F1EFEA] text-left cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[13.5px] text-[#111317] truncate">{r.ref} · {r.cust}</p>
                        <p className="text-[12px] text-[#5F636C]">{r.date}</p>
                      </div>
                      <StatusBadge status={r.status} />
                      <span className="num font-bold text-[13.5px] w-24 text-right">{r.amt}</span>
                    </button>
                  ))
                )}
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
