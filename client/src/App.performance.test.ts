import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("تحميل صفحات التطبيق", () => {
  it("يفصل صفحات الحسابات عن ملف التحميل الأولي", async () => {
    const source = await readFile(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain('const AccountingDashboard = lazy(() => import("@/pages/AccountingDashboard"));');
    expect(source).toContain('const IndividualSubscriptionsPage = lazy(() => import("@/pages/IndividualSubscriptionsPage"));');
    expect(source).toContain('const SettingsPage = lazy(() => import("@/pages/SettingsPage"));');
    expect(source).not.toContain('import AccountingDashboard from "@/pages/AccountingDashboard";');
  });
});
