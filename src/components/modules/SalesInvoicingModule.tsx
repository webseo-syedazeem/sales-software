"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  Wallet,
} from "lucide-react";
import type { OrderStatus } from "@/types/erp";
import type { ClientERPState } from "./ExecutiveDashboard";
import { exportToCSV, formatUSD, formatUSDate } from "@/lib/utils";
import {
  GlassCard,
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

const PIPELINE_COLORS: Record<OrderStatus, string> = {
  Draft: "#6B6F78",
  Pending: "#D97706",
  Confirmed: "#1E3FAE",
  Processing: "#7C3AED",
  Completed: "#05603F",
  Cancelled: "#A11A1A",
  Returned: "#EA580C",
};

export function SalesInvoicingModule({
  state,
  initialTab = "orders",
  onRunAction,
}: {
  state: ClientERPState;
  initialTab?: "punch" | "orders" | "invoices";
  onRunAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [tab, setTab] = useState<"punch" | "orders" | "invoices">(initialTab);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [invFilter, setInvFilter] = useState<"All" | "Open" | "Overdue" | "Paid">("All");
  const [selectedInvId, setSelectedInvId] = useState<string>(state.invoices[0]?.id || "");

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!selectedInvId && state.invoices[0]) {
      setSelectedInvId(state.invoices[0].id);
    }
  }, [state.invoices, selectedInvId]);

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
      quantity: 10,
      unitPrice: state.products[0]?.sellingPrice || 82.5,
      discountPercent: 0,
    },
  ]);
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
    selectedCustomer.creditLimit > 0 &&
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

  const todayIso = new Date().toISOString().slice(0, 10);
  const filteredOrders =
    statusFilter === "ALL"
      ? state.salesOrders
      : state.salesOrders.filter((o) => o.status === statusFilter);

  const filteredInvoices = state.invoices.filter((inv) => {
    if (invFilter === "All") return true;
    if (invFilter === "Paid") return inv.status === "Paid";
    if (invFilter === "Overdue") return inv.balanceDue > 0 && (inv.status === "Overdue" || inv.dueDate < todayIso);
    return inv.balanceDue > 0 && inv.status !== "Cancelled";
  });

  const activeInvoice =
    state.invoices.find((i) => i.id === selectedInvId) || filteredInvoices[0] || null;
  const activeInvCustomer = activeInvoice
    ? state.customers.find((c) => c.id === activeInvoice.customerId)
    : null;

  return (
    <div className="space-y-5">
      <SectionHeader
        title={tab === "invoices" ? "Invoices" : "Sales orders"}
        subtitle={
          tab === "invoices"
            ? "US-style professional invoices with automatic numbering, branding, state tax, PAID/OVERDUE stamps, and one-click delivery."
            : "Punch quick sales with barcode scanning, track every order from draft to completion, and manage returns."
        }
        actions={
          <>
            <SecondaryButton
              onClick={() =>
                exportToCSV(
                  tab === "invoices" ? "nexora-invoices.csv" : "nexora-orders.csv",
                  (tab === "invoices" ? state.invoices : state.salesOrders) as unknown as Record<string, unknown>[]
                )
              }
            >
              <Download className="h-4 w-4" /> Export
            </SecondaryButton>
            <PrimaryButton onClick={() => setTab("punch")}>
              <Plus className="h-4 w-4" /> New sales order
            </PrimaryButton>
          </>
        }
      />

      {/* Nexora Stone Segmented Tabs */}
      <div className="inline-flex flex-wrap gap-1 p-1 rounded-[10px] bg-[#E9E6DF]">
        {(
          [
            ["orders", `Orders (${state.salesOrders.length})`],
            ["punch", "Quick sales punch"],
            ["invoices", `US Invoices (${state.invoices.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`min-h-[34px] px-3.5 rounded-[8px] text-[13px] font-semibold cursor-pointer transition-all ${
              tab === k
                ? "bg-white text-[#111317] shadow-[0_1px_3px_rgba(17,19,23,0.14)]"
                : "text-[#5F636C] hover:text-[#111317]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: ORDERS + 7-STAGE PIPELINE */}
      {tab === "orders" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {ORDER_STATUSES.map((st) => {
              const list = state.salesOrders.filter((o) => o.status === st);
              const val = list.reduce((s, o) => s + o.grandTotal, 0);
              const selected = statusFilter === st;
              return (
                <button
                  key={st}
                  onClick={() => setStatusFilter(selected ? "ALL" : st)}
                  className={`nexora-card nexora-card-hover p-3.5 text-left cursor-pointer ${
                    selected ? "border-[#111317] bg-[#FAFCF4]" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PIPELINE_COLORS[st] }} />
                    <span className="text-[12.5px] font-semibold text-[#4A4E57]">{st}</span>
                  </div>
                  <div className="h num text-[22px] font-bold text-[#111317] mt-1.5">{list.length}</div>
                  <div className="num text-[12px] text-[#5F636C]">{formatUSD(val)}</div>
                </button>
              );
            })}
          </div>

          <GlassCard className="p-0 overflow-hidden">
            {filteredOrders.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <p className="text-[14px] font-semibold text-[#111317]">No sales orders recorded yet</p>
                <p className="text-[13px] text-[#5F636C]">
                  Add a customer in Customers & CRM, then punch your first order to automatically generate a US invoice, ledger entry, and stock deduction.
                </p>
                <PrimaryButton onClick={() => setTab("punch")}>
                  <Plus className="h-4 w-4" /> Create first sales order
                </PrimaryButton>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13.5px]">
                  <thead className="bg-[#F8F7F3] text-[#6B6F78] uppercase text-[11px] border-b border-[#E6E3DC]">
                    <tr>
                      <th className="px-5 py-3">Order</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Customer</th>
                      <th className="px-5 py-3">Items</th>
                      <th className="px-5 py-3 text-right">Total</th>
                      <th className="px-5 py-3">Payment</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Invoice</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEECE7]">
                    {filteredOrders.map((so) => (
                      <tr key={so.id} className="hover:bg-[#F8F7F3]">
                        <td className="px-5 py-3 num font-bold text-[#111317]">{so.orderNo}</td>
                        <td className="px-5 py-3 text-[#5F636C]">{formatUSDate(so.date)}</td>
                        <td className="px-5 py-3 font-semibold text-[#111317]">
                          {state.customers.find((c) => c.id === so.customerId)?.companyName}
                        </td>
                        <td className="px-5 py-3 text-[#5F636C]">
                          {so.items.map((i) => `${i.productName} (${i.quantity})`).join(", ")}
                        </td>
                        <td className="px-5 py-3 text-right num font-bold text-[#111317]">
                          {formatUSD(so.grandTotal)}
                        </td>
                        <td className="px-5 py-3"><StatusBadge status={so.paymentStatus} /></td>
                        <td className="px-5 py-3">
                          <select
                            value={so.status}
                            onChange={(e) =>
                              onRunAction("sales:status", { orderId: so.id, status: e.target.value })
                            }
                            className="erp-input min-h-[32px] py-1 px-2 text-[12.5px] w-36"
                          >
                            {ORDER_STATUSES.map((st) => (
                              <option key={st} value={st}>{st}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-5 py-3 text-right">
                          {so.invoiceId ? (
                            <SecondaryButton
                              className="min-h-[30px] text-[12px] px-2.5"
                              onClick={() => {
                                setSelectedInvId(so.invoiceId!);
                                setTab("invoices");
                              }}
                            >
                              View Invoice
                            </SecondaryButton>
                          ) : (
                            <span className="text-[12px] text-[#6B6F78]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* TAB 2: QUICK SALES PUNCH */}
      {tab === "punch" && (
        <form onSubmit={handleCreateOrder} className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <GlassCard className="lg:col-span-8 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#EEECE7]">
              <div className="flex items-center gap-2">
                <ScanBarcode className="h-5 w-5 text-[#111317]" />
                <h2 className="h text-[17px] font-bold text-[#111317]">
                  Quick sales order · Barcode / SKU entry
                </h2>
              </div>
              <input
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeScan}
                placeholder="Scan Barcode / type SKU + Enter..."
                className="erp-input sm:max-w-xs text-[13px] num"
              />
            </div>

            {state.customers.length === 0 ? (
              <div className="rounded-[12px] bg-[#FDF0DC] border border-[#F3D7AA] p-4 text-[13px] text-[#7F4505]">
                No customers exist yet. Go to <b>Customers</b> on the left rail and create your first customer before punching an order.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1">Customer</label>
                  <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="erp-input text-[13px]">
                    {state.customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.companyName} ({c.state})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1">Branch</label>
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="erp-input text-[13px]">
                    {state.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1">Warehouse</label>
                  <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="erp-input text-[13px]">
                    {state.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1">Sales rep</label>
                  <select value={salesRepId} onChange={(e) => setSalesRepId(e.target.value)} className="erp-input text-[13px]">
                    <option value="">Direct / House</option>
                    {state.employees.filter((e) => e.isSalesRep).map((e) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="space-y-2.5">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-end rounded-[12px] border border-[#EEECE7] bg-[#FAF9F6] p-3"
                >
                  <div className="col-span-12 sm:col-span-5">
                    <label className="block text-[11px] font-semibold text-[#5F636C] mb-1">Product</label>
                    <select
                      value={it.productId}
                      onChange={(e) => {
                        const prod = state.products.find((p) => p.id === e.target.value);
                        const next = [...items];
                        next[idx] = { ...it, productId: e.target.value, unitPrice: prod?.sellingPrice || it.unitPrice };
                        setItems(next);
                      }}
                      className="erp-input text-[13px]"
                    >
                      {state.products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} — {p.sku} (${p.sellingPrice})</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-[#5F636C] mb-1">Qty</label>
                    <input
                      type="number"
                      min={1}
                      value={it.quantity}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = { ...it, quantity: Math.max(1, Number(e.target.value)) };
                        setItems(next);
                      }}
                      className="erp-input num text-[13px]"
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-[#5F636C] mb-1">Unit ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={it.unitPrice}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = { ...it, unitPrice: Number(e.target.value) };
                        setItems(next);
                      }}
                      className="erp-input num text-[13px]"
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-[#5F636C] mb-1">Disc %</label>
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
                      className="erp-input num text-[13px]"
                    />
                  </div>
                  <div className="col-span-1 flex justify-end pb-1">
                    <button
                      type="button"
                      onClick={() => items.length > 1 && setItems(items.filter((_, i) => i !== idx))}
                      className="p-2 rounded-[8px] text-[#A11A1A] hover:bg-[#FCE8E8] cursor-pointer"
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
                    quantity: 5,
                    unitPrice: state.products[1]?.sellingPrice || 50,
                    discountPercent: 0,
                  },
                ])
              }
            >
              <Plus className="h-4 w-4" /> Add line item
            </SecondaryButton>

            <div>
              <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1">Order / delivery notes</label>
              <input
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="Customer PO #, freight instructions..."
                className="erp-input"
              />
            </div>
          </GlassCard>

          <GlassCard className="lg:col-span-4 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="h text-[16px] font-bold text-[#111317]">Order totals</h2>
                <ShoppingCart className="h-4 w-4 text-[#5F636C]" />
              </div>

              {selectedCustomer && (
                <div className="rounded-[12px] bg-[#F6F5F1] border border-[#EEECE7] p-3.5 text-[12.5px] space-y-1">
                  <p className="font-bold text-[#111317]">{selectedCustomer.companyName}</p>
                  <p className="text-[#5F636C]">
                    {selectedCustomer.paymentTerms} · State: <b>{selectedCustomer.state}</b> ·{" "}
                    {selectedCustomer.taxExempt ? "Tax-Exempt" : `${effectiveTaxRate}% tax`}
                  </p>
                  <p className="text-[#5F636C]">
                    Open bal: <b className="num text-[#111317]">{formatUSD(selectedCustomer.currentBalance)}</b> / Limit {formatUSD(selectedCustomer.creditLimit)}
                  </p>
                </div>
              )}

              {creditExceeded && (
                <div className="rounded-[12px] bg-[#FCE8E8] text-[#A11A1A] p-3 text-[13px] font-semibold flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Credit limit exceeded — an alert will be logged for Finance review.</span>
                </div>
              )}

              <div className="space-y-2 text-[13.5px] border-t border-[#EEECE7] pt-3">
                <div className="flex justify-between"><span className="text-[#5F636C]">Subtotal</span><span className="num font-semibold">{formatUSD(totals.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-[#5F636C]">Discounts</span><span className="num text-[#05603F]">-{formatUSD(totals.discountTotal)}</span></div>
                <div className="flex justify-between"><span className="text-[#5F636C]">Sales tax ({effectiveTaxRate}%)</span><span className="num">{formatUSD(totals.taxTotal)}</span></div>
                <div className="flex justify-between border-t border-[#111317] pt-3 text-[18px] font-bold">
                  <span className="h">Grand total</span>
                  <span className="h num">{formatUSD(totals.grandTotal)}</span>
                </div>
              </div>

              <label className="flex items-center gap-2 text-[13px] text-[#4A4E57] cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateInvoice}
                  onChange={(e) => setGenerateInvoice(e.target.checked)}
                  className="w-4 h-4 accent-[#16181D]"
                />
                Generate US Invoice, post Customer Ledger & balanced GL entry
              </label>
            </div>

            <PrimaryButton type="submit" disabled={submitting || state.customers.length === 0} className="w-full min-h-[46px]">
              <FileCheck2 className="h-4 w-4" />
              {submitting ? "Posting to MongoDB..." : "Confirm order & issue invoice"}
            </PrimaryButton>
          </GlassCard>
        </form>
      )}

      {/* TAB 3: EXACT NEXORA SPLIT-VIEW US PROFESSIONAL INVOICE SCREEN */}
      {tab === "invoices" && (
        <div className="flex flex-wrap gap-4 items-start">
          {/* Left Invoice Selector Column */}
          <GlassCard className="flex-1 basis-[300px] min-w-0 p-0 overflow-hidden no-print">
            <div className="p-3.5 border-b border-[#EEECE7] flex flex-wrap gap-1.5">
              {(["All", "Open", "Overdue", "Paid"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setInvFilter(f)}
                  className={`min-h-[30px] px-3 rounded-[8px] text-[12px] font-semibold cursor-pointer border ${
                    invFilter === f
                      ? "bg-[#111317] border-[#111317] text-white"
                      : "bg-white border-[#E0DDD5] text-[#4A4E57]"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="p-2.5 space-y-1.5 max-h-[680px] overflow-y-auto">
              {filteredInvoices.length === 0 && (
                <p className="text-xs text-[#5F636C] py-8 text-center">No invoices match this filter.</p>
              )}
              {filteredInvoices.map((inv) => {
                const on = activeInvoice?.id === inv.id;
                const cust = state.customers.find((c) => c.id === inv.customerId);
                return (
                  <button
                    key={inv.id}
                    onClick={() => setSelectedInvId(inv.id)}
                    className={`w-full flex items-center justify-between gap-2 p-3 rounded-[12px] border text-left transition-all cursor-pointer ${
                      on
                        ? "border-[#111317] bg-[#F3F8E6]"
                        : "border-[#EEECE7] bg-white hover:bg-[#FAF9F6]"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="num text-[13.5px] font-bold text-[#111317]">{inv.invoiceNo}</p>
                      <p className="text-[12.5px] text-[#4A4E57] truncate">{cust?.companyName}</p>
                      <p className="text-[11.5px] text-[#5F636C]">Due {formatUSDate(inv.dueDate)}</p>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p className="num text-[13.5px] font-bold text-[#111317]">{formatUSD(inv.total)}</p>
                      <StatusBadge status={inv.status} />
                    </div>
                  </button>
                );
              })}
            </div>
          </GlassCard>

          {/* Right Nexora US Invoice Action Bar + Paper Sheet */}
          <div className="flex-[2.4] basis-[640px] min-w-0 space-y-3.5">
            {!activeInvoice ? (
              <GlassCard className="p-12 text-center space-y-3">
                <p className="h text-[18px] font-bold text-[#111317]">No US invoices yet</p>
                <p className="text-[13.5px] text-[#5F636C]">
                  Punch a sales order to automatically generate your first branded US corporate invoice.
                </p>
                <PrimaryButton onClick={() => setTab("punch")}>
                  <Plus className="h-4 w-4" /> Create first invoice
                </PrimaryButton>
              </GlassCard>
            ) : (
              <>
                <GlassCard className="p-3 flex flex-wrap items-center gap-2 no-print">
                  <SecondaryButton className="min-h-[32px] text-[12.5px] px-3" onClick={() => window.print()}>
                    <Printer className="h-3.5 w-3.5" /> Print / PDF
                  </SecondaryButton>
                  <SecondaryButton
                    className="min-h-[32px] text-[12.5px] px-3"
                    onClick={() => onRunAction("invoice:action", { invoiceId: activeInvoice.id, op: "email" })}
                  >
                    <Mail className="h-3.5 w-3.5" /> Email
                  </SecondaryButton>
                  <SecondaryButton
                    className="min-h-[32px] text-[12.5px] px-3"
                    onClick={() => onRunAction("invoice:action", { invoiceId: activeInvoice.id, op: "duplicate" })}
                  >
                    <Copy className="h-3.5 w-3.5" /> Duplicate
                  </SecondaryButton>
                  <SecondaryButton
                    className="min-h-[32px] text-[12.5px] px-3"
                    onClick={() => onRunAction("invoice:action", { invoiceId: activeInvoice.id, op: "credit_note" })}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Credit note
                  </SecondaryButton>
                  <SecondaryButton
                    className="min-h-[32px] text-[12.5px] px-3"
                    onClick={() => onRunAction("invoice:action", { invoiceId: activeInvoice.id, op: "refund" })}
                  >
                    Refund
                  </SecondaryButton>
                  <SecondaryButton
                    className="min-h-[32px] text-[12.5px] px-3 text-[#A11A1A]"
                    onClick={() => onRunAction("invoice:action", { invoiceId: activeInvoice.id, op: "cancel" })}
                  >
                    <XCircle className="h-3.5 w-3.5" /> Cancel
                  </SecondaryButton>
                  {activeInvoice.balanceDue > 0 && (
                    <PrimaryButton
                      className="min-h-[32px] text-[12.5px] px-3 ml-auto"
                      onClick={() =>
                        onRunAction("payment:record", {
                          customerId: activeInvoice.customerId,
                          invoiceId: activeInvoice.id,
                          amount: activeInvoice.balanceDue,
                          method: "Bank Transfer (ACH)",
                          paymentType: "Standard",
                          notes: `Full settlement for ${activeInvoice.invoiceNo}`,
                        })
                      }
                    >
                      <Wallet className="h-3.5 w-3.5" /> Record full payment
                    </PrimaryButton>
                  )}
                </GlassCard>

                {/* Exact Nexora US Paper Invoice with Top #16181D Bar & PAID / OVERDUE Stamps */}
                <article className="print-only-sheet nexora-card p-8 sm:p-11 relative overflow-hidden shadow-[0_30px_70px_-40px_rgba(17,19,23,0.45)]">
                  <div className="absolute top-0 left-0 right-0 h-[6px] bg-[#16181D]" />

                  {activeInvoice.status === "Paid" && (
                    <div className="nexora-stamp pointer-events-none absolute right-14 top-36 border-4 border-[#10B981] text-[#10B981] h font-bold text-[38px] px-5 py-1 rounded-[10px] tracking-[0.12em]">
                      PAID
                    </div>
                  )}
                  {activeInvoice.balanceDue > 0 && (activeInvoice.status === "Overdue" || activeInvoice.dueDate < todayIso) && (
                    <div className="nexora-stamp pointer-events-none absolute right-12 top-36 border-4 border-[#DC2626] text-[#DC2626] h font-bold text-[32px] px-5 py-1 rounded-[10px] tracking-[0.12em]">
                      OVERDUE
                    </div>
                  )}

                  <header className="flex flex-wrap justify-between gap-6">
                    <div className="flex gap-3.5">
                      <span className="w-[50px] h-[50px] rounded-[14px] bg-[#16181D] flex items-center justify-center shrink-0">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 19V5l14 14V5" />
                        </svg>
                      </span>
                      <div className="text-[13px] leading-relaxed text-[#4A4E57]">
                        <div className="h text-[20px] font-bold text-[#111317]">{state.settings.legalName}</div>
                        {state.settings.address && <div>{state.settings.address}</div>}
                        {state.settings.cityStateZip && <div>{state.settings.cityStateZip}</div>}
                        <div>
                          {state.settings.phone ? `${state.settings.phone} · ` : ""}
                          {state.settings.email}
                        </div>
                        {state.settings.ein && <div>EIN {state.settings.ein}</div>}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="h text-[38px] font-bold tracking-[0.02em] text-[#16181D] leading-none">INVOICE</div>
                      <div className="num text-[14px] font-bold text-[#111317] mt-1.5">{activeInvoice.invoiceNo}</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] mt-3 text-right">
                        <span className="text-[#5F636C]">Invoice date</span><span>{formatUSDate(activeInvoice.issueDate)}</span>
                        <span className="text-[#5F636C]">Due date</span><span className="font-bold">{formatUSDate(activeInvoice.dueDate)}</span>
                        <span className="text-[#5F636C]">Terms</span><span>{activeInvoice.paymentTerms}</span>
                      </div>
                    </div>
                  </header>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-8 p-5 bg-[#F6F5F1] rounded-[12px] text-[13px]">
                    <div>
                      <div className="text-[11px] font-bold tracking-[0.1em] text-[#16181D]">BILL TO</div>
                      <div className="font-bold text-[15px] text-[#111317] mt-1">{activeInvCustomer?.companyName}</div>
                      <div className="text-[#4A4E57] mt-0.5">{activeInvoice.billingAddress || "USA"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold tracking-[0.1em] text-[#16181D]">SHIP TO</div>
                      <div className="font-bold text-[15px] text-[#111317] mt-1">{activeInvCustomer?.companyName}</div>
                      <div className="text-[#4A4E57] mt-0.5">{activeInvoice.shippingAddress || "USA"}</div>
                    </div>
                    <div className="flex sm:flex-col sm:items-end justify-between">
                      <div>
                        <div className="text-[11px] font-bold tracking-[0.1em] text-[#16181D]">BALANCE DUE</div>
                        <div className="h num text-[28px] font-bold text-[#111317] mt-1">
                          {formatUSD(activeInvoice.balanceDue)}
                        </div>
                        <div className="text-[12px] text-[#5F636C]">
                          USD · {activeInvoice.taxState} ({activeInvoice.taxRate}%)
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 overflow-x-auto">
                    <table className="w-full text-left text-[13.5px]">
                      <thead>
                        <tr className="border-b-2 border-[#111317] text-[11px] font-bold uppercase tracking-[0.08em] text-[#4A4E57]">
                          <th className="py-2.5">Description</th>
                          <th className="py-2.5 text-right">Qty</th>
                          <th className="py-2.5">Unit</th>
                          <th className="py-2.5 text-right">Unit Price</th>
                          <th className="py-2.5 text-right">Disc</th>
                          <th className="py-2.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EEECE7]">
                        {activeInvoice.items.map((li, i) => (
                          <tr key={i}>
                            <td className="py-3">
                              <b className="text-[#111317]">{li.productName}</b>
                              <div className="text-[12px] text-[#5F636C] num">{li.sku}</div>
                            </td>
                            <td className="py-3 text-right num">{li.quantity}</td>
                            <td className="py-3 text-[#5F636C]">{li.uom}</td>
                            <td className="py-3 text-right num">{formatUSD(li.unitPrice)}</td>
                            <td className="py-3 text-right num">{li.discountPercent}%</td>
                            <td className="py-3 text-right num font-semibold">{formatUSD(li.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap justify-between gap-8 mt-6 pt-5 border-t border-[#EEECE7]">
                    <div className="flex-1 min-w-[240px] flex items-start gap-4">
                      <QRCodeSVG value={`INV:${activeInvoice.invoiceNo}:${activeInvoice.balanceDue}`} />
                      <div className="text-[12.5px] text-[#4A4E57] space-y-1.5">
                        <div className="text-[11px] font-bold tracking-[0.1em] text-[#16181D]">NOTES & TERMS</div>
                        <p>{activeInvoice.notes}</p>
                        <p className="text-[#5F636C]">{activeInvoice.termsAndConditions}</p>
                      </div>
                    </div>

                    <div className="w-full sm:w-[290px] space-y-2 text-[13.5px]">
                      <div className="flex justify-between"><span className="text-[#5F636C]">Subtotal</span><span className="num">{formatUSD(activeInvoice.subtotal)}</span></div>
                      <div className="flex justify-between"><span className="text-[#5F636C]">Discounts</span><span className="num text-[#05603F]">-{formatUSD(activeInvoice.discountTotal)}</span></div>
                      <div className="flex justify-between"><span className="text-[#5F636C]">Sales tax ({activeInvoice.taxRate}%)</span><span className="num">{formatUSD(activeInvoice.taxTotal)}</span></div>
                      <div className="flex justify-between border-t border-[#111317] pt-2.5 text-[15px] font-bold">
                        <span>Total (USD)</span><span className="num">{formatUSD(activeInvoice.total)}</span>
                      </div>
                      <div className="flex justify-between text-[#05603F]">
                        <span>Amount paid</span><span className="num font-semibold">-{formatUSD(activeInvoice.amountPaid)}</span>
                      </div>
                      <div className="flex justify-between rounded-[10px] bg-[#111317] text-white px-3.5 py-2.5 font-bold text-[15px]">
                        <span>Balance due</span><span className="num text-[#C5F04A]">{formatUSD(activeInvoice.balanceDue)}</span>
                      </div>
                    </div>
                  </div>
                </article>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
