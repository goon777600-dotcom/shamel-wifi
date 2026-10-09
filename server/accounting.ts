import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import {
  accountCategories,
  appSettings,
  auditLogs,
  backupSnapshots,
  cashAccountBalances,
  cashAccounts,
  cashBalances,
  cashMovements,
  contacts,
  currencies,
  currencyTransfers,
  expenses,
  individualSubscriptionAccounts,
  individualSubscriptionAdjustments,
  individualSubscriptionCashBalances,
  individualSubscriptionCashMovements,
  individualSubscriptionCharges,
  individualSubscriptionPayments,
  individualSubscriptions,
  invoiceItems,
  invoices,
  merchantTransactions,
  movementCategories,
  receiptAllocations,
  receipts,
  servicePackages,
  subscriptions,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { storageGetSignedUrl, storagePut } from "./storage";
import {
  calculateLineTotal,
  canAllocateReceipt,
  centsToMoney,
  convertFromBaseCents,
  convertToBaseCents,
  getCreditInvoiceStatus,
  hasSufficientCash,
  moneyToCents,
  quantityToMillis,
  rateToMicros,
  sumCents,
} from "./accountingMath";

type ContactType = "customer" | "grocery" | "supplier" | "employee" | "other";
type CurrencyCode = "YER" | "SAR" | "USD";
type LineItemInput = { description: string; quantity: string; unitPrice: string };
type ReceiptAllocationInput = { invoiceId: number; amount: string };
type ExpenseAttachmentInput = { fileName: string; mimeType: "image/jpeg" | "image/png" | "application/pdf"; dataBase64: string };

const DEFAULT_CURRENCIES: Array<{ code: CurrencyCode; nameAr: string; symbol: string }> = [
  { code: "YER", nameAr: "الريال اليمني", symbol: "ر.ي" },
  { code: "SAR", nameAr: "الريال السعودي", symbol: "ر.س" },
  { code: "USD", nameAr: "الدولار الأمريكي", symbol: "$" },
];

const DEFAULT_CASH_ACCOUNTS = [
  { name: "صندوق الشبكة الرئيسي", type: "cash" as const, isSystem: true, notes: "الصندوق النقدي الرئيسي" },
  { name: "بنك الشمول", type: "bank" as const, isSystem: true, notes: "حساب مصرفي لإيداعات العملاء والتحويلات" },
];

export const DEFAULT_WHATSAPP_TEMPLATE = "{{greeting}} {{customer_name}}\n{{shop_name}}\n{{message_body}}\nشكراً لتعاملكم معنا.";

export async function getWhatsAppSettings(ownerUserId: number) {
  const db = await requireDb();
  const rows = await db.select().from(appSettings).where(eq(appSettings.ownerUserId, ownerUserId)).limit(1);
  return { whatsappTemplate: rows[0]?.whatsappTemplate ?? DEFAULT_WHATSAPP_TEMPLATE };
}

export async function updateWhatsAppSettings(ownerUserId: number, whatsappTemplate: string) {
  const db = await requireDb();
  await db.insert(appSettings).values({ ownerUserId, whatsappTemplate }).onDuplicateKeyUpdate({ set: { whatsappTemplate } });
  await writeAudit(db, ownerUserId, "update", "whatsapp_template", null, { length: whatsappTemplate.length });
  return getWhatsAppSettings(ownerUserId);
}

const DEFAULT_ACCOUNT_CATEGORIES = [
  { name: "إيرادات الاشتراكات", kind: "income" as const },
  { name: "مصروفات تشغيلية", kind: "expense" as const },
  { name: "رواتب الموظفين", kind: "expense" as const },
  { name: "أصول ومعدات", kind: "asset" as const },
];

function referenceNumber(prefix: string, id: number) {
  return `${prefix}-${String(id).padStart(6, "0")}`;
}

export function temporaryReference(prefix: string) {
  return `TMP-${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export function isExternalPurchaseCategory(categoryName: string) {
  const normalized = categoryName.trim().toLowerCase();
  return normalized.includes("شراء أصل") || normalized.includes("معدات") || normalized.includes("كهرباء");
}

async function uploadExpenseAttachment(userId: number, attachment: ExpenseAttachmentInput) {
  const bytes = Buffer.from(attachment.dataBase64, "base64");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error("الحجم الفعلي لمرفق فاتورة المورد يجب ألا يتجاوز 5 ميغابايت");
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isPdf = bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if ((attachment.mimeType === "image/jpeg" && !isJpeg) || (attachment.mimeType === "image/png" && !isPng) || (attachment.mimeType === "application/pdf" && !isPdf)) {
    throw new Error("نوع ملف فاتورة المورد لا يطابق محتوى الملف المرفوع");
  }
  const safeName = attachment.fileName.replace(/[^\w.\-ء-ي]/g, "_").slice(0, 180) || "supplier-invoice";
  return storagePut(`expense-invoices/${userId}/${Date.now()}-${safeName}`, bytes, attachment.mimeType);
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  return db;
}

async function writeAudit(
  db: any,
  userId: number,
  action: string,
  entityType: string,
  entityId: number | null,
  details: Record<string, unknown>,
) {
  await db.insert(auditLogs).values({
    userId,
    action,
    entityType,
    entityId,
    details: JSON.stringify(details),
  });
}

async function getCashMovementBalanceCents(db: any, currencyCode: string): Promise<bigint> {
  const rows = await db
    .select({ direction: cashMovements.direction, amount: cashMovements.amount })
    .from(cashMovements)
    .where(eq(cashMovements.currencyCode, currencyCode));

  return rows.reduce((balance: bigint, movement: { direction: "in" | "out"; amount: string }) => {
    const amount = moneyToCents(movement.amount);
    return movement.direction === "in" ? balance + amount : balance - amount;
  }, 0n);
}

async function getCashBalanceCents(db: any, currencyCode: string): Promise<bigint> {
  const rows = await db.select({ balance: cashBalances.balance }).from(cashBalances).where(eq(cashBalances.currencyCode, currencyCode)).limit(1);
  if (!rows[0]) throw new Error("تعذر تهيئة رصيد الصندوق لهذه العملة");
  return moneyToCents(rows[0].balance);
}

async function adjustCashBalance(db: any, currencyCode: string, deltaCents: bigint) {
  await db.update(cashBalances).set({ balance: sql`${cashBalances.balance} + ${centsToMoney(deltaCents)}` }).where(eq(cashBalances.currencyCode, currencyCode));
}

async function debitCashBalance(db: any, currencyCode: string, amountCents: bigint) {
  const result = await db
    .update(cashBalances)
    .set({ balance: sql`${cashBalances.balance} - ${centsToMoney(amountCents)}` })
    .where(and(eq(cashBalances.currencyCode, currencyCode), sql`${cashBalances.balance} >= ${centsToMoney(amountCents)}`));
  if (Number(result[0]?.affectedRows ?? 0) !== 1) throw new Error("رصيد الصندوق غير كافٍ لإتمام هذه العملية");
}

async function getActiveCashAccount(db: any, cashAccountId?: number | null) {
  if (!cashAccountId) return null;
  const rows = await db.select().from(cashAccounts).where(and(eq(cashAccounts.id, cashAccountId), eq(cashAccounts.isActive, true))).limit(1);
  if (!rows[0]) throw new Error("الحساب النقدي أو المصرفي المحدد غير متاح");
  return rows[0];
}

async function resolveCashAccount(db: any, cashAccountId?: number | null) {
  const selected = await getActiveCashAccount(db, cashAccountId);
  if (selected) return selected;
  const rows = await db.select().from(cashAccounts).where(and(eq(cashAccounts.name, "صندوق الشبكة الرئيسي"), eq(cashAccounts.isActive, true))).limit(1);
  if (!rows[0]) throw new Error("تعذر تهيئة صندوق الشبكة الرئيسي");
  return rows[0];
}

async function lockCashAccountCurrencies(db: any, cashAccountId: number | null | undefined, currencyCodes: string[]) {
  await lockCashCurrencies(db, currencyCodes);
  if (!cashAccountId) return;
  for (const currencyCode of [...new Set(currencyCodes)].sort()) {
    await db.insert(cashAccountBalances).values({ cashAccountId, currencyCode, balance: "0.00" }).onDuplicateKeyUpdate({ set: { cashAccountId } });
    await db.execute(sql`SELECT ${cashAccountBalances.cashAccountId} FROM ${cashAccountBalances} WHERE ${and(eq(cashAccountBalances.cashAccountId, cashAccountId), eq(cashAccountBalances.currencyCode, currencyCode))} FOR UPDATE`);
  }
}

async function lockCashAccountBalanceResources(db: any, resources: Array<{ cashAccountId: number; currencyCode: string }>) {
  const uniqueResources = Array.from(new Map(resources.map(resource => [`${resource.cashAccountId}:${resource.currencyCode}`, resource])).values())
    .sort((a, b) => a.cashAccountId - b.cashAccountId || a.currencyCode.localeCompare(b.currencyCode));
  await lockCashCurrencies(db, uniqueResources.map(resource => resource.currencyCode));
  for (const resource of uniqueResources) {
    await db.insert(cashAccountBalances).values({ cashAccountId: resource.cashAccountId, currencyCode: resource.currencyCode, balance: "0.00" }).onDuplicateKeyUpdate({ set: { cashAccountId: resource.cashAccountId } });
    await db.execute(sql`SELECT ${cashAccountBalances.cashAccountId} FROM ${cashAccountBalances} WHERE ${and(eq(cashAccountBalances.cashAccountId, resource.cashAccountId), eq(cashAccountBalances.currencyCode, resource.currencyCode))} FOR UPDATE`);
  }
}

async function getTrackedCashBalanceCents(db: any, cashAccountId: number | null | undefined, currencyCode: string): Promise<bigint> {
  if (!cashAccountId) return getCashBalanceCents(db, currencyCode);
  const rows = await db.select({ balance: cashAccountBalances.balance }).from(cashAccountBalances).where(and(eq(cashAccountBalances.cashAccountId, cashAccountId), eq(cashAccountBalances.currencyCode, currencyCode))).limit(1);
  return moneyToCents(rows[0]?.balance ?? "0.00");
}

async function adjustTrackedCashBalance(db: any, cashAccountId: number | null | undefined, currencyCode: string, deltaCents: bigint) {
  await adjustCashBalance(db, currencyCode, deltaCents);
  if (!cashAccountId) return;
  await db.update(cashAccountBalances).set({ balance: sql`${cashAccountBalances.balance} + ${centsToMoney(deltaCents)}` }).where(and(eq(cashAccountBalances.cashAccountId, cashAccountId), eq(cashAccountBalances.currencyCode, currencyCode)));
}

async function debitTrackedCashBalance(db: any, cashAccountId: number | null | undefined, currencyCode: string, amountCents: bigint) {
  if (!cashAccountId) return debitCashBalance(db, currencyCode, amountCents);
  const accountResult = await db.update(cashAccountBalances).set({ balance: sql`${cashAccountBalances.balance} - ${centsToMoney(amountCents)}` }).where(and(eq(cashAccountBalances.cashAccountId, cashAccountId), eq(cashAccountBalances.currencyCode, currencyCode), sql`${cashAccountBalances.balance} >= ${centsToMoney(amountCents)}`));
  if (Number(accountResult[0]?.affectedRows ?? 0) !== 1) throw new Error("رصيد الحساب المحدد غير كافٍ لإتمام هذه العملية");
  await debitCashBalance(db, currencyCode, amountCents);
}

async function rebuildCashBalances(db: any) {
  await db.delete(cashBalances);
  const currencyRows = await db.select({ code: currencies.code }).from(currencies);
  for (const currency of currencyRows) {
    const balance = await getCashMovementBalanceCents(db, currency.code);
    await db.insert(cashBalances).values({ currencyCode: currency.code, balance: centsToMoney(balance) });
  }
}

async function rebuildCashAccountBalances(db: any) {
  await db.delete(cashAccountBalances);
  const [accountRows, currencyRows] = await Promise.all([db.select({ id: cashAccounts.id }).from(cashAccounts), db.select({ code: currencies.code }).from(currencies)]);
  for (const account of accountRows) {
    for (const currency of currencyRows) {
      const movements = await db.select({ direction: cashMovements.direction, amount: cashMovements.amount }).from(cashMovements).where(and(eq(cashMovements.cashAccountId, account.id), eq(cashMovements.currencyCode, currency.code)));
      const balance = movements.reduce((total: bigint, movement: { direction: "in" | "out"; amount: string }) => total + (movement.direction === "in" ? moneyToCents(movement.amount) : -moneyToCents(movement.amount)), 0n);
      await db.insert(cashAccountBalances).values({ cashAccountId: account.id, currencyCode: currency.code, balance: centsToMoney(balance) });
    }
  }
}

async function rebuildInvoicePaidAmounts(db: any) {
  const invoiceRows = await db.select().from(invoices);
  const allocationRows = await db
    .select({ invoiceId: receiptAllocations.invoiceId, amount: receiptAllocations.amount })
    .from(receiptAllocations)
    .innerJoin(receipts, eq(receiptAllocations.receiptId, receipts.id))
    .where(eq(receipts.status, "active"));
  const paidByInvoice = new Map<number, bigint>();
  for (const allocation of allocationRows) paidByInvoice.set(allocation.invoiceId, (paidByInvoice.get(allocation.invoiceId) ?? 0n) + moneyToCents(allocation.amount));
  for (const invoice of invoiceRows) {
    const paid = invoice.type === "cash" ? moneyToCents(invoice.totalAmount) : paidByInvoice.get(invoice.id) ?? 0n;
    const status = invoice.type === "cash" ? "paid" : getCreditInvoiceStatus(moneyToCents(invoice.totalAmount), paid);
    await db.update(invoices).set({ paidAmount: centsToMoney(paid), status }).where(eq(invoices.id, invoice.id));
  }
}

export async function lockCashCurrencies(db: any, currencyCodes: string[]) {
  for (const currencyCode of [...new Set(currencyCodes)].sort()) {
    await db.insert(cashBalances).values({ currencyCode, balance: "0.00" }).onDuplicateKeyUpdate({ set: { currencyCode } });
    await db.execute(sql`SELECT ${cashBalances.currencyCode} FROM ${cashBalances} WHERE ${eq(cashBalances.currencyCode, currencyCode)} FOR UPDATE`);
  }
}

export async function lockReceiptResources(
  db: any,
  invoiceIds: number[],
  currencyCode: string,
  lockCurrencies: (transaction: any, codes: string[]) => Promise<void> = lockCashCurrencies,
) {
  await db.execute(sql`SELECT ${invoices.id} FROM ${invoices} WHERE ${inArray(invoices.id, invoiceIds)} FOR UPDATE`);
  await lockCurrencies(db, [currencyCode]);
}

async function assertCashAvailable(db: any, currencyCode: string, amount: string) {
  const balance = await getCashBalanceCents(db, currencyCode);
  if (!hasSufficientCash(balance, moneyToCents(amount))) {
    throw new Error("رصيد الصندوق غير كافٍ لإتمام هذه العملية");
  }
}

async function getActiveCurrency(db: any, currencyCode: string) {
  const result = await db
    .select({ code: currencies.code })
    .from(currencies)
    .where(and(eq(currencies.code, currencyCode), eq(currencies.isActive, true)))
    .limit(1);
  if (!result[0]) throw new Error("العملة المحددة غير متاحة");
  return result[0];
}

async function getActiveContact(db: any, contactId: number) {
  const result = await db
    .select({ id: contacts.id, name: contacts.name, type: contacts.type, phone: contacts.phone, address: contacts.address, notes: contacts.notes })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.isActive, true)))
    .limit(1);
  if (!result[0]) throw new Error("الحساب أو العميل المحدد غير متاح");
  return result[0];
}

async function getActiveMovementCategory(
  db: any,
  movementCategoryId: number,
  requiredKind?: "sale" | "receipt" | "expense" | "transfer" | "adjustment",
) {
  const where = requiredKind
    ? and(
        eq(movementCategories.id, movementCategoryId),
        eq(movementCategories.isActive, true),
        eq(movementCategories.kind, requiredKind),
      )
    : and(eq(movementCategories.id, movementCategoryId), eq(movementCategories.isActive, true));
  const result = await db.select().from(movementCategories).where(where).limit(1);
  if (!result[0]) throw new Error("تصنيف الحركة المحدد غير متاح أو لا يناسب نوع العملية");
  return result[0];
}

export async function ensureAccountingDefaults() {
  const db = await requireDb();

  for (const currency of DEFAULT_CURRENCIES) {
    await db.insert(currencies).values(currency).onDuplicateKeyUpdate({
      set: { isActive: true },
    });
    await db.insert(cashBalances).values({ currencyCode: currency.code, balance: "0.00" }).onDuplicateKeyUpdate({
      set: { currencyCode: currency.code },
    });
    await db.insert(individualSubscriptionCashBalances).values({ currencyCode: currency.code, balance: "0.00" }).onDuplicateKeyUpdate({
      set: { currencyCode: currency.code },
    });
  }

  for (const account of DEFAULT_CASH_ACCOUNTS) {
    await db.insert(cashAccounts).values(account).onDuplicateKeyUpdate({
      set: { isSystem: true, isActive: true },
    });
  }
  const activeCashAccountRows = await db.select({ id: cashAccounts.id }).from(cashAccounts).where(eq(cashAccounts.isActive, true));
  for (const account of activeCashAccountRows) {
    for (const currency of DEFAULT_CURRENCIES) {
      await db.insert(cashAccountBalances).values({ cashAccountId: account.id, currencyCode: currency.code, balance: "0.00" }).onDuplicateKeyUpdate({ set: { cashAccountId: account.id } });
    }
  }

  for (const category of DEFAULT_ACCOUNT_CATEGORIES) {
    await db.insert(accountCategories).values({ ...category, isSystem: true }).onDuplicateKeyUpdate({
      set: { isSystem: true, isActive: true },
    });
  }

  const categoryRows = await db.select().from(accountCategories);
  const categoryId = (name: string) => categoryRows.find(category => category.name === name)?.id ?? null;
  const defaultMovements = [
    { name: "مبيعات اشتراكات", kind: "sale" as const, accountCategoryId: categoryId("إيرادات الاشتراكات") },
    { name: "سند قبض", kind: "receipt" as const, accountCategoryId: null },
    { name: "مصروفات تشغيلية", kind: "expense" as const, accountCategoryId: categoryId("مصروفات تشغيلية") },
    { name: "شراء خدمة الإنترنت", kind: "expense" as const, accountCategoryId: categoryId("مصروفات تشغيلية") },
    { name: "صيانة الشبكة", kind: "expense" as const, accountCategoryId: categoryId("مصروفات تشغيلية") },
    { name: "بترول ومشاوير", kind: "expense" as const, accountCategoryId: categoryId("مصروفات تشغيلية") },
    { name: "رواتب", kind: "expense" as const, accountCategoryId: categoryId("رواتب الموظفين") },
    { name: "شراء أصل أو معدات", kind: "expense" as const, accountCategoryId: categoryId("أصول ومعدات") },
    { name: "تحويل عملات", kind: "transfer" as const, accountCategoryId: null },
  ];

  for (const category of defaultMovements) {
    await db.insert(movementCategories).values({ ...category, isSystem: true }).onDuplicateKeyUpdate({
      set: { isSystem: true, isActive: true },
    });
  }
}

export async function getSetup() {
  await ensureAccountingDefaults();
  const db = await requireDb();
  const [currencyRows, accountCategoryRows, movementCategoryRows] = await Promise.all([
    db.select().from(currencies).where(eq(currencies.isActive, true)),
    db.select().from(accountCategories).where(eq(accountCategories.isActive, true)),
    db.select().from(movementCategories).where(eq(movementCategories.isActive, true)),
  ]);
  return { currencies: currencyRows, accountCategories: accountCategoryRows, movementCategories: movementCategoryRows };
}

export async function listContacts(type?: ContactType) {
  const db = await requireDb();
  const where = type ? and(eq(contacts.isActive, true), eq(contacts.type, type)) : eq(contacts.isActive, true);
  return db.select().from(contacts).where(where).orderBy(desc(contacts.createdAt));
}

export async function createContact(
  userId: number,
  input: { name: string; type: ContactType; phone?: string; address?: string; notes?: string },
) {
  const db = await requireDb();
  const result = await db.insert(contacts).values({
    name: input.name.trim(),
    type: input.type,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  const id = Number(result[0].insertId);
  await writeAudit(db, userId, "create", "contact", id, { name: input.name, type: input.type });
  return { id };
}

export async function updateContact(
  userId: number,
  input: { id: number; name: string; type: ContactType; phone?: string; address?: string; notes?: string; isActive: boolean },
) {
  const db = await requireDb();
  await db
    .update(contacts)
    .set({
      name: input.name.trim(),
      type: input.type,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
      isActive: input.isActive,
    })
    .where(eq(contacts.id, input.id));
  await writeAudit(db, userId, "update", "contact", input.id, { name: input.name, isActive: input.isActive });
  return { id: input.id };
}

export async function createAccountCategory(
  userId: number,
  input: { name: string; kind: "income" | "expense" | "asset" | "liability" | "equity" | "other" },
) {
  const db = await requireDb();
  const result = await db.insert(accountCategories).values({ name: input.name.trim(), kind: input.kind });
  const id = Number(result[0].insertId);
  await writeAudit(db, userId, "create", "account_category", id, input);
  return { id };
}

export async function updateAccountCategory(
  userId: number,
  input: { id: number; name: string; isActive: boolean },
) {
  const db = await requireDb();
  const existing = await db.select().from(accountCategories).where(eq(accountCategories.id, input.id)).limit(1);
  if (!existing[0]) throw new Error("تصنيف الحساب غير موجود");
  await db
    .update(accountCategories)
    .set({ name: input.name.trim(), isActive: input.isActive })
    .where(eq(accountCategories.id, input.id));
  await writeAudit(db, userId, "update", "account_category", input.id, input);
  return { id: input.id };
}

export async function createMovementCategory(
  userId: number,
  input: { name: string; kind: "sale" | "receipt" | "expense" | "transfer" | "adjustment"; accountCategoryId?: number },
) {
  const db = await requireDb();
  if (input.accountCategoryId) {
    const linkedCategory = await db
      .select({ id: accountCategories.id })
      .from(accountCategories)
      .where(and(eq(accountCategories.id, input.accountCategoryId), eq(accountCategories.isActive, true)))
      .limit(1);
    if (!linkedCategory[0]) throw new Error("تصنيف الحساب المرتبط غير متاح");
  }
  const result = await db.insert(movementCategories).values({
    name: input.name.trim(),
    kind: input.kind,
    accountCategoryId: input.accountCategoryId ?? null,
  });
  const id = Number(result[0].insertId);
  await writeAudit(db, userId, "create", "movement_category", id, input);
  return { id };
}

export async function updateMovementCategory(
  userId: number,
  input: { id: number; name: string; accountCategoryId: number | null; isActive: boolean },
) {
  const db = await requireDb();
  const existing = await db.select().from(movementCategories).where(eq(movementCategories.id, input.id)).limit(1);
  if (!existing[0]) throw new Error("تصنيف الحركة غير موجود");
  if (input.accountCategoryId) {
    const linkedCategory = await db
      .select({ id: accountCategories.id })
      .from(accountCategories)
      .where(and(eq(accountCategories.id, input.accountCategoryId), eq(accountCategories.isActive, true)))
      .limit(1);
    if (!linkedCategory[0]) throw new Error("تصنيف الحساب المرتبط غير متاح");
  }
  await db
    .update(movementCategories)
    .set({ name: input.name.trim(), accountCategoryId: input.accountCategoryId, isActive: input.isActive })
    .where(eq(movementCategories.id, input.id));
  await writeAudit(db, userId, "update", "movement_category", input.id, input);
  return { id: input.id };
}

function subscriptionDisplayStatus(subscription: { status: "active" | "expiring" | "expired" | "suspended"; endDate: Date }) {
  if (subscription.status === "suspended") return "suspended" as const;
  const now = new Date();
  const remainingDays = Math.ceil((subscription.endDate.getTime() - now.getTime()) / 86_400_000);
  if (remainingDays < 0) return "expired" as const;
  if (remainingDays <= 3) return "expiring" as const;
  return "active" as const;
}

export async function listServicePackages() {
  const db = await requireDb();
  return db.select().from(servicePackages).orderBy(desc(servicePackages.createdAt));
}

export async function createServicePackage(userId: number, input: { name: string; description?: string; durationDays: number; price: string; currencyCode: CurrencyCode }) {
  const db = await requireDb();
  await getActiveCurrency(db, input.currencyCode);
  const result = await db.insert(servicePackages).values({ name: input.name.trim(), description: input.description?.trim() || null, durationDays: input.durationDays, price: centsToMoney(moneyToCents(input.price)), currencyCode: input.currencyCode });
  const id = Number(result[0].insertId);
  await writeAudit(db, userId, "create", "service_package", id, { name: input.name, durationDays: input.durationDays, price: input.price, currencyCode: input.currencyCode });
  return { id };
}

export async function updateServicePackage(userId: number, input: { id: number; name: string; description?: string; durationDays: number; price: string; currencyCode: CurrencyCode; isActive: boolean }) {
  const db = await requireDb();
  await getActiveCurrency(db, input.currencyCode);
  await db.update(servicePackages).set({ name: input.name.trim(), description: input.description?.trim() || null, durationDays: input.durationDays, price: centsToMoney(moneyToCents(input.price)), currencyCode: input.currencyCode, isActive: input.isActive }).where(eq(servicePackages.id, input.id));
  await writeAudit(db, userId, "update", "service_package", input.id, { name: input.name, isActive: input.isActive });
}

export async function listSubscriptions() {
  const db = await requireDb();
  const rows = await db.select({ subscription: subscriptions, contactName: contacts.name, packagePrice: servicePackages.price, packageCurrencyCode: servicePackages.currencyCode }).from(subscriptions).innerJoin(contacts, eq(subscriptions.contactId, contacts.id)).leftJoin(servicePackages, eq(subscriptions.packageId, servicePackages.id)).orderBy(desc(subscriptions.endDate));
  return rows.map(row => ({ ...row.subscription, contactName: row.contactName, packagePrice: row.packagePrice, packageCurrencyCode: row.packageCurrencyCode, displayStatus: subscriptionDisplayStatus(row.subscription) }));
}

export async function createSubscription(userId: number, input: { contactId: number; packageId: number; startDate: Date; notes?: string }) {
  const db = await requireDb();
  await getActiveContact(db, input.contactId);
  const packages = await db.select().from(servicePackages).where(and(eq(servicePackages.id, input.packageId), eq(servicePackages.isActive, true))).limit(1);
  const selectedPackage = packages[0];
  if (!selectedPackage) throw new Error("الباقة غير موجودة أو موقوفة");
  const endDate = new Date(input.startDate);
  endDate.setDate(endDate.getDate() + selectedPackage.durationDays - 1);
  const result = await db.insert(subscriptions).values({ contactId: input.contactId, packageId: selectedPackage.id, packageName: selectedPackage.name, startDate: input.startDate, endDate, notes: input.notes?.trim() || null, createdByUserId: userId });
  const id = Number(result[0].insertId);
  await writeAudit(db, userId, "create", "subscription", id, { contactId: input.contactId, packageId: selectedPackage.id, startDate: input.startDate.toISOString(), endDate: endDate.toISOString() });
  return { id, endDate };
}

export async function updateSubscriptionStatus(userId: number, input: { id: number; status: "active" | "expiring" | "expired" | "suspended"; notes?: string }) {
  const db = await requireDb();
  await db.update(subscriptions).set({ status: input.status, notes: input.notes?.trim() || null }).where(eq(subscriptions.id, input.id));
  await writeAudit(db, userId, "update", "subscription", input.id, { status: input.status });
}

type IndividualSubscriptionAccountStatus = "active" | "suspended" | "closed";
type IndividualSubscriptionStatus = "active" | "suspended" | "cancelled";
type IndividualSubscriptionChargeStatus = "unpaid" | "partial" | "paid" | "cancelled";

function getIndividualChargeStatus(amountCents: bigint, paidCents: bigint, discountCents: bigint = 0n): IndividualSubscriptionChargeStatus {
  const settledCents = paidCents + discountCents;
  if (settledCents <= 0n) return "unpaid";
  if (settledCents >= amountCents) return "paid";
  return "partial";
}

async function lockIndividualSubscriptionCashCurrencies(db: any, currencyCodes: string[]) {
  for (const currencyCode of [...new Set(currencyCodes)].sort()) {
    await db.insert(individualSubscriptionCashBalances).values({ currencyCode, balance: "0.00" }).onDuplicateKeyUpdate({ set: { currencyCode } });
    await db.execute(sql`SELECT ${individualSubscriptionCashBalances.currencyCode} FROM ${individualSubscriptionCashBalances} WHERE ${eq(individualSubscriptionCashBalances.currencyCode, currencyCode)} FOR UPDATE`);
  }
}

async function adjustIndividualSubscriptionCashBalance(db: any, currencyCode: string, deltaCents: bigint) {
  await db.update(individualSubscriptionCashBalances).set({ balance: sql`${individualSubscriptionCashBalances.balance} + ${centsToMoney(deltaCents)}` }).where(eq(individualSubscriptionCashBalances.currencyCode, currencyCode));
}

async function rebuildIndividualSubscriptionCashBalances(db: any) {
  await db.delete(individualSubscriptionCashBalances);
  const currencyRows = await db.select({ code: currencies.code }).from(currencies);
  for (const currency of currencyRows) {
    const movementRows = await db.select({ direction: individualSubscriptionCashMovements.direction, amount: individualSubscriptionCashMovements.amount }).from(individualSubscriptionCashMovements).where(eq(individualSubscriptionCashMovements.currencyCode, currency.code));
    const balance = movementRows.reduce((total: bigint, movement: { direction: "in" | "out"; amount: string }) => {
      const amount = moneyToCents(movement.amount);
      return movement.direction === "in" ? total + amount : total - amount;
    }, 0n);
    await db.insert(individualSubscriptionCashBalances).values({ currencyCode: currency.code, balance: centsToMoney(balance) });
  }
}

async function getIndividualSubscriptionAccount(db: any, accountId: number) {
  const rows = await db.select().from(individualSubscriptionAccounts).where(eq(individualSubscriptionAccounts.id, accountId)).limit(1);
  if (!rows[0]) throw new Error("حساب الاشتراك الفردي غير موجود");
  return rows[0];
}

export async function listIndividualSubscriptionAccounts() {
  const db = await requireDb();
  const [accounts, subscriptionRows, chargeRows] = await Promise.all([
    db.select().from(individualSubscriptionAccounts).orderBy(desc(individualSubscriptionAccounts.createdAt)),
    db.select().from(individualSubscriptions).orderBy(desc(individualSubscriptions.createdAt)),
    db.select().from(individualSubscriptionCharges).orderBy(desc(individualSubscriptionCharges.chargedAt)),
  ]);
  const subscriptionsByAccount = new Map<number, typeof subscriptionRows>();
  for (const subscription of subscriptionRows) {
    const current = subscriptionsByAccount.get(subscription.accountId) ?? [];
    current.push(subscription);
    subscriptionsByAccount.set(subscription.accountId, current);
  }
  const outstandingByAccount = new Map<number, Map<string, bigint>>();
  for (const charge of chargeRows) {
    if (charge.status === "cancelled") continue;
    const perCurrency = outstandingByAccount.get(charge.accountId) ?? new Map<string, bigint>();
    perCurrency.set(charge.currencyCode, (perCurrency.get(charge.currencyCode) ?? 0n) + moneyToCents(charge.amount) - moneyToCents(charge.paidAmount) - moneyToCents(charge.discountAmount));
    outstandingByAccount.set(charge.accountId, perCurrency);
  }
  return accounts.map(account => ({
    ...account,
    subscriptions: subscriptionsByAccount.get(account.id) ?? [],
    outstandingByCurrency: [...(outstandingByAccount.get(account.id) ?? new Map<string, bigint>()).entries()].filter(([, amount]) => amount > 0n).map(([currencyCode, amount]) => ({ currencyCode, amount: centsToMoney(amount) })),
  }));
}

export async function getIndividualSubscriptionAccountDetail(accountId: number) {
  const db = await requireDb();
  const [account, serviceSubscriptions, charges, payments, adjustments] = await Promise.all([
    getIndividualSubscriptionAccount(db, accountId),
    db.select().from(individualSubscriptions).where(eq(individualSubscriptions.accountId, accountId)).orderBy(desc(individualSubscriptions.createdAt)),
    db.select().from(individualSubscriptionCharges).where(eq(individualSubscriptionCharges.accountId, accountId)).orderBy(desc(individualSubscriptionCharges.chargedAt)),
    db.select().from(individualSubscriptionPayments).where(eq(individualSubscriptionPayments.accountId, accountId)).orderBy(desc(individualSubscriptionPayments.paymentDate)),
    db.select().from(individualSubscriptionAdjustments).where(eq(individualSubscriptionAdjustments.accountId, accountId)).orderBy(desc(individualSubscriptionAdjustments.adjustmentDate)),
  ]);
  const outstandingByCurrency = new Map<string, bigint>();
  for (const charge of charges) {
    if (charge.status === "cancelled") continue;
    outstandingByCurrency.set(charge.currencyCode, (outstandingByCurrency.get(charge.currencyCode) ?? 0n) + moneyToCents(charge.amount) - moneyToCents(charge.paidAmount) - moneyToCents(charge.discountAmount));
  }
  return {
    account,
    subscriptions: serviceSubscriptions,
    charges,
    payments,
    adjustments,
    outstandingByCurrency: [...outstandingByCurrency.entries()].map(([currencyCode, amount]) => ({ currencyCode, amount: centsToMoney(amount) })),
  };
}

export async function getIndividualSubscriptionCashSummary() {
  await ensureAccountingDefaults();
  const db = await requireDb();
  const [balances, movements] = await Promise.all([
    db.select().from(individualSubscriptionCashBalances).orderBy(individualSubscriptionCashBalances.currencyCode),
    db.select().from(individualSubscriptionCashMovements).orderBy(desc(individualSubscriptionCashMovements.occurredAt)).limit(100),
  ]);
  return { balances, movements };
}

export async function createIndividualSubscriptionAccount(
  userId: number,
  input: {
    name: string;
    phone?: string;
    status?: IndividualSubscriptionAccountStatus;
    notes?: string;
    initialSubscription?: { name?: string; status?: IndividualSubscriptionStatus; notes?: string };
  },
) {
  const name = input.name.trim();
  if (!name) throw new Error("أدخل اسم المشترك");
  const initialName = input.initialSubscription?.name?.trim() || "اشتراك إنترنت";
  const db = await requireDb();
  return db.transaction(async tx => {
    const accountResult = await tx.insert(individualSubscriptionAccounts).values({
      name,
      phone: input.phone?.trim() || null,
      status: input.status ?? "active",
      notes: input.notes?.trim() || null,
      createdByUserId: userId,
    });
    const id = Number(accountResult[0].insertId);
    let subscriptionId: number | null = null;
    if (input.initialSubscription) {
      const subscriptionResult = await tx.insert(individualSubscriptions).values({
        accountId: id,
        name: initialName,
        status: input.initialSubscription.status ?? "active",
        notes: input.initialSubscription.notes?.trim() || null,
        createdByUserId: userId,
      });
      subscriptionId = Number(subscriptionResult[0].insertId);
      await writeAudit(tx, userId, "create", "individual_subscription", subscriptionId, { accountId: id, name: initialName, status: input.initialSubscription.status ?? "active", source: "account_opening" });
    }
    await writeAudit(tx, userId, "create", "individual_subscription_account", id, { name, status: input.status ?? "active", phone: input.phone?.trim() || null, openedWithSubscription: Boolean(input.initialSubscription) });
    return { id, subscriptionId };
  });
}

export async function updateIndividualSubscriptionAccount(
  userId: number,
  input: { id: number; name: string; phone?: string; status: IndividualSubscriptionAccountStatus; notes?: string },
) {
  const name = input.name.trim();
  if (!name) throw new Error("أدخل اسم المشترك");
  const db = await requireDb();
  await getIndividualSubscriptionAccount(db, input.id);
  await db
    .update(individualSubscriptionAccounts)
    .set({ name, phone: input.phone?.trim() || null, status: input.status, notes: input.notes?.trim() || null })
    .where(eq(individualSubscriptionAccounts.id, input.id));
  await writeAudit(db, userId, "update", "individual_subscription_account", input.id, { name, status: input.status, phone: input.phone?.trim() || null });
  return { id: input.id };
}

export async function addIndividualSubscription(
  userId: number,
  input: { accountId: number; name?: string; status?: IndividualSubscriptionStatus; notes?: string },
) {
  const name = input.name?.trim() || "اشتراك إنترنت";
  const db = await requireDb();
  return db.transaction(async tx => {
    const account = await getIndividualSubscriptionAccount(tx, input.accountId);
    if (account.status === "closed") throw new Error("لا يمكن إضافة اشتراك إلى حساب مغلق");
    const result = await tx.insert(individualSubscriptions).values({
      accountId: input.accountId,
      name,
      status: input.status ?? "active",
      notes: input.notes?.trim() || null,
      createdByUserId: userId,
    });
    const id = Number(result[0].insertId);
    await writeAudit(tx, userId, "create", "individual_subscription", id, { accountId: input.accountId, name, status: input.status ?? "active", source: "account_detail" });
    return { id };
  });
}

export async function updateIndividualSubscriptionStatus(
  userId: number,
  input: { id: number; status: IndividualSubscriptionStatus; notes?: string },
) {
  const db = await requireDb();
  const rows = await db.select().from(individualSubscriptions).where(eq(individualSubscriptions.id, input.id)).limit(1);
  if (!rows[0]) throw new Error("سجل الاشتراك الفردي غير موجود");
  await db.update(individualSubscriptions).set({ status: input.status, notes: input.notes?.trim() || null }).where(eq(individualSubscriptions.id, input.id));
  await writeAudit(db, userId, "update", "individual_subscription", input.id, { accountId: rows[0].accountId, status: input.status });
  return { id: input.id };
}

export async function updateIndividualSubscription(
  userId: number,
  input: { id: number; name: string; status: IndividualSubscriptionStatus; notes?: string },
) {
  const name = input.name.trim();
  if (!name) throw new Error("أدخل اسم الاشتراك");
  const db = await requireDb();
  const rows = await db.select().from(individualSubscriptions).where(eq(individualSubscriptions.id, input.id)).limit(1);
  if (!rows[0]) throw new Error("سجل الاشتراك الفردي غير موجود");
  await db.update(individualSubscriptions).set({ name, status: input.status, notes: input.notes?.trim() || null }).where(eq(individualSubscriptions.id, input.id));
  await writeAudit(db, userId, "update", "individual_subscription", input.id, { accountId: rows[0].accountId, name, status: input.status });
  return { id: input.id };
}

export async function updateIndividualSubscriptionCharge(
  userId: number,
  input: { accountId: number; chargeId: number; description: string; amount: string; chargedAt: Date; notes?: string },
) {
  const amountCents = moneyToCents(input.amount);
  const description = input.description.trim();
  if (!description) throw new Error("أدخل وصف المبلغ");
  const db = await requireDb();
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT ${individualSubscriptionCharges.id} FROM ${individualSubscriptionCharges} WHERE ${eq(individualSubscriptionCharges.id, input.chargeId)} FOR UPDATE`);
    const chargeRows = await tx.select().from(individualSubscriptionCharges).where(and(eq(individualSubscriptionCharges.id, input.chargeId), eq(individualSubscriptionCharges.accountId, input.accountId))).limit(1);
    const charge = chargeRows[0];
    if (!charge) throw new Error("عملية مبلغ الاشتراك غير موجودة في هذا الحساب");
    if (charge.status === "cancelled") throw new Error("لا يمكن تعديل عملية ملغاة");
    const paidCents = moneyToCents(charge.paidAmount);
    const discountCents = moneyToCents(charge.discountAmount);
    if (amountCents < paidCents + discountCents) throw new Error("لا يمكن جعل المبلغ أقل من المقبوض والخصم المسجلين");
    const status = getIndividualChargeStatus(amountCents, paidCents, discountCents);
    await tx.update(individualSubscriptionCharges).set({ description, amount: centsToMoney(amountCents), chargedAt: input.chargedAt, notes: input.notes?.trim() || null, status }).where(eq(individualSubscriptionCharges.id, charge.id));
    await writeAudit(tx, userId, "update", "individual_subscription_charge", charge.id, { accountId: input.accountId, oldAmount: charge.amount, amount: centsToMoney(amountCents), paidAmount: charge.paidAmount, discountAmount: charge.discountAmount, description });
    return { id: charge.id, amount: centsToMoney(amountCents), status };
  });
}

