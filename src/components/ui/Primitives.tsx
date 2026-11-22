"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, MoreHorizontal, X } from "lucide-react";
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
      transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
      onClick={onClick}
      className={cn(
        "nexora-card p-5 relative",
        hover && "nexora-card-hover cursor-pointer",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

const TONE_MAP = {
  blue: { bg: "#E6EDFD", fg: "#1E3FAE", stroke: "#1E3FAE" },
  emerald: { bg: "#E3F5EC", fg: "#05603F", stroke: "#05603F" },
  amber: { bg: "#FDF0DC", fg: "#7F4505", stroke: "#7F4505" },
  rose: { bg: "#FCE8E8", fg: "#A11A1A", stroke: "#A11A1A" },
  indigo: { bg: "#EEF6DA", fg: "#3D5A0A", stroke: "#3D5A0A" },
  cyan: { bg: "#E6EDFD", fg: "#1E3FAE", stroke: "#1E3FAE" },
};

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
  const t = TONE_MAP[tone] || TONE_MAP.blue;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, delay, ease: [0.2, 0.7, 0.2, 1] }}
      onClick={onClick}
      className={cn(
        "nexora-card nexora-card-hover overflow-hidden flex flex-col text-left group",
        onClick && "cursor-pointer"
      )}
    >
      <div className="flex items-center gap-2.5 px-4 pt-4">
        <span
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] transition-transform duration-300 group-hover:scale-105"
          style={{ backgroundColor: t.bg, color: t.fg }}
        >
          {icon}
        </span>
        <span className="text-[13px] font-semibold text-[#4A4E57] flex-1 truncate">
          {label}
        </span>
        <MoreHorizontal className="h-4 w-4 text-[#9AA0AA]" />
      </div>

      <div className="flex items-end justify-between gap-3 px-4 py-3.5">
        <div className="h num text-[25px] font-bold tracking-tight text-[#111317] truncate">
          {value}
        </div>
        <svg width="86" height="30" viewBox="0 0 96 34" aria-hidden="true" className="shrink-0 overflow-visible">
          <path
            d="M6 24 C16 20, 26 23, 38 17 C50 11, 64 16, 76 11 C82 9, 88 9, 90 8 L90 34 L6 34 Z"
            fill={t.stroke}
            fillOpacity="0.10"
          />
          <path
            d="M6 24 C16 20, 26 23, 38 17 C50 11, 64 16, 76 11 C82 9, 88 9, 90 8"
            fill="none"
            stroke={t.stroke}
            strokeWidth="2"
            strokeLinecap="round"
            pathLength={100}
            className="nexora-draw"
          />
        </svg>
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-[#EEECE7] bg-[#FBFAF8] px-4 py-2.5 text-[12px] text-[#5F636C]">
        {delta && (
          <span
            className={cn(
              "inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11.5px] font-semibold num",
              positive
                ? "bg-[#E3F5EC] text-[#05603F]"
                : "bg-[#FCE8E8] text-[#A11A1A]"
            )}
          >
            {delta}
          </span>
        )}
        <span className="flex-1 truncate">{sublabel || "Live MongoDB telemetry"}</span>
        <ChevronRight className="h-3.5 w-3.5 text-[#111317] shrink-0" />
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
  let style = "bg-[#EEECE7] text-[#4A4E57]";

  if (
    ["paid", "completed", "active", "approved", "connected", "verified", "posted", "delivered", "reconciled", "received", "fast-moving"].some(
      (k) => s.includes(k)
    )
  ) {
    style = "bg-[#E3F5EC] text-[#05603F]";
  } else if (
    ["overdue", "cancelled", "rejected", "locked", "critical", "at-risk", "unpaid", "disconnected", "damaged", "failed", "dead"].some(
      (k) => s.includes(k)
    )
  ) {
    style = "bg-[#FCE8E8] text-[#A11A1A]";
  } else if (
    ["pending", "partial", "warning", "processing", "manager", "finance", "refunded", "credited", "returned", "slow"].some(
      (k) => s.includes(k)
    )
  ) {
    style = "bg-[#FDF0DC] text-[#7F4505]";
  } else if (["vip", "lime", "enterprise"].some((k) => s.includes(k))) {
    style = "bg-[#EEF6DA] text-[#3D5A0A]";
  } else if (
    ["sent", "confirmed", "high-value", "configured", "scheduled", "standard", "steady", "current"].some((k) =>
      s.includes(k)
    )
  ) {
    style = "bg-[#E6EDFD] text-[#1E3FAE]";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 text-[11.5px] font-semibold tracking-[0.01em] whitespace-nowrap",
        style,
        className
      )}
    >
      <span className="h-[6px] w-[6px] rounded-full bg-current" />
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
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4 pb-1">
      <div className="min-w-0 flex-1">
        {badge && (
          <span className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#EEF6DA] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#3D5A0A] mb-1.5">
            {badge}
          </span>
        )}
        <h1 className="h text-[26px] font-bold tracking-tight text-[#111317] leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 text-[14px] text-[#5F636C] max-w-3xl">{subtitle}</p>
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
        "inline-flex items-center justify-center gap-2 min-h-[38px] rounded-[10px] bg-[#16181D] border border-[#16181D] px-3.5 text-[13.5px] font-semibold text-white shadow-[0_1px_2px_rgba(17,19,23,0.25)] hover:bg-[#111317] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap",
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
        "inline-flex items-center justify-center gap-2 min-h-[38px] rounded-[10px] border border-[#E0DDD5] bg-white px-3.5 text-[13.5px] font-semibold text-[#111317] shadow-[0_1px_1px_rgba(17,19,23,0.04)] hover:border-[#CFCBC1] hover:bg-[#F6F5F1] active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap",
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
            className="absolute inset-0 bg-[#111317]/45 backdrop-blur-[4px]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
            className={cn(
              "relative z-10 w-full rounded-[16px] border border-[#E3E0D8] bg-white text-[#111317] shadow-[0_30px_70px_-24px_rgba(17,19,23,0.45)] overflow-hidden max-h-[90vh] flex flex-col",
              maxWidth
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#EEECE7] bg-[#FAF9F6] px-6 py-4">
              <div>
                <h2 className="h text-[18px] font-bold text-[#111317]">{title}</h2>
                {subtitle && <p className="text-[12.5px] text-[#5F636C] mt-0.5">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="rounded-[9px] border border-[#E0DDD5] bg-white p-1.5 text-[#5F636C] hover:bg-[#F1EFEA] hover:text-[#111317] transition-colors cursor-pointer"
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
    <div className="inline-flex flex-col items-center rounded-xl border border-[#E0DDD5] bg-white p-3 text-[#111317]">
      <svg width={Math.max(180, bars.length * 4 + 16)} height={54} viewBox={`0 0 ${Math.max(180, bars.length * 4 + 16)} 54`}>
        {bars.map((w, idx) => {
          const curX = x;
          x += w * 2;
          return idx % 2 === 0 ? (
            <rect key={idx} x={curX} y={4} width={w * 1.8} height={46} fill="#111317" />
          ) : null;
        })}
      </svg>
      <span className="mt-1 num text-[11px] font-bold tracking-[0.22em]">{value}</span>
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
    <div className="inline-flex flex-col items-center rounded-xl border border-[#E0DDD5] bg-white p-2.5 text-[#111317]">
      <svg width={88} height={88} viewBox={`0 0 ${size * 5} ${size * 5}`}>
        {cells.map((row, r) =>
          row.map((on, c) =>
            on ? <rect key={`${r}-${c}`} x={c * 5} y={r * 5} width={5} height={5} fill="#111317" /> : null
          )
        )}
      </svg>
      <span className="mt-1 num text-[9px] font-semibold tracking-wider text-[#5F636C] max-w-[100px] truncate">
        {value}
      </span>
    </div>
  );
}
