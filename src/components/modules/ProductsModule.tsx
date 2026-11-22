"use client";

import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package,
  Plus,
  Search,
  Download,
  Edit3,
  Trash2,
  LayoutGrid,
  List,
  ChevronRight,
  Printer,
  X,
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

function getProductArtwork(name: string) {
  const n = name.toLowerCase();
  if (n.includes("backlight")) {
    return { shape: "roll" as const, bg: "#FDF0DC", c1: "#E8711C", c2: "#F7BE8A" };
  }
  if (n.includes("bottle") || n.includes("jug") || n.includes("kohli")) {
    return {
      shape: "bottle" as const,
      bg: n.includes("jug") ? "#E3F5EC" : n.includes("kohli") ? "#EEF6DA" : "#E6EDFD",
      c1: n.includes("jug") ? "#05603F" : n.includes("kohli") ? "#5C6B2E" : "#1E3FAE",
      c2: n.includes("jug") ? "#6EE7B7" : n.includes("kohli") ? "#C5F04A" : "#93C5FD",
    };
  }
  return {
    shape: "sheet" as const,
    bg: n.includes("pvc") ? "#EEECE7" : n.includes("cd") ? "#E6EDFD" : "#F3F8E6",
    c1: n.includes("pvc") ? "#16181D" : n.includes("cd") ? "#1E3FAE" : "#9BCB2E",
    c2: n.includes("pvc") ? "#94A3B8" : n.includes("cd") ? "#93C5FD" : "#C5F04A",
  };
}

