// lib/db.js
// Minimal JSON-file-backed data store. No external dependencies.
// Good enough for a single-user / small-shop local app. Writes are
// serialized through an in-process queue so concurrent requests can't
// clobber the file.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// DATA_DIR can be overridden with an env var so hosting platforms that
// provide a persistent volume at a fixed mount path (Railway, Fly.io, etc.)
// can point storage there instead of the app's own folder, which is wiped
// on every redeploy.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_BACKUPS = 20;

// Exposed so other modules (server.js's upload static-file server,
// lib/routes/expenses.js's receipt file storage) can build paths under the
// same data directory without re-deriving the DATA_DIR env var logic
// themselves.
function getDataDir() {
  return DATA_DIR;
}

// Snapshots the current db.json into data/backups/ before a destructive
// operation (currently just resetData()). Keeps the most recent
// MAX_BACKUPS and prunes older ones. Best-effort: a backup failure logs a
// warning but never blocks the caller, since refusing to let someone use
// "Delete all data" because a backup copy failed would be its own kind of
// data-loss risk (they'd have no way to clear stuck/bad data).
function backupDbFile(label) {
  try {
    if (!fs.existsSync(DB_FILE)) return;
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(BACKUP_DIR, `db-${stamp}${label ? '-' + label : ''}.json`);
    fs.copyFileSync(DB_FILE, dest);
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('db-') && f.endsWith('.json'))
      .sort(); // ISO timestamps sort chronologically as strings
    const excess = files.length - MAX_BACKUPS;
    for (let i = 0; i < excess; i++) fs.unlinkSync(path.join(BACKUP_DIR, files[i]));
  } catch (err) {
    console.warn('Backup before destructive data op failed (continuing anyway):', err.message);
  }
}

// ---------- Schema back-compat ----------
// Fields get renamed/restructured as the app evolves (maintenance schedules
// moved from a single intervalDays to intervalType+intervalValue; product
// variants gained their own quantity instead of one product-level stock
// total). Old-shaped records are normalized to the current shape once,
// here, right after they're read off disk - every caller (list/get/create/
// update, and everything downstream in lib/api.js and the frontend) then
// only ever sees the current shape. This used to be handled ad hoc, with
// each page-*.js file that touched a given field writing its own
// `existing.newField ?? existing.oldField` fallback - which is exactly how
// a product-stock display bug briefly shipped (the one page that read
// variants forgot the fallback other pages had). One normalizer per
// collection, added here when a schema changes, replaces that pattern.
const NORMALIZERS = {
  maintenanceSchedules: (s) => {
    if (s.intervalType != null) return s; // already current shape
    return {
      ...s,
      intervalType: s.intervalDays != null ? 'days' : 'print_hours',
      intervalValue: s.intervalDays,
    };
  },
  products: (p) => {
    const variants = p.variants || [];
    const anyHasQty = variants.some((v) => v.quantity != null);
    if (anyHasQty || !variants.length) return p;
    // Old shape: variants only had {name, sku}; the real count lived in a
    // product-level `stock` field. The true per-variant split isn't
    // knowable, so the whole known quantity goes on the first variant
    // rather than silently reporting 0.
    return {
      ...p,
      variants: variants.map((v, i) => ({
        priceOverride: '', lowStockThreshold: '', ...v,
        quantity: i === 0 ? (Number(p.stock) || 0) : 0,
      })),
    };
  },
};

function normalizeCollections(data) {
  for (const key of Object.keys(NORMALIZERS)) {
    if (Array.isArray(data[key])) data[key] = data[key].map(NORMALIZERS[key]);
  }
  return data;
}

