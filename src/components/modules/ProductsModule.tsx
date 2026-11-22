"use client";

import React, { useMemo, useState } from "react";
import {
  Package,
  Plus,
  Search,
  QrCode,
  Download,
  Edit3,
  Trash2,
  TrendingUp,
  Layers,
  Printer,
} from "lucide-react";
import type { Product } from "@/types/erp";
import type { ClientERPState } from "./ExecutiveDashboard";
import { exportToCSV, formatUSD, formatUSDate } from "@/lib/utils";
import {
  BarcodeSVG,
  GlassCard,
  Modal,
  PrimaryButton,
  QRCodeSVG,
  SecondaryButton,
  SectionHeader,
  StatusBadge,
} from "@/components/ui/Primitives";

export function ProductsModule({
  state,
  onRunAction,
}: {
  state: ClientERPState;
  onRunAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [selected, setSelected] = useState<Product | null>(null);
  const [detailTab, setDetailTab] = useState<"overview" | "codes" | "sales" | "purchases" | "stock">("overview");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Product> & { openingStock?: number }>({});

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(state.products.map((p) => p.category)))],
    [state.products]
  );

  const productMetrics = useMemo(() => {
    const map = new Map<
      string,
      { totalStock: number; unitsSold: number; revenue: number; profit: number; purchasedUnits: number }
    >();
    for (const p of state.products) {
      const totalStock = state.inventoryLots
        .filter((l) => l.productId === p.id)
        .reduce((s, l) => s + l.availableStock, 0);
      let unitsSold = 0;
      let revenue = 0;
      let profit = 0;
      for (const inv of state.invoices) {
        if (inv.status === "Cancelled" || inv.status === "Refunded") continue;
        for (const li of inv.items) {
          if (li.productId === p.id) {
            unitsSold += li.quantity;
            revenue += li.lineTotal;
            profit += li.lineTotal - li.costBasis * li.quantity;
          }
        }
      }
      let purchasedUnits = 0;
      for (const po of state.purchaseOrders) {
        for (const pi of po.items) {
          if (pi.productId === p.id) purchasedUnits += pi.quantity;
        }
      }
      map.set(p.id, { totalStock, unitsSold, revenue, profit, purchasedUnits });
    }
    return map;
  }, [state]);

  const filtered = state.products.filter((p) => {
    const matchCat = categoryFilter === "All" || p.category === categoryFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.barcode.includes(q) ||
      p.category.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const openNewProduct = () => {
    setEditing({
      name: "",
      sku: `SKU-NEW-${Math.floor(100 + Math.random() * 899)}`,
      category: "Signage & Sheets",
      uom: "Unit",
      purchasePrice: 20,
      sellingPrice: 40,
      wholesalePrice: 34,
      minSellingPrice: 29,
      taxable: true,
      status: "Active",
      minStockLevel: 80,
      maxStockLevel: 1000,
      reorderLevel: 120,
      openingStock: 150,
      description: "",
    });
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onRunAction("product:save", editing as Record<string, unknown>);
    setFormOpen(false);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        badge="Product Master · 7 Core Lines Pre-Configured"
        title="Product Management & Pricing Matrix"
        subtitle="Centralized SKU master featuring Acrylic, Backlight, CD, PC Bottle, PC Kohli, PVC Foam Board, and PC Jug with multi-tier pricing, live Barcodes/QR codes, variants, and profitability."
        actions={
          <>
            <SecondaryButton
              onClick={() =>
                exportToCSV(
                  "apexledger-products.csv",
                  state.products.map((p) => ({
                    SKU: p.sku,
                    Name: p.name,
                    Category: p.category,
                    UOM: p.uom,
                    PurchasePrice: p.purchasePrice,
                    SellingPrice: p.sellingPrice,
                    WholesalePrice: p.wholesalePrice,
                    MinPrice: p.minSellingPrice,
                    AvailableStock: productMetrics.get(p.id)?.totalStock || 0,
                    Status: p.status,
                  }))
                )
              }
            >
              <Download className="h-4 w-4" /> Export CSV
            </SecondaryButton>
            <PrimaryButton onClick={openNewProduct}>
              <Plus className="h-4 w-4" /> Add Product
            </PrimaryButton>
          </>
        }
      />

      {/* Filter Toolbar */}
      <GlassCard className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by product name, SKU, barcode, or category..."
              className="erp-input pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  categoryFilter === cat
                    ? "bg-[#111317] text-white"
                    : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[#111317]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* Product Cards + Table Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((product) => {
          const m = productMetrics.get(product.id) || {
            totalStock: 0,
            unitsSold: 0,
            revenue: 0,
            profit: 0,
            purchasedUnits: 0,
          };
          const marginPct =
            product.sellingPrice > 0
              ? (((product.sellingPrice - product.purchasePrice) / product.sellingPrice) * 100).toFixed(1)
              : "0";
          const isLow = m.totalStock <= product.reorderLevel;

          return (
            <GlassCard key={product.id} hover className="flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono-num text-[11px] font-bold text-[#1E3FAE]">
                      {product.sku}
                    </span>
                    <h3 className="text-lg font-bold text-[var(--text-primary)] mt-0.5">
                      {product.name}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)]">{product.category} · {product.uom}</p>
                  </div>
                  <StatusBadge status={product.status} />
                </div>

                <p className="mt-2.5 text-xs text-[var(--text-secondary)] line-clamp-2">
                  {product.description}
                </p>

                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[var(--bg-elevated)] p-2.5 border border-[var(--border-subtle)]">
                  <div>
                    <p className="text-[10px] uppercase text-[var(--text-muted)]">Cost</p>
                    <p className="font-mono-num text-xs font-bold text-[var(--text-primary)]">
                      {formatUSD(product.purchasePrice)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-[var(--text-muted)]">Selling</p>
                    <p className="font-mono-num text-xs font-bold text-[#05603F]">
                      {formatUSD(product.sellingPrice)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-[var(--text-muted)]">Wholesale</p>
                    <p className="font-mono-num text-xs font-bold text-[#1E3FAE]">
                      {formatUSD(product.wholesalePrice)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className={isLow ? "text-[#A11A1A] font-semibold" : "text-[var(--text-secondary)]"}>
                    Stock: <strong className="font-mono-num">{m.totalStock.toLocaleString()}</strong> {product.uom}s {isLow ? "(Low!)" : ""}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono-num text-[#05603F] font-semibold">
                    <TrendingUp className="h-3.5 w-3.5" /> {marginPct}% GM
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {product.variants.slice(0, 3).map((v) => (
                    <span
                      key={v.id}
                      className="rounded-md bg-[#E6EDFD] border border-[#C7D8FA] px-2 py-0.5 text-[10px] font-medium text-[#1E3FAE]"
                    >
                      {v.name}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    setSelected(product);
                    setDetailTab("overview");
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E3FAE] hover:text-[#1E3FAE] cursor-pointer"
                >
                  <QrCode className="h-3.5 w-3.5" /> 360° Details & Codes
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditing({ ...product });
                      setFormOpen(true);
                    }}
                    className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[#E6EDFD] hover:text-[#1E3FAE] cursor-pointer"
                    title="Edit Product"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remove ${product.name} (${product.sku})?`)) {
                        onRunAction("product:delete", { id: product.id });
                      }
                    }}
                    className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[#FCE8E8] hover:text-[#A11A1A] cursor-pointer"
                    title="Delete Product"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* Product 360° Detail Modal */}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.name} (${selected.sku})` : ""}
        subtitle={selected ? `${selected.category} · Barcode ${selected.barcode} · Min Selling Price ${formatUSD(selected.minSellingPrice)}` : ""}
        maxWidth="max-w-4xl"
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-1.5 border-b border-[var(--border-subtle)] pb-3">
              {(
                [
                  ["overview", "Overview & Pricing Tiers"],
                  ["codes", "Barcode & QR Labels"],
                  ["sales", "Sales & Profit History"],
                  ["purchases", "Purchase History"],
                  ["stock", "Stock Movement History"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setDetailTab(key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                    detailTab === key
                      ? "bg-[#111317] text-white"
                      : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {detailTab === "overview" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#1E3FAE]">
                    Specifications & Attributes
                  </h4>
                  <p className="text-xs text-[var(--text-secondary)]">{selected.description}</p>
                  <div className="divide-y divide-[var(--border-subtle)] text-xs">
                    {Object.entries(selected.specifications).map(([k, v]) => (
                      <div key={k} className="flex justify-between py-1.5">
                        <span className="text-[var(--text-muted)]">{k}</span>
                        <span className="font-semibold text-[var(--text-primary)]">{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selected.attributes.map((a) => (
                      <span key={a} className="rounded-full bg-[#E3F5EC] px-2.5 py-0.5 text-[11px] font-medium text-[#05603F]">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#05603F]">
                    Multi-Level Enterprise Pricing
                  </h4>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                        <th className="pb-1.5 text-left">Pricing Tier</th>
                        <th className="pb-1.5 text-right">Min Qty</th>
                        <th className="pb-1.5 text-right">Unit Price</th>
                        <th className="pb-1.5 text-right">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {selected.pricingLevels.map((pl) => {
                        const gm = (((pl.price - selected.purchasePrice) / pl.price) * 100).toFixed(1);
                        return (
                          <tr key={pl.tier}>
                            <td className="py-2 font-semibold text-[var(--text-primary)]">{pl.tier}</td>
                            <td className="py-2 text-right font-mono-num">{pl.minQty}+</td>
                            <td className="py-2 text-right font-mono-num font-bold text-[#05603F]">{formatUSD(pl.price)}</td>
                            <td className="py-2 text-right font-mono-num text-[#1E3FAE]">{gm}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {selected.variants.length > 0 && (
                    <div className="pt-2">
                      <h5 className="text-[11px] font-bold uppercase text-[var(--text-muted)] mb-1.5 flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5" /> Variants
                      </h5>
                      <div className="space-y-1.5">
                        {selected.variants.map((v) => (
                          <div key={v.id} className="flex justify-between text-xs rounded-lg bg-[#F6F5F1] border border-[#EEECE7] px-2.5 py-1.5">
                            <span>{v.name} ({selected.sku}{v.skuSuffix})</span>
                            <span className="font-mono-num text-[#1E3FAE]">
                              {formatUSD(selected.sellingPrice + v.priceDelta)} · {v.stock} avail
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {detailTab === "codes" && (
              <div className="flex flex-col sm:flex-row items-center justify-around gap-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
                <div className="text-center space-y-2">
                  <p className="text-xs font-bold uppercase text-[var(--text-secondary)]">EAN / Code-128 Barcode</p>
                  <BarcodeSVG value={selected.barcode} />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-xs font-bold uppercase text-[var(--text-secondary)]">Warehouse QR Label</p>
                  <QRCodeSVG value={selected.qrCode} />
                </div>
                <div className="space-y-2 text-center sm:text-left">
                  <p className="text-sm font-bold text-[var(--text-primary)]">{selected.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">Price: {formatUSD(selected.sellingPrice)} / {selected.uom}</p>
                  <SecondaryButton onClick={() => window.print()}>
                    <Printer className="h-4 w-4" /> Print Shelf / Zebra Label
                  </SecondaryButton>
                </div>
              </div>
            )}

            {detailTab === "sales" && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                      <th className="pb-2 text-left">Invoice</th>
                      <th className="pb-2 text-left">Date</th>
                      <th className="pb-2 text-left">Customer</th>
                      <th className="pb-2 text-right">Qty</th>
                      <th className="pb-2 text-right">Revenue</th>
                      <th className="pb-2 text-right">Gross Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {state.invoices
                      .flatMap((inv) =>
                        inv.items
                          .filter((li) => li.productId === selected.id)
                          .map((li) => ({ inv, li }))
                      )
                      .map(({ inv, li }, idx) => (
                        <tr key={idx}>
                          <td className="py-2 font-mono-num text-[#1E3FAE] font-semibold">{inv.invoiceNo}</td>
                          <td className="py-2">{formatUSDate(inv.issueDate)}</td>
                          <td className="py-2">{state.customers.find((c) => c.id === inv.customerId)?.companyName}</td>
                          <td className="py-2 text-right font-mono-num">{li.quantity}</td>
                          <td className="py-2 text-right font-mono-num font-bold">{formatUSD(li.lineTotal)}</td>
                          <td className="py-2 text-right font-mono-num text-[#05603F] font-bold">
                            {formatUSD(li.lineTotal - li.costBasis * li.quantity)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {detailTab === "purchases" && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                      <th className="pb-2 text-left">PO #</th>
                      <th className="pb-2 text-left">Date</th>
                      <th className="pb-2 text-left">Supplier</th>
                      <th className="pb-2 text-right">Qty</th>
                      <th className="pb-2 text-right">Unit Cost</th>
                      <th className="pb-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {state.purchaseOrders
                      .flatMap((po) =>
                        po.items
                          .filter((pi) => pi.productId === selected.id)
                          .map((pi) => ({ po, pi }))
                      )
                      .map(({ po, pi }, idx) => (
                        <tr key={idx}>
                          <td className="py-2 font-mono-num text-[#1E3FAE] font-semibold">{po.poNo}</td>
                          <td className="py-2">{formatUSDate(po.date)}</td>
                          <td className="py-2">{state.suppliers.find((s) => s.id === po.supplierId)?.companyName}</td>
                          <td className="py-2 text-right font-mono-num">{pi.quantity}</td>
                          <td className="py-2 text-right font-mono-num">{formatUSD(pi.unitCost)}</td>
                          <td className="py-2 text-right"><StatusBadge status={po.status} /></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {detailTab === "stock" && (
              <div className="space-y-2">
                {state.stockMovements
                  .filter((m) => m.productId === selected.id)
                  .map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-xs">
                      <div>
                        <p className="font-semibold text-[var(--text-primary)]">
                          {m.type} · Ref {m.referenceNo}
                        </p>
                        <p className="text-[var(--text-muted)]">{m.notes} · by {m.performedBy}</p>
                      </div>
                      <div className="text-right font-mono-num">
                        <p className="font-bold text-[#1E3FAE]">{m.previousQty} → {m.newQty}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">{formatUSDate(m.date)}</p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Add / Edit Product Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing.id ? `Edit Product — ${editing.name}` : "Create Enterprise Product"}
        subtitle="Configure SKU, multi-level pricing, taxability, and inventory reorder thresholds."
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Product Name *</label>
              <input
                required
                value={editing.name || ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="erp-input mt-1"
                placeholder="e.g. Acrylic, PC Bottle"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">SKU Code *</label>
              <input
                required
                value={editing.sku || ""}
                onChange={(e) => setEditing({ ...editing, sku: e.target.value })}
                className="erp-input mt-1 font-mono-num"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Category</label>
              <input
                value={editing.category || ""}
                onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                className="erp-input mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Unit of Measurement (UOM)</label>
              <input
                value={editing.uom || "Unit"}
                onChange={(e) => setEditing({ ...editing, uom: e.target.value })}
                className="erp-input mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Purchase Cost ($)</label>
              <input
                type="number"
                step="0.01"
                value={editing.purchasePrice ?? 0}
                onChange={(e) => setEditing({ ...editing, purchasePrice: Number(e.target.value) })}
                className="erp-input mt-1 font-mono-num"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Selling Price ($)</label>
              <input
                type="number"
                step="0.01"
                value={editing.sellingPrice ?? 0}
                onChange={(e) => setEditing({ ...editing, sellingPrice: Number(e.target.value) })}
                className="erp-input mt-1 font-mono-num"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Wholesale Price ($)</label>
              <input
                type="number"
                step="0.01"
                value={editing.wholesalePrice ?? 0}
                onChange={(e) => setEditing({ ...editing, wholesalePrice: Number(e.target.value) })}
                className="erp-input mt-1 font-mono-num"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Minimum Selling Price ($)</label>
              <input
                type="number"
                step="0.01"
                value={editing.minSellingPrice ?? 0}
                onChange={(e) => setEditing({ ...editing, minSellingPrice: Number(e.target.value) })}
                className="erp-input mt-1 font-mono-num"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Reorder Level</label>
              <input
                type="number"
                value={editing.reorderLevel ?? 100}
                onChange={(e) => setEditing({ ...editing, reorderLevel: Number(e.target.value) })}
                className="erp-input mt-1 font-mono-num"
              />
            </div>
            {!editing.id ? (
              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)]">Opening Stock</label>
                <input
                  type="number"
                  value={editing.openingStock ?? 100}
                  onChange={(e) => setEditing({ ...editing, openingStock: Number(e.target.value) })}
                  className="erp-input mt-1 font-mono-num"
                />
              </div>
            ) : (
              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)]">Status</label>
                <select
                  value={editing.status || "Active"}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value as "Active" | "Inactive" })}
                  className="erp-input mt-1"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)]">Product Description</label>
            <textarea
              rows={2}
              value={editing.description || ""}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              className="erp-input mt-1"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={editing.taxable !== false}
              onChange={(e) => setEditing({ ...editing, taxable: e.target.checked })}
              className="accent-blue-500"
            />
            Subject to US State Sales Tax
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setFormOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton type="submit">
              <Package className="h-4 w-4" /> Save Product
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
