import { describe, expect, it } from "vitest";
import { CONTACT_TYPE_OPTIONS, contactTypeLabel } from "./contactTypes";

describe("أنواع حسابات العملاء", () => {
  it("يعرض في النموذج الأنواع العملية ومنها البقالة والعميل الفردي", () => {
    expect(CONTACT_TYPE_OPTIONS.map(option => option.value)).toEqual(expect.arrayContaining(["customer", "grocery", "supplier", "employee"]));
    expect(CONTACT_TYPE_OPTIONS.map(option => option.value)).not.toContain("market");
    expect(contactTypeLabel.grocery).toBe("بقالة");
  });
});
