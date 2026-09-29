import { describe, expect, it } from "vitest";
import { AUTOMATIC_BACKUP_RETENTION_DAYS, DAILY_BACKUP_CRON, DAILY_BACKUP_TIME_LABEL, automaticBackupRetentionCutoff, shouldPruneBackup, yemenRunDate } from "./dailyBackup";

describe("النسخ الاحتياطي اليومي", () => {
  it("يحوّل 12:05 بعد منتصف الليل بتوقيت اليمن إلى 21:05 UTC في اليوم السابق", () => {
    expect(DAILY_BACKUP_CRON).toBe("0 5 21 * * *");
    expect(DAILY_BACKUP_TIME_LABEL).toContain("12:05");
  });

  it("يعطي تاريخ اليمن الصحيح عند عبور منتصف الليل", () => {
    expect(yemenRunDate(new Date("2026-08-18T22:30:00.000Z"))).toBe("2026-08-19");
  });

  it("يحتفظ بالنسخ التلقائية لمدة 90 يوماً ولا يطبق السياسة على المصدر اليدوي أو الوقائي", () => {
    expect(AUTOMATIC_BACKUP_RETENTION_DAYS).toBe(90);
    expect(automaticBackupRetentionCutoff(new Date("2026-08-21T00:00:00.000Z")).toISOString()).toBe("2026-05-23T00:00:00.000Z");
    const now = new Date("2026-08-21T00:00:00.000Z");
    const expired = new Date("2026-05-22T23:59:59.000Z");
    expect(shouldPruneBackup("automatic", expired, now)).toBe(true);
    expect(shouldPruneBackup("manual", expired, now)).toBe(false);
    expect(shouldPruneBackup("protective", expired, now)).toBe(false);
  });
});
