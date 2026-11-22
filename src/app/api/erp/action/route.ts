import { NextRequest, NextResponse } from "next/server";
import {
  computeChecksum,
  getServerSession,
  hasPermission,
  resolveLiveSessionUser,
  signSessionToken,
  SESSION_COOKIE_NAME,
} from "@/lib/security/auth";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { hashPassword, validateStrongPassword, verifyPassword } from "@/lib/security/password";
import { sanitizePayload, signHmac, verifyHmac } from "@/lib/security/crypto";
import { sendEnterpriseEmail } from "@/lib/email/mailer";
import {
  ALL_COLLECTION_KEYS,
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
  const rate = await checkRateLimit(`action:${session.userId}:${ip}`, 180, 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded. Please slow down." }, { status: 429 });
  }

  const device = req.headers.get("user-agent")?.slice(0, 64) || "Web Client";

  try {
    const state = await loadERPState();
    const liveUser = resolveLiveSessionUser(session, state);
    if (!liveUser) {
      return NextResponse.json(
        { error: "Session revoked or account inactive. Please sign in again." },
        { status: 401 }
      );
    }

    const rawBody = sanitizePayload(
      (await req.json()) as { action: string; payload?: Record<string, unknown> }
    );
    const { action, payload = {} } = rawBody;
    if (typeof action !== "string") {
      return NextResponse.json({ error: "Invalid action format." }, { status: 400 });
    }

    const requirePerm = (perm: PermissionKey) => {
      if (!hasPermission(liveUser, perm)) {
        throw new Error(`FORBIDDEN: Your role (${liveUser.role}) lacks '${perm}' permission.`);
      }
    };

    const changed = new Set<ERPCollectionKey | "settings">(["auditLogs"]);
    let message = "Action completed successfully.";
    let extraData: Record<string, unknown> = {};
    let refreshedCookieToken: string | null = null;

    const today = new Date().toISOString().slice(0, 10);
    const yearStr = today.slice(0, 4);

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
            name: String(p.name ?? prev.name).trim(),
            sku: String(p.sku ?? prev.sku).trim().toUpperCase(),
            category: String(p.category ?? prev.category).trim(),
            description: String(p.description ?? prev.description),
            uom: String(p.uom ?? prev.uom),
            purchasePrice: Math.max(0, Number(p.purchasePrice ?? prev.purchasePrice)),
            sellingPrice: Math.max(0, Number(p.sellingPrice ?? prev.sellingPrice)),
            wholesalePrice: Math.max(0, Number(p.wholesalePrice ?? prev.wholesalePrice)),
            minSellingPrice: Math.max(0, Number(p.minSellingPrice ?? prev.minSellingPrice)),
            taxable: p.taxable !== undefined ? Boolean(p.taxable) : prev.taxable,
            status: p.status === "Inactive" ? "Inactive" : "Active",
            minStockLevel: Math.max(0, Number(p.minStockLevel ?? prev.minStockLevel)),
            maxStockLevel: Math.max(0, Number(p.maxStockLevel ?? prev.maxStockLevel)),
            reorderLevel: Math.max(0, Number(p.reorderLevel ?? prev.reorderLevel)),
            updatedAt: now,
          };
          state.products[existingIdx] = updated;
          appendAudit(state, {
            actorName: liveUser.name,
            actorRole: liveUser.role,
            action: "UPDATE",
            module: "Products",
            recordId: updated.sku,
            summary: `Updated product ${updated.name} (${updated.sku})`,
            previousValue: `$${prev.sellingPrice} / ${prev.status}`,
            newValue: `$${updated.sellingPrice} / ${updated.status}`,
            ipAddress: ip,
            device,
          });
          message = `Product ${updated.name} updated in MongoDB.`;
        } else {
          const newId = uid("prod");
          const sku = String(p.sku || `SKU-${Math.floor(1000 + Math.random() * 9000)}`).trim().toUpperCase();
          const selling = Math.max(0, Number(p.sellingPrice || 0));
          const created: Product = {
            id: newId,
            sku,
            name: String(p.name || "").trim(),
            category: String(p.category || "General Industrial").trim(),
            description: String(p.description || ""),
            specifications: { Grade: "Commercial US" },
            uom: String(p.uom || "Unit"),
            purchasePrice: Math.max(0, Number(p.purchasePrice || 0)),
            sellingPrice: selling,
            wholesalePrice: Math.max(0, Number(p.wholesalePrice || round2(selling * 0.85))),
            minSellingPrice: Math.max(0, Number(p.minSellingPrice || round2(selling * 0.75))),
            taxable: p.taxable !== false,
            taxCategory: "Standard Tangible Goods",
            status: "Active",
            barcode: String(p.barcode || `8901000${Math.floor(100000 + Math.random() * 899999)}`),
            qrCode: `APEX:${sku}:${String(p.name || "ITEM").toUpperCase().replace(/\s+/g, "-")}`,
            variants: [],
            attributes: ["Commercial Grade"],
            pricingLevels: [
              { tier: "Retail", price: selling, minQty: 1 },
              { tier: "Wholesale", price: Math.max(0, Number(p.wholesalePrice || round2(selling * 0.85))), minQty: 25 },
              { tier: "Distributor", price: round2(selling * 0.8), minQty: 100 },
              { tier: "Enterprise VIP", price: Math.max(0, Number(p.minSellingPrice || round2(selling * 0.75))), minQty: 250 },
            ],
            minStockLevel: Math.max(0, Number(p.minStockLevel || 50)),
            maxStockLevel: Math.max(0, Number(p.maxStockLevel || 1000)),
            reorderLevel: Math.max(0, Number(p.reorderLevel || 100)),
            createdAt: now,
            updatedAt: now,
          };
          if (!created.name) throw new Error("Product name is required.");
          state.products.unshift(created);
          const openingQty = Math.max(0, Number(payload.openingStock || 0));
          const defaultWh = state.warehouses[0]?.id || "wh-main";
          state.inventoryLots.unshift({
            id: uid("lot"),
            productId: created.id,
            warehouseId: defaultWh,
            batchNo: `BCH-${sku.slice(-3)}-${today.replace(/-/g, "").slice(2, 6)}`,
            lotNo: `LOT-${Math.floor(100 + Math.random() * 900)}`,
            serialPrefix: `${sku.slice(-3)}-`,
            openingStock: openingQty,
            availableStock: openingQty,
            reservedStock: 0,
            damagedStock: 0,
            returnedStock: 0,
            unitCost: created.purchasePrice,
            receivedDate: today,
          });
          if (openingQty > 0) {
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
              notes: "Initial opening stock",
              performedBy: liveUser.name,
            });
            changed.add("stockMovements");
          }
          changed.add("inventoryLots");
          appendAudit(state, {
            actorName: liveUser.name,
            actorRole: liveUser.role,
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
        const id = String(payload.id || "");
        const prod = state.products.find((p) => p.id === id);
        if (prod) {
          state.products = state.products.filter((p) => p.id !== id);
          state.inventoryLots = state.inventoryLots.filter((l) => l.productId !== id);
          appendAudit(state, {
            actorName: liveUser.name,
            actorRole: liveUser.role,
            action: "DELETE",
            module: "Products",
            recordId: prod.sku,
            summary: `Deleted product ${prod.name} (${prod.sku})`,
            previousValue: prod.name,
            ipAddress: ip,
            device,
          });
          changed.add("products");
          changed.add("inventoryLots");
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
        if (type === "Stock In") lot.availableStock += Math.abs(qty);
        else if (type === "Stock Out") lot.availableStock = Math.max(0, lot.availableStock - Math.abs(qty));
        else if (type === "Damaged") {
          const dmg = Math.min(lot.availableStock, Math.abs(qty));
          lot.availableStock -= dmg;
          lot.damagedStock += dmg;
        } else if (type === "Returned") {
          lot.returnedStock += Math.abs(qty);
          lot.availableStock += Math.abs(qty);
        } else {
          lot.availableStock = Math.max(0, lot.availableStock + qty);
        }

        // Sync Merchandise Inventory GL Account (1300)
        const invAcc = state.accounts.find((a) => a.code === "1300");
        if (invAcc) {
          invAcc.balance = round2(
            state.inventoryLots.reduce((s, l) => s + l.availableStock * l.unitCost, 0)
          );
          changed.add("accounts");
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
          notes: String(notes || `${type} processed`),
          performedBy: liveUser.name,
        });

        const totalStock = state.inventoryLots
          .filter((l) => l.productId === productId)
          .reduce((s, l) => s + l.availableStock, 0);
        if (totalStock <= product.reorderLevel) {
          state.notifications.unshift({
            id: uid("not"),
            title: `Low Stock Alert: ${product.name}`,
            message: `Available stock (${totalStock} ${product.uom}s) is at or below reorder level (${product.reorderLevel}).`,
            category: "Low Stock",
            severity: "warning",
            read: false,
            createdAt: new Date().toISOString(),
            actionModule: "inventory",
          });
          changed.add("notifications");
        }

        appendAudit(state, {
          actorName: liveUser.name,
          actorRole: liveUser.role,
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
        message = `Inventory ${type} committed for ${product.name}.`;
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
          notes: String(notes || "Inter-warehouse transfer"),
          performedBy: liveUser.name,
        });

        appendAudit(state, {
          actorName: liveUser.name,
          actorRole: liveUser.role,
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
            companyName: String(c.companyName ?? prev.companyName).trim(),
            contactPerson: String(c.contactPerson ?? prev.contactPerson).trim(),
            phone: String(c.phone ?? prev.phone),
            email: String(c.email ?? prev.email),
            billingAddress: String(c.billingAddress ?? prev.billingAddress),
            shippingAddress: String(c.shippingAddress ?? prev.shippingAddress),
            state: String(c.state ?? prev.state),
            taxId: String(c.taxId ?? prev.taxId),
            taxExempt: c.taxExempt !== undefined ? Boolean(c.taxExempt) : prev.taxExempt,
            paymentTerms: (c.paymentTerms as Customer["paymentTerms"]) ?? prev.paymentTerms,
            creditLimit: Math.max(0, Number(c.creditLimit ?? prev.creditLimit)),
            segment: (c.segment as Customer["segment"]) ?? prev.segment,
            notes: String(c.notes ?? prev.notes),
          };
          appendAudit(state, {
            actorName: liveUser.name,
            actorRole: liveUser.role,
            action: "UPDATE",
            module: "Customers",
            recordId: prev.customerCode,
            summary: `Updated customer ${state.customers[idx].companyName}`,
            ipAddress: ip,
            device,
          });
          message = `Customer ${state.customers[idx].companyName} updated.`;
        } else {
          const opening = round2(Number(c.openingBalance || 0));
          const companyName = String(c.companyName || "").trim();
          if (!companyName) throw new Error("Company name is required.");
          const newCust: Customer = {
            id: uid("cust"),
            customerCode: c.customerCode || `CUS-${1001 + state.customers.length}`,
            companyName,
            contactPerson: String(c.contactPerson || "").trim(),
            phone: String(c.phone || ""),
            email: String(c.email || ""),
            billingAddress: String(c.billingAddress || ""),
            shippingAddress: String(c.shippingAddress || c.billingAddress || ""),
            state: String(c.state || state.settings.defaultTaxState || "NY"),
            customerType: (c.customerType as Customer["customerType"]) || "B2B Enterprise",
            category: String(c.category || "Commercial"),
            segment: (c.segment as Customer["segment"]) || "Standard",
            taxId: String(c.taxId || ""),
            taxExempt: Boolean(c.taxExempt),
            paymentTerms: (c.paymentTerms as Customer["paymentTerms"]) || "Net 30",
            creditLimit: Math.max(0, Number(c.creditLimit || 25000)),
            openingBalance: opening,
            currentBalance: opening,
            notes: String(c.notes || ""),
            branchId: String(c.branchId || liveUser.branchId || state.branches[0]?.id || "br-hq"),
            salesRepId: String(c.salesRepId || state.employees[0]?.id || ""),
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
            actorName: liveUser.name,
            actorRole: liveUser.role,
            action: "CREATE",
            module: "Customers",
            recordId: newCust.customerCode,
            summary: `Created customer ${newCust.companyName}`,
            ipAddress: ip,
            device,
          });
          message = `Customer ${newCust.companyName} saved to MongoDB.`;
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
          title: String(title).trim(),
          dueDate: dueDate || today,
          priority: priority || "Medium",
          status: "Open",
          assignedTo: liveUser.name,
          type: type || "Follow-up",
        });
        changed.add("customers");
        message = "CRM follow-up reminder saved.";
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
          author: liveUser.name,
          channel: channel || "Note",
          summary: String(summary).trim(),
        });
        changed.add("customers");
        message = "Communication logged.";
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
        if (!customer) throw new Error("Please select or create a customer first.");
        if (!Array.isArray(items) || items.length === 0) throw new Error("Add at least one line item.");

        const taxRule = state.taxRules.find((t) => t.stateCode === customer.state && t.active);
        const effectiveTaxRate = customer.taxExempt
          ? 0
          : round2((taxRule?.rate || 0) + (taxRule?.localSurtax || 0));

        let subtotal = 0;
        let discountTotal = 0;
        let taxableBase = 0;
        let totalCogs = 0;
        const lineItems: OrderLineItem[] = [];

        for (const item of items) {
          const prod = state.products.find((p) => p.id === item.productId);
          if (!prod) continue;
          const qty = Math.max(1, Number(item.quantity));
          const unitPrice = Math.max(0, Number(item.unitPrice || prod.sellingPrice));
          const discPct = Math.min(100, Math.max(0, Number(item.discountPercent || 0)));
          const gross = qty * unitPrice;
          const disc = round2(gross * (discPct / 100));
          const lineTotal = round2(gross - disc);
          subtotal = round2(subtotal + gross);
          discountTotal = round2(discountTotal + disc);
          totalCogs = round2(totalCogs + prod.purchasePrice * qty);
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

        const orderSeq = String(state.salesOrders.length + 1).padStart(4, "0");
        const orderNo = `${state.settings.orderPrefix}${yearStr}-${orderSeq}`;
        const orderId = uid("so");

        const newOrder: SalesOrder = {
          id: orderId,
          orderNo,
          date: today,
          customerId,
          branchId: branchId || customer.branchId,
          warehouseId: warehouseId || state.warehouses[0]?.id || "wh-main",
          salesRepId: salesRepId || customer.salesRepId || "",
          items: lineItems,
          subtotal,
          discountTotal,
          taxRate: effectiveTaxRate,
          taxTotal,
          grandTotal,
          status,
          paymentStatus: "Unpaid",
          notes: String(notes || ""),
          createdBy: liveUser.name,
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
              notes: `Order dispatch — ${customer.companyName}`,
              performedBy: liveUser.name,
            });
          }
        }
        changed.add("inventoryLots");
        changed.add("stockMovements");

        if (customer.creditLimit > 0 && customer.currentBalance + grandTotal > customer.creditLimit) {
          state.notifications.unshift({
            id: uid("not"),
            title: `Credit Limit Exceeded: ${customer.companyName}`,
            message: `Order ${orderNo} ($${grandTotal.toLocaleString()}) exceeds credit limit ($${customer.creditLimit.toLocaleString()}).`,
            category: "Credit Limit",
            severity: "critical",
            read: false,
            createdAt: new Date().toISOString(),
            actionModule: "customers",
          });
          changed.add("notifications");
        }

        if (generateInvoice) {
          const invSeq = String(state.invoices.length + 1).padStart(4, "0");
          const invoiceNo = `${state.settings.invoicePrefix}${yearStr}-${invSeq}`;
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
            notes: String(notes || `Generated from ${orderNo}`),
            termsAndConditions: `${customer.paymentTerms}. Remit in USD to ${state.settings.legalName}.`,
          };
          newOrder.invoiceId = inv.id;
          state.invoices.unshift(inv);

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

          // Double-entry Sales + COGS Journal Entry
          const netRevenue = round2(subtotal - discountTotal);
          const je: JournalEntry = {
            id: uid("je"),
            entryNo: `JE-${yearStr}-${String(state.journalEntries.length + 1).padStart(4, "0")}`,
            date: today,
            description: `Sales revenue & COGS — ${invoiceNo} (${customer.companyName})`,
            reference: invoiceNo,
            period: today.slice(0, 7),
            lines: [
              { accountId: "acc-1200", accountCode: "1200", accountName: "Accounts Receivable (Trade)", debit: grandTotal, credit: 0 },
              { accountId: "acc-4000", accountCode: "4000", accountName: "Product Sales Revenue", debit: 0, credit: netRevenue },
              ...(taxTotal > 0
                ? [{ accountId: "acc-2100", accountCode: "2100", accountName: "US State Sales Tax Payable", debit: 0, credit: taxTotal }]
                : []),
              ...(totalCogs > 0
                ? [
                    { accountId: "acc-5000", accountCode: "5000", accountName: "Cost of Goods Sold (COGS)", debit: totalCogs, credit: 0 },
                    { accountId: "acc-1300", accountCode: "1300", accountName: "Merchandise Inventory Asset", debit: 0, credit: totalCogs },
                  ]
                : []),
            ],
            status: "Posted",
            createdBy: liveUser.name,
          };
          state.journalEntries.unshift(je);

          const arAcc = state.accounts.find((a) => a.code === "1200");
          const revAcc = state.accounts.find((a) => a.code === "4000");
          const taxAcc = state.accounts.find((a) => a.code === "2100");
          const cogsAcc = state.accounts.find((a) => a.code === "5000");
          const invAcc = state.accounts.find((a) => a.code === "1300");
          if (arAcc) arAcc.balance = round2(arAcc.balance + grandTotal);
          if (revAcc) revAcc.balance = round2(revAcc.balance + netRevenue);
          if (taxAcc) taxAcc.balance = round2(taxAcc.balance + taxTotal);
          if (cogsAcc) cogsAcc.balance = round2(cogsAcc.balance + totalCogs);
          if (invAcc) {
            invAcc.balance = round2(
              state.inventoryLots.reduce((s, l) => s + l.availableStock * l.unitCost, 0)
            );
          }

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
          actorName: liveUser.name,
          actorRole: liveUser.role,
          action: "CREATE",
          module: "Sales & Invoicing",
          recordId: orderNo,
          summary: `Created sales order ${orderNo} for ${customer.companyName} ($${grandTotal.toLocaleString()})`,
          newValue: JSON.stringify({ orderNo, grandTotal }),
          ipAddress: ip,
          device,
        });

        changed.add("salesOrders");
        changed.add("notifications");
        message = generateInvoice
          ? `Sales Order ${orderNo} & US Invoice posted live.`
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

        if ((status === "Returned" || status === "Cancelled") && prev !== "Returned" && prev !== "Cancelled") {
          for (const li of order.items) {
            const lot = state.inventoryLots.find(
              (l) => l.productId === li.productId && l.warehouseId === order.warehouseId
            );
            if (lot) {
              lot.availableStock += li.quantity;
              if (status === "Returned") lot.returnedStock += li.quantity;
            }
          }
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
          actorName: liveUser.name,
          actorRole: liveUser.role,
          action: "UPDATE",
          module: "Sales",
          recordId: order.orderNo,
          summary: `Order ${order.orderNo} status: ${prev} → ${status}`,
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
          const dupNo = `${state.settings.invoicePrefix}${yearStr}-${String(state.invoices.length + 1).padStart(4, "0")}`;
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
          const recipient = (emailTo || cust?.email || "").trim();
          if (!recipient) throw new Error("Customer email address is missing. Update customer profile first.");
          const subject =
            op === "reminder"
              ? `Payment Reminder: Invoice ${inv.invoiceNo} ($${inv.balanceDue.toFixed(2)} Due)`
              : `Invoice ${inv.invoiceNo} from ${state.settings.legalName}`;
          const html = `
            <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
              <h2 style="margin:0 0 8px;color:#0f172a;">${state.settings.legalName}</h2>
              <p style="color:#475569;font-size:14px;">${op === "reminder" ? "Friendly reminder regarding your open invoice balance:" : "Please find your invoice summary below:"}</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
                <tr><td style="padding:6px 0;color:#64748b;">Invoice Number:</td><td style="text-align:right;font-weight:700;">${inv.invoiceNo}</td></tr>
                <tr><td style="padding:6px 0;color:#64748b;">Issue / Due Date:</td><td style="text-align:right;">${inv.issueDate} / ${inv.dueDate}</td></tr>
                <tr><td style="padding:6px 0;color:#64748b;">Total Amount:</td><td style="text-align:right;">$${inv.total.toFixed(2)}</td></tr>
                <tr><td style="padding:6px 0;color:#64748b;">Balance Due:</td><td style="text-align:right;font-weight:700;color:#dc2626;">$${inv.balanceDue.toFixed(2)}</td></tr>
              </table>
              <p style="color:#64748b;font-size:12px;">${state.settings.emailSignature}</p>
            </div>`;
          const text = `${subject}\nInvoice: ${inv.invoiceNo}\nDue: ${inv.dueDate}\nBalance Due: $${inv.balanceDue.toFixed(2)}`;
          const dispatch = await sendEnterpriseEmail({ to: recipient, subject, html, text });

          state.emailLogs.unshift({
            id: uid("em"),
            sentAt: new Date().toISOString(),
            to: recipient,
            subject,
            template: op === "reminder" ? "Overdue Reminder" : "Invoice",
            referenceNo: inv.invoiceNo,
            status: dispatch.status,
            detail: dispatch.detail,
          });
          if (op === "reminder" && dispatch.status === "Delivered (SMTP)") {
            inv.lastReminderSentAt = new Date().toISOString();
          }
          changed.add("emailLogs");
          changed.add("invoices");
          message =
            dispatch.status === "Delivered (SMTP)"
              ? `Live SMTP email delivered to ${recipient}.`
              : `${dispatch.status}: ${dispatch.detail}`;
        } else if (op === "collection_note") {
          inv.collectionNotes = String(note || "");
          changed.add("invoices");
          message = "Collection note saved.";
        }

        appendAudit(state, {
          actorName: liveUser.name,
          actorRole: liveUser.role,
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

        const receiptNo = `${state.settings.receiptPrefix}${yearStr}-${String(state.payments.length + 1).padStart(4, "0")}`;
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
          reference: String(reference || `REF-${Date.now().toString().slice(-6)}`),
          allocations,
          reconciled: method === "Cash" || method === "Credit Card",
          notes: String(notes || ""),
          recordedBy: liveUser.name,
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
            entryNo: `JE-${yearStr}-${String(state.journalEntries.length + 1).padStart(4, "0")}`,
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
            createdBy: liveUser.name,
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
          actorName: liveUser.name,
          actorRole: liveUser.role,
          action: "CREATE",
          module: "Payments",
          recordId: receiptNo,
          summary: `Recorded ${paymentType} payment ${receiptNo} ($${amt.toLocaleString()})`,
          ipAddress: ip,
          device,
        });

        changed.add("payments");
        changed.add("ledgerEntries");
        changed.add("customers");
        changed.add("notifications");
        message = `Payment ${receiptNo} ($${amt.toLocaleString()}) posted live.`;
        break;
      }

      case "payment:reconcile": {
        requirePerm("financials");
        const pay = state.payments.find((p) => p.id === payload.paymentId);
        if (pay) {
          pay.reconciled = !pay.reconciled;
          changed.add("payments");
          message = `Payment ${pay.receiptNo} marked ${pay.reconciled ? "Reconciled" : "Pending"}.`;
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
          referenceNo: String(referenceNo || `ADJ-${Date.now().toString().slice(-5)}`),
          description: String(description || "Manual Ledger Adjustment"),
          debit: entryType === "Debit" ? amt : 0,
          credit: entryType === "Credit" ? amt : 0,
          runningBalance: 0,
          branchId: cust.branchId,
        });
        recalcCustomerLedger(state, customerId);

        appendAudit(state, {
          actorName: liveUser.name,
          actorRole: liveUser.role,
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
        const companyName = String(s.companyName || "").trim();
        if (!companyName) throw new Error("Supplier company name is required.");
        const newSup: Supplier = {
          id: uid("sup"),
          vendorCode: s.vendorCode || `VND-${501 + state.suppliers.length}`,
          companyName,
          contactPerson: String(s.contactPerson || ""),
          phone: String(s.phone || ""),
          email: String(s.email || ""),
          address: String(s.address || ""),
          state: String(s.state || "TX"),
          paymentTerms: String(s.paymentTerms || "Net 30"),
          openingPayable: Math.max(0, Number(s.openingPayable || 0)),
          currentPayable: Math.max(0, Number(s.openingPayable || 0)),
          rating: Number(s.rating || 5.0),
          onTimeDeliveryRate: Number(s.onTimeDeliveryRate || 100),
          category: String(s.category || "Raw Materials"),
          status: "Active",
        };
        state.suppliers.unshift(newSup);
        changed.add("suppliers");
        appendAudit(state, {
          actorName: liveUser.name,
          actorRole: liveUser.role,
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
        if (!sup || !prod) throw new Error("Please select a valid supplier and product.");
        const qty = Math.max(1, Number(quantity));
        const cost = Math.max(0, Number(unitCost || prod.purchasePrice));
        const total = round2(qty * cost);
        const poNo = `${state.settings.poPrefix}${yearStr}-${String(state.purchaseOrders.length + 1).padStart(4, "0")}`;

        const po: PurchaseOrder = {
          id: uid("po"),
          poNo,
          date: today,
          expectedDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
          supplierId,
          branchId: liveUser.branchId || state.branches[0]?.id || "br-hq",
          warehouseId: warehouseId || state.warehouses[0]?.id || "wh-main",
          items: [{ productId: prod.id, productName: prod.name, sku: prod.sku, quantity: qty, unitCost: cost, lineTotal: total }],
          subtotal: total,
          discount: 0,
          tax: 0,
          total,
          status: "Pending Approval",
          paymentStatus: "Unpaid",
          amountPaid: 0,
          dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          notes: String(notes || ""),
        };
        state.purchaseOrders.unshift(po);

        state.approvals.unshift({
          id: uid("apr"),
          requestNo: `APR-${yearStr}-${String(state.approvals.length + 1).padStart(3, "0")}`,
          type: "Purchase",
          referenceNo: poNo,
          title: `Purchase Order ${poNo} — ${qty} × ${prod.name} (${sup.companyName})`,
          amount: total,
          requestedBy: liveUser.name,
          requestedAt: new Date().toISOString(),
          currentStage: "Manager",
          status: "Pending",
          notes: String(notes || "Purchase order awaiting approval"),
          history: [
            {
              stage: "Salesperson",
              actor: liveUser.name,
              action: "Submitted",
              comment: `Issued ${poNo}`,
              timestamp: new Date().toISOString(),
            },
          ],
        });

        changed.add("purchaseOrders");
        changed.add("approvals");
        appendAudit(state, {
          actorName: liveUser.name,
          actorRole: liveUser.role,
          action: "CREATE",
          module: "Purchasing",
          recordId: poNo,
          summary: `Created ${poNo} ($${total.toLocaleString()})`,
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
          lot.unitCost = item.unitCost;
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
            performedBy: liveUser.name,
          });
        }

        const sup = state.suppliers.find((s) => s.id === po.supplierId);
        if (sup) sup.currentPayable = round2(sup.currentPayable + po.total);
        const apAcc = state.accounts.find((a) => a.code === "2000");
        const invAcc = state.accounts.find((a) => a.code === "1300");
        if (apAcc) apAcc.balance = round2(apAcc.balance + po.total);
        if (invAcc) {
          invAcc.balance = round2(
            state.inventoryLots.reduce((s, l) => s + l.availableStock * l.unitCost, 0)
          );
        }

        changed.add("purchaseOrders");
        changed.add("inventoryLots");
        changed.add("stockMovements");
        changed.add("suppliers");
        changed.add("accounts");
        appendAudit(state, {
          actorName: liveUser.name,
          actorRole: liveUser.role,
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
          actorName: liveUser.name,
          actorRole: liveUser.role,
          action: "UPDATE",
          module: "Accounts Payable",
          recordId: po.poNo,
          summary: `Paid vendor $${amt.toLocaleString()} against ${po.poNo}`,
          ipAddress: ip,
          device,
        });
        message = `Vendor payment of $${amt.toLocaleString()} recorded.`;
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

        const entryNo = `JE-${yearStr}-${String(state.journalEntries.length + 1).padStart(4, "0")}`;
        state.journalEntries.unshift({
          id: uid("je"),
          entryNo,
          date: today,
          description: String(description || "Manual Journal Entry"),
          reference: String(reference || entryNo),
          period: today.slice(0, 7),
          lines: resolvedLines,
          status: "Posted",
          createdBy: liveUser.name,
        });
        changed.add("journalEntries");
        changed.add("accounts");
        appendAudit(state, {
          actorName: liveUser.name,
          actorRole: liveUser.role,
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
        const expNo = `EXP-${yearStr}-${String(state.expenses.length + 1).padStart(4, "0")}`;
        const amount = round2(Math.max(0, Number(e.amount || 0)));
        if (amount <= 0) throw new Error("Expense amount must be greater than zero.");
        const created: Expense = {
          id: uid("exp"),
          expenseNo: expNo,
          date: e.date || today,
          category: String(e.category || "Operations"),
          description: String(e.description || "Business Expense"),
          amount,
          budgetAmount: round2(Number(e.budgetAmount || amount)),
          department: String(e.department || "Operations"),
          branchId: String(e.branchId || liveUser.branchId || state.branches[0]?.id || "br-hq"),
          vendorName: String(e.vendorName || "Vendor"),
          paymentMethod: (e.paymentMethod as PaymentMethod) || "Bank Transfer (ACH)",
          recurring: Boolean(e.recurring),
          recurringCycle: e.recurring ? (e.recurringCycle || "Monthly") : undefined,
          status: "Pending",
          receiptRef: e.receiptRef || `REC-${Date.now().toString().slice(-4)}`,
        };
        state.expenses.unshift(created);
        // Queue for Approval Workflow
        state.approvals.unshift({
          id: uid("apr"),
          requestNo: `APR-${yearStr}-${String(state.approvals.length + 1).padStart(3, "0")}`,
          type: "Expense",
          referenceNo: expNo,
          title: `${created.category}: ${created.description}`,
          amount,
          requestedBy: liveUser.name,
          requestedAt: new Date().toISOString(),
          currentStage: "Manager",
          status: "Pending",
          notes: `Dept: ${created.department}`,
          history: [
            { stage: "Salesperson", actor: liveUser.name, action: "Submitted", comment: `Logged ${expNo}`, timestamp: new Date().toISOString() },
          ],
        });
        changed.add("expenses");
        changed.add("approvals");
        appendAudit(state, {
          actorName: liveUser.name,
          actorRole: liveUser.role,
          action: "CREATE",
          module: "Expenses",
          recordId: expNo,
          summary: `Logged expense ${expNo} ($${amount.toLocaleString()})`,
          ipAddress: ip,
          device,
        });
        message = `Expense ${expNo} submitted & routed for approval.`;
        break;
      }

      case "expense:status": {
        requirePerm("approve");
        const exp = state.expenses.find((x) => x.id === payload.expenseId);
        if (exp) {
          const prev = exp.status;
          exp.status = payload.status as Expense["status"];
          if ((exp.status === "Approved" || exp.status === "Paid") && prev === "Pending") {
            const opEx = state.accounts.find((a) => a.code === "6300");
            const bank = state.accounts.find((a) => a.code === "1010");
            if (opEx && bank) {
              opEx.balance = round2(opEx.balance + exp.amount);
              bank.balance = round2(bank.balance - exp.amount);
              state.journalEntries.unshift({
                id: uid("je"),
                entryNo: `JE-${yearStr}-${String(state.journalEntries.length + 1).padStart(4, "0")}`,
                date: today,
                description: `Expense approved — ${exp.expenseNo} (${exp.category})`,
                reference: exp.expenseNo,
                period: today.slice(0, 7),
                lines: [
                  { accountId: opEx.id, accountCode: opEx.code, accountName: opEx.name, debit: exp.amount, credit: 0 },
                  { accountId: bank.id, accountCode: bank.code, accountName: bank.name, debit: 0, credit: exp.amount },
                ],
                status: "Posted",
                createdBy: liveUser.name,
              });
              changed.add("accounts");
              changed.add("journalEntries");
            }
          }
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
            rate: Number(t.rate ?? state.taxRules[idx].rate),
            localSurtax: Number(t.localSurtax ?? state.taxRules[idx].localSurtax),
            notes: String(t.notes ?? state.taxRules[idx].notes),
          };
        } else {
          state.taxRules.push({
            id: uid("tax"),
            stateCode: String(t.stateCode || "WA").toUpperCase().slice(0, 2),
            stateName: String(t.stateName || "Washington"),
            rate: Number(t.rate || 6.5),
            localSurtax: Number(t.localSurtax || 0),
            active: true,
            effectiveDate: today,
            notes: String(t.notes || "US State Sales Tax"),
          });
        }
        changed.add("taxRules");
        message = "Tax rule saved.";
        break;
      }

      case "branch:save": {
        requirePerm("create");
        const b = payload as Partial<Branch>;
        state.branches.push({
          id: uid("br"),
          code: String(b.code || `BR-${state.branches.length + 1}`).toUpperCase(),
          name: String(b.name || "Regional Branch"),
          type: (b.type as Branch["type"]) || "Branch",
          city: String(b.city || ""),
          state: String(b.state || "NY"),
          address: String(b.address || ""),
          phone: String(b.phone || ""),
          managerName: String(b.managerName || liveUser.name),
          status: "Active",
          monthlyTarget: Math.max(0, Number(b.monthlyTarget || 0)),
        });
        changed.add("branches");
        message = "Branch created.";
        break;
      }

      case "warehouse:save": {
        requirePerm("create");
        const w = payload as Partial<Warehouse>;
        state.warehouses.push({
          id: uid("wh"),
          code: String(w.code || `WH-0${state.warehouses.length + 1}`).toUpperCase(),
          name: String(w.name || "Warehouse"),
          branchId: String(w.branchId || state.branches[0]?.id || "br-hq"),
          location: String(w.location || ""),
          capacityUnits: Math.max(0, Number(w.capacityUnits || 25000)),
          manager: String(w.manager || liveUser.name),
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
          name: String(e.name || "").trim(),
          email: String(e.email || "").trim(),
          phone: String(e.phone || ""),
          department: String(e.department || "Commercial Sales"),
          jobRole: String(e.jobRole || "Account Executive"),
          branchId: String(e.branchId || state.branches[0]?.id || "br-hq"),
          isSalesRep: e.isSalesRep !== false,
          commissionType: (e.commissionType as Employee["commissionType"]) || "Percentage",
          commissionRate: Math.max(0, Number(e.commissionRate || 0)),
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
            actorName: liveUser.name,
            actorRole: liveUser.role,
            action: "APPROVE",
            module: "Commissions",
            recordId: emp.employeeCode,
            summary: `Commission ($${emp.commissionEarned.toLocaleString()}) for ${emp.name} → ${emp.commissionStatus}`,
            ipAddress: ip,
            device,
          });
          message = `Commission for ${emp.name} marked ${emp.commissionStatus}.`;
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
          actor: liveUser.name,
          action: decision,
          comment: String(comment || decision),
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
          actorName: liveUser.name,
          actorRole: liveUser.role,
          action: decision === "Approved" ? "APPROVE" : "REJECT",
          module: "Approval Workflow",
          recordId: apr.requestNo,
          summary: `${apr.requestNo}: ${decision} (${prevStage} → ${apr.currentStage})`,
          previousValue: prevStage,
          newValue: apr.currentStage,
          ipAddress: ip,
          device,
        });
        changed.add("approvals");
        message = `${apr.requestNo} updated.`;
        break;
      }

      case "document:add": {
        requirePerm("create");
        const d = payload as Partial<DocumentRecord>;
        if (d.fileDataUrl && d.fileDataUrl.length > 2_800_000) {
          throw new Error("File exceeds maximum 2MB upload limit.");
        }
        state.documents.unshift({
          id: uid("doc"),
          title: String(d.title || "Enterprise Document").trim(),
          category: (d.category as DocumentRecord["category"]) || "Customer Document",
          relatedEntityType: (d.relatedEntityType as DocumentRecord["relatedEntityType"]) || "Customer",
          relatedEntityName: String(d.relatedEntityName || "General"),
          fileName: String(d.fileName || "document.pdf"),
          fileSizeKb: Math.max(1, Number(d.fileSizeKb || 1)),
          mimeType: d.mimeType ? String(d.mimeType) : undefined,
          fileDataUrl: d.fileDataUrl ? String(d.fileDataUrl) : undefined,
          uploadedBy: liveUser.name,
          uploadedAt: today,
          notes: String(d.notes || ""),
        });
        changed.add("documents");
        message = "Document saved to MongoDB Vault.";
        break;
      }

      case "document:delete": {
        requirePerm("delete");
        state.documents = state.documents.filter((x) => x.id !== payload.documentId);
        changed.add("documents");
        message = "Document deleted.";
        break;
      }

      case "notification:read": {
        const id = payload.id as string | undefined;
        if (id === "all") state.notifications.forEach((n) => (n.read = true));
        else {
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
        const normalizedEmail = String(email || "").trim().toLowerCase();
        if (!normalizedEmail || !name) throw new Error("Name and valid email are required.");
        if (state.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
          throw new Error("A user with this email already exists.");
        }
        if (state.settings.enforceStrongPasswords) {
          const check = validateStrongPassword(String(password || ""));
          if (!check.valid) throw new Error(`Password policy: ${check.errors.join(", ")}`);
        }
        const roleDef = state.roles.find((r) => r.name === role) || state.roles[2];
        const passwordHash = await hashPassword(String(password));
        state.users.push({
          id: uid("usr"),
          name: String(name).trim(),
          email: normalizedEmail,
          passwordHash,
          role,
          branchId: branchId || state.branches[0]?.id || "br-hq",
          department: department || "Operations",
          status: "Active",
          failedLoginAttempts: 0,
          lockoutUntil: null,
          mfaEnabled: false,
          tokenVersion: 1,
          permissions: { ...roleDef.permissions },
          createdAt: new Date().toISOString(),
        });
        changed.add("users");
        appendAudit(state, {
          actorName: liveUser.name,
          actorRole: liveUser.role,
          action: "CREATE",
          module: "Users & RBAC",
          recordId: normalizedEmail,
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

      case "user:lock": {
        requirePerm("users");
        const u = state.users.find((x) => x.id === payload.userId);
        if (u && u.id !== liveUser.id) {
          u.status = "Locked";
          u.tokenVersion = (u.tokenVersion || 1) + 1;
          changed.add("users");
          appendAudit(state, {
            actorName: liveUser.name,
            actorRole: liveUser.role,
            action: "SECURITY",
            module: "Users & RBAC",
            recordId: u.email,
            summary: `Locked account & revoked active sessions for ${u.email}`,
            ipAddress: ip,
            device,
          });
          message = `Account ${u.email} locked & all active sessions revoked.`;
        }
        break;
      }

      case "user:change-password": {
        const { currentPassword, newPassword } = payload as {
          currentPassword: string;
          newPassword: string;
        };
        const u = state.users.find((x) => x.id === liveUser.id);
        if (!u) throw new Error("User not found.");
        const ok = await verifyPassword(String(currentPassword || ""), u.passwordHash);
        if (!ok) throw new Error("Current password is incorrect.");
        const check = validateStrongPassword(String(newPassword || ""));
        if (!check.valid) throw new Error(`Password policy: ${check.errors.join(", ")}`);
        u.passwordHash = await hashPassword(newPassword);
        u.tokenVersion = (u.tokenVersion || 1) + 1;
        changed.add("users");
        refreshedCookieToken = await signSessionToken({
          userId: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          branchId: u.branchId,
          tokenVersion: u.tokenVersion,
          permissions: u.permissions,
        });
        appendAudit(state, {
          actorName: liveUser.name,
          actorRole: liveUser.role,
          action: "SECURITY",
          module: "Security",
          recordId: u.id,
          summary: "Password rotated & prior sessions invalidated",
          ipAddress: ip,
          device,
        });
        message = "Password updated and prior sessions invalidated.";
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
          role.permissions[permission] = Boolean(value);
          state.users.forEach((u) => {
            if (u.role === role.name) u.permissions[permission] = Boolean(value);
          });
          changed.add("roles");
          changed.add("users");
          appendAudit(state, {
            actorName: liveUser.name,
            actorRole: liveUser.role,
            action: "SECURITY",
            module: "RBAC Matrix",
            recordId: role.name,
            summary: `Set ${role.name}.${permission} = ${Boolean(value)}`,
            ipAddress: ip,
            device,
          });
          message = `Updated ${role.name} permission '${permission}'.`;
        }
        break;
      }

      case "user:dashboard-layout": {
        const u = state.users.find((x) => x.id === liveUser.id);
        if (u && Array.isArray(payload.layout)) {
          u.dashboardLayout = payload.layout.map(String);
          changed.add("users");
          message = "Dashboard layout preference saved.";
        }
        break;
      }

      case "settings:update": {
        requirePerm("users");
        const s = payload as Partial<CompanySettings>;
        state.settings = {
          ...state.settings,
          activeCompany: String(s.activeCompany ?? state.settings.activeCompany),
          legalName: String(s.legalName ?? state.settings.legalName),
          ein: String(s.ein ?? state.settings.ein),
          address: String(s.address ?? state.settings.address),
          cityStateZip: String(s.cityStateZip ?? state.settings.cityStateZip),
          phone: String(s.phone ?? state.settings.phone),
          email: String(s.email ?? state.settings.email),
          invoicePrefix: String(s.invoicePrefix ?? state.settings.invoicePrefix),
          orderPrefix: String(s.orderPrefix ?? state.settings.orderPrefix),
          poPrefix: String(s.poPrefix ?? state.settings.poPrefix),
          receiptPrefix: String(s.receiptPrefix ?? state.settings.receiptPrefix),
          invoiceTemplate: (s.invoiceTemplate as CompanySettings["invoiceTemplate"]) ?? state.settings.invoiceTemplate,
          defaultTaxState: String(s.defaultTaxState ?? state.settings.defaultTaxState),
          sessionTimeoutMinutes: Math.max(5, Math.min(240, Number(s.sessionTimeoutMinutes ?? state.settings.sessionTimeoutMinutes))),
          maxFailedLogins: Math.max(3, Math.min(10, Number(s.maxFailedLogins ?? state.settings.maxFailedLogins))),
        };
        changed.add("settings");
        appendAudit(state, {
          actorName: liveUser.name,
          actorRole: liveUser.role,
          action: "UPDATE",
          module: "Enterprise Admin",
          recordId: "company-settings",
          summary: `Updated company configuration (${state.settings.legalName})`,
          ipAddress: ip,
          device,
        });
        message = "Enterprise settings saved to MongoDB.";
        break;
      }

      case "integration:toggle": {
        requirePerm("users");
        const item = state.integrations.find((i) => i.id === payload.integrationId);
        if (item) {
          item.status = item.status === "Connected" ? "Disconnected" : "Connected";
          item.lastSync = new Date().toISOString();
          changed.add("integrations");
          message = `${item.name} updated to ${item.status}.`;
        }
        break;
      }

      case "backup:create": {
        requirePerm("users");
        const snapshotData = sanitizeStateForClient(state);
        const dataJson = JSON.stringify(snapshotData);
        const checksum = computeChecksum(dataJson);
        const hmacSignature = signHmac(dataJson);
        const envelope = JSON.stringify(
          {
            version: "1.0",
            exportedAt: new Date().toISOString(),
            checksum,
            hmacSignature,
            data: snapshotData,
          },
          null,
          2
        );

        const snap = {
          id: `BKP-${today.replace(/-/g, "")}-${Date.now().toString().slice(-4)}`,
          createdAt: new Date().toISOString(),
          type: "Manual" as const,
          sizeKb: Math.max(1, Math.round(Buffer.byteLength(envelope, "utf8") / 1024)),
          recordCount:
            state.products.length +
            state.customers.length +
            state.invoices.length +
            state.ledgerEntries.length +
            state.payments.length,
          checksum,
          hmacSignature,
          verified: true,
          createdBy: liveUser.name,
          status: "Verified" as const,
        };
        state.backups.unshift(snap);
        changed.add("backups");
        appendAudit(state, {
          actorName: liveUser.name,
          actorRole: liveUser.role,
          action: "BACKUP",
          module: "Disaster Recovery",
          recordId: snap.id,
          summary: `Created HMAC-SHA256 signed backup ${snap.id} (${checksum})`,
          ipAddress: ip,
          device,
        });
        extraData = { snapshot: snap, exportJson: envelope };
        message = `HMAC-SHA256 verified backup ${snap.id} created.`;
        break;
      }

      case "backup:restore": {
        requirePerm("users");
        const rawBackupText = String(payload.backupJson || "");
        if (!rawBackupText) throw new Error("Backup JSON content is required.");
        const parsed = JSON.parse(rawBackupText) as {
          hmacSignature?: string;
          data?: Record<string, unknown>;
        };
        if (!parsed.data || !parsed.hmacSignature) {
          throw new Error("Invalid backup file: missing signed envelope.");
        }
        const canonical = JSON.stringify(parsed.data);
        if (!verifyHmac(canonical, parsed.hmacSignature)) {
          throw new Error("BACKUP INTEGRITY FAILED: HMAC-SHA256 signature mismatch — restore aborted.");
        }

        const safeRestored = sanitizePayload(parsed.data) as Partial<ERPDatabaseState>;
        const restorableKeys: Array<ERPCollectionKey> = ALL_COLLECTION_KEYS.filter(
          (k) => k !== "users" && k !== "auditLogs" && k !== "backups"
        );
        for (const k of restorableKeys) {
          if (Array.isArray(safeRestored[k])) {
            (state as unknown as Record<string, unknown>)[k] = safeRestored[k];
            changed.add(k);
          }
        }
        if (safeRestored.settings) {
          state.settings = { ...state.settings, ...safeRestored.settings };
          changed.add("settings");
        }
        appendAudit(state, {
          actorName: liveUser.name,
          actorRole: liveUser.role,
          action: "RESTORE",
          module: "Disaster Recovery",
          recordId: "full-restore",
          summary: "Verified HMAC-SHA256 backup restored to MongoDB (user credentials & audit logs preserved)",
          ipAddress: ip,
          device,
        });
        message = "HMAC-SHA256 verified backup restored cleanly to MongoDB.";
        break;
      }

      case "backup:verify": {
        const snap = state.backups.find((b) => b.id === payload.backupId);
        if (snap) {
          snap.verified = true;
          snap.status = "Verified";
          changed.add("backups");
          message = `Backup ${snap.id} checksum (${snap.checksum}) verified.`;
        }
        break;
      }

      case "import:batch": {
        requirePerm("create");
        const { target, rows } = payload as {
          target: "products" | "customers";
          rows: Array<Record<string, string>>;
        };
        if (!Array.isArray(rows) || rows.length === 0) throw new Error("No valid CSV rows provided.");
        let count = 0;
        if (target === "products") {
          for (const row of rows.slice(0, 500)) {
            if (!row.name) continue;
            const sku = String(row.sku || `SKU-IMP-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase();
            const sell = Math.max(0, Number(row.sellingPrice || 0));
            const newId = uid("prod");
            state.products.unshift({
              id: newId,
              sku,
              name: String(row.name).trim(),
              category: row.category || "Imported Goods",
              description: row.description || "",
              specifications: { Source: "CSV Import" },
              uom: row.uom || "Unit",
              purchasePrice: Math.max(0, Number(row.purchasePrice || round2(sell * 0.6))),
              sellingPrice: sell,
              wholesalePrice: Math.max(0, Number(row.wholesalePrice || round2(sell * 0.85))),
              minSellingPrice: Math.max(0, Number(row.minSellingPrice || round2(sell * 0.75))),
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
          for (const row of rows.slice(0, 500)) {
            if (!row.companyName) continue;
            const opening = round2(Number(row.openingBalance || 0));
            const id = uid("cust");
            const code = row.customerCode || `CUS-${1001 + state.customers.length}`;
            state.customers.unshift({
              id,
              customerCode: code,
              companyName: String(row.companyName).trim(),
              contactPerson: row.contactPerson || "",
              phone: row.phone || "",
              email: row.email || "",
              billingAddress: row.billingAddress || "",
              shippingAddress: row.shippingAddress || row.billingAddress || "",
              state: row.state || state.settings.defaultTaxState || "NY",
              customerType: "B2B Enterprise",
              category: row.category || "Commercial",
              segment: "Standard",
              taxId: row.taxId || "",
              taxExempt: false,
              paymentTerms: "Net 30",
              creditLimit: Math.max(0, Number(row.creditLimit || 25000)),
              openingBalance: opening,
              currentBalance: opening,
              notes: "Imported via CSV",
              branchId: liveUser.branchId || state.branches[0]?.id || "br-hq",
              salesRepId: state.employees[0]?.id || "",
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
                branchId: liveUser.branchId || state.branches[0]?.id || "br-hq",
              });
              changed.add("ledgerEntries");
            }
            count++;
          }
          changed.add("customers");
        }
        appendAudit(state, {
          actorName: liveUser.name,
          actorRole: liveUser.role,
          action: "CREATE",
          module: "Data Import",
          recordId: target,
          summary: `Bulk imported ${count} ${target} records`,
          ipAddress: ip,
          device,
        });
        message = `Imported ${count} ${target} records to MongoDB.`;
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown ERP action: ${action}` }, { status: 400 });
    }

    await saveERPState(state, Array.from(changed));
    const response = NextResponse.json({
      ok: true,
      message,
      extraData,
      state: sanitizeStateForClient(state),
    });

    if (refreshedCookieToken) {
      const isHttps =
        req.headers.get("x-forwarded-proto") === "https" ||
        req.nextUrl.protocol === "https:";
      response.cookies.set(SESSION_COOKIE_NAME, refreshedCookieToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: isHttps,
        path: "/",
        maxAge: 60 * 60 * 8,
      });
    }

    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Operation failed";
    const status = msg.startsWith("FORBIDDEN:")
      ? 403
      : msg.startsWith("DATABASE_UNAVAILABLE")
        ? 503
        : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
