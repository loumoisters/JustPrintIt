#!/usr/bin/env node
// test/smoke.js
// Lightweight, dependency-free smoke test (no test framework - matches the
// rest of this project's zero-dependency approach). Spins up the real
// server against a scratch DATA_DIR created fresh under os.tmpdir() -
// NEVER the project's own data/ folder. That last point matters: a past
// incident cost real user data because a manual verification test
// accidentally ran against the live file instead of an isolated one, so
// this script goes out of its way to make that class of mistake
// impossible - DATA_DIR is always a brand new temp path, chosen here, not
// something a caller can override.
//
// Exercises create/edit/delete across every collection, the special-cased
// side effects (maintenance log -> schedule baseline, printer status
// fallback, old-schema record normalization, backup/reset/restore, the
// public quote-request intake route), and checks the responses have the
// shape they're supposed to.
//
// Run with: node test/smoke.js
// Exits 0 if everything passes, 1 otherwise.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 39217; // arbitrary, unlikely to collide with anything else running
const BASE = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pfm-smoke-'));

const results = [];
let serverProc = null;

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function req(method, urlPath, body) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch { /* non-JSON response, leave json null */ }
  }
  return { status: res.status, body: json, text };
}

function seedFile(data) {
  fs.writeFileSync(path.join(DATA_DIR, 'db.json'), JSON.stringify(data, null, 2));
}

function readFile() {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'db.json'), 'utf8'));
}

async function waitForServer(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(BASE + '/api/dashboard');
      if (res.status) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Server never came up on ' + BASE);
}

function startServer() {
  serverProc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, DATA_DIR, PORT: String(PORT), APP_PASSWORD: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  serverProc.stdout.on('data', (d) => { log += d; });
  serverProc.stderr.on('data', (d) => { log += d; });
  serverProc.__getLog = () => log;
}

function stopServer() {
  if (serverProc && !serverProc.killed) serverProc.kill();
}

// ---------- test cases ----------

// Generic CRUD round-trip for the collections that have no special-cased
// create/update behavior - covers customers, quotes, orders, invoices,
// spools, and inventoryItems.
async function testGenericCrud(collection, createBody, patchBody) {
  const create = await req('POST', `/api/${collection}`, createBody);
  assert(create.status === 201 && create.body && create.body.id, `create returned status ${create.status}, body: ${create.text}`);
  const id = create.body.id;

  const fetched = await req('GET', `/api/${collection}/${id}`);
  assert(fetched.status === 200 && fetched.body.id === id, 'GET after create mismatched or failed');

  const updated = await req('PUT', `/api/${collection}/${id}`, patchBody);
  assert(updated.status === 200, `update returned status ${updated.status}`);
  for (const [k, v] of Object.entries(patchBody)) {
    assert(JSON.stringify(updated.body[k]) === JSON.stringify(v), `patched field "${k}" didn't stick (got ${JSON.stringify(updated.body[k])})`);
  }

  const list = await req('GET', `/api/${collection}`);
  assert(list.status === 200 && Array.isArray(list.body) && list.body.some((x) => x.id === id), 'created record missing from list');

  const del = await req('DELETE', `/api/${collection}/${id}`);
  assert(del.status === 204, `delete returned status ${del.status}, expected 204`);

  const afterDelete = await req('GET', `/api/${collection}/${id}`);
  assert(afterDelete.status === 404, 'record still reachable after delete');
}

async function testPrinterCrudAndStatusFallback() {
  const created = await req('POST', '/api/printers', {
    name: 'Smoke Printer', model: 'Test Model', powerDrawWatts: 100,
    printHours: 10, machineCost: 500, lifespanPrintHours: 2000, notes: '',
  });
  assert(created.status === 201, `create returned ${created.status}`);
  assert(created.body.type === undefined, 'a printer created via the New Printer form should have no "type" field');

  const status = await req('GET', `/api/printers/${created.body.id}/status`);
  assert(status.status === 200 && status.body.online === true, `status should fall back to the mock adapter and report online, got ${status.text}`);

  const updated = await req('PUT', `/api/printers/${created.body.id}`, { printHours: 25 });
  assert(updated.body.printHours === 25, 'printHours edit did not stick');

  await req('DELETE', `/api/printers/${created.body.id}`);
}

