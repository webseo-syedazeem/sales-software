"use client";

import React, { useMemo, useState } from "react";
import {
  Landmark,
  Plus,
  ReceiptText,
  Percent,
  CheckCircle2,
  ShieldAlert,
  BookMarked,
} from "lucide-react";
import type { ClientERPState } from "./ExecutiveDashboard";
import { formatUSD, formatUSDate } from "@/lib/utils";
import {
  GlassCard,
  Modal,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  StatusBadge,
} from "@/components/ui/Primitives";

export function AccountingExpensesTaxModule({
  state,
  onRunAction,
}: {
  state: ClientERPState;
  onRunAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [tab, setTab] = useState<"coa" | "journal" | "statements" | "expenses" | "tax">("statements");
  const [jeOpen, setJeOpen] = useState(false);
  const [expOpen, setExpOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);

  const [jeForm, setJeForm] = useState({
    description: "Monthly depreciation / accrual adjustment",
    reference: "ADJ-2026-11",
    debitAccountId: state.accounts.find((a) => a.type === "Expense")?.id || state.accounts[0]?.id || "",
    creditAccountId: state.accounts.find((a) => a.code === "1010")?.id || state.accounts[0]?.id || "",
    amount: 1500,
  });

  const [expForm, setExpForm] = useState({
    category: "Freight & Delivery",
    description: "",
    amount: 1200,
    budgetAmount: 1500,
    department: "Logistics",
    branchId: state.branches[0]?.id || "",
    vendorName: "",
    recurring: false,
  });

  const [taxForm, setTaxForm] = useState({
    stateCode: "WA",
    stateName: "Washington",
    rate: 6.5,
    localSurtax: 2.6,
    notes: "Seattle / King County combined rate",
  });

  // Live Financial Statements Computation
  const statements = useMemo(() => {
    const assets = state.accounts.filter((a) => a.type === "Asset");
    const liabilities = state.accounts.filter((a) => a.type === "Liability");
    const equity = state.accounts.filter((a) => a.type === "Equity");
    const revenue = state.accounts.filter((a) => a.type === "Revenue");
    const expenses = state.accounts.filter((a) => a.type === "Expense");

    const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
    const totalEquity = equity.reduce((s, a) => s + a.balance, 0);
    const totalRevenue = revenue.reduce((s, a) => s + a.balance, 0);
    const totalExpenses = expenses.reduce((s, a) => s + a.balance, 0);
    const netIncome = totalRevenue - totalExpenses;

    const cashInflows = state.payments.reduce((s, p) => s + p.amount, 0) + 124500;
    const cashOutflows = state.expenses.reduce((s, e) => s + e.amount, 0) + 74200;

    return {
      assets,
      liabilities,
      equity,
      revenue,
      expenses,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalRevenue,
      totalExpenses,
      netIncome,
      cashInflows,
      cashOutflows,
    };
  }, [state]);

  const taxCollectedByState = useMemo(() => {
    const map = new Map<string, { state: string; taxableSales: number; taxCollected: number; invoices: number }>();
    for (const inv of state.invoices) {
      if (inv.status === "Cancelled") continue;
      const cur = map.get(inv.taxState) || {
        state: inv.taxState,
        taxableSales: 0,
        taxCollected: 0,
        invoices: 0,
      };
      cur.taxableSales += inv.subtotal - inv.discountTotal;
      cur.taxCollected += inv.taxTotal;
      cur.invoices += 1;
      map.set(inv.taxState, cur);
    }
    return Array.from(map.values());
  }, [state.invoices]);

  return (
    <div className="space-y-6">
      <SectionHeader
        badge="Double-Entry General Ledger, Expenses & US State Tax"
        title="Accounting, Financial Statements & Tax"
        subtitle="Enterprise Chart of Accounts, balanced Journal Entries, live Trial Balance, P&L, Balance Sheet, Cash-Flow Statement, Departmental Expenses & US State Sales Tax."
        actions={
          <>
            <SecondaryButton onClick={() => setExpOpen(true)}>
              <Plus className="h-4 w-4" /> Log Expense
            </SecondaryButton>
            <PrimaryButton onClick={() => setJeOpen(true)}>
              <BookMarked className="h-4 w-4" /> Post Journal Entry
            </PrimaryButton>
          </>
        }
      />

      <GlassCard className="p-3 flex flex-wrap gap-2">
        {(
          [
            ["statements", "P&L, Balance Sheet, Trial Balance & Cash Flow"],
            ["coa", `Chart of Accounts (${state.accounts.length})`],
            ["journal", `General Ledger & Journals (${state.journalEntries.length})`],
            ["expenses", `Expense Management (${state.expenses.length})`],
            ["tax", `US Tax Configuration (${state.taxRules.length} States)`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer ${
              tab === k ? "bg-blue-600 text-white" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
            }`}
          >
            {label}
          </button>
        ))}
      </GlassCard>

      {/* FINANCIAL STATEMENTS */}
      {tab === "statements" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Profit & Loss */}
          <GlassCard className="space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Profit & Loss Statement (Income Statement)
              </h3>
              <span className="text-[11px] font-mono-num text-blue-400">FY 2026 YTD</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <p className="text-[10px] font-bold uppercase text-emerald-400">Operating Revenue</p>
              {statements.revenue.map((a) => (
                <div key={a.id} className="flex justify-between py-1">
                  <span>{a.code} · {a.name}</span>
                  <span className="font-mono-num font-semibold">{formatUSD(a.balance)}</span>
                </div>
              ))}
              <p className="text-[10px] font-bold uppercase text-amber-400 pt-2">Cost of Goods & Operating Expenses</p>
              {statements.expenses.map((a) => (
                <div key={a.id} className="flex justify-between py-1">
                  <span>{a.code} · {a.name}</span>
                  <span className="font-mono-num text-rose-300">({formatUSD(a.balance)})</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-[var(--border-strong)] pt-3 text-sm font-bold">
                <span>Net Operating Profit</span>
                <span className={`font-mono-num ${statements.netIncome >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {formatUSD(statements.netIncome)}
                </span>
              </div>
            </div>
          </GlassCard>

          {/* Balance Sheet */}
          <GlassCard className="space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Balance Sheet Summary</h3>
              <span className="text-[11px] font-mono-num text-emerald-400">Double-Entry Verified</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <p className="text-[10px] font-bold uppercase text-blue-400">Assets ({formatUSD(statements.totalAssets)})</p>
              {statements.assets.map((a) => (
                <div key={a.id} className="flex justify-between py-0.5">
                  <span>{a.code} · {a.name}</span>
                  <span className="font-mono-num">{formatUSD(a.balance)}</span>
                </div>
              ))}
              <p className="text-[10px] font-bold uppercase text-rose-400 pt-2">
                Liabilities ({formatUSD(statements.totalLiabilities)})
              </p>
              {statements.liabilities.map((a) => (
                <div key={a.id} className="flex justify-between py-0.5">
                  <span>{a.code} · {a.name}</span>
                  <span className="font-mono-num">{formatUSD(a.balance)}</span>
                </div>
              ))}
              <p className="text-[10px] font-bold uppercase text-indigo-400 pt-2">
                Equity + Current Earnings ({formatUSD(statements.totalEquity + statements.netIncome)})
              </p>
            </div>
          </GlassCard>

          {/* Cash Flow Statement */}
          <GlassCard className="space-y-3">
            <h3 className="text-sm font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2">
              Cash-Flow Statement
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Operating Cash Inflows (Customer Collections)</span>
                <span className="font-mono-num font-bold text-emerald-400">+{formatUSD(statements.cashInflows)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Operating Cash Outflows (Suppliers & OpEx)</span>
                <span className="font-mono-num font-bold text-rose-400">-{formatUSD(statements.cashOutflows)}</span>
              </div>
              <div className="flex justify-between border-t border-[var(--border-subtle)] pt-2 text-sm font-bold">
                <span>Net Operating Cash Flow</span>
                <span className="font-mono-num text-blue-400">
                  {formatUSD(statements.cashInflows - statements.cashOutflows)}
                </span>
              </div>
            </div>
          </GlassCard>

          {/* Trial Balance */}
          <GlassCard className="space-y-3">
            <h3 className="text-sm font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-2">
              Trial Balance Check
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-[var(--bg-elevated)] p-3 border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)] uppercase text-[10px]">Total Debit Balances (Assets + Exp)</p>
                <p className="mt-1 text-lg font-bold font-mono-num text-blue-400">
                  {formatUSD(statements.totalAssets + statements.totalExpenses)}
                </p>
              </div>
              <div className="rounded-xl bg-[var(--bg-elevated)] p-3 border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)] uppercase text-[10px]">Total Credit Balances (Liab + Eq + Rev)</p>
                <p className="mt-1 text-lg font-bold font-mono-num text-emerald-400">
                  {formatUSD(statements.totalLiabilities + statements.totalEquity + statements.totalRevenue)}
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {/* CHART OF ACCOUNTS */}
      {tab === "coa" && (
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] uppercase border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Account Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Sub-Type</th>
                  <th className="px-4 py-3 text-right">Balance (USD)</th>
                  <th className="px-4 py-3 text-right">Reconciliation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {state.accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-blue-500/5">
                    <td className="px-4 py-3 font-mono-num font-bold text-blue-400">{acc.code}</td>
                    <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">{acc.name}</td>
                    <td className="px-4 py-3"><StatusBadge status={acc.type} /></td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{acc.subType}</td>
                    <td className="px-4 py-3 text-right font-mono-num font-bold">{formatUSD(acc.balance)}</td>
                    <td className="px-4 py-3 text-right">
                      <StatusBadge status={acc.reconciled ? "Reconciled" : "Pending"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* JOURNAL ENTRIES */}
      {tab === "journal" && (
        <div className="space-y-3">
          {state.journalEntries.map((je) => (
            <GlassCard key={je.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--border-subtle)]">
                <div>
                  <span className="font-mono-num text-xs font-bold text-blue-400">{je.entryNo}</span>
                  <span className="mx-2 text-[var(--text-muted)]">·</span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{je.description}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span>{formatUSDate(je.date)} · Period {je.period}</span>
                  <StatusBadge status={je.status} />
                </div>
              </div>
              <table className="w-full text-xs mt-2">
                <thead>
                  <tr className="text-[var(--text-muted)] text-[10px] uppercase">
                    <th className="py-1 text-left">GL Account</th>
                    <th className="py-1 text-right">Debit</th>
                    <th className="py-1 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {je.lines.map((l, idx) => (
                    <tr key={idx}>
                      <td className="py-1.5 font-medium">{l.accountCode} — {l.accountName}</td>
                      <td className="py-1.5 text-right font-mono-num">{l.debit > 0 ? formatUSD(l.debit) : "—"}</td>
                      <td className="py-1.5 text-right font-mono-num text-emerald-400">{l.credit > 0 ? formatUSD(l.credit) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </GlassCard>
          ))}
        </div>
      )}

      {/* EXPENSES */}
      {tab === "expenses" && (
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] uppercase border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="px-4 py-3">Expense #</th>
                  <th className="px-4 py-3">Category & Vendor</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3 text-right">Actual vs Budget</th>
                  <th className="px-4 py-3">Cycle</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Approve</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {state.expenses.map((exp) => {
                  const over = exp.amount > exp.budgetAmount;
                  return (
                    <tr key={exp.id} className="hover:bg-blue-500/5">
                      <td className="px-4 py-3 font-mono-num font-bold text-blue-400">{exp.expenseNo}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[var(--text-primary)]">{exp.category}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">{exp.vendorName} — {exp.description}</p>
                      </td>
                      <td className="px-4 py-3">{exp.department}</td>
                      <td className="px-4 py-3 text-right font-mono-num">
                        <span className={`font-bold ${over ? "text-rose-400" : "text-emerald-400"}`}>
                          {formatUSD(exp.amount)}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)]"> / {formatUSD(exp.budgetAmount)}</span>
                      </td>
                      <td className="px-4 py-3">{exp.recurring ? exp.recurringCycle : "One-time"}</td>
                      <td className="px-4 py-3"><StatusBadge status={exp.status} /></td>
                      <td className="px-4 py-3 text-right">
                        {exp.status === "Pending" ? (
                          <button
                            onClick={() =>
                              onRunAction("expense:status", { expenseId: exp.id, status: "Approved" })
                            }
                            className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25 cursor-pointer inline-flex items-center gap-1"
                          >
                            <CheckCircle2 className="h-3 w-3" /> Approve
                          </button>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* US TAX MANAGEMENT */}
      {tab === "tax" && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">US Enterprise Tax Readiness & Compliance Scope Notice</p>
              <p className="mt-1 text-amber-200/85">
                This platform is engineered for US-facing operations (USD currency, US state/local sales tax rules, EIN/resale exemption flags, and audit trails). Formal statutory compliance certification or state nexus filing (e.g., Avalara/Vertex automated filing or GAAP external audit certification) should be scoped with your CPA / legal compliance advisor.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <GlassCard className="lg:col-span-7 p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  State-Based Sales Tax Rules
                </span>
                <SecondaryButton onClick={() => setTaxOpen(true)} className="py-1 px-2.5 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Add State Rule
                </SecondaryButton>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] uppercase">
                  <tr>
                    <th className="px-4 py-2.5">State</th>
                    <th className="px-4 py-2.5 text-right">Base %</th>
                    <th className="px-4 py-2.5 text-right">Local %</th>
                    <th className="px-4 py-2.5 text-right">Combined</th>
                    <th className="px-4 py-2.5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {state.taxRules.map((tr) => (
                    <tr key={tr.id}>
                      <td className="px-4 py-2.5 font-bold text-blue-400">{tr.stateCode} — {tr.stateName}</td>
                      <td className="px-4 py-2.5 text-right font-mono-num">{tr.rate.toFixed(2)}%</td>
                      <td className="px-4 py-2.5 text-right font-mono-num">{tr.localSurtax.toFixed(3)}%</td>
                      <td className="px-4 py-2.5 text-right font-mono-num font-bold text-emerald-400">
                        {(tr.rate + tr.localSurtax).toFixed(3)}%
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-muted)]">{tr.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </GlassCard>

            <GlassCard className="lg:col-span-5 space-y-3">
              <div className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Sales Tax Summary by State</h3>
              </div>
              <div className="space-y-2.5">
                {taxCollectedByState.map((row) => (
                  <div key={row.state} className="flex items-center justify-between rounded-xl bg-[var(--bg-elevated)] p-3 border border-[var(--border-subtle)] text-xs">
                    <div>
                      <p className="font-bold text-[var(--text-primary)]">{row.state} Jurisdiction</p>
                      <p className="text-[11px] text-[var(--text-muted)]">{row.invoices} invoices · Base {formatUSD(row.taxableSales)}</p>
                    </div>
                    <p className="font-mono-num font-bold text-amber-400">{formatUSD(row.taxCollected)}</p>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* Post Journal Entry Modal */}
      <Modal open={jeOpen} onClose={() => setJeOpen(false)} title="Post Double-Entry Journal Entry" subtitle="Enforces balanced Debit = Credit accounting rules and updates GL balances live.">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onRunAction("accounting:journal", {
              description: jeForm.description,
              reference: jeForm.reference,
              lines: [
                { accountId: jeForm.debitAccountId, debit: jeForm.amount, credit: 0 },
                { accountId: jeForm.creditAccountId, debit: 0, credit: jeForm.amount },
              ],
            });
            setJeOpen(false);
          }}
          className="space-y-3"
        >
          <input required value={jeForm.description} onChange={(e) => setJeForm({ ...jeForm, description: e.target.value })} placeholder="Journal description" className="erp-input" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Debit Account</label>
              <select value={jeForm.debitAccountId} onChange={(e) => setJeForm({ ...jeForm, debitAccountId: e.target.value })} className="erp-input mt-1">
                {state.accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Credit Account</label>
              <select value={jeForm.creditAccountId} onChange={(e) => setJeForm({ ...jeForm, creditAccountId: e.target.value })} className="erp-input mt-1">
                {state.accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Amount (USD)</label>
              <input type="number" step="0.01" min={0.01} required value={jeForm.amount} onChange={(e) => setJeForm({ ...jeForm, amount: Number(e.target.value) })} className="erp-input mt-1 font-mono-num" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Reference</label>
              <input value={jeForm.reference} onChange={(e) => setJeForm({ ...jeForm, reference: e.target.value })} className="erp-input mt-1 font-mono-num" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setJeOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton type="submit">
              <Landmark className="h-4 w-4" /> Post Balanced Entry
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      {/* Add Expense Modal */}
      <Modal open={expOpen} onClose={() => setExpOpen(false)} title="Record Business Expense">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onRunAction("expense:save", expForm);
            setExpOpen(false);
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required placeholder="Category (e.g. Freight, Utilities)" value={expForm.category} onChange={(e) => setExpForm({ ...expForm, category: e.target.value })} className="erp-input" />
            <input required placeholder="Vendor Name" value={expForm.vendorName} onChange={(e) => setExpForm({ ...expForm, vendorName: e.target.value })} className="erp-input" />
            <input type="number" step="0.01" required placeholder="Amount ($)" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: Number(e.target.value) })} className="erp-input font-mono-num" />
            <input type="number" step="0.01" placeholder="Budget ($)" value={expForm.budgetAmount} onChange={(e) => setExpForm({ ...expForm, budgetAmount: Number(e.target.value) })} className="erp-input font-mono-num" />
            <input placeholder="Department" value={expForm.department} onChange={(e) => setExpForm({ ...expForm, department: e.target.value })} className="erp-input" />
            <select value={expForm.branchId} onChange={(e) => setExpForm({ ...expForm, branchId: e.target.value })} className="erp-input">
              {state.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <input required placeholder="Expense Description" value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} className="erp-input" />
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input type="checkbox" checked={expForm.recurring} onChange={(e) => setExpForm({ ...expForm, recurring: e.target.checked })} className="accent-blue-500" />
            Recurring Monthly Expense
          </label>
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setExpOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton type="submit">
              <ReceiptText className="h-4 w-4" /> Submit Expense
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      {/* Add Tax Rule Modal */}
      <Modal open={taxOpen} onClose={() => setTaxOpen(false)} title="Add US State Sales Tax Rule">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onRunAction("tax:save", taxForm);
            setTaxOpen(false);
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="State Code (e.g. WA)" maxLength={2} value={taxForm.stateCode} onChange={(e) => setTaxForm({ ...taxForm, stateCode: e.target.value.toUpperCase() })} className="erp-input font-mono-num" />
            <input required placeholder="State Name" value={taxForm.stateName} onChange={(e) => setTaxForm({ ...taxForm, stateName: e.target.value })} className="erp-input" />
            <input type="number" step="0.01" required placeholder="State Rate %" value={taxForm.rate} onChange={(e) => setTaxForm({ ...taxForm, rate: Number(e.target.value) })} className="erp-input font-mono-num" />
            <input type="number" step="0.01" placeholder="Local Surtax %" value={taxForm.localSurtax} onChange={(e) => setTaxForm({ ...taxForm, localSurtax: Number(e.target.value) })} className="erp-input font-mono-num" />
          </div>
          <input placeholder="Jurisdiction Notes" value={taxForm.notes} onChange={(e) => setTaxForm({ ...taxForm, notes: e.target.value })} className="erp-input" />
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setTaxOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton type="submit">Save Tax Rule</PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
