import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("عمليات حساب العميل القابلة للتعديل", () => {
  it("يعرض الضغط على كشف الحساب وتعديل الفاتورة وسند القبض", () => {
    const source = readFileSync(new URL("./ClientAccountPage.tsx", import.meta.url), "utf8");
    expect(source).toContain("ClientOperationEditDialog");
    expect(source).toContain("اضغط على أي فاتورة أو سند قبض لفتح التعديل");
    expect(source).toContain("تعديل لفتح مبلغ الفاتورة");
    expect(source).toContain("سندات قبض العميل");
    expect(source).toContain('kind: "invoice"');
    expect(source).toContain('kind: "receipt"');
  });
});