async function testMaintenanceLogUpdatesScheduleBaseline() {
  const printer = (await req('POST', '/api/printers', { name: 'Smoke Printer 2', printHours: 77 })).body;
  const schedule = (await req('POST', '/api/maintenanceSchedules', {
    printerId: printer.id, task: 'Smoke schedule', intervalType: 'print_hours', intervalValue: 50, active: true,
  })).body;
  assert(schedule.lastServicePrintHours === undefined, 'fresh schedule should have no service baseline yet');

  const logRes = await req('POST', '/api/maintenanceLog', { scheduleId: schedule.id, printerId: printer.id, date: '2026-01-01' });
  assert(logRes.status === 201, `log create returned ${logRes.status}`);

  const after = (await req('GET', `/api/maintenanceSchedules/${schedule.id}`)).body;
  assert(after.lastServicePrintHours === 77, `baseline should pick up the printer's printHours (77), got ${after.lastServicePrintHours}`);
  assert(after.lastServicedAt === '2026-01-01', `lastServicedAt should match the log entry's date, got ${after.lastServicedAt}`);

  await req('DELETE', `/api/maintenanceSchedules/${schedule.id}`);
  await req('DELETE', `/api/printers/${printer.id}`);
}

async function testProductVariantCrud() {
  const created = await req('POST', '/api/products', {
    name: 'Smoke Widget', price: 25, sku: 'SW-1', fulfillmentMode: 'from_stock',
    variants: [
      { name: 'Red', quantity: 10, sku: 'SW-1-RED', priceOverride: '', lowStockThreshold: 2 },
      { name: 'Blue', quantity: 5, sku: 'SW-1-BLUE', priceOverride: 30, lowStockThreshold: 1 },
    ],
    calculatedCost: 8,
  });
  assert(created.status === 201, `create returned ${created.status}`);
  assert(created.body.variants.length === 2, 'variants did not round-trip');

  const updated = await req('PUT', `/api/products/${created.body.id}`, {
    variants: [{ name: 'Red', quantity: 12, sku: 'SW-1-RED', priceOverride: '', lowStockThreshold: 2 }],
  });
  assert(updated.body.variants.length === 1 && updated.body.variants[0].quantity === 12, 'variant edit did not stick');

  await req('DELETE', `/api/products/${created.body.id}`);
}

async function testExpenseCrud() {
  const created = await req('POST', '/api/expenses', {
    type: 'expense', category: 'Materials', amount: 42.5, date: '2026-01-01', notes: 'smoke test',
  });
  assert(created.status === 201, `create returned ${created.status}: ${created.text}`);
  assert(Array.isArray(created.body.receipts), 'receipts should default to an empty array');
  await req('DELETE', `/api/expenses/${created.body.id}`);
}

