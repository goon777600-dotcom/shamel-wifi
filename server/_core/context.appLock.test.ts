import type { User } from "../../drizzle/schema";
import { describe, expect, it, vi } from "vitest";
import { getAppLockOwnerOpenId, resolveAppLockUser, shouldUseExistingAdminOwner } from "./context";

const owner: User = {
  id: 10,
  openId: "owner-open-id",
  name: "مالك الشامل",
  email: null,
  loginMethod: "app-lock",
  role: "admin",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

describe("حل هوية المالك بعد قفل التطبيق", () => {
  it("يستخدم هوية داخلية ثابتة عندما لا تُحقن هوية Manus في بيئة النشر", () => {
    expect(getAppLockOwnerOpenId(" ")).toBe("shamel-app-lock-owner");
    expect(getAppLockOwnerOpenId("owner-open-id")).toBe("owner-open-id");
    expect(shouldUseExistingAdminOwner(" ")).toBe(true);
    expect(shouldUseExistingAdminOwner("owner-open-id")).toBe(false);
  });

  it("يربط جلسة عامة مقفلة بحساب المالك فقط بعد تحقق القفل", async () => {
    const getOwner = vi.fn(async () => owner);
    await expect(resolveAppLockUser(null, true, getOwner)).resolves.toEqual(owner);
    expect(getOwner).toHaveBeenCalledTimes(1);
  });

  it("لا يخلق هوية مالك بدون قفل ولا يبدّل مستخدماً نظامياً موجوداً", async () => {
    const getOwner = vi.fn(async () => owner);
    await expect(resolveAppLockUser(null, false, getOwner)).resolves.toBeNull();
    await expect(resolveAppLockUser(owner, true, getOwner)).resolves.toEqual(owner);
    expect(getOwner).not.toHaveBeenCalled();
  });
});
