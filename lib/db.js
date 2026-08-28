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
  settings: {
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
    hourlyRate: 25,
    electricityRatePerKwh: 0.15,
    defaultMarginPercent: 30,
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

function readAll() {
  ensureFile();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    // backfill any missing top-level collections
    return { ...DEFAULT_DATA, ...parsed };
  } catch (err) {
    console.error('db.json is corrupt, resetting to defaults:', err.message);
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
    return { ...DEFAULT_DATA };
  }
}

// Serialize writes so two near-simultaneous requests don't race on the file.
let writeChain = Promise.resolve();
function writeAll(data) {
  writeChain = writeChain.then(
    () =>
      new Promise((resolve, reject) => {
        fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), (err) => {
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
  const record = { id: newId(), createdAt: new Date().toISOString(), ...obj };
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
  arr[idx] = { ...arr[idx], ...patch, id, updatedAt: new Date().toISOString() };
  await writeAll(data);
  return arr[idx];
}

async function remove(collection, id) {
  const data = readAll();
  const arr = data[collection] || [];
  const idx = arr.findIndex((item) => item.id === id);
  if (idx === -1) return false;
  arr.splice(idx, 1);
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

module.exports = {
  list, get, create, update, remove, readAll, writeAll, newId,
  getSettings, updateSettings,
};
