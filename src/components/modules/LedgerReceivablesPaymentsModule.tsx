"use client";

import React, { useMemo, useState } from "react";
import {
  BookOpen,
  CreditCard,
  Clock,
  Plus,
  Printer,
  Download,
  Mail,
  CheckCircle2,
  Receipt,
  Scale,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { Payment, PaymentMethod } from "@/types/erp";
import type { ClientERPState } from "./ExecutiveDashboard";
import { daysBetween, exportToCSV, formatUSD, formatUSDate } from "@/lib/utils";
import {
  GlassCard,
  KpiTile,
  Modal,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  StatusBadge,
} from "@/components/ui/Primitives";

export function LedgerReceivablesPaymentsModule({
  state,
  onRunAction,
}: {
  state: ClientERPState;
  onRunAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [tab, setTab] = useState<"ledger" | "receivables" | "payments">("ledger");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    state.customers[0]?.id || "ALL"
  );
  const [dateFrom, setDateFrom] = useState("2026-08-01");
  const [dateTo, setDateTo] = useState("2026-12-31");

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [adjOpen, setAdjOpen] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<Payment | null>(null);
  const [statementPreviewOpen, setStatementPreviewOpen] = useState(false);

  const [payForm, setPayForm] = useState({
    customerId: state.customers[0]?.id || "",
    invoiceId: "",
    amount: 5000,
    method: "Bank Transfer (ACH)" as PaymentMethod,
    paymentType: "Standard" as Payment["paymentType"],
    reference: "",
    notes: "",
  });

  const [adjForm, setAdjForm] = useState({
    customerId: state.customers[0]?.id || "",
    entryType: "Credit" as "Debit" | "Credit",
    amount: 500,
    description: "Volume rebate / pricing credit adjustment",
    referenceNo: "",
  });

  // Ledger calculations
  const ledgerData = useMemo(() => {
    const filtered = state.ledgerEntries
      .filter((e) => {
        const matchCust = selectedCustomerId === "ALL" || e.customerId === selectedCustomerId;
        const matchDate = e.date >= dateFrom && e.date <= dateTo;
        return matchCust && matchDate;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalDebit = filtered.reduce((s, e) => s + e.debit, 0);
    const totalCredit = filtered.reduce((s, e) => s + e.credit, 0);
    const openingEntry = filtered.find((e) => e.type === "Opening");
    const openingBal = openingEntry ? openingEntry.debit - openingEntry.credit : 0;
    const closingBal =
      selectedCustomerId === "ALL"
        ? state.customers.reduce((s, c) => s + c.currentBalance, 0)
        : state.customers.find((c) => c.id === selectedCustomerId)?.currentBalance || 0;

    return { entries: filtered, totalDebit, totalCredit, openingBal, closingBal };
  }, [state.ledgerEntries, state.customers, selectedCustomerId, dateFrom, dateTo]);

  // AR Aging calculations (Current, 1-30, 31-60, 61-90, 90+)
  const arData = useMemo(() => {
    const openInvoices = state.invoices.filter(
      (i) => i.balanceDue > 0 && i.status !== "Cancelled" && i.status !== "Refunded"
    );
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    for (const inv of openInvoices) {
      const overdueDays = daysBetween(inv.dueDate, "2026-11-22");
      if (overdueDays <= 0) buckets.current += inv.balanceDue;
      else if (overdueDays <= 30) buckets.d30 += inv.balanceDue;
      else if (overdueDays <= 60) buckets.d60 += inv.balanceDue;
      else if (overdueDays <= 90) buckets.d90 += inv.balanceDue;
      else buckets.d90plus += inv.balanceDue;
    }
    const chartData = [
      { bucket: "Current", amount: Math.round(buckets.current) },
      { bucket: "1–30 Days", amount: Math.round(buckets.d30) },
      { bucket: "31–60 Days", amount: Math.round(buckets.d60) },
      { bucket: "61–90 Days", amount: Math.round(buckets.d90) },
      { bucket: "90+ Days", amount: Math.round(buckets.d90plus) },
    ];
    const totalAR = openInvoices.reduce((s, i) => s + i.balanceDue, 0);
    const overdueTotal = openInvoices
      .filter((i) => daysBetween(i.dueDate, "2026-11-22") > 0)
      .reduce((s, i) => s + i.balanceDue, 0);
    return { openInvoices, buckets, chartData, totalAR, overdueTotal };
  }, [state.invoices]);

  const customerOpenInvoices = state.invoices.filter(
    (i) => i.customerId === payForm.customerId && i.balanceDue > 0
  );

  const selectedCustomer = state.customers.find((c) => c.id === selectedCustomerId);

  return (
    <div className="space-y-6">
      <SectionHeader
        badge="Core Financial Engine · Ledger, AR & Payments"
        title="Customer Ledger, Receivables & Payments"
        subtitle="Real-time customer-wise and consolidated debit/credit ledger with exact running balances, 30/60/90+ day AR aging, automated collection reminders, and payment reconciliation."
        actions={
          <>
            <SecondaryButton onClick={() => setAdjOpen(true)}>
              <Scale className="h-4 w-4" /> Ledger Adjustment
            </SecondaryButton>
            <PrimaryButton onClick={() => setPaymentOpen(true)}>
              <Plus className="h-4 w-4" /> Record Payment
            </PrimaryButton>
          </>
        }
      />

      {/* Tabs */}
      <GlassCard className="p-3 flex flex-wrap gap-2">
        {(
          [
            ["ledger", "Customer Ledger (Core)"],
            ["receivables", `Accounts Receivable & Aging (${arData.openInvoices.length})`],
            ["payments", `Payment Management (${state.payments.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer transition-all ${
              tab === k
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md"
                : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </GlassCard>

      {/* TAB 1: CUSTOMER LEDGER */}
      {tab === "ledger" && (
        <div className="space-y-5">
          <GlassCard className="p-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
              <div>
                <label className="text-[11px] font-semibold uppercase text-[var(--text-muted)]">
                  Account Scope
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="erp-input mt-1 text-xs"
                >
                  <option value="ALL">Consolidated Ledger (All Customers)</option>
                  {state.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.customerCode} — {c.companyName} ({formatUSD(c.currentBalance)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase text-[var(--text-muted)]">From Date</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="erp-input mt-1 text-xs" />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase text-[var(--text-muted)]">To Date</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="erp-input mt-1 text-xs" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <SecondaryButton onClick={() => setStatementPreviewOpen(true)}>
                <Printer className="h-4 w-4" /> Customer Statement
              </SecondaryButton>
              <SecondaryButton
                onClick={() =>
                  exportToCSV(
                    `ledger-${selectedCustomer?.customerCode || "consolidated"}.csv`,
                    ledgerData.entries.map((e) => ({
                      Date: e.date,
                      Customer: state.customers.find((c) => c.id === e.customerId)?.companyName,
                      Type: e.type,
                      Reference: e.referenceNo,
                      Description: e.description,
                      Debit: e.debit,
                      Credit: e.credit,
                      RunningBalance: e.runningBalance,
                    }))
                  )
                }
              >
                <Download className="h-4 w-4" /> Export CSV
              </SecondaryButton>
            </div>
          </GlassCard>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiTile label="Opening Balance" value={formatUSD(ledgerData.openingBal)} icon={<BookOpen className="h-5 w-5" />} tone="indigo" />
            <KpiTile label="Total Debits (Sales / Adj)" value={formatUSD(ledgerData.totalDebit)} icon={<CreditCard className="h-5 w-5" />} tone="blue" />
            <KpiTile label="Total Credits (Payments / CN)" value={formatUSD(ledgerData.totalCredit)} icon={<CheckCircle2 className="h-5 w-5" />} tone="emerald" />
            <KpiTile label="Closing Running Balance" value={formatUSD(ledgerData.closingBal)} icon={<Scale className="h-5 w-5" />} tone="amber" />
          </div>

          <GlassCard className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] uppercase border-b border-[var(--border-subtle)]">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    {selectedCustomerId === "ALL" && <th className="px-4 py-3">Customer</th>}
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Reference #</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Debit ($)</th>
                    <th className="px-4 py-3 text-right">Credit ($)</th>
                    <th className="px-4 py-3 text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {ledgerData.entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-blue-500/5">
                      <td className="px-4 py-3 whitespace-nowrap">{formatUSDate(entry.date)}</td>
                      {selectedCustomerId === "ALL" && (
                        <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                          {state.customers.find((c) => c.id === entry.customerId)?.companyName}
                        </td>
                      )}
                      <td className="px-4 py-3"><StatusBadge status={entry.type} /></td>
                      <td className="px-4 py-3 font-mono-num font-semibold text-blue-400">{entry.referenceNo}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{entry.description}</td>
                      <td className="px-4 py-3 text-right font-mono-num font-semibold text-[var(--text-primary)]">
                        {entry.debit > 0 ? formatUSD(entry.debit) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num font-semibold text-emerald-400">
                        {entry.credit > 0 ? formatUSD(entry.credit) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num font-bold text-amber-400">
                        {formatUSD(entry.runningBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}

      {/* TAB 2: ACCOUNTS RECEIVABLE & AGING */}
      {tab === "receivables" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <GlassCard className="lg:col-span-5 space-y-4">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                30 / 60 / 90+ Day Receivables Aging
              </h3>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={arData.chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                    <XAxis dataKey="bucket" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `$${v / 1000}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderRadius: "10px", fontSize: "12px" }}
                      formatter={(v: number) => formatUSD(v)}
                    />
                    <Bar dataKey="amount" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-[var(--border-subtle)]">
                <div>
                  <p className="text-[var(--text-muted)]">Total Open AR</p>
                  <p className="text-lg font-bold font-mono-num text-blue-400">{formatUSD(arData.totalAR)}</p>
                </div>
                <div>
                  <p className="text-[var(--text-muted)]">Past Due Exposure</p>
                  <p className="text-lg font-bold font-mono-num text-rose-400">{formatUSD(arData.overdueTotal)}</p>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="lg:col-span-7 p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Outstanding & Overdue Invoices — Collection Queue
                </span>
                <Clock className="h-4 w-4 text-rose-400" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] uppercase border-b border-[var(--border-subtle)]">
                    <tr>
                      <th className="px-4 py-2.5">Invoice</th>
                      <th className="px-4 py-2.5">Customer</th>
                      <th className="px-4 py-2.5">Aging</th>
                      <th className="px-4 py-2.5 text-right">Balance Due</th>
                      <th className="px-4 py-2.5 text-right">Collection Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {arData.openInvoices.map((inv) => {
                      const days = daysBetween(inv.dueDate, "2026-11-22");
                      return (
                        <tr key={inv.id} className="hover:bg-blue-500/5">
                          <td className="px-4 py-3 font-mono-num font-bold text-blue-400">{inv.invoiceNo}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-[var(--text-primary)]">
                              {state.customers.find((c) => c.id === inv.customerId)?.companyName}
                            </p>
                            {inv.collectionNotes && (
                              <p className="text-[11px] text-[var(--text-muted)]">{inv.collectionNotes}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={days > 0 ? `${days}d Overdue` : "Current"} />
                          </td>
                          <td className="px-4 py-3 text-right font-mono-num font-bold text-amber-400">
                            {formatUSD(inv.balanceDue)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex gap-1.5">
                              <button
                                onClick={() =>
                                  onRunAction("invoice:action", { invoiceId: inv.id, op: "reminder" })
                                }
                                className="rounded-lg bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/25 cursor-pointer inline-flex items-center gap-1"
                              >
                                <Mail className="h-3 w-3" /> Remind
                              </button>
                              <button
                                onClick={() => {
                                  setPayForm({
                                    customerId: inv.customerId,
                                    invoiceId: inv.id,
                                    amount: inv.balanceDue,
                                    method: "Bank Transfer (ACH)",
                                    paymentType: "Standard",
                                    reference: "",
                                    notes: `Settlement for ${inv.invoiceNo}`,
                                  });
                                  setPaymentOpen(true);
                                }}
                                className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25 cursor-pointer"
                              >
                                Collect
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* TAB 3: PAYMENTS */}
      {tab === "payments" && (
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] uppercase border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="px-4 py-3">Receipt #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Method & Type</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Reconciliation</th>
                  <th className="px-4 py-3 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {state.payments.map((pay) => (
                  <tr key={pay.id} className="hover:bg-blue-500/5">
                    <td className="px-4 py-3 font-mono-num font-bold text-emerald-400">{pay.receiptNo}</td>
                    <td className="px-4 py-3">{formatUSDate(pay.date)}</td>
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                      {state.customers.find((c) => c.id === pay.customerId)?.companyName}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-[var(--text-primary)]">{pay.method}</span>
                      <span className="ml-1.5 text-[11px] text-[var(--text-muted)]">({pay.paymentType})</span>
                    </td>
                    <td className="px-4 py-3 font-mono-num text-[var(--text-secondary)]">{pay.reference}</td>
                    <td className="px-4 py-3 text-right font-mono-num font-bold text-emerald-400">
                      {formatUSD(pay.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onRunAction("payment:reconcile", { paymentId: pay.id })}
                        className="cursor-pointer"
                      >
                        <StatusBadge status={pay.reconciled ? "Reconciled" : "Pending"} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setReceiptPreview(pay)}
                        className="rounded-lg bg-blue-500/15 px-2.5 py-1 text-[11px] font-semibold text-blue-400 hover:bg-blue-500/25 cursor-pointer inline-flex items-center gap-1"
                      >
                        <Receipt className="h-3 w-3" /> Receipt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Record Payment Modal */}
      <Modal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        title="Record Customer Payment / Refund"
        subtitle="Allocates payment to open invoice, posts Customer Ledger Credit, and creates balanced GL Journal Entry."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onRunAction("payment:record", payForm);
            setPaymentOpen(false);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Customer</label>
              <select
                value={payForm.customerId}
                onChange={(e) => setPayForm({ ...payForm, customerId: e.target.value, invoiceId: "" })}
                className="erp-input mt-1"
              >
                {state.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName} (Bal: {formatUSD(c.currentBalance)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Allocate to Invoice (Optional)</label>
              <select
                value={payForm.invoiceId}
                onChange={(e) => {
                  const inv = state.invoices.find((i) => i.id === e.target.value);
                  setPayForm({
                    ...payForm,
                    invoiceId: e.target.value,
                    amount: inv ? inv.balanceDue : payForm.amount,
                  });
                }}
                className="erp-input mt-1"
              >
                <option value="">Unallocated / Advance Payment</option>
                {customerOpenInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNo} — Due {formatUSD(inv.balanceDue)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Amount (USD)</label>
              <input
                type="number"
                step="0.01"
                min={0.01}
                required
                value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })}
                className="erp-input mt-1 font-mono-num"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Payment Method</label>
              <select
                value={payForm.method}
                onChange={(e) => setPayForm({ ...payForm, method: e.target.value as PaymentMethod })}
                className="erp-input mt-1"
              >
                <option value="Bank Transfer (ACH)">Bank Transfer (ACH)</option>
                <option value="Cash">Cash</option>
                <option value="Check">Check</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Online Portal">Online Portal</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Payment Type</label>
              <select
                value={payForm.paymentType}
                onChange={(e) =>
                  setPayForm({ ...payForm, paymentType: e.target.value as Payment["paymentType"] })
                }
                className="erp-input mt-1"
              >
                <option value="Standard">Standard Payment</option>
                <option value="Partial">Partial Payment</option>
                <option value="Advance">Advance Payment</option>
                <option value="Refund">Refund</option>
                <option value="Reversal">Reversal</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Check / ACH / Card Reference</label>
              <input
                value={payForm.reference}
                onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
                placeholder="e.g. ACH-99102 or CHK-4412"
                className="erp-input mt-1 font-mono-num"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)]">Notes</label>
            <input
              value={payForm.notes}
              onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
              className="erp-input mt-1"
            />
          </div>
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setPaymentOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton type="submit">Post Payment & Update Ledger</PrimaryButton>
          </div>
        </form>
      </Modal>

      {/* Manual Ledger Adjustment Modal */}
      <Modal
        open={adjOpen}
        onClose={() => setAdjOpen(false)}
        title="Post Customer Ledger Adjustment"
        subtitle="Posts a direct Debit or Credit entry and automatically recalculates running customer balances."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onRunAction("ledger:adjustment", adjForm);
            setAdjOpen(false);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Customer</label>
              <select
                value={adjForm.customerId}
                onChange={(e) => setAdjForm({ ...adjForm, customerId: e.target.value })}
                className="erp-input mt-1"
              >
                {state.customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.companyName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Entry Side</label>
              <select
                value={adjForm.entryType}
                onChange={(e) => setAdjForm({ ...adjForm, entryType: e.target.value as "Debit" | "Credit" })}
                className="erp-input mt-1"
              >
                <option value="Credit">Credit (Reduces Customer Balance)</option>
                <option value="Debit">Debit (Increases Customer Balance)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Amount (USD)</label>
              <input
                type="number"
                step="0.01"
                required
                value={adjForm.amount}
                onChange={(e) => setAdjForm({ ...adjForm, amount: Number(e.target.value) })}
                className="erp-input mt-1 font-mono-num"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Reference #</label>
              <input
                value={adjForm.referenceNo}
                onChange={(e) => setAdjForm({ ...adjForm, referenceNo: e.target.value })}
                placeholder="Optional memo ref"
                className="erp-input mt-1 font-mono-num"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)]">Description</label>
            <input
              required
              value={adjForm.description}
              onChange={(e) => setAdjForm({ ...adjForm, description: e.target.value })}
              className="erp-input mt-1"
            />
          </div>
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setAdjOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton type="submit">Post Adjustment</PrimaryButton>
          </div>
        </form>
      </Modal>

      {/* Printable Customer Statement Modal */}
      <Modal
        open={statementPreviewOpen}
        onClose={() => setStatementPreviewOpen(false)}
        title="Printable Customer Account Statement"
        maxWidth="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="flex justify-end gap-2 no-print">
            <PrimaryButton onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print / Save PDF Statement
            </PrimaryButton>
          </div>
          <div className="print-only-sheet rounded-2xl bg-white text-slate-900 p-7">
            <div className="flex justify-between border-b-2 border-slate-900 pb-4">
              <div>
                <h2 className="text-lg font-extrabold">{state.settings.legalName}</h2>
                <p className="text-xs text-slate-600">{state.settings.address}, {state.settings.cityStateZip}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-extrabold uppercase tracking-wider text-blue-700">
                  STATEMENT OF ACCOUNT
                </p>
                <p className="text-xs text-slate-600">
                  Period: {formatUSDate(dateFrom)} – {formatUSDate(dateTo)}
                </p>
              </div>
            </div>
            <div className="py-4 text-xs flex justify-between">
              <div>
                <p className="font-bold text-slate-500 uppercase text-[10px]">Account Holder</p>
                <p className="font-bold text-sm">
                  {selectedCustomer ? selectedCustomer.companyName : "Consolidated Enterprise Ledger"}
                </p>
                {selectedCustomer && <p className="text-slate-600">{selectedCustomer.billingAddress}</p>}
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase text-slate-500 font-bold">Closing Balance Due</p>
                <p className="text-xl font-extrabold font-mono-num text-slate-900">
                  {formatUSD(ledgerData.closingBal)}
                </p>
              </div>
            </div>
            <table className="w-full text-left text-xs mt-2">
              <thead>
                <tr className="border-b border-slate-300 text-slate-500 uppercase text-[10px]">
                  <th className="py-2">Date</th>
                  <th className="py-2">Reference</th>
                  <th className="py-2">Description</th>
                  <th className="py-2 text-right">Debit</th>
                  <th className="py-2 text-right">Credit</th>
                  <th className="py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledgerData.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2">{formatUSDate(e.date)}</td>
                    <td className="py-2 font-mono-num font-semibold">{e.referenceNo}</td>
                    <td className="py-2">{e.description}</td>
                    <td className="py-2 text-right font-mono-num">{e.debit ? formatUSD(e.debit) : ""}</td>
                    <td className="py-2 text-right font-mono-num">{e.credit ? formatUSD(e.credit) : ""}</td>
                    <td className="py-2 text-right font-mono-num font-bold">{formatUSD(e.runningBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Printable Payment Receipt Modal */}
      <Modal
        open={Boolean(receiptPreview)}
        onClose={() => setReceiptPreview(null)}
        title={receiptPreview ? `Payment Receipt — ${receiptPreview.receiptNo}` : ""}
        maxWidth="max-w-xl"
      >
        {receiptPreview && (
          <div className="space-y-4">
            <div className="print-only-sheet rounded-2xl bg-white text-slate-900 p-6 space-y-4">
              <div className="flex justify-between border-b border-slate-300 pb-3">
                <div>
                  <h3 className="font-extrabold text-base">{state.settings.legalName}</h3>
                  <p className="text-xs text-slate-500">Official Payment Receipt</p>
                </div>
                <div className="text-right">
                  <p className="font-mono-num font-extrabold text-blue-700">{receiptPreview.receiptNo}</p>
                  <p className="text-xs text-slate-500">{formatUSDate(receiptPreview.date)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-slate-500 uppercase text-[10px] font-bold">Received From</p>
                  <p className="font-bold">
                    {state.customers.find((c) => c.id === receiptPreview.customerId)?.companyName}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-slate-500 uppercase text-[10px] font-bold">Payment Method</p>
                  <p className="font-bold">{receiptPreview.method}</p>
                  <p className="text-[11px] font-mono-num text-slate-500">Ref: {receiptPreview.reference}</p>
                </div>
              </div>
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex justify-between items-center">
                <span className="text-xs font-bold uppercase text-emerald-800">Amount Received (USD)</span>
                <span className="text-2xl font-extrabold font-mono-num text-emerald-700">
                  {formatUSD(receiptPreview.amount)}
                </span>
              </div>
              <p className="text-xs text-slate-600">{receiptPreview.notes || "Thank you for your prompt remittance."}</p>
            </div>
            <div className="flex justify-end no-print">
              <PrimaryButton onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print Receipt
              </PrimaryButton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
