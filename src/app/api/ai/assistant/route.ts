import { NextRequest, NextResponse } from "next/server";
import { getServerSession, resolveLiveSessionUser } from "@/lib/security/auth";
import { loadERPState } from "@/lib/db/repository";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(req.headers);
  const rate = await checkRateLimit(`ai:${session.userId}:${ip}`, 40, 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json({ error: "AI query rate limit exceeded." }, { status: 429 });
  }

  try {
    const state = await loadERPState();
    const liveUser = resolveLiveSessionUser(session, state);
    if (!liveUser) {
      return NextResponse.json({ error: "Session revoked or inactive." }, { status: 401 });
    }

    const { prompt } = (await req.json()) as { prompt: string };
    const cleanPrompt = String(prompt || "").trim().slice(0, 600);
    const q = cleanPrompt.toLowerCase();

    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    const curMonth = todayIso.slice(0, 7);
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = prevMonthDate.toISOString().slice(0, 7);

    const activeInvoices = state.invoices.filter(
      (i) => i.status !== "Cancelled" && i.status !== "Refunded"
    );

    const productRev = new Map<string, { name: string; sku: string; revenue: number; units: number; profit: number }>();
    for (const inv of activeInvoices) {
      for (const item of inv.items) {
        const existing = productRev.get(item.productId) || {
          name: item.productName,
          sku: item.sku,
          revenue: 0,
          units: 0,
          profit: 0,
        };
        existing.revenue += item.lineTotal;
        existing.units += item.quantity;
        existing.profit += item.lineTotal - item.costBasis * item.quantity;
        productRev.set(item.productId, existing);
      }
    }
    const rankedProducts = Array.from(productRev.values()).sort((a, b) => b.revenue - a.revenue);

    const overdueInvoices = activeInvoices
      .filter((i) => i.balanceDue > 0 && (i.status === "Overdue" || i.dueDate < todayIso))
      .map((i) => ({
        invoiceNo: i.invoiceNo,
        customer: state.customers.find((c) => c.id === i.customerId)?.companyName || "Unknown",
        dueDate: i.dueDate,
        balanceDue: i.balanceDue,
      }));

    const lowStock = state.products
      .map((p) => {
        const stock = state.inventoryLots
          .filter((l) => l.productId === p.id)
          .reduce((s, l) => s + l.availableStock, 0);
        return { name: p.name, sku: p.sku, stock, reorderLevel: p.reorderLevel, uom: p.uom };
      })
      .filter((x) => x.stock <= x.reorderLevel)
      .sort((a, b) => a.stock - b.stock);

    const customerTotals = state.customers
      .map((c) => {
        const billed = activeInvoices
          .filter((i) => i.customerId === c.id)
          .reduce((s, i) => s + i.total, 0);
        return { companyName: c.companyName, segment: c.segment, billed, balance: c.currentBalance };
      })
      .sort((a, b) => b.billed - a.billed);

    const curMonthSales = activeInvoices
      .filter((i) => i.issueDate.startsWith(curMonth))
      .reduce((s, i) => s + i.total, 0);
    const prevMonthSales = activeInvoices
      .filter((i) => i.issueDate.startsWith(prevMonth))
      .reduce((s, i) => s + i.total, 0);
    const deltaPct = prevMonthSales > 0 ? ((curMonthSales - prevMonthSales) / prevMonthSales) * 100 : null;
    const totalAR = activeInvoices.reduce((s, i) => s + i.balanceDue, 0);
    const totalExpenses = state.expenses.reduce((s, e) => s + e.amount, 0);

    let highlights: Array<{ label: string; value: string; tone: "blue" | "emerald" | "amber" | "rose" }> = [
      { label: `${curMonth} Revenue`, value: `$${curMonthSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, tone: "emerald" },
      { label: "Open AR", value: `$${totalAR.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, tone: "amber" },
      { label: "Low Stock SKUs", value: String(lowStock.length), tone: lowStock.length > 0 ? "rose" : "emerald" },
    ];

    // If GEMINI_API_KEY is configured in Vercel Env Vars, synthesize with live Gemini API using real DB snapshot!
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (geminiKey && cleanPrompt) {
      try {
        const dbSummary = JSON.stringify({
          company: state.settings.legalName,
          currentMonth: curMonth,
          currentMonthSales: curMonthSales,
          priorMonth: prevMonth,
          priorMonthSales: prevMonthSales,
          totalReceivables: totalAR,
          totalExpenses,
          topProducts: rankedProducts.slice(0, 7),
          overdueInvoices: overdueInvoices.slice(0, 10),
          lowStockProducts: lowStock.slice(0, 10),
          topCustomers: customerTotals.slice(0, 10),
          pendingApprovals: state.approvals.filter((a) => a.status === "Pending").length,
        });
        const gemRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `You are NexAI, the executive financial analyst for ${state.settings.legalName}. Answer concisely using ONLY this live MongoDB telemetry JSON (never invent numbers):\n${dbSummary}\n\nUser Question: ${cleanPrompt}`,
                    },
                  ],
                },
              ],
            }),
          }
        );
        if (gemRes.ok) {
          const gemJson = await gemRes.json();
          const llmText = gemJson?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (llmText) {
            return NextResponse.json({
              answer: llmText,
              highlights,
              engine: "Gemini Live + MongoDB",
              generatedAt: now.toISOString(),
            });
          }
        }
      } catch {
        // Fallback cleanly to deterministic real-time MongoDB engine below
      }
    }

    // Deterministic Real-Time MongoDB Analytical Engine (100% live data, zero fake numbers)
    let answer = "";
    if (q.includes("product") && (q.includes("highest") || q.includes("top") || q.includes("revenue"))) {
      answer =
        rankedProducts.length > 0
          ? `**Live Product Revenue Ranking (MongoDB):**\n\n` +
            rankedProducts
              .slice(0, 7)
              .map(
                (p, i) =>
                  `${i + 1}. **${p.name}** (${p.sku}) — **$${p.revenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}** (${p.units.toLocaleString()} units | Gross Profit: $${p.profit.toLocaleString(undefined, { maximumFractionDigits: 2 })})`
              )
              .join("\n")
          : "No invoiced product sales have been recorded yet. Create your first invoice under **Sales & US Invoicing** to populate live product rankings.";
      highlights = rankedProducts.slice(0, 3).map((p) => ({
        label: p.name,
        value: `$${p.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        tone: "emerald",
      }));
    } else if (q.includes("overdue") || q.includes("receivable") || q.includes("late")) {
      const totalOverdue = overdueInvoices.reduce((s, o) => s + o.balanceDue, 0);
      answer =
        overdueInvoices.length > 0
          ? `**${overdueInvoices.length} overdue invoices** totaling **$${totalOverdue.toLocaleString(undefined, { maximumFractionDigits: 2 })}**:\n\n` +
            overdueInvoices
              .map((o) => `- **${o.customer}** (${o.invoiceNo}) — **$${o.balanceDue.toLocaleString()}** due ${o.dueDate}`)
              .join("\n")
          : `There are currently **0 overdue invoices**. Total open Accounts Receivable is **$${totalAR.toLocaleString(undefined, { maximumFractionDigits: 2 })}**.`;
      highlights = [
        { label: "Overdue Invoices", value: String(overdueInvoices.length), tone: overdueInvoices.length > 0 ? "rose" : "emerald" },
        { label: "Overdue Amount", value: `$${totalOverdue.toLocaleString()}`, tone: "amber" },
        { label: "Total AR", value: `$${totalAR.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, tone: "blue" },
      ];
    } else if (q.includes("low") || q.includes("stock") || q.includes("reorder")) {
      answer =
        lowStock.length > 0
          ? `**${lowStock.length} products** are at or below their reorder level:\n\n` +
            lowStock.map((p) => `- **${p.name}** (${p.sku}): **${p.stock} ${p.uom}s** available (Reorder threshold: ${p.reorderLevel})`).join("\n")
          : "All active products are currently stocked above their reorder levels.";
      highlights = lowStock.slice(0, 3).map((p) => ({
        label: p.name,
        value: `${p.stock} / ${p.reorderLevel}`,
        tone: "rose",
      }));
    } else if (q.includes("top") && q.includes("customer")) {
      answer =
        customerTotals.length > 0
          ? `**Top Customers by Live Invoiced Volume:**\n\n` +
            customerTotals
              .slice(0, 10)
              .map(
                (c, i) =>
                  `${i + 1}. **${c.companyName}** [${c.segment}] — Invoiced: **$${c.billed.toLocaleString(undefined, { maximumFractionDigits: 2 })}** | Open Balance: $${c.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
              )
              .join("\n")
          : "No customers added yet. Add customers in **Customers & CRM** to track lifetime billing and ledger balances.";
    } else if (q.includes("compare") || q.includes("last month") || q.includes("decrease") || q.includes("why")) {
      answer =
        `**Live Month-over-Month Comparison (${curMonth} vs ${prevMonth}):**\n\n` +
        `- **${curMonth} Sales:** $${curMonthSales.toLocaleString(undefined, { maximumFractionDigits: 2 })}\n` +
        `- **${prevMonth} Sales:** $${prevMonthSales.toLocaleString(undefined, { maximumFractionDigits: 2 })}\n` +
        `- **Variance:** ${deltaPct === null ? "No prior-month baseline yet" : `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%`}\n\n` +
        `- Active Invoices: ${activeInvoices.length} | Overdue: ${overdueInvoices.length} | Low-Stock SKUs: ${lowStock.length}`;
    } else {
      answer =
        `**${state.settings.legalName} — Live MongoDB Executive Summary (${todayIso}):**\n\n` +
        `- **${curMonth} Revenue:** $${curMonthSales.toLocaleString(undefined, { maximumFractionDigits: 2 })}\n` +
        `- **Open Accounts Receivable:** $${totalAR.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${overdueInvoices.length} overdue)\n` +
        `- **Logged Operating Expenses:** $${totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 2 })}\n` +
        `- **Active Master Records:** ${state.products.length} Products · ${state.customers.length} Customers · ${state.suppliers.length} Suppliers · ${state.invoices.length} Invoices\n` +
        `- **Attention Items:** ${lowStock.length} low-stock SKU(s), ${state.approvals.filter((a) => a.status === "Pending").length} pending approval(s).`;
    }

    return NextResponse.json({
      answer,
      highlights,
      engine: "Live MongoDB Analytics Engine",
      generatedAt: now.toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI analysis error" },
      { status: 503 }
    );
  }
}
