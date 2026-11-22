"use client";

import React, { useMemo, useState } from "react";
import {
  Warehouse,
  ArrowLeftRight,
  Sliders,
  AlertTriangle,
  Boxes,
  Clock,
  Download,
  History,
} from "lucide-react";
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

export function InventoryModule({
  state,
  onRunAction,
}: {
  state: ClientERPState;
  onRunAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [tab, setTab] = useState<"stock" | "batches" | "aging" | "movements">("stock");
  const [whFilter, setWhFilter] = useState("ALL");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const [adjForm, setAdjForm] = useState({
    productId: state.products[0]?.id || "",
    warehouseId: state.warehouses[0]?.id || "",
    type: "Stock In",
    quantity: 50,
    notes: "",
  });

  const [trfForm, setTrfForm] = useState({
    productId: state.products[0]?.id || "",
    fromWarehouseId: state.warehouses[0]?.id || "",
    toWarehouseId: state.warehouses[1]?.id || state.warehouses[0]?.id || "",
    quantity: 25,
    notes: "Inter-branch replenishment",
  });

  const summary = useMemo(() => {
    const lots =
      whFilter === "ALL"
        ? state.inventoryLots
        : state.inventoryLots.filter((l) => l.warehouseId === whFilter);

    const totalAvail = lots.reduce((s, l) => s + l.availableStock, 0);
    const totalReserved = lots.reduce((s, l) => s + l.reservedStock, 0);
    const totalDamaged = lots.reduce((s, l) => s + l.damagedStock, 0);
    const totalValuation = lots.reduce((s, l) => s + l.availableStock * l.unitCost, 0);

    const lowStockCount = state.products.filter((p) => {
      const qty = state.inventoryLots
        .filter((l) => l.productId === p.id)
        .reduce((s, l) => s + l.availableStock, 0);
      return qty <= p.reorderLevel;
    }).length;

    return { lots, totalAvail, totalReserved, totalDamaged, totalValuation, lowStockCount };
  }, [state, whFilter]);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    await onRunAction("inventory:adjust", adjForm);
    setAdjustOpen(false);
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    await onRunAction("inventory:transfer", trfForm);
    setTransferOpen(false);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        badge="Multi-Warehouse Real-Time Inventory"
        title="Inventory, Warehousing & Lot Control"
        subtitle="Track opening, available, reserved, damaged, and returned stock across US fulfillment centers with batch/lot/serial audit trails and aging valuation."
        actions={
          <>
            <SecondaryButton
              onClick={() =>
                exportToCSV(
                  "apexledger-inventory-valuation.csv",
                  summary.lots.map((l) => {
                    const p = state.products.find((x) => x.id === l.productId);
                    const w = state.warehouses.find((x) => x.id === l.warehouseId);
                    return {
                      SKU: p?.sku,
                      Product: p?.name,
                      Warehouse: w?.name,
                      Batch: l.batchNo,
                      Lot: l.lotNo,
                      Available: l.availableStock,
                      Reserved: l.reservedStock,
                      Damaged: l.damagedStock,
                      UnitCost: l.unitCost,
                      ValuationUSD: l.availableStock * l.unitCost,
                    };
                  })
                )
              }
            >
              <Download className="h-4 w-4" /> Export Valuation
            </SecondaryButton>
            <SecondaryButton onClick={() => setTransferOpen(true)}>
              <ArrowLeftRight className="h-4 w-4" /> Stock Transfer
            </SecondaryButton>
            <PrimaryButton onClick={() => setAdjustOpen(true)}>
              <Sliders className="h-4 w-4" /> Stock In / Out / Audit
            </PrimaryButton>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Total Stock Valuation"
          value={formatUSD(summary.totalValuation)}
          sublabel={`${state.warehouses.length} active US warehouses`}
          icon={<Warehouse className="h-5 w-5" />}
          tone="blue"
        />
        <KpiTile
          label="Available Units"
          value={summary.totalAvail.toLocaleString()}
          sublabel={`Reserved: ${summary.totalReserved.toLocaleString()} units`}
          icon={<Boxes className="h-5 w-5" />}
          tone="emerald"
        />
        <KpiTile
          label="Low-Stock Alerts"
          value={String(summary.lowStockCount)}
          delta={summary.lowStockCount > 0 ? "Reorder Needed" : "Healthy"}
          positive={summary.lowStockCount === 0}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="rose"
        />
        <KpiTile
          label="Damaged / Quarantined"
          value={String(summary.totalDamaged)}
          sublabel="Tracked across physical audits"
          icon={<Clock className="h-5 w-5" />}
          tone="amber"
        />
      </div>

      {/* Tabs + Warehouse Filter */}
      <GlassCard className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["stock", "Stock Levels & Valuation"],
              ["batches", "Batch / Lot / Serial Tracking"],
              ["aging", "Inventory Aging Analysis"],
              ["movements", "Movement Audit Trail"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
                tab === k
                  ? "bg-[#111317] text-white"
                  : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[#111317]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          value={whFilter}
          onChange={(e) => setWhFilter(e.target.value)}
          className="erp-input max-w-xs"
        >
          <option value="ALL">All Warehouses ({state.warehouses.length})</option>
          {state.warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code} — {w.name}
            </option>
          ))}
        </select>
      </GlassCard>

      {tab === "stock" && (
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] uppercase border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="px-4 py-3">Product / SKU</th>
                  <th className="px-4 py-3">Warehouse</th>
                  <th className="px-4 py-3 text-right">Available</th>
                  <th className="px-4 py-3 text-right">Reserved</th>
                  <th className="px-4 py-3 text-right">Damaged</th>
                  <th className="px-4 py-3 text-right">Returned</th>
                  <th className="px-4 py-3 text-right">Reorder Pt</th>
                  <th className="px-4 py-3 text-right">Valuation</th>
                  <th className="px-4 py-3 text-right">Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {summary.lots.map((lot) => {
                  const prod = state.products.find((p) => p.id === lot.productId);
                  const wh = state.warehouses.find((w) => w.id === lot.warehouseId);
                  const low = prod ? lot.availableStock < prod.reorderLevel / 2 : false;
                  return (
                    <tr key={lot.id} className="hover:bg-[#F8F7F3]">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[var(--text-primary)]">{prod?.name}</p>
                        <p className="font-mono-num text-[11px] text-[#1E3FAE]">{prod?.sku}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--text-primary)]">{wh?.code}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">{wh?.location}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num font-bold text-[#05603F]">
                        {lot.availableStock.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num text-[#1E3FAE]">
                        {lot.reservedStock}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num text-[#A11A1A]">
                        {lot.damagedStock}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num text-[#7F4505]">
                        {lot.returnedStock}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num text-[var(--text-secondary)]">
                        {prod?.reorderLevel}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num font-bold text-[var(--text-primary)]">
                        {formatUSD(lot.availableStock * lot.unitCost)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <StatusBadge status={low ? "Critical Low" : "Active"} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {tab === "batches" && (
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] uppercase border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Batch #</th>
                  <th className="px-4 py-3">Lot #</th>
                  <th className="px-4 py-3">Serial Range</th>
                  <th className="px-4 py-3">Warehouse</th>
                  <th className="px-4 py-3">Received Date</th>
                  <th className="px-4 py-3 text-right">Opening → Current</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {summary.lots.map((lot) => {
                  const prod = state.products.find((p) => p.id === lot.productId);
                  const wh = state.warehouses.find((w) => w.id === lot.warehouseId);
                  return (
                    <tr key={lot.id} className="hover:bg-[#F8F7F3]">
                      <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">{prod?.name}</td>
                      <td className="px-4 py-3 font-mono-num text-[#1E3FAE]">{lot.batchNo}</td>
                      <td className="px-4 py-3 font-mono-num">{lot.lotNo}</td>
                      <td className="px-4 py-3 font-mono-num text-[var(--text-secondary)]">
                        {lot.serialPrefix}0001 — {lot.serialPrefix}{String(lot.openingStock).padStart(4, "0")}
                      </td>
                      <td className="px-4 py-3">{wh?.name}</td>
                      <td className="px-4 py-3">{formatUSDate(lot.receivedDate)}</td>
                      <td className="px-4 py-3 text-right font-mono-num font-bold">
                        {lot.openingStock} → <span className="text-[#05603F]">{lot.availableStock}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {tab === "aging" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[
            { label: "0–30 Days (Fresh)", min: 0, max: 30, tone: "border-emerald-500/30 bg-emerald-500/10 text-[#05603F]" },
            { label: "31–60 Days (Active)", min: 31, max: 60, tone: "border-blue-500/30 bg-[#E6EDFD] text-[#1E3FAE]" },
            { label: "61–90 Days (Slow)", min: 61, max: 90, tone: "border-[#F3D7AA] bg-[#FDF0DC] text-[#7F4505]" },
            { label: "90+ Days (Aging Risk)", min: 91, max: 9999, tone: "border-rose-500/30 bg-rose-500/10 text-[#A11A1A]" },
          ].map((bucket) => {
            const todayStr = new Date().toISOString().slice(0, 10);
            const items = summary.lots.filter((l) => {
              const d = daysBetween(l.receivedDate, todayStr);
              return d >= bucket.min && d <= bucket.max;
            });
            const value = items.reduce((s, l) => s + l.availableStock * l.unitCost, 0);
            return (
              <GlassCard key={bucket.label} className={`border ${bucket.tone.split(" ")[0]}`}>
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  {bucket.label}
                </p>
                <p className="mt-2 text-2xl font-bold font-mono-num text-[var(--text-primary)]">
                  {formatUSD(value)}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {items.length} lots · {items.reduce((s, l) => s + l.availableStock, 0).toLocaleString()} units
                </p>
              </GlassCard>
            );
          })}
        </div>
      )}

      {tab === "movements" && (
        <GlassCard className="p-0 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-subtle)]">
            <History className="h-4 w-4 text-[#1E3FAE]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Immutable Stock Movement Audit Trail
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] uppercase border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Product</th>
                  <th className="px-4 py-2.5">Warehouse</th>
                  <th className="px-4 py-2.5 text-right">Qty</th>
                  <th className="px-4 py-2.5 text-right">Before → After</th>
                  <th className="px-4 py-2.5">Reference & Notes</th>
                  <th className="px-4 py-2.5">Actor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {state.stockMovements.map((m) => (
                  <tr key={m.id} className="hover:bg-[#F8F7F3]">
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatUSDate(m.date)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={m.type} /></td>
                    <td className="px-4 py-2.5 font-semibold text-[var(--text-primary)]">
                      {state.products.find((p) => p.id === m.productId)?.name}
                    </td>
                    <td className="px-4 py-2.5">
                      {state.warehouses.find((w) => w.id === m.warehouseId)?.code}
                      {m.toWarehouseId
                        ? ` → ${state.warehouses.find((w) => w.id === m.toWarehouseId)?.code}`
                        : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono-num font-bold">{m.quantity}</td>
                    <td className="px-4 py-2.5 text-right font-mono-num text-[#1E3FAE]">
                      {m.previousQty} → {m.newQty}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono-num text-[#1E3FAE]">{m.referenceNo}</span> · {m.notes}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{m.performedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Stock Adjustment / Audit Modal */}
      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Stock In / Out / Physical Adjustment / Audit"
        subtitle="Automatically updates warehouse lot balances and appends an immutable stock audit entry."
      >
        <form onSubmit={handleAdjust} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Product</label>
              <select
                value={adjForm.productId}
                onChange={(e) => setAdjForm({ ...adjForm, productId: e.target.value })}
                className="erp-input mt-1"
              >
                {state.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Warehouse</label>
              <select
                value={adjForm.warehouseId}
                onChange={(e) => setAdjForm({ ...adjForm, warehouseId: e.target.value })}
                className="erp-input mt-1"
              >
                {state.warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Movement Type</label>
              <select
                value={adjForm.type}
                onChange={(e) => setAdjForm({ ...adjForm, type: e.target.value })}
                className="erp-input mt-1"
              >
                <option value="Stock In">Stock In</option>
                <option value="Stock Out">Stock Out</option>
                <option value="Adjustment">Physical Adjustment (+/-)</option>
                <option value="Damaged">Mark Damaged Stock</option>
                <option value="Returned">Customer Returned Stock</option>
                <option value="Audit">Cycle Count Audit (+/-)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Quantity</label>
              <input
                type="number"
                required
                value={adjForm.quantity}
                onChange={(e) => setAdjForm({ ...adjForm, quantity: Number(e.target.value) })}
                className="erp-input mt-1 font-mono-num"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)]">Audit Reason / Notes</label>
            <input
              required
              value={adjForm.notes}
              onChange={(e) => setAdjForm({ ...adjForm, notes: e.target.value })}
              placeholder="e.g. Container arrival, cycle count variance..."
              className="erp-input mt-1"
            />
          </div>
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setAdjustOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton type="submit">Commit Stock Movement</PrimaryButton>
          </div>
        </form>
      </Modal>

      {/* Stock Transfer Modal */}
      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Inter-Warehouse Stock Transfer"
        subtitle="Move inventory cleanly between US distribution depots with full lot traceability."
      >
        <form onSubmit={handleTransfer} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)]">Product</label>
            <select
              value={trfForm.productId}
              onChange={(e) => setTrfForm({ ...trfForm, productId: e.target.value })}
              className="erp-input mt-1"
            >
              {state.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">From Warehouse</label>
              <select
                value={trfForm.fromWarehouseId}
                onChange={(e) => setTrfForm({ ...trfForm, fromWarehouseId: e.target.value })}
                className="erp-input mt-1"
              >
                {state.warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">To Warehouse</label>
              <select
                value={trfForm.toWarehouseId}
                onChange={(e) => setTrfForm({ ...trfForm, toWarehouseId: e.target.value })}
                className="erp-input mt-1"
              >
                {state.warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Quantity to Transfer</label>
              <input
                type="number"
                min={1}
                required
                value={trfForm.quantity}
                onChange={(e) => setTrfForm({ ...trfForm, quantity: Number(e.target.value) })}
                className="erp-input mt-1 font-mono-num"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Transfer Notes</label>
              <input
                value={trfForm.notes}
                onChange={(e) => setTrfForm({ ...trfForm, notes: e.target.value })}
                className="erp-input mt-1"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setTransferOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton type="submit">Execute Transfer</PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
