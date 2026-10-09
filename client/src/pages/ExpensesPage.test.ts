import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("المصروفات القابلة للتعديل وتجاوز رصيد الحساب", () => {
  it("يعرض التعديل والتحذير وسبب التجاوز", () => {
    const source = readFileSync(new URL("./ExpensesPage.tsx", import.meta.url), "utf8");
    expect(source).toContain("updateExpense");
    expect(source).toContain("تجاوز رصيد الحساب عند عدم كفايته");
    expect(source).toContain("سبب تجاوز رصيد الحساب");
    expect(source).toContain("تجاوز موثق");
    expect(source).toContain("شراء خدمة الإنترنت");
    expect(source).toContain("إجمالي المصروفات حسب التصنيف");
    expect(source).toContain("summaryMonth");
    expect(source).toContain("monthlyCategoryTotals");
    expect(source).toContain("لا تُجمع العملات المختلفة معاً");
    expect(source).toContain("getExpenseCategoryVisual");
    expect(source).toContain("border-amber-200");
    expect(source).toContain("border-cyan-200");
    expect(source).toContain("border-indigo-200");
    expect(source).toContain("border-teal-200");
    expect(source).toContain("HeartHandshake");
    expect(source).toContain("contactTypeLabel");
    expect(source).toContain("لا يوجد صرف في هذا الشهر");
    expect(source).toContain("تفاصيل مصروفات");
    expect(source).toContain("detailsCategoryId");
    expect(source).toContain("categoryExpenseRows");
    expect(source).toContain("عرض تفاصيل");
    expect(source).toContain("طباعة / حفظ PDF");
    expect(source).toContain("printExpenseCategoryStatement");
    expect(source).toContain("تصدير Excel");
  });
});
