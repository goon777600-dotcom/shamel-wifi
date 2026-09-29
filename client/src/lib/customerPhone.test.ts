import { describe, expect, it } from "vitest";
import { formatCustomerPhone, parseCustomerPhone } from "./customerPhone";
import { normalizeYemenPhone } from "./whatsapp";

describe("customer country phone selection", () => {
  it("stores Yemeni and Saudi local numbers using their country codes", () => {
    expect(formatCustomerPhone("777000000", "YE")).toBe("+967777000000");
    expect(formatCustomerPhone("512345678", "SA")).toBe("+966512345678");
    expect(parseCustomerPhone("+966512345678")).toEqual({ country: "SA", localNumber: "512345678" });
    expect(normalizeYemenPhone("+966512345678")).toBe("966512345678");
  });
});