const DEFAULT_DATA = {
  customers: [],
  quotes: [],
  orders: [],
  invoices: [],
  printers: [],
  maintenanceSchedules: [],
  maintenanceLog: [],
  spools: [],
  products: [],
  inventoryItems: [],
  expenses: [],
  // Submissions from the public, unauthenticated /request intake form (see
  // server.js's PUBLIC_PATHS and lib/api.js's "public" routes). Reviewed
  // internally on the Requests page and converted into a real Quote.
  quoteRequests: [],
  // Rolling recycle bin - see remove() below. Every record deleted through
  // the normal DELETE routes (any collection) lands here before it's gone
  // for good, so a single accidental delete isn't an unrecoverable data
  // loss the way "Delete all data" used to be before backups existed.
  trash: [],
  settings: {
    yourName: '',
    workspaceName: 'My Print Shop',
    contactEmail: '',
    contactPhone: '',
    identifierLabel: 'CoC (default)',
    currency: 'USD',
    country: 'United States',
    timezone: 'America/New_York',
    dateFormat: 'Auto (from country)',
    numberFormat: 'Auto (from country)',
    quoteNumberPrefix: 'Q-',
    orderNumberPrefix: 'O-',
    invoiceNumberPrefix: 'INV-',
    customerNumberPrefix: 'C-',
    filamentNumberPrefix: 'SP-',
    hourlyRate: 25,
    electricityRatePerKwh: 0.15,
    defaultMarginPercent: 30,
    defaultWastePercent: 0,
    defaultOverheadPercent: 0,
    // Stored as basis points (2000 = 20.00%) so tax math never has to deal
    // with floating point percentages internally. The Settings UI converts
    // to/from a plain percentage for display.
    defaultTaxBasisPoints: 0,
    brandName: 'JustPrintIt',
    brandIconUrl: '',
    // Visual theme customization (Settings > Appearance). accentColor is a
    // hex string that overrides the --accent-brand CSS variable when set;
    // empty string means "use the built-in default look".
    accentColor: '',
    fontFamily: '', // CSS font-family stack override; empty means "use the built-in system font"
    density: 'comfortable', // 'comfortable' | 'compact'
    defaultTheme: 'system', // 'light' | 'dark' | 'system' - fallback when the browser has no saved per-device override
    defaultSidebarCollapsed: false,
  },
};

// db.json itself is gitignored (see .gitignore) so it's never touched by a
// `git pull` - it's your live data, not part of the codebase. This example
// file IS checked into git and only used to bootstrap a brand new install
// (fresh clone, or DATA_DIR pointed at an empty volume) with starter data.
const EXAMPLE_FILE = path.join(__dirname, '..', 'data', 'db.example.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    if (fs.existsSync(EXAMPLE_FILE)) {
      fs.copyFileSync(EXAMPLE_FILE, DB_FILE);
    } else {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
    }
  }
}

// In-memory cache of the parsed db.json. Every API request used to call
// readAll() several times (once per collection it touched), and each call
// did a synchronous disk read + JSON.parse of the *entire* file - on a
// single-threaded Node process that blocks every other in-flight request
// too. A single page load (Dashboard) could trigger 20+ of these. Caching
// the parsed object in memory turns that into one read for the whole
// process lifetime; create/update/remove mutate the cached object in place
// (see below) so it never goes stale, and writeAll() persists it to disk.
let cache = null;

function readAll() {
  if (cache) return cache;
  ensureFile();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    // backfill any missing top-level collections
    cache = normalizeCollections({ ...DEFAULT_DATA, ...parsed });
  } catch (err) {
    console.error('db.json is corrupt, resetting to defaults:', err.message);
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
    cache = { ...DEFAULT_DATA };
  }
  return cache;
}

// Serialize writes so two near-simultaneous requests don't race on the file.
let writeChain = Promise.resolve();
function writeAll(data) {
  cache = data; // keep the in-memory cache authoritative immediately
  writeChain = writeChain.then(
    () =>
      new Promise((resolve, reject) => {
        // Compact, not pretty-printed: writeAll() runs on every single
        // create/update/remove, and this serializes + writes the *entire*
        // database every time (there's no partial-write with one JSON
        // file). Pretty-printing (the old `null, 2` indentation) roughly
        // doubles both the stringify cost and the bytes written for no
        // functional benefit - nobody's meant to hand-read db.json day to
        // day. db.example.json (the one file people actually do open in an
        // editor, to see what a fresh install ships with) keeps its
        // pretty-printing - see the seed script / scripts/ for that.
        fs.writeFile(DB_FILE, JSON.stringify(data), (err) => {
          if (err) reject(err);
          else resolve();
        });
      })
  );
  return writeChain;
}

function newId() {
  return crypto.randomUUID();
}

function list(collection) {
  const data = readAll();
  return data[collection] || [];
}

function get(collection, id) {
  return list(collection).find((item) => item.id === id) || null;
}

async function create(collection, obj) {
  const data = readAll();
  // id/createdAt go LAST in the spread so a caller-supplied value (the
  // generic CRUD routes pass the raw request body straight through) can
  // never override the server-generated ones - otherwise a client could
  // hand us an existing record's id and end up with two records sharing
  // one id, silently shadowing the original in every id-keyed lookup.
  const record = { ...obj, id: newId(), createdAt: new Date().toISOString() };
  data[collection] = data[collection] || [];
  data[collection].push(record);
  await writeAll(data);
  return record;
}

async function update(collection, id, patch) {
  const data = readAll();
  const arr = data[collection] || [];
  const idx = arr.findIndex((item) => item.id === id);
  if (idx === -1) return null;
  // Same reasoning as create(): id and createdAt are pinned to the
  // existing record's values so a stray field in the patch body can't
  // rewrite either one.
  arr[idx] = { ...arr[idx], ...patch, id, createdAt: arr[idx].createdAt, updatedAt: new Date().toISOString() };
  await writeAll(data);
  return arr[idx];
}

