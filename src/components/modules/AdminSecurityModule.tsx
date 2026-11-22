"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  Users,
  History,
  DatabaseBackup,
  Settings,
  Plus,
  Unlock,
  CheckCircle2,
  Database,
  Download,
} from "lucide-react";
import type { PermissionKey, RoleName } from "@/types/erp";
import type { ClientERPState } from "./ExecutiveDashboard";
import { downloadJSON, formatUSDate } from "@/lib/utils";
import {
  GlassCard,
  Modal,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  StatusBadge,
} from "@/components/ui/Primitives";

const PERM_KEYS: PermissionKey[] = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "export",
  "print",
  "refund",
  "financials",
  "reports",
  "users",
];

export function AdminSecurityModule({
  state,
  storageMode,
  onRunAction,
}: {
  state: ClientERPState;
  storageMode: string;
  onRunAction: (action: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown> | void>;
}) {
  const [tab, setTab] = useState<"rbac" | "audit" | "backup" | "settings">("rbac");
  const [auditSearch, setAuditSearch] = useState("");
  const [userOpen, setUserOpen] = useState(false);

  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "Sales Staff" as RoleName,
    branchId: state.branches[0]?.id || "br-ny",
    department: "Commercial Sales",
  });

  const [settingsForm, setSettingsForm] = useState({ ...state.settings });

  const filteredAudit = state.auditLogs.filter((l) => {
    const q = auditSearch.toLowerCase();
    return (
      !q ||
      l.summary.toLowerCase().includes(q) ||
      l.actorName.toLowerCase().includes(q) ||
      l.module.toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <SectionHeader
        badge="Enterprise Security, Governance & Disaster Recovery"
        title="Users, RBAC, Audit Trail, Backups & Admin"
        subtitle="Role-based access matrix across 9 enterprise roles, immutable before/after audit trails, SHA-256 verified database backups, and multi-company administration."
      />

      <GlassCard className="p-3 flex flex-wrap gap-2">
        {(
          [
            ["rbac", `Users & RBAC Matrix (${state.users.length})`],
            ["audit", `Immutable Audit Trail (${state.auditLogs.length})`],
            ["backup", `Backup & Disaster Recovery (${state.backups.length})`],
            ["settings", "Enterprise Admin & MongoDB"],
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

      {/* TAB 1: USERS & RBAC */}
      {tab === "rbac" && (
        <div className="space-y-5">
          <GlassCard className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-400" /> Provisioned User Accounts & Login Activity
              </span>
              <PrimaryButton onClick={() => setUserOpen(true)} className="py-1.5 px-3 text-xs">
                <Plus className="h-3.5 w-3.5" /> Provision User
              </PrimaryButton>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] uppercase border-b border-[var(--border-subtle)]">
                  <tr>
                    <th className="px-4 py-2.5">Name / Email</th>
                    <th className="px-4 py-2.5">Role</th>
                    <th className="px-4 py-2.5">Last Login & IP</th>
                    <th className="px-4 py-2.5">MFA / Lockout</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Security Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {state.users.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-3">
                        <p className="font-bold text-[var(--text-primary)]">{u.name}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">{u.email}</p>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={u.role} /></td>
                      <td className="px-4 py-3 font-mono-num text-[11px] text-[var(--text-secondary)]">
                        {formatUSDate(u.lastLoginAt)} · {u.lastLoginIp || "—"}
                      </td>
                      <td className="px-4 py-3 text-[11px]">
                        {u.mfaEnabled ? "MFA On" : "Standard"} · {u.failedLoginAttempts} fails
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                      <td className="px-4 py-3 text-right">
                        {u.status === "Locked" ? (
                          <SecondaryButton
                            onClick={() => onRunAction("user:unlock", { userId: u.id })}
                            className="py-1 px-2.5 text-xs"
                          >
                            <Unlock className="h-3.5 w-3.5" /> Unlock
                          </SecondaryButton>
                        ) : (
                          <span className="text-[11px] text-emerald-400">Protected</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          {/* Permission Matrix */}
          <GlassCard className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Granular RBAC Permission Matrix (Toggle Live Permissions)
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] uppercase border-b border-[var(--border-subtle)]">
                  <tr>
                    <th className="px-4 py-2.5">Role</th>
                    {PERM_KEYS.map((pk) => (
                      <th key={pk} className="px-2 py-2.5 text-center text-[10px]">
                        {pk}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {state.roles.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5 font-bold text-[var(--text-primary)] whitespace-nowrap">
                        {r.name}
                      </td>
                      {PERM_KEYS.map((pk) => (
                        <td key={pk} className="px-2 py-2.5 text-center">
                          <input
                            type="checkbox"
                            disabled={r.name === "Admin"}
                            checked={Boolean(r.permissions[pk])}
                            onChange={(e) =>
                              onRunAction("role:update", {
                                roleId: r.id,
                                permission: pk,
                                value: e.target.checked,
                              })
                            }
                            className="h-3.5 w-3.5 accent-blue-500 cursor-pointer"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}

      {/* TAB 2: AUDIT TRAIL */}
      {tab === "audit" && (
        <GlassCard className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <History className="h-4 w-4 text-blue-400" /> Complete Enterprise Activity & Change Log
            </h3>
            <input
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              placeholder="Filter by user, module, action, or record..."
              className="erp-input sm:max-w-xs text-xs"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] uppercase border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="px-3 py-2.5">Timestamp</th>
                  <th className="px-3 py-2.5">Actor / Role</th>
                  <th className="px-3 py-2.5">Action</th>
                  <th className="px-3 py-2.5">Module / Record</th>
                  <th className="px-3 py-2.5">Summary & Diff</th>
                  <th className="px-3 py-2.5">IP / Device</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredAudit.map((log) => (
                  <tr key={log.id} className="hover:bg-blue-500/5">
                    <td className="px-3 py-2.5 font-mono-num text-[11px] whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-[var(--text-primary)]">{log.actorName}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">{log.actorRole}</p>
                    </td>
                    <td className="px-3 py-2.5"><StatusBadge status={log.action} /></td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{log.module}</p>
                      <p className="font-mono-num text-[11px] text-blue-400">{log.recordId}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-[var(--text-primary)]">{log.summary}</p>
                      {(log.previousValue || log.newValue) && (
                        <p className="font-mono-num text-[10px] text-amber-300 mt-0.5">
                          {log.previousValue ? `${log.previousValue} → ` : ""}
                          {log.newValue}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-[var(--text-muted)]">
                      <p className="font-mono-num">{log.ipAddress}</p>
                      <p className="truncate max-w-[140px]">{log.device}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* TAB 3: BACKUP & DISASTER RECOVERY */}
      {tab === "backup" && (
        <div className="space-y-4">
          <GlassCard className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                <DatabaseBackup className="h-5 w-5 text-emerald-400" /> Backup & Disaster Recovery Vault
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Scheduled policy: <strong>{state.settings.autoBackupSchedule}</strong> · SHA-256 integrity checksums verified on every snapshot.
              </p>
            </div>
            <PrimaryButton
              onClick={async () => {
                const res = await onRunAction("backup:create", {});
                if (res && typeof res.exportJson === "string") {
                  downloadJSON(
                    `apexledger-backup-${new Date().toISOString().slice(0, 10)}.json`,
                    res.exportJson
                  );
                }
              }}
            >
              <Download className="h-4 w-4" /> Create & Download Verified Backup
            </PrimaryButton>
          </GlassCard>

          <GlassCard className="p-0 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] uppercase border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="px-4 py-3">Snapshot ID</th>
                  <th className="px-4 py-3">Created At</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Records / Size</th>
                  <th className="px-4 py-3">SHA-256 Checksum</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Verify</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {state.backups.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-mono-num font-bold text-blue-400">{b.id}</td>
                    <td className="px-4 py-3">{new Date(b.createdAt).toLocaleString("en-US")}</td>
                    <td className="px-4 py-3">{b.type} · {b.createdBy}</td>
                    <td className="px-4 py-3 text-right font-mono-num">{b.recordCount} recs · {b.sizeKb} KB</td>
                    <td className="px-4 py-3 font-mono-num text-emerald-400">{b.checksum}</td>
                    <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <SecondaryButton
                        onClick={() => onRunAction("backup:verify", { backupId: b.id })}
                        className="py-1 px-2.5 text-xs"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Verify
                      </SecondaryButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        </div>
      )}

      {/* TAB 4: ENTERPRISE ADMINISTRATION & MONGODB */}
      {tab === "settings" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <GlassCard className="lg:col-span-8">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await onRunAction("settings:update", settingsForm as unknown as Record<string, unknown>);
              }}
              className="space-y-4"
            >
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Settings className="h-4 w-4 text-blue-400" /> Company Profile, Numbering & Security Policy
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[var(--text-muted)]">Active Company Entity</label>
                  <select
                    value={settingsForm.activeCompany}
                    onChange={(e) => setSettingsForm({ ...settingsForm, activeCompany: e.target.value, legalName: e.target.value })}
                    className="erp-input mt-1"
                  >
                    {settingsForm.companies.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[var(--text-muted)]">Federal EIN / Tax ID</label>
                  <input value={settingsForm.ein} onChange={(e) => setSettingsForm({ ...settingsForm, ein: e.target.value })} className="erp-input mt-1 font-mono-num" />
                </div>
                <div>
                  <label className="text-[var(--text-muted)]">Invoice Prefix</label>
                  <input value={settingsForm.invoicePrefix} onChange={(e) => setSettingsForm({ ...settingsForm, invoicePrefix: e.target.value })} className="erp-input mt-1 font-mono-num" />
                </div>
                <div>
                  <label className="text-[var(--text-muted)]">US Invoice Template</label>
                  <select value={settingsForm.invoiceTemplate} onChange={(e) => setSettingsForm({ ...settingsForm, invoiceTemplate: e.target.value as typeof settingsForm.invoiceTemplate })} className="erp-input mt-1">
                    <option value="Modern Sapphire">Modern Sapphire</option>
                    <option value="Classic Executive US">Classic Executive US</option>
                    <option value="Minimal Corporate">Minimal Corporate</option>
                  </select>
                </div>
                <div>
                  <label className="text-[var(--text-muted)]">Idle Auto-Logout (Minutes)</label>
                  <input type="number" min={5} max={240} value={settingsForm.sessionTimeoutMinutes} onChange={(e) => setSettingsForm({ ...settingsForm, sessionTimeoutMinutes: Number(e.target.value) })} className="erp-input mt-1 font-mono-num" />
                </div>
                <div>
                  <label className="text-[var(--text-muted)]">Failed Login Lockout Limit</label>
                  <input type="number" min={3} max={10} value={settingsForm.maxFailedLogins} onChange={(e) => setSettingsForm({ ...settingsForm, maxFailedLogins: Number(e.target.value) })} className="erp-input mt-1 font-mono-num" />
                </div>
              </div>
              <PrimaryButton type="submit">Save Enterprise Configuration</PrimaryButton>
            </form>
          </GlassCard>

          <GlassCard className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Database className="h-4 w-4 text-emerald-400" /> MongoDB & Vercel Deployment
              </h3>
              <StatusBadge status={storageMode === "mongodb" ? "Connected" : "Configured"} />
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {storageMode === "mongodb"
                ? "Live MongoDB Atlas cluster connected. All 27 enterprise collections are persisting directly to MongoDB."
                : "Running in auto-seeded local persistence mode. Add MONGODB_URI and JWT_SECRET in your Vercel Project Environment Variables to activate live 27-collection MongoDB Atlas storage automatically."}
            </p>
            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3 font-mono-num text-[11px] text-blue-300 space-y-1">
              <p>MONGODB_URI=mongodb+srv://...</p>
              <p>JWT_SECRET=&lt;64-char-secret&gt;</p>
              <p>DATA_ENCRYPTION_KEY=&lt;32-byte-hex&gt;</p>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Provision User Modal */}
      <Modal
        open={userOpen}
        onClose={() => setUserOpen(false)}
        title="Provision Enterprise User"
        subtitle="Strong password policy enforced (min 8 chars, upper, lower, number, symbol)."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onRunAction("user:save", newUser);
            setUserOpen(false);
          }}
          className="space-y-3"
        >
          <input required placeholder="Full Name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} className="erp-input" />
          <input required type="email" placeholder="Corporate Email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} className="erp-input" />
          <input required type="password" placeholder="Strong Password (e.g. Staff@2026!)" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} className="erp-input" />
          <div className="grid grid-cols-2 gap-3">
            <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as RoleName })} className="erp-input">
              {state.roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
            </select>
            <select value={newUser.branchId} onChange={(e) => setNewUser({ ...newUser, branchId: e.target.value })} className="erp-input">
              {state.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={() => setUserOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton type="submit">Create User</PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
