import { createBackupSnapshot, isSupportedBackupPayload, listBackupSnapshots } from "../server/accounting.ts";
import { storageGetSignedUrl } from "../server/storage.ts";

const ownerUserId = 1;
const created = await createBackupSnapshot(ownerUserId);
const snapshots = await listBackupSnapshots();
const snapshot = snapshots.find(item => item.id === created.id);

if (!snapshot) throw new Error("لم تُسجل النسخة الاحتياطية الجديدة في قاعدة البيانات");
if (!snapshot.storageKey || !snapshot.sizeBytes || Number(snapshot.sizeBytes) <= 0) throw new Error("بيانات ملف النسخة الاحتياطية غير مكتملة");

const downloadUrl = await storageGetSignedUrl(snapshot.storageKey);
const response = await fetch(downloadUrl);
if (!response.ok) throw new Error(`تعذر تنزيل النسخة الاحتياطية: ${response.status}`);
const payload = await response.json();
if (!isSupportedBackupPayload(payload)) throw new Error("ملف النسخة الاحتياطية المُنزّل لا يطابق البنية المعتمدة");

console.log(JSON.stringify({
  ok: true,
  snapshotId: created.id,
  fileName: created.fileName,
  sizeBytes: snapshot.sizeBytes,
  generatedAt: created.generatedAt,
  tableCounts: Object.fromEntries(Object.entries(payload.data).map(([name, rows]) => [name, rows.length])),
}, null, 2));