export function ProductsModule({
  state,
  onRunAction,
}: {
  state: ClientERPState;
  onRunAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"general" | "pricing" | "variants" | "history">("general");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Product> & { openingStock?: number }>({});

  const selected = state.products.find((p) => p.id === selectedId) || null;

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(state.products.map((p) => p.category)))],
    [state.products]
  );

  const productMetrics = useMemo(() => {
    const map = new Map<string, { totalStock: number; unitsSold: number; revenue: number; profit: number }>();
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
      map.set(p.id, { totalStock, unitsSold, revenue, profit });
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
      sku: `SKU-${Math.floor(100 + Math.random() * 899)}`,
      category: "Signage & Sheets",
      uom: "Unit",
      purchasePrice: 20,
      sellingPrice: 40,
      wholesalePrice: 34,
      minSellingPrice: 29,
      taxable: true,
      status: "Active",
      minStockLevel: 50,
      maxStockLevel: 1000,
      reorderLevel: 100,
      openingStock: 0,
      description: "",
    });
    setFormOpen(true);
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Products"
        subtitle="Centralized product master (Acrylic, Backlight, CD, PC Bottle, PC Kohli, PVC Foam Board, PC Jug) with pricing levels, variants, barcodes, and profitability."
        actions={
          <>
            <SecondaryButton
              onClick={() =>
                exportToCSV(
                  "nexora-products.csv",
                  state.products.map((p) => ({
                    SKU: p.sku,
                    Name: p.name,
                    Category: p.category,
                    UOM: p.uom,
                    Purchase: p.purchasePrice,
                    Selling: p.sellingPrice,
                    Wholesale: p.wholesalePrice,
                    Minimum: p.minSellingPrice,
                    Stock: productMetrics.get(p.id)?.totalStock || 0,
                    Status: p.status,
                  }))
                )
              }
            >
              <Download className="h-4 w-4" /> Export
            </SecondaryButton>
            <PrimaryButton onClick={openNewProduct}>
              <Plus className="h-4 w-4" /> Add product
            </PrimaryButton>
          </>
        }
      />

      {/* Nexora Search + Category Chips + Grid/List Switcher */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 basis-[240px] max-w-[340px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5F636C]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU, barcode"
            className="erp-input pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 flex-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`min-h-[34px] px-3 rounded-[8px] border text-[12.5px] font-semibold cursor-pointer transition-colors ${
                categoryFilter === cat
                  ? "bg-[#111317] border-[#111317] text-white"
                  : "bg-white border-[#E0DDD5] text-[#4A4E57] hover:border-[#B9C0CC]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="inline-flex gap-1 p-[3px] rounded-[10px] bg-[#E9E6DF]">
          <button
            onClick={() => setViewMode("grid")}
            aria-label="Grid view"
            className={`w-9 h-8 rounded-[8px] flex items-center justify-center cursor-pointer ${
              viewMode === "grid" ? "bg-white text-[#111317] shadow-sm" : "text-[#5F636C]"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            aria-label="Table view"
            className={`w-9 h-8 rounded-[8px] flex items-center justify-center cursor-pointer ${
              viewMode === "list" ? "bg-white text-[#111317] shadow-sm" : "text-[#5F636C]"
            }`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* GRID VIEW — Exact Nexora Geometric Product Cards */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((p) => {
            const m = productMetrics.get(p.id) || { totalStock: 0, unitsSold: 0, revenue: 0, profit: 0 };
            const art = getProductArtwork(p.name);
            const marginPct =
              p.sellingPrice > 0
                ? (((p.sellingPrice - p.purchasePrice) / p.sellingPrice) * 100).toFixed(0)
                : "0";
            const low = m.totalStock <= p.reorderLevel;

            return (
              <div key={p.id} className="nexora-card nexora-card-hover overflow-hidden flex flex-col">
                <button
                  onClick={() => {
                    setSelectedId(p.id);
                    setDetailTab("general");
                  }}
                  className="h-[155px] w-full border-0 flex items-center justify-center cursor-pointer relative"
                  style={{ backgroundColor: art.bg }}
                >
                  {art.shape === "sheet" && (
                    <div className="relative w-[116px] h-[80px]">
                      <div className="absolute inset-0 rounded-[8px] -rotate-6 -translate-x-2.5 translate-y-2" style={{ backgroundColor: art.c2 }} />
                      <div className="absolute inset-0 rounded-[8px] -rotate-2 shadow-lg" style={{ backgroundColor: art.c1 }} />
                      <div className="absolute left-3.5 top-3 w-9 h-1.5 rounded bg-white/60 -rotate-2" />
                    </div>
                  )}
                  {art.shape === "roll" && (
                    <div className="relative w-[124px] h-[78px]">
                      <div className="absolute left-0 top-2.5 w-[94px] h-[58px] rounded-[10px]" style={{ backgroundColor: art.c2 }} />
                      <div className="absolute right-0 top-0 w-[78px] h-[78px] rounded-full shadow-lg" style={{ backgroundColor: art.c1 }} />
                      <div className="absolute right-[25px] top-[25px] w-[28px] h-[28px] rounded-full bg-white/85" />
                    </div>
                  )}
                  {art.shape === "bottle" && (
                    <div className="relative w-[68px] h-[96px]">
                      <div className="absolute left-[23px] top-0 w-[22px] h-[14px] rounded-[4px]" style={{ backgroundColor: art.c2 }} />
                      <div className="absolute left-0 top-3 w-[68px] h-[84px] rounded-t-[20px] rounded-b-[12px] shadow-lg" style={{ backgroundColor: art.c1 }} />
                      <div className="absolute left-3 top-7 w-2 h-11 rounded bg-white/55" />
                    </div>
                  )}
                  <span className={`absolute top-3 left-3 rounded-[6px] px-2 py-0.5 text-[11px] font-semibold num ${low ? "bg-[#FCE8E8] text-[#A11A1A]" : "bg-[#E3F5EC] text-[#05603F]"}`}>
                    {m.totalStock} in stock
                  </span>
                  <span className="absolute top-3 right-3 rounded-[6px] px-2 py-0.5 text-[11px] font-semibold bg-white/85 text-[#4A4E57]">
                    {p.pricingLevels.length} tiers
                  </span>
                </button>

                <div className="p-4 flex flex-col gap-2.5 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-[15px] text-[#111317] truncate">{p.name}</div>
                      <div className="text-[12px] text-[#5F636C] num mt-0.5">{p.sku} · {p.uom}</div>
                    </div>
                    <span className="rounded-[6px] bg-[#EEF6DA] text-[#3D5A0A] px-2 py-0.5 text-[11px] font-semibold shrink-0">
                      {p.category.split(" ")[0]}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="h num text-[22px] font-bold text-[#111317]">{formatUSD(p.sellingPrice)}</span>
                    <span className="text-[12px] text-[#5F636C]">wholesale {formatUSD(p.wholesalePrice)}</span>
                    <span className="ml-auto text-[12px] font-bold text-[#05603F]">{marginPct}% GM</span>
                  </div>

                  <div className="mt-auto pt-3 border-t border-[#EEECE7] flex items-center gap-2">
                    <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[#111317] flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        className="nexora-toggle"
                        checked={p.status === "Active"}
                        onChange={(e) =>
                          onRunAction("product:save", {
                            id: p.id,
                            status: e.target.checked ? "Active" : "Inactive",
                          })
                        }
                      />
                      {p.status}
                    </label>
                    <SecondaryButton
                      className="min-h-[30px] text-[12px] px-2.5"
                      onClick={() => {
                        setSelectedId(p.id);
                        setDetailTab("general");
                      }}
                    >
                      Details <ChevronRight className="h-3.5 w-3.5" />
                    </SecondaryButton>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === "list" && (
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead className="bg-[#F8F7F3] text-[#6B6F78] uppercase text-[11px] border-b border-[#E6E3DC]">
                <tr>
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3">SKU</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3 text-right">Purchase</th>
                  <th className="px-5 py-3 text-right">Selling</th>
                  <th className="px-5 py-3 text-right">Wholesale</th>
                  <th className="px-5 py-3 text-right">Minimum</th>
                  <th className="px-5 py-3 text-right">Stock</th>
                  <th className="px-5 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEECE7]">
                {filtered.map((p) => {
                  const m = productMetrics.get(p.id) || { totalStock: 0 };
                  return (
                    <tr key={p.id} className="hover:bg-[#F8F7F3]">
                      <td className="px-5 py-3">
                        <button
                          onClick={() => setSelectedId(p.id)}
                          className="font-bold text-[#111317] hover:underline cursor-pointer"
                        >
                          {p.name}
                        </button>
                      </td>
                      <td className="px-5 py-3 num text-[#5F636C]">{p.sku}</td>
                      <td className="px-5 py-3">{p.category}</td>
                      <td className="px-5 py-3 text-right num">{formatUSD(p.purchasePrice)}</td>
                      <td className="px-5 py-3 text-right num font-bold">{formatUSD(p.sellingPrice)}</td>
                      <td className="px-5 py-3 text-right num">{formatUSD(p.wholesalePrice)}</td>
                      <td className="px-5 py-3 text-right num">{formatUSD(p.minSellingPrice)}</td>
                      <td className="px-5 py-3 text-right num font-semibold">{m.totalStock}</td>
                      <td className="px-5 py-3 text-right"><StatusBadge status={p.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Exact Nexora Right Slide-Over Product Details Drawer (640px) */}
      <AnimatePresence>
        {selected && (
          <div className="fixed inset-0 z-50 no-print">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedId(null)}
              className="fixed inset-0 bg-[#111317]/40 backdrop-blur-[3px]"
            />
            <motion.aside
              initial={{ x: 640 }}
              animate={{ x: 0 }}
              exit={{ x: 640 }}
              transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-[640px] bg-white z-60 shadow-[-24px_0_60px_-24px_rgba(17,19,23,0.4)] flex flex-col overflow-y-auto"
            >
              {(() => {
                const art = getProductArtwork(selected.name);
                return (
                  <>
                    <div className="p-6 border-b border-[#EEECE7] flex items-center gap-4">
                      <span
                        className="w-14 h-14 rounded-[14px] flex items-center justify-center shrink-0"
                        style={{ backgroundColor: art.bg }}
                      >
                        <span className="w-7 h-7 rounded-[7px]" style={{ backgroundColor: art.c1 }} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <h2 className="h text-[20px] font-bold text-[#111317] truncate">{selected.name}</h2>
                        <p className="text-[13px] text-[#5F636C] num">
                          {selected.sku} · {selected.category} · {selected.uom}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setEditing({ ...selected });
                          setFormOpen(true);
                        }}
                        className="p-2 rounded-[9px] border border-[#E0DDD5] hover:bg-[#F1EFEA] cursor-pointer"
                        title="Edit product"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${selected.name}?`)) {
                            onRunAction("product:delete", { id: selected.id });
                            setSelectedId(null);
                          }
                        }}
                        className="p-2 rounded-[9px] border border-[#E0DDD5] text-[#A11A1A] hover:bg-[#FCE8E8] cursor-pointer"
                        title="Delete product"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setSelectedId(null)}
                        className="p-2 rounded-[9px] border border-[#E0DDD5] hover:bg-[#F1EFEA] cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="px-6 pt-4">
                      <div className="inline-flex gap-1 p-[3px] rounded-[10px] bg-[#E9E6DF]">
                        {(
                          [
                            ["general", "General & Codes"],
                            ["pricing", "Pricing Levels"],
                            ["variants", "Specs & Attrs"],
                            ["history", "Sales & Stock"],
                          ] as const
                        ).map(([k, label]) => (
                          <button
                            key={k}
                            onClick={() => setDetailTab(k)}
                            className={`min-h-[32px] px-3 rounded-[8px] text-[12.5px] font-semibold cursor-pointer ${
                              detailTab === k ? "bg-white text-[#111317] shadow-sm" : "text-[#5F636C]"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-6 space-y-5">
                      {detailTab === "general" && (
                        <>
                          <p className="text-[14px] text-[#334155] leading-relaxed">{selected.description}</p>
                          <div className="grid grid-cols-2 gap-2.5">
                            {Object.entries(selected.specifications).map(([k, v]) => (
                              <div key={k} className="p-3 rounded-[10px] bg-[#F6F5F1] text-[13px]">
                                <span className="text-[#5F636C]">{k}</span>
                                <div className="font-bold text-[#111317] mt-0.5">{v}</div>
                              </div>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-4 items-center p-4 rounded-[12px] border border-[#EEECE7]">
                            <div>
                              <div className="text-[11px] font-bold uppercase text-[#5F636C] mb-1.5">Barcode · Code 128</div>
                              <BarcodeSVG value={selected.barcode} />
                            </div>
                            <div>
                              <div className="text-[11px] font-bold uppercase text-[#5F636C] mb-1.5">QR Code</div>
                              <QRCodeSVG value={selected.qrCode} />
                            </div>
                            <SecondaryButton onClick={() => window.print()} className="ml-auto">
                              <Printer className="h-4 w-4" /> Print Label
                            </SecondaryButton>
                          </div>
                        </>
                      )}

                      {detailTab === "pricing" && (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { l: "Purchase Cost", v: formatUSD(selected.purchasePrice), bg: "#F6F5F1" },
                              { l: "Standard Selling", v: formatUSD(selected.sellingPrice), bg: "#EEF6DA" },
                              { l: "Wholesale Price", v: formatUSD(selected.wholesalePrice), bg: "#E6EDFD" },
                              { l: "Minimum Selling", v: formatUSD(selected.minSellingPrice), bg: "#FDF0DC" },
                            ].map((box) => (
                              <div key={box.l} className="p-4 rounded-[12px]" style={{ backgroundColor: box.bg }}>
                                <div className="text-[12px] font-semibold text-[#4A4E57]">{box.l}</div>
                                <div className="h num text-[22px] font-bold text-[#111317] mt-1">{box.v}</div>
                              </div>
                            ))}
                          </div>
                          <div>
                            <div className="text-[12px] font-bold uppercase text-[#4A4E57] mb-2">Multiple Pricing Levels</div>
                            {selected.pricingLevels.map((pl) => (
                              <div key={pl.tier} className="flex py-2.5 border-b border-[#EEECE7] text-[13.5px]">
                                <span className="flex-1 font-semibold">{pl.tier}</span>
                                <span className="text-[#5F636C] w-28 num">{pl.minQty}+ {selected.uom}s</span>
                                <span className="num font-bold w-24 text-right">{formatUSD(pl.price)}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {detailTab === "variants" && (
                        <div className="space-y-4">
                          <div className="flex flex-wrap gap-2">
                            {selected.attributes.map((a) => (
                              <span key={a} className="rounded-[6px] bg-[#EEF6DA] text-[#3D5A0A] px-2.5 py-1 text-[12px] font-semibold">
                                {a}
                              </span>
                            ))}
                          </div>
                          <div className="p-4 rounded-[12px] bg-[#F6F5F1] text-[13px] space-y-1">
                            <div>Min Stock Level: <b className="num">{selected.minStockLevel}</b></div>
                            <div>Reorder Point: <b className="num">{selected.reorderLevel}</b></div>
                            <div>Max Stock Level: <b className="num">{selected.maxStockLevel}</b></div>
                          </div>
                        </div>
                      )}

                      {detailTab === "history" && (
                        <div className="space-y-3">
                          {state.stockMovements.filter((m) => m.productId === selected.id).length === 0 ? (
                            <p className="text-[13px] text-[#5F636C] py-6 text-center">No stock movements recorded yet.</p>
                          ) : (
                            state.stockMovements
                              .filter((m) => m.productId === selected.id)
                              .slice(0, 12)
                              .map((m) => (
                                <div key={m.id} className="flex items-center justify-between p-3 rounded-[10px] bg-[#F6F5F1] text-[13px]">
                                  <div>
                                    <p className="font-semibold text-[#111317]">{m.type} · {m.referenceNo}</p>
                                    <p className="text-[12px] text-[#5F636C]">{m.notes}</p>
                                  </div>
                                  <div className="text-right num">
                                    <p className="font-bold">{m.previousQty} → {m.newQty}</p>
                                    <p className="text-[11px] text-[#5F636C]">{formatUSDate(m.date)}</p>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Add / Edit Product Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing.id ? `Edit ${editing.name}` : "Add product"}
        subtitle="Configure SKU, multi-tier US pricing, taxability, and reorder thresholds."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onRunAction("product:save", editing as Record<string, unknown>);
            setFormOpen(false);
          }}
          className="space-y-3.5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1">Product name *</label>
              <input required value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="erp-input" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1">SKU *</label>
              <input required value={editing.sku || ""} onChange={(e) => setEditing({ ...editing, sku: e.target.value })} className="erp-input num" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1">Category</label>
              <input value={editing.category || ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="erp-input" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1">UOM</label>
              <input value={editing.uom || "Unit"} onChange={(e) => setEditing({ ...editing, uom: e.target.value })} className="erp-input" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1">Purchase price ($)</label>
              <input type="number" step="0.01" value={editing.purchasePrice ?? 0} onChange={(e) => setEditing({ ...editing, purchasePrice: Number(e.target.value) })} className="erp-input num" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1">Selling price ($)</label>
              <input type="number" step="0.01" value={editing.sellingPrice ?? 0} onChange={(e) => setEditing({ ...editing, sellingPrice: Number(e.target.value) })} className="erp-input num" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1">Wholesale price ($)</label>
              <input type="number" step="0.01" value={editing.wholesalePrice ?? 0} onChange={(e) => setEditing({ ...editing, wholesalePrice: Number(e.target.value) })} className="erp-input num" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1">Minimum selling price ($)</label>
              <input type="number" step="0.01" value={editing.minSellingPrice ?? 0} onChange={(e) => setEditing({ ...editing, minSellingPrice: Number(e.target.value) })} className="erp-input num" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1">Reorder level</label>
              <input type="number" value={editing.reorderLevel ?? 100} onChange={(e) => setEditing({ ...editing, reorderLevel: Number(e.target.value) })} className="erp-input num" />
            </div>
            {!editing.id && (
              <div>
                <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1">Opening stock</label>
                <input type="number" value={editing.openingStock ?? 0} onChange={(e) => setEditing({ ...editing, openingStock: Number(e.target.value) })} className="erp-input num" />
              </div>
            )}
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1">Description</label>
            <textarea rows={2} value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="erp-input" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setFormOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton type="submit">
              <Package className="h-4 w-4" /> Save product
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