export async function createIndividualSubscriptionDiscount(
  userId: number,
  input: { accountId: number; chargeId: number; amount: string; adjustmentDate: Date; notes?: string },
) {
  const amountCents = moneyToCents(input.amount);
  const db = await requireDb();
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT ${individualSubscriptionCharges.id} FROM ${individualSubscriptionCharges} WHERE ${eq(individualSubscriptionCharges.id, input.chargeId)} FOR UPDATE`);
    const chargeRows = await tx.select().from(individualSubscriptionCharges).where(and(eq(individualSubscriptionCharges.id, input.chargeId), eq(individualSubscriptionCharges.accountId, input.accountId))).limit(1);
    const charge = chargeRows[0];
    if (!charge) throw new Error("عملية مبلغ الاشتراك غير موجودة في هذا الحساب");
    if (charge.status === "cancelled") throw new Error("لا يمكن خصم عملية ملغاة");
    const paidCents = moneyToCents(charge.paidAmount);
    const previousDiscountCents = moneyToCents(charge.discountAmount);
    const remainingCents = moneyToCents(charge.amount) - paidCents - previousDiscountCents;
    if (amountCents > remainingCents) throw new Error("مبلغ الخصم أكبر من المتبقي على الاشتراك");
    const discountResult = await tx.insert(individualSubscriptionAdjustments).values({ accountId: input.accountId, chargeId: charge.id, type: "discount", currencyCode: charge.currencyCode, amount: centsToMoney(amountCents), adjustmentDate: input.adjustmentDate, notes: input.notes?.trim() || null, createdByUserId: userId });
    const discountId = Number(discountResult[0].insertId);
    const discountCents = previousDiscountCents + amountCents;
    const status = getIndividualChargeStatus(moneyToCents(charge.amount), paidCents, discountCents);
    await tx.update(individualSubscriptionCharges).set({ discountAmount: centsToMoney(discountCents), status }).where(eq(individualSubscriptionCharges.id, charge.id));
    await writeAudit(tx, userId, "create", "individual_subscription_discount", discountId, { accountId: input.accountId, chargeId: charge.id, amount: centsToMoney(amountCents), currencyCode: charge.currencyCode, status });
    return { id: discountId, chargeId: charge.id, amount: centsToMoney(amountCents), currencyCode: charge.currencyCode, status };
  });
}

export async function updateIndividualSubscriptionDiscount(
  userId: number,
  input: { accountId: number; adjustmentId: number; amount: string; adjustmentDate: Date; notes?: string },
) {
  const amountCents = moneyToCents(input.amount);
  const db = await requireDb();
  return db.transaction(async tx => {
    const adjustmentRows = await tx.select().from(individualSubscriptionAdjustments).where(and(eq(individualSubscriptionAdjustments.id, input.adjustmentId), eq(individualSubscriptionAdjustments.accountId, input.accountId))).limit(1);
    const adjustment = adjustmentRows[0];
    if (!adjustment) throw new Error("عملية الخصم غير موجودة في هذا الحساب");
    await tx.execute(sql`SELECT ${individualSubscriptionCharges.id} FROM ${individualSubscriptionCharges} WHERE ${eq(individualSubscriptionCharges.id, adjustment.chargeId)} FOR UPDATE`);
    const chargeRows = await tx.select().from(individualSubscriptionCharges).where(and(eq(individualSubscriptionCharges.id, adjustment.chargeId), eq(individualSubscriptionCharges.accountId, input.accountId))).limit(1);
    const charge = chargeRows[0];
    if (!charge || charge.status === "cancelled") throw new Error("لا يمكن تعديل خصم عملية ملغاة");
    const previousDiscountCents = moneyToCents(charge.discountAmount);
    const oldAdjustmentCents = moneyToCents(adjustment.amount);
    const newDiscountCents = previousDiscountCents - oldAdjustmentCents + amountCents;
    const paidCents = moneyToCents(charge.paidAmount);
    if (newDiscountCents < 0n || paidCents + newDiscountCents > moneyToCents(charge.amount)) throw new Error("مبلغ الخصم المعدل أكبر من المتبقي على الاشتراك");
    const status = getIndividualChargeStatus(moneyToCents(charge.amount), paidCents, newDiscountCents);
    await tx.update(individualSubscriptionAdjustments).set({ amount: centsToMoney(amountCents), adjustmentDate: input.adjustmentDate, notes: input.notes?.trim() || null }).where(eq(individualSubscriptionAdjustments.id, adjustment.id));
    await tx.update(individualSubscriptionCharges).set({ discountAmount: centsToMoney(newDiscountCents), status }).where(eq(individualSubscriptionCharges.id, charge.id));
    await writeAudit(tx, userId, "update", "individual_subscription_discount", adjustment.id, { accountId: input.accountId, chargeId: charge.id, oldAmount: adjustment.amount, amount: centsToMoney(amountCents), currencyCode: charge.currencyCode, status });
    return { id: adjustment.id, chargeId: charge.id, amount: centsToMoney(amountCents), currencyCode: charge.currencyCode, status };
  });
}

export async function createIndividualSubscriptionCharge(
  userId: number,
  input: { accountId: number; subscriptionId?: number; description?: string; currencyCode: CurrencyCode; amount: string; chargedAt: Date; notes?: string; initialPaidAmount?: string },
) {
  const amountCents = moneyToCents(input.amount);
  const initialPaidCents = moneyToCents(input.initialPaidAmount ?? "0");
  if (amountCents <= 0n) throw new Error("أدخل مبلغ اشتراك أكبر من صفر");
  if (initialPaidCents < 0n || initialPaidCents > amountCents) throw new Error("المبلغ المدفوع لا يمكن أن يتجاوز مبلغ الاشتراك");
  const description = input.description?.trim() || "اشتراك إنترنت";
  const db = await requireDb();
  return db.transaction(async tx => {
    const account = await getIndividualSubscriptionAccount(tx, input.accountId);
    if (account.status === "closed") throw new Error("لا يمكن إضافة مبلغ إلى حساب اشتراك مغلق");
    await getActiveCurrency(tx, input.currencyCode);
    if (input.subscriptionId) {
      const subscriptionsForAccount = await tx.select({ id: individualSubscriptions.id }).from(individualSubscriptions).where(and(eq(individualSubscriptions.id, input.subscriptionId), eq(individualSubscriptions.accountId, input.accountId))).limit(1);
      if (!subscriptionsForAccount[0]) throw new Error("سجل الاشتراك المحدد لا يتبع هذا الحساب");
    }
    const status = getIndividualChargeStatus(amountCents, initialPaidCents, 0n);
    const result = await tx.insert(individualSubscriptionCharges).values({
      accountId: input.accountId,
      subscriptionId: input.subscriptionId ?? null,
      description,
      currencyCode: input.currencyCode,
      amount: centsToMoney(amountCents),
      paidAmount: centsToMoney(initialPaidCents),
      status,
      chargedAt: input.chargedAt,
      notes: input.notes?.trim() || null,
      createdByUserId: userId,
    });
    const id = Number(result[0].insertId);
    let paymentId: number | null = null;
    if (initialPaidCents > 0n) {
      await lockIndividualSubscriptionCashCurrencies(tx, [input.currencyCode]);
      const paymentResult = await tx.insert(individualSubscriptionPayments).values({ accountId: input.accountId, chargeId: id, currencyCode: input.currencyCode, amount: centsToMoney(initialPaidCents), paymentDate: input.chargedAt, notes: "سداد عند تسجيل الاشتراك", createdByUserId: userId });
      paymentId = Number(paymentResult[0].insertId);
      await tx.insert(individualSubscriptionCashMovements).values({ direction: "in", type: "payment", currencyCode: input.currencyCode, amount: centsToMoney(initialPaidCents), sourcePaymentId: paymentId, occurredAt: input.chargedAt, description: `سداد اشتراك ${account.name}`, createdByUserId: userId });
      await adjustIndividualSubscriptionCashBalance(tx, input.currencyCode, initialPaidCents);
      await writeAudit(tx, userId, "create", "individual_subscription_payment", paymentId, { accountId: input.accountId, chargeId: id, amount: centsToMoney(initialPaidCents), currencyCode: input.currencyCode, source: "charge_creation" });
    }
    await writeAudit(tx, userId, "create", "individual_subscription_charge", id, { accountId: input.accountId, subscriptionId: input.subscriptionId ?? null, amount: centsToMoney(amountCents), paidAmount: centsToMoney(initialPaidCents), currencyCode: input.currencyCode, status });
    return { id, paymentId, status, amount: centsToMoney(amountCents), paidAmount: centsToMoney(initialPaidCents), currencyCode: input.currencyCode };
  });
}

export async function recordIndividualSubscriptionPayment(
  userId: number,
  input: { accountId: number; chargeId: number; amount: string; paymentDate: Date; notes?: string },
) {
  const amountCents = moneyToCents(input.amount);
  if (amountCents <= 0n) throw new Error("أدخل مبلغ قبض أكبر من صفر");
  const db = await requireDb();
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT ${individualSubscriptionCharges.id} FROM ${individualSubscriptionCharges} WHERE ${eq(individualSubscriptionCharges.id, input.chargeId)} FOR UPDATE`);
    const chargeRows = await tx.select().from(individualSubscriptionCharges).where(and(eq(individualSubscriptionCharges.id, input.chargeId), eq(individualSubscriptionCharges.accountId, input.accountId))).limit(1);
    const charge = chargeRows[0];
    if (!charge) throw new Error("مبلغ الاشتراك المحدد لا يتبع هذا الحساب");
    if (charge.status === "cancelled") throw new Error("لا يمكن تسجيل قبض على مبلغ اشتراك ملغي");
    const remainingCents = moneyToCents(charge.amount) - moneyToCents(charge.paidAmount) - moneyToCents(charge.discountAmount);
    if (amountCents > remainingCents) throw new Error("مبلغ القبض أكبر من المتبقي على الاشتراك");
    const account = await getIndividualSubscriptionAccount(tx, input.accountId);
    await lockIndividualSubscriptionCashCurrencies(tx, [charge.currencyCode]);
    const paymentResult = await tx.insert(individualSubscriptionPayments).values({ accountId: input.accountId, chargeId: input.chargeId, currencyCode: charge.currencyCode, amount: centsToMoney(amountCents), paymentDate: input.paymentDate, notes: input.notes?.trim() || null, createdByUserId: userId });
    const paymentId = Number(paymentResult[0].insertId);
    const newPaidCents = moneyToCents(charge.paidAmount) + amountCents;
    const newStatus = getIndividualChargeStatus(moneyToCents(charge.amount), newPaidCents, moneyToCents(charge.discountAmount));
    await tx.update(individualSubscriptionCharges).set({ paidAmount: centsToMoney(newPaidCents), status: newStatus }).where(eq(individualSubscriptionCharges.id, charge.id));
    await tx.insert(individualSubscriptionCashMovements).values({ direction: "in", type: "payment", currencyCode: charge.currencyCode, amount: centsToMoney(amountCents), sourcePaymentId: paymentId, occurredAt: input.paymentDate, description: `إيداع سداد ${account.name}`, createdByUserId: userId });
    await adjustIndividualSubscriptionCashBalance(tx, charge.currencyCode, amountCents);
    await writeAudit(tx, userId, "create", "individual_subscription_payment", paymentId, { accountId: input.accountId, chargeId: input.chargeId, amount: centsToMoney(amountCents), currencyCode: charge.currencyCode, status: newStatus });
    return { id: paymentId, chargeId: charge.id, status: newStatus, amount: centsToMoney(amountCents), currencyCode: charge.currencyCode };
  });
}

