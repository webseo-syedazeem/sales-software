"use client";

import React, { useState } from "react";
import {
  Users,
  Plus,
  Search,
  Phone,
  Mail,
  Building2,
  CalendarClock,
  MessageSquarePlus,
  Download,
  Award,
  AlertCircle,
} from "lucide-react";
import type { Customer } from "@/types/erp";
import type { ClientERPState } from "./ExecutiveDashboard";
import { exportToCSV, formatUSD, formatUSDate } from "@/lib/utils";
import {
  GlassCard,
  KpiTile,
  Modal,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  StatusBadge,
} from "@/components/ui/Primitives";

export function CustomersCRMModule({
  state,
  onRunAction,
  onNavigate,
}: {
  state: ClientERPState;
  onRunAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  onNavigate: (tab: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Customer>>({});
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("2026-11-28");
  const [noteText, setNoteText] = useState("");
  const [noteChannel, setNoteChannel] = useState<"Phone" | "Email" | "In-Person" | "SMS" | "Note">("Phone");

  const selected = state.customers.find((c) => c.id === selectedId) || null;

  const filtered = state.customers.filter((c) => {
    const matchSeg = segmentFilter === "All" || c.segment === segmentFilter;
    const q = search.toLowerCase();
    const matchQ =
      !q ||
      c.companyName.toLowerCase().includes(q) ||
      c.contactPerson.toLowerCase().includes(q) ||
      c.customerCode.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q);
    return matchSeg && matchQ;
  });

  const vipCount = state.customers.filter((c) => c.segment === "VIP").length;
  const atRiskCount = state.customers.filter((c) => c.segment === "At-Risk").length;
  const totalOpenBalances = state.customers.reduce((s, c) => s + c.currentBalance, 0);
  const openTasks = state.customers.reduce(
    (s, c) => s + c.tasks.filter((t) => t.status === "Open").length,
    0
  );

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    await onRunAction("customer:save", editing as Record<string, unknown>);
    setFormOpen(false);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        badge="Enterprise Customer Master & CRM"
        title="Customers, Credit Control & CRM"
        subtitle="Complete US B2B customer database with credit limit monitoring, tax-exempt certificates, VIP segmentation, follow-ups, tasks, and communication timelines."
        actions={
          <>
            <SecondaryButton
              onClick={() =>
                exportToCSV(
                  "apexledger-customers.csv",
                  state.customers.map((c) => ({
                    Code: c.customerCode,
                    Company: c.companyName,
                    Contact: c.contactPerson,
                    Phone: c.phone,
                    Email: c.email,
                    State: c.state,
                    Segment: c.segment,
                    Terms: c.paymentTerms,
                    CreditLimit: c.creditLimit,
                    CurrentBalance: c.currentBalance,
                  }))
                )
              }
            >
              <Download className="h-4 w-4" /> Export CSV
            </SecondaryButton>
            <PrimaryButton
              onClick={() => {
                setEditing({
                  companyName: "",
                  contactPerson: "",
                  phone: "+1 ",
                  email: "",
                  state: "NY",
                  customerType: "B2B Enterprise",
                  segment: "Standard",
                  paymentTerms: "Net 30",
                  creditLimit: 50000,
                  openingBalance: 0,
                  taxExempt: false,
                  billingAddress: "",
                  shippingAddress: "",
                });
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> New Customer
            </PrimaryButton>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Total Customers" value={String(state.customers.length)} sublabel={`${vipCount} VIP Accounts`} icon={<Users className="h-5 w-5" />} tone="blue" />
        <KpiTile label="Open Ledger Balances" value={formatUSD(totalOpenBalances)} sublabel="Across all US accounts" icon={<Building2 className="h-5 w-5" />} tone="emerald" />
        <KpiTile label="Active CRM Follow-Ups" value={String(openTasks)} sublabel="Calls, quotes & reminders" icon={<CalendarClock className="h-5 w-5" />} tone="indigo" />
        <KpiTile label="At-Risk Credit Accounts" value={String(atRiskCount)} delta={atRiskCount > 0 ? "Review Limit" : "Clear"} positive={atRiskCount === 0} icon={<AlertCircle className="h-5 w-5" />} tone="rose" />
      </div>

      {/* Filters */}
      <GlassCard className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, contact person, code, or email..."
            className="erp-input pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["All", "VIP", "High-Value", "Standard", "At-Risk"].map((seg) => (
            <button
              key={seg}
              onClick={() => setSegmentFilter(seg)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                segmentFilter === seg
                  ? "bg-[#111317] text-white"
                  : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
              }`}
            >
              {seg}
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Customer Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {filtered.map((c) => {
          const util = Math.min(100, Math.round((c.currentBalance / Math.max(1, c.creditLimit)) * 100));
          return (
            <GlassCard key={c.id} hover onClick={() => setSelectedId(c.id)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono-num text-[11px] font-bold text-[#1E3FAE]">
                      {c.customerCode}
                    </span>
                    {c.taxExempt && (
                      <span className="rounded bg-[#E6EDFD] px-1.5 py-0.5 text-[10px] font-semibold text-[#1E3FAE]">
                        Tax-Exempt
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-[var(--text-primary)] mt-0.5">
                    {c.companyName}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {c.contactPerson} · {c.customerType} ({c.state})
                  </p>
                </div>
                <StatusBadge status={c.segment} />
              </div>

              <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {c.phone}</span>
                <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {c.email}</span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[var(--bg-elevated)] p-3 border border-[var(--border-subtle)] text-xs">
                <div>
                  <p className="text-[10px] uppercase text-[var(--text-muted)]">Current Balance</p>
                  <p className="font-mono-num font-bold text-[#7F4505]">{formatUSD(c.currentBalance)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-[var(--text-muted)]">Credit Limit</p>
                  <p className="font-mono-num font-bold text-[var(--text-primary)]">{formatUSD(c.creditLimit)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-[var(--text-muted)]">Terms</p>
                  <p className="font-semibold text-[#1E3FAE]">{c.paymentTerms}</p>
                </div>
              </div>

              <div className="mt-3">
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-[var(--text-muted)]">Credit Utilization</span>
                  <span className={`font-mono-num font-bold ${util > 85 ? "text-[#A11A1A]" : "text-[#05603F]"}`}>
                    {util}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[#ECEAE4] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${util > 85 ? "bg-rose-500" : util > 65 ? "bg-amber-500" : "bg-blue-500"}`}
                    style={{ width: `${util}%` }}
                  />
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* Customer 360° CRM Modal */}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={selected ? `${selected.companyName} (${selected.customerCode})` : ""}
        subtitle={selected ? `${selected.contactPerson} · EIN/Tax ID: ${selected.taxId || "N/A"} · ${selected.paymentTerms}` : ""}
        maxWidth="max-w-4xl"
      >
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl bg-[var(--bg-elevated)] p-3 border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)] uppercase text-[10px]">Billing Address</p>
                <p className="mt-1 text-[var(--text-primary)]">{selected.billingAddress}</p>
              </div>
              <div className="rounded-xl bg-[var(--bg-elevated)] p-3 border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)] uppercase text-[10px]">Shipping Address</p>
                <p className="mt-1 text-[var(--text-primary)]">{selected.shippingAddress}</p>
              </div>
              <div className="rounded-xl bg-[var(--bg-elevated)] p-3 border border-[var(--border-subtle)] flex flex-col justify-between">
                <div>
                  <p className="text-[var(--text-muted)] uppercase text-[10px]">Open Ledger Balance</p>
                  <p className="mt-1 text-lg font-bold font-mono-num text-[#7F4505]">
                    {formatUSD(selected.currentBalance)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedId(null);
                    onNavigate("ledger");
                  }}
                  className="text-left text-[#1E3FAE] font-semibold hover:underline cursor-pointer mt-1"
                >
                  Open Full Customer Ledger →
                </button>
              </div>
            </div>

            {/* CRM Follow-ups & Communications */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#1E3FAE] flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" /> Follow-ups & Reminders
                </h4>
                <div className="space-y-2">
                  {selected.tasks.length === 0 && (
                    <p className="text-xs text-[var(--text-muted)]">No open tasks scheduled.</p>
                  )}
                  {selected.tasks.map((t) => (
                    <div key={t.id} className="rounded-lg bg-[#F6F5F1] border border-[#EEECE7] p-2.5 text-xs">
                      <div className="flex justify-between">
                        <span className="font-semibold text-[var(--text-primary)]">{t.title}</span>
                        <StatusBadge status={t.priority} />
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        Due {formatUSDate(t.dueDate)} · {t.assignedTo}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-[var(--border-subtle)] flex gap-2">
                  <input
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="Add reminder or follow-up..."
                    className="erp-input text-xs"
                  />
                  <input
                    type="date"
                    value={taskDue}
                    onChange={(e) => setTaskDue(e.target.value)}
                    className="erp-input text-xs w-36"
                  />
                  <PrimaryButton
                    onClick={async () => {
                      if (!taskTitle.trim()) return;
                      await onRunAction("customer:task", {
                        customerId: selected.id,
                        title: taskTitle,
                        dueDate: taskDue,
                        priority: "High",
                        type: "Follow-up",
                      });
                      setTaskTitle("");
                    }}
                    className="px-3 py-1.5 text-xs"
                  >
                    Add
                  </PrimaryButton>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#05603F] flex items-center gap-1.5">
                  <MessageSquarePlus className="h-3.5 w-3.5" /> Communication Timeline
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selected.communications.length === 0 && (
                    <p className="text-xs text-[var(--text-muted)]">No communication logs yet.</p>
                  )}
                  {selected.communications.map((cm) => (
                    <div key={cm.id} className="rounded-lg bg-[#F6F5F1] border border-[#EEECE7] p-2.5 text-xs">
                      <div className="flex justify-between text-[11px] text-[var(--text-muted)]">
                        <span className="font-semibold text-[#1E3FAE]">{cm.channel} · {cm.author}</span>
                        <span>{formatUSDate(cm.date)}</span>
                      </div>
                      <p className="mt-1 text-[var(--text-primary)]">{cm.summary}</p>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-[var(--border-subtle)] flex gap-2">
                  <select
                    value={noteChannel}
                    onChange={(e) => setNoteChannel(e.target.value as typeof noteChannel)}
                    className="erp-input text-xs w-28"
                  >
                    <option value="Phone">Phone</option>
                    <option value="Email">Email</option>
                    <option value="In-Person">Meeting</option>
                    <option value="Note">Note</option>
                  </select>
                  <input
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Log call outcome or sales note..."
                    className="erp-input text-xs"
                  />
                  <PrimaryButton
                    onClick={async () => {
                      if (!noteText.trim()) return;
                      await onRunAction("customer:note", {
                        customerId: selected.id,
                        channel: noteChannel,
                        summary: noteText,
                      });
                      setNoteText("");
                    }}
                    className="px-3 py-1.5 text-xs"
                  >
                    Log
                  </PrimaryButton>
                </div>
              </div>
            </div>

            {/* Outstanding Invoices */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
                <Award className="h-3.5 w-3.5 text-[#7F4505]" /> Invoices & Transaction History
              </h4>
              <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                    <tr>
                      <th className="px-3 py-2">Invoice #</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Due Date</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Balance Due</th>
                      <th className="px-3 py-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {state.invoices
                      .filter((i) => i.customerId === selected.id)
                      .map((inv) => (
                        <tr key={inv.id}>
                          <td className="px-3 py-2 font-mono-num text-[#1E3FAE] font-semibold">{inv.invoiceNo}</td>
                          <td className="px-3 py-2">{formatUSDate(inv.issueDate)}</td>
                          <td className="px-3 py-2">{formatUSDate(inv.dueDate)}</td>
                          <td className="px-3 py-2 text-right font-mono-num">{formatUSD(inv.total)}</td>
                          <td className="px-3 py-2 text-right font-mono-num font-bold text-[#7F4505]">{formatUSD(inv.balanceDue)}</td>
                          <td className="px-3 py-2 text-right"><StatusBadge status={inv.status} /></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* New Customer Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Register Enterprise Customer"
        subtitle="Creates customer master profile, US tax settings, credit limit, and optional opening ledger balance."
      >
        <form onSubmit={handleSaveCustomer} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Company Name *</label>
              <input required value={editing.companyName || ""} onChange={(e) => setEditing({ ...editing, companyName: e.target.value })} className="erp-input mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Contact Person *</label>
              <input required value={editing.contactPerson || ""} onChange={(e) => setEditing({ ...editing, contactPerson: e.target.value })} className="erp-input mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Phone</label>
              <input value={editing.phone || ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} className="erp-input mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Email</label>
              <input type="email" value={editing.email || ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} className="erp-input mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">US State (Tax Jurisdiction)</label>
              <select value={editing.state || "NY"} onChange={(e) => setEditing({ ...editing, state: e.target.value })} className="erp-input mt-1">
                {state.taxRules.map((t) => (
                  <option key={t.id} value={t.stateCode}>{t.stateCode} — {t.stateName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Payment Terms</label>
              <select value={editing.paymentTerms || "Net 30"} onChange={(e) => setEditing({ ...editing, paymentTerms: e.target.value as Customer["paymentTerms"] })} className="erp-input mt-1">
                <option value="Due on Receipt">Due on Receipt</option>
                <option value="Net 15">Net 15</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 45">Net 45</option>
                <option value="Net 60">Net 60</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Credit Limit ($)</label>
              <input type="number" value={editing.creditLimit ?? 50000} onChange={(e) => setEditing({ ...editing, creditLimit: Number(e.target.value) })} className="erp-input mt-1 font-mono-num" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Opening Balance ($)</label>
              <input type="number" step="0.01" value={editing.openingBalance ?? 0} onChange={(e) => setEditing({ ...editing, openingBalance: Number(e.target.value) })} className="erp-input mt-1 font-mono-num" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">EIN / Tax ID</label>
              <input value={editing.taxId || ""} onChange={(e) => setEditing({ ...editing, taxId: e.target.value })} className="erp-input mt-1 font-mono-num" placeholder="XX-XXXXXXX" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)]">Segment</label>
              <select value={editing.segment || "Standard"} onChange={(e) => setEditing({ ...editing, segment: e.target.value as Customer["segment"] })} className="erp-input mt-1">
                <option value="VIP">VIP</option>
                <option value="High-Value">High-Value</option>
                <option value="Standard">Standard</option>
                <option value="At-Risk">At-Risk</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)]">US Billing Address</label>
            <input value={editing.billingAddress || ""} onChange={(e) => setEditing({ ...editing, billingAddress: e.target.value })} className="erp-input mt-1" placeholder="Street, Suite, City, State ZIP" />
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input type="checkbox" checked={Boolean(editing.taxExempt)} onChange={(e) => setEditing({ ...editing, taxExempt: e.target.checked })} className="accent-blue-500" />
            Tax-Exempt Customer (Valid Resale / Exemption Certificate on File)
          </label>
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setFormOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton type="submit">Create Customer</PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
