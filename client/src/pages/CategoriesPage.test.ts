import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("تصنيفات الحركات والحسابات", () => {
  it("تدعم تصنيفات الصدقات والمساعدات والإيجارات بأيقونات مميزة", () => {
    const source = readFileSync(new URL("./CategoriesPage.tsx", import.meta.url), "utf8");
    expect(source).toContain("HeartHandshake");
    expect(source).toContain("Building2");
    expect(source).toContain("إيجار");
    expect(source).toContain("صدق");
    expect(source).toContain("مساعد");
  });
});