export async function createInvoice(
  userId: number,
  input: {
    contactId: number;
    movementCategoryId?: number;
    cashAccountId?: number;
    type: "cash" | "credit";
    issueDate: Date;
    currencyCode: string;
    exchangeRateToBase: string;
    discountAmount: string;
    notes?: string;
    items: LineItemInput[];
  },
) {
  await ensureAccountingDefaults();
  const db = await requireDb();
  const itemRows = input.items.map(item => {
    const total = calculateLineTotal(moneyToCents(item.unitPrice), quantityToMillis(item.quantity));
    return {
      description: item.description.trim(),
      quantity: item.quantity,
      unitPrice: centsToMoney(moneyToCents(item.unitPrice)),
      totalAmount: centsToMoney(total),
      cents: total,
    };
  });
  const subtotalCents = sumCents(itemRows.map(item => item.cents));
  const totalCents = subtotalCents - moneyToCents(input.discountAmount);
  if (totalCents <= 0n) throw new Error("إجمالي الفاتورة يجب أن يكون أكبر من صفر");
  rateToMicros(input.exchangeRateToBase);

  return db.transaction(async tx => {
    const contact = await getActiveContact(tx, input.contactId);
    await getActiveCurrency(tx, input.currencyCode);
    const cashAccount = input.type === "cash" ? await resolveCashAccount(tx, input.cashAccountId) : null;
    if (cashAccount) await lockCashAccountCurrencies(tx, cashAccount.id, [input.currencyCode]);
    const temporaryNumber = temporaryReference("INV");
    const result = await tx.insert(invoices).values({
      invoiceNumber: temporaryNumber,
      contactId: input.contactId,
      movementCategoryId: input.movementCategoryId ?? null,
      type: input.type,
      status: input.type === "cash" ? "paid" : "issued",
      issueDate: input.issueDate,
      currencyCode: input.currencyCode,
      exchangeRateToBase: input.exchangeRateToBase,
      subtotal: centsToMoney(subtotalCents),
      discountAmount: centsToMoney(moneyToCents(input.discountAmount)),
      totalAmount: centsToMoney(totalCents),
      paidAmount: input.type === "cash" ? centsToMoney(totalCents) : "0.00",
      cashAccountId: cashAccount?.id ?? null,
      notes: input.notes?.trim() || null,
      createdByUserId: userId,
    });
    const invoiceId = Number(result[0].insertId);
    const invoiceNumber = referenceNumber("FAT", invoiceId);
    await tx.update(invoices).set({ invoiceNumber }).where(eq(invoices.id, invoiceId));
    await tx.insert(invoiceItems).values(
      itemRows.map(item => ({
        invoiceId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalAmount: item.totalAmount,
      })),
    );

    if (input.type === "cash") {
      await tx.insert(cashMovements).values({
        direction: "in",
        type: "cash_invoice",
        currencyCode: input.currencyCode,
        amount: centsToMoney(totalCents),
        occurredAt: input.issueDate,
        sourceType: "invoice",
        sourceId: invoiceId,
        cashAccountId: cashAccount.id,
        description: `فاتورة نقدية ${invoiceNumber} — ${contact.name}`,
        notes: input.notes?.trim() || null,
        createdByUserId: userId,
      });
      await adjustTrackedCashBalance(tx, cashAccount.id, input.currencyCode, totalCents);
    }

    await writeAudit(tx, userId, "create", "invoice", invoiceId, {
      invoiceNumber,
      contactId: input.contactId,
      type: input.type,
      cashAccountId: cashAccount?.id,
      totalAmount: centsToMoney(totalCents),
      currencyCode: input.currencyCode,
    });
    return { id: invoiceId, invoiceNumber };
  });
}

