import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("واجهة مالية اشتراكات الأفراد", () => {
  it("تسمي قبض العميل سند قبض وتفصل إضافة المبلغ عن القبض", async () => {
    const source = await readFile(new URL("./IndividualSubscriptionFinancePanel.tsx", import.meta.url), "utf8");

    expect(source).toContain("سند قبض اشتراك فردي");
    expect(source).toContain("حفظ سند القبض");
    expect(source).toContain("أضف مبلغ الاشتراك أولاً، ثم سجّل سند القبض عند استلام المال");
    expect(source).toContain("updateIndividualSubscriptionDiscount");
    expect(source).toContain("تعديل الخصم");
    expect(source).toContain("مقبوض · سند");
    expect(source).toContain("خصم ·");
    expect(source).toContain("bg-rose-50");
    expect(source).toContain("bg-emerald-50");
    expect(source).toContain("bg-amber-50");
    expect(source).not.toContain("استلام / إيداع مبلغ");
  });
});
