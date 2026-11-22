"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Lock,
  Mail,
  ArrowRight,
  Database,
  KeyRound,
  Building2,
  CheckCircle2,
  UserPlus,
  AlertTriangle,
} from "lucide-react";
import type { SafeUser } from "@/types/erp";

export function LoginScreen({
  onAuthenticated,
  storageMode,
  setupRequired,
  bootError,
}: {
  onAuthenticated: (user: SafeUser) => void;
  storageMode: string;
  setupRequired: boolean;
  bootError?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [ein, setEin] = useState("");
  const [address, setAddress] = useState("");
  const [adminName, setAdminName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
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

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          ein,
          address,
          adminName,
          adminEmail: email,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Setup failed.");
      } else {
        onAuthenticated(data.user);
      }
    } catch {
      setError("Network error while initializing enterprise workspace.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen enterprise-mesh flex items-center justify-center p-4 sm:p-8 relative overflow-hidden">
      <motion.div
        animate={{ scale: [1, 1.12, 1], opacity: [0.22, 0.36, 0.22] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl"
      />
      <motion.div
        animate={{ scale: [1.08, 0.95, 1.08], opacity: [0.18, 0.32, 0.18] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl"
      />

      <div className="relative z-10 grid w-full max-w-5xl grid-cols-1 gap-8 lg:grid-cols-12 items-center">
        {/* Left Brand & Security Posture */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="lg:col-span-6 space-y-6"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                ApexLedger <span className="text-blue-400">ERP</span>
              </h1>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Enterprise Product, Sales & Financial Suite
              </p>
            </div>
          </div>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Production multi-branch ERP backed by MongoDB Atlas. Manages Product Catalog,
            Warehousing, CRM, Sales Orders, US Invoicing, Customer Ledgers, AR/AP, Double-Entry
            General Ledger, Approvals, and Live Analytics.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: ShieldCheck, title: "Hardened Auth", desc: "Bcrypt, HttpOnly HS256 JWT & session revocation" },
              { icon: KeyRound, title: "Live MongoDB RBAC", desc: "Real-time permission verification on every call" },
              {
                icon: Database,
                title: storageMode === "mongodb" ? "MongoDB Atlas Live" : "Local Dev Storage",
                desc: storageMode === "mongodb" ? "27 collections + atomic upserts" : "Set MONGODB_URI for Atlas",
              },
              { icon: CheckCircle2, title: "Audit & HMAC Backups", desc: "Immutable diffs & signed disaster recovery" },
            ].map((item) => (
              <div key={item.title} className="glass-panel rounded-xl p-3.5 flex items-start gap-3">
                <item.icon className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-slate-100">{item.title}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Right Form Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="lg:col-span-6"
        >
          <div className="glass-panel rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-700/50">
            {bootError && (
              <div className="mb-5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-200 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Database Connection Notice</p>
                  <p className="mt-0.5 text-rose-200/90">{bootError}</p>
                </div>
              </div>
            )}

            {setupRequired ? (
              <>
                <div className="mb-5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                    <UserPlus className="h-3.5 w-3.5" /> First-Time Enterprise Initialization
                  </span>
                  <h2 className="text-xl font-bold text-white mt-2">Create Super Admin Account</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    No admin user exists in MongoDB yet. Complete this one-time setup — the setup
                    endpoint automatically locks permanently once your admin account is created.
                  </p>
                </div>

                <form onSubmit={handleSetup} className="space-y-3.5">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                      Company Legal Name *
                    </label>
                    <input
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="erp-input"
                      placeholder="e.g. Apex Industrial Plastics Inc."
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                        Federal EIN (Optional)
                      </label>
                      <input
                        value={ein}
                        onChange={(e) => setEin(e.target.value)}
                        className="erp-input font-mono-num"
                        placeholder="XX-XXXXXXX"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                        Super Admin Name *
                      </label>
                      <input
                        required
                        value={adminName}
                        onChange={(e) => setAdminName(e.target.value)}
                        className="erp-input"
                        placeholder="Full Name"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                      Company Address (Optional)
                    </label>
                    <input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="erp-input"
                      placeholder="Street, Suite, City, State ZIP"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                      Admin Corporate Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="erp-input"
                      placeholder="admin@yourcompany.com"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1">
                      Strong Password * (8+ chars, upper, lower, number, symbol)
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="erp-input"
                      placeholder="Create a strong password"
                    />
                  </div>

                  {error && (
                    <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-300">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:from-blue-500 hover:to-indigo-500 transition-all cursor-pointer disabled:opacity-60"
                  >
                    {loading ? "Initializing Live MongoDB Workspace..." : "Initialize Enterprise ERP"}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-white">Enterprise Sign In</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Protected by distributed MongoDB rate limiting, account lockout, and session auditing.
                  </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                      Corporate Email
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="erp-input pl-9"
                        placeholder="you@company.com"
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
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="erp-input pl-9"
                        placeholder="Enter your password"
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
                    {loading ? "Authenticating..." : "Sign In to Workspace"}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
