import { describe, expect, it } from "vitest";
import { calculateGrocerySalesSummary } from "./accounting";

describe("ملخص مبيعات البقالات", () => {
  it("يحتسب فواتير البقالات فقط ويحوّلها إلى عملة التقرير وفق سعر العملية", () => {
    const summary = calculateGrocerySalesSummary([
      { contactType: "grocery", contactId: 10, totalAmount: "5000.00", exchangeRateToBase: "1" },
      { contactType: "grocery", contactId: 10, totalAmount: "20.00", exchangeRateToBase: "530" },
      { contactType: "grocery", contactId: 11, totalAmount: "30.00", exchangeRateToBase: "530" },
      { contactType: "customer", contactId: 12, totalAmount: "99000.00", exchangeRateToBase: "1" },
    ]);

    expect(summary).toEqual({
      grocerySales: "31500.00",
      groceryTransactionCount: 3,
      groceryContactCount: 2,
    });
  });
});
