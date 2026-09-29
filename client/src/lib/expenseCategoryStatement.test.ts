import { describe, expect, it } from "vitest";
import { createExpenseCategoryStatementHtml } from "./expenseCategoryStatement";

describe("كشف تصنيف المصروفات للطباعة", () => {
  it("ينشئ كشفاً عربياً يضم تفاصيل العمليات وملاحظة التجاوز", () => {
    const html = createExpenseCategoryStatementHtml({
      categoryName: "بترول ومشاوير",
      month: "2026-08",
      operations: [{ expenseNumber: "EXP-101", description: "بترول سيارة", expenseDate: new Date("2026-08-25T00:00:00Z"), amount: "5000.00", currencyCode: "YER", status: "تجاوز موثق", supplierName: "محطة الوقود", supplierInvoiceNumber: "F-88", cashOverrideReason: "سداد عاجل" }],
    });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("بترول ومشاوير");
    expect(html).toContain("EXP-101");
    expect(html).toContain("٥٬٠٠٠ ر.ي");
    expect(html).toContain("تجاوز موثق: سداد عاجل");
  });
});
