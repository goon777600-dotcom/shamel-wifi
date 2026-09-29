import { describe, expect, it } from "vitest";
import { assertBackupDataIntegrity, isSupportedBackupPayload } from "./accounting";

const validData = {
  currencies: [], accountCategories: [], movementCategories: [], contacts: [], servicePackages: [], subscriptions: [], invoices: [], invoiceItems: [], receipts: [], receiptAllocations: [], expenses: [], currencyTransfers: [], cashMovements: [], auditLogs: [],
};

describe("isSupportedBackupPayload", () => {
  it("يقبل النسخة ذات البنية الكاملة فقط", () => {
    expect(isSupportedBackupPayload({ version: 1, data: validData })).toBe(true);
  });

  it("يقبل النسخة القديمة التي لا تتضمن حسابات الصناديق والبنوك", () => {
    const legacyData = { ...validData, currencies: [{ code: "YER" }] };
    expect(isSupportedBackupPayload({ version: 1, data: legacyData })).toBe(true);
    expect(() => assertBackupDataIntegrity(legacyData)).not.toThrow();
  });

  it("يرفض النسخة الناقصة قبل حذف أو استبدال أي بيانات", () => {
    expect(isSupportedBackupPayload({ version: 1, data: { contacts: [] } })).toBe(false);
    expect(isSupportedBackupPayload({ version: 2, data: validData })).toBe(false);
    expect(isSupportedBackupPayload(null)).toBe(false);
  });

  it("يرفض مرجعاً أو رقماً مكرراً قبل بدء الاستعادة", () => {
    const invalidData = {
      ...validData,
      currencies: [{ code: "YER" }],
      contacts: [{ id: 1 }],
      invoices: [{ id: 1, contactId: 2, currencyCode: "YER", invoiceNumber: "FAT-1", totalAmount: "10.00" }],
    };
    expect(() => assertBackupDataIntegrity(invalidData)).toThrow("مرجع غير صالح");
  });

  it("يرفض حقول التاريخ غير الصالحة قبل أن تبدأ الاستعادة", () => {
    const invalidData = {
      ...validData,
      currencies: [{ code: "YER", nameAr: "ريال يمني", symbol: "ر.ي", isActive: true, createdAt: "تاريخ غير صالح" }],
    };
    expect(() => assertBackupDataIntegrity(invalidData)).toThrow("تاريخ غير صالح");
  });

  it("يرفض العملات والتصنيفات المرجعية غير الموجودة", () => {
    const invalidData = {
      ...validData,
      currencies: [{ code: "YER", createdAt: "2026-01-01T00:00:00.000Z" }],
      movementCategories: [{ id: 1, accountCategoryId: 9, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
    };
    expect(() => assertBackupDataIntegrity(invalidData)).toThrow("مرجع غير صالح");
  });

  it("يرفض السجل المنشأ بواسطة مستخدم غير موجود", () => {
    const invalidData = {
      ...validData,
      currencies: [{ code: "YER" }],
      contacts: [{ id: 1 }],
      invoices: [{ id: 1, contactId: 1, currencyCode: "YER", invoiceNumber: "FAT-1", totalAmount: "10.00", createdByUserId: 9 }],
    };
    expect(() => assertBackupDataIntegrity(invalidData, new Set([1]))).toThrow("مرجع غير صالح");
  });

  it("يتحقق من أرصدة ومراجع حسابات الصناديق والبنوك عند وجودها", () => {
    const data = {
      ...validData,
      currencies: [{ code: "YER" }],
      cashAccounts: [{ id: 11, name: "بنك الشمول", type: "bank" }],
      cashAccountBalances: [{ cashAccountId: 11, currencyCode: "YER", balance: "5000.00" }],
      cashMovements: [{ id: 22, currencyCode: "YER", amount: "5000.00", cashAccountId: 11 }],
    };
    expect(() => assertBackupDataIntegrity(data)).not.toThrow();
    expect(() => assertBackupDataIntegrity({ ...data, cashAccountBalances: [{ cashAccountId: 99, currencyCode: "YER", balance: "5000.00" }] })).toThrow("مرجع غير صالح");
    expect(() => assertBackupDataIntegrity({ ...data, cashMovements: [{ id: 22, currencyCode: "YER", amount: "5000.00", cashAccountId: 99 }] })).toThrow("مرجع غير صالح");
  });

  it("يتحقق من مبالغ ومدفوعات وحركات صندوق اشتراكات الأفراد بصورة مستقلة", () => {
    const data = {
      ...validData,
      currencies: [{ code: "YER" }],
      individualSubscriptionAccounts: [{ id: 1 }],
      individualSubscriptions: [{ id: 1, accountId: 1 }],
      individualSubscriptionCharges: [{ id: 1, accountId: 1, subscriptionId: 1, currencyCode: "YER", amount: "4000.00", paidAmount: "4000.00", chargedAt: "2026-08-25T00:00:00.000Z" }],
      individualSubscriptionPayments: [{ id: 1, accountId: 1, chargeId: 1, currencyCode: "YER", amount: "4000.00", paymentDate: "2026-08-25T00:00:00.000Z" }],
      individualSubscriptionCashBalances: [{ currencyCode: "YER", balance: "4000.00" }],
      individualSubscriptionCashMovements: [{ id: 1, currencyCode: "YER", amount: "4000.00", sourcePaymentId: 1, occurredAt: "2026-08-25T00:00:00.000Z" }],
    };
    expect(() => assertBackupDataIntegrity(data)).not.toThrow();
    expect(() => assertBackupDataIntegrity({ ...data, individualSubscriptionCharges: [{ ...data.individualSubscriptionCharges[0], paidAmount: "5000.00" }] })).toThrow("المبلغ المدفوع غير صالح");
  });
});
