import { sql } from "drizzle-orm";
import { currencies } from "../drizzle/schema.ts";
import { getDb } from "../server/db.ts";

const db = await getDb();
if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات لاختبار أقفال التزامن");

let releaseFirstTransaction;
const firstLockAcquired = new Promise(resolve => {
  globalThis.__resolveFirstLock = resolve;
});
const releaseFirstLock = new Promise(resolve => {
  releaseFirstTransaction = resolve;
});

const firstTransaction = db.transaction(async tx => {
  await tx.execute(sql`SELECT ${currencies.code} FROM ${currencies} WHERE ${currencies.code} = 'YER' FOR UPDATE`);
  globalThis.__resolveFirstLock();
  await releaseFirstLock;
});

await firstLockAcquired;
const secondStartedAt = Date.now();
const secondTransaction = db.transaction(async tx => {
  await tx.execute(sql`SELECT ${currencies.code} FROM ${currencies} WHERE ${currencies.code} = 'YER' FOR UPDATE`);
  return Date.now() - secondStartedAt;
});

await new Promise(resolve => setTimeout(resolve, 350));
releaseFirstTransaction();
const [, secondWaitMs] = await Promise.all([firstTransaction, secondTransaction]);

if (secondWaitMs < 250) throw new Error(`لم ينتظر القفل المتزامن المدة المتوقعة: ${secondWaitMs}ms`);
console.log(JSON.stringify({ ok: true, lockWaitMs: secondWaitMs }, null, 2));
