// lib/routes/data.js
// Whole-dataset operations: reset ("Delete all data"), the random test
// data generator, backup listing/restore (Settings > Danger Zone), and the
// recycle bin (Settings > Data > Recently deleted). None of these are
// per-record CRUD, so they live outside the generic collection dispatch.

const db = require('../db');
const { generateRandomTestData } = require('../randomSeed');
const { deleteReceiptFiles } = require('./expenses');
const { send, notFound, readBody } = require('./helpers');

async function tryHandle(ctx) {
  const { collection, idOrAction, subAction, method } = ctx;

  if (collection === 'data' && idOrAction === 'reset' && method === 'POST') {
    // resetData() snapshots db.json to data/backups/ before wiping - see
    // lib/db.js - so this real, user-facing "Delete all data" button
    // stays recoverable even though it's a genuine irreversible-from-the-
    // UI action.
    await db.resetData();
    send(ctx.res, 200, { ok: true });
    return true;
  }

  if (collection === 'data' && idOrAction === 'seed-random' && method === 'POST') {
    const counts = await generateRandomTestData();
    send(ctx.res, 200, { ok: true, counts });
    return true;
  }

  if (collection === 'data' && idOrAction === 'backups' && !subAction && method === 'GET') {
    send(ctx.res, 200, db.listBackups());
    return true;
  }

  if (collection === 'data' && idOrAction === 'backups' && subAction === 'restore' && method === 'POST') {
    const body = await readBody(ctx.req);
    await db.restoreBackup(body.file);
    send(ctx.res, 200, { ok: true });
    return true;
  }

  // ---------- Recycle bin ----------
  // Every DELETE across every collection is trashed, not discarded
  // outright - see db.remove(). These routes surface that for Settings >
  // Data's "Recently deleted" list.
  if (collection === 'trash' && !idOrAction && method === 'GET') {
    send(ctx.res, 200, db.listTrash());
    return true;
  }
  if (collection === 'trash' && !idOrAction && method === 'DELETE') {
    await db.emptyTrash();
    send(ctx.res, 200, { ok: true });
    return true;
  }
  if (collection === 'trash' && idOrAction && subAction === 'restore' && method === 'POST') {
    const restored = await db.restoreTrashItem(idOrAction);
    send(ctx.res, 200, restored);
    return true;
  }
  if (collection === 'trash' && idOrAction && !subAction && method === 'DELETE') {
    // Look the entry up before purging it - if it's an expense, its
    // receipt files are about to become truly unreferenced (unlike a plain
    // soft-delete, a purge can't be undone by restoring), so this is the
    // one point where deleting them outright is safe.
    const entry = db.listTrash().find((t) => t.id === idOrAction);
    const ok = await db.purgeTrashItem(idOrAction);
    if (!ok) { notFound(ctx.res); return true; }
    if (entry && entry.collection === 'expenses') await deleteReceiptFiles(entry.record.receipts);
    send(ctx.res, 204, null);
    return true;
  }

  return false;
}

module.exports = { tryHandle };
