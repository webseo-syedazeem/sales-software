import { NextRequest, NextResponse } from "next/server";
import {
  computeChecksum,
  getServerSession,
  hasPermission,
} from "@/lib/security/auth";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { hashPassword, validateStrongPassword } from "@/lib/security/password";
import {
  appendAudit,
  loadERPState,
  sanitizeStateForClient,
  saveERPState,
} from "@/lib/db/repository";
import type { ERPCollectionKey } from "@/lib/db/models";
import type {
  Account,
  ApprovalStage,
  Branch,
  CompanySettings,
  Customer,
  DocumentRecord,
  Employee,
  ERPDatabaseState,
  Expense,
  Invoice,
  JournalEntry,
  LedgerEntry,
  OrderLineItem,
  OrderStatus,
  Payment,
  PaymentMethod,
  PermissionKey,
  Product,
  PurchaseOrder,
  RoleName,
  SalesOrder,
  Supplier,
  TaxRule,
  Warehouse,
} from "@/types/erp";

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function recalcCustomerLedger(state: ERPDatabaseState, customerId: string): void {
  const entries = state.ledgerEntries
    .filter((e) => e.customerId === customerId)
    .sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  for (const entry of entries) {
    running = round2(running + Number(entry.debit || 0) - Number(entry.credit || 0));
    entry.runningBalance = running;
  }

  const customer = state.customers.find((c) => c.id === customerId);
  if (customer) {
    customer.currentBalance = running;
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const ip = getClientIp(req.headers);
  const rate = checkRateLimit(`action:${session.userId}:${ip}`, 180, 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded. Please slow down." }, { status: 429 });
  }

  const device = req.headers.get("user-agent")?.slice(0, 64) || "Web Client";

  try {
    const body = (await req.json()) as { action: string; payload?: Record<string, unknown> };
    const { action, payload = {} } = body;

    const requirePerm = (perm: PermissionKey) => {
      if (!hasPermission(session, perm)) {
        throw new Error(`FORBIDDEN: Your role (${session.role}) lacks '${perm}' permission.`);
      }
    };

    const state = await loadERPState();
    const changed = new Set<ERPCollectionKey | "settings">(["auditLogs"]);
    let message = "Action completed successfully.";
    let extraData: Record<string, unknown> = {};

    const today = new Date().toISOString().slice(0, 10);

    switch (action) {
      case "product:save": {
        requirePerm(payload.id ? "edit" : "create");
        const p = payload as Partial<Product>;
        const existingIdx = p.id ? state.products.findIndex((x) => x.id === p.id) : -1;
        const now = new Date().toISOString();
        if (existingIdx >= 0) {
          const prev = state.products[existingIdx];
          const updated: Product = {
            ...prev,
            ...p,
            purchasePrice: Number(p.purchasePrice ?? prev.purchasePrice),
            sellingPrice: Number(p.sellingPrice ?? prev.sellingPrice),
            wholesalePrice: Number(p.wholesalePrice ?? prev.wholesalePrice),
            minSellingPrice: Number(p.minSellingPrice ?? prev.minSellingPrice),
            minStockLevel: Number(p.minStockLevel ?? prev.minStockLevel),
            maxStockLevel: Number(p.maxStockLevel ?? prev.maxStockLevel),
            reorderLevel: Number(p.reorderLevel ?? prev.reorderLevel),
            updatedAt: now,
          };
          state.products[existingIdx] = updated;
          appendAudit(state, {
            actorName: session.name,
            actorRole: session.role,
            action: "UPDATE",
            module: "Products",
            recordId: updated.sku,
            summary: `Updated product ${updated.name} (${updated.sku})`,
            previousValue: `$${prev.sellingPrice} / ${prev.status}`,
            newValue: `$${updated.sellingPrice} / ${updated.status}`,
            ipAddress: ip,
            device,
          });
          message = `Product ${updated.name} updated.`;
        } else {
          const newId = uid("prod");
          const sku = (p.sku || `SKU-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase();
          const selling = Number(p.sellingPrice || 50);
          const created: Product = {
            id: newId,
            sku,
            name: String(p.name || "New Product"),
            category: String(p.category || "General Industrial"),
            description: String(p.description || ""),
            specifications: (p.specifications as Record<string, string>) || { Grade: "Commercial US" },
            uom: String(p.uom || "Unit"),
            purchasePrice: Number(p.purchasePrice || 25),
            sellingPrice: selling,
            wholesalePrice: Number(p.wholesalePrice || round2(selling * 0.85)),
            minSellingPrice: Number(p.minSellingPrice || round2(selling * 0.75)),
            taxable: p.taxable !== false,
            taxCategory: String(p.taxCategory || "Standard Tangible Goods"),
            status: (p.status as "Active" | "Inactive") || "Active",
            barcode: String(p.barcode || `8901000${Math.floor(100000 + Math.random() * 899999)}`),
            qrCode: `APEX:${sku}:${String(p.name || "ITEM").toUpperCase().replace(/\s+/g, "-")}`,
            variants: p.variants || [],
            attributes: p.attributes || ["Commercial Grade"],
            pricingLevels: p.pricingLevels || [
              { tier: "Retail", price: selling, minQty: 1 },
              { tier: "Wholesale", price: Number(p.wholesalePrice || round2(selling * 0.85)), minQty: 25 },
              { tier: "Distributor", price: round2(selling * 0.8), minQty: 100 },
              { tier: "Enterprise VIP", price: Number(p.minSellingPrice || round2(selling * 0.75)), minQty: 250 },
            ],
            minStockLevel: Number(p.minStockLevel || 50),
            maxStockLevel: Number(p.maxStockLevel || 1000),
            reorderLevel: Number(p.reorderLevel || 100),
            createdAt: now,
            updatedAt: now,
          };
          state.products.unshift(created);
          const openingQty = Number((payload as Record<string, unknown>).openingStock || 0);
          if (openingQty > 0) {
            const defaultWh = state.warehouses[0]?.id || "wh-ny";
            state.inventoryLots.unshift({
              id: uid("lot"),
              productId: created.id,
              warehouseId: defaultWh,
              batchNo: `BCH-${sku.slice(-3)}-${today.replace(/-/g, "").slice(2, 6)}`,
              lotNo: `LOT-${Math.floor(100 + Math.random() * 900)}A`,
              serialPrefix: `${sku.slice(-3)}-`,
              openingStock: openingQty,
              availableStock: openingQty,
              reservedStock: 0,
              damagedStock: 0,
              returnedStock: 0,
              unitCost: created.purchasePrice,
              receivedDate: today,
            });
            state.stockMovements.unshift({
              id: uid("mov"),
              date: now,
              productId: created.id,
              warehouseId: defaultWh,
              type: "Opening",
              quantity: openingQty,
              previousQty: 0,
              newQty: openingQty,
              unitCost: created.purchasePrice,
              referenceNo: `OPN-${sku}`,
              notes: "Initial product opening stock",
              performedBy: session.name,
            });
            changed.add("inventoryLots");
            changed.add("stockMovements");
          }
          appendAudit(state, {
            actorName: session.name,
            actorRole: session.role,
            action: "CREATE",
            module: "Products",
            recordId: created.sku,
            summary: `Created product ${created.name} (${created.sku})`,
            newValue: JSON.stringify({ sku: created.sku, sellingPrice: created.sellingPrice }),
            ipAddress: ip,
            device,
          });
          message = `Product ${created.name} created.`;
        }
        changed.add("products");
        break;
      }

      case "product:delete": {
        requirePerm("delete");
        const id = String(payload.id);
        const prod = state.products.find((p) => p.id === id);
        if (prod) {
          state.products = state.products.filter((p) => p.id !== id);
          appendAudit(state, {
            actorName: session.name,
            actorRole: session.role,
            action: "DELETE",
            module: "Products",
            recordId: prod.sku,
            summary: `Deleted product ${prod.name} (${prod.sku})`,
            previousValue: prod.name,
            ipAddress: ip,
            device,
          });
          changed.add("products");
          message = `Product ${prod.name} removed.`;
        }
        break;
      }

      case "inventory:adjust": {
        requirePerm("edit");
        const { productId, warehouseId, type, quantity, notes, batchNo } = payload as {
          productId: string;
          warehouseId: string;
          type: "Stock In" | "Stock Out" | "Adjustment" | "Damaged" | "Returned" | "Audit";
          quantity: number;
          notes: string;
          batchNo?: string;
        };
        const qty = Number(quantity || 0);
        const product = state.products.find((p) => p.id === productId);
        if (!product) throw new Error("Product not found");

        let lot = state.inventoryLots.find(
          (l) => l.productId === productId && l.warehouseId === warehouseId
        );
        if (!lot) {
          lot = {
            id: uid("lot"),
            productId,
            warehouseId,
            batchNo: batchNo || `BCH-${today.replace(/-/g, "").slice(2, 6)}`,
            lotNo: `LOT-${Math.floor(100 + Math.random() * 900)}`,
            serialPrefix: `${product.sku.slice(-3)}-`,
            openingStock: 0,
            availableStock: 0,
            reservedStock: 0,
            damagedStock: 0,
            returnedStock: 0,
            unitCost: product.purchasePrice,
            receivedDate: today,
          };
          state.inventoryLots.unshift(lot);
        }

        const prevQty = lot.availableStock;
        if (type === "Stock In") {
          lot.availableStock += Math.abs(qty);
        } else if (type === "Stock Out") {
          lot.availableStock = Math.max(0, lot.availableStock - Math.abs(qty));
        } else if (type === "Damaged") {
          const dmg = Math.min(lot.availableStock, Math.abs(qty));
          lot.availableStock -= dmg;
          lot.damagedStock += dmg;
        } else if (type === "Returned") {
          lot.returnedStock += Math.abs(qty);
          lot.availableStock += Math.abs(qty);
        } else {
          // Adjustment / Audit sets delta
          lot.availableStock = Math.max(0, lot.availableStock + qty);
        }

        state.stockMovements.unshift({
          id: uid("mov"),
          date: new Date().toISOString(),
          productId,
          warehouseId,
          type,
          quantity: qty,
          previousQty: prevQty,
          newQty: lot.availableStock,
          unitCost: product.purchasePrice,
          referenceNo: `ADJ-${Date.now().toString().slice(-5)}`,
          batchNo: lot.batchNo,
          notes: notes || `${type} processed`,
          performedBy: session.name,
        });

        const totalStock = state.inventoryLots
          .filter((l) => l.productId === productId)
          .reduce((s, l) => s + l.availableStock, 0);
        if (totalStock < product.reorderLevel) {
          state.notifications.unshift({
            id: uid("not"),
            title: `Low Stock Alert: ${product.name}`,
            message: `Available stock (${totalStock} ${product.uom}s) is below reorder level (${product.reorderLevel}).`,
            category: "Low Stock",
            severity: "warning",
            read: false,
            createdAt: new Date().toISOString(),
            actionModule: "inventory",
          });
          changed.add("notifications");
        }

        appendAudit(state, {
          actorName: session.name,
          actorRole: session.role,
          action: "UPDATE",
          module: "Inventory",
          recordId: product.sku,
          summary: `${type} of ${qty} units for ${product.name}`,
          previousValue: String(prevQty),
          newValue: String(lot.availableStock),
          ipAddress: ip,
          device,
        });

        changed.add("inventoryLots");
        changed.add("stockMovements");
        message = `Inventory ${type} recorded for ${product.name}.`;
        break;
      }

      case "inventory:transfer": {
        requirePerm("edit");
        const { productId, fromWarehouseId, toWarehouseId, quantity, notes } = payload as {
          productId: string;
          fromWarehouseId: string;
          toWarehouseId: string;
          quantity: number;
          notes: string;
        };
        const qty = Math.abs(Number(quantity || 0));
        if (fromWarehouseId === toWarehouseId) throw new Error("Source and destination warehouses must differ.");
        const product = state.products.find((p) => p.id === productId);
        const fromLot = state.inventoryLots.find(
          (l) => l.productId === productId && l.warehouseId === fromWarehouseId
        );
        if (!product || !fromLot || fromLot.availableStock < qty) {
          throw new Error("Insufficient available stock in source warehouse.");
        }

        const prevFrom = fromLot.availableStock;
        fromLot.availableStock -= qty;

        let toLot = state.inventoryLots.find(
          (l) => l.productId === productId && l.warehouseId === toWarehouseId
        );
        if (!toLot) {
          toLot = {
            id: uid("lot"),
            productId,
            warehouseId: toWarehouseId,
            batchNo: fromLot.batchNo,
            lotNo: fromLot.lotNo,
            serialPrefix: fromLot.serialPrefix,
            openingStock: 0,
            availableStock: 0,
            reservedStock: 0,
            damagedStock: 0,
            returnedStock: 0,
            unitCost: fromLot.unitCost,
            receivedDate: today,
          };
          state.inventoryLots.unshift(toLot);
        }
        toLot.availableStock += qty;

        state.stockMovements.unshift({
          id: uid("mov"),
          date: new Date().toISOString(),
          productId,
          warehouseId: fromWarehouseId,
          toWarehouseId,
          type: "Transfer",
          quantity: qty,
          previousQty: prevFrom,
          newQty: fromLot.availableStock,
          unitCost: product.purchasePrice,
          referenceNo: `TRF-${Date.now().toString().slice(-5)}`,
          batchNo: fromLot.batchNo,
          notes: notes || "Inter-warehouse transfer",
          performedBy: session.name,
        });

        appendAudit(state, {
          actorName: session.name,
          actorRole: session.role,
          action: "UPDATE",
          module: "Inventory",
          recordId: product.sku,
          summary: `Transferred ${qty} ${product.name} (${fromWarehouseId} → ${toWarehouseId})`,
          previousValue: String(prevFrom),
          newValue: String(fromLot.availableStock),
          ipAddress: ip,
          device,
        });

        changed.add("inventoryLots");
        changed.add("stockMovements");
        message = `Transferred ${qty} units of ${product.name}.`;
        break;
      }

      case "customer:save": {
        requirePerm(payload.id ? "edit" : "create");
        const c = payload as Partial<Customer>;
        const idx = c.id ? state.customers.findIndex((x) => x.id === c.id) : -1;
        if (idx >= 0) {
          const prev = state.customers[idx];
          state.customers[idx] = {
            ...prev,
            ...c,
            creditLimit: Number(c.creditLimit ?? prev.creditLimit),
          };
          appendAudit(state, {
            actorName: session.name,
            actorRole: session.role,
            action: "UPDATE",
            module: "Customers",
            recordId: prev.customerCode,
            summary: `Updated customer profile ${state.customers[idx].companyName}`,
            ipAddress: ip,
            device,
          });
          message = `Customer ${state.customers[idx].companyName} updated.`;
        } else {
          const opening = Number(c.openingBalance || 0);
          const newCust: Customer = {
            id: uid("cust"),
            customerCode: c.customerCode || `CUS-${1001 + state.customers.length}`,
            companyName: String(c.companyName || "New Enterprise Client"),
            contactPerson: String(c.contactPerson || ""),
            phone: String(c.phone || ""),
            email: String(c.email || ""),
            billingAddress: String(c.billingAddress || ""),
            shippingAddress: String(c.shippingAddress || c.billingAddress || ""),
            state: String(c.state || "NY"),
            customerType: (c.customerType as Customer["customerType"]) || "B2B Enterprise",
            category: String(c.category || "Commercial"),
            segment: (c.segment as Customer["segment"]) || "Standard",
            taxId: String(c.taxId || ""),
            taxExempt: Boolean(c.taxExempt),
            paymentTerms: (c.paymentTerms as Customer["paymentTerms"]) || "Net 30",
            creditLimit: Number(c.creditLimit || 25000),
            openingBalance: opening,
            currentBalance: opening,
            notes: String(c.notes || ""),
            branchId: String(c.branchId || session.branchId || "br-ny"),
            salesRepId: String(c.salesRepId || state.employees[0]?.id || "emp-1"),
            tasks: [],
            communications: [],
            createdAt: new Date().toISOString(),
          };
          state.customers.unshift(newCust);
          if (opening !== 0) {
            state.ledgerEntries.push({
              id: uid("led"),
              customerId: newCust.id,
              date: today,
              type: "Opening",
              referenceNo: `OPN-${newCust.customerCode}`,
              description: "Opening Account Balance",
              debit: opening > 0 ? opening : 0,
              credit: opening < 0 ? Math.abs(opening) : 0,
              runningBalance: opening,
              branchId: newCust.branchId,
            });
            changed.add("ledgerEntries");
          }
          appendAudit(state, {
            actorName: session.name,
            actorRole: session.role,
            action: "CREATE",
            module: "Customers",
            recordId: newCust.customerCode,
            summary: `Created customer ${newCust.companyName} (Credit Limit $${newCust.creditLimit.toLocaleString()})`,
            ipAddress: ip,
            device,
          });
          message = `Customer ${newCust.companyName} added.`;
        }
        changed.add("customers");
        break;
      }

      case "customer:task": {
        requirePerm("create");
        const { customerId, title, dueDate, priority, type } = payload as {
          customerId: string;
          title: string;
          dueDate: string;
          priority: "High" | "Medium" | "Low";
          type: "Follow-up" | "Payment Reminder" | "Call" | "Meeting";
        };
        const customer = state.customers.find((c) => c.id === customerId);
        if (!customer) throw new Error("Customer not found");
        customer.tasks.unshift({
          id: uid("task"),
          title,
          dueDate: dueDate || today,
          priority: priority || "Medium",
          status: "Open",
          assignedTo: session.name,
          type: type || "Follow-up",
        });
        changed.add("customers");
        message = "CRM reminder added.";
        break;
      }

      case "customer:note": {
        requirePerm("create");
        const { customerId, channel, summary } = payload as {
          customerId: string;
          channel: "Phone" | "Email" | "In-Person" | "SMS" | "Note";
          summary: string;
        };
        const customer = state.customers.find((c) => c.id === customerId);
        if (!customer) throw new Error("Customer not found");
        customer.communications.unshift({
          id: uid("comm"),
          date: today,
          author: session.name,
          channel: channel || "Note",
          summary,
        });
        changed.add("customers");
        message = "Customer communication logged.";
        break;
      }

      case "sales:create": {
        requirePerm("create");
        const {
          customerId,
          branchId,
          warehouseId,
          salesRepId,
          items,
          notes,
          generateInvoice = true,
          status = "Confirmed",
        } = payload as {
          customerId: string;
          branchId: string;
          warehouseId: string;
          salesRepId: string;
          items: Array<{
            productId: string;
            quantity: number;
            unitPrice: number;
            discountPercent: number;
          }>;
          notes?: string;
          generateInvoice?: boolean;
          status?: OrderStatus;
        };

        const customer = state.customers.find((c) => c.id === customerId);
        if (!customer) throw new Error("Please select a valid customer.");
        if (!items || items.length === 0) throw new Error("Add at least one line item.");

        const taxRule = state.taxRules.find((t) => t.stateCode === customer.state && t.active);
        const effectiveTaxRate = customer.taxExempt
          ? 0
          : round2((taxRule?.rate || 0) + (taxRule?.localSurtax || 0));

        let subtotal = 0;
        let discountTotal = 0;
        let taxableBase = 0;
        const lineItems: OrderLineItem[] = [];

        for (const item of items) {
          const prod = state.products.find((p) => p.id === item.productId);
          if (!prod) continue;
          const qty = Math.max(1, Number(item.quantity));
          const unitPrice = Number(item.unitPrice || prod.sellingPrice);
          const discPct = Math.min(100, Math.max(0, Number(item.discountPercent || 0)));
          const gross = qty * unitPrice;
          const disc = round2(gross * (discPct / 100));
          const lineTotal = round2(gross - disc);
          subtotal = round2(subtotal + gross);
          discountTotal = round2(discountTotal + disc);
          if (prod.taxable) taxableBase = round2(taxableBase + lineTotal);

          lineItems.push({
            productId: prod.id,
            sku: prod.sku,
            productName: prod.name,
            uom: prod.uom,
            quantity: qty,
            unitPrice,
            discountPercent: discPct,
            taxable: prod.taxable,
            lineTotal,
            costBasis: prod.purchasePrice,
          });
        }

        const taxTotal = round2(taxableBase * (effectiveTaxRate / 100));
        const grandTotal = round2(subtotal - discountTotal + taxTotal);

        const orderSeq = String(state.salesOrders.length + 101).padStart(4, "0");
        const orderNo = `${state.settings.orderPrefix}${orderSeq}`;
        const orderId = uid("so");

        const newOrder: SalesOrder = {
          id: orderId,
          orderNo,
          date: today,
          customerId,
          branchId: branchId || customer.branchId,
          warehouseId: warehouseId || state.warehouses[0]?.id || "wh-ny",
          salesRepId: salesRepId || customer.salesRepId,
          items: lineItems,
          subtotal,
          discountTotal,
          taxRate: effectiveTaxRate,
          taxTotal,
          grandTotal,
          status,
          paymentStatus: "Unpaid",
          notes: notes || "",
          createdBy: session.name,
        };

        // Deduct inventory
        for (const li of lineItems) {
          const lot =
            state.inventoryLots.find(
              (l) => l.productId === li.productId && l.warehouseId === newOrder.warehouseId
            ) || state.inventoryLots.find((l) => l.productId === li.productId);

          if (lot) {
            const prev = lot.availableStock;
            lot.availableStock = Math.max(0, lot.availableStock - li.quantity);
            state.stockMovements.unshift({
              id: uid("mov"),
              date: new Date().toISOString(),
              productId: li.productId,
              warehouseId: lot.warehouseId,
              type: "Stock Out",
              quantity: li.quantity,
              previousQty: prev,
              newQty: lot.availableStock,
              unitCost: li.costBasis,
              referenceNo: orderNo,
              batchNo: lot.batchNo,
              notes: `Sales order fulfillment — ${customer.companyName}`,
              performedBy: session.name,
            });
          }
        }
        changed.add("inventoryLots");
        changed.add("stockMovements");

        // Credit limit check notification
        if (customer.currentBalance + grandTotal > customer.creditLimit) {
          state.notifications.unshift({
            id: uid("not"),
            title: `Credit Limit Exceeded: ${customer.companyName}`,
            message: `New order ${orderNo} ($${grandTotal.toLocaleString()}) pushes balance above $${customer.creditLimit.toLocaleString()} limit.`,
            category: "Credit Limit",
            severity: "critical",
            read: false,
            createdAt: new Date().toISOString(),
            actionModule: "customers",
          });
          changed.add("notifications");
        }

        if (generateInvoice) {
          const invSeq = String(state.invoices.length + 105).padStart(4, "0");
          const invoiceNo = `${state.settings.invoicePrefix}${invSeq}`;
          const daysToAdd =
            customer.paymentTerms === "Net 15"
              ? 15
              : customer.paymentTerms === "Net 45"
                ? 45
                : customer.paymentTerms === "Net 60"
                  ? 60
                  : customer.paymentTerms === "Due on Receipt"
                    ? 0
                    : 30;
          const due = new Date(Date.now() + daysToAdd * 86400000).toISOString().slice(0, 10);

          const inv: Invoice = {
            id: uid("inv"),
            invoiceNo,
            orderId,
            customerId,
            branchId: newOrder.branchId,
            salesRepId: newOrder.salesRepId,
            issueDate: today,
            dueDate: due,
            paymentTerms: customer.paymentTerms,
            billingAddress: customer.billingAddress,
            shippingAddress: customer.shippingAddress,
            items: lineItems,
            subtotal,
            discountTotal,
            taxState: customer.state,
            taxRate: effectiveTaxRate,
            taxTotal,
            total: grandTotal,
            amountPaid: 0,
            balanceDue: grandTotal,
            status: "Sent",
            notes: notes || `Generated from ${orderNo}`,
            termsAndConditions: `${customer.paymentTerms}. Remit in USD to ${state.settings.legalName}.`,
          };
          newOrder.invoiceId = inv.id;
          state.invoices.unshift(inv);

          // Append Customer Ledger Debit
          state.ledgerEntries.push({
            id: uid("led"),
            customerId,
            date: today,
            type: "Sale",
            referenceNo: invoiceNo,
            description: `Sales Invoice — ${lineItems.map((i) => `${i.productName} (${i.quantity})`).join(", ")}`,
            debit: grandTotal,
            credit: 0,
            runningBalance: 0,
            branchId: newOrder.branchId,
          });
          recalcCustomerLedger(state, customerId);

          // Post GL Journal Entry & update Accounts
          const je: JournalEntry = {
            id: uid("je"),
            entryNo: `JE-2026-${String(state.journalEntries.length + 302).padStart(4, "0")}`,
            date: today,
            description: `Sales revenue recognition — ${invoiceNo} (${customer.companyName})`,
            reference: invoiceNo,
            period: today.slice(0, 7),
            lines: [
              { accountId: "acc-1200", accountCode: "1200", accountName: "Accounts Receivable (Trade)", debit: grandTotal, credit: 0 },
              { accountId: "acc-4000", accountCode: "4000", accountName: "Product Sales Revenue", debit: 0, credit: round2(subtotal - discountTotal) },
              ...(taxTotal > 0
                ? [{ accountId: "acc-2100", accountCode: "2100", accountName: "US State Sales Tax Payable", debit: 0, credit: taxTotal }]
                : []),
            ],
            status: "Posted",
            createdBy: session.name,
          };
          state.journalEntries.unshift(je);

          const arAcc = state.accounts.find((a) => a.code === "1200");
          const revAcc = state.accounts.find((a) => a.code === "4000");
          const taxAcc = state.accounts.find((a) => a.code === "2100");
          if (arAcc) arAcc.balance = round2(arAcc.balance + grandTotal);
          if (revAcc) revAcc.balance = round2(revAcc.balance + round2(subtotal - discountTotal));
          if (taxAcc) taxAcc.balance = round2(taxAcc.balance + taxTotal);

          // Update Sales Rep Commission
          const rep = state.employees.find((e) => e.id === newOrder.salesRepId);
          if (rep && rep.isSalesRep) {
            rep.monthlySales = round2(rep.monthlySales + grandTotal);
            const comm =
              rep.commissionType === "Fixed"
                ? rep.commissionRate
                : round2(grandTotal * (rep.commissionRate / 100));
            rep.commissionEarned = round2(rep.commissionEarned + comm);
            changed.add("employees");
          }

          changed.add("invoices");
          changed.add("ledgerEntries");
          changed.add("customers");
          changed.add("journalEntries");
          changed.add("accounts");
          extraData = { order: newOrder, invoice: inv };
        }

        state.salesOrders.unshift(newOrder);
        state.notifications.unshift({
          id: uid("not"),
          title: `New Sales Order: ${orderNo}`,
          message: `${customer.companyName} — $${grandTotal.toLocaleString()} (${lineItems.length} items).`,
          category: "New Order",
          severity: "success",
          read: false,
          createdAt: new Date().toISOString(),
          actionModule: "sales",
        });

        appendAudit(state, {
          actorName: session.name,
          actorRole: session.role,
          action: "CREATE",
          module: "Sales & Invoicing",
          recordId: orderNo,
          summary: `Created sales order ${orderNo} for ${customer.companyName} ($${grandTotal.toLocaleString()})`,
          newValue: JSON.stringify({ orderNo, grandTotal, items: lineItems.length }),
          ipAddress: ip,
          device,
        });

        changed.add("salesOrders");
        changed.add("notifications");
        message = generateInvoice
          ? `Sales Order ${orderNo} & US Invoice generated successfully.`
          : `Sales Order ${orderNo} created.`;
        break;
      }

      case "sales:status": {
        requirePerm("edit");
        const { orderId, status } = payload as { orderId: string; status: OrderStatus };
        const order = state.salesOrders.find((o) => o.id === orderId);
        if (!order) throw new Error("Sales order not found");
        const prev = order.status;
        order.status = status;

        if (status === "Returned" || status === "Cancelled") {
          // Restock items if cancelled/returned
          for (const li of order.items) {
            const lot = state.inventoryLots.find(
              (l) => l.productId === li.productId && l.warehouseId === order.warehouseId
            );
            if (lot) {
              lot.availableStock += li.quantity;
              if (status === "Returned") lot.returnedStock += li.quantity;
            }
          }
          // Credit ledger if invoiced
          if (order.invoiceId) {
            const inv = state.invoices.find((i) => i.id === order.invoiceId);
            if (inv && inv.status !== "Cancelled" && inv.status !== "Credited") {
              inv.status = status === "Returned" ? "Credited" : "Cancelled";
              inv.balanceDue = 0;
              state.ledgerEntries.push({
                id: uid("led"),
                customerId: order.customerId,
                date: today,
                type: status === "Returned" ? "Return" : "Credit Note",
                referenceNo: `CN-${inv.invoiceNo}`,
                description: `${status} reversal for ${order.orderNo}`,
                debit: 0,
                credit: inv.total,
                runningBalance: 0,
                branchId: order.branchId,
              });
              recalcCustomerLedger(state, order.customerId);
              changed.add("invoices");
              changed.add("ledgerEntries");
              changed.add("customers");
            }
          }
          changed.add("inventoryLots");
        }

        appendAudit(state, {
          actorName: session.name,
          actorRole: session.role,
          action: "UPDATE",
          module: "Sales",
          recordId: order.orderNo,
          summary: `Order ${order.orderNo} status changed: ${prev} → ${status}`,
          previousValue: prev,
          newValue: status,
          ipAddress: ip,
          device,
        });
        changed.add("salesOrders");
        message = `Order ${order.orderNo} updated to ${status}.`;
        break;
      }

      case "invoice:action": {
        const { invoiceId, op, emailTo, note } = payload as {
          invoiceId: string;
          op: "duplicate" | "cancel" | "refund" | "credit_note" | "email" | "reminder" | "collection_note";
          emailTo?: string;
          note?: string;
        };
        const inv = state.invoices.find((i) => i.id === invoiceId);
        if (!inv) throw new Error("Invoice not found");
        const cust = state.customers.find((c) => c.id === inv.customerId);

        if (op === "refund" || op === "credit_note") requirePerm("refund");
        else if (op === "cancel" || op === "duplicate") requirePerm("edit");

        if (op === "duplicate") {
          const dupNo = `${state.settings.invoicePrefix}${String(state.invoices.length + 106).padStart(4, "0")}`;
          const copy: Invoice = {
            ...inv,
            id: uid("inv"),
            invoiceNo: dupNo,
            issueDate: today,
            amountPaid: 0,
            balanceDue: inv.total,
            status: "Draft",
          };
          state.invoices.unshift(copy);
          changed.add("invoices");
          message = `Duplicated invoice as ${dupNo} (Draft).`;
        } else if (op === "cancel") {
          inv.status = "Cancelled";
          inv.balanceDue = 0;
          changed.add("invoices");
          message = `Invoice ${inv.invoiceNo} cancelled.`;
        } else if (op === "refund" || op === "credit_note") {
          const creditAmt = inv.total;
          inv.status = op === "refund" ? "Refunded" : "Credited";
          inv.balanceDue = 0;
          state.ledgerEntries.push({
            id: uid("led"),
            customerId: inv.customerId,
            date: today,
            type: "Credit Note",
            referenceNo: `CN-${inv.invoiceNo}`,
            description:
              op === "refund"
                ? `Invoice Refund issued for ${inv.invoiceNo}`
                : `Credit Note issued against ${inv.invoiceNo}`,
            debit: 0,
            credit: creditAmt,
            runningBalance: 0,
            branchId: inv.branchId,
          });
          recalcCustomerLedger(state, inv.customerId);
          changed.add("invoices");
          changed.add("ledgerEntries");
          changed.add("customers");
          message = `${op === "refund" ? "Refund" : "Credit Note"} posted for ${inv.invoiceNo}.`;
        } else if (op === "email" || op === "reminder") {
          const recipient = emailTo || cust?.email || "billing@client.com";
          state.emailLogs.unshift({
            id: uid("em"),
            sentAt: new Date().toISOString(),
            to: recipient,
            subject:
              op === "reminder"
                ? `Payment Reminder: Invoice ${inv.invoiceNo} ($${inv.balanceDue.toLocaleString()} Due)`
                : `Invoice ${inv.invoiceNo} from ${state.settings.legalName}`,
            template: op === "reminder" ? "Overdue Reminder" : "Invoice",
            referenceNo: inv.invoiceNo,
            status: process.env.SMTP_HOST ? "Delivered" : "Queued (SMTP Mock)",
          });
          if (op === "reminder") inv.lastReminderSentAt = new Date().toISOString();
          changed.add("emailLogs");
          changed.add("invoices");
          message = `${op === "reminder" ? "Payment reminder" : "Invoice"} dispatched to ${recipient}.`;
        } else if (op === "collection_note") {
          inv.collectionNotes = note || "";
          changed.add("invoices");
          message = "Collection note saved.";
        }

        appendAudit(state, {
          actorName: session.name,
          actorRole: session.role,
          action: "UPDATE",
          module: "Invoices",
          recordId: inv.invoiceNo,
          summary: `Invoice action '${op}' executed on ${inv.invoiceNo}`,
          ipAddress: ip,
          device,
        });
        break;
      }

      case "payment:record": {
        requirePerm("create");
        const {
          customerId,
          invoiceId,
          amount,
          method,
          paymentType = "Standard",
          reference,
          notes,
          date,
        } = payload as {
          customerId: string;
          invoiceId?: string;
          amount: number;
          method: PaymentMethod;
          paymentType?: Payment["paymentType"];
          reference?: string;
          notes?: string;
          date?: string;
        };

        const amt = round2(Number(amount || 0));
        if (amt <= 0) throw new Error("Payment amount must be greater than zero.");
        const customer = state.customers.find((c) => c.id === customerId);
        if (!customer) throw new Error("Customer not found.");

        const receiptNo = `${state.settings.receiptPrefix}${String(state.payments.length + 43).padStart(4, "0")}`;
        const allocations: Payment["allocations"] = [];

        if (invoiceId) {
          const inv = state.invoices.find((i) => i.id === invoiceId);
          if (inv) {
            const allocAmt = Math.min(amt, inv.balanceDue);
            if (paymentType === "Refund" || paymentType === "Reversal") {
              inv.amountPaid = round2(Math.max(0, inv.amountPaid - amt));
              inv.balanceDue = round2(inv.total - inv.amountPaid);
              inv.status = inv.amountPaid <= 0 ? "Refunded" : "Partial";
            } else {
              inv.amountPaid = round2(inv.amountPaid + allocAmt);
              inv.balanceDue = round2(Math.max(0, inv.total - inv.amountPaid));
              inv.status = inv.balanceDue <= 0 ? "Paid" : "Partial";
            }
            allocations.push({ invoiceId: inv.id, invoiceNo: inv.invoiceNo, amount: allocAmt });
            changed.add("invoices");

            if (inv.orderId) {
              const so = state.salesOrders.find((o) => o.id === inv.orderId);
              if (so) {
                so.paymentStatus = inv.balanceDue <= 0 ? "Paid" : "Partial";
                changed.add("salesOrders");
              }
            }
          }
        }

        const payment: Payment = {
          id: uid("pay"),
          receiptNo,
          date: date || today,
          customerId,
          branchId: customer.branchId,
          method: method || "Bank Transfer (ACH)",
          paymentType,
          amount: amt,
          reference: reference || `REF-${Date.now().toString().slice(-6)}`,
          allocations,
          reconciled: method === "Cash" || method === "Credit Card",
          notes: notes || "",
          recordedBy: session.name,
        };
        state.payments.unshift(payment);

        const isReversal = paymentType === "Refund" || paymentType === "Reversal";
        const ledgerEntry: LedgerEntry = {
          id: uid("led"),
          customerId,
          date: payment.date,
          type: isReversal ? "Adjustment" : "Payment",
          referenceNo: receiptNo,
          description: isReversal
            ? `${paymentType} via ${payment.method} (${payment.reference})`
            : `Payment received via ${payment.method}${allocations[0] ? ` — ${allocations[0].invoiceNo}` : ""}`,
          debit: isReversal ? amt : 0,
          credit: isReversal ? 0 : amt,
          runningBalance: 0,
          branchId: customer.branchId,
        };
        state.ledgerEntries.push(ledgerEntry);
        recalcCustomerLedger(state, customerId);

        // Update Accounting & GL
        const cashCode = method === "Cash" ? "1000" : "1010";
        const cashAcc = state.accounts.find((a) => a.code === cashCode);
        const arAcc = state.accounts.find((a) => a.code === "1200");
        if (cashAcc && arAcc) {
          if (isReversal) {
            cashAcc.balance = round2(cashAcc.balance - amt);
            arAcc.balance = round2(arAcc.balance + amt);
          } else {
            cashAcc.balance = round2(cashAcc.balance + amt);
            arAcc.balance = round2(arAcc.balance - amt);
          }
          state.journalEntries.unshift({
            id: uid("je"),
            entryNo: `JE-2026-${String(state.journalEntries.length + 302).padStart(4, "0")}`,
            date: payment.date,
            description: `${isReversal ? "Payment Reversal" : "Customer Payment"} — ${receiptNo} (${customer.companyName})`,
            reference: receiptNo,
            period: payment.date.slice(0, 7),
            lines: isReversal
              ? [
                  { accountId: arAcc.id, accountCode: arAcc.code, accountName: arAcc.name, debit: amt, credit: 0 },
                  { accountId: cashAcc.id, accountCode: cashAcc.code, accountName: cashAcc.name, debit: 0, credit: amt },
                ]
              : [
                  { accountId: cashAcc.id, accountCode: cashAcc.code, accountName: cashAcc.name, debit: amt, credit: 0 },
                  { accountId: arAcc.id, accountCode: arAcc.code, accountName: arAcc.name, debit: 0, credit: amt },
                ],
            status: "Posted",
            createdBy: session.name,
          });
          changed.add("accounts");
          changed.add("journalEntries");
        }

        state.notifications.unshift({
          id: uid("not"),
          title: `Payment Recorded: ${receiptNo}`,
          message: `$${amt.toLocaleString()} (${method}) for ${customer.companyName}.`,
          category: "Payment Received",
          severity: "success",
          read: false,
          createdAt: new Date().toISOString(),
          actionModule: "payments",
        });

        appendAudit(state, {
          actorName: session.name,
          actorRole: session.role,
          action: "CREATE",
          module: "Payments",
          recordId: receiptNo,
          summary: `Recorded ${paymentType} payment ${receiptNo} of $${amt.toLocaleString()} for ${customer.companyName}`,
          ipAddress: ip,
          device,
        });

        changed.add("payments");
        changed.add("ledgerEntries");
        changed.add("customers");
        changed.add("notifications");
        message = `Payment ${receiptNo} ($${amt.toLocaleString()}) recorded & ledger updated.`;
        break;
      }

      case "payment:reconcile": {
        requirePerm("financials");
        const pay = state.payments.find((p) => p.id === payload.paymentId);
        if (pay) {
          pay.reconciled = !pay.reconciled;
          changed.add("payments");
          message = `Payment ${pay.receiptNo} marked as ${pay.reconciled ? "Reconciled" : "Unreconciled"}.`;
        }
        break;
      }

      case "ledger:adjustment": {
        requirePerm("financials");
        const { customerId, entryType, amount, description, referenceNo } = payload as {
          customerId: string;
          entryType: "Debit" | "Credit";
          amount: number;
          description: string;
          referenceNo?: string;
        };
        const amt = round2(Math.abs(Number(amount || 0)));
        if (amt <= 0) throw new Error("Amount must be positive.");
        const cust = state.customers.find((c) => c.id === customerId);
        if (!cust) throw new Error("Customer not found.");

        state.ledgerEntries.push({
          id: uid("led"),
          customerId,
          date: today,
          type: "Adjustment",
          referenceNo: referenceNo || `ADJ-${Date.now().toString().slice(-5)}`,
          description: description || "Manual Ledger Adjustment",
          debit: entryType === "Debit" ? amt : 0,
          credit: entryType === "Credit" ? amt : 0,
          runningBalance: 0,
          branchId: cust.branchId,
        });
        recalcCustomerLedger(state, customerId);

        appendAudit(state, {
          actorName: session.name,
          actorRole: session.role,
          action: "CREATE",
          module: "Customer Ledger",
          recordId: cust.customerCode,
          summary: `Posted ledger ${entryType} adjustment ($${amt.toLocaleString()}) for ${cust.companyName}`,
          ipAddress: ip,
          device,
        });
        changed.add("ledgerEntries");
        changed.add("customers");
        message = `Ledger adjustment posted for ${cust.companyName}.`;
        break;
      }

      case "supplier:save": {
        requirePerm("create");
        const s = payload as Partial<Supplier>;
        const newSup: Supplier = {
          id: uid("sup"),
          vendorCode: s.vendorCode || `VND-${501 + state.suppliers.length}`,
          companyName: String(s.companyName || "New Vendor Corp."),
          contactPerson: String(s.contactPerson || ""),
          phone: String(s.phone || ""),
          email: String(s.email || ""),
          address: String(s.address || ""),
          state: String(s.state || "TX"),
          paymentTerms: String(s.paymentTerms || "Net 30"),
          openingPayable: Number(s.openingPayable || 0),
          currentPayable: Number(s.openingPayable || 0),
          rating: Number(s.rating || 4.7),
          onTimeDeliveryRate: Number(s.onTimeDeliveryRate || 95),
          category: String(s.category || "Raw Materials"),
          status: "Active",
        };
        state.suppliers.unshift(newSup);
        changed.add("suppliers");
        appendAudit(state, {
          actorName: session.name,
          actorRole: session.role,
          action: "CREATE",
          module: "Suppliers",
          recordId: newSup.vendorCode,
          summary: `Added supplier ${newSup.companyName}`,
          ipAddress: ip,
          device,
        });
        message = `Supplier ${newSup.companyName} created.`;
        break;
      }

      case "purchase:create": {
        requirePerm("create");
        const { supplierId, warehouseId, productId, quantity, unitCost, notes } = payload as {
          supplierId: string;
          warehouseId: string;
          productId: string;
          quantity: number;
          unitCost: number;
          notes?: string;
        };
        const sup = state.suppliers.find((s) => s.id === supplierId);
        const prod = state.products.find((p) => p.id === productId);
        if (!sup || !prod) throw new Error("Select a valid supplier and product.");
        const qty = Math.max(1, Number(quantity));
        const cost = Number(unitCost || prod.purchasePrice);
        const total = round2(qty * cost);
        const poNo = `${state.settings.poPrefix}${String(state.purchaseOrders.length + 45).padStart(4, "0")}`;

        const po: PurchaseOrder = {
          id: uid("po"),
          poNo,
          date: today,
          expectedDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
          supplierId,
          branchId: session.branchId || "br-ny",
          warehouseId: warehouseId || state.warehouses[0]?.id || "wh-ny",
          items: [{ productId: prod.id, productName: prod.name, sku: prod.sku, quantity: qty, unitCost: cost, lineTotal: total }],
          subtotal: total,
          discount: 0,
          tax: 0,
          total,
          status: "Pending Approval",
          paymentStatus: "Unpaid",
          amountPaid: 0,
          dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          notes: notes || "",
        };
        state.purchaseOrders.unshift(po);

        // Automatically queue an Approval Workflow entry
        state.approvals.unshift({
          id: uid("apr"),
          requestNo: `APR-2026-${String(state.approvals.length + 84).padStart(3, "0")}`,
          type: "Purchase",
          referenceNo: poNo,
          title: `Purchase Order ${poNo} — ${qty} x ${prod.name} (${sup.companyName})`,
          amount: total,
          requestedBy: session.name,
          requestedAt: new Date().toISOString(),
          currentStage: "Manager",
          status: "Pending",
          notes: notes || "Purchase order awaiting management approval",
          history: [
            {
              stage: "Salesperson",
              actor: session.name,
              action: "Submitted",
              comment: `Created ${poNo}`,
              timestamp: new Date().toISOString(),
            },
          ],
        });

        changed.add("purchaseOrders");
        changed.add("approvals");
        appendAudit(state, {
          actorName: session.name,
          actorRole: session.role,
          action: "CREATE",
          module: "Purchasing",
          recordId: poNo,
          summary: `Created ${poNo} ($${total.toLocaleString()}) with ${sup.companyName}`,
          ipAddress: ip,
          device,
        });
        message = `Purchase Order ${poNo} created & routed for approval.`;
        break;
      }

      case "purchase:receive": {
        requirePerm("edit");
        const po = state.purchaseOrders.find((p) => p.id === payload.poId);
        if (!po) throw new Error("Purchase Order not found");
        if (po.status === "Received") throw new Error("PO already received.");
        po.status = "Received";

        for (const item of po.items) {
          let lot = state.inventoryLots.find(
            (l) => l.productId === item.productId && l.warehouseId === po.warehouseId
          );
          if (!lot) {
            lot = {
              id: uid("lot"),
              productId: item.productId,
              warehouseId: po.warehouseId,
              batchNo: `BCH-${po.poNo.slice(-4)}`,
              lotNo: `LOT-${Math.floor(100 + Math.random() * 900)}`,
              serialPrefix: `${item.sku.slice(-3)}-`,
              openingStock: 0,
              availableStock: 0,
              reservedStock: 0,
              damagedStock: 0,
              returnedStock: 0,
              unitCost: item.unitCost,
              receivedDate: today,
            };
            state.inventoryLots.unshift(lot);
          }
          const prev = lot.availableStock;
          lot.availableStock += item.quantity;
          state.stockMovements.unshift({
            id: uid("mov"),
            date: new Date().toISOString(),
            productId: item.productId,
            warehouseId: po.warehouseId,
            type: "Stock In",
            quantity: item.quantity,
            previousQty: prev,
            newQty: lot.availableStock,
            unitCost: item.unitCost,
            referenceNo: po.poNo,
            batchNo: lot.batchNo,
            notes: `Goods received against ${po.poNo}`,
            performedBy: session.name,
          });
        }

        const sup = state.suppliers.find((s) => s.id === po.supplierId);
        if (sup) sup.currentPayable = round2(sup.currentPayable + po.total);
        const apAcc = state.accounts.find((a) => a.code === "2000");
        const invAcc = state.accounts.find((a) => a.code === "1300");
        if (apAcc) apAcc.balance = round2(apAcc.balance + po.total);
        if (invAcc) invAcc.balance = round2(invAcc.balance + po.total);

        changed.add("purchaseOrders");
        changed.add("inventoryLots");
        changed.add("stockMovements");
        changed.add("suppliers");
        changed.add("accounts");
        appendAudit(state, {
          actorName: session.name,
          actorRole: session.role,
          action: "UPDATE",
          module: "Purchasing",
          recordId: po.poNo,
          summary: `Goods received for ${po.poNo}; inventory & AP updated`,
          ipAddress: ip,
          device,
        });
        message = `Goods received for ${po.poNo} — warehouse stock updated!`;
        break;
      }

      case "purchase:pay": {
        requirePerm("financials");
        const po = state.purchaseOrders.find((p) => p.id === payload.poId);
        if (!po) throw new Error("PO not found");
        const amt = round2(Math.min(po.total - po.amountPaid, Number(payload.amount || po.total - po.amountPaid)));
        po.amountPaid = round2(po.amountPaid + amt);
        po.paymentStatus = po.amountPaid >= po.total ? "Paid" : "Partial";
        const sup = state.suppliers.find((s) => s.id === po.supplierId);
        if (sup) sup.currentPayable = round2(Math.max(0, sup.currentPayable - amt));
        const apAcc = state.accounts.find((a) => a.code === "2000");
        const bankAcc = state.accounts.find((a) => a.code === "1010");
        if (apAcc) apAcc.balance = round2(Math.max(0, apAcc.balance - amt));
        if (bankAcc) bankAcc.balance = round2(bankAcc.balance - amt);

        changed.add("purchaseOrders");
        changed.add("suppliers");
        changed.add("accounts");
        appendAudit(state, {
          actorName: session.name,
          actorRole: session.role,
          action: "UPDATE",
          module: "Accounts Payable",
          recordId: po.poNo,
          summary: `Paid vendor $${amt.toLocaleString()} against ${po.poNo}`,
          ipAddress: ip,
          device,
        });
        message = `Vendor payment of $${amt.toLocaleString()} recorded for ${po.poNo}.`;
        break;
      }

      case "accounting:journal": {
        requirePerm("financials");
        const { description, reference, lines } = payload as {
          description: string;
          reference: string;
          lines: Array<{ accountId: string; debit: number; credit: number }>;
        };
        const totalDebit = round2(lines.reduce((s, l) => s + Number(l.debit || 0), 0));
        const totalCredit = round2(lines.reduce((s, l) => s + Number(l.credit || 0), 0));
        if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) > 0.01) {
          throw new Error("Double-entry validation failed: Total Debits must equal Total Credits.");
        }

        const resolvedLines = lines.map((l) => {
          const acc = state.accounts.find((a) => a.id === l.accountId);
          if (!acc) throw new Error("Invalid account selected.");
          const dr = round2(Number(l.debit || 0));
          const cr = round2(Number(l.credit || 0));
          if (acc.type === "Asset" || acc.type === "Expense") {
            acc.balance = round2(acc.balance + dr - cr);
          } else {
            acc.balance = round2(acc.balance + cr - dr);
          }
          return {
            accountId: acc.id,
            accountCode: acc.code,
            accountName: acc.name,
            debit: dr,
            credit: cr,
          };
        });

        const entryNo = `JE-2026-${String(state.journalEntries.length + 305).padStart(4, "0")}`;
        state.journalEntries.unshift({
          id: uid("je"),
          entryNo,
          date: today,
          description: description || "Manual Journal Entry",
          reference: reference || entryNo,
          period: today.slice(0, 7),
          lines: resolvedLines,
          status: "Posted",
          createdBy: session.name,
        });
        changed.add("journalEntries");
        changed.add("accounts");
        appendAudit(state, {
          actorName: session.name,
          actorRole: session.role,
          action: "CREATE",
          module: "General Ledger",
          recordId: entryNo,
          summary: `Posted balanced journal entry ${entryNo} ($${totalDebit.toLocaleString()})`,
          ipAddress: ip,
          device,
        });
        message = `Journal Entry ${entryNo} posted.`;
        break;
      }

      case "accounting:account": {
        requirePerm("financials");
        const a = payload as Partial<Account>;
        const newAcc: Account = {
          id: uid("acc"),
          code: String(a.code || Math.floor(1000 + Math.random() * 8999)),
          name: String(a.name || "New GL Account"),
          type: (a.type as Account["type"]) || "Expense",
          subType: String(a.subType || "Operating"),
          balance: Number(a.balance || 0),
          reconciled: false,
          active: true,
        };
        state.accounts.push(newAcc);
        changed.add("accounts");
        message = `Account ${newAcc.code} - ${newAcc.name} created.`;
        break;
      }

      case "expense:save": {
        requirePerm("create");
        const e = payload as Partial<Expense>;
        const expNo = `EXP-2026-${String(state.expenses.length + 1120)}`;
        const created: Expense = {
          id: uid("exp"),
          expenseNo: expNo,
          date: e.date || today,
          category: String(e.category || "Operations"),
          description: String(e.description || "Business Expense"),
          amount: round2(Number(e.amount || 0)),
          budgetAmount: round2(Number(e.budgetAmount || e.amount || 0)),
          department: String(e.department || "Operations"),
          branchId: String(e.branchId || session.branchId || "br-ny"),
          vendorName: String(e.vendorName || "General Vendor"),
          paymentMethod: (e.paymentMethod as PaymentMethod) || "Bank Transfer (ACH)",
          recurring: Boolean(e.recurring),
          recurringCycle: e.recurring ? (e.recurringCycle || "Monthly") : undefined,
          status: "Pending",
          receiptRef: e.receiptRef || `REC-${Date.now().toString().slice(-4)}`,
        };
        state.expenses.unshift(created);
        changed.add("expenses");
        appendAudit(state, {
          actorName: session.name,
          actorRole: session.role,
          action: "CREATE",
          module: "Expenses",
          recordId: expNo,
          summary: `Logged expense ${expNo} ($${created.amount.toLocaleString()}) — ${created.category}`,
          ipAddress: ip,
          device,
        });
        message = `Expense ${expNo} submitted.`;
        break;
      }

      case "expense:status": {
        requirePerm("approve");
        const exp = state.expenses.find((x) => x.id === payload.expenseId);
        if (exp) {
          exp.status = payload.status as Expense["status"];
          changed.add("expenses");
          message = `Expense ${exp.expenseNo} marked ${exp.status}.`;
        }
        break;
      }

      case "tax:save": {
        requirePerm("financials");
        const t = payload as Partial<TaxRule>;
        const idx = t.id ? state.taxRules.findIndex((x) => x.id === t.id) : -1;
        if (idx >= 0) {
          state.taxRules[idx] = {
            ...state.taxRules[idx],
            ...t,
            rate: Number(t.rate ?? state.taxRules[idx].rate),
            localSurtax: Number(t.localSurtax ?? state.taxRules[idx].localSurtax),
          };
        } else {
          state.taxRules.push({
            id: uid("tax"),
            stateCode: String(t.stateCode || "WA").toUpperCase(),
            stateName: String(t.stateName || "Washington"),
            rate: Number(t.rate || 6.5),
            localSurtax: Number(t.localSurtax || 1.5),
            active: true,
            effectiveDate: today,
            notes: String(t.notes || "US State Sales Tax"),
          });
        }
        changed.add("taxRules");
        message = "Tax configuration saved.";
        break;
      }

      case "branch:save": {
        requirePerm("create");
        const b = payload as Partial<Branch>;
        state.branches.push({
          id: uid("br"),
          code: String(b.code || `BR-${state.branches.length + 1}`).toUpperCase(),
          name: String(b.name || "New Regional Branch"),
          type: (b.type as Branch["type"]) || "Branch",
          city: String(b.city || "Miami"),
          state: String(b.state || "FL"),
          address: String(b.address || ""),
          phone: String(b.phone || ""),
          managerName: String(b.managerName || session.name),
          status: "Active",
          monthlyTarget: Number(b.monthlyTarget || 100000),
        });
        changed.add("branches");
        message = "New branch added.";
        break;
      }

      case "warehouse:save": {
        requirePerm("create");
        const w = payload as Partial<Warehouse>;
        state.warehouses.push({
          id: uid("wh"),
          code: String(w.code || `WH-0${state.warehouses.length + 1}`).toUpperCase(),
          name: String(w.name || "New Fulfillment Warehouse"),
          branchId: String(w.branchId || state.branches[0]?.id || "br-ny"),
          location: String(w.location || "Chicago, IL"),
          capacityUnits: Number(w.capacityUnits || 25000),
          manager: String(w.manager || session.name),
          status: "Active",
        });
        changed.add("warehouses");
        message = "Warehouse registered.";
        break;
      }

      case "employee:save": {
        requirePerm("create");
        const e = payload as Partial<Employee>;
        state.employees.unshift({
          id: uid("emp"),
          employeeCode: `EMP-${String(state.employees.length + 1).padStart(3, "0")}`,
          name: String(e.name || "New Team Member"),
          email: String(e.email || "staff@apexledger.com"),
          phone: String(e.phone || "+1 (212) 555-0100"),
          department: String(e.department || "Commercial Sales"),
          jobRole: String(e.jobRole || "Account Executive"),
          branchId: String(e.branchId || "br-ny"),
          isSalesRep: e.isSalesRep !== false,
          commissionType: (e.commissionType as Employee["commissionType"]) || "Percentage",
          commissionRate: Number(e.commissionRate || 3.5),
          monthlySales: 0,
          commissionEarned: 0,
          commissionStatus: "Pending",
          attendanceRate: 100,
          status: "Active",
          hiredDate: today,
        });
        changed.add("employees");
        message = "Employee profile created.";
        break;
      }

      case "commission:approve": {
        requirePerm("approve");
        const emp = state.employees.find((e) => e.id === payload.employeeId);
        if (emp) {
          emp.commissionStatus = (payload.status as Employee["commissionStatus"]) || "Approved";
          changed.add("employees");
          appendAudit(state, {
            actorName: session.name,
            actorRole: session.role,
            action: "APPROVE",
            module: "Commissions",
            recordId: emp.employeeCode,
            summary: `Commission ($${emp.commissionEarned.toLocaleString()}) for ${emp.name} marked ${emp.commissionStatus}`,
            ipAddress: ip,
            device,
          });
          message = `Commission for ${emp.name} updated to ${emp.commissionStatus}.`;
        }
        break;
      }

      case "approval:advance": {
        requirePerm("approve");
        const { approvalId, decision, comment } = payload as {
          approvalId: string;
          decision: "Approved" | "Rejected";
          comment?: string;
        };
        const apr = state.approvals.find((a) => a.id === approvalId);
        if (!apr) throw new Error("Approval request not found.");

        const stages: ApprovalStage[] = ["Salesperson", "Manager", "Finance", "Completed"];
        const prevStage = apr.currentStage;
        const currIdx = stages.indexOf(apr.currentStage);

        apr.history.push({
          stage: apr.currentStage,
          actor: session.name,
          action: decision,
          comment: comment || (decision === "Approved" ? "Approved and forwarded" : "Rejected by reviewer"),
          timestamp: new Date().toISOString(),
        });

        if (decision === "Rejected") {
          apr.status = "Rejected";
        } else if (currIdx >= stages.length - 2) {
          apr.currentStage = "Completed";
          apr.status = "Approved";
        } else {
          apr.currentStage = stages[currIdx + 1];
        }

        appendAudit(state, {
          actorName: session.name,
          actorRole: session.role,
          action: decision === "Approved" ? "APPROVE" : "REJECT",
          module: "Approval Workflow",
          recordId: apr.requestNo,
          summary: `${apr.requestNo} (${apr.type}): ${decision} at ${prevStage} → ${apr.currentStage}`,
          previousValue: prevStage,
          newValue: apr.currentStage,
          ipAddress: ip,
          device,
        });
        changed.add("approvals");
        message = `${apr.requestNo} ${decision === "Approved" ? `advanced to ${apr.currentStage}` : "rejected"}.`;
        break;
      }

      case "document:add": {
        requirePerm("create");
        const d = payload as Partial<DocumentRecord>;
        state.documents.unshift({
          id: uid("doc"),
          title: String(d.title || "Enterprise Document"),
          category: (d.category as DocumentRecord["category"]) || "Customer Document",
          relatedEntityType: (d.relatedEntityType as DocumentRecord["relatedEntityType"]) || "Customer",
          relatedEntityName: String(d.relatedEntityName || "General"),
          fileName: String(d.fileName || "document.pdf"),
          fileSizeKb: Number(d.fileSizeKb || 256),
          uploadedBy: session.name,
          uploadedAt: today,
          notes: String(d.notes || ""),
        });
        changed.add("documents");
        message = "Document attached to Enterprise Vault.";
        break;
      }

      case "notification:read": {
        const id = payload.id as string | undefined;
        if (id === "all") {
          state.notifications.forEach((n) => (n.read = true));
        } else {
          const item = state.notifications.find((n) => n.id === id);
          if (item) item.read = true;
        }
        changed.add("notifications");
        message = "Notifications updated.";
        break;
      }

      case "user:save": {
        requirePerm("users");
        const { name, email, password, role, branchId, department } = payload as {
          name: string;
          email: string;
          password: string;
          role: RoleName;
          branchId: string;
          department: string;
        };
        if (state.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
          throw new Error("A user with this email already exists.");
        }
        if (state.settings.enforceStrongPasswords) {
          const check = validateStrongPassword(password);
          if (!check.valid) throw new Error(`Password policy: ${check.errors.join(", ")}`);
        }
        const roleDef = state.roles.find((r) => r.name === role) || state.roles[2];
        const passwordHash = await hashPassword(password);
        state.users.push({
          id: uid("usr"),
          name,
          email: email.toLowerCase(),
          passwordHash,
          role,
          branchId: branchId || "br-ny",
          department: department || "Operations",
          status: "Active",
          failedLoginAttempts: 0,
          lockoutUntil: null,
          mfaEnabled: false,
          permissions: { ...roleDef.permissions },
          createdAt: new Date().toISOString(),
        });
        changed.add("users");
        appendAudit(state, {
          actorName: session.name,
          actorRole: session.role,
          action: "CREATE",
          module: "Users & RBAC",
          recordId: email,
          summary: `Provisioned user ${name} (${role})`,
          ipAddress: ip,
          device,
        });
        message = `User ${name} created with ${role} role.`;
        break;
      }

      case "user:unlock": {
        requirePerm("users");
        const u = state.users.find((x) => x.id === payload.userId);
        if (u) {
          u.status = "Active";
          u.failedLoginAttempts = 0;
          u.lockoutUntil = null;
          changed.add("users");
          message = `Account ${u.email} unlocked.`;
        }
        break;
      }

      case "role:update": {
        requirePerm("users");
        const { roleId, permission, value } = payload as {
          roleId: string;
          permission: PermissionKey;
          value: boolean;
        };
        const role = state.roles.find((r) => r.id === roleId);
        if (role && role.name !== "Admin") {
          role.permissions[permission] = value;
          state.users.forEach((u) => {
            if (u.role === role.name) u.permissions[permission] = value;
          });
          changed.add("roles");
          changed.add("users");
          appendAudit(state, {
            actorName: session.name,
            actorRole: session.role,
            action: "SECURITY",
            module: "RBAC Matrix",
            recordId: role.name,
            summary: `Set ${role.name}.${permission} = ${value}`,
            ipAddress: ip,
            device,
          });
          message = `Updated ${role.name} permission '${permission}'.`;
        }
        break;
      }

      case "user:dashboard-layout": {
        const u = state.users.find((x) => x.id === session.userId);
        if (u && Array.isArray(payload.layout)) {
          u.dashboardLayout = payload.layout as string[];
          changed.add("users");
          message = "Executive dashboard layout saved.";
        }
        break;
      }

      case "settings:update": {
        requirePerm("users");
        state.settings = {
          ...state.settings,
          ...(payload as Partial<CompanySettings>),
        };
        changed.add("settings");
        appendAudit(state, {
          actorName: session.name,
          actorRole: session.role,
          action: "UPDATE",
          module: "Enterprise Administration",
          recordId: "company-settings",
          summary: `Updated enterprise settings (${state.settings.activeCompany})`,
          ipAddress: ip,
          device,
        });
        message = "Enterprise settings updated.";
        break;
      }

      case "integration:toggle": {
        requirePerm("users");
        const item = state.integrations.find((i) => i.id === payload.integrationId);
        if (item) {
          item.status = item.status === "Connected" ? "Disconnected" : "Connected";
          item.lastSync = new Date().toISOString();
          changed.add("integrations");
          message = `${item.name} is now ${item.status}.`;
        }
        break;
      }

      case "backup:create": {
        requirePerm("users");
        const serialized = JSON.stringify(sanitizeStateForClient(state));
        const snap = {
          id: `BKP-${today.replace(/-/g, "")}-${Date.now().toString().slice(-4)}`,
          createdAt: new Date().toISOString(),
          type: "Manual" as const,
          sizeKb: Math.max(12, Math.round(Buffer.byteLength(serialized, "utf8") / 1024)),
          recordCount:
            state.products.length +
            state.customers.length +
            state.invoices.length +
            state.ledgerEntries.length +
            state.payments.length,
          checksum: computeChecksum(serialized),
          verified: true,
          createdBy: session.name,
          status: "Verified" as const,
        };
        state.backups.unshift(snap);
        changed.add("backups");
        appendAudit(state, {
          actorName: session.name,
          actorRole: session.role,
          action: "BACKUP",
          module: "Disaster Recovery",
          recordId: snap.id,
          summary: `Created verified manual backup ${snap.id} (SHA-256: ${snap.checksum})`,
          ipAddress: ip,
          device,
        });
        extraData = { snapshot: snap, exportJson: serialized };
        message = `Backup ${snap.id} created & verified (${snap.checksum}).`;
        break;
      }

      case "backup:verify": {
        const snap = state.backups.find((b) => b.id === payload.backupId);
        if (snap) {
          snap.verified = true;
          snap.status = "Verified";
          changed.add("backups");
          message = `Backup ${snap.id} integrity verified (${snap.checksum}).`;
        }
        break;
      }

      case "import:batch": {
        requirePerm("create");
        const { target, rows } = payload as {
          target: "products" | "customers";
          rows: Array<Record<string, string>>;
        };
        if (!Array.isArray(rows) || rows.length === 0) {
          throw new Error("No valid CSV rows provided.");
        }
        let count = 0;
        if (target === "products") {
          for (const row of rows) {
            if (!row.name) continue;
            const sku = (row.sku || `SKU-IMP-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase();
            const sell = Number(row.sellingPrice || 45);
            state.products.unshift({
              id: uid("prod"),
              sku,
              name: row.name,
              category: row.category || "Imported Goods",
              description: row.description || "Bulk imported via CSV/Excel tool",
              specifications: { Source: "CSV Import" },
              uom: row.uom || "Unit",
              purchasePrice: Number(row.purchasePrice || round2(sell * 0.6)),
              sellingPrice: sell,
              wholesalePrice: Number(row.wholesalePrice || round2(sell * 0.85)),
              minSellingPrice: Number(row.minSellingPrice || round2(sell * 0.75)),
              taxable: true,
              taxCategory: "Standard Tangible Goods",
              status: "Active",
              barcode: `8901999${Math.floor(100000 + Math.random() * 899999)}`,
              qrCode: `APEX:${sku}`,
              variants: [],
              attributes: ["Imported"],
              pricingLevels: [{ tier: "Retail", price: sell, minQty: 1 }],
              minStockLevel: 50,
              maxStockLevel: 1000,
              reorderLevel: 100,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            count++;
          }
          changed.add("products");
        } else if (target === "customers") {
          for (const row of rows) {
            if (!row.companyName) continue;
            const opening = Number(row.openingBalance || 0);
            const id = uid("cust");
            const code = row.customerCode || `CUS-${1010 + state.customers.length}`;
            state.customers.unshift({
              id,
              customerCode: code,
              companyName: row.companyName,
              contactPerson: row.contactPerson || "Accounts Payable",
              phone: row.phone || "+1 (800) 555-0199",
              email: row.email || "ap@company.com",
              billingAddress: row.billingAddress || "USA",
              shippingAddress: row.shippingAddress || row.billingAddress || "USA",
              state: row.state || "NY",
              customerType: "B2B Enterprise",
              category: row.category || "Commercial",
              segment: "Standard",
              taxId: row.taxId || "",
              taxExempt: false,
              paymentTerms: "Net 30",
              creditLimit: Number(row.creditLimit || 30000),
              openingBalance: opening,
              currentBalance: opening,
              notes: "Imported via Enterprise CSV Importer",
              branchId: session.branchId || "br-ny",
              salesRepId: state.employees[0]?.id || "emp-1",
              tasks: [],
              communications: [],
              createdAt: new Date().toISOString(),
            });
            if (opening !== 0) {
              state.ledgerEntries.push({
                id: uid("led"),
                customerId: id,
                date: today,
                type: "Opening",
                referenceNo: `OPN-${code}`,
                description: "Imported Opening Balance",
                debit: opening > 0 ? opening : 0,
                credit: opening < 0 ? Math.abs(opening) : 0,
                runningBalance: opening,
                branchId: session.branchId || "br-ny",
              });
              changed.add("ledgerEntries");
            }
            count++;
          }
          changed.add("customers");
        }
        appendAudit(state, {
          actorName: session.name,
          actorRole: session.role,
          action: "CREATE",
          module: "Data Import",
          recordId: target,
          summary: `Bulk imported ${count} ${target} records`,
          ipAddress: ip,
          device,
        });
        message = `Successfully imported ${count} ${target} records.`;
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown ERP action: ${action}` }, { status: 400 });
    }

    await saveERPState(state, Array.from(changed));
    return NextResponse.json({
      ok: true,
      message,
      extraData,
      state: sanitizeStateForClient(state),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Operation failed";
    const status = msg.startsWith("FORBIDDEN:") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
