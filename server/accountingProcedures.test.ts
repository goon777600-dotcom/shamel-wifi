import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  addIndividualSubscription: vi.fn(), createAccountCategory: vi.fn(), createBackupSnapshot: vi.fn(), createCashAccount: vi.fn(), createContact: vi.fn(), createCurrencyTransfer: vi.fn(), createExpense: vi.fn(), createIndividualSubscriptionAccount: vi.fn(), createIndividualSubscriptionCharge: vi.fn(), createIndividualSubscriptionDiscount: vi.fn(), createInvoice: vi.fn(), createMovementCategory: vi.fn(), createOpeningBalance: vi.fn(), createReceipt: vi.fn(), createServicePackage: vi.fn(), createSubscription: vi.fn(), getCashSummary: vi.fn(), getContactStatement: vi.fn(), getDashboardSummary: vi.fn(), getFinancialReport: vi.fn(), getIndividualSubscriptionAccountDetail: vi.fn(), getInvoiceDocument: vi.fn(), getReceiptDocument: vi.fn(), getSetup: vi.fn(), getWhatsAppSettings: vi.fn(), listBackupSnapshots: vi.fn(), listContacts: vi.fn(), listExpenses: vi.fn(), listIndividualSubscriptionAccounts: vi.fn(), listOpenInvoices: vi.fn(), listReceipts: vi.fn(), listServicePackages: vi.fn(), listSubscriptions: vi.fn(), recordIndividualSubscriptionPayment: vi.fn(), restoreBackupSnapshot: vi.fn(), updateAccountCategory: vi.fn(), updateContact: vi.fn(), updateExpense: vi.fn(), updateIndividualSubscription: vi.fn(), updateIndividualSubscriptionAccount: vi.fn(), updateIndividualSubscriptionCharge: vi.fn(), updateIndividualSubscriptionDiscount: vi.fn(), updateIndividualSubscriptionStatus: vi.fn(), updateInvoice: vi.fn(), updateMovementCategory: vi.fn(), updateReceipt: vi.fn(), updateServicePackage: vi.fn(), updateSubscriptionStatus: vi.fn(),
}));

vi.mock("./accounting", () => mocks);

import { appRouter } from "./routers";

