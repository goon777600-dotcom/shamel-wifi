import {
  boolean,
  decimal,
  foreignKey,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const currencies = mysqlTable("currencies", {
  code: varchar("code", { length: 3 }).primaryKey(),
  nameAr: varchar("nameAr", { length: 50 }).notNull(),
  symbol: varchar("symbol", { length: 12 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const cashBalances = mysqlTable("cash_balances", {
  currencyCode: varchar("currencyCode", { length: 3 }).primaryKey().references(() => currencies.code),
  balance: decimal("balance", { precision: 18, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const cashAccounts = mysqlTable(
  "cash_accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    type: mysqlEnum("type", ["cash", "bank"]).notNull(),
    isSystem: boolean("isSystem").default(false).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    notes: text("notes"),
    createdByUserId: int("createdByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("cash_accounts_name_unique").on(table.name), index("cash_accounts_type_active_idx").on(table.type, table.isActive)],
);

export const cashAccountBalances = mysqlTable(
  "cash_account_balances",
  {
    cashAccountId: int("cashAccountId").notNull().references(() => cashAccounts.id),
    currencyCode: varchar("currencyCode", { length: 3 }).notNull().references(() => currencies.code),
    balance: decimal("balance", { precision: 18, scale: 2 }).notNull().default("0"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [primaryKey({ columns: [table.cashAccountId, table.currencyCode] }), index("cash_account_balances_currency_idx").on(table.currencyCode)],
);

export const backupSchedules = mysqlTable(
  "backup_schedules",
  {
    id: int("id").autoincrement().primaryKey(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    cronTaskUid: varchar("cronTaskUid", { length: 65 }).unique(),
    cronExpression: varchar("cronExpression", { length: 64 }).notNull(),
    isEnabled: boolean("isEnabled").default(true).notNull(),
    lastRunAt: timestamp("lastRunAt"),
    lastSuccessAt: timestamp("lastSuccessAt"),
    lastSuccessDate: varchar("lastSuccessDate", { length: 10 }),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("backup_schedules_owner_unique").on(table.createdByUserId), index("backup_schedules_task_uid_idx").on(table.cronTaskUid)],
);

export const backupScheduleRuns = mysqlTable(
  "backup_schedule_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    scheduleId: int("scheduleId").notNull().references(() => backupSchedules.id),
    runDate: varchar("runDate", { length: 10 }).notNull(),
    status: mysqlEnum("status", ["running", "success", "failed"]).notNull().default("running"),
    snapshotId: int("snapshotId").references(() => backupSnapshots.id),
    error: text("error"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    finishedAt: timestamp("finishedAt"),
  },
  table => [uniqueIndex("backup_schedule_runs_schedule_date_unique").on(table.scheduleId, table.runDate)],
);

export const appSettings = mysqlTable(
  "app_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerUserId: int("ownerUserId").notNull().references(() => users.id),
    whatsappTemplate: text("whatsappTemplate").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("app_settings_owner_unique").on(table.ownerUserId)],
);

export const accountCategories = mysqlTable(
  "account_categories",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    kind: mysqlEnum("kind", ["income", "expense", "asset", "liability", "equity", "other"])
      .notNull(),
    isSystem: boolean("isSystem").default(false).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("account_categories_name_kind_unique").on(table.name, table.kind),
    index("account_categories_kind_idx").on(table.kind),
  ],
);

export const movementCategories = mysqlTable(
  "movement_categories",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    kind: mysqlEnum("kind", ["sale", "receipt", "expense", "transfer", "adjustment"])
      .notNull(),
    accountCategoryId: int("accountCategoryId").references(() => accountCategories.id),
    isSystem: boolean("isSystem").default(false).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("movement_categories_name_kind_unique").on(table.name, table.kind),
    index("movement_categories_kind_idx").on(table.kind),
  ],
);

export const contacts = mysqlTable(
  "contacts",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    type: mysqlEnum("type", ["customer", "grocery", "supplier", "employee", "other"])
      .notNull()
      .default("customer"),
    phone: varchar("phone", { length: 32 }),
    address: varchar("address", { length: 300 }),
    notes: text("notes"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("contacts_type_idx").on(table.type), index("contacts_name_idx").on(table.name)],
);

export const servicePackages = mysqlTable(
  "service_packages",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    durationDays: int("durationDays").notNull().default(30),
    price: decimal("price", { precision: 18, scale: 2 }).notNull(),
    currencyCode: varchar("currencyCode", { length: 3 }).notNull().references(() => currencies.code),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("service_packages_active_idx").on(table.isActive)],
);

export const subscriptions = mysqlTable(
  "subscriptions",
  {
    id: int("id").autoincrement().primaryKey(),
    contactId: int("contactId").notNull().references(() => contacts.id),
    packageId: int("packageId").references(() => servicePackages.id),
    packageName: varchar("packageName", { length: 160 }).notNull(),
    startDate: timestamp("startDate").notNull(),
    endDate: timestamp("endDate").notNull(),
    status: mysqlEnum("status", ["active", "expiring", "expired", "suspended"]).notNull().default("active"),
    notes: text("notes"),
    invoiceId: int("invoiceId"),
    createdByUserId: int("createdByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("subscriptions_contact_idx").on(table.contactId), index("subscriptions_status_end_idx").on(table.status, table.endDate)],
);

export const individualSubscriptionAccounts = mysqlTable(
  "individual_subscription_accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    status: mysqlEnum("status", ["active", "suspended", "closed"]).notNull().default("active"),
    notes: text("notes"),
    createdByUserId: int("createdByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("individual_subscription_accounts_name_idx").on(table.name), index("individual_subscription_accounts_status_idx").on(table.status)],
);

export const individualSubscriptions = mysqlTable(
  "individual_subscriptions",
  {
    id: int("id").autoincrement().primaryKey(),
    accountId: int("accountId").notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    status: mysqlEnum("status", ["active", "suspended", "cancelled"]).notNull().default("active"),
    notes: text("notes"),
    createdByUserId: int("createdByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    foreignKey({ columns: [table.accountId], foreignColumns: [individualSubscriptionAccounts.id], name: "ind_subs_account_fk" }),
    index("individual_subscriptions_account_idx").on(table.accountId),
    index("individual_subscriptions_status_idx").on(table.status),
  ],
);

export const individualSubscriptionCharges = mysqlTable(
  "individual_subscription_charges",
  {
    id: int("id").autoincrement().primaryKey(),
    accountId: int("accountId").notNull(),
    subscriptionId: int("subscriptionId"),
    description: varchar("description", { length: 200 }).notNull(),
    currencyCode: varchar("currencyCode", { length: 3 }).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    paidAmount: decimal("paidAmount", { precision: 18, scale: 2 }).notNull().default("0"),
    discountAmount: decimal("discountAmount", { precision: 18, scale: 2 }).notNull().default("0"),
    status: mysqlEnum("status", ["unpaid", "partial", "paid", "cancelled"]).notNull().default("unpaid"),
    chargedAt: timestamp("chargedAt").notNull(),
    notes: text("notes"),
    createdByUserId: int("createdByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    foreignKey({ columns: [table.currencyCode], foreignColumns: [currencies.code], name: "ind_charge_currency_fk" }),
    foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "ind_charge_user_fk" }),
    foreignKey({ columns: [table.accountId], foreignColumns: [individualSubscriptionAccounts.id], name: "ind_charge_account_fk" }),
    foreignKey({ columns: [table.subscriptionId], foreignColumns: [individualSubscriptions.id], name: "ind_charge_sub_fk" }),
    index("ind_charge_account_idx").on(table.accountId),
    index("ind_charge_status_idx").on(table.status),
    index("ind_charge_date_idx").on(table.chargedAt),
  ],
);

export const individualSubscriptionAdjustments = mysqlTable(
  "individual_subscription_adjustments",
  {
    id: int("id").autoincrement().primaryKey(),
    accountId: int("accountId").notNull(),
    chargeId: int("chargeId").notNull(),
    type: mysqlEnum("type", ["discount"]).notNull().default("discount"),
    currencyCode: varchar("currencyCode", { length: 3 }).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    adjustmentDate: timestamp("adjustmentDate").notNull(),
    notes: text("notes"),
    createdByUserId: int("createdByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    foreignKey({ columns: [table.currencyCode], foreignColumns: [currencies.code], name: "ind_adj_currency_fk" }),
    foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "ind_adj_user_fk" }),
    foreignKey({ columns: [table.accountId], foreignColumns: [individualSubscriptionAccounts.id], name: "ind_adj_account_fk" }),
    foreignKey({ columns: [table.chargeId], foreignColumns: [individualSubscriptionCharges.id], name: "ind_adj_charge_fk" }),
    index("ind_adj_account_idx").on(table.accountId),
    index("ind_adj_charge_idx").on(table.chargeId),
    index("ind_adj_date_idx").on(table.adjustmentDate),
  ],
);

export const individualSubscriptionPayments = mysqlTable(
  "individual_subscription_payments",
  {
    id: int("id").autoincrement().primaryKey(),
    accountId: int("accountId").notNull(),
    chargeId: int("chargeId").notNull(),
    currencyCode: varchar("currencyCode", { length: 3 }).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    paymentDate: timestamp("paymentDate").notNull(),
    notes: text("notes"),
    createdByUserId: int("createdByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    foreignKey({ columns: [table.currencyCode], foreignColumns: [currencies.code], name: "ind_pay_currency_fk" }),
    foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "ind_pay_user_fk" }),
    foreignKey({ columns: [table.accountId], foreignColumns: [individualSubscriptionAccounts.id], name: "ind_pay_account_fk" }),
    foreignKey({ columns: [table.chargeId], foreignColumns: [individualSubscriptionCharges.id], name: "ind_pay_charge_fk" }),
    index("ind_pay_account_idx").on(table.accountId),
    index("ind_pay_charge_idx").on(table.chargeId),
    index("ind_pay_date_idx").on(table.paymentDate),
  ],
);

export const individualSubscriptionCashBalances = mysqlTable(
  "individual_subscription_cash_balances",
  {
    currencyCode: varchar("currencyCode", { length: 3 }).primaryKey(),
    balance: decimal("balance", { precision: 18, scale: 2 }).notNull().default("0"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [foreignKey({ columns: [table.currencyCode], foreignColumns: [currencies.code], name: "ind_cash_bal_currency_fk" })],
);

export const individualSubscriptionCashMovements = mysqlTable(
  "individual_subscription_cash_movements",
  {
    id: int("id").autoincrement().primaryKey(),
    direction: mysqlEnum("direction", ["in", "out"]).notNull(),
    type: mysqlEnum("type", ["payment", "opening_balance", "refund"]).notNull(),
    currencyCode: varchar("currencyCode", { length: 3 }).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    sourcePaymentId: int("sourcePaymentId"),
    occurredAt: timestamp("occurredAt").notNull(),
    description: varchar("description", { length: 300 }).notNull(),
    createdByUserId: int("createdByUserId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    foreignKey({ columns: [table.currencyCode], foreignColumns: [currencies.code], name: "ind_cash_mov_currency_fk" }),
    foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "ind_cash_mov_user_fk" }),
    foreignKey({ columns: [table.sourcePaymentId], foreignColumns: [individualSubscriptionPayments.id], name: "ind_cash_payment_fk" }),
    index("ind_cash_date_idx").on(table.occurredAt),
    index("ind_cash_currency_idx").on(table.currencyCode),
  ],
);

export const invoices = mysqlTable(
  "invoices",
  {
    id: int("id").autoincrement().primaryKey(),
    invoiceNumber: varchar("invoiceNumber", { length: 40 }).notNull(),
    contactId: int("contactId")
      .notNull()
      .references(() => contacts.id),
    movementCategoryId: int("movementCategoryId").references(() => movementCategories.id),
    type: mysqlEnum("type", ["cash", "credit"]).notNull(),
    status: mysqlEnum("status", ["issued", "partially_paid", "paid", "cancelled"])
      .default("issued")
      .notNull(),
    issueDate: timestamp("issueDate").notNull(),
    currencyCode: varchar("currencyCode", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    exchangeRateToBase: decimal("exchangeRateToBase", { precision: 18, scale: 6 })
      .notNull()
      .default("1"),
    subtotal: decimal("subtotal", { precision: 18, scale: 2 }).notNull(),
    discountAmount: decimal("discountAmount", { precision: 18, scale: 2 }).notNull().default("0"),
    totalAmount: decimal("totalAmount", { precision: 18, scale: 2 }).notNull(),
    paidAmount: decimal("paidAmount", { precision: 18, scale: 2 }).notNull().default("0"),
    cashAccountId: int("cashAccountId").references(() => cashAccounts.id),
    notes: text("notes"),
    createdByUserId: int("createdByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("invoices_number_unique").on(table.invoiceNumber),
    index("invoices_contact_idx").on(table.contactId),
    index("invoices_date_idx").on(table.issueDate),
    index("invoices_status_idx").on(table.status),
  ],
);

export const invoiceItems = mysqlTable(
  "invoice_items",
  {
    id: int("id").autoincrement().primaryKey(),
    invoiceId: int("invoiceId")
      .notNull()
      .references(() => invoices.id),
    description: varchar("description", { length: 300 }).notNull(),
    quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull().default("1"),
    unitPrice: decimal("unitPrice", { precision: 18, scale: 2 }).notNull(),
    totalAmount: decimal("totalAmount", { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("invoice_items_invoice_idx").on(table.invoiceId)],
);

export const receipts = mysqlTable(
  "receipts",
  {
    id: int("id").autoincrement().primaryKey(),
    receiptNumber: varchar("receiptNumber", { length: 40 }).notNull(),
    contactId: int("contactId")
      .notNull()
      .references(() => contacts.id),
    movementCategoryId: int("movementCategoryId").references(() => movementCategories.id),
    status: mysqlEnum("status", ["active", "cancelled"]).default("active").notNull(),
    receiptDate: timestamp("receiptDate").notNull(),
    currencyCode: varchar("currencyCode", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    exchangeRateToBase: decimal("exchangeRateToBase", { precision: 18, scale: 6 })
      .notNull()
      .default("1"),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    cashAccountId: int("cashAccountId").references(() => cashAccounts.id),
    notes: text("notes"),
    createdByUserId: int("createdByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("receipts_number_unique").on(table.receiptNumber),
    index("receipts_contact_idx").on(table.contactId),
    index("receipts_date_idx").on(table.receiptDate),
  ],
);

export const receiptAllocations = mysqlTable(
  "receipt_allocations",
  {
    id: int("id").autoincrement().primaryKey(),
    receiptId: int("receiptId")
      .notNull()
      .references(() => receipts.id),
    invoiceId: int("invoiceId")
      .notNull()
      .references(() => invoices.id),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("receipt_allocations_receipt_idx").on(table.receiptId),
    index("receipt_allocations_invoice_idx").on(table.invoiceId),
  ],
);

export const expenses = mysqlTable(
  "expenses",
  {
    id: int("id").autoincrement().primaryKey(),
    expenseNumber: varchar("expenseNumber", { length: 40 }).notNull(),
    contactId: int("contactId").references(() => contacts.id),
    movementCategoryId: int("movementCategoryId").references(() => movementCategories.id),
    status: mysqlEnum("status", ["active", "cancelled"]).default("active").notNull(),
    expenseDate: timestamp("expenseDate").notNull(),
    currencyCode: varchar("currencyCode", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    exchangeRateToBase: decimal("exchangeRateToBase", { precision: 18, scale: 6 })
      .notNull()
      .default("1"),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    cashAccountId: int("cashAccountId").references(() => cashAccounts.id),
    description: varchar("description", { length: 300 }).notNull(),
    supplierName: varchar("supplierName", { length: 200 }),
    supplierInvoiceNumber: varchar("supplierInvoiceNumber", { length: 120 }),
    attachmentName: varchar("attachmentName", { length: 255 }),
    attachmentKey: varchar("attachmentKey", { length: 512 }),
    attachmentUrl: varchar("attachmentUrl", { length: 512 }),
    allowCashOverdraft: boolean("allowCashOverdraft").notNull().default(false),
    cashOverrideReason: varchar("cashOverrideReason", { length: 500 }),
    notes: text("notes"),
    createdByUserId: int("createdByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("expenses_number_unique").on(table.expenseNumber),
    index("expenses_category_idx").on(table.movementCategoryId),
    index("expenses_date_idx").on(table.expenseDate),
  ],
);

export const merchantTransactions = mysqlTable(
  "merchant_transactions",
  {
    id: int("id").autoincrement().primaryKey(),
    contactId: int("contactId")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    direction: mysqlEnum("direction", ["credit", "debit"]).notNull(), // 'credit' = له (بضاعة مسحوبة / استحقاق), 'debit' = عليه (مبلغ حوالة / سداد للتاجر)
    transactionType: mysqlEnum("transactionType", ["purchase", "transfer"])
      .notNull()
      .default("purchase"),
    invoiceNumber: varchar("invoiceNumber", { length: 120 }), // رقم الفاتورة
    transferAmount: decimal("transferAmount", { precision: 18, scale: 2 }), // مبلغ الحوالة
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(), // المبلغ الإجمالي
    currencyCode: varchar("currencyCode", { length: 3 })
      .notNull()
      .default("YER")
      .references(() => currencies.code),
    exchangeRateToBase: decimal("exchangeRateToBase", { precision: 18, scale: 6 })
      .notNull()
      .default("1"),
    details: text("details"), // التفاصيل والتسعير (كم سعرت من هذا التاجر والبيان)
    transactionDate: timestamp("transactionDate").notNull(),
    cashAccountId: int("cashAccountId").references(() => cashAccounts.id),
    notes: text("notes"),
    createdByUserId: int("createdByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("merchant_tx_contact_idx").on(table.contactId),
    index("merchant_tx_date_idx").on(table.transactionDate),
    index("merchant_tx_dir_idx").on(table.direction),
  ],
);

export const currencyTransfers = mysqlTable(
  "currency_transfers",
  {
    id: int("id").autoincrement().primaryKey(),
    transferNumber: varchar("transferNumber", { length: 40 }).notNull(),
    transferDate: timestamp("transferDate").notNull(),
    fromCurrencyCode: varchar("fromCurrencyCode", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    fromAmount: decimal("fromAmount", { precision: 18, scale: 2 }).notNull(),
    toCurrencyCode: varchar("toCurrencyCode", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    toAmount: decimal("toAmount", { precision: 18, scale: 2 }).notNull(),
    fromCashAccountId: int("fromCashAccountId").references(() => cashAccounts.id),
    toCashAccountId: int("toCashAccountId").references(() => cashAccounts.id),
    notes: text("notes"),
    createdByUserId: int("createdByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("currency_transfers_number_unique").on(table.transferNumber),
    index("currency_transfers_date_idx").on(table.transferDate),
  ],
);

export const cashMovements = mysqlTable(
  "cash_movements",
  {
    id: int("id").autoincrement().primaryKey(),
    direction: mysqlEnum("direction", ["in", "out"]).notNull(),
    type: mysqlEnum("type", [
      "opening_balance",
      "cash_invoice",
      "receipt",
      "expense",
      "transfer_in",
      "transfer_out",
      "adjustment",
    ]).notNull(),
    currencyCode: varchar("currencyCode", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    cashAccountId: int("cashAccountId").references(() => cashAccounts.id),
    occurredAt: timestamp("occurredAt").notNull(),
    sourceType: varchar("sourceType", { length: 40 }),
    sourceId: int("sourceId"),
    description: varchar("description", { length: 300 }),
    notes: text("notes"),
    createdByUserId: int("createdByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("cash_movements_currency_date_idx").on(table.currencyCode, table.occurredAt),
    index("cash_movements_source_idx").on(table.sourceType, table.sourceId),
    index("cash_movements_account_date_idx").on(table.cashAccountId, table.occurredAt),
  ],
);

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").references(() => users.id),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entityType", { length: 80 }).notNull(),
    entityId: int("entityId"),
    details: text("details"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("audit_logs_entity_idx").on(table.entityType, table.entityId)],
);

export const backupSnapshots = mysqlTable(
  "backup_snapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    storageUrl: varchar("storageUrl", { length: 512 }).notNull(),
    sizeBytes: int("sizeBytes").notNull(),
    source: mysqlEnum("source", ["manual", "automatic", "protective"]).notNull().default("manual"),
    createdByUserId: int("createdByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("backup_snapshots_created_idx").on(table.createdAt)],
);

export const networkRouters = mysqlTable(
  "network_routers",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 120 }).notNull().default("موجّه الشامل الرئيسي"),
    host: varchar("host", { length: 255 }).notNull().default("3.3.3.3"),
    apiPort: int("apiPort").notNull().default(8728),
    username: varchar("username", { length: 100 }).notNull().default("admin"),
    password: varchar("password", { length: 255 }).notNull().default(""),
    useTls: boolean("useTls").notNull().default(false),
    mode: mysqlEnum("mode", ["usermanager_v6", "usermanager_v7", "hotspot"]).notNull().default("usermanager_v6"),
    customer: varchar("customer", { length: 100 }).notNull().default("admin"),
    isDefault: boolean("isDefault").notNull().default(true),
    status: mysqlEnum("status", ["online", "offline", "error", "unknown"]).notNull().default("unknown"),
    lastCheckedAt: timestamp("lastCheckedAt"),
    lastError: text("lastError"),
    systemIdentity: varchar("systemIdentity", { length: 120 }),
    routerosVersion: varchar("routerosVersion", { length: 60 }),
    boardName: varchar("boardName", { length: 120 }),
    uptime: varchar("uptime", { length: 120 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("network_routers_status_idx").on(table.status)],
);

export const wifiCardProfiles = mysqlTable(
  "wifi_card_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    price: decimal("price", { precision: 18, scale: 2 }).notNull(),
    currencyCode: varchar("currencyCode", { length: 3 }).notNull().default("YER"),
    timeLimit: varchar("timeLimit", { length: 60 }),
    dataLimitBytes: decimal("dataLimitBytes", { precision: 18, scale: 0 }).notNull().default("0"),
    dataLimitLabel: varchar("dataLimitLabel", { length: 60 }),
    routerProfileName: varchar("routerProfileName", { length: 120 }),
    notes: text("notes"),
    isActive: boolean("isActive").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("wifi_card_profiles_active_idx").on(table.isActive)],
);

export const wifiCardBatches = mysqlTable(
  "wifi_card_batches",
  {
    id: int("id").autoincrement().primaryKey(),
    batchNumber: varchar("batchNumber", { length: 50 }).notNull(),
    routerId: int("routerId").references(() => networkRouters.id),
    profileId: int("profileId").references(() => wifiCardProfiles.id),
    profileName: varchar("profileName", { length: 160 }).notNull(),
    quantity: int("quantity").notNull(),
    unitPrice: decimal("unitPrice", { precision: 18, scale: 2 }).notNull(),
    totalAmount: decimal("totalAmount", { precision: 18, scale: 2 }).notNull(),
    currencyCode: varchar("currencyCode", { length: 3 }).notNull().default("YER"),
    codeFormat: mysqlEnum("codeFormat", ["username_only", "username_password"]).notNull().default("username_only"),
    codeLength: int("codeLength").notNull().default(6),
    codeType: mysqlEnum("codeType", ["numbers", "alphanumeric"]).notNull().default("numbers"),
    prefix: varchar("prefix", { length: 20 }).notNull().default(""),
    status: mysqlEnum("status", ["ready", "synced", "partial_sync", "sync_failed"]).notNull().default("ready"),
    syncError: text("syncError"),
    notes: text("notes"),
    createdByUserId: int("createdByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("wifi_card_batches_number_unique").on(table.batchNumber),
    index("wifi_card_batches_created_idx").on(table.createdAt),
  ],
);

export const wifiCards = mysqlTable(
  "wifi_cards",
  {
    id: int("id").autoincrement().primaryKey(),
    batchId: int("batchId").notNull().references(() => wifiCardBatches.id),
    routerId: int("routerId").references(() => networkRouters.id),
    profileId: int("profileId").references(() => wifiCardProfiles.id),
    username: varchar("username", { length: 100 }).notNull(),
    password: varchar("password", { length: 100 }).notNull(),
    price: decimal("price", { precision: 18, scale: 2 }).notNull(),
    currencyCode: varchar("currencyCode", { length: 3 }).notNull().default("YER"),
    profileName: varchar("profileName", { length: 160 }).notNull(),
    timeLimit: varchar("timeLimit", { length: 60 }),
    dataLimitLabel: varchar("dataLimitLabel", { length: 60 }),
    status: mysqlEnum("status", ["available", "sold", "used", "disabled"]).notNull().default("available"),
    syncedToRouter: boolean("syncedToRouter").notNull().default(false),
    soldAt: timestamp("soldAt"),
    soldToContactId: int("soldToContactId").references(() => contacts.id),
    soldNotes: varchar("soldNotes", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("wifi_cards_batch_idx").on(table.batchId),
    index("wifi_cards_username_idx").on(table.username),
    index("wifi_cards_status_idx").on(table.status),
  ],
);

export type Currency = typeof currencies.$inferSelect;
export type CashBalance = typeof cashBalances.$inferSelect;
export type AccountCategory = typeof accountCategories.$inferSelect;
export type MovementCategory = typeof movementCategories.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type ServicePackage = typeof servicePackages.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type IndividualSubscriptionCharge = typeof individualSubscriptionCharges.$inferSelect;
export type IndividualSubscriptionPayment = typeof individualSubscriptionPayments.$inferSelect;
export type IndividualSubscriptionCashMovement = typeof individualSubscriptionCashMovements.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type ReceiptAllocation = typeof receiptAllocations.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type CurrencyTransfer = typeof currencyTransfers.$inferSelect;
export type CashMovement = typeof cashMovements.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type BackupSnapshot = typeof backupSnapshots.$inferSelect;
export type NetworkRouter = typeof networkRouters.$inferSelect;
export type InsertNetworkRouter = typeof networkRouters.$inferInsert;
export type WifiCardProfile = typeof wifiCardProfiles.$inferSelect;
export type InsertWifiCardProfile = typeof wifiCardProfiles.$inferInsert;
export type WifiCardBatch = typeof wifiCardBatches.$inferSelect;
export type InsertWifiCardBatch = typeof wifiCardBatches.$inferInsert;
export type WifiCard = typeof wifiCards.$inferSelect;
export type InsertWifiCard = typeof wifiCards.$inferInsert;
export type MerchantTransaction = typeof merchantTransactions.$inferSelect;
export type InsertMerchantTransaction = typeof merchantTransactions.$inferInsert;

