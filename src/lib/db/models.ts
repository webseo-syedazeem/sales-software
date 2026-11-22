import mongoose, { Schema, Model } from "mongoose";

function createFlexibleModel(modelName: string, collectionName: string): Model<Record<string, unknown>> {
  if (mongoose.models[modelName]) {
    return mongoose.models[modelName] as Model<Record<string, unknown>>;
  }
  const schema = new Schema<Record<string, unknown>>(
    {
      id: { type: String, required: true, unique: true, index: true },
    },
    {
      strict: false,
      collection: collectionName,
      timestamps: false,
      versionKey: false,
    }
  );
  return mongoose.model<Record<string, unknown>>(modelName, schema);
}

export const ERPModels = {
  settings: () => createFlexibleModel("ERPSettings", "settings"),
  roles: () => createFlexibleModel("ERPRole", "roles"),
  users: () => createFlexibleModel("ERPUser", "users"),
  branches: () => createFlexibleModel("ERPBranch", "branches"),
  warehouses: () => createFlexibleModel("ERPWarehouse", "warehouses"),
  products: () => createFlexibleModel("ERPProduct", "products"),
  inventoryLots: () => createFlexibleModel("ERPInventoryLot", "inventory_lots"),
  stockMovements: () => createFlexibleModel("ERPStockMovement", "stock_movements"),
  customers: () => createFlexibleModel("ERPCustomer", "customers"),
  salesOrders: () => createFlexibleModel("ERPSalesOrder", "sales_orders"),
  invoices: () => createFlexibleModel("ERPInvoice", "invoices"),
  ledgerEntries: () => createFlexibleModel("ERPLedgerEntry", "ledger_entries"),
  payments: () => createFlexibleModel("ERPPayment", "payments"),
  suppliers: () => createFlexibleModel("ERPSupplier", "suppliers"),
  purchaseOrders: () => createFlexibleModel("ERPPurchaseOrder", "purchase_orders"),
  accounts: () => createFlexibleModel("ERPAccount", "accounts"),
  journalEntries: () => createFlexibleModel("ERPJournalEntry", "journal_entries"),
  expenses: () => createFlexibleModel("ERPExpense", "expenses"),
  taxRules: () => createFlexibleModel("ERPTaxRule", "tax_rules"),
  employees: () => createFlexibleModel("ERPEmployee", "employees"),
  approvals: () => createFlexibleModel("ERPApproval", "approvals"),
  documents: () => createFlexibleModel("ERPDocument", "documents"),
  notifications: () => createFlexibleModel("ERPNotification", "notifications"),
  auditLogs: () => createFlexibleModel("ERPAuditLog", "audit_logs"),
  backups: () => createFlexibleModel("ERPBackup", "backups"),
  emailLogs: () => createFlexibleModel("ERPEmailLog", "email_logs"),
  integrations: () => createFlexibleModel("ERPIntegration", "integrations"),
};

export type ERPCollectionKey = Exclude<keyof typeof ERPModels, "settings">;
