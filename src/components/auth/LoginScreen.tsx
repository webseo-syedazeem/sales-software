"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Lock,
  Mail,
  ArrowRight,
  Sparkles,
  Database,
  KeyRound,
  Building2,
  CheckCircle2,
} from "lucide-react";
import type { SafeUser } from "@/types/erp";

const DEMO_ACCOUNTS = [
  { label: "Executive Admin", email: "admin@apexledger.com", pass: "Admin@12345!", role: "Full RBAC" },
  { label: "Branch Manager", email: "manager@apexledger.com", pass: "Manager@12345!", role: "Approvals" },
  { label: "Sales Staff", email: "sales@apexledger.com", pass: "Sales@12345!", role: "POS & CRM" },
  { label: "CPA Accountant", email: "finance@apexledger.com", pass: "Finance@12345!", role: "Ledger & GL" },
];

export function LoginScreen({
  onAuthenticated,
  storageMode,
}: {
  onAuthenticated: (user: SafeUser) => void;
  storageMode: string;
}) {
  const [email, setEmail] = useState("admin@apexledger.com");
  const [password, setPassword] = useState("Admin@12345!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Sign in failed.");
      } else {
        onAuthenticated(data.user);
      }
    } catch {
      setError("Network error while authenticating.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen enterprise-mesh flex items-center justify-center p-4 sm:p-8 relative overflow-hidden">
      {/* Animated ambient orbs */}
      <motion.div
        animate={{ scale: [1, 1.15, 1], opacity: [0.25, 0.4, 0.25] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl"
      />
      <motion.div
        animate={{ scale: [1.1, 0.95, 1.1], opacity: [0.2, 0.35, 0.2] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl"
      />

      <div className="relative z-10 grid w-full max-w-5xl grid-cols-1 gap-8 lg:grid-cols-12 items-center">
        {/* Left Hero Brand Column */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45 }}
          className="lg:col-span-6 space-y-6"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3.5 py-1.5 text-xs font-semibold text-blue-300">
            <Sparkles className="h-3.5 w-3.5" />
            US Enterprise Product, Sales & Financial Suite
          </div>

          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                  ApexLedger <span className="text-blue-400">ERP</span>
                </h1>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Executive Financial Command Platform
                </p>
              </div>
            </div>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Unified multi-branch ERP covering Product Master, Real-Time Warehousing, CRM, Quick
              Sales Punch, US Professional Invoicing, Customer Ledgers, AR/AP, Double-Entry
              Accounting, Approvals & AI Business Intelligence.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: ShieldCheck, title: "JWT + HttpOnly Auth", desc: "Bcrypt hashing & lockout guard" },
              { icon: KeyRound, title: "Granular RBAC", desc: "9 enterprise roles & 11 perms" },
              { icon: Database, title: storageMode === "mongodb" ? "MongoDB Atlas Live" : "MongoDB Ready", desc: storageMode === "mongodb" ? "27 collections connected" : "Auto-seeded + URI ready" },
              { icon: CheckCircle2, title: "Full Audit Trail", desc: "Before/after diff & SHA-256 backups" },
            ].map((item) => (
              <div
                key={item.title}
                className="glass-panel rounded-xl p-3.5 flex items-start gap-3"
              >
                <item.icon className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-slate-100">{item.title}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Right Sign-In Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="lg:col-span-6"
        >
          <div className="glass-panel rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-700/50">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-white">Enterprise Sign In</h2>
              <p className="text-xs text-slate-400 mt-1">
                Protected by rate limiting, account lockout policy & full session auditing.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Corporate Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="erp-input pl-9"
                    placeholder="name@apexledger.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="erp-input pl-9"
                    placeholder="••••••••••••"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60"
              >
                {loading ? "Verifying Security Credentials..." : "Launch Enterprise Workspace"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-700/50">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
                Quick-Fill Role Credentials (Test RBAC Permissions)
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => {
                      setEmail(acc.email);
                      setPassword(acc.pass);
                      setError(null);
                    }}
                    className="rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-left hover:border-blue-500/50 hover:bg-blue-500/10 transition-colors cursor-pointer"
                  >
                    <p className="text-xs font-semibold text-slate-100">{acc.label}</p>
                    <p className="text-[10px] text-slate-400 font-mono-num">{acc.role}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
