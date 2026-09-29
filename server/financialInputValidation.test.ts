import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { CONTACT_TYPES } from "./routers";

describe("التحقق من المدخلات المالية", () => {
  it("يوفر أنواع حساب عملية تشمل البقالة والعميل الفردي", () => {
    expect(CONTACT_TYPES).toEqual(expect.arrayContaining(["customer", "grocery", "supplier", "employee"]));
    expect(CONTACT_TYPES).not.toContain("market");
  });

  it("يرفض المبالغ والكميات وأسعار الصرف الصفرية قبل تنفيذ أي عملية", async () => {
    const createCaller = appRouter.createCaller as unknown as (context: any) => any;
    const caller = createCaller({ user: { id: 1, role: "admin" } });
    await expect(caller.accounting.createInvoice({ contactId: 1, type: "cash", issueDate: new Date(), currencyCode: "YER", exchangeRateToBase: "0", discountAmount: "0", items: [{ description: "اختبار", quantity: "0", unitPrice: "0" }] })).rejects.toBeDefined();
  });
});