export async function createReceipt(
  userId: number,
  input: {
    contactId: number;
    movementCategoryId?: number;
    receiptDate: Date;
    currencyCode: string;
    exchangeRateToBase: string;
    cashAccountId?: number;
    amount: string;
    notes?: string;
    allocations: ReceiptAllocationInput[];
  },
) {
  await ensureAccountingDefaults();
  const receiptAmountCents = moneyToCents(input.amount);
  const allocatedCents = sumCents(input.allocations.map(allocation => moneyToCents(allocation.amount)));
  if (receiptAmountCents <= 0n || allocatedCents !== receiptAmountCents) {
    throw new Error("يجب أن يساوي مجموع توزيع سند القبض مبلغ السند");
  }
  rateToMicros(input.exchangeRateToBase);
  const db = await requireDb();

  return db.transaction(async tx => {
    const contact = await getActiveContact(tx, input.contactId);
    await getActiveCurrency(tx, input.currencyCode);
    const cashAccount = await resolveCashAccount(tx, input.cashAccountId);
    const invoiceIds = input.allocations.map(allocation => allocation.invoiceId);
    await lockReceiptResources(tx, invoiceIds, input.currencyCode, async (transaction, codes) => lockCashAccountCurrencies(transaction, cashAccount.id, codes));
    const selectedInvoices = await tx.select().from(invoices).where(inArray(invoices.id, invoiceIds));
    if (selectedInvoices.length !== invoiceIds.length) throw new Error("تعذر العثور على إحدى الفواتير المحددة");
    for (const invoice of selectedInvoices) {
      if (invoice.contactId !== input.contactId || invoice.type !== "credit" || invoice.currencyCode !== input.currencyCode || invoice.status === "cancelled") {
        throw new Error("يمكن توزيع القبض على فواتير العميل الآجلة وبنفس العملة فقط");
      }
    }

    const paidByInvoice = new Map<number, bigint>();
    for (const invoice of selectedInvoices) paidByInvoice.set(invoice.id, moneyToCents(invoice.paidAmount));
    for (const allocation of input.allocations) {
      const invoice = selectedInvoices.find(item => item.id === allocation.invoiceId)!;
      const due = moneyToCents(invoice.totalAmount) - (paidByInvoice.get(invoice.id) ?? 0n);
      if (!canAllocateReceipt(moneyToCents(invoice.totalAmount), paidByInvoice.get(invoice.id) ?? 0n, moneyToCents(allocation.amount))) {
        throw new Error("لا يمكن قبض مبلغ أكبر من المتبقي على الفاتورة");
      }
    }

    const temporaryNumber = temporaryReference("RCP");
    const result = await tx.insert(receipts).values({
      receiptNumber: temporaryNumber,
      contactId: input.contactId,
      movementCategoryId: input.movementCategoryId ?? null,
      receiptDate: input.receiptDate,
      currencyCode: input.currencyCode,
      exchangeRateToBase: input.exchangeRateToBase,
      amount: centsToMoney(receiptAmountCents),
      cashAccountId: cashAccount.id,
      notes: input.notes?.trim() || null,
      createdByUserId: userId,
    });
    const receiptId = Number(result[0].insertId);
    const receiptNumber = referenceNumber("SND", receiptId);
    await tx.update(receipts).set({ receiptNumber }).where(eq(receipts.id, receiptId));
    await tx.insert(receiptAllocations).values(
      input.allocations.map(allocation => ({ receiptId, invoiceId: allocation.invoiceId, amount: allocation.amount })),
    );

    const allocationByInvoice = new Map<number, bigint>();
    for (const allocation of input.allocations) allocationByInvoice.set(allocation.invoiceId, (allocationByInvoice.get(allocation.invoiceId) ?? 0n) + moneyToCents(allocation.amount));
    for (const [invoiceId, allocatedCents] of allocationByInvoice) {
      const allocatedAmount = centsToMoney(allocatedCents);
      const result = await tx
        .update(invoices)
        .set({
          paidAmount: sql`${invoices.paidAmount} + ${allocatedAmount}`,
          status: sql`CASE WHEN ${invoices.paidAmount} + ${allocatedAmount} >= ${invoices.totalAmount} THEN 'paid' ELSE 'partially_paid' END`,
        })
        .where(and(eq(invoices.id, invoiceId), sql`${invoices.paidAmount} + ${allocatedAmount} <= ${invoices.totalAmount}`));
      if (Number(result[0]?.affectedRows ?? 0) !== 1) throw new Error("لا يمكن قبض مبلغ أكبر من المتبقي على الفاتورة");
    }

    await tx.insert(cashMovements).values({
      direction: "in",
      type: "receipt",
      currencyCode: input.currencyCode,
      amount: centsToMoney(receiptAmountCents),
      occurredAt: input.receiptDate,
      sourceType: "receipt",
      sourceId: receiptId,
      cashAccountId: cashAccount.id,
      description: `سند قبض ${receiptNumber} — ${contact.name}`,
      notes: input.notes?.trim() || null,
      createdByUserId: userId,
    });
    await adjustTrackedCashBalance(tx, cashAccount.id, input.currencyCode, receiptAmountCents);
    await writeAudit(tx, userId, "create", "receipt", receiptId, {
      receiptNumber,
      contactId: input.contactId,
      amount: centsToMoney(receiptAmountCents),
      currencyCode: input.currencyCode,
      cashAccountId: cashAccount.id,
    });
    return { id: receiptId, receiptNumber };
  });
}

