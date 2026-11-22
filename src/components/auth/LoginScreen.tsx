"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Lock,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowRight,
  Check,
  AlertTriangle,
} from "lucide-react";
import type { SafeUser } from "@/types/erp";

function computePasswordStrength(pw: string) {
  let sc = 0;
  if (pw.length >= 8) sc++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) sc++;
  if (/[0-9]/.test(pw)) sc++;
  if (/[^A-Za-z0-9]/.test(pw)) sc++;
  const color = sc >= 4 ? "#10B981" : sc >= 2 ? "#F59E0B" : "#EF4444";
  const label = ["Enter password", "Weak", "Fair", "Good", "Strong"][sc];
  return { sc, color, label };
}

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
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [ein, setEin] = useState("");
  const [address, setAddress] = useState("");
  const [adminName, setAdminName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = computePasswordStrength(password);

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
      if (!res.ok) setError(data.error || "Sign in failed.");
      else onAuthenticated(data.user);
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
      if (!res.ok) setError(data.error || "Setup failed.");
      else onAuthenticated(data.user);
    } catch {
      setError("Network error while initializing enterprise workspace.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap min-h-screen bg-[#F4F3EF] text-[#111317]">
      {/* Left Signature Nexora Obsidian Panel (#111317) */}
      <section className="flex-1 basis-[520px] bg-[#111317] text-white px-8 sm:px-14 py-12 flex flex-col relative overflow-hidden">
        {/* Concentric decorative rings */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute w-[620px] h-[620px] rounded-full border border-[#2A2E37] -right-[220px] -top-[160px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute w-[420px] h-[420px] rounded-full border border-[#2A2E37] -right-[120px] -top-[60px]"
        />

        {/* Brand Mark */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 relative z-10"
        >
          <span className="w-11 h-11 rounded-[13px] bg-[#C5F04A] flex items-center justify-center shadow-[0_10px_26px_-8px_rgba(197,240,74,0.9)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111317" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 19V5l14 14V5" />
            </svg>
          </span>
          <span className="h text-[22px] font-bold">
            Nexora <span className="text-[#C5F04A] font-medium">Enterprise</span>
          </span>
        </motion.div>

        {/* Center Value Prop + Floating Preview Cards */}
        <div className="my-auto py-12 relative z-10 max-w-[560px]">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="text-[13px] font-bold tracking-[0.12em] text-[#C5F04A]"
          >
            PRODUCT · SALES · FINANCE
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
            className="h text-[36px] sm:text-[46px] leading-[1.08] mt-3.5 font-bold text-white"
          >
            Run the whole company from one screen.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-[#A3A8B3] text-[16px] sm:text-[17px] leading-[1.6] mt-4"
          >
            Sales, invoicing, customer ledgers, inventory, purchasing and double-entry accounting — connected live on MongoDB Atlas across every branch.
          </motion.p>

          {/* Animated Floating Architecture Cards */}
          <div className="relative h-[225px] mt-10 hidden sm:block">
            <div
              className="nexora-float absolute left-0 top-0 w-[255px] p-[18px] rounded-[14px] bg-[#1B1E25] border border-[#2F333C] text-white shadow-xl"
            >
              <div className="text-[12px] text-[#A3A8B3]">Database Engine</div>
              <div className="h text-[20px] font-bold mt-1.5">
                {storageMode === "mongodb" ? "MongoDB Atlas Live" : "Local Dev Ready"}
              </div>
              <div className="flex items-end gap-1.5 h-[44px] mt-3">
                {[40, 55, 48, 70, 84, 100].map((pct, i) => (
                  <div
                    key={i}
                    className="nexora-bar flex-1 rounded-[4px]"
                    style={{
                      height: `${pct}%`,
                      background: i === 5 ? "#C5F04A" : i === 4 ? "#9BCB2E" : i === 3 ? "#3A3F4A" : "#2F333C",
                      animationDelay: `${0.4 + i * 0.06}s`,
                    }}
                  />
                ))}
              </div>
            </div>

            <div
              className="nexora-float absolute left-[225px] top-[112px] w-[265px] p-4 rounded-[14px] bg-white text-[#111317] shadow-2xl border border-[#E6E3DC]"
              style={{ animationDelay: "1.2s" }}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-[34px] h-[34px] rounded-[10px] bg-[#E3F5EC] text-[#05603F] flex items-center justify-center shrink-0">
                  <Check className="h-4 w-4" />
                </span>
                <div>
                  <div className="font-semibold text-[13.5px]">Double-Entry Ledger</div>
                  <div className="text-[12px] text-[#5F636C]">Real-time AR · GL · Audit Trail</div>
                </div>
              </div>
            </div>

            <div
              className="nexora-float absolute left-[310px] top-0 w-[210px] p-3.5 rounded-[14px] bg-[#1B1E25] border border-[#2F333C] text-white shadow-xl"
              style={{ animationDelay: "2s" }}
            >
              <div className="text-[12px] text-[#A3A8B3]">Security Protocol</div>
              <div className="h text-[18px] font-bold mt-1">RBAC + HMAC</div>
              <div className="h-2 rounded-full bg-[#2F333C] overflow-hidden mt-2.5">
                <div className="nexora-barx h-full w-[88%] rounded-full bg-[#F2A766]" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Security Strip */}
        <div className="flex gap-5 flex-wrap text-[#A3A8B3] text-[13px] relative z-10">
          <span className="flex items-center gap-2">
            <Lock className="h-4 w-4" /> AES-256 encryption
          </span>
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Role-based access
          </span>
          <span className="flex items-center gap-2">
            <Eye className="h-4 w-4" /> Full audit trail
          </span>
        </div>
      </section>

      {/* Right Warm Alabaster Form Panel (#F4F3EF) */}
      <section className="flex-1 basis-[460px] flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="w-full max-w-[430px] flex flex-col gap-5"
        >
          {bootError && (
            <div className="rounded-[12px] border border-[#F5C2C2] bg-[#FCE8E8] p-3.5 text-[13px] text-[#A11A1A] flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Database Notice</p>
                <p className="mt-0.5">{bootError}</p>
              </div>
            </div>
          )}

          {setupRequired ? (
            <>
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#EEF6DA] px-2.5 py-1 text-[11.5px] font-bold text-[#3D5A0A] mb-2">
                  First-Time Enterprise Initialization
                </span>
                <h2 className="h text-[30px] font-bold text-[#111317] m-0">
                  Create Super Admin
                </h2>
                <p className="text-[#5F636C] mt-1.5 text-[14.5px]">
                  Configure your company workspace in MongoDB Atlas. Setup permanently locks once created.
                </p>
              </div>

              <form onSubmit={handleSetup} className="flex flex-col gap-3.5">
                <div>
                  <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1.5">
                    Company legal name *
                  </label>
                  <input
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Nexora Plastics Inc."
                    className="erp-input min-h-[46px]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1.5">
                      Federal EIN (optional)
                    </label>
                    <input
                      value={ein}
                      onChange={(e) => setEin(e.target.value)}
                      placeholder="XX-XXXXXXX"
                      className="erp-input min-h-[46px] num"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1.5">
                      Super Admin name *
                    </label>
                    <input
                      required
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="Full name"
                      className="erp-input min-h-[46px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1.5">
                    Company address (optional)
                  </label>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Street, Suite, City, State ZIP"
                    className="erp-input min-h-[46px]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1.5">
                    Admin work email *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@yourcompany.com"
                    className="erp-input min-h-[46px]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1.5">
                    Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a strong password"
                      className="erp-input min-h-[46px] pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label="Toggle password visibility"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-[#5F636C] hover:text-[#111317] cursor-pointer"
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    {[1, 2, 3, 4].map((n) => (
                      <div
                        key={n}
                        className="flex-1 h-1 rounded-full transition-colors duration-300"
                        style={{ backgroundColor: strength.sc >= n ? strength.color : "#E0DDD5" }}
                      />
                    ))}
                  </div>
                  <div className="text-[12px] text-[#5F636C] mt-1.5">
                    Policy: 8+ characters with upper, lower, number and symbol · <b>{strength.label}</b>
                  </div>
                </div>

                {error && (
                  <div className="rounded-[10px] bg-[#FCE8E8] border border-[#F5C2C2] px-3.5 py-2.5 text-[13px] font-medium text-[#A11A1A]">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 w-full min-h-[50px] rounded-[12px] bg-[#16181D] text-white font-semibold text-[15px] inline-flex items-center justify-center gap-2 hover:bg-[#111317] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60 shadow-[0_8px_18px_-8px_rgba(17,19,23,0.7)]"
                >
                  {loading ? "Initializing workspace..." : "Initialize Enterprise ERP"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </>
          ) : (
            <>
              <div>
                <h2 className="h text-[30px] font-bold text-[#111317] m-0">Welcome back</h2>
                <p className="text-[#5F636C] mt-2 text-[15px]">
                  Sign in to your company workspace.
                </p>
              </div>

              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <div>
                  <label className="block text-[12px] font-semibold text-[#4A4E57] mb-1.5">
                    Work email
                  </label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="erp-input min-h-[48px]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[12px] font-semibold text-[#4A4E57]">Password</label>
                  </div>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="erp-input min-h-[48px] pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label="Show or hide password"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-[#5F636C] hover:text-[#111317] cursor-pointer"
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex gap-1.5 mt-2.5">
                    {[1, 2, 3, 4].map((n) => (
                      <div
                        key={n}
                        className="flex-1 h-1 rounded-full transition-colors duration-300"
                        style={{ backgroundColor: strength.sc >= n ? strength.color : "#E0DDD5" }}
                      />
                    ))}
                  </div>
                  <div className="text-[12px] text-[#5F636C] mt-1.5">
                    Policy: 8+ characters with upper, lower, number and symbol · <b>{strength.label}</b>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 text-[14px] text-[#111317] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-[18px] h-[18px] accent-[#16181D] cursor-pointer"
                  />
                  Remember this device for 30 days
                </label>

                {error && (
                  <div className="rounded-[10px] bg-[#FCE8E8] border border-[#F5C2C2] px-3.5 py-2.5 text-[13px] font-medium text-[#A11A1A]">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[50px] rounded-[12px] bg-[#16181D] text-white font-semibold text-[15px] inline-flex items-center justify-center gap-2 hover:bg-[#111317] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60 shadow-[0_8px_18px_-8px_rgba(17,19,23,0.7)]"
                >
                  {loading ? "Signing in..." : "Sign in"}
                  <ArrowRight className="h-4 w-4" />
                </button>

                <div className="flex gap-2.5 p-3.5 rounded-[12px] bg-[#F5F9EA] border border-[#DCEBB5] text-[13px] text-[#334155] leading-relaxed">
                  <ShieldCheck className="h-5 w-5 text-[#111317] shrink-0 mt-0.5" />
                  <span>
                    Accounts lock for 15 minutes after 5 failed attempts. Sessions expire automatically on inactivity and are protected by MongoDB rate limiting.
                  </span>
                </div>
              </form>
            </>
          )}
        </motion.div>
      </section>
    </div>
  );
}