// A 1x1 transparent PNG, base64-encoded - just needs to be valid PNG bytes,
// content doesn't matter.
const TINY_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function testExpenseReceiptFileStorage() {
  // Upload: receipts should come back with a real /uploads/ url, not the
  // base64 dataUrl the client sent - and that file should actually exist
  // on disk (not just an in-memory shape).
  const created = await req('POST', '/api/expenses', {
    type: 'expense', category: 'Materials', amount: 10, date: '2026-01-01',
    receipts: [{ name: 'receipt.png', dataUrl: TINY_PNG_DATA_URL }],
  });
  assert(created.status === 201, `create returned ${created.status}: ${created.text}`);
  const receipt = created.body.receipts[0];
  assert(receipt && receipt.url && receipt.url.startsWith('/uploads/receipts/'), `expected a /uploads/receipts/ url, got ${JSON.stringify(receipt)}`);
  assert(!receipt.dataUrl, 'stored receipt should not still carry the raw base64 dataUrl');
  const onDisk = fs.existsSync(path.join(DATA_DIR, 'uploads', 'receipts', receipt.url.split('/').pop()));
  assert(onDisk, `receipt file should exist on disk at ${receipt.url}`);

  // The file should actually be servable back through the app (auth-gated,
  // same as everything else - this smoke run has no APP_PASSWORD set, so a
  // plain GET should just work).
  const served = await fetch(BASE + receipt.url);
  assert(served.status === 200, `GET ${receipt.url} returned ${served.status}`);
  assert(served.headers.get('content-type') === 'image/png', `expected image/png, got ${served.headers.get('content-type')}`);

  // Editing the expense to drop the receipt should clean up the now-
  // unreferenced file rather than leaving it orphaned on disk forever.
  const updated = await req('PUT', `/api/expenses/${created.body.id}`, { receipts: [] });
  assert(updated.status === 200 && updated.body.receipts.length === 0, `update returned ${updated.status}: ${updated.text}`);
  const stillOnDisk = fs.existsSync(path.join(DATA_DIR, 'uploads', 'receipts', receipt.url.split('/').pop()));
  assert(!stillOnDisk, 'orphaned receipt file should have been cleaned up after removal from the record');

  // Deleting an expense (soft delete, to trash) must NOT touch its receipt
  // files - the record might still be restored.
  const created2 = await req('POST', '/api/expenses', {
    type: 'expense', category: 'Materials', amount: 5, date: '2026-01-01',
    receipts: [{ name: 'receipt2.png', dataUrl: TINY_PNG_DATA_URL }],
  });
  const receipt2 = created2.body.receipts[0];
  const filePath2 = path.join(DATA_DIR, 'uploads', 'receipts', receipt2.url.split('/').pop());
  await req('DELETE', `/api/expenses/${created2.body.id}`);
  assert(fs.existsSync(filePath2), 'receipt file should survive a soft delete (record is only in the trash, might be restored)');

  // But permanently purging it from the trash should delete the file for good.
  const trash = await req('GET', '/api/trash');
  const entry = trash.body.find((t) => t.collection === 'expenses' && t.record.id === created2.body.id);
  assert(entry, 'deleted expense should be in the trash list');
  const purge = await req('DELETE', `/api/trash/${entry.id}`);
  assert(purge.status === 204, `purge returned ${purge.status}`);
  assert(!fs.existsSync(filePath2), 'receipt file should be deleted once the trash entry is purged for good');

  await req('DELETE', `/api/expenses/${created.body.id}`); // cleanup (already receipt-less)
}

async function testPublicQuoteRequestIntake() {
  const missingFields = await req('POST', '/api/public/quote-requests', { name: '', email: '' });
  assert(missingFields.status === 400, `missing name/email should 400, got ${missingFields.status}`);

  const honeypot = await req('POST', '/api/public/quote-requests', {
    name: 'Bot', email: 'bot@example.com', website: 'http://spam.example',
  });
  assert(honeypot.status === 201, 'honeypot trip should still report success (so the bot learns nothing)');

  const real = await req('POST', '/api/public/quote-requests', {
    name: 'Smoke Tester', email: 'smoke@example.com',
    colors: [{ hex: '#000000', colorName: 'Black' }],
  });
  assert(real.status === 201 && real.body.id, `real submission should succeed, got ${real.status}: ${real.text}`);

  // The honeypot submission must not actually have been saved.
  const list = await req('GET', '/api/quoteRequests');
  assert(!list.body.some((r) => r.name === 'Bot'), 'honeypot submission should not have been saved');
  assert(list.body.some((r) => r.id === real.body.id), 'real submission should have been saved');
}

async function testSettingsUpdate() {
  const updated = await req('PUT', '/api/settings', { workspaceName: 'Smoke Test Shop' });
  assert(updated.status === 200 && updated.body.workspaceName === 'Smoke Test Shop', 'settings update did not stick');
}

