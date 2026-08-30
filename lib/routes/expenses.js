// lib/routes/expenses.js
// Expenses reuse the generic list/get/remove behavior (re-implemented
// directly against db here, rather than depending on lib/api.js's table
// factory, so this module has no dependency on the router core), but
// create/update are intercepted for receipt handling: receipts are
// uploaded as base64 data URLs, validated (image or PDF, up to 3 files at
// 5 MB each - this endpoint is reachable directly by anyone with the app's
// credentials, so the same rule the New Expense drawer enforces
// client-side has to be re-checked here), then written to disk under
// data/uploads/receipts/ instead of staying inline as base64 in db.json.
// Inline base64 was simple but meant every read/write of the *entire*
// database (including a "Delete all data" backup snapshot) had to
// serialize every receipt ever uploaded, every time - that only gets
// worse as receipts accumulate. A record's receipts array now holds
// `{ name, type, size, url }` pointing at a real file; server.js serves
// those back under /uploads/ (auth-gated, same as the rest of the app).

// Uses fs.promises (not the sync fs API) throughout - these run on every
// expense create/update, so a sync write/unlink would block the whole
// single-threaded event loop, stalling every other in-flight request, for
// however long that particular disk write takes.
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');
const { send, notFound, exposedError, readBody, clip } = require('./helpers');

const RECEIPT_MAX_FILES = 3;
const RECEIPT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const RECEIPT_MIME_RE = /^data:(image\/png|image\/jpeg|image\/webp|image\/gif|application\/pdf);base64,/;
const RECEIPT_EXT = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp',
  'image/gif': '.gif', 'application/pdf': '.pdf',
};
// Generous but bounded: 3 files x 5MB raw, plus ~33% base64 inflation, plus
// a little headroom for the rest of the JSON body.
const EXPENSE_BODY_MAX_BYTES = 22_000_000;

const UPLOADS_DIR = path.join(db.getDataDir(), 'uploads', 'receipts');
const RECEIPT_URL_RE = /^\/uploads\/receipts\/([A-Za-z0-9._-]+)$/;

async function fileExists(fullPath) {
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

// Turns the client's incoming receipts array into the shape that actually
// gets stored: each entry either arrives as a brand-new upload (`dataUrl`
// set - gets validated, written to disk, and replaced with a `url`) or as
// an unchanged existing receipt (`url` set, carried over from what was
// already on the record - re-validated as a real, existing file under
// UPLOADS_DIR so a crafted body can't point this at an arbitrary path).
// `oldReceipts` (the record's receipts before this save, [] on create) is
// used afterward to best-effort delete any files that are no longer
// referenced - e.g. the user removed a receipt in the edit drawer.
//
// Processed sequentially (not Promise.all) rather than in parallel - up to
// 3 files, so there's nothing to gain from parallelizing, and sequential
// means the first invalid receipt fails fast without writing files for
// receipts after it that would just get cleaned up anyway.
async function processReceipts(receipts, oldReceipts) {
  if (receipts == null) receipts = [];
  if (!Array.isArray(receipts)) throw exposedError('Receipts must be a list');
  if (receipts.length > RECEIPT_MAX_FILES) throw exposedError(`Up to ${RECEIPT_MAX_FILES} receipts allowed`);

  const result = [];
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];
    const name = clip(r && r.name, 200) || `Receipt ${i + 1}`;

    if (r && typeof r.dataUrl === 'string' && r.dataUrl) {
      const match = RECEIPT_MIME_RE.exec(r.dataUrl);
      if (!match) throw exposedError(`"${name}" must be an image or PDF`);
      const type = match[1];
      const base64 = r.dataUrl.slice(match[0].length);
      const bytes = Buffer.byteLength(base64, 'base64');
      if (bytes > RECEIPT_MAX_BYTES) throw exposedError(`"${name}" is over the 5 MB limit`);
      await fs.mkdir(UPLOADS_DIR, { recursive: true });
      const filename = crypto.randomUUID() + (RECEIPT_EXT[type] || '');
      await fs.writeFile(path.join(UPLOADS_DIR, filename), Buffer.from(base64, 'base64'));
      result.push({ name, type, size: bytes, url: `/uploads/receipts/${filename}` });
      continue;
    }

    if (r && typeof r.url === 'string' && r.url) {
      const match = RECEIPT_URL_RE.exec(r.url);
      if (!match || !(await fileExists(path.join(UPLOADS_DIR, match[1])))) {
        throw exposedError(`"${name}" references a receipt file that no longer exists`);
      }
      result.push({ name, type: clip(r.type, 100), size: Number(r.size) || 0, url: r.url });
      continue;
    }

    throw exposedError(`"${name}" is missing its file data`);
  }

  // Best-effort cleanup of files that were on the record before this save
  // but aren't referenced by the new list (removed in the edit drawer, or
  // replaced by a fresh upload with the same slot). Never blocks the
  // response on a cleanup failure - a stray orphaned file on disk is a
  // much smaller problem than an expense edit silently failing to save.
  const keptUrls = new Set(result.map((r) => r.url));
  for (const old of oldReceipts || []) {
    if (old && old.url && !keptUrls.has(old.url)) {
      const match = RECEIPT_URL_RE.exec(old.url);
      if (match) {
        try { await fs.unlink(path.join(UPLOADS_DIR, match[1])); } catch { /* already gone, or never existed - fine */ }
      }
    }
  }

  return result;
}

// Deletes every receipt file a record references, with no diffing - used
// when an expense is purged permanently from the trash (see
// lib/routes/data.js), at which point nothing else could possibly still
// reference those files.
async function deleteReceiptFiles(receipts) {
  for (const r of receipts || []) {
    if (!r || typeof r.url !== 'string') continue;
    const match = RECEIPT_URL_RE.exec(r.url);
    if (!match) continue;
    try { await fs.unlink(path.join(UPLOADS_DIR, match[1])); } catch { /* already gone - fine */ }
  }
}

async function handleCreate(req, res) {
  const body = await readBody(req, EXPENSE_BODY_MAX_BYTES);
  body.receipts = await processReceipts(body.receipts, []);
  const created = await db.create('expenses', body);
  send(res, 201, created);
}

async function handleUpdate(req, res, id) {
  const existing = db.get('expenses', id);
  if (!existing) return notFound(res);
  const body = await readBody(req, EXPENSE_BODY_MAX_BYTES);
  body.receipts = await processReceipts(body.receipts, existing.receipts);
  const updated = await db.update('expenses', id, body);
  if (!updated) return notFound(res);
  send(res, 200, updated);
}

async function tryHandle(ctx) {
  if (ctx.collection !== 'expenses') return false;
  const { req, res, idOrAction, method } = ctx;

  if (!idOrAction) {
    if (method === 'GET') { send(res, 200, db.list('expenses')); return true; }
    if (method === 'POST') { await handleCreate(req, res); return true; }
    notFound(res);
    return true;
  }

  if (method === 'GET') {
    const item = db.get('expenses', idOrAction);
    if (!item) notFound(res); else send(res, 200, item);
    return true;
  }
  if (method === 'PUT' || method === 'PATCH') { await handleUpdate(req, res, idOrAction); return true; }
  if (method === 'DELETE') {
    const ok = await db.remove('expenses', idOrAction);
    if (!ok) notFound(res); else send(res, 204, null);
    return true;
  }

  notFound(res);
  return true;
}

module.exports = { tryHandle, deleteReceiptFiles };
