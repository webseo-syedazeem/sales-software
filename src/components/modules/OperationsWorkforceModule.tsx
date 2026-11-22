"use client";

import React, { useState } from "react";
import {
  GitBranch,
  CheckCircle2,
  XCircle,
  Building2,
  UserCheck,
  FileArchive,
  Upload,
  Download,
  PlugZap,
  Plus,
  Mail,
  Printer,
} from "lucide-react";
import type { ApprovalStage } from "@/types/erp";
import type { ClientERPState } from "./ExecutiveDashboard";
import { exportToCSV, formatUSD, formatUSDate, parseCSVText } from "@/lib/utils";
import {
  GlassCard,
  Modal,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  StatusBadge,
} from "@/components/ui/Primitives";

const STAGES: ApprovalStage[] = ["Salesperson", "Manager", "Finance", "Completed"];

export function OperationsWorkforceModule({
  state,
  onRunAction,
}: {
  state: ClientERPState;
  onRunAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [tab, setTab] = useState<"approvals" | "branches" | "employees" | "vault" | "integrations">(
    "approvals"
  );
  const [branchOpen, setBranchOpen] = useState(false);
  const [empOpen, setEmpOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [importTarget, setImportTarget] = useState<"products" | "customers">("products");
  const [csvText, setCsvText] = useState(
    "sku,name,category,uom,purchasePrice,sellingPrice\nSKU-ACR-009,Acrylic Mirror Sheet,Signage & Sheets,Sheet,54,96"
  );

  const [branchForm, setBranchForm] = useState({
    code: "FL-MIA",
    name: "Miami Southeast Branch",
    city: "Miami",
    state: "FL",
    managerName: "Valeria Morales",
    monthlyTarget: 110000,
  });

  const [empForm, setEmpForm] = useState({
    name: "",
    email: "",
    phone: "+1 ",
    department: "Commercial Sales",
    jobRole: "Account Executive",
    branchId: state.branches[0]?.id || "",
    commissionType: "Percentage",
    commissionRate: 4.0,
  });

  const [docForm, setDocForm] = useState({
    title: "",
    category: "Customer Document",
    relatedEntityType: "Customer",
    relatedEntityName: state.customers[0]?.companyName || "",
    fileName: "",
    fileSizeKb: 0,
    mimeType: "",
    fileDataUrl: "",
    notes: "",
  });

  return (
    <div className="space-y-6">
      <SectionHeader
        badge="Enterprise Operations · Workflows, Branches, Staff & Integrations"
        title="Approvals, Multi-Branch, Staff & Integrations"
        subtitle="Multi-stage approval pipelines (Salesperson → Manager → Finance → Completed), US branch hubs, employee commissions, document vault, CSV import/export, and hardware/API connectors."
      />

      <GlassCard className="p-3 flex flex-wrap gap-2">
        {(
          [
            ["approvals", `Approval Workflow (${state.approvals.filter((a) => a.status === "Pending").length} Pending)`],
            ["branches", `Branches & Warehouses (${state.branches.length} / ${state.warehouses.length})`],
            ["employees", `Employees & Commissions (${state.employees.length})`],
            ["vault", "Documents, Emails & Data Import/Export"],
            ["integrations", `API & POS Hardware (${state.integrations.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer ${
              tab === k ? "bg-blue-600 text-white" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
            }`}
          >
            {label}
          </button>
        ))}
      </GlassCard>

      {/* TAB 1: APPROVAL WORKFLOW */}
      {tab === "approvals" && (
        <div className="space-y-4">
          {state.approvals.map((apr) => {
            const activeIdx = STAGES.indexOf(apr.currentStage);
            return (
              <GlassCard key={apr.id} className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num text-xs font-bold text-blue-400">{apr.requestNo}</span>
                      <StatusBadge status={apr.type} />
                      <StatusBadge status={apr.status} />
                    </div>
                    <h3 className="text-base font-bold text-[var(--text-primary)] mt-1">{apr.title}</h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Requested by <strong>{apr.requestedBy}</strong> · Ref {apr.referenceNo} ·{" "}
                      <strong className="font-mono-num text-emerald-400">{formatUSD(apr.amount)}</strong>
                    </p>
                  </div>
                  {apr.status === "Pending" && (
                    <div className="flex gap-2">
                      <PrimaryButton
                        onClick={() =>
                          onRunAction("approval:advance", {
                            approvalId: apr.id,
                            decision: "Approved",
                            comment: `Approved at ${apr.currentStage} stage`,
                          })
                        }
                      >
                        <CheckCircle2 className="h-4 w-4" /> Approve Stage
                      </PrimaryButton>
                      <SecondaryButton
                        onClick={() =>
                          onRunAction("approval:advance", {
                            approvalId: apr.id,
                            decision: "Rejected",
                            comment: "Rejected during management review",
                          })
                        }
                      >
                        <XCircle className="h-4 w-4 text-rose-400" /> Reject
                      </SecondaryButton>
                    </div>
                  )}
                </div>

                {/* Pipeline Stepper */}
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {STAGES.map((st, idx) => {
                    const done = idx < activeIdx || apr.status === "Approved";
                    const current = idx === activeIdx && apr.status === "Pending";
                    return (
                      <div
                        key={st}
                        className={`rounded-xl border px-3 py-2 text-center text-xs font-semibold ${
                          done
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                            : current
                              ? "border-blue-500/60 bg-blue-500/20 text-blue-200 animate-pulse"
                              : "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)]"
                        }`}
                      >
                        <GitBranch className="h-3.5 w-3.5 mx-auto mb-1" />
                        {st}
                      </div>
                    );
                  })}
                </div>

                <div className="text-[11px] text-[var(--text-muted)] space-y-1 border-t border-[var(--border-subtle)] pt-2.5">
                  {apr.history.map((h, i) => (
                    <p key={i}>
                      <strong className="text-[var(--text-primary)]">{h.stage}</strong> · {h.actor} ({h.action}): &ldquo;{h.comment}&rdquo; — {formatUSDate(h.timestamp)}
                    </p>
                  ))}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* TAB 2: BRANCHES & WAREHOUSES */}
      {tab === "branches" && (
        <div className="space-y-5">
          <div className="flex justify-end">
            <PrimaryButton onClick={() => setBranchOpen(true)}>
              <Plus className="h-4 w-4" /> Add Branch Location
            </PrimaryButton>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {state.branches.map((b) => {
              const branchSales = state.invoices
                .filter((i) => i.branchId === b.id && i.status !== "Cancelled")
                .reduce((s, i) => s + i.total, 0);
              const branchWarehouses = state.warehouses.filter((w) => w.branchId === b.id);
              return (
                <GlassCard key={b.id} hover>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono-num text-[11px] font-bold text-blue-400">{b.code} · {b.type}</span>
                      <h3 className="text-base font-bold text-[var(--text-primary)] mt-0.5">{b.name}</h3>
                      <p className="text-xs text-[var(--text-muted)]">{b.city}, {b.state} · Mgr: {b.managerName}</p>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[var(--bg-elevated)] p-3 text-xs border border-[var(--border-subtle)]">
                    <div>
                      <p className="text-[10px] uppercase text-[var(--text-muted)]">Active Invoiced</p>
                      <p className="font-mono-num font-bold text-emerald-400">{formatUSD(branchSales)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-[var(--text-muted)]">Monthly Target</p>
                      <p className="font-mono-num font-bold">{formatUSD(b.monthlyTarget)}</p>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-[var(--text-secondary)]">
                    <p className="font-semibold text-[var(--text-primary)] mb-1 flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5 text-blue-400" /> Attached Warehouses ({branchWarehouses.length})
                    </p>
                    {branchWarehouses.map((w) => (
                      <p key={w.id} className="text-[11px] text-[var(--text-muted)]">
                        • {w.code} — {w.name} ({w.location})
                      </p>
                    ))}
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: EMPLOYEES & COMMISSIONS */}
      {tab === "employees" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <PrimaryButton onClick={() => setEmpOpen(true)}>
              <Plus className="h-4 w-4" /> Add Staff Member
            </PrimaryButton>
          </div>
          <GlassCard className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] uppercase border-b border-[var(--border-subtle)]">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Department & Role</th>
                    <th className="px-4 py-3 text-right">Attendance</th>
                    <th className="px-4 py-3 text-right">Monthly Sales</th>
                    <th className="px-4 py-3">Commission Rule</th>
                    <th className="px-4 py-3 text-right">Earned</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {state.employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-blue-500/5">
                      <td className="px-4 py-3">
                        <p className="font-bold text-[var(--text-primary)]">{emp.name}</p>
                        <p className="font-mono-num text-[11px] text-blue-400">{emp.employeeCode} · {emp.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{emp.jobRole}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">{emp.department}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num text-emerald-400 font-semibold">
                        {emp.attendanceRate}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num font-bold">
                        {formatUSD(emp.monthlySales)}
                      </td>
                      <td className="px-4 py-3">
                        {emp.isSalesRep ? `${emp.commissionType} (${emp.commissionRate}%)` : "Salaried"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num font-bold text-amber-400">
                        {formatUSD(emp.commissionEarned)}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={emp.commissionStatus} /></td>
                      <td className="px-4 py-3 text-right">
                        {emp.isSalesRep && emp.commissionStatus !== "Paid" && (
                          <button
                            onClick={() =>
                              onRunAction("commission:approve", {
                                employeeId: emp.id,
                                status: emp.commissionStatus === "Pending" ? "Approved" : "Paid",
                              })
                            }
                            className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25 cursor-pointer"
                          >
                            {emp.commissionStatus === "Pending" ? "Approve" : "Mark Paid"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}

      {/* TAB 4: DOCUMENTS, EMAILS & CSV IMPORT/EXPORT */}
      {tab === "vault" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <GlassCard className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <FileArchive className="h-4 w-4 text-blue-400" /> Enterprise Document Vault
              </h3>
              <SecondaryButton onClick={() => setDocOpen(true)} className="py-1.5 px-3 text-xs">
                <Plus className="h-3.5 w-3.5" /> Attach Document
              </SecondaryButton>
            </div>
            <div className="space-y-2.5">
              {state.documents.length === 0 && (
                <p className="text-xs text-[var(--text-muted)] py-4 text-center">No documents uploaded yet.</p>
              )}
              {state.documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-[var(--text-primary)] truncate">{doc.title}</p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                      {doc.category} · Linked: {doc.relatedEntityName} · {doc.fileName} ({doc.fileSizeKb} KB)
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {doc.fileDataUrl && (
                      <a
                        href={doc.fileDataUrl}
                        download={doc.fileName}
                        className="rounded-lg bg-blue-500/15 px-2.5 py-1 text-[11px] font-semibold text-blue-400 hover:bg-blue-500/25"
                      >
                        Download
                      </a>
                    )}
                    <button
                      onClick={() => onRunAction("document:delete", { documentId: doc.id })}
                      className="rounded-lg bg-rose-500/15 px-2 py-1 text-[11px] font-semibold text-rose-400 hover:bg-rose-500/25 cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Automated Email Dispatch Log
              </h4>
              {state.emailLogs.slice(0, 5).map((em) => (
                <div key={em.id} className="flex items-center justify-between text-xs py-1.5 border-b border-[var(--border-subtle)]">
                  <div>
                    <p className="font-semibold text-[var(--text-primary)]">{em.subject}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">To: {em.to} · {em.template}</p>
                  </div>
                  <StatusBadge status={em.status} />
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="lg:col-span-5 space-y-4">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Upload className="h-4 w-4 text-emerald-400" /> Bulk CSV / Excel Import & Export
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setImportTarget("products");
                  setCsvText(
                    "sku,name,category,uom,purchasePrice,sellingPrice\nSKU-ACR-009,Acrylic Mirror Sheet,Signage & Sheets,Sheet,54,96"
                  );
                }}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold cursor-pointer ${
                  importTarget === "products" ? "bg-blue-600 text-white" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
                }`}
              >
                Import Products
              </button>
              <button
                onClick={() => {
                  setImportTarget("customers");
                  setCsvText(
                    "companyName,contactPerson,email,state,creditLimit,openingBalance\nAtlantic Sign & Print LLC,Jordan Blake,ap@atlanticsign.com,NY,45000,3200"
                  );
                }}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold cursor-pointer ${
                  importTarget === "customers" ? "bg-blue-600 text-white" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
                }`}
              >
                Import Customers & Balances
              </button>
            </div>
            <textarea
              rows={5}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="erp-input font-mono-num text-xs"
            />
            <PrimaryButton
              onClick={async () => {
                const rows = parseCSVText(csvText);
                await onRunAction("import:batch", { target: importTarget, rows });
              }}
              className="w-full"
            >
              <Upload className="h-4 w-4" /> Run Live Batch Import
            </PrimaryButton>

            <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2">
              <p className="text-xs font-bold uppercase text-[var(--text-muted)]">1-Click Enterprise Exports</p>
              <div className="grid grid-cols-2 gap-2">
                <SecondaryButton onClick={() => exportToCSV("products.csv", state.products as unknown as Record<string, unknown>[])} className="text-xs">
                  <Download className="h-3.5 w-3.5" /> Products CSV
                </SecondaryButton>
                <SecondaryButton onClick={() => exportToCSV("transactions-ledger.csv", state.ledgerEntries as unknown as Record<string, unknown>[])} className="text-xs">
                  <Download className="h-3.5 w-3.5" /> Ledger CSV
                </SecondaryButton>
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {/* TAB 5: API & HARDWARE INTEGRATIONS */}
      {tab === "integrations" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {state.integrations.map((item) => (
            <GlassCard key={item.id} className="flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                    {item.category}
                  </span>
                  <StatusBadge status={item.status} />
                </div>
                <h3 className="text-sm font-bold text-[var(--text-primary)] mt-1 flex items-center gap-1.5">
                  <PlugZap className="h-4 w-4 text-blue-400" /> {item.name}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1.5">{item.description}</p>
                <p className="text-[10px] font-mono-num text-[var(--text-muted)] mt-2 truncate">
                  {item.endpoint}
                </p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
                <SecondaryButton
                  onClick={() => onRunAction("integration:toggle", { integrationId: item.id })}
                  className="py-1.5 px-3 text-xs"
                >
                  {item.status === "Connected" ? "Disconnect" : "Connect"}
                </SecondaryButton>
                {item.category === "Hardware" && (
                  <button
                    onClick={() => window.print()}
                    className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Printer className="h-3.5 w-3.5" /> Test Print
                  </button>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Modals */}
      <Modal open={branchOpen} onClose={() => setBranchOpen(false)} title="Add Enterprise Branch / Office">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onRunAction("branch:save", branchForm);
            setBranchOpen(false);
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="Branch Code" value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })} className="erp-input font-mono-num" />
            <input required placeholder="Branch Name" value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} className="erp-input" />
            <input placeholder="City" value={branchForm.city} onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })} className="erp-input" />
            <input placeholder="State" value={branchForm.state} onChange={(e) => setBranchForm({ ...branchForm, state: e.target.value })} className="erp-input" />
            <input placeholder="Branch Manager" value={branchForm.managerName} onChange={(e) => setBranchForm({ ...branchForm, managerName: e.target.value })} className="erp-input" />
            <input type="number" placeholder="Monthly Target ($)" value={branchForm.monthlyTarget} onChange={(e) => setBranchForm({ ...branchForm, monthlyTarget: Number(e.target.value) })} className="erp-input font-mono-num" />
          </div>
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setBranchOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton type="submit">Create Branch</PrimaryButton>
          </div>
        </form>
      </Modal>

      <Modal open={empOpen} onClose={() => setEmpOpen(false)} title="Add Employee / Sales Rep">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onRunAction("employee:save", empForm);
            setEmpOpen(false);
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="Full Name" value={empForm.name} onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })} className="erp-input" />
            <input required type="email" placeholder="Corporate Email" value={empForm.email} onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })} className="erp-input" />
            <input placeholder="Department" value={empForm.department} onChange={(e) => setEmpForm({ ...empForm, department: e.target.value })} className="erp-input" />
            <input placeholder="Job Role" value={empForm.jobRole} onChange={(e) => setEmpForm({ ...empForm, jobRole: e.target.value })} className="erp-input" />
            <select value={empForm.commissionType} onChange={(e) => setEmpForm({ ...empForm, commissionType: e.target.value })} className="erp-input">
              <option value="Percentage">Percentage Commission</option>
              <option value="Fixed">Fixed Per-Order Commission</option>
              <option value="Product-Based">Product-Based Commission</option>
            </select>
            <input type="number" step="0.25" placeholder="Rate %" value={empForm.commissionRate} onChange={(e) => setEmpForm({ ...empForm, commissionRate: Number(e.target.value) })} className="erp-input font-mono-num" />
          </div>
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setEmpOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton type="submit">
              <UserCheck className="h-4 w-4" /> Save Employee
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      <Modal open={docOpen} onClose={() => setDocOpen(false)} title="Upload Document to Enterprise Vault" subtitle="Stores real files (PDF, PNG, JPG, CSV, DOCX up to 2MB) directly in MongoDB.">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onRunAction("document:add", docForm);
            setDocOpen(false);
          }}
          className="space-y-3"
        >
          <input required placeholder="Document Title" value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} className="erp-input" />
          <div className="grid grid-cols-2 gap-3">
            <select value={docForm.category} onChange={(e) => setDocForm({ ...docForm, category: e.target.value })} className="erp-input">
              <option value="Invoice">Invoice</option>
              <option value="Purchase Document">Purchase Document</option>
              <option value="Receipt">Receipt</option>
              <option value="Customer Document">Customer Document</option>
              <option value="Agreement">Agreement</option>
              <option value="Product Document">Product Document</option>
              <option value="Payment Proof">Payment Proof</option>
            </select>
            <input placeholder="Related Entity (Customer / Invoice)" value={docForm.relatedEntityName} onChange={(e) => setDocForm({ ...docForm, relatedEntityName: e.target.value })} className="erp-input" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Select File (Max 2MB)</label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.csv,.txt,.docx,.xlsx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  setDocForm((prev) => ({
                    ...prev,
                    fileName: file.name,
                    fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
                    mimeType: file.type,
                    fileDataUrl: typeof reader.result === "string" ? reader.result : "",
                  }));
                };
                reader.readAsDataURL(file);
              }}
              className="erp-input text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setDocOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton type="submit">Save Document</PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