function adminContext(appLockGranted = true): TrpcContext {
  return {
    user: { id: 77, openId: "owner", name: "المالك", email: null, loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    appLockGranted,
  };
}

describe("إجراءات المحاسبة المحمية", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createInvoice.mockResolvedValue({ id: 1, invoiceNumber: "INV-1" });
    mocks.createReceipt.mockResolvedValue({ id: 2, receiptNumber: "REC-1" });
    mocks.updateInvoice.mockResolvedValue({ id: 1, invoiceNumber: "INV-1", totalAmount: "12.00", status: "issued" });
    mocks.updateReceipt.mockResolvedValue({ id: 2, receiptNumber: "REC-1", amount: "12.00" });
    mocks.createExpense.mockResolvedValue({ id: 3 });
    mocks.updateExpense.mockResolvedValue({ id: 3, expenseNumber: "EXP-3", amount: "5000.00" });
    mocks.createCurrencyTransfer.mockResolvedValue({ id: 4 });
    mocks.createCashAccount.mockResolvedValue({ id: 5, name: "بنك الشمول", type: "bank" });
    mocks.createIndividualSubscriptionAccount.mockResolvedValue({ id: 88, subscriptionId: 89 });
    mocks.addIndividualSubscription.mockResolvedValue({ id: 89 });
    mocks.updateIndividualSubscription.mockResolvedValue({ id: 89 });
    mocks.updateIndividualSubscriptionCharge.mockResolvedValue({ id: 501, amount: "183000.00", status: "unpaid" });
    mocks.createIndividualSubscriptionDiscount.mockResolvedValue({ id: 601, chargeId: 501, amount: "3000.00", currencyCode: "YER", status: "partial" });
    mocks.updateIndividualSubscriptionDiscount.mockResolvedValue({ id: 601, chargeId: 501, amount: "2000.00", currencyCode: "YER", status: "partial" });
  });

  it("يرفض أي إجراء محاسبي قبل فتح قفل التطبيق حتى لو كان المستخدم مديراً", async () => {
    const caller = appRouter.createCaller(adminContext(false));
    await expect(caller.accounting.contacts()).rejects.toMatchObject({ code: "FORBIDDEN", message: "أدخل كلمة مرور التطبيق أولاً" });
  });

  it("يمرر الفاتورة وسند القبض والمصروف والتحويل إلى طبقة الحسابات باسم المالك", async () => {
    const caller = appRouter.createCaller(adminContext());
    const date = new Date("2026-08-16T12:00:00Z");
    await caller.accounting.createInvoice({ contactId: 11, movementCategoryId: 5, type: "credit", issueDate: date, currencyCode: "USD", exchangeRateToBase: "530", discountAmount: "0", items: [{ description: "اشتراك شهري", quantity: "1", unitPrice: "10" }] });
    await caller.accounting.createReceipt({ contactId: 11, cashAccountId: 5, receiptDate: date, currencyCode: "USD", exchangeRateToBase: "530", amount: "10", allocations: [{ invoiceId: 1, amount: "10" }] });
    await caller.accounting.createExpense({ movementCategoryId: 6, cashAccountId: 5, expenseDate: date, currencyCode: "YER", exchangeRateToBase: "1", amount: "5000", description: "بترول" });
    await caller.accounting.createCurrencyTransfer({ transferDate: date, fromCashAccountId: 4, fromCurrencyCode: "USD", fromAmount: "10", toCashAccountId: 5, toCurrencyCode: "YER", toAmount: "5300" });
    await caller.accounting.createCashAccount({ name: "بنك الشمول", type: "bank" });
    expect(mocks.createInvoice).toHaveBeenCalledWith(77, expect.objectContaining({ type: "credit", currencyCode: "USD" }));
    expect(mocks.createReceipt).toHaveBeenCalledWith(77, expect.objectContaining({ amount: "10", cashAccountId: 5 }));
    expect(mocks.createExpense).toHaveBeenCalledWith(77, expect.objectContaining({ description: "بترول", cashAccountId: 5 }));
    expect(mocks.createCurrencyTransfer).toHaveBeenCalledWith(77, expect.objectContaining({ fromCashAccountId: 4, toCashAccountId: 5, fromCurrencyCode: "USD", toCurrencyCode: "YER" }));
    expect(mocks.createCashAccount).toHaveBeenCalledWith(77, { name: "بنك الشمول", type: "bank" });
  });

  it("يعدل فاتورة العميل وسند قبضه باسم المالك", async () => {
    const caller = appRouter.createCaller(adminContext());
    const date = new Date("2026-08-26T12:00:00Z");
    await caller.accounting.updateInvoice({ contactId: 11, invoiceId: 1, issueDate: date, description: "اشتراك معدل", amount: "12", cashAccountId: 4, notes: "تصحيح" });
    await caller.accounting.updateReceipt({ contactId: 11, receiptId: 2, receiptDate: date, amount: "12", cashAccountId: 5, notes: "تصحيح القبض", allocations: [{ invoiceId: 1, amount: "12" }] });
    expect(mocks.updateInvoice).toHaveBeenCalledWith(77, expect.objectContaining({ contactId: 11, invoiceId: 1, amount: "12", cashAccountId: 4 }));
    expect(mocks.updateReceipt).toHaveBeenCalledWith(77, expect.objectContaining({ contactId: 11, receiptId: 2, amount: "12", cashAccountId: 5 }));
  });

  it("يوثق تجاوز الصندوق وتعديل المصروف باسم المالك", async () => {
    const caller = appRouter.createCaller(adminContext());
    const date = new Date("2026-08-26T12:00:00Z");
    await caller.accounting.createExpense({ movementCategoryId: 6, cashAccountId: 5, expenseDate: date, currencyCode: "YER", exchangeRateToBase: "1", amount: "5000", description: "شراء إنترنت", allowCashOverdraft: true, cashOverrideReason: "سداد من خارج الحساب" });
    await caller.accounting.updateExpense({ expenseId: 3, movementCategoryId: 6, cashAccountId: 5, expenseDate: date, amount: "6000", description: "شراء إنترنت معدل", allowCashOverdraft: true, cashOverrideReason: "تصحيح قيمة المورد" });
    expect(mocks.createExpense).toHaveBeenCalledWith(77, expect.objectContaining({ cashAccountId: 5, allowCashOverdraft: true, cashOverrideReason: "سداد من خارج الحساب" }));
    expect(mocks.updateExpense).toHaveBeenCalledWith(77, expect.objectContaining({ expenseId: 3, cashAccountId: 5, amount: "6000", allowCashOverdraft: true }));
  });

  it("يمرر حساب الاشتراك الفردي وسجل خدمته من دون عميل أو باقة أو مدة", async () => {
    const caller = appRouter.createCaller(adminContext());
    await caller.accounting.createIndividualSubscriptionAccount({ name: "أحمد", phone: "+967777000000", initialSubscription: { name: "واي فاي المنزل", status: "active" } });
    await caller.accounting.addIndividualSubscription({ accountId: 88, name: "تجديد واي فاي", status: "active" });
    await caller.accounting.updateIndividualSubscription({ id: 89, name: "اشتراك منزل أحمد", status: "suspended", notes: "بانتظار المراجعة" });
    expect(mocks.createIndividualSubscriptionAccount).toHaveBeenCalledWith(77, expect.objectContaining({ name: "أحمد", phone: "+967777000000", initialSubscription: { name: "واي فاي المنزل", status: "active" } }));
    expect(mocks.addIndividualSubscription).toHaveBeenCalledWith(77, expect.objectContaining({ accountId: 88, name: "تجديد واي فاي", status: "active" }));
    expect(mocks.updateIndividualSubscription).toHaveBeenCalledWith(77, expect.objectContaining({ id: 89, name: "اشتراك منزل أحمد", status: "suspended" }));
    const creationInput = mocks.createIndividualSubscriptionAccount.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(creationInput).not.toHaveProperty("contactId");
    expect(creationInput).not.toHaveProperty("packageId");
    expect(creationInput).not.toHaveProperty("durationDays");
    expect(creationInput).not.toHaveProperty("endDate");
  });

  it("يعدل مبلغ اشتراك الفرد ويسجل خصماً مستقلاً باسم المالك", async () => {
    const caller = appRouter.createCaller(adminContext());
    const date = new Date("2026-08-26T12:00:00Z");
    await caller.accounting.updateIndividualSubscriptionCharge({ accountId: 88, chargeId: 501, description: "اشتراك أحمد", amount: "183000", chargedAt: date });
    await caller.accounting.createIndividualSubscriptionDiscount({ accountId: 88, chargeId: 501, amount: "3000", adjustmentDate: date, notes: "تخفيض" });
    await caller.accounting.updateIndividualSubscriptionDiscount({ accountId: 88, adjustmentId: 601, amount: "2000", adjustmentDate: date, notes: "تعديل التخفيض" });
    expect(mocks.updateIndividualSubscriptionCharge).toHaveBeenCalledWith(77, expect.objectContaining({ accountId: 88, chargeId: 501, amount: "183000" }));
    expect(mocks.createIndividualSubscriptionDiscount).toHaveBeenCalledWith(77, expect.objectContaining({ accountId: 88, chargeId: 501, amount: "3000" }));
    expect(mocks.updateIndividualSubscriptionDiscount).toHaveBeenCalledWith(77, expect.objectContaining({ accountId: 88, adjustmentId: 601, amount: "2000" }));
  });
});
