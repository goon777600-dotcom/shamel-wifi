import { listBackupSnapshots, restoreBackupSnapshot } from "../server/accounting.ts";

const ownerUserId = 1;
const snapshotsBefore = await listBackupSnapshots();
const snapshotToRestore = snapshotsBefore.find(item => item.id === 1);
if (!snapshotToRestore) throw new Error("لم يتم العثور على نسخة التدقيق الأولى لاستعادتها");

const result = await restoreBackupSnapshot(ownerUserId, snapshotToRestore.id);
const snapshotsAfter = await listBackupSnapshots();
const protectiveSnapshot = snapshotsAfter.find(item => item.fileName === result.protectiveSnapshot);

if (!protectiveSnapshot) throw new Error("لم تُنشأ نسخة وقائية قبل الاستعادة");
console.log(JSON.stringify({
  ok: true,
  restoredSnapshot: result.fileName,
  protectiveSnapshot: result.protectiveSnapshot,
  snapshotCountBefore: snapshotsBefore.length,
  snapshotCountAfter: snapshotsAfter.length,
}, null, 2));
