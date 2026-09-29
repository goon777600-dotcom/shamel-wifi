import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("تمييز أنواع الحسابات", () => {
  it("يعرض لوناً وأيقونة مخصصين لكل نوع في دليل الحسابات", () => {
    const source = readFileSync(new URL("./ContactsPage.tsx", import.meta.url), "utf8");
    expect(source).toContain("contactTypeVisuals");
    expect(source).toContain("customer: { icon: UserRound");
    expect(source).toContain("grocery: { icon: Store");
    expect(source).toContain("supplier: { icon: Truck");
    expect(source).toContain("employee: { icon: BriefcaseBusiness");
    expect(source).toContain("other: { icon: Landmark");
    expect(source).toContain("visual.badgeClass");
  });
});
