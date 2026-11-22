export type RoleName =
  | "Admin"
  | "Manager"
  | "Sales Staff"
  | "Accountant"
  | "Inventory Manager"
  | "Cashier"
  | "Purchasing Staff"
  | "Auditor"
  | "Custom";

export type PermissionKey =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "export"
  | "print"
  | "refund"
  | "financials"
  | "reports"
  | "users";

export interface RoleDefinition {
  id: string;
  name: RoleName;
  description: string;
  permissions: Record<PermissionKey, boolean>;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: RoleName;
  branchId: string;
  department: string;
  status: "Active" | "Locked" | "Inactive";
  failedLoginAttempts: number;
  lockoutUntil?: string | null;
  lastLoginAt?: string | null;
  lastLoginIp?: string | null;
  mfaEnabled: boolean;
  permissions: Record<PermissionKey, boolean>;
  dashboardLayout?: string[];
  createdAt: string;
}

export interface SafeUser extends Omit<UserAccount, "passwordHash"> {}

export interface Branch {
  id: string;
  code: string;
  name: string;
  type: "Headquarters" | "Branch" | "Office" | "Warehouse";
  city: string;
  state: string;
  address: string;
  phone: string;
  managerName: string;
  status: "Active" | "Inactive";
  monthlyTarget: number;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  branchId: string;
  location: string;
  capacityUnits: number;
  manager: string;
  status: "Active" | "Inactive";
}

export interface ProductVariant {
  id: string;
  name: string;
  skuSuffix: string;
  attribute: string;
  priceDelta: number;
  stock: number;
}