async function testBackupResetRestore() {
  const before = await req('GET', '/api/products');
  const baselineCount = before.body.length;

  const noBackupsYet = await req('GET', '/api/data/backups');
  assert(Array.isArray(noBackupsYet.body), 'backups list should be an array');

  await req('POST', '/api/products', { name: 'Temp product', price: 1, variants: [{ name: 'Default', quantity: 1 }] });
  const afterCreate = await req('GET', '/api/products');
  assert(afterCreate.body.length === baselineCount + 1, 'product count should be +1 before reset');

  const resetRes = await req('POST', '/api/data/reset');
  assert(resetRes.status === 200, `reset returned ${resetRes.status}`);
  const afterReset = await req('GET', '/api/products');
  assert(afterReset.body.length === 0, `products should be empty after reset, got ${afterReset.body.length}`);

  const backups = await req('GET', '/api/data/backups');
  assert(backups.body.length >= 1, 'reset should have created a backup');
  const latest = backups.body[0].file;

  const badRestore = await req('POST', '/api/data/backups/restore', { file: '../../etc/passwd' });
  assert(badRestore.status === 400, `restoring an unlisted filename should be rejected, got ${badRestore.status}`);

  const restoreRes = await req('POST', '/api/data/backups/restore', { file: latest });
  assert(restoreRes.status === 200, `restore returned ${restoreRes.status}`);

  // This is the important part: check through the LIVE, already-running
  // server (not by re-reading the file in a fresh process), since
  // restoreBackup() previously left the server's in-memory cache stale
  // after a restore until the process was restarted.
  const afterRestore = await req('GET', '/api/products');
  assert(afterRestore.body.length === baselineCount + 1, `live server should reflect the restored data without a restart, got ${afterRestore.body.length} products, expected ${baselineCount + 1}`);
}

async function testRecycleBin() {
  const customer = (await req('POST', '/api/customers', { name: 'Trash Test Customer' })).body;
  const del = await req('DELETE', `/api/customers/${customer.id}`);
  assert(del.status === 204, `delete returned ${del.status}`);

  const trash = await req('GET', '/api/trash');
  const entry = trash.body.find((t) => t.collection === 'customers' && t.record.id === customer.id);
  assert(entry, 'deleted customer should show up in the trash list');

  const restoreRes = await req('POST', `/api/trash/${entry.id}/restore`);
  assert(restoreRes.status === 200 && restoreRes.body.id === customer.id, `restore returned ${restoreRes.status}: ${restoreRes.text}`);

  const restoredCustomer = await req('GET', `/api/customers/${customer.id}`);
  assert(restoredCustomer.status === 200 && restoredCustomer.body.name === 'Trash Test Customer', 'restored customer not reachable via its original id');

  const trashAfterRestore = await req('GET', '/api/trash');
  assert(!trashAfterRestore.body.some((t) => t.id === entry.id), 'restored entry should be gone from the trash list');

  // Purge permanently, this time without restoring first.
  const del2 = await req('DELETE', `/api/customers/${customer.id}`);
  assert(del2.status === 204, `second delete returned ${del2.status}`);
  const trash2 = await req('GET', '/api/trash');
  const entry2 = trash2.body.find((t) => t.collection === 'customers' && t.record.id === customer.id);
  assert(entry2, 'second delete should also show up in the trash list');
  const purge = await req('DELETE', `/api/trash/${entry2.id}`);
  assert(purge.status === 204, `purge returned ${purge.status}`);
  const trash3 = await req('GET', '/api/trash');
  assert(!trash3.body.some((t) => t.id === entry2.id), 'purged entry should be gone from the trash list');
}

async function testUnknownRoute404() {
  const res = await req('GET', '/api/not-a-real-collection');
  assert(res.status === 404, `unknown collection should 404, got ${res.status}`);
}

