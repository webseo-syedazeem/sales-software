"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function GlassCard({
  children,
  className,
  hover = false,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      whileHover={hover ? { y: -2, transition: { duration: 0.16 } } : undefined}
      onClick={onClick}
      className={cn(
        "glass-panel rounded-2xl p-5 shadow-[0_12px_36px_-18px_rgba(0,0,0,0.55)] relative overflow-hidden",
        hover && "cursor-pointer hover:border-blue-500/40 transition-colors",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/25 to-transparent" />
      {children}
    </motion.div>
  );
}

export function KpiTile({
  label,
  value,
  sublabel,
  delta,
  positive = true,
  icon,
  tone = "blue",
  onClick,
  delay = 0,
}: {
  label: string;
  value: string;
  sublabel?: string;
  delta?: string;
  positive?: boolean;
  icon: React.ReactNode;
  tone?: "blue" | "emerald" | "amber" | "rose" | "indigo" | "cyan";
  onClick?: () => void;
  delay?: number;
}) {
  const toneStyles: Record<string, string> = {
    blue: "from-blue-500/20 to-indigo-500/10 text-blue-400 border-blue-500/25",
    emerald: "from-emerald-500/20 to-teal-500/10 text-emerald-400 border-emerald-500/25",
    amber: "from-amber-500/20 to-orange-500/10 text-amber-400 border-amber-500/25",
    rose: "from-rose-500/20 to-pink-500/10 text-rose-400 border-rose-500/25",
    indigo: "from-indigo-500/20 to-violet-500/10 text-indigo-400 border-indigo-500/25",
    cyan: "from-cyan-500/20 to-sky-500/10 text-cyan-400 border-cyan-500/25",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3, transition: { duration: 0.16 } }}
      onClick={onClick}
      className={cn(
        "glass-panel rounded-2xl p-4 sm:p-5 relative overflow-hidden group transition-all",
        onClick && "cursor-pointer hover:border-blue-400/45 hover:shadow-[0_16px_40px_-18px_rgba(59,130,246,0.35)]"
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
            {label}
          </p>
          <p className="mt-2 text-2xl sm:text-[1.65rem] font-bold tracking-tight font-mono-num text-[var(--text-primary)] truncate">
            {value}
          </p>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br",
            toneStyles[tone]
          )}
        >
          {icon}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        {delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold font-mono-num",
              positive
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-rose-500/15 text-rose-400"
            )}
          >
            {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {delta}
          </span>
        ) : (
          <span />
        )}
        {sublabel && (
          <span className="truncate text-[var(--text-muted)]">{sublabel}</span>
        )}
      </div>
    </motion.div>
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const s = status.toLowerCase();
  let palette = "bg-slate-500/15 text-slate-300 border-slate-500/25";
  if (
    ["paid", "completed", "active", "approved", "connected", "verified", "posted", "delivered", "vip", "reconciled", "received"].some(
      (k) => s.includes(k)
    )
  ) {
    palette = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  } else if (
    ["overdue", "cancelled", "rejected", "locked", "critical", "at-risk", "unpaid", "disconnected", "damaged"].some(
      (k) => s.includes(k)
    )
  ) {
    palette = "bg-rose-500/15 text-rose-400 border-rose-500/30";
  } else if (
    ["pending", "partial", "warning", "processing", "manager", "finance", "draft", "refunded", "credited", "returned"].some(
      (k) => s.includes(k)
    )
  ) {
    palette = "bg-amber-500/15 text-amber-400 border-amber-500/30";
  } else if (
    ["sent", "confirmed", "high-value", "configured", "scheduled", "standard"].some((k) =>
      s.includes(k)
    )
  ) {
    palette = "bg-blue-500/15 text-blue-400 border-blue-500/30";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap",
        palette,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

export function SectionHeader({
  badge,
  title,
  subtitle,
  actions,
}: {
  badge?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {badge && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-blue-400">
            {badge}
          </span>
        )}
        <h1 className="mt-1.5 text-2xl sm:text-[1.7rem] font-bold tracking-tight text-[var(--text-primary)]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-[var(--text-secondary)] max-w-2xl">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(59,130,246,0.65)] hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        className
      )}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  type = "button",
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] hover:border-blue-400/50 hover:bg-blue-500/10 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = "max-w-2xl",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "relative z-10 w-full rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-card-solid)] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col",
              maxWidth
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">{title}</h2>
                {subtitle && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-slate-800/60 hover:text-white transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function BarcodeSVG({ value }: { value: string }) {
  const bars: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    bars.push((code % 3) + 1, ((code >> 2) % 2) + 1, ((code >> 4) % 3) + 1, 1);
  }
  let x = 8;
  return (
    <div className="inline-flex flex-col items-center rounded-xl bg-white p-3 text-slate-900">
      <svg width={Math.max(180, bars.length * 4 + 16)} height={54} viewBox={`0 0 ${Math.max(180, bars.length * 4 + 16)} 54`}>
        {bars.map((w, idx) => {
          const curX = x;
          x += w * 2;
          return idx % 2 === 0 ? (
            <rect key={idx} x={curX} y={4} width={w * 1.8} height={46} fill="#0f172a" />
          ) : null;
        })}
      </svg>
      <span className="mt-1 font-mono-num text-[11px] font-bold tracking-[0.22em]">{value}</span>
    </div>
  );
}

export function QRCodeSVG({ value }: { value: string }) {
  const size = 15;
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const cells: boolean[][] = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => {
      const inFinder =
        (r < 4 && c < 4) ||
        (r < 4 && c >= size - 4) ||
        (r >= size - 4 && c < 4);
      if (inFinder) {
        const lr = r >= size - 4 ? r - (size - 4) : r;
        const lc = c >= size - 4 ? c - (size - 4) : c;
        return lr === 0 || lr === 3 || lc === 0 || lc === 3 || (lr === 1 && lc === 1) || (lr === 2 && lc === 2) || (lr === 1 && lc === 2) || (lr === 2 && lc === 1);
      }
      const v = Math.abs(Math.imul(hash ^ (r * 31 + c * 17), 2654435761));
      return v % 2 === 0;
    })
  );

  return (
    <div className="inline-flex flex-col items-center rounded-xl bg-white p-2.5 text-slate-900">
      <svg width={88} height={88} viewBox={`0 0 ${size * 5} ${size * 5}`}>
        {cells.map((row, r) =>
          row.map((on, c) =>
            on ? <rect key={`${r}-${c}`} x={c * 5} y={r * 5} width={5} height={5} fill="#0f172a" /> : null
          )
        )}
      </svg>
      <span className="mt-1 font-mono-num text-[9px] font-semibold tracking-wider text-slate-600 max-w-[100px] truncate">
        {value}
      </span>
    </div>
  );
}
