import { describe, expect, it } from "vitest";
import { isExternalPurchaseCategory } from "./accounting";

describe("isExternalPurchaseCategory", () => {
  it("limits supplier invoice details to external asset, equipment, and electrical-material purchases", () => {
    expect(isExternalPurchaseCategory("شراء أصل أو معدات")).toBe(true);
    expect(isExternalPurchaseCategory("مواد كهرباء")).toBe(true);
    expect(isExternalPurchaseCategory("بترول")).toBe(false);
    expect(isExternalPurchaseCategory("مشاوير")).toBe(false);
  });
});
