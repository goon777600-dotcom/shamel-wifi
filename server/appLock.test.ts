import "dotenv/config";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { APP_LOCK_TOKEN_HEADER, canAttemptAppLock, clearFailedAppLockAttempts, createAppLockSessionToken, isAppLockRequestUnlocked, isAppLockSessionValid, recordFailedAppLockAttempt, resetAppLockAttemptStateForTests, verifyAppLockPassword } from "./appLock";

describe("واجهة التحقق الخفيفة لقفل التطبيق", () => {
  it("يوقف التخمين بعد خمس محاولات خاطئة ويتيح القفل بعد انتهاء المهلة", () => {
    resetAppLockAttemptStateForTests();
    const now = 1_000;
    for (let attempt = 0; attempt < 24; attempt += 1) expect(recordFailedAppLockAttempt("test-device", now)).toEqual({ blocked: false });
    expect(recordFailedAppLockAttempt("test-device", now)).toEqual({ blocked: true });
    expect(canAttemptAppLock("test-device", now)).toBe(false);
    expect(canAttemptAppLock("test-device", now + 16 * 1000)).toBe(true);
    clearFailedAppLockAttempts("test-device");
  });

  it("تقبل السر المقدم في البيئة وترفض كلمة مرور مختلفة", () => {
    const configuredPassword = process.env.APP_LOCK_PASSWORD;
    expect(configuredPassword).toBeTruthy();
    expect(verifyAppLockPassword(configuredPassword)).toEqual({ ok: true });
    expect(verifyAppLockPassword(`${configuredPassword}-wrong`)).toEqual({ ok: false, reason: "invalid" });
  });

  it("ينشئ جلسة قفل موقعة ويرفض رمزاً معدلاً", async () => {
    const token = await createAppLockSessionToken();
    expect(await isAppLockSessionValid(token)).toBe(true);
    expect(await isAppLockSessionValid(`${token}x`)).toBe(false);
  });

  it("لا يفتح الإجراء المحمي إلا برمز القفل الموقّع عند حجب الكوكي", async () => {
    const token = await createAppLockSessionToken();
    const requestWithFallbackHeader = {
      headers: {},
      header: (name: string) => name === APP_LOCK_TOKEN_HEADER ? token : undefined,
    } as unknown as Request;
    const requestWithInvalidHeader = {
      headers: {},
      header: () => `${token}x`,
    } as unknown as Request;

    expect(await isAppLockRequestUnlocked(requestWithFallbackHeader)).toBe(true);
    expect(await isAppLockRequestUnlocked(requestWithInvalidHeader)).toBe(false);
  });
});
