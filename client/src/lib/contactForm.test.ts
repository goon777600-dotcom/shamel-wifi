import { describe, expect, it } from "vitest";
import { buildContactFormPayload } from "./contactForm";

describe("حفظ نموذج فتح وتعديل الحساب", () => {
  it("يحفظ نوع البقالة المختار ورقم اليمن المنسق من نموذج الحساب", () => {
    expect(buildContactFormPayload({ name: "بقالة النور", type: "grocery", phone: "777000000", address: "", notes: "" }, "YE")).toEqual({ name: "بقالة النور", type: "grocery", phone: "+967777000000", address: "", notes: "" });
  });
});
