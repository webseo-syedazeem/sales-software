# ApexLedger Enterprise — Product, Sales & Financial Management Software

A production-grade, US-ready **Enterprise ERP & Financial Management Platform** built with **Next.js (App Router), TypeScript, Tailwind CSS, Framer Motion, Recharts, Nodemailer, and MongoDB Atlas (Mongoose)** — architected for zero-demo live operations on **Vercel + MongoDB Atlas**.

---

## Security & Production Architecture

- **Zero Hardcoded Credentials / Zero Demo Data:** First launch opens a one-time **Super Admin Setup Wizard** (`/api/auth/setup`) that permanently locks itself (`403`) once the initial Admin account is created in MongoDB.
- **Hardened Authentication & Session Revocation:** `bcryptjs` hashing, strong password enforcement, HS256 JWT in `HttpOnly; SameSite=Lax` cookies (`Secure` enforced over HTTPS), failed-login lockout, idle auto-logout, and `tokenVersion`-based instant session revocation when locked or password rotated.
- **Live MongoDB RBAC:** Permissions across 9 enterprise roles × 11 capabilities are verified against live MongoDB user records on every API mutation.
- **Injection & Abuse Protections:** Distributed MongoDB TTL-indexed rate limiting (`rate_limits` collection), recursive `$` operator & prototype-pollution payload sanitization, CSRF origin verification, and strict HTTP security headers (HSTS, CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`).
- **Atomic MongoDB Persistence:** Per-document `bulkWrite` upserts + targeted deletes across 27 collections (no destructive `deleteMany + insertMany` races).
- **Tamper-Proof Disaster Recovery:** AES-256-GCM crypto module and **HMAC-SHA256 signed** database Backup & Restore verification.
- **Live SMTP Email & Live AI:** Real `nodemailer` SMTP email delivery for US invoices & reminders, plus optional live **Gemini API** synthesis layered over real-time MongoDB analytics.

---

## Required Vercel Environment Variables

Set these in **Vercel → Project Settings → Environment Variables** (`Production`, `Preview`, `Development`):

| Variable | Required | Purpose |
| :--- | :---: | :--- |
| `MONGODB_URI` | **Yes** | MongoDB Atlas connection string (`mongodb+srv://.../apexledger_erp?retryWrites=true&w=majority`) |
| `JWT_SECRET` | **Yes** | 64+ character random cryptographic secret (enforced in production) |
| `DATA_ENCRYPTION_KEY` | **Yes** | 32-byte hex key for AES-256-GCM encryption & HMAC-SHA256 backup signing |
| `NEXT_PUBLIC_APP_URL` | **Yes** | Your deployed Vercel URL |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Optional | Live SMTP email delivery (Gmail App Password, SendGrid, Resend SMTP, etc.) |
| `GEMINI_API_KEY` | Optional | Enables live Gemini LLM synthesis inside NexAI Copilot (built-in live MongoDB query engine always works) |

> **MongoDB Atlas Network Access:** In Atlas → **Security → Network Access**, add `0.0.0.0/0` so Vercel Serverless Functions can connect to your cluster.
