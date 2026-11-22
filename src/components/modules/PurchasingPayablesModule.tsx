"use client";

import React, { useState } from "react";
import { Truck, Plus, PackageCheck, DollarSign, Star, Building } from "lucide-react";
import type { ClientERPState } from "./ExecutiveDashboard";
import { formatUSD, formatUSDate } from "@/lib/utils";
import {
  GlassCard,
  KpiTile,
  Modal,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  StatusBadge,
} from "@/components/ui/Primitives";

export function PurchasingPayablesModule({
  state,
  onRunAction,
}: {
  state: ClientERPState;
  onRunAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [tab, setTab] = useState<"suppliers" | "purchases" | "payables">("purchases");
  const [supOpen, setSupOpen] = useState(false);
  const [poOpen, setPoOpen] = useState(false);

  const [supForm, setSupForm] = useState({
    companyName: "",
    contactPerson: "",
    phone: "+1 ",
    email: "",
    state: "TX",
    paymentTerms: "Net 30",
    category: "Polymers & Sheets",
  });

  const [poForm, setPoForm] = useState({
    supplierId: state.suppliers[0]?.id || "",
    warehouseId: state.warehouses[0]?.id || "",
    productId: state.products[0]?.id || "",
    quantity: 100,
    unitCost: state.products[0]?.purchasePrice || 46,
    notes: "Scheduled inventory replenishment",
  });

  const totalPayables = state.suppliers.reduce((s, v) => s + v.currentPayable, 0);
  const openPOs = state.purchaseOrders.filter((p) => p.status !== "Received" && p.status !== "Cancelled");
  const avgOnTime =
    state.suppliers.reduce((s, v) => s + v.onTimeDeliveryRate, 0) / Math.max(1, state.suppliers.length);

  return (
    <div className="space-y-6">
      <SectionHeader
        badge="Procurement, Vendors & Accounts Payable"
        title="Suppliers, Purchasing & AP"
        subtitle="Manage enterprise vendors, purchase orders, 1-click goods receiving (auto-increments warehouse lots), supplier ledgers, and scheduled AP bill settlements."
        actions={
          <>
            <SecondaryButton onClick={() => setSupOpen(true)}>
              <Plus className="h-4 w-4" /> Add Supplier
            </SecondaryButton>
            <PrimaryButton onClick={() => setPoOpen(true)}>
              <Plus className="h-4 w-4" /> New Purchase Order
            </PrimaryButton>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Total Accounts Payable" value={formatUSD(totalPayables)} icon={<DollarSign className="h-5 w-5" />} tone="amber" />
        <KpiTile label="Active Vendors" value={String(state.suppliers.length)} icon={<Building className="h-5 w-5" />} tone="blue" />
        <KpiTile label="Open Purchase Orders" value={String(openPOs.length)} icon={<Truck className="h-5 w-5" />} tone="indigo" />
        <KpiTile label="Avg On-Time Delivery" value={`${avgOnTime.toFixed(1)}%`} positive icon={<Star className="h-5 w-5" />} tone="emerald" />
      </div>

      <GlassCard className="p-3 flex flex-wrap gap-2">
        {(
          [
            ["purchases", `Purchase Orders & Receiving (${state.purchaseOrders.length})`],
            ["suppliers", `Vendor Master & Scorecards (${state.suppliers.length})`],
            ["payables", "Accounts Payable & Aging"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer ${
              tab === k ? "bg-blue-600 text-white" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
            }`}
          >
            {label}
          </button>
        ))}
      </GlassCard>

      {tab === "purchases" && (
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] uppercase border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="px-4 py-3">PO #</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Expected</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">PO Status</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {state.purchaseOrders.map((po) => (
                  <tr key={po.id} className="hover:bg-blue-500/5">
                    <td className="px-4 py-3 font-mono-num font-bold text-blue-400">{po.poNo}</td>
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                      {state.suppliers.find((s) => s.id === po.supplierId)?.companyName}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {po.items.map((i) => `${i.productName} (${i.quantity})`).join(", ")}
                    </td>
                    <td className="px-4 py-3">{formatUSDate(po.expectedDate)}</td>
                    <td className="px-4 py-3 text-right font-mono-num font-bold">{formatUSD(po.total)}</td>
                    <td className="px-4 py-3"><StatusBadge status={po.status} /></td>
                    <td className="px-4 py-3"><StatusBadge status={po.paymentStatus} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1.5">
                        {po.status !== "Received" && (
                          <button
                            onClick={() => onRunAction("purchase:receive", { poId: po.id })}
                            className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25 cursor-pointer inline-flex items-center gap-1"
                          >
                            <PackageCheck className="h-3.5 w-3.5" /> Receive Goods
                          </button>
                        )}
                        {po.paymentStatus !== "Paid" && (
                          <button
                            onClick={() => onRunAction("purchase:pay", { poId: po.id })}
                            className="rounded-lg bg-blue-500/15 px-2.5 py-1 text-[11px] font-semibold text-blue-300 hover:bg-blue-500/25 cursor-pointer"
                          >
                            Pay Bill
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {tab === "suppliers" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {state.suppliers.map((s) => (
            <GlassCard key={s.id} hover>
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-mono-num text-[11px] font-bold text-blue-400">{s.vendorCode}</span>
                  <h3 className="text-base font-bold text-[var(--text-primary)] mt-0.5">{s.companyName}</h3>
                  <p className="text-xs text-[var(--text-muted)]">{s.category} · {s.state}</p>
                </div>
                <StatusBadge status={s.status} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[var(--bg-elevated)] p-3 text-xs border border-[var(--border-subtle)]">
                <div>
                  <p className="text-[10px] uppercase text-[var(--text-muted)]">Payable Balance</p>
                  <p className="font-mono-num font-bold text-amber-400">{formatUSD(s.currentPayable)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-[var(--text-muted)]">On-Time Rate</p>
                  <p className="font-mono-num font-bold text-emerald-400">{s.onTimeDeliveryRate}% (★ {s.rating})</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-[var(--text-secondary)]">
                Terms: <strong>{s.paymentTerms}</strong> · {s.email}
              </p>
            </GlassCard>
          ))}
        </div>
      )}

      {tab === "payables" && (
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] uppercase border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Bill / PO #</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3 text-right">Bill Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Outstanding AP</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {state.purchaseOrders.map((po) => {
                  const due = po.total - po.amountPaid;
                  return (
                    <tr key={po.id} className="hover:bg-blue-500/5">
                      <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                        {state.suppliers.find((s) => s.id === po.supplierId)?.companyName}
                      </td>
                      <td className="px-4 py-3 font-mono-num text-blue-400">{po.poNo}</td>
                      <td className="px-4 py-3">{formatUSDate(po.dueDate)}</td>
                      <td className="px-4 py-3 text-right font-mono-num">{formatUSD(po.total)}</td>
                      <td className="px-4 py-3 text-right font-mono-num text-emerald-400">{formatUSD(po.amountPaid)}</td>
                      <td className="px-4 py-3 text-right font-mono-num font-bold text-amber-400">{formatUSD(due)}</td>
                      <td className="px-4 py-3 text-right">
                        {due > 0 ? (
                          <SecondaryButton
                            onClick={() => onRunAction("purchase:pay", { poId: po.id, amount: due })}
                            className="py-1 px-2.5 text-xs"
                          >
                            Settle ACH
                          </SecondaryButton>
                        ) : (
                          <StatusBadge status="Paid" />
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

      {/* New Supplier Modal */}
      <Modal open={supOpen} onClose={() => setSupOpen(false)} title="Add Enterprise Supplier / Vendor">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onRunAction("supplier:save", supForm);
            setSupOpen(false);
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required placeholder="Vendor Company Name *" value={supForm.companyName} onChange={(e) => setSupForm({ ...supForm, companyName: e.target.value })} className="erp-input" />
            <input required placeholder="Primary Contact Person *" value={supForm.contactPerson} onChange={(e) => setSupForm({ ...supForm, contactPerson: e.target.value })} className="erp-input" />
            <input placeholder="Email" value={supForm.email} onChange={(e) => setSupForm({ ...supForm, email: e.target.value })} className="erp-input" />
            <input placeholder="Phone" value={supForm.phone} onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })} className="erp-input" />
            <input placeholder="Category" value={supForm.category} onChange={(e) => setSupForm({ ...supForm, category: e.target.value })} className="erp-input" />
            <input placeholder="Payment Terms (e.g. Net 30)" value={supForm.paymentTerms} onChange={(e) => setSupForm({ ...supForm, paymentTerms: e.target.value })} className="erp-input" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setSupOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton type="submit">Save Supplier</PrimaryButton>
          </div>
        </form>
      </Modal>

      {/* New PO Modal */}
      <Modal open={poOpen} onClose={() => setPoOpen(false)} title="Create Purchase Order" subtitle="Automatically creates a pending approval workflow item for Manager/Finance review.">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onRunAction("purchase:create", poForm);
            setPoOpen(false);
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Supplier</label>
              <select value={poForm.supplierId} onChange={(e) => setPoForm({ ...poForm, supplierId: e.target.value })} className="erp-input mt-1">
                {state.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.companyName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Receiving Warehouse</label>
              <select value={poForm.warehouseId} onChange={(e) => setPoForm({ ...poForm, warehouseId: e.target.value })} className="erp-input mt-1">
                {state.warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Product</label>
              <select
                value={poForm.productId}
                onChange={(e) => {
                  const p = state.products.find((x) => x.id === e.target.value);
                  setPoForm({ ...poForm, productId: e.target.value, unitCost: p?.purchasePrice || poForm.unitCost });
                }}
                className="erp-input mt-1"
              >
                {state.products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)]">Qty</label>
                <input type="number" min={1} value={poForm.quantity} onChange={(e) => setPoForm({ ...poForm, quantity: Number(e.target.value) })} className="erp-input mt-1 font-mono-num" />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)]">Unit Cost ($)</label>
                <input type="number" step="0.01" value={poForm.unitCost} onChange={(e) => setPoForm({ ...poForm, unitCost: Number(e.target.value) })} className="erp-input mt-1 font-mono-num" />
              </div>
            </div>
          </div>
          <input placeholder="PO Notes" value={poForm.notes} onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })} className="erp-input" />
          <div className="flex justify-between items-center pt-2">
            <span className="text-sm font-bold font-mono-num text-blue-400">
              PO Total: {formatUSD(poForm.quantity * poForm.unitCost)}
            </span>
            <div className="flex gap-2">
              <SecondaryButton onClick={() => setPoOpen(false)}>Cancel</SecondaryButton>
              <PrimaryButton type="submit">Issue Purchase Order</PrimaryButton>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