const MAX_TRASH = 200;

// Deletes a record from `collection`, but snapshots it into data.trash
// first (see listTrash()/restoreTrashItem() below) rather than just
// discarding it. This is the one function every DELETE route in the app
// goes through - the generic per-collection routes in lib/api.js's
// crudRoutes() all call db.remove(), and so does every dedicated page's
// delete handler - so hooking in here covers every collection's delete
// automatically, with no per-page changes needed.
async function remove(collection, id) {
  const data = readAll();
  const arr = data[collection] || [];
  const idx = arr.findIndex((item) => item.id === id);
  if (idx === -1) return false;
  const [removedRecord] = arr.splice(idx, 1);
  data.trash = data.trash || [];
  data.trash.push({ id: newId(), collection, record: removedRecord, deletedAt: new Date().toISOString() });
  if (data.trash.length > MAX_TRASH) data.trash = data.trash.slice(data.trash.length - MAX_TRASH);
  await writeAll(data);
  return true;
}

// Newest first, for the Settings > Data "Recently deleted" list.
function listTrash() {
  const data = readAll();
  return (data.trash || []).slice().sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

// Puts a deleted record back into its original collection with its
// original id intact (so anything that referenced it - e.g. a maintenance
// schedule's printerId - re-links automatically). Refuses if something has
// since taken that same id (astronomically unlikely with UUIDs, but cheap
// to guard against silently clobbering a record).
async function restoreTrashItem(trashId) {
  const data = readAll();
  const trash = data.trash || [];
  const idx = trash.findIndex((t) => t.id === trashId);
  if (idx === -1) throw Object.assign(new Error('Unknown trash item'), { expose: true, statusCode: 400 });
  const entry = trash[idx];
  data[entry.collection] = data[entry.collection] || [];
  if (data[entry.collection].some((x) => x.id === entry.record.id)) {
    throw Object.assign(new Error('A record with this id already exists - cannot restore'), { expose: true, statusCode: 409 });
  }
  data[entry.collection].push(entry.record);
  trash.splice(idx, 1);
  await writeAll(data);
  return entry.record;
}

// Permanently discards one trash entry without restoring it.
async function purgeTrashItem(trashId) {
  const data = readAll();
  const trash = data.trash || [];
  const idx = trash.findIndex((t) => t.id === trashId);
  if (idx === -1) return false;
  trash.splice(idx, 1);
  await writeAll(data);
  return true;
}

async function emptyTrash() {
  const data = readAll();
  data.trash = [];
  await writeAll(data);
  return true;
}

function getSettings() {
  const data = readAll();
  return data.settings || DEFAULT_DATA.settings;
}

async function updateSettings(patch) {
  const data = readAll();
  data.settings = { ...DEFAULT_DATA.settings, ...data.settings, ...patch };
  await writeAll(data);
  return data.settings;
}

// Wipes every record collection (customers, quotes, orders, etc.) back to
// empty so the user can walk through the "get started" checklist with a
// clean slate. Settings (business info, rates, prefixes) are left alone -
// those are workspace configuration, not test data.
async function resetData() {
  backupDbFile('before-reset');
  const data = readAll();
  for (const key of Object.keys(DEFAULT_DATA)) {
    if (key === 'settings') continue;
    data[key] = [];
  }
  await writeAll(data);
  return true;
}

// Lists snapshots written by backupDbFile(), newest first, for the
// Settings > Danger Zone "Restore from backup" list.
function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('db-') && f.endsWith('.json'))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { file: f, createdAt: stat.mtime.toISOString(), sizeBytes: stat.size };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Restores db.json from one of the snapshots in data/backups/. `file` must
// be exactly one of the names returned by listBackups() - it's checked
// against that list (not just pattern-matched) so a crafted filename can
// never escape BACKUP_DIR. The current state is snapshotted first, so
// restoring is itself undoable by restoring again.
async function restoreBackup(file) {
  const known = listBackups();
  const match = known.find((b) => b.file === file);
  if (!match) throw Object.assign(new Error('Unknown backup file'), { expose: true, statusCode: 400 });
  backupDbFile('before-restore');
  fs.copyFileSync(path.join(BACKUP_DIR, file), DB_FILE);
  // Force the next readAll() to re-read and re-normalize from disk - the
  // in-memory cache still holds the pre-restore data otherwise, so a
  // running server would keep serving stale data until it was restarted.
  cache = null;
  return true;
}

module.exports = {
  list, get, create, update, remove, readAll, writeAll, newId, getDataDir,
  getSettings, updateSettings, resetData, listBackups, restoreBackup,
  listTrash, restoreTrashItem, purgeTrashItem, emptyTrash,
};
