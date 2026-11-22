# ApexLedger Enterprise — Product, Sales & Financial Management Software

A production-grade, US-ready **Enterprise ERP & Financial Management Platform** built with **Next.js (App Router), TypeScript, Tailwind CSS, Framer Motion, Recharts, and MongoDB (Mongoose)** — architected for 1-click deployment on **Vercel + MongoDB Atlas**.

---

## Core Modules Included (All 38 Enterprise Requirements)

1. **Executive Command Center & CEO 360° Overview** — Real-time sales, today's/monthly/yearly totals, receivables, cash flow, branch performance, customizable widgets, and KPI click-to-drill-down drawers.
2. **Product Master** — Pre-configured with **Acrylic, Backlight, CD, PC Bottle, PC Kohli, PVC Foam Board, and PC Jug**; multi-tier pricing (Retail/Wholesale/Distributor/VIP), variants, specs, live printable **Barcode & QR Code** labels, and product-wise sales/purchase/profit/stock histories.
3. **Multi-Warehouse Inventory & Lot Control** — Real-time stock in/out, transfers, physical audits, damaged/returned/reserved/available stock, low-stock reorder alerts, batch/lot/serial tracking, inventory aging, and movement audit trails.
4. **Customer Management & CRM** — US billing/shipping profiles, tax-exempt certificates, credit limit monitoring, VIP/High-Value/At-Risk segmentation, follow-up tasks, reminders, and communication timelines.
5. **Quick Sales Punching & Sales Order Engine** — USB barcode scanner input mode, multi-item builder, automatic US state sales tax calculation, 7-stage order lifecycle (`Draft → Completed / Returned`), and automatic stock + ledger posting.
6. **US Professional Invoicing** — Automatic numbering, US corporate print/PDF layout, QR pay reference, email dispatch logging, duplicate, cancel, refund, and credit notes.
7. **Customer Ledger (Core Module)** — Customer-wise and consolidated Debit/Credit ledgers with exact running balances, date-range filters, opening/closing balances, manual adjustments, and printable Statements of Account.
8. **Accounts Receivable & Payment Management** — 30/60/90+ day aging charts, overdue collection queue, automated reminders, Cash/ACH/Check/Card/Online payments, partial/advance/refund/reversal entries, printable receipts, and reconciliation.
9. **Suppliers, Purchasing & Accounts Payable** — Vendor scorecards, purchase orders, 1-click Goods Receiving (auto-increments warehouse inventory), and vendor bill settlement.
10. **Double-Entry Accounting, Expenses & US State Tax** — Chart of Accounts, balanced Journal Entries (`Debit = Credit`), live Trial Balance, P&L, Balance Sheet, Cash-Flow Statement, recurring & budgeted expenses, and US state tax configuration.
11. **Approval Workflows, Multi-Branch, Staff, Commissions, Documents & Integrations** — `Salesperson → Manager → Finance → Completed` pipeline, commission approvals, Document Vault, CSV/Excel bulk import & export, and API/POS Hardware connectors.
12. **Advanced BI Analytics & NexAI Executive Copilot** — Live natural-language queries against ERP data, 3-month revenue forecast, margins, CLV, inventory velocity, and downloadable reports.
13. **Enterprise Security, RBAC, Audit Trail & Disaster Recovery** — `bcryptjs` password hashing, `HttpOnly` HS256 JWT sessions, failed-login account lockout, API rate limiting, CSRF origin protection, CSP/HSTS security headers, 9 roles x 11 permissions matrix, immutable before/after audit trail, and SHA-256 verified database backup snapshots.

---

## Deploying to Vercel + MongoDB Atlas

1. Import this repository (`https://github.com/webseo-syedazeem/sales-software.git`) into **Vercel**.
2. Add the following Environment Variables in **Vercel Project Settings → Environment Variables**:
   - `MONGODB_URI` — Your MongoDB Atlas connection string (`mongodb+srv://...`)
   - `JWT_SECRET` — A 64-character random secret string
   - `DATA_ENCRYPTION_KEY` — A 32-byte hex key
   - `NEXT_PUBLIC_APP_URL` — Your deployed Vercel URL
3. Deploy! On first request, ApexLedger automatically seeds all **27 MongoDB collections** if the database is empty.

---

## Default Role Credentials (For Testing RBAC)

| Role | Email | Password |
| :--- | :--- | :--- |
| **Executive Admin** | `admin@apexledger.com` | `Admin@12345!` |
| **Branch Manager** | `manager@apexledger.com` | `Manager@12345!` |
| **Sales Staff** | `sales@apexledger.com` | `Sales@12345!` |
| **CPA Accountant** | `finance@apexledger.com` | `Finance@12345!` |

> **Local Development:** Run `npm install && npm run dev` and open `http://localhost:3000`. Without `MONGODB_URI`, the platform runs seamlessly in auto-seeded local persistence mode until you configure MongoDB Atlas.
