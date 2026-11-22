"use client";

import React, { useMemo, useState } from "react";
import {
  ShoppingCart,
  Plus,
  Trash2,
  Printer,
  Mail,
  Copy,
  RotateCcw,
  FileCheck2,
  ScanBarcode,
  AlertTriangle,
  Download,
  XCircle,
} from "lucide-react";
import type { Invoice, OrderStatus } from "@/types/erp";
import type { ClientERPState } from "./ExecutiveDashboard";
import { exportToCSV, formatUSD, formatUSDate } from "@/lib/utils";
import {
  GlassCard,
  Modal,
  PrimaryButton,
  QRCodeSVG,
  SecondaryButton,
  SectionHeader,
  StatusBadge,
} from "@/components/ui/Primitives";

interface DraftItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
}

const ORDER_STATUSES: OrderStatus[] = [
  "Draft",
  "Pending",
  "Confirmed",
  "Processing",
  "Completed",
  "Cancelled",
  "Returned",
];

export function SalesInvoicingModule({
  state,
  onRunAction,
}: {
  state: ClientERPState;
  onRunAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [tab, setTab] = useState<"punch" | "orders" | "invoices">("punch");
  const [customerId, setCustomerId] = useState(state.customers[0]?.id || "");
  const [branchId, setBranchId] = useState(state.branches[0]?.id || "");
  const [warehouseId, setWarehouseId] = useState(state.warehouses[0]?.id || "");
  const [salesRepId, setSalesRepId] = useState(
    state.employees.find((e) => e.isSalesRep)?.id || state.employees[0]?.id || ""
  );
  const [barcodeInput, setBarcodeInput] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [generateInvoice, setGenerateInvoice] = useState(true);
  const [items, setItems] = useState<DraftItem[]>([
    {
      productId: state.products[0]?.id || "",
      quantity: 20,
      unitPrice: state.products[0]?.wholesalePrice || 72,
      discountPercent: 0,
    },
  ]);

  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedCustomer = state.customers.find((c) => c.id === customerId);
  const taxRule = state.taxRules.find(
    (t) => t.stateCode === (selectedCustomer?.state || state.settings.defaultTaxState) && t.active
  );
  const effectiveTaxRate = selectedCustomer?.taxExempt
    ? 0
    : Number(((taxRule?.rate || 0) + (taxRule?.localSurtax || 0)).toFixed(3));

  const totals = useMemo(() => {
    let subtotal = 0;
    let discountTotal = 0;
    let taxableBase = 0;
    for (const it of items) {
      const p = state.products.find((x) => x.id === it.productId);
      const gross = it.quantity * it.unitPrice;
      const disc = gross * (it.discountPercent / 100);
      subtotal += gross;
      discountTotal += disc;
      if (p?.taxable !== false) taxableBase += gross - disc;
    }
    const taxTotal = taxableBase * (effectiveTaxRate / 100);
    const grandTotal = subtotal - discountTotal + taxTotal;
    return { subtotal, discountTotal, taxTotal, grandTotal };
  }, [items, state.products, effectiveTaxRate]);

  const creditExceeded =
    selectedCustomer &&
    selectedCustomer.currentBalance + totals.grandTotal > selectedCustomer.creditLimit;

  const handleBarcodeScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !barcodeInput.trim()) return;
    e.preventDefault();
    const q = barcodeInput.trim().toLowerCase();
    const match = state.products.find(
      (p) =>
        p.barcode === barcodeInput.trim() ||
        p.sku.toLowerCase() === q ||
        p.name.toLowerCase().includes(q)
    );
    if (match) {
      setItems((prev) => {
        const idx = prev.findIndex((x) => x.productId === match.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
          return next;
        }
        return [
          ...prev,
          { productId: match.id, quantity: 1, unitPrice: match.sellingPrice, discountPercent: 0 },
        ];
      });
    }
    setBarcodeInput("");
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onRunAction("sales:create", {
        customerId,
        branchId,
        warehouseId,
        salesRepId,
        items,
        notes: orderNotes,
        generateInvoice,
        status: "Confirmed",
      });
      setOrderNotes("");
      setTab(generateInvoice ? "invoices" : "orders");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        badge="Sales Order Engine & US Professional Invoicing"
        title="Sales Punching, Orders & US Invoices"
        subtitle="Lightning-fast sales punching with USB barcode scanner support, live US state sales tax calculation, automatic stock deduction, ledger posting, and print-ready US invoices."
        actions={
          <SecondaryButton
            onClick={() =>
              exportToCSV(
                "apexledger-invoices.csv",
                state.invoices.map((i) => ({
                  InvoiceNo: i.invoiceNo,
                  IssueDate: i.issueDate,
                  DueDate: i.dueDate,
                  Customer: state.customers.find((c) => c.id === i.customerId)?.companyName,
                  Subtotal: i.subtotal,
                  Tax: i.taxTotal,
                  Total: i.total,
                  Paid: i.amountPaid,
                  BalanceDue: i.balanceDue,
                  Status: i.status,
                }))
              )
            }
          >
            <Download className="h-4 w-4" /> Export Invoices CSV
          </SecondaryButton>
        }
      />

      {/* Tabs */}
      <GlassCard className="p-3 flex flex-wrap gap-2">
        {(
          [
            ["punch", "Quick Sales Punch / New Order"],
            ["orders", `Sales Orders (${state.salesOrders.length})`],
            ["invoices", `US Professional Invoices (${state.invoices.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all cursor-pointer ${
              tab === k
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md"
                : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </GlassCard>

      {/* TAB 1: QUICK SALES PUNCH */}
      {tab === "punch" && (
        <form onSubmit={handleCreateOrder} className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <GlassCard className="lg:col-span-8 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <ScanBarcode className="h-5 w-5 text-blue-400" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Order Line Items & Barcode Scanner Input
                </h3>
              </div>
              <input
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeScan}
                placeholder="Scan Barcode / SKU + Enter (e.g. Acrylic)..."
                className="erp-input sm:max-w-xs text-xs font-mono-num"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-semibold uppercase text-[var(--text-muted)]">Customer</label>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="erp-input mt-1 text-xs">
                  {state.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName} ({c.state})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase text-[var(--text-muted)]">Branch</label>
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="erp-input mt-1 text-xs">
                  {state.branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase text-[var(--text-muted)]">Dispatch Warehouse</label>
                <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="erp-input mt-1 text-xs">
                  {state.warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase text-[var(--text-muted)]">Sales Rep</label>
                <select value={salesRepId} onChange={(e) => setSalesRepId(e.target.value)} className="erp-input mt-1 text-xs">
                  {state.employees.filter((e) => e.isSalesRep).map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2.5 pt-2">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-end rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3"
                >
                  <div className="col-span-12 sm:col-span-5">
                    <label className="text-[10px] uppercase text-[var(--text-muted)]">Product</label>
                    <select
                      value={it.productId}
                      onChange={(e) => {
                        const prod = state.products.find((p) => p.id === e.target.value);
                        const next = [...items];
                        next[idx] = {
                          ...it,
                          productId: e.target.value,
                          unitPrice: prod?.sellingPrice || it.unitPrice,
                        };
                        setItems(next);
                      }}
                      className="erp-input mt-1 text-xs"
                    >
                      {state.products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {p.sku} (${p.sellingPrice})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className="text-[10px] uppercase text-[var(--text-muted)]">Qty</label>
                    <input
                      type="number"
                      min={1}
                      value={it.quantity}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = { ...it, quantity: Math.max(1, Number(e.target.value)) };
                        setItems(next);
                      }}
                      className="erp-input mt-1 text-xs font-mono-num"
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className="text-[10px] uppercase text-[var(--text-muted)]">Unit ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={it.unitPrice}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = { ...it, unitPrice: Number(e.target.value) };
                        setItems(next);
                      }}
                      className="erp-input mt-1 text-xs font-mono-num"
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <label className="text-[10px] uppercase text-[var(--text-muted)]">Disc %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={it.discountPercent}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = { ...it, discountPercent: Number(e.target.value) };
                        setItems(next);
                      }}
                      className="erp-input mt-1 text-xs font-mono-num"
                    />
                  </div>
                  <div className="col-span-1 flex justify-end pb-1">
                    <button
                      type="button"
                      onClick={() => items.length > 1 && setItems(items.filter((_, i) => i !== idx))}
                      className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <SecondaryButton
              onClick={() =>
                setItems([
                  ...items,
                  {
                    productId: state.products[1]?.id || state.products[0]?.id || "",
                    quantity: 10,
                    unitPrice: state.products[1]?.sellingPrice || 50,
                    discountPercent: 0,
                  },
                ])
              }
            >
              <Plus className="h-4 w-4" /> Add Line Item
            </SecondaryButton>

            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">
                Delivery / Invoice Notes
              </label>
              <input
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="PO reference, freight carrier, or special pallet instructions..."
                className="erp-input mt-1"
              />
            </div>
          </GlassCard>

          {/* Right Order Summary */}
          <GlassCard className="lg:col-span-4 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">US Tax & Order Summary</h3>
                <ShoppingCart className="h-4 w-4 text-blue-400" />
              </div>

              {selectedCustomer && (
                <div className="rounded-xl bg-[var(--bg-elevated)] p-3 text-xs space-y-1 border border-[var(--border-subtle)]">
                  <p className="font-bold text-[var(--text-primary)]">{selectedCustomer.companyName}</p>
                  <p className="text-[var(--text-muted)]">
                    Jurisdiction: <strong>{selectedCustomer.state}</strong> ·{" "}
                    {selectedCustomer.taxExempt ? "Tax-Exempt Resale" : `Sales Tax ${effectiveTaxRate}%`}
                  </p>
                  <p className="text-[var(--text-muted)]">
                    Current Bal: <strong className="font-mono-num text-amber-400">{formatUSD(selectedCustomer.currentBalance)}</strong> / Limit {formatUSD(selectedCustomer.creditLimit)}
                  </p>
                </div>
              )}

              {creditExceeded && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>Credit Limit Alert:</strong> This order exceeds the customer&apos;s credit limit and will automatically trigger an executive alert.
                  </span>
                </div>
              )}

              <div className="space-y-2 text-xs border-t border-[var(--border-subtle)] pt-3">
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Subtotal</span>
                  <span className="font-mono-num font-semibold">{formatUSD(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Discounts</span>
                  <span className="font-mono-num text-emerald-400">-{formatUSD(totals.discountTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">US State Sales Tax ({effectiveTaxRate}%)</span>
                  <span className="font-mono-num">{formatUSD(totals.taxTotal)}</span>
                </div>
                <div className="flex justify-between border-t border-[var(--border-subtle)] pt-3 text-base font-bold">
                  <span>Grand Total (USD)</span>
                  <span className="font-mono-num text-blue-400">{formatUSD(totals.grandTotal)}</span>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={generateInvoice}
                  onChange={(e) => setGenerateInvoice(e.target.checked)}
                  className="accent-blue-500"
                />
                Auto-generate US Invoice, post Customer Ledger Debit & GL Journal Entry
              </label>
            </div>

            <PrimaryButton type="submit" disabled={submitting} className="w-full py-3">
              <FileCheck2 className="h-4 w-4" />
              {submitting ? "Posting Transaction..." : "Confirm Order & Generate Invoice"}
            </PrimaryButton>
          </GlassCard>
        </form>
      )}

      {/* TAB 2: SALES ORDERS */}
      {tab === "orders" && (
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] uppercase border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="px-4 py-3">Order #</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3 text-right">Grand Total</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Lifecycle Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {state.salesOrders.map((so) => (
                  <tr key={so.id} className="hover:bg-blue-500/5">
                    <td className="px-4 py-3 font-mono-num font-bold text-blue-400">{so.orderNo}</td>
                    <td className="px-4 py-3">{formatUSDate(so.date)}</td>
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                      {state.customers.find((c) => c.id === so.customerId)?.companyName}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {so.items.map((i) => `${i.productName} (${i.quantity})`).join(", ")}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num font-bold">{formatUSD(so.grandTotal)}</td>
                    <td className="px-4 py-3"><StatusBadge status={so.paymentStatus} /></td>
                    <td className="px-4 py-3">
                      <select
                        value={so.status}
                        onChange={(e) =>
                          onRunAction("sales:status", { orderId: so.id, status: e.target.value })
                        }
                        className="erp-input py-1 px-2 text-xs w-36"
                      >
                        {ORDER_STATUSES.map((st) => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* TAB 3: US PROFESSIONAL INVOICING */}
      {tab === "invoices" && (
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] uppercase border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Issue / Due</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Balance Due</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {state.invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-blue-500/5">
                    <td className="px-4 py-3 font-mono-num font-bold text-blue-400">{inv.invoiceNo}</td>
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                      {state.customers.find((c) => c.id === inv.customerId)?.companyName}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {formatUSDate(inv.issueDate)} → {formatUSDate(inv.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num font-semibold">{formatUSD(inv.total)}</td>
                    <td className="px-4 py-3 text-right font-mono-num text-emerald-400">{formatUSD(inv.amountPaid)}</td>
                    <td className="px-4 py-3 text-right font-mono-num font-bold text-amber-400">{formatUSD(inv.balanceDue)}</td>
                    <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => setPreviewInvoice(inv)}
                          className="rounded-lg bg-blue-500/15 px-2.5 py-1 text-[11px] font-semibold text-blue-400 hover:bg-blue-500/25 cursor-pointer"
                        >
                          US Invoice / PDF
                        </button>
                        <button
                          onClick={() => onRunAction("invoice:action", { invoiceId: inv.id, op: "email" })}
                          title="Email Invoice"
                          className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-slate-800 hover:text-white cursor-pointer"
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => onRunAction("invoice:action", { invoiceId: inv.id, op: "duplicate" })}
                          title="Duplicate Invoice"
                          className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-slate-800 hover:text-white cursor-pointer"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* US Professional Invoice Preview & Print Modal */}
      <Modal
        open={Boolean(previewInvoice)}
        onClose={() => setPreviewInvoice(null)}
        title={previewInvoice ? `USA Professional Invoice — ${previewInvoice.invoiceNo}` : ""}
        subtitle="Print-ready / Save as PDF US Corporate Invoice with automated tax jurisdiction & payment terms."
        maxWidth="max-w-4xl"
      >
        {previewInvoice && (() => {
          const cust = state.customers.find((c) => c.id === previewInvoice.customerId);
          return (
            <div className="space-y-4">
              {/* Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)] no-print">
                <div className="flex flex-wrap gap-2">
                  <PrimaryButton onClick={() => window.print()}>
                    <Printer className="h-4 w-4" /> Print / Save PDF
                  </PrimaryButton>
                  <SecondaryButton
                    onClick={() =>
                      onRunAction("invoice:action", { invoiceId: previewInvoice.id, op: "email" })
                    }
                  >
                    <Mail className="h-4 w-4" /> Email Client
                  </SecondaryButton>
                  <SecondaryButton
                    onClick={() =>
                      onRunAction("invoice:action", { invoiceId: previewInvoice.id, op: "duplicate" })
                    }
                  >
                    <Copy className="h-4 w-4" /> Duplicate
                  </SecondaryButton>
                </div>
                <div className="flex flex-wrap gap-2">
                  <SecondaryButton
                    onClick={async () => {
                      await onRunAction("invoice:action", { invoiceId: previewInvoice.id, op: "credit_note" });
                      setPreviewInvoice(null);
                    }}
                  >
                    <RotateCcw className="h-4 w-4 text-amber-400" /> Credit Note
                  </SecondaryButton>
                  <SecondaryButton
                    onClick={async () => {
                      await onRunAction("invoice:action", { invoiceId: previewInvoice.id, op: "refund" });
                      setPreviewInvoice(null);
                    }}
                  >
                    Refund
                  </SecondaryButton>
                  <SecondaryButton
                    onClick={async () => {
                      await onRunAction("invoice:action", { invoiceId: previewInvoice.id, op: "cancel" });
                      setPreviewInvoice(null);
                    }}
                  >
                    <XCircle className="h-4 w-4 text-rose-400" /> Cancel
                  </SecondaryButton>
                </div>
              </div>

              {/* US-Style Printable White Invoice Sheet */}
              <div className="print-only-sheet rounded-2xl bg-white text-slate-900 p-8 shadow-xl">
                <div className="flex flex-col sm:flex-row justify-between gap-6 border-b-2 border-slate-900 pb-6">
                  <div>
                    <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
                      {state.settings.legalName}
                    </h2>
                    <p className="text-xs text-slate-600 mt-1">{state.settings.address}</p>
                    <p className="text-xs text-slate-600">{state.settings.cityStateZip}</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Phone: {state.settings.phone} · EIN: {state.settings.ein}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <span className="inline-block rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white">
                      INVOICE
                    </span>
                    <p className="mt-2 font-mono-num text-xl font-extrabold text-slate-900">
                      {previewInvoice.invoiceNo}
                    </p>
                    <p className="text-xs text-slate-600">Issue Date: {formatUSDate(previewInvoice.issueDate)}</p>
                    <p className="text-xs font-bold text-rose-600">Due Date: {formatUSDate(previewInvoice.dueDate)} ({previewInvoice.paymentTerms})</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-5 border-b border-slate-200 text-xs">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Bill To</p>
                    <p className="mt-1 font-bold text-slate-900">{cust?.companyName}</p>
                    <p className="text-slate-600">{cust?.contactPerson}</p>
                    <p className="text-slate-600">{previewInvoice.billingAddress}</p>
                    {cust?.taxId && <p className="text-slate-500 mt-0.5">Tax ID / EIN: {cust.taxId}</p>}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Ship To</p>
                    <p className="mt-1 font-bold text-slate-900">{cust?.companyName}</p>
                    <p className="text-slate-600">{previewInvoice.shippingAddress}</p>
                  </div>
                  <div className="flex sm:justify-end items-center">
                    <QRCodeSVG value={`PAY:${previewInvoice.invoiceNo}:${previewInvoice.balanceDue}`} />
                  </div>
                </div>

                <table className="w-full text-left text-xs mt-5">
                  <thead>
                    <tr className="border-b-2 border-slate-200 text-slate-500 uppercase text-[10px]">
                      <th className="py-2">SKU / Description</th>
                      <th className="py-2 text-right">Qty</th>
                      <th className="py-2 text-right">Unit Price</th>
                      <th className="py-2 text-right">Disc %</th>
                      <th className="py-2 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewInvoice.items.map((item, i) => (
                      <tr key={i}>
                        <td className="py-2.5">
                          <p className="font-bold text-slate-900">{item.productName}</p>
                          <p className="text-[11px] font-mono-num text-slate-500">{item.sku} · {item.uom}</p>
                        </td>
                        <td className="py-2.5 text-right font-mono-num">{item.quantity}</td>
                        <td className="py-2.5 text-right font-mono-num">{formatUSD(item.unitPrice)}</td>
                        <td className="py-2.5 text-right font-mono-num">{item.discountPercent}%</td>
                        <td className="py-2.5 text-right font-mono-num font-bold">{formatUSD(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-6 flex flex-col sm:flex-row justify-between gap-6 border-t border-slate-200 pt-5">
                  <div className="max-w-sm text-xs text-slate-600 space-y-1.5">
                    <p className="font-bold text-slate-800 uppercase text-[10px]">Notes & Terms</p>
                    <p>{previewInvoice.notes}</p>
                    <p className="text-[11px] text-slate-500">{previewInvoice.termsAndConditions}</p>
                  </div>
                  <div className="w-full sm:w-64 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Subtotal</span>
                      <span className="font-mono-num font-semibold">{formatUSD(previewInvoice.subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Discount</span>
                      <span className="font-mono-num text-emerald-600">-{formatUSD(previewInvoice.discountTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Sales Tax ({previewInvoice.taxState} {previewInvoice.taxRate}%)</span>
                      <span className="font-mono-num">{formatUSD(previewInvoice.taxTotal)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-300 pt-2 text-sm font-extrabold">
                      <span>Total (USD)</span>
                      <span className="font-mono-num">{formatUSD(previewInvoice.total)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700">
                      <span>Amount Paid</span>
                      <span className="font-mono-num font-semibold">-{formatUSD(previewInvoice.amountPaid)}</span>
                    </div>
                    <div className="flex justify-between rounded-lg bg-slate-900 text-white px-3 py-2 text-sm font-extrabold">
                      <span>Balance Due</span>
                      <span className="font-mono-num">{formatUSD(previewInvoice.balanceDue)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