export interface ProductPriceLevel {
  tier: "Retail" | "Wholesale" | "Distributor" | "Enterprise VIP";
  price: number;
  minQty: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  description: string;
  imageUrl?: string;
  specifications: Record<string, string>;
  uom: string;
  purchasePrice: number;
  sellingPrice: number;
  wholesalePrice: number;
  minSellingPrice: number;
  taxable: boolean;
  taxCategory: string;
  status: "Active" | "Inactive";
  barcode: string;
  qrCode: string;
  variants: ProductVariant[];
  attributes: string[];
  pricingLevels: ProductPriceLevel[];
  minStockLevel: number;
  maxStockLevel: number;
  reorderLevel: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryLot {
  id: string;
  productId: string;
  warehouseId: string;
  batchNo: string;
  lotNo: string;
  serialPrefix: string;
  openingStock: number;
  availableStock: number;
  reservedStock: number;
  damagedStock: number;
  returnedStock: number;
  unitCost: number;
  receivedDate: string;
  expiryDate?: string;
}

export interface StockMovement {
  id: string;
  date: string;
  productId: string;
  warehouseId: string;
  toWarehouseId?: string;
  type: "Opening" | "Stock In" | "Stock Out" | "Transfer" | "Adjustment" | "Damaged" | "Returned" | "Audit";
  quantity: number;
  previousQty: number;
  newQty: number;
  unitCost: number;
  referenceNo: string;
  batchNo?: string;
  notes: string;
  performedBy: string;
}

export interface CRMTask {
  id: string;
  title: string;
  dueDate: string;
  priority: "High" | "Medium" | "Low";
  status: "Open" | "Completed";
  assignedTo: string;
  type: "Follow-up" | "Payment Reminder" | "Call" | "Meeting";
}

export interface CRMNote {
  id: string;
  date: string;
  author: string;
  channel: "Phone" | "Email" | "In-Person" | "SMS" | "Note";
  summary: string;
}

export interface Customer {
  id: string;
  customerCode: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  billingAddress: string;
  shippingAddress: string;
  state: string;
  customerType: "B2B Enterprise" | "Wholesale" | "Distributor" | "Retail";
  category: string;
  segment: "VIP" | "High-Value" | "Standard" | "At-Risk";
  taxId: string;
  taxExempt: boolean;
  paymentTerms: "Due on Receipt" | "Net 15" | "Net 30" | "Net 45" | "Net 60";
  creditLimit: number;
  openingBalance: number;
  currentBalance: number;
  notes: string;
  branchId: string;
  salesRepId: string;
  tasks: CRMTask[];
  communications: CRMNote[];
  createdAt: string;
}

export type OrderStatus =
  | "Draft"
  | "Pending"
  | "Confirmed"
  | "Processing"
  | "Completed"
  | "Cancelled"
  | "Returned";

export interface OrderLineItem {
  productId: string;
  sku: string;
  productName: string;
  uom: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxable: boolean;
  lineTotal: number;
  costBasis: number;
}

export interface SalesOrder {
  id: string;
  orderNo: string;
  date: string;
  customerId: string;
  branchId: string;
  warehouseId: string;
  salesRepId: string;
  items: OrderLineItem[];
  subtotal: number;
  discountTotal: number;
  taxRate: number;
  taxTotal: number;
  grandTotal: number;
  status: OrderStatus;
  paymentStatus: "Unpaid" | "Partial" | "Paid" | "Refunded";
  invoiceId?: string;
  notes: string;
  createdBy: string;
}

export type InvoiceStatus =
  | "Draft"
  | "Sent"
  | "Partial"
  | "Paid"
  | "Overdue"
  | "Cancelled"
  | "Refunded"
  | "Credited";

export interface Invoice {
  id: string;
  invoiceNo: string;
  orderId?: string;
  customerId: string;
  branchId: string;
  salesRepId: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: string;
  billingAddress: string;
  shippingAddress: string;
  items: OrderLineItem[];
  subtotal: number;
  discountTotal: number;
  taxState: string;
  taxRate: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  status: InvoiceStatus;
  notes: string;
  termsAndConditions: string;
  collectionNotes?: string;
  lastReminderSentAt?: string;
}

export interface LedgerEntry {
  id: string;
  customerId: string;
  date: string;
  type: "Opening" | "Sale" | "Payment" | "Return" | "Adjustment" | "Credit Note";
  referenceNo: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  branchId: string;
}

export type PaymentMethod = "Cash" | "Bank Transfer (ACH)" | "Check" | "Credit Card" | "Online Portal";

export interface PaymentAllocation {
  invoiceId: string;
  invoiceNo: string;
  amount: number;
}

export interface Payment {
  id: string;
  receiptNo: string;
  date: string;
  customerId: string;
  branchId: string;
  method: PaymentMethod;
  paymentType: "Standard" | "Partial" | "Advance" | "Refund" | "Reversal";
  amount: number;
  reference: string;
  allocations: PaymentAllocation[];
  reconciled: boolean;
  notes: string;
  recordedBy: string;
}

export interface Supplier {
  id: string;
  vendorCode: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  state: string;
  paymentTerms: string;
  openingPayable: number;
  currentPayable: number;
  rating: number;
  onTimeDeliveryRate: number;
  category: string;
  status: "Active" | "Inactive";
}

export interface PurchaseOrder {
  id: string;
  poNo: string;
  date: string;
  expectedDate: string;
  supplierId: string;
  branchId: string;
  warehouseId: string;
  items: {
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    unitCost: number;
    lineTotal: number;
  }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  status: "Draft" | "Pending Approval" | "Approved" | "Received" | "Returned" | "Cancelled";
  paymentStatus: "Unpaid" | "Partial" | "Paid";
  amountPaid: number;
  dueDate: string;
  notes: string;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";
  subType: string;
  balance: number;
  reconciled: boolean;
  active: boolean;
}

export interface JournalEntry {
  id: string;
  entryNo: string;
  date: string;
  description: string;
  reference: string;
  period: string;
  lines: {
    accountId: string;
    accountCode: string;
    accountName: string;
    debit: number;
    credit: number;
  }[];
  status: "Posted" | "Draft";
  createdBy: string;
}

export interface Expense {
  id: string;
  expenseNo: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  budgetAmount: number;
  department: string;
  branchId: string;
  employeeId?: string;
  vendorName: string;
  paymentMethod: PaymentMethod;
  recurring: boolean;
  recurringCycle?: "Monthly" | "Quarterly" | "Yearly";
  status: "Pending" | "Approved" | "Paid" | "Rejected";
  receiptRef?: string;
}

export interface TaxRule {
  id: string;
  stateCode: string;
  stateName: string;
  rate: number;
  localSurtax: number;
  active: boolean;
  effectiveDate: string;
  notes: string;
}

export interface Employee {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  jobRole: string;
  branchId: string;
  isSalesRep: boolean;
  commissionType: "Percentage" | "Fixed" | "Product-Based";
  commissionRate: number;
  monthlySales: number;
  commissionEarned: number;
  commissionStatus: "Pending" | "Approved" | "Paid";
  attendanceRate: number;
  status: "Active" | "On Leave" | "Inactive";
  hiredDate: string;
}

export type ApprovalStage = "Salesperson" | "Manager" | "Finance" | "Completed";

export interface ApprovalRequest {
  id: string;
  requestNo: string;
  type:
    | "Sales Order"
    | "Discount"
    | "Refund"
    | "Purchase"
    | "Expense"
    | "Stock Adjustment"
    | "Credit Limit"
    | "Payment";
  referenceNo: string;
  title: string;
  amount: number;
  requestedBy: string;
  requestedAt: string;
  currentStage: ApprovalStage;
  status: "Pending" | "Approved" | "Rejected";
  notes: string;
  history: {
    stage: ApprovalStage;
    actor: string;
    action: "Submitted" | "Approved" | "Rejected";
    comment: string;
    timestamp: string;
  }[];
}

export interface DocumentRecord {
  id: string;
  title: string;
  category:
    | "Invoice"
    | "Purchase Document"
    | "Receipt"
    | "Customer Document"
    | "Agreement"
    | "Product Document"
    | "Payment Proof";
  relatedEntityType: "Customer" | "Product" | "Invoice" | "Supplier" | "Expense";
  relatedEntityName: string;
  fileName: string;
  fileSizeKb: number;
  uploadedBy: string;
  uploadedAt: string;
  notes: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  category:
    | "Low Stock"
    | "Overdue Invoice"
    | "Payment Received"
    | "New Order"
    | "Cancelled Order"
    | "Pending Approval"
    | "Failed Payment"
    | "Credit Limit"
    | "Stock Adjustment"
    | "System";
  severity: "info" | "warning" | "critical" | "success";
  read: boolean;
  createdAt: string;
  actionModule?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "APPROVE" | "REJECT" | "LOGIN" | "LOGOUT" | "BACKUP" | "RESTORE" | "EXPORT" | "SECURITY";
  module: string;
  recordId: string;
  summary: string;
  previousValue?: string;
  newValue?: string;
  ipAddress: string;
  device: string;
}

export interface BackupSnapshot {
  id: string;
  createdAt: string;
  type: "Automatic" | "Manual" | "Scheduled";
  sizeKb: number;
  recordCount: number;
  checksum: string;
  verified: boolean;
  createdBy: string;
  status: "Completed" | "Restored" | "Verified";
}

export interface EmailLog {
  id: string;
  sentAt: string;
  to: string;
  subject: string;
  template: "Invoice" | "Customer Statement" | "Payment Receipt" | "Overdue Reminder" | "Executive Report";
  referenceNo: string;
  status: "Delivered" | "Queued (SMTP Mock)";
}

export interface IntegrationItem {
  id: string;
  name: string;
  category: "Payment Gateway" | "Accounting" | "Email" | "SMS" | "E-Commerce" | "CRM" | "Shipping" | "Hardware" | "BI";
  status: "Connected" | "Configured" | "Disconnected";
  endpoint: string;
  lastSync?: string;
  description: string;
}

export interface CompanySettings {
  id: string;
  activeCompany: string;
  companies: string[];
  legalName: string;
  ein: string;
  address: string;
  cityStateZip: string;
  phone: string;
  email: string;
  website: string;
  currency: "USD";
  fiscalYearStart: string;
  invoicePrefix: string;
  orderPrefix: string;
  poPrefix: string;
  receiptPrefix: string;
  invoiceTemplate: "Classic Executive US" | "Modern Sapphire" | "Minimal Corporate";
  defaultTaxState: string;
  autoBackupSchedule: "Daily 02:00 EST" | "Every 6 Hours" | "Weekly Sunday";
  sessionTimeoutMinutes: number;
  maxFailedLogins: number;
  enforceStrongPasswords: boolean;
  emailSignature: string;
}

export interface ERPDatabaseState {
  settings: CompanySettings;
  roles: RoleDefinition[];
  users: UserAccount[];
  branches: Branch[];
  warehouses: Warehouse[];
  products: Product[];
  inventoryLots: InventoryLot[];
  stockMovements: StockMovement[];
  customers: Customer[];
  salesOrders: SalesOrder[];
  invoices: Invoice[];
  ledgerEntries: LedgerEntry[];
  payments: Payment[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  accounts: Account[];
  journalEntries: JournalEntry[];
  expenses: Expense[];
  taxRules: TaxRule[];
  employees: Employee[];
  approvals: ApprovalRequest[];
  documents: DocumentRecord[];
  notifications: NotificationItem[];
  auditLogs: AuditLog[];
  backups: BackupSnapshot[];
  emailLogs: EmailLog[];
  integrations: IntegrationItem[];
}
