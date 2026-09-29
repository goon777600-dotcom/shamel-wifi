import { and, eq, inArray, lt } from "drizzle-orm";
import type { Request, Response } from "express";
import { backupScheduleRuns, backupSchedules, backupSnapshots } from "../drizzle/schema";
import { createBackupSnapshot } from "./accounting";
import { getDb } from "./db";
import { sdk } from "./_core/sdk";

export const DAILY_BACKUP_CRON = "0 5 21 * * *";
export const DAILY_BACKUP_TIME_LABEL = "12:05 بعد منتصف الليل بتوقيت اليمن";
export const AUTOMATIC_BACKUP_RETENTION_DAYS = 90;

export function yemenRunDate(now = new Date()) {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function automaticBackupRetentionCutoff(now = new Date()) {
  return new Date(now.getTime() - AUTOMATIC_BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export function shouldPruneBackup(source: "manual" | "automatic" | "protective", createdAt: Date, now = new Date()) {
  return source === "automatic" && createdAt < automaticBackupRetentionCutoff(now);
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  return db;
}

export async function pruneExpiredAutomaticBackups(now = new Date()) {
  const db = await requireDb();
  const cutoff = automaticBackupRetentionCutoff(now);
  const candidates = await db.select({ id: backupSnapshots.id, source: backupSnapshots.source, createdAt: backupSnapshots.createdAt }).from(backupSnapshots).where(lt(backupSnapshots.createdAt, cutoff));
  const expired = candidates.filter(snapshot => shouldPruneBackup(snapshot.source, snapshot.createdAt, now));
  if (!expired.length) return 0;
  await db.delete(backupSnapshots).where(inArray(backupSnapshots.id, expired.map(snapshot => snapshot.id)));
  return expired.length;
}

export async function getDailyBackupSchedule(ownerUserId: number) {
  const db = await requireDb();
  const rows = await db.select().from(backupSchedules).where(eq(backupSchedules.createdByUserId, ownerUserId)).limit(1);
  return rows[0] ?? null;
}

export async function saveDailyBackupSchedule(input: { ownerUserId: number; cronTaskUid: string; isEnabled: boolean }) {
  const db = await requireDb();
  await db.insert(backupSchedules).values({
    createdByUserId: input.ownerUserId,
    cronTaskUid: input.cronTaskUid,
    cronExpression: DAILY_BACKUP_CRON,
    isEnabled: input.isEnabled,
  }).onDuplicateKeyUpdate({
    set: { cronTaskUid: input.cronTaskUid, cronExpression: DAILY_BACKUP_CRON, isEnabled: input.isEnabled, lastError: null },
  });
  return getDailyBackupSchedule(input.ownerUserId);
}

export async function setDailyBackupEnabled(ownerUserId: number, isEnabled: boolean) {
  const db = await requireDb();
  await db.update(backupSchedules).set({ isEnabled }).where(eq(backupSchedules.createdByUserId, ownerUserId));
  return getDailyBackupSchedule(ownerUserId);
}

export async function runScheduledDailyBackup(taskUid: string) {
  const db = await requireDb();
  const scheduleRows = await db.select().from(backupSchedules).where(and(eq(backupSchedules.cronTaskUid, taskUid), eq(backupSchedules.isEnabled, true))).limit(1);
  const schedule = scheduleRows[0];
  if (!schedule) return { ok: true, skipped: "schedule_not_found_or_disabled" as const };

  const runDate = yemenRunDate();
  let run = (await db.select().from(backupScheduleRuns).where(and(eq(backupScheduleRuns.scheduleId, schedule.id), eq(backupScheduleRuns.runDate, runDate))).limit(1))[0];
  if (run?.status === "success" || run?.status === "running") return { ok: true, skipped: run.status as "success" | "running" };

  if (!run) {
    try {
      const result = await db.insert(backupScheduleRuns).values({ scheduleId: schedule.id, runDate, status: "running" });
      const runId = Number(result[0].insertId);
      run = (await db.select().from(backupScheduleRuns).where(eq(backupScheduleRuns.id, runId)).limit(1))[0];
    } catch {
      run = (await db.select().from(backupScheduleRuns).where(and(eq(backupScheduleRuns.scheduleId, schedule.id), eq(backupScheduleRuns.runDate, runDate))).limit(1))[0];
      if (!run || run.status === "success" || run.status === "running") return { ok: true, skipped: "duplicate" as const };
      await db.update(backupScheduleRuns).set({ status: "running", error: null, startedAt: new Date(), finishedAt: null }).where(eq(backupScheduleRuns.id, run.id));
    }
  } else {
    await db.update(backupScheduleRuns).set({ status: "running", error: null, startedAt: new Date(), finishedAt: null }).where(eq(backupScheduleRuns.id, run.id));
  }

  await db.update(backupSchedules).set({ lastRunAt: new Date(), lastError: null }).where(eq(backupSchedules.id, schedule.id));
  try {
    const snapshot = await createBackupSnapshot(schedule.createdByUserId, "automatic");
    const prunedCount = await pruneExpiredAutomaticBackups();
    await db.transaction(async tx => {
      await tx.update(backupScheduleRuns).set({ status: "success", snapshotId: snapshot.id, finishedAt: new Date(), error: null }).where(and(eq(backupScheduleRuns.scheduleId, schedule.id), eq(backupScheduleRuns.runDate, runDate)));
      await tx.update(backupSchedules).set({ lastSuccessAt: new Date(), lastSuccessDate: runDate, lastError: null }).where(eq(backupSchedules.id, schedule.id));
    });
    return { ok: true, snapshotId: snapshot.id, runDate, prunedCount };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 4000) : String(error).slice(0, 4000);
    await db.transaction(async tx => {
      await tx.update(backupScheduleRuns).set({ status: "failed", error: message, finishedAt: new Date() }).where(and(eq(backupScheduleRuns.scheduleId, schedule.id), eq(backupScheduleRuns.runDate, runDate)));
      await tx.update(backupSchedules).set({ lastError: message }).where(eq(backupSchedules.id, schedule.id));
    });
    throw new Error(message);
  }
}

export async function scheduledDailyBackupHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const result = await runScheduledDailyBackup(user.taskUid);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message, timestamp: new Date().toISOString() });
  }
}
