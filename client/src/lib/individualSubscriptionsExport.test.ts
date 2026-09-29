import { describe, expect, it } from "vitest";
import { buildIndividualSubscriptionExportRows, createExpenseCategoryOperationsXlsx, createIndividualSubscriptionsXlsx, filterIndividualSubscriptionAccounts, type IndividualSubscriptionExportAccount } from "./individualSubscriptionsExport";

const accounts: IndividualSubscriptionExportAccount[] = [
  {
    id: 1,
    name: "أحمد",
    phone: "+967777000000",
    status: "active",
    notes: "حساب منزلي",
    createdAt: new Date("2026-08-20T00:00:00Z"),
    updatedAt: new Date("2026-08-21T00:00:00Z"),
    subscriptions: [{ id: 11, name: "واي فاي المنزل", status: "active", notes: null, createdAt: new Date("2026-08-20T00:00:00Z"), updatedAt: new Date("2026-08-20T00:00:00Z") }],
  },
  {
    id: 2,
    name: "سالم",
    phone: "+966501234567",
    status: "suspended",
    notes: null,
    createdAt: new Date("2026-08-20T00:00:00Z"),
    updatedAt: new Date("2026-08-21T00:00:00Z"),
    subscriptions: [{ id: 12, name: "شبكة المكتب", status: "suspended", notes: "مراجعة السداد", createdAt: new Date("2026-08-20T00:00:00Z"), updatedAt: new Date("2026-08-20T00:00:00Z") }],
  },
  {
    id: 3,
    name: "خالد",
    phone: null,
    status: "closed",
    notes: null,
    createdAt: new Date("2026-08-20T00:00:00Z"),
    updatedAt: new Date("2026-08-21T00:00:00Z"),
    subscriptions: [],
  },
];

describe("تصفية وتصدير اشتراكات الأفراد", () => {
  it("يبحث بالاسم أو الهاتف أو اسم الخدمة ويصفي بحالة الحساب والاشتراك", () => {
    expect(filterIndividualSubscriptionAccounts(accounts, { search: "المكتب", accountStatus: "all", subscriptionStatus: "all" }).map(account => account.id)).toEqual([2]);
    expect(filterIndividualSubscriptionAccounts(accounts, { search: "", accountStatus: "suspended", subscriptionStatus: "all" }).map(account => account.id)).toEqual([2]);
    expect(filterIndividualSubscriptionAccounts(accounts, { search: "", accountStatus: "all", subscriptionStatus: "active" }).map(account => account.id)).toEqual([1]);
    expect(filterIndividualSubscriptionAccounts(accounts, { search: "", accountStatus: "all", subscriptionStatus: "without_subscription" }).map(account => account.id)).toEqual([3]);
  });

  it("يبني ملف التصدير كسجل كامل لكل خدمة مع صف واضح للحساب بلا اشتراكات", () => {
    const rows = buildIndividualSubscriptionExportRows(accounts);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ "اسم المشترك": "أحمد", "اسم الخدمة أو الاشتراك": "واي فاي المنزل", "حالة الحساب": "نشط", "حالة الاشتراك": "فعّال" });
    expect(rows[2]).toMatchObject({ "اسم المشترك": "خالد", "رقم سجل الاشتراك": null, "حالة الاشتراك": "لا يوجد اشتراك" });
  });

  it("ينشئ ملف XLSX قياسياً صالحاً من قائمة اشتراكات الأفراد", () => {
    const { bytes, rowCount } = createIndividualSubscriptionsXlsx(accounts);
    expect(rowCount).toBe(3);
    expect(bytes.slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
    expect(new TextDecoder().decode(bytes)).toContain("xl/worksheets/sheet1.xml");
    expect(new TextDecoder().decode(bytes)).toContain("واي فاي المنزل");
  });

  it("ينشئ ملف XLSX لتفاصيل عمليات تصنيف المصروفات", () => {
    const { bytes, rowCount } = createExpenseCategoryOperationsXlsx("بترول ومشاوير", [{ expenseNumber: "EXP-001", description: "بترول سيارة", expenseDate: new Date("2026-08-25T00:00:00Z"), amount: "5000", currencyCode: "YER", status: "posted", supplierName: null, supplierInvoiceNumber: null, notes: "", cashOverrideReason: null }]);
    expect(rowCount).toBe(1);
    expect(bytes.slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
    expect(new TextDecoder().decode(bytes)).toContain("بترول سيارة");
    expect(new TextDecoder().decode(bytes)).toContain("رقم القيد");
  });
});
