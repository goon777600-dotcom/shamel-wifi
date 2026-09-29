import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ملخص البقالات في لوحة التحكم", () => {
  it("يعرض مبيعات البقالات وعدد فواتيرها وحساباتها بصورة مستقلة", () => {
    const source = readFileSync(new URL("./AccountingDashboard.tsx", import.meta.url), "utf8");
    expect(source).toContain('label="مبيعات البقالات"');
    expect(source).toContain("data?.grocerySales");
    expect(source).toContain("data?.groceryTransactionCount");
    expect(source).toContain("data?.groceryContactCount");
  });
});