export async function updateInvoice(
  userId: number,
  input: { contactId: number; invoiceId: number; issueDate: Date; description: string; amount: string; cashAccountId?: number; notes?: string },
) {
  const newTotalCents = moneyToCents(input.amount);
  if (newTotalCents <= 0n) throw new Error("مبلغ الفاتورة يجب أن يكون أكبر من صفر");
  const description = input.description.trim();
  if (!description) throw new Error("أدخل بيان الفاتورة");
  const db = await requireDb();
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT ${invoices.id} FROM ${invoices} WHERE ${eq(invoices.id, input.invoiceId)} FOR UPDATE`);
    const invoiceRows = await tx.select().from(invoices).where(and(eq(invoices.id, input.invoiceId), eq(invoices.contactId, input.contactId))).limit(1);
    const invoice = invoiceRows[0];
    if (!invoice || invoice.status === "cancelled") throw new Error("الفاتورة غير متاحة للتعديل");
    const itemRows = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
    if (itemRows.length !== 1) throw new Error("لا يمكن تعديل فاتورة متعددة البنود من هذا الحساب");
    const discountCents = moneyToCents(invoice.discountAmount);
    const newSubtotalCents = newTotalCents + discountCents;
    const oldTotalCents = moneyToCents(invoice.totalAmount);
    const paidCents = moneyToCents(invoice.paidAmount);
    if (invoice.type === "credit" && newTotalCents < paidCents) throw new Error("لا يمكن جعل مبلغ الفاتورة أقل من المقبوض عليها");
    const cashAccount = invoice.type === "cash" ? await resolveCashAccount(tx, input.cashAccountId ?? invoice.cashAccountId) : null;
    const previousCashAccount = invoice.type === "cash" ? await resolveCashAccount(tx, invoice.cashAccountId) : null;
    if (previousCashAccount && cashAccount) await lockCashAccountBalanceResources(tx, [{ cashAccountId: previousCashAccount.id, currencyCode: invoice.currencyCode }, { cashAccountId: cashAccount.id, currencyCode: invoice.currencyCode }]);
    const status = invoice.type === "cash" ? "paid" : getCreditInvoiceStatus(newTotalCents, paidCents);
    await tx.update(invoices).set({ issueDate: input.issueDate, subtotal: centsToMoney(newSubtotalCents), totalAmount: centsToMoney(newTotalCents), paidAmount: invoice.type === "cash" ? centsToMoney(newTotalCents) : invoice.paidAmount, cashAccountId: cashAccount?.id ?? null, status, notes: input.notes?.trim() || null }).where(eq(invoices.id, invoice.id));
    await tx.update(invoiceItems).set({ description, unitPrice: centsToMoney(newSubtotalCents), totalAmount: centsToMoney(newSubtotalCents) }).where(eq(invoiceItems.id, itemRows[0].id));
    if (invoice.type === "cash") {
      const deltaCents = newTotalCents - oldTotalCents;
      if (cashAccount!.id === previousCashAccount!.id) {
        if (deltaCents < 0n) await debitTrackedCashBalance(tx, cashAccount!.id, invoice.currencyCode, -deltaCents);
        if (deltaCents > 0n) await adjustTrackedCashBalance(tx, cashAccount!.id, invoice.currencyCode, deltaCents);
      } else {
        await debitTrackedCashBalance(tx, previousCashAccount!.id, invoice.currencyCode, oldTotalCents);
        await adjustTrackedCashBalance(tx, cashAccount!.id, invoice.currencyCode, newTotalCents);
      }
      await tx.update(cashMovements).set({ amount: centsToMoney(newTotalCents), occurredAt: input.issueDate, cashAccountId: cashAccount!.id, description: `فاتورة نقدية ${invoice.invoiceNumber}`, notes: input.notes?.trim() || null }).where(and(eq(cashMovements.sourceType, "invoice"), eq(cashMovements.sourceId, invoice.id)));
    }
    await writeAudit(tx, userId, "update", "invoice", invoice.id, { contactId: input.contactId, oldAmount: invoice.totalAmount, amount: centsToMoney(newTotalCents), type: invoice.type, currencyCode: invoice.currencyCode, cashAccountId: cashAccount?.id });
    return { id: invoice.id, invoiceNumber: invoice.invoiceNumber, totalAmount: centsToMoney(newTotalCents), status };
  });
}

export async function updateReceipt(
  userId: number,
  input: { contactId: number; receiptId: number; receiptDate: Date; cashAccountId?: number; amount: string; notes?: string; allocations: ReceiptAllocationInput[] },
) {
  const newAmountCents = moneyToCents(input.amount);
  const allocationCents = sumCents(input.allocations.map(allocation => moneyToCents(allocation.amount)));
  if (newAmountCents <= 0n || newAmountCents !== allocationCents) throw new Error("يجب أن يساوي مجموع توزيع سند القبض مبلغ السند");
  const db = await requireDb();
  return db.transaction(async tx => {
    const receiptRows = await tx.select().from(receipts).where(and(eq(receipts.id, input.receiptId), eq(receipts.contactId, input.contactId), eq(receipts.status, "active"))).limit(1);
    const receipt = receiptRows[0];
    if (!receipt) throw new Error("سند القبض غير متاح للتعديل");
    const cashAccount = await resolveCashAccount(tx, input.cashAccountId ?? receipt.cashAccountId);
    const previousCashAccount = await resolveCashAccount(tx, receipt.cashAccountId);
    const oldAllocations = await tx.select().from(receiptAllocations).where(eq(receiptAllocations.receiptId, receipt.id));
    const invoiceIds = [...new Set([...oldAllocations.map(allocation => allocation.invoiceId), ...input.allocations.map(allocation => allocation.invoiceId)])];
    if (!invoiceIds.length) throw new Error("حدد فاتورة آجلة واحدة على الأقل");
    await lockReceiptResources(tx, invoiceIds, receipt.currencyCode, async (transaction, codes) => lockCashAccountBalanceResources(transaction, [{ cashAccountId: previousCashAccount.id, currencyCode: codes[0] }, { cashAccountId: cashAccount.id, currencyCode: codes[0] }]));
    const selectedInvoices = await tx.select().from(invoices).where(inArray(invoices.id, invoiceIds));
    if (selectedInvoices.length !== invoiceIds.length) throw new Error("تعذر العثور على إحدى الفواتير المحددة");
    const previousByInvoice = new Map<number, bigint>();
    for (const allocation of oldAllocations) previousByInvoice.set(allocation.invoiceId, (previousByInvoice.get(allocation.invoiceId) ?? 0n) + moneyToCents(allocation.amount));
    const nextByInvoice = new Map<number, bigint>();
    for (const allocation of input.allocations) nextByInvoice.set(allocation.invoiceId, (nextByInvoice.get(allocation.invoiceId) ?? 0n) + moneyToCents(allocation.amount));
    for (const invoice of selectedInvoices) {
      if (invoice.contactId !== input.contactId || invoice.type !== "credit" || invoice.currencyCode !== receipt.currencyCode || invoice.status === "cancelled") throw new Error("يمكن توزيع القبض على فواتير العميل الآجلة وبنفس العملة فقط");
      const paidWithoutThisReceipt = moneyToCents(invoice.paidAmount) - (previousByInvoice.get(invoice.id) ?? 0n);
      const nextAllocation = nextByInvoice.get(invoice.id) ?? 0n;
      if (paidWithoutThisReceipt < 0n || paidWithoutThisReceipt + nextAllocation > moneyToCents(invoice.totalAmount)) throw new Error("لا يمكن قبض مبلغ أكبر من المتبقي على الفاتورة");
    }
    const oldAmountCents = moneyToCents(receipt.amount);
    const deltaCents = newAmountCents - oldAmountCents;
    if (cashAccount.id === previousCashAccount.id) {
      if (deltaCents < 0n) await debitTrackedCashBalance(tx, cashAccount.id, receipt.currencyCode, -deltaCents);
      if (deltaCents > 0n) await adjustTrackedCashBalance(tx, cashAccount.id, receipt.currencyCode, deltaCents);
    } else {
      await debitTrackedCashBalance(tx, previousCashAccount.id, receipt.currencyCode, oldAmountCents);
      await adjustTrackedCashBalance(tx, cashAccount.id, receipt.currencyCode, newAmountCents);
    }
    await tx.delete(receiptAllocations).where(eq(receiptAllocations.receiptId, receipt.id));
    await tx.insert(receiptAllocations).values(input.allocations.map(allocation => ({ receiptId: receipt.id, invoiceId: allocation.invoiceId, amount: centsToMoney(moneyToCents(allocation.amount)) })));
    await tx.update(receipts).set({ receiptDate: input.receiptDate, amount: centsToMoney(newAmountCents), cashAccountId: cashAccount.id, notes: input.notes?.trim() || null }).where(eq(receipts.id, receipt.id));
    await tx.update(cashMovements).set({ amount: centsToMoney(newAmountCents), occurredAt: input.receiptDate, cashAccountId: cashAccount.id, description: `سند قبض ${receipt.receiptNumber}`, notes: input.notes?.trim() || null }).where(and(eq(cashMovements.sourceType, "receipt"), eq(cashMovements.sourceId, receipt.id)));
    await rebuildInvoicePaidAmounts(tx);
    await writeAudit(tx, userId, "update", "receipt", receipt.id, { contactId: input.contactId, oldAmount: receipt.amount, amount: centsToMoney(newAmountCents), currencyCode: receipt.currencyCode, cashAccountId: cashAccount.id, allocations: input.allocations.length });
    return { id: receipt.id, receiptNumber: receipt.receiptNumber, amount: centsToMoney(newAmountCents) };
  });
}

export async function createExpense(
  userId: number,
  input: {
    contactId?: number;
    movementCategoryId: number;
    expenseDate: Date;
    currencyCode: string;
    exchangeRateToBase: string;
    cashAccountId?: number;
    amount: string;
    description: string;
    supplierName?: string;
    supplierInvoiceNumber?: string;
    attachment?: ExpenseAttachmentInput;
    notes?: string;
    allowCashOverdraft?: boolean;
    cashOverrideReason?: string;
  },
) {
  await ensureAccountingDefaults();
  const amountCents = moneyToCents(input.amount);
  if (amountCents <= 0n) throw new Error("قيمة المصروف يجب أن تكون أكبر من صفر");
  rateToMicros(input.exchangeRateToBase);
  const db = await requireDb();
  const category = await getActiveMovementCategory(db, input.movementCategoryId, "expense");
  const isExternalPurchase = isExternalPurchaseCategory(category.name);
  const acceptsSupplierDetails = isExternalPurchase || category.name.includes("شراء خدمة الإنترنت");
  const hasSupplierDetails = Boolean(input.supplierName?.trim() || input.supplierInvoiceNumber?.trim() || input.attachment);
  if (hasSupplierDetails && !acceptsSupplierDetails) throw new Error("بيانات فاتورة المورد مخصصة لشراء الأصول أو المعدات أو خدمة الإنترنت");
  if (isExternalPurchase && (!input.supplierName?.trim() || !input.supplierInvoiceNumber?.trim())) {
    throw new Error("أدخل اسم المحل أو التاجر ورقم فاتورة المورد لعملية الشراء الخارجية");
  }
  if (input.allowCashOverdraft && !input.cashOverrideReason?.trim()) throw new Error("أدخل سبب تجاوز الصندوق قبل اعتماد المصروف");
  const attachment = input.attachment ? await uploadExpenseAttachment(userId, input.attachment) : null;
  return db.transaction(async tx => {
    await getActiveCurrency(tx, input.currencyCode);
    if (input.contactId) await getActiveContact(tx, input.contactId);
    await getActiveMovementCategory(tx, input.movementCategoryId, "expense");
    const cashAccount = await resolveCashAccount(tx, input.cashAccountId);
    await lockCashAccountCurrencies(tx, cashAccount.id, [input.currencyCode]);
    if (input.allowCashOverdraft) await adjustTrackedCashBalance(tx, cashAccount.id, input.currencyCode, -amountCents);
    else await debitTrackedCashBalance(tx, cashAccount.id, input.currencyCode, amountCents);
    const temporaryNumber = temporaryReference("EXP");
    const result = await tx.insert(expenses).values({
      expenseNumber: temporaryNumber,
      contactId: input.contactId ?? null,
      movementCategoryId: input.movementCategoryId,
      expenseDate: input.expenseDate,
      currencyCode: input.currencyCode,
      exchangeRateToBase: input.exchangeRateToBase,
      amount: centsToMoney(amountCents),
      cashAccountId: cashAccount.id,
      description: input.description.trim(),
      supplierName: acceptsSupplierDetails ? input.supplierName?.trim() || null : null,
      supplierInvoiceNumber: acceptsSupplierDetails ? input.supplierInvoiceNumber?.trim() || null : null,
      attachmentName: attachment ? input.attachment!.fileName : null,
      attachmentKey: attachment?.key ?? null,
      attachmentUrl: attachment?.url ?? null,
      allowCashOverdraft: Boolean(input.allowCashOverdraft),
      cashOverrideReason: input.allowCashOverdraft ? input.cashOverrideReason?.trim() || null : null,
      notes: input.notes?.trim() || null,
      createdByUserId: userId,
    });
    const expenseId = Number(result[0].insertId);
    const expenseNumber = referenceNumber("SRF", expenseId);
    await tx.update(expenses).set({ expenseNumber }).where(eq(expenses.id, expenseId));
    await tx.insert(cashMovements).values({
      direction: "out",
      type: "expense",
      currencyCode: input.currencyCode,
      amount: centsToMoney(amountCents),
      occurredAt: input.expenseDate,
      sourceType: "expense",
      sourceId: expenseId,
      cashAccountId: cashAccount.id,
      description: `${expenseNumber} — ${input.description.trim()}`,
      notes: input.notes?.trim() || null,
      createdByUserId: userId,
    });
    await writeAudit(tx, userId, "create", "expense", expenseId, { expenseNumber, contactId: input.contactId, movementCategoryId: input.movementCategoryId, cashAccountId: cashAccount.id, supplierName: input.supplierName, supplierInvoiceNumber: input.supplierInvoiceNumber, attachmentName: input.attachment?.fileName, amount: centsToMoney(amountCents), allowCashOverdraft: Boolean(input.allowCashOverdraft), cashOverrideReason: input.allowCashOverdraft ? input.cashOverrideReason?.trim() : undefined });
    return { id: expenseId, expenseNumber };
  });
}

export async function updateExpense(
  userId: number,
  input: { expenseId: number; contactId?: number; movementCategoryId: number; expenseDate: Date; cashAccountId?: number; amount: string; description: string; supplierName?: string; supplierInvoiceNumber?: string; notes?: string; allowCashOverdraft?: boolean; cashOverrideReason?: string },
) {
  const newAmountCents = moneyToCents(input.amount);
  if (newAmountCents <= 0n) throw new Error("قيمة المصروف يجب أن تكون أكبر من صفر");
  if (input.allowCashOverdraft && !input.cashOverrideReason?.trim()) throw new Error("أدخل سبب تجاوز الصندوق قبل حفظ التعديل");
  const db = await requireDb();
  return db.transaction(async tx => {
    const rows = await tx.select().from(expenses).where(and(eq(expenses.id, input.expenseId), eq(expenses.status, "active"))).limit(1);
    const expense = rows[0];
    if (!expense) throw new Error("المصروف غير متاح للتعديل");
    const cashAccount = await resolveCashAccount(tx, input.cashAccountId ?? expense.cashAccountId);
    const previousCashAccount = await resolveCashAccount(tx, expense.cashAccountId);
    const category = await getActiveMovementCategory(tx, input.movementCategoryId, "expense");
    const isExternalPurchase = isExternalPurchaseCategory(category.name);
    const supportsSupplierDetails = isExternalPurchase || category.name.includes("شراء خدمة الإنترنت");
    if (isExternalPurchase && (!input.supplierName?.trim() || !input.supplierInvoiceNumber?.trim())) throw new Error("أدخل اسم المحل أو التاجر ورقم فاتورته لعملية الشراء الخارجية");
    if (input.contactId) await getActiveContact(tx, input.contactId);
    await lockCashAccountBalanceResources(tx, [{ cashAccountId: previousCashAccount.id, currencyCode: expense.currencyCode }, { cashAccountId: cashAccount.id, currencyCode: expense.currencyCode }]);
    if (expense.allowCashOverdraft && !input.allowCashOverdraft && (await getTrackedCashBalanceCents(tx, previousCashAccount.id, expense.currencyCode)) < 0n) {
      throw new Error("لا يمكن إزالة علامة تجاوز الصندوق ما دام رصيد هذه العملة سالباً");
    }
    const oldAmountCents = moneyToCents(expense.amount);
    const deltaCents = newAmountCents - oldAmountCents;
    if (cashAccount.id === previousCashAccount.id) {
      if (deltaCents > 0n) {
        if (input.allowCashOverdraft) await adjustTrackedCashBalance(tx, cashAccount.id, expense.currencyCode, -deltaCents);
        else await debitTrackedCashBalance(tx, cashAccount.id, expense.currencyCode, deltaCents);
      }
      if (deltaCents < 0n) await adjustTrackedCashBalance(tx, cashAccount.id, expense.currencyCode, -deltaCents);
    } else {
      await adjustTrackedCashBalance(tx, previousCashAccount.id, expense.currencyCode, oldAmountCents);
      if (input.allowCashOverdraft) await adjustTrackedCashBalance(tx, cashAccount.id, expense.currencyCode, -newAmountCents);
      else await debitTrackedCashBalance(tx, cashAccount.id, expense.currencyCode, newAmountCents);
    }
    await tx.update(expenses).set({
      contactId: input.contactId ?? null,
      movementCategoryId: input.movementCategoryId,
      expenseDate: input.expenseDate,
      amount: centsToMoney(newAmountCents),
      cashAccountId: cashAccount.id,
      description: input.description.trim(),
      supplierName: supportsSupplierDetails ? input.supplierName?.trim() || null : null,
      supplierInvoiceNumber: supportsSupplierDetails ? input.supplierInvoiceNumber?.trim() || null : null,
      allowCashOverdraft: Boolean(input.allowCashOverdraft),
      cashOverrideReason: input.allowCashOverdraft ? input.cashOverrideReason?.trim() || null : null,
      notes: input.notes?.trim() || null,
    }).where(eq(expenses.id, expense.id));
    await tx.update(cashMovements).set({ amount: centsToMoney(newAmountCents), occurredAt: input.expenseDate, cashAccountId: cashAccount.id, description: `${expense.expenseNumber} — ${input.description.trim()}`, notes: input.notes?.trim() || null }).where(and(eq(cashMovements.sourceType, "expense"), eq(cashMovements.sourceId, expense.id)));
    await writeAudit(tx, userId, "update", "expense", expense.id, { oldAmount: expense.amount, amount: centsToMoney(newAmountCents), movementCategoryId: input.movementCategoryId, cashAccountId: cashAccount.id, allowCashOverdraft: Boolean(input.allowCashOverdraft), cashOverrideReason: input.allowCashOverdraft ? input.cashOverrideReason?.trim() : undefined });
    return { id: expense.id, expenseNumber: expense.expenseNumber, amount: centsToMoney(newAmountCents) };
  });
}

export async function createOpeningBalance(
  userId: number,
  input: { cashAccountId?: number; currencyCode: string; amount: string; occurredAt: Date; notes?: string },
) {
  const amountCents = moneyToCents(input.amount);
  if (amountCents <= 0n) throw new Error("الرصيد الافتتاحي يجب أن يكون أكبر من صفر");
  const db = await requireDb();
  return db.transaction(async tx => {
    await getActiveCurrency(tx, input.currencyCode);
    const cashAccount = await resolveCashAccount(tx, input.cashAccountId);
    await lockCashAccountCurrencies(tx, cashAccount.id, [input.currencyCode]);
    const result = await tx.insert(cashMovements).values({
      direction: "in",
      type: "opening_balance",
      currencyCode: input.currencyCode,
      amount: centsToMoney(amountCents),
      cashAccountId: cashAccount.id,
      occurredAt: input.occurredAt,
      description: `رصيد افتتاحي — ${cashAccount.name}`,
      notes: input.notes?.trim() || null,
      createdByUserId: userId,
    });
    const id = Number(result[0].insertId);
    await adjustTrackedCashBalance(tx, cashAccount.id, input.currencyCode, amountCents);
    await writeAudit(tx, userId, "create", "opening_balance", id, { ...input, cashAccountId: cashAccount.id, amount: centsToMoney(amountCents) });
    return { id };
  });
}

export async function createCurrencyTransfer(
  userId: number,
  input: { transferDate: Date; fromCashAccountId?: number; fromCurrencyCode: string; fromAmount: string; toCashAccountId?: number; toCurrencyCode: string; toAmount: string; notes?: string },
) {
  await ensureAccountingDefaults();
  const fromCents = moneyToCents(input.fromAmount);
  const toCents = moneyToCents(input.toAmount);
  if (fromCents <= 0n || toCents <= 0n) {
    throw new Error("بيانات تحويل العملات غير صحيحة");
  }
  const db = await requireDb();
  return db.transaction(async tx => {
    await getActiveCurrency(tx, input.fromCurrencyCode);
    await getActiveCurrency(tx, input.toCurrencyCode);
    const fromCashAccount = await resolveCashAccount(tx, input.fromCashAccountId);
    const toCashAccount = await resolveCashAccount(tx, input.toCashAccountId);
    if (fromCashAccount.id === toCashAccount.id && input.fromCurrencyCode === input.toCurrencyCode) throw new Error("اختر حساباً أو عملة مختلفة للتحويل الداخلي");
    await lockCashAccountBalanceResources(tx, [
      { cashAccountId: fromCashAccount.id, currencyCode: input.fromCurrencyCode },
      { cashAccountId: toCashAccount.id, currencyCode: input.toCurrencyCode },
    ]);
    await debitTrackedCashBalance(tx, fromCashAccount.id, input.fromCurrencyCode, fromCents);
    const temporaryNumber = temporaryReference("TRN");
    const result = await tx.insert(currencyTransfers).values({
      transferNumber: temporaryNumber,
      transferDate: input.transferDate,
      fromCurrencyCode: input.fromCurrencyCode,
      fromAmount: centsToMoney(fromCents),
      toCurrencyCode: input.toCurrencyCode,
      toAmount: centsToMoney(toCents),
      fromCashAccountId: fromCashAccount.id,
      toCashAccountId: toCashAccount.id,
      notes: input.notes?.trim() || null,
      createdByUserId: userId,
    });
    const transferId = Number(result[0].insertId);
    const transferNumber = referenceNumber("THW", transferId);
    await tx.update(currencyTransfers).set({ transferNumber }).where(eq(currencyTransfers.id, transferId));
    const transferDescription = fromCashAccount.id === toCashAccount.id ? `تحويل عملات ${transferNumber}` : `تحويل داخلي ${transferNumber}`;
    await tx.insert(cashMovements).values([
      {
        direction: "out",
        type: "transfer_out",
        currencyCode: input.fromCurrencyCode,
        amount: centsToMoney(fromCents),
        occurredAt: input.transferDate,
        sourceType: "currency_transfer",
        sourceId: transferId,
        cashAccountId: fromCashAccount.id,
        description: transferDescription,
        notes: input.notes?.trim() || null,
        createdByUserId: userId,
      },
      {
        direction: "in",
        type: "transfer_in",
        currencyCode: input.toCurrencyCode,
        amount: centsToMoney(toCents),
        occurredAt: input.transferDate,
        sourceType: "currency_transfer",
        sourceId: transferId,
        cashAccountId: toCashAccount.id,
        description: transferDescription,
        notes: input.notes?.trim() || null,
        createdByUserId: userId,
      },
    ]);
    await adjustTrackedCashBalance(tx, toCashAccount.id, input.toCurrencyCode, toCents);
    await writeAudit(tx, userId, "create", "currency_transfer", transferId, { transferNumber, ...input, fromCashAccountId: fromCashAccount.id, toCashAccountId: toCashAccount.id });
    return { id: transferId, transferNumber };
  });
}

function calculateInvoiceDue(
  invoice: { id: number; totalAmount: string },
  paidByInvoice: Map<number, bigint>,
) {
  const total = moneyToCents(invoice.totalAmount);
  return total - (paidByInvoice.get(invoice.id) ?? 0n);
}

async function getPaidAmounts(db: any, invoiceIds: number[]) {
  if (!invoiceIds.length) return new Map<number, bigint>();
  const rows = await db
    .select({ invoiceId: receiptAllocations.invoiceId, amount: receiptAllocations.amount })
    .from(receiptAllocations)
    .innerJoin(receipts, eq(receiptAllocations.receiptId, receipts.id))
    .where(and(inArray(receiptAllocations.invoiceId, invoiceIds), eq(receipts.status, "active")));
  return rows.reduce((result: Map<number, bigint>, row: { invoiceId: number; amount: string }) => {
    result.set(row.invoiceId, (result.get(row.invoiceId) ?? 0n) + moneyToCents(row.amount));
    return result;
  }, new Map<number, bigint>());
}

export async function listInvoices() {
  const db = await requireDb();
  const rows = await db
    .select({ invoice: invoices, contactName: contacts.name, contactType: contacts.type, cashAccountName: cashAccounts.name, cashAccountType: cashAccounts.type })
    .from(invoices)
    .innerJoin(contacts, eq(invoices.contactId, contacts.id))
    .leftJoin(cashAccounts, eq(invoices.cashAccountId, cashAccounts.id))
    .where(ne(invoices.status, "cancelled"))
    .orderBy(desc(invoices.issueDate));
  const paidByInvoice = await getPaidAmounts(db, rows.map((row: any) => row.invoice.id));
  return rows.map((row: any) => ({
    ...row.invoice,
    contactName: row.contactName,
    contactType: row.contactType,
    cashAccountName: row.cashAccountName,
    cashAccountType: row.cashAccountType,
    paidAmount: centsToMoney(moneyToCents(row.invoice.totalAmount) - calculateInvoiceDue(row.invoice, paidByInvoice)),
    dueAmount: centsToMoney(calculateInvoiceDue(row.invoice, paidByInvoice)),
  }));
}

export async function listOpenInvoices(contactId?: number) {
  const allInvoices = await listInvoices();
  return allInvoices.filter((invoice: any) => invoice.type === "credit" && invoice.dueAmount !== "0.00" && (!contactId || invoice.contactId === contactId));
}

export async function getInvoiceDocument(invoiceId: number) {
  const db = await requireDb();
  const rows = await db.select({ invoice: invoices, contact: contacts, cashAccountName: cashAccounts.name, cashAccountType: cashAccounts.type }).from(invoices).innerJoin(contacts, eq(invoices.contactId, contacts.id)).leftJoin(cashAccounts, eq(invoices.cashAccountId, cashAccounts.id)).where(eq(invoices.id, invoiceId)).limit(1);
  const row = rows[0];
  if (!row) throw new Error("الفاتورة غير موجودة");
  const [items, paidByInvoice] = await Promise.all([
    db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId)).orderBy(invoiceItems.id),
    getPaidAmounts(db, [invoiceId]),
  ]);
  return { invoice: { ...row.invoice, paidAmount: centsToMoney(moneyToCents(row.invoice.totalAmount) - calculateInvoiceDue(row.invoice, paidByInvoice)), dueAmount: centsToMoney(calculateInvoiceDue(row.invoice, paidByInvoice)), cashAccountName: row.cashAccountName, cashAccountType: row.cashAccountType }, contact: row.contact, items };
}

export async function listReceipts() {
  const db = await requireDb();
  return db
    .select({ receipt: receipts, contactName: contacts.name, cashAccountName: cashAccounts.name, cashAccountType: cashAccounts.type })
    .from(receipts)
    .innerJoin(contacts, eq(receipts.contactId, contacts.id))
    .leftJoin(cashAccounts, eq(receipts.cashAccountId, cashAccounts.id))
    .where(eq(receipts.status, "active"))
    .orderBy(desc(receipts.receiptDate));
}

export async function getReceiptDocument(receiptId: number) {
  const db = await requireDb();
  const rows = await db.select({ receipt: receipts, contact: contacts, cashAccountName: cashAccounts.name, cashAccountType: cashAccounts.type }).from(receipts).innerJoin(contacts, eq(receipts.contactId, contacts.id)).leftJoin(cashAccounts, eq(receipts.cashAccountId, cashAccounts.id)).where(eq(receipts.id, receiptId)).limit(1);
  const row = rows[0];
  if (!row) throw new Error("سند القبض غير موجود");
  const allocations = await db.select({ allocation: receiptAllocations, invoiceNumber: invoices.invoiceNumber }).from(receiptAllocations).innerJoin(invoices, eq(receiptAllocations.invoiceId, invoices.id)).where(eq(receiptAllocations.receiptId, receiptId));
  return { receipt: { ...row.receipt, cashAccountName: row.cashAccountName, cashAccountType: row.cashAccountType }, contact: row.contact, allocations };
}

export async function listExpenses() {
  const db = await requireDb();
  return db
    .select({ expense: expenses, contactName: contacts.name, categoryName: movementCategories.name, accountKind: accountCategories.kind, cashAccountName: cashAccounts.name, cashAccountType: cashAccounts.type })
    .from(expenses)
    .leftJoin(contacts, eq(expenses.contactId, contacts.id))
    .leftJoin(movementCategories, eq(expenses.movementCategoryId, movementCategories.id))
    .leftJoin(accountCategories, eq(movementCategories.accountCategoryId, accountCategories.id))
    .leftJoin(cashAccounts, eq(expenses.cashAccountId, cashAccounts.id))
    .where(eq(expenses.status, "active"))
    .orderBy(desc(expenses.expenseDate));
}

export async function getCashSummary() {
  await ensureAccountingDefaults();
  const db = await requireDb();
  const [currencyRows, accountRows, movementRows, balanceRows, accountBalanceRows] = await Promise.all([
    db.select().from(currencies).where(eq(currencies.isActive, true)),
    db.select().from(cashAccounts).where(eq(cashAccounts.isActive, true)).orderBy(cashAccounts.type, cashAccounts.name),
    db.select({ movement: cashMovements, cashAccountName: cashAccounts.name, cashAccountType: cashAccounts.type }).from(cashMovements).leftJoin(cashAccounts, eq(cashMovements.cashAccountId, cashAccounts.id)).orderBy(desc(cashMovements.occurredAt)),
    db.select().from(cashBalances),
    db.select().from(cashAccountBalances),
  ]);
  return {
    balances: currencyRows.map(currency => {
      const balance = balanceRows.find(row => row.currencyCode === currency.code)?.balance ?? "0.00";
      return { ...currency, balance };
    }),
    accounts: accountRows.map(account => ({
      ...account,
      balances: currencyRows.map(currency => ({ ...currency, balance: accountBalanceRows.find(row => row.cashAccountId === account.id && row.currencyCode === currency.code)?.balance ?? "0.00" })),
    })),
    movements: movementRows.slice(0, 40).map(row => ({ ...row.movement, cashAccountName: row.cashAccountName ?? "صندوق الشبكة الرئيسي", cashAccountType: row.cashAccountType ?? "cash" })),
  };
}

export async function createCashAccount(userId: number, input: { name: string; type: "cash" | "bank"; notes?: string }) {
  const name = input.name.trim();
  if (name.length < 2) throw new Error("أدخل اسم الحساب النقدي أو المصرفي");
  const db = await requireDb();
  const existing = await db.select({ id: cashAccounts.id }).from(cashAccounts).where(eq(cashAccounts.name, name)).limit(1);
  if (existing[0]) throw new Error("يوجد حساب نقدي أو مصرفي بهذا الاسم بالفعل");
  const result = await db.insert(cashAccounts).values({ name, type: input.type, notes: input.notes?.trim() || null, createdByUserId: userId });
  const id = Number(result[0].insertId);
  await writeAudit(db, userId, "create", "cash_account", id, { name, type: input.type });
  return { id, name, type: input.type };
}

type GrocerySalesInvoice = { contactType: string; contactId: number; totalAmount: string; exchangeRateToBase: string };

export function calculateGrocerySalesSummary(invoices: readonly GrocerySalesInvoice[]) {
  const groceryInvoices = invoices.filter(invoice => invoice.contactType === "grocery");
  const grocerySalesBase = sumCents(
    groceryInvoices.map(invoice => convertToBaseCents(moneyToCents(invoice.totalAmount), rateToMicros(invoice.exchangeRateToBase))),
  );
  return {
    grocerySales: centsToMoney(grocerySalesBase),
    groceryTransactionCount: groceryInvoices.length,
    groceryContactCount: new Set(groceryInvoices.map(invoice => invoice.contactId)).size,
  };
}

export async function getDashboardSummary() {
  await ensureAccountingDefaults();
  const db = await requireDb();
  const [allInvoices, allExpenses, contactRows, cashSummary] = await Promise.all([
    listInvoices(),
    listExpenses(),
    db.select({ id: contacts.id }).from(contacts).where(eq(contacts.isActive, true)),
    getCashSummary(),
  ]);
  const revenueBase = sumCents(
    allInvoices.map((invoice: any) => convertToBaseCents(moneyToCents(invoice.totalAmount), rateToMicros(invoice.exchangeRateToBase))),
  );
  const expenseBase = sumCents(
    allExpenses
      .filter((row: any) => row.accountKind === "expense")
      .map((row: any) => convertToBaseCents(moneyToCents(row.expense.amount), rateToMicros(row.expense.exchangeRateToBase))),
  );
  const debtBase = sumCents(
    allInvoices
      .filter((invoice: any) => invoice.type === "credit")
      .map((invoice: any) => convertToBaseCents(moneyToCents(invoice.dueAmount), rateToMicros(invoice.exchangeRateToBase))),
  );
  const openCreditInvoices = allInvoices.filter((invoice: any) => invoice.type === "credit" && moneyToCents(invoice.dueAmount) > 0n);
  const debtContactIds = new Set(openCreditInvoices.map((invoice: any) => invoice.contactId));
  const grocerySummary = calculateGrocerySalesSummary(allInvoices);
  return {
    baseCurrency: "YER",
    totalRevenue: centsToMoney(revenueBase),
    totalExpenses: centsToMoney(expenseBase),
    netProfit: centsToMoney(revenueBase - expenseBase),
    totalDebt: centsToMoney(debtBase),
    activeContacts: contactRows.length,
    openCreditInvoiceCount: openCreditInvoices.length,
    debtContactCount: debtContactIds.size,
    ...grocerySummary,
    cashBalances: cashSummary.balances,
    recentCashMovements: cashSummary.movements.slice(0, 8),
  };
}

export async function getFinancialReport(
  startDate: Date,
  endDate: Date,
  reportingCurrency: CurrencyCode = "YER",
  reportingExchangeRateToBase = "1",
) {
  if (startDate > endDate) throw new Error("تاريخ بداية التقرير يجب أن يسبق تاريخ النهاية");
  await ensureAccountingDefaults();
  const db = await requireDb();
  await getActiveCurrency(db, reportingCurrency);
  const reportingRateMicros = rateToMicros(reportingExchangeRateToBase);
  const toReportingCurrency = (baseAmount: bigint) => centsToMoney(convertFromBaseCents(baseAmount, reportingRateMicros));
  const [periodInvoices, periodReceipts, periodExpenses, invoicesUntilEnd, periodCashMovements] = await Promise.all([
    db.select().from(invoices).where(and(gte(invoices.issueDate, startDate), lte(invoices.issueDate, endDate), ne(invoices.status, "cancelled"))),
    db.select().from(receipts).where(and(gte(receipts.receiptDate, startDate), lte(receipts.receiptDate, endDate), eq(receipts.status, "active"))),
    db
      .select({ expense: expenses, categoryName: movementCategories.name, accountKind: accountCategories.kind })
      .from(expenses)
      .leftJoin(movementCategories, eq(expenses.movementCategoryId, movementCategories.id))
      .leftJoin(accountCategories, eq(movementCategories.accountCategoryId, accountCategories.id))
      .where(and(gte(expenses.expenseDate, startDate), lte(expenses.expenseDate, endDate), eq(expenses.status, "active"))),
    db.select().from(invoices).where(and(lte(invoices.issueDate, endDate), ne(invoices.status, "cancelled"))),
    db.select().from(cashMovements).where(and(gte(cashMovements.occurredAt, startDate), lte(cashMovements.occurredAt, endDate))),
  ]);

  const revenueBase = sumCents(periodInvoices.map(invoice => convertToBaseCents(moneyToCents(invoice.totalAmount), rateToMicros(invoice.exchangeRateToBase))));
  const expenseRows = periodExpenses.filter(row => row.accountKind === "expense");
  const expenseBase = sumCents(expenseRows.map(row => convertToBaseCents(moneyToCents(row.expense.amount), rateToMicros(row.expense.exchangeRateToBase))));
  const collectionsBase = sumCents([
    ...periodInvoices.filter(invoice => invoice.type === "cash").map(invoice => convertToBaseCents(moneyToCents(invoice.totalAmount), rateToMicros(invoice.exchangeRateToBase))),
    ...periodReceipts.map(receipt => convertToBaseCents(moneyToCents(receipt.amount), rateToMicros(receipt.exchangeRateToBase))),
  ]);
  const paidByInvoice = await getPaidAmounts(db, invoicesUntilEnd.map(invoice => invoice.id));
  const outstandingBase = sumCents(
    invoicesUntilEnd
      .filter(invoice => invoice.type === "credit")
      .map(invoice => convertToBaseCents(calculateInvoiceDue(invoice, paidByInvoice), rateToMicros(invoice.exchangeRateToBase))),
  );
  const expenseBreakdown = Array.from(
    expenseRows.reduce((totals, row) => {
      const name = row.categoryName ?? "غير مصنف";
      const next = (totals.get(name) ?? 0n) + convertToBaseCents(moneyToCents(row.expense.amount), rateToMicros(row.expense.exchangeRateToBase));
      totals.set(name, next);
      return totals;
    }, new Map<string, bigint>()),
  )
    .map(([name, amount]) => ({ name, amount: centsToMoney(amount) }))
    .sort((a, b) => Number(b.amount) - Number(a.amount));
  const categoryAmount = (predicate: (row: (typeof periodExpenses)[number]) => boolean) =>
    toReportingCurrency(sumCents(periodExpenses.filter(predicate).map(row => convertToBaseCents(moneyToCents(row.expense.amount), rateToMicros(row.expense.exchangeRateToBase)))));
  const expenseDetails = periodExpenses
    .map(row => ({ id: row.expense.id, expenseNumber: row.expense.expenseNumber, expenseDate: row.expense.expenseDate, description: row.expense.description, categoryName: row.categoryName ?? "غير مصنف", amount: toReportingCurrency(convertToBaseCents(moneyToCents(row.expense.amount), rateToMicros(row.expense.exchangeRateToBase))), allowCashOverdraft: row.expense.allowCashOverdraft, cashOverrideReason: row.expense.cashOverrideReason }))
    .sort((a, b) => b.expenseDate.getTime() - a.expenseDate.getTime());
  const cashFlowByCurrency = DEFAULT_CURRENCIES.map(currency => {
    const rows = periodCashMovements.filter(row => row.currencyCode === currency.code);
    const incoming = sumCents(rows.filter(row => row.direction === "in").map(row => moneyToCents(row.amount)));
    const outgoing = sumCents(rows.filter(row => row.direction === "out").map(row => moneyToCents(row.amount)));
    return { ...currency, incoming: centsToMoney(incoming), outgoing: centsToMoney(outgoing), net: centsToMoney(incoming - outgoing) };
  });
  return {
    baseCurrency: "YER",
    reportingCurrency,
    reportingExchangeRateToBase,
    startDate,
    endDate,
    revenue: toReportingCurrency(revenueBase),
    expenses: toReportingCurrency(expenseBase),
    netProfit: toReportingCurrency(revenueBase - expenseBase),
    collections: toReportingCurrency(collectionsBase),
    outstandingDebt: toReportingCurrency(outstandingBase),
    salesInvoiceCount: periodInvoices.length,
    receiptCount: periodReceipts.length,
    expenseCount: periodExpenses.length,
    expenseBreakdown: expenseBreakdown.map(item => ({ ...item, amount: toReportingCurrency(moneyToCents(item.amount)) })),
    expenseHighlights: {
      internet: categoryAmount(row => row.categoryName?.includes("شراء خدمة الإنترنت") ?? false),
      fuel: categoryAmount(row => row.categoryName?.includes("بترول") ?? false),
      networkMaintenance: categoryAmount(row => row.categoryName?.includes("صيانة الشبكة") ?? false),
      assets: categoryAmount(row => row.accountKind === "asset"),
    },
    expenseDetails,
    cashFlowByCurrency,
  };
}

export async function createBackupSnapshot(userId: number, source: "manual" | "automatic" | "protective" = "manual") {
  const db = await requireDb();
  const [currencyRows, cashAccountRows, cashAccountBalanceRows, accountCategoryRows, movementCategoryRows, contactRows, packageRows, subscriptionRows, individualSubscriptionAccountRows, individualSubscriptionRows, individualChargeRows, individualAdjustmentRows, individualPaymentRows, individualCashBalanceRows, individualCashMovementRows, invoiceRows, invoiceItemRows, receiptRows, receiptAllocationRows, expenseRows, transferRows, cashMovementRows, auditRows] = await Promise.all([
    db.select().from(currencies),
    db.select().from(cashAccounts),
    db.select().from(cashAccountBalances),
    db.select().from(accountCategories),
    db.select().from(movementCategories),
    db.select().from(contacts),
    db.select().from(servicePackages),
    db.select().from(subscriptions),
    db.select().from(individualSubscriptionAccounts),
    db.select().from(individualSubscriptions),
    db.select().from(individualSubscriptionCharges),
    db.select().from(individualSubscriptionAdjustments),
    db.select().from(individualSubscriptionPayments),
    db.select().from(individualSubscriptionCashBalances),
    db.select().from(individualSubscriptionCashMovements),
    db.select().from(invoices),
    db.select().from(invoiceItems),
    db.select().from(receipts),
    db.select().from(receiptAllocations),
    db.select().from(expenses),
    db.select().from(currencyTransfers),
    db.select().from(cashMovements),
    db.select().from(auditLogs),
  ]);
  const generatedAt = new Date();
  const fileName = `al-shamel-accounting-backup-${generatedAt.toISOString().replace(/[:.]/g, "-")}.json`;
  const payload = {
    version: 1,
    generatedAt: generatedAt.toISOString(),
    organisation: { name: "الشامل لخدمات الإنترنت", phone: "777600474", address: "يافع الصعيد" },
    data: {
      currencies: currencyRows,
      cashAccounts: cashAccountRows,
      cashAccountBalances: cashAccountBalanceRows,
      accountCategories: accountCategoryRows,
      movementCategories: movementCategoryRows,
      contacts: contactRows,
      servicePackages: packageRows,
      subscriptions: subscriptionRows,
      individualSubscriptionAccounts: individualSubscriptionAccountRows,
      individualSubscriptions: individualSubscriptionRows,
      individualSubscriptionCharges: individualChargeRows,
      individualSubscriptionAdjustments: individualAdjustmentRows,
      individualSubscriptionPayments: individualPaymentRows,
      individualSubscriptionCashBalances: individualCashBalanceRows,
      individualSubscriptionCashMovements: individualCashMovementRows,
      invoices: invoiceRows,
      invoiceItems: invoiceItemRows,
      receipts: receiptRows,
      receiptAllocations: receiptAllocationRows,
      expenses: expenseRows,
      currencyTransfers: transferRows,
      cashMovements: cashMovementRows,
      auditLogs: auditRows,
    },
  };
  const serialized = JSON.stringify(payload, null, 2);
  const stored = await storagePut(`accounting-backups/${fileName}`, serialized, "application/json");
  const result = await db.insert(backupSnapshots).values({
    fileName,
    storageKey: stored.key,
    storageUrl: stored.url,
    sizeBytes: Buffer.byteLength(serialized, "utf8"),
    source,
    createdByUserId: userId,
  });
  const id = Number(result[0].insertId);
  await writeAudit(db, userId, "create", "backup_snapshot", id, { fileName, source, sizeBytes: Buffer.byteLength(serialized, "utf8") });
  return { id, fileName, url: stored.url, generatedAt };
}

export async function listBackupSnapshots() {
  const db = await requireDb();
  return db.select().from(backupSnapshots).orderBy(desc(backupSnapshots.createdAt));
}

const backupDataKeys = ["currencies", "accountCategories", "movementCategories", "contacts", "servicePackages", "subscriptions", "invoices", "invoiceItems", "receipts", "receiptAllocations", "expenses", "currencyTransfers", "cashMovements", "auditLogs"] as const;
const cashAccountBackupDataKeys = ["cashAccounts", "cashAccountBalances"] as const;
const individualSubscriptionBackupDataKeys = ["individualSubscriptionAccounts", "individualSubscriptions", "individualSubscriptionCharges", "individualSubscriptionAdjustments", "individualSubscriptionPayments", "individualSubscriptionCashBalances", "individualSubscriptionCashMovements"] as const;
type BackupData = Record<(typeof backupDataKeys)[number], unknown[]> & Partial<Record<(typeof cashAccountBackupDataKeys)[number] | (typeof individualSubscriptionBackupDataKeys)[number], unknown[]>>;

export function isSupportedBackupPayload(payload: unknown): payload is { version: 1; data: BackupData } {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as { version?: unknown; data?: unknown };
  if (candidate.version !== 1 || !candidate.data || typeof candidate.data !== "object") return false;
  const data = candidate.data as Record<string, unknown>;
  return backupDataKeys.every(key => Array.isArray(data[key])) && [...cashAccountBackupDataKeys, ...individualSubscriptionBackupDataKeys].every(key => data[key] === undefined || Array.isArray(data[key]));
}

type BackupRow = Record<string, unknown>;
const backupTimestampFields = new Set(["createdAt", "updatedAt", "lastSignedIn", "startDate", "endDate", "issueDate", "receiptDate", "expenseDate", "transferDate", "occurredAt", "chargedAt", "paymentDate"]);

function backupRows(data: BackupData, key: (typeof backupDataKeys)[number] | (typeof cashAccountBackupDataKeys)[number] | (typeof individualSubscriptionBackupDataKeys)[number]) {
  const rows = data[key] ?? [];
  if (!rows.every(row => row && typeof row === "object" && !Array.isArray(row))) throw new Error(`بيانات ${key} في النسخة الاحتياطية غير صالحة`);
  return rows as BackupRow[];
}

function backupIds(rows: BackupRow[], label: string) {
  const ids = new Set<number>();
  for (const row of rows) {
    if (!Number.isInteger(row.id) || Number(row.id) <= 0 || ids.has(Number(row.id))) throw new Error(`معرّفات ${label} في النسخة الاحتياطية غير صالحة أو مكررة`);
    ids.add(Number(row.id));
  }
  return ids;
}

function assertBackupReferences(rows: BackupRow[], field: string, parentIds: Set<number>, label: string) {
  for (const row of rows) {
    if (!Number.isInteger(row[field]) || !parentIds.has(Number(row[field]))) throw new Error(`يوجد مرجع غير صالح في ${label} داخل النسخة الاحتياطية`);
  }
}

function assertOptionalBackupReferences(rows: BackupRow[], field: string, parentIds: Set<number>, label: string) {
  for (const row of rows) {
    if (row[field] !== null && row[field] !== undefined && (!Number.isInteger(row[field]) || !parentIds.has(Number(row[field])))) throw new Error(`يوجد مرجع غير صالح في ${label} داخل النسخة الاحتياطية`);
  }
}

function assertBackupCurrencies(rows: BackupRow[], fields: string[], currencyCodes: Set<string>, label: string) {
  for (const row of rows) {
    for (const field of fields) if (typeof row[field] !== "string" || !currencyCodes.has(row[field] as string)) throw new Error(`يوجد رمز عملة غير صالح في ${label} داخل النسخة الاحتياطية`);
  }
}

function assertUniqueBackupValues(rows: BackupRow[], field: string, label: string) {
  const values = new Set<string>();
  for (const row of rows) {
    if (typeof row[field] !== "string" || !row[field] || values.has(row[field] as string)) throw new Error(`يوجد رقم مكرر أو مفقود في ${label} داخل النسخة الاحتياطية`);
    values.add(row[field] as string);
  }
}

function assertPositiveBackupAmounts(rows: BackupRow[], field: string, label: string) {
  for (const row of rows) {
    if (typeof row[field] !== "string" || moneyToCents(row[field] as string) <= 0n) throw new Error(`يوجد مبلغ غير صالح في ${label} داخل النسخة الاحتياطية`);
  }
}

function assertBackupTimestamps(rows: BackupRow[]) {
  for (const row of rows) {
    for (const [field, value] of Object.entries(row)) {
      if (backupTimestampFields.has(field) && (typeof value !== "string" || Number.isNaN(Date.parse(value)))) throw new Error(`يوجد تاريخ غير صالح في النسخة الاحتياطية: ${field}`);
    }
  }
}

function hydrateBackupRow(row: BackupRow) {
  return Object.fromEntries(Object.entries(row).map(([field, value]) => backupTimestampFields.has(field) ? [field, new Date(value as string)] : [field, value]));
}

export function assertBackupDataIntegrity(data: BackupData, validUserIds?: Set<number>) {
  const currencyRows = backupRows(data, "currencies");
  const cashAccountRows = backupRows(data, "cashAccounts");
  const cashAccountBalanceRows = backupRows(data, "cashAccountBalances");
  const accountCategoryRows = backupRows(data, "accountCategories");
  const movementCategoryRows = backupRows(data, "movementCategories");
  const contactRows = backupRows(data, "contacts");
  const packageRows = backupRows(data, "servicePackages");
  const subscriptionRows = backupRows(data, "subscriptions");
  const individualSubscriptionAccountRows = backupRows(data, "individualSubscriptionAccounts");
  const individualSubscriptionRows = backupRows(data, "individualSubscriptions");
  const individualChargeRows = backupRows(data, "individualSubscriptionCharges");
  const individualAdjustmentRows = backupRows(data, "individualSubscriptionAdjustments");
  const individualPaymentRows = backupRows(data, "individualSubscriptionPayments");
  const individualCashBalanceRows = backupRows(data, "individualSubscriptionCashBalances");
  const individualCashMovementRows = backupRows(data, "individualSubscriptionCashMovements");
  const invoiceRows = backupRows(data, "invoices");
  const invoiceItemRows = backupRows(data, "invoiceItems");
  const receiptRows = backupRows(data, "receipts");
  const allocationRows = backupRows(data, "receiptAllocations");
  const expenseRows = backupRows(data, "expenses");
  const transferRows = backupRows(data, "currencyTransfers");
  const cashMovementRows = backupRows(data, "cashMovements");
  const auditRows = backupRows(data, "auditLogs");

  const contactIds = backupIds(contactRows, "الحسابات");
  const cashAccountIds = backupIds(cashAccountRows, "حسابات النقد والبنوك");
  const accountCategoryIds = backupIds(accountCategoryRows, "تصنيفات الحسابات");
  const movementCategoryIds = backupIds(movementCategoryRows, "تصنيفات الحركات");
  const packageIds = backupIds(packageRows, "الباقات");
  const individualSubscriptionAccountIds = backupIds(individualSubscriptionAccountRows, "حسابات الاشتراكات الفردية");
  const individualChargeIds = backupIds(individualChargeRows, "مبالغ اشتراكات الأفراد");
  backupIds(individualAdjustmentRows, "خصومات اشتراكات الأفراد");
  const individualPaymentIds = backupIds(individualPaymentRows, "مدفوعات اشتراكات الأفراد");
  const invoiceIds = backupIds(invoiceRows, "الفواتير");
  const receiptIds = backupIds(receiptRows, "سندات القبض");
  const expenseIds = backupIds(expenseRows, "المصروفات");
  const transferIds = backupIds(transferRows, "تحويلات العملات");
  backupIds(subscriptionRows, "الاشتراكات");
  backupIds(individualSubscriptionRows, "سجل اشتراكات الأفراد");
  backupIds(individualCashMovementRows, "حركة صندوق اشتراكات الأفراد");
  backupIds(invoiceItemRows, "بنود الفواتير");
  backupIds(allocationRows, "توزيعات القبض");
  backupIds(cashMovementRows, "حركة الصندوق");
  backupIds(auditRows, "سجل المراجعة");
  const currencyCodes = new Set(currencyRows.map(row => typeof row.code === "string" ? row.code : ""));
  if (!currencyCodes.size || currencyCodes.has("") || currencyCodes.size !== currencyRows.length) throw new Error("عملات النسخة الاحتياطية مكررة أو غير صالحة");

  assertOptionalBackupReferences(movementCategoryRows, "accountCategoryId", accountCategoryIds, "تصنيفات الحركات");
  assertBackupReferences(cashAccountBalanceRows, "cashAccountId", cashAccountIds, "أرصدة حسابات النقد والبنوك");
  assertBackupCurrencies(cashAccountBalanceRows, ["currencyCode"], currencyCodes, "أرصدة حسابات النقد والبنوك");
  assertBackupReferences(subscriptionRows, "contactId", contactIds, "الاشتراكات");
  assertBackupReferences(subscriptionRows, "packageId", packageIds, "الاشتراكات");
  assertOptionalBackupReferences(subscriptionRows, "invoiceId", invoiceIds, "الاشتراكات");
  assertBackupReferences(individualSubscriptionRows, "accountId", individualSubscriptionAccountIds, "سجل اشتراكات الأفراد");
  assertBackupReferences(individualChargeRows, "accountId", individualSubscriptionAccountIds, "مبالغ اشتراكات الأفراد");
  assertOptionalBackupReferences(individualChargeRows, "subscriptionId", new Set(individualSubscriptionRows.map(row => Number(row.id))), "مبالغ اشتراكات الأفراد");
  assertBackupReferences(individualAdjustmentRows, "accountId", individualSubscriptionAccountIds, "خصومات اشتراكات الأفراد");
  assertBackupReferences(individualAdjustmentRows, "chargeId", individualChargeIds, "خصومات اشتراكات الأفراد");
  assertBackupReferences(individualPaymentRows, "accountId", individualSubscriptionAccountIds, "مدفوعات اشتراكات الأفراد");
  assertBackupReferences(individualPaymentRows, "chargeId", individualChargeIds, "مدفوعات اشتراكات الأفراد");
  assertOptionalBackupReferences(individualCashMovementRows, "sourcePaymentId", individualPaymentIds, "حركة صندوق اشتراكات الأفراد");
  assertBackupReferences(invoiceRows, "contactId", contactIds, "الفواتير");
  assertOptionalBackupReferences(invoiceRows, "movementCategoryId", movementCategoryIds, "الفواتير");
  assertOptionalBackupReferences(invoiceRows, "cashAccountId", cashAccountIds, "الفواتير");
  assertBackupReferences(invoiceItemRows, "invoiceId", invoiceIds, "بنود الفواتير");
  assertBackupReferences(receiptRows, "contactId", contactIds, "سندات القبض");
  assertOptionalBackupReferences(receiptRows, "movementCategoryId", movementCategoryIds, "سندات القبض");
  assertOptionalBackupReferences(receiptRows, "cashAccountId", cashAccountIds, "سندات القبض");
  assertBackupReferences(allocationRows, "receiptId", receiptIds, "توزيعات القبض");
  assertBackupReferences(allocationRows, "invoiceId", invoiceIds, "توزيعات القبض");
  assertOptionalBackupReferences(expenseRows, "contactId", contactIds, "المصروفات");
  assertOptionalBackupReferences(expenseRows, "movementCategoryId", movementCategoryIds, "المصروفات");
  assertOptionalBackupReferences(expenseRows, "cashAccountId", cashAccountIds, "المصروفات");
  assertOptionalBackupReferences(transferRows, "fromCashAccountId", cashAccountIds, "التحويلات الداخلية");
  assertOptionalBackupReferences(transferRows, "toCashAccountId", cashAccountIds, "التحويلات الداخلية");
  assertOptionalBackupReferences(cashMovementRows, "cashAccountId", cashAccountIds, "حركة الصندوق والحسابات");
  assertBackupCurrencies(packageRows, ["currencyCode"], currencyCodes, "الباقات");
  assertBackupCurrencies(invoiceRows, ["currencyCode"], currencyCodes, "الفواتير");
  assertBackupCurrencies(receiptRows, ["currencyCode"], currencyCodes, "سندات القبض");
  assertBackupCurrencies(expenseRows, ["currencyCode"], currencyCodes, "المصروفات");
  assertBackupCurrencies(transferRows, ["fromCurrencyCode", "toCurrencyCode"], currencyCodes, "تحويلات العملات");
  assertBackupCurrencies(cashMovementRows, ["currencyCode"], currencyCodes, "حركة الصندوق");
  assertBackupCurrencies(individualChargeRows, ["currencyCode"], currencyCodes, "مبالغ اشتراكات الأفراد");
  assertBackupCurrencies(individualAdjustmentRows, ["currencyCode"], currencyCodes, "خصومات اشتراكات الأفراد");
  assertBackupCurrencies(individualPaymentRows, ["currencyCode"], currencyCodes, "مدفوعات اشتراكات الأفراد");
  assertBackupCurrencies(individualCashBalanceRows, ["currencyCode"], currencyCodes, "أرصدة صندوق اشتراكات الأفراد");
  assertBackupCurrencies(individualCashMovementRows, ["currencyCode"], currencyCodes, "حركة صندوق اشتراكات الأفراد");
  const sourceMaps: Record<string, Set<number>> = { invoice: invoiceIds, receipt: receiptIds, expense: expenseIds, currency_transfer: transferIds };
  for (const row of cashMovementRows) if (row.sourceType && (!sourceMaps[String(row.sourceType)] || !Number.isInteger(row.sourceId) || !sourceMaps[String(row.sourceType)].has(Number(row.sourceId)))) throw new Error("يوجد مصدر حركة صندوق غير صالح في النسخة الاحتياطية");
  if (validUserIds) [cashAccountRows, subscriptionRows, individualSubscriptionAccountRows, individualSubscriptionRows, individualChargeRows, individualAdjustmentRows, individualPaymentRows, individualCashMovementRows, invoiceRows, receiptRows, expenseRows, transferRows, cashMovementRows].forEach(rows => assertOptionalBackupReferences(rows, "createdByUserId", validUserIds, "السجلات المنشئة"));
  if (validUserIds) assertOptionalBackupReferences(auditRows, "userId", validUserIds, "سجل المراجعة");

  assertUniqueBackupValues(invoiceRows, "invoiceNumber", "الفواتير");
  assertUniqueBackupValues(receiptRows, "receiptNumber", "سندات القبض");
  assertUniqueBackupValues(expenseRows, "expenseNumber", "المصروفات");
  assertUniqueBackupValues(transferRows, "transferNumber", "تحويلات العملات");
  assertUniqueBackupValues(cashAccountRows, "name", "حسابات النقد والبنوك");
  assertPositiveBackupAmounts(invoiceRows, "totalAmount", "الفواتير");
  assertPositiveBackupAmounts(receiptRows, "amount", "سندات القبض");
  assertPositiveBackupAmounts(expenseRows, "amount", "المصروفات");
  assertPositiveBackupAmounts(transferRows, "fromAmount", "تحويلات العملات");
  assertPositiveBackupAmounts(transferRows, "toAmount", "تحويلات العملات");
  assertPositiveBackupAmounts(cashMovementRows, "amount", "حركة الصندوق");
  assertPositiveBackupAmounts(individualChargeRows, "amount", "مبالغ اشتراكات الأفراد");
  assertPositiveBackupAmounts(individualAdjustmentRows, "amount", "خصومات اشتراكات الأفراد");
  assertPositiveBackupAmounts(individualPaymentRows, "amount", "مدفوعات اشتراكات الأفراد");
  assertPositiveBackupAmounts(individualCashMovementRows, "amount", "حركة صندوق اشتراكات الأفراد");
  for (const charge of individualChargeRows) {
    const paid = typeof charge.paidAmount === "string" ? moneyToCents(charge.paidAmount) : -1n;
    const discount = charge.discountAmount === undefined ? 0n : typeof charge.discountAmount === "string" ? moneyToCents(charge.discountAmount) : -1n;
    const amount = typeof charge.amount === "string" ? moneyToCents(charge.amount) : -1n;
    if (paid < 0n || discount < 0n || paid + discount > amount) throw new Error("المبلغ المدفوع غير صالح أو الخصم غير صالح في مبالغ اشتراكات الأفراد");
  }
  [currencyRows, cashAccountRows, cashAccountBalanceRows, accountCategoryRows, movementCategoryRows, contactRows, packageRows, subscriptionRows, individualSubscriptionAccountRows, individualSubscriptionRows, individualChargeRows, individualAdjustmentRows, individualPaymentRows, individualCashBalanceRows, individualCashMovementRows, invoiceRows, invoiceItemRows, receiptRows, allocationRows, expenseRows, transferRows, cashMovementRows, auditRows].forEach(assertBackupTimestamps);
}

export async function restoreBackupSnapshot(userId: number, snapshotId: number) {
  const db = await requireDb();
  const snapshots = await db.select().from(backupSnapshots).where(eq(backupSnapshots.id, snapshotId)).limit(1);
  const snapshot = snapshots[0];
  if (!snapshot) throw new Error("النسخة الاحتياطية غير موجودة");
  const downloadUrl = await storageGetSignedUrl(snapshot.storageKey);
  const response = await fetch(downloadUrl);
  if (!response.ok) throw new Error("تعذر تنزيل ملف النسخة الاحتياطية");
  const payload = await response.json() as unknown;
  if (!isSupportedBackupPayload(payload)) {
    throw new Error("ملف النسخة الاحتياطية غير صالح أو غير مدعوم");
  }
  const data = payload.data;
  const existingUsers = await db.select({ id: users.id }).from(users);
  assertBackupDataIntegrity(data, new Set(existingUsers.map(user => user.id)));
  const protectiveSnapshot = await createBackupSnapshot(userId, "protective");
  await db.transaction(async tx => {
    const insertIfAny = async (table: any, rows: unknown[] | undefined) => { if (rows?.length) await tx.insert(table).values(rows.map(row => hydrateBackupRow(row as BackupRow)) as any); };
    await tx.delete(receiptAllocations);
    await tx.delete(receipts);
    await tx.delete(invoiceItems);
    await tx.delete(invoices);
    await tx.delete(expenses);
    await tx.delete(cashBalances);
    await tx.delete(cashMovements);
    await tx.delete(currencyTransfers);
    await tx.delete(cashAccountBalances);
    await tx.delete(cashAccounts);
    await tx.delete(individualSubscriptionCashMovements);
    await tx.delete(individualSubscriptionPayments);
    await tx.delete(individualSubscriptionAdjustments);
    await tx.delete(individualSubscriptionCharges);
    await tx.delete(individualSubscriptionCashBalances);
    await tx.delete(individualSubscriptions);
    await tx.delete(individualSubscriptionAccounts);
    await tx.delete(subscriptions);
    await tx.delete(servicePackages);
    await tx.delete(contacts);
    await tx.delete(movementCategories);
    await tx.delete(accountCategories);
    await tx.delete(currencies);
    await tx.delete(auditLogs);
    await insertIfAny(currencies, data.currencies);
    await insertIfAny(cashAccounts, data.cashAccounts);
    for (const account of DEFAULT_CASH_ACCOUNTS) {
      await tx.insert(cashAccounts).values(account).onDuplicateKeyUpdate({ set: { isSystem: true, isActive: true } });
    }
    await insertIfAny(accountCategories, data.accountCategories);
    await insertIfAny(movementCategories, data.movementCategories);
    await insertIfAny(contacts, data.contacts);
    await insertIfAny(servicePackages, data.servicePackages);
    await insertIfAny(subscriptions, data.subscriptions);
    await insertIfAny(individualSubscriptionAccounts, data.individualSubscriptionAccounts);
    await insertIfAny(individualSubscriptions, data.individualSubscriptions);
    await insertIfAny(individualSubscriptionCharges, data.individualSubscriptionCharges);
    await insertIfAny(individualSubscriptionAdjustments, data.individualSubscriptionAdjustments);
    await insertIfAny(individualSubscriptionPayments, data.individualSubscriptionPayments);
    await insertIfAny(individualSubscriptionCashMovements, data.individualSubscriptionCashMovements);
    await rebuildIndividualSubscriptionCashBalances(tx);
    await insertIfAny(invoices, data.invoices);
    await insertIfAny(invoiceItems, data.invoiceItems);
    await insertIfAny(receipts, data.receipts);
    await insertIfAny(receiptAllocations, data.receiptAllocations);
    await rebuildInvoicePaidAmounts(tx);
    await insertIfAny(expenses, data.expenses);
    await insertIfAny(currencyTransfers, data.currencyTransfers);
    await insertIfAny(cashMovements, data.cashMovements);
    const mainCashAccount = await resolveCashAccount(tx);
    await tx.update(cashMovements).set({ cashAccountId: mainCashAccount.id }).where(sql`${cashMovements.cashAccountId} IS NULL`);
    await tx.update(invoices).set({ cashAccountId: mainCashAccount.id }).where(and(eq(invoices.type, "cash"), sql`${invoices.cashAccountId} IS NULL`));
    await tx.update(receipts).set({ cashAccountId: mainCashAccount.id }).where(sql`${receipts.cashAccountId} IS NULL`);
    await tx.update(expenses).set({ cashAccountId: mainCashAccount.id }).where(sql`${expenses.cashAccountId} IS NULL`);
    await tx.update(currencyTransfers).set({ fromCashAccountId: mainCashAccount.id, toCashAccountId: mainCashAccount.id }).where(and(sql`${currencyTransfers.fromCashAccountId} IS NULL`, sql`${currencyTransfers.toCashAccountId} IS NULL`));
    await rebuildCashBalances(tx);
    await rebuildCashAccountBalances(tx);
    await insertIfAny(auditLogs, data.auditLogs);
    await writeAudit(tx, userId, "restore", "backup_snapshot", snapshotId, { fileName: snapshot.fileName, protectiveSnapshot: protectiveSnapshot.fileName });
  });
  return { snapshotId, fileName: snapshot.fileName, protectiveSnapshot: protectiveSnapshot.fileName };
}

export interface CreateMerchantTransactionInput {
  contactId: number;
  direction: "credit" | "debit"; // 'credit' = له (بضاعة مسحوبة / استحقاق للتاجر), 'debit' = عليه (سداد / مبلغ حوالة للتاجر)
  transactionType?: "purchase" | "transfer";
  invoiceNumber?: string; // رقم الفاتورة
  transferAmount?: string; // مبلغ الحوالة
  amount: string; // المبلغ الإجمالي
  currencyCode?: "YER" | "SAR" | "USD";
  exchangeRateToBase?: string;
  details?: string; // التفاصيل والتسعير (كم سعرت من التاجر هذا والبيان)
  transactionDate: Date;
  cashAccountId?: number; // الحساب / الصندوق المدفوع منه (في حال كانت حوالة مدفوعة من صندوق/بنك)
  deductFromCash?: boolean; // خصم المبلغ من الصندوق فعلياً
  notes?: string;
}

export interface UpdateMerchantTransactionInput {
  id: number;
  direction?: "credit" | "debit";
  transactionType?: "purchase" | "transfer";
  invoiceNumber?: string;
  transferAmount?: string;
  amount?: string;
  currencyCode?: "YER" | "SAR" | "USD";
  details?: string;
  transactionDate?: Date;
  notes?: string;
}

export async function createMerchantTransaction(userId: number, input: CreateMerchantTransactionInput) {
  const db = await requireDb();
  const contact = await getActiveContact(db, input.contactId);
  const amountCents = moneyToCents(input.amount);
  if (amountCents <= 0n) throw new Error("مبلغ العملية يجب أن يكون أكبر من صفر");

  const currencyCode = input.currencyCode || "YER";
  const exchangeRateToBase = input.exchangeRateToBase || "1";
  rateToMicros(exchangeRateToBase);

  return db.transaction(async tx => {
    await getActiveCurrency(tx, currencyCode);

    let cashAccount: any = null;
    const shouldDeduct = input.direction === "debit" && Boolean(input.cashAccountId) && input.deductFromCash !== false;

    if (shouldDeduct && input.cashAccountId) {
      cashAccount = await resolveCashAccount(tx, input.cashAccountId);
      await lockCashAccountCurrencies(tx, cashAccount.id, [currencyCode]);
      await debitTrackedCashBalance(tx, cashAccount.id, currencyCode, amountCents);
    }

    const result = await tx.insert(merchantTransactions).values({
      contactId: input.contactId,
      direction: input.direction,
      transactionType: input.transactionType || (input.direction === "credit" ? "purchase" : "transfer"),
      invoiceNumber: input.invoiceNumber?.trim() || null,
      transferAmount: input.transferAmount?.trim() || (input.direction === "debit" ? input.amount : null),
      amount: centsToMoney(amountCents),
      currencyCode,
      exchangeRateToBase,
      details: input.details?.trim() || null,
      transactionDate: input.transactionDate,
      cashAccountId: cashAccount?.id || (input.cashAccountId ?? null),
      notes: input.notes?.trim() || null,
      createdByUserId: userId,
    });

    const txId = Number(result[0].insertId);

    if (shouldDeduct && cashAccount) {
      await tx.insert(cashMovements).values({
        direction: "out",
        type: "expense",
        currencyCode,
        amount: centsToMoney(amountCents),
        occurredAt: input.transactionDate,
        sourceType: "merchant_transaction",
        sourceId: txId,
        cashAccountId: cashAccount.id,
        description: `حوالة / سداد للتاجر: ${contact.name}${input.invoiceNumber ? ` — فاتورة: ${input.invoiceNumber}` : ""}`,
        createdByUserId: userId,
      });
    }

    await writeAudit(tx, userId, "create", "merchant_transaction", txId, {
      contactId: input.contactId,
      contactName: contact.name,
      direction: input.direction,
      invoiceNumber: input.invoiceNumber,
      amount: centsToMoney(amountCents),
      currencyCode,
      details: input.details,
    });

    return { id: txId };
  });
}

export async function updateMerchantTransaction(userId: number, input: UpdateMerchantTransactionInput) {
  const db = await requireDb();
  const [existing] = await db.select().from(merchantTransactions).where(eq(merchantTransactions.id, input.id)).limit(1);
  if (!existing) throw new Error("حركة التاجر غير موجودة");

  const updateSet: Record<string, any> = {};
  if (input.direction) updateSet.direction = input.direction;
  if (input.transactionType) updateSet.transactionType = input.transactionType;
  if (input.invoiceNumber !== undefined) updateSet.invoiceNumber = input.invoiceNumber?.trim() || null;
  if (input.transferAmount !== undefined) updateSet.transferAmount = input.transferAmount?.trim() || null;
  if (input.amount !== undefined) {
    const amtCents = moneyToCents(input.amount);
    if (amtCents <= 0n) throw new Error("المبلغ يجب أن يكون أكبر من صفر");
    updateSet.amount = centsToMoney(amtCents);
  }
  if (input.currencyCode) updateSet.currencyCode = input.currencyCode;
  if (input.details !== undefined) updateSet.details = input.details?.trim() || null;
  if (input.transactionDate) updateSet.transactionDate = input.transactionDate;
  if (input.notes !== undefined) updateSet.notes = input.notes?.trim() || null;

  await db.update(merchantTransactions).set(updateSet).where(eq(merchantTransactions.id, input.id));
  await writeAudit(db, userId, "update", "merchant_transaction", input.id, { ...updateSet });
  return { id: input.id };
}

export async function deleteMerchantTransaction(userId: number, id: number) {
  const db = await requireDb();
  const [existing] = await db.select().from(merchantTransactions).where(eq(merchantTransactions.id, id)).limit(1);
  if (!existing) throw new Error("حركة التاجر غير موجودة");

  return db.transaction(async tx => {
    const [linkedMovement] = await tx
      .select()
      .from(cashMovements)
      .where(and(eq(cashMovements.sourceType, "merchant_transaction"), eq(cashMovements.sourceId, id)))
      .limit(1);

    if (linkedMovement && linkedMovement.cashAccountId) {
      const amountCents = moneyToCents(linkedMovement.amount);
      await adjustTrackedCashBalance(tx, linkedMovement.cashAccountId, linkedMovement.currencyCode, amountCents);
      await tx.delete(cashMovements).where(eq(cashMovements.id, linkedMovement.id));
    }

    await tx.delete(merchantTransactions).where(eq(merchantTransactions.id, id));
    await writeAudit(tx, userId, "delete", "merchant_transaction", id, { ...existing });
    return { success: true };
  });
}

export async function listMerchantTransactions(contactId: number) {
  const db = await requireDb();
  const rows = await db
    .select({
      transaction: merchantTransactions,
      cashAccountName: cashAccounts.name,
      cashAccountType: cashAccounts.type,
    })
    .from(merchantTransactions)
    .leftJoin(cashAccounts, eq(merchantTransactions.cashAccountId, cashAccounts.id))
    .where(eq(merchantTransactions.contactId, contactId))
    .orderBy(asc(merchantTransactions.transactionDate), asc(merchantTransactions.id));

  let runningBalance = 0;
  let totalCredit = 0; // إجمالي المسحوب (له)
  let totalDebit = 0;  // إجمالي الحوالات والمسدد (عليه)

  const items = rows.map((row: any) => {
    const amt = Number(row.transaction.amount || 0);
    if (row.transaction.direction === "credit") {
      totalCredit += amt;
      runningBalance += amt;
    } else {
      totalDebit += amt;
      runningBalance -= amt;
    }
    return {
      ...row.transaction,
      cashAccountName: row.cashAccountName,
      cashAccountType: row.cashAccountType,
      runningBalance,
    };
  });

  return {
    items,
    totalCredit,
    totalDebit,
    netBalance: runningBalance,
  };
}

export async function getContactStatement(contactId: number) {
  const db = await requireDb();
  const contact = await getActiveContact(db, contactId);
  const contactInvoices = await listInvoices();
  const contactReceipts = await listReceipts();
  const allExpenses = await listExpenses();
  const merchantTxData = await listMerchantTransactions(contactId);

  return {
    contact,
    invoices: contactInvoices.filter((invoice: any) => invoice.contactId === contactId),
    receipts: contactReceipts.filter((row: any) => row.receipt.contactId === contactId).map((row: any) => row.receipt),
    expenses: allExpenses.filter((row: any) => row.expense.contactId === contactId).map((row: any) => row.expense),
    merchantTransactions: merchantTxData.items,
    merchantTotals: {
      totalCredit: merchantTxData.totalCredit,
      totalDebit: merchantTxData.totalDebit,
      netBalance: merchantTxData.netBalance,
    },
  };
}
