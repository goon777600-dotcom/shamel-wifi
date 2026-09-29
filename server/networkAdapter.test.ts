import { describe, expect, it } from "vitest";
import { DisabledNetworkAdapter } from "./networkAdapter";

describe("DisabledNetworkAdapter", () => {
  it("يرفض تنفيذ تفعيل أو فصل شبكة قبل تهيئة جهاز فعلي", async () => {
    const adapter = new DisabledNetworkAdapter();
    const result = await adapter.execute({ subscriptionId: 12, customerName: "عميل اختبار", packageName: "باقة شهرية", action: "activate", effectiveAt: new Date() });
    expect(result.accepted).toBe(false);
    expect(result.message).toContain("غير مفعّل");
  });
});