async function run() {
  console.log(`Scratch DATA_DIR: ${DATA_DIR}`);
  startServer();
  try {
    await waitForServer();

    // Seed one old-shaped maintenance schedule and one old-shaped product
    // BEFORE the server's cache ever loads the file, so the boot-time
    // normalization pass in lib/db.js's readAll() has something to act on.
    // (Editing the file while the server is already running wouldn't be
    // picked up - the in-memory cache only reloads on restore or restart -
    // so this has to happen pre-boot.)
    stopServer();
    const seedPrinterId = 'seed-printer-1';
    seedFile({
      customers: [], quotes: [], orders: [], invoices: [],
      printers: [{ id: seedPrinterId, name: 'Legacy Printer', createdAt: new Date().toISOString() }],
      maintenanceSchedules: [{
        id: 'legacy-schedule-1', printerId: seedPrinterId, task: 'Legacy schedule',
        intervalDays: 21, createdAt: new Date().toISOString(),
      }],
      maintenanceLog: [], spools: [],
      products: [{
        id: 'legacy-product-1', name: 'Legacy Product', sku: 'LEG-1', price: 10, stock: 42,
        variants: [{ name: 'A', sku: 'A-1' }, { name: 'B', sku: 'B-1' }],
        createdAt: new Date().toISOString(),
      }],
      inventoryItems: [], expenses: [], quoteRequests: [], settings: {},
    });
    startServer();
    await waitForServer();

    const schedule = await req('GET', '/api/maintenanceSchedules/legacy-schedule-1');
    try {
      assert(schedule.body.intervalType === 'days' && schedule.body.intervalValue === 21, `legacy schedule should normalize to intervalType/intervalValue, got ${JSON.stringify(schedule.body)}`);
      record('normalize: legacy maintenanceSchedules.intervalDays -> intervalType/intervalValue', true);
    } catch (err) {
      record('normalize: legacy maintenanceSchedules.intervalDays -> intervalType/intervalValue', false, err.message);
    }

    const product = await req('GET', '/api/products/legacy-product-1');
    try {
      assert(product.body.variants[0].quantity === 42, `legacy product's first variant should inherit the old top-level stock (42), got ${JSON.stringify(product.body.variants)}`);
      record('normalize: legacy products.stock -> variants[0].quantity', true);
    } catch (err) {
      record('normalize: legacy products.stock -> variants[0].quantity', false, err.message);
    }

    const namedTests = [
      ['crud: customers', () => testGenericCrud('customers', { name: 'Smoke Customer', email: 'a@b.com' }, { name: 'Smoke Customer Renamed' })],
      ['crud: quotes', () => testGenericCrud('quotes', { customerId: null, status: 'draft' }, { status: 'sent' })],
      ['crud: orders', () => testGenericCrud('orders', { customerId: null, status: 'pending' }, { status: 'printing' })],
      ['crud: invoices', () => testGenericCrud('invoices', { customerId: null, status: 'draft' }, { status: 'sent' })],
      ['crud: spools', () => testGenericCrud('spools', { brand: 'Smoke Brand', material: 'PLA', remainingWeightGrams: 1000 }, { remainingWeightGrams: 800 })],
      ['crud: inventoryItems', () => testGenericCrud('inventoryItems', { name: 'Smoke Item', quantity: 10 }, { quantity: 5 })],
      ['printers: CRUD + status fallback to mock adapter', testPrinterCrudAndStatusFallback],
      ['maintenance: log entry updates schedule baseline', testMaintenanceLogUpdatesScheduleBaseline],
      ['products: variant CRUD', testProductVariantCrud],
      ['expenses: create defaults receipts to []', testExpenseCrud],
      ['expenses: receipts stored as files, cleaned up on edit/purge, kept on soft-delete', testExpenseReceiptFileStorage],
      ['public intake: required fields + honeypot', testPublicQuoteRequestIntake],
      ['settings: update persists', testSettingsUpdate],
      ['data: reset backs up, restore reflects live (no restart needed)', testBackupResetRestore],
      ['trash: delete -> restore -> delete -> purge', testRecycleBin],
      ['routing: unknown collection 404s', testUnknownRoute404],
    ];

    for (const [name, fn] of namedTests) {
      try {
        await fn();
        record(name, true);
      } catch (err) {
        record(name, false, err.message);
      }
    }
  } finally {
    stopServer();
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed.`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error('Smoke test runner crashed:', err);
  stopServer();
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exitCode = 1;
});
