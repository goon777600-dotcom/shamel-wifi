import { describe, expect, it } from "vitest";
import { money } from "./ui";

describe("تنسيق المبالغ", () => {
  it("يحذف الأصفار العشرية غير اللازمة ويحافظ على الكسور الحقيقية", () => {
    expect(money("200000.00", "YER")).toContain("٢٠٠٬٠٠٠ ر.ي");
    expect(money("12.5", "USD")).toContain("١٢٫٥ $");
  });
});
