// scripts/seed.js
// Resets data/db.json with a believable small print shop's worth of demo
// data across every collection, so the app is immediately useful and every
// chart/table on every page has something to show.
// Run with: npm run seed  (or node scripts/seed.js)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const id = () => crypto.randomUUID();
const now = new Date();

function daysFromNow(n) {
  const d = new Date(now);
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

function monthsAgo(n, day = 15) {
  const d = new Date(now.getFullYear(), now.getMonth() - n, day);
  return d.toISOString();
}

// ---------- Printers ----------

const printers = [
  { id: id(), name: 'Bambu H2C', model: 'Bambu Lab H2C', type: 'mock', host: '', apiKey: '', powerDrawWatts: 350, printHours: 204, notes: 'Demo printer - no hardware needed.', createdAt: monthsAgo(6, 1) },
  { id: id(), name: 'Bambu H2D', model: 'Bambu Lab H2D', type: 'mock', host: '', apiKey: '', powerDrawWatts: 350, printHours: 132, notes: 'Demo printer - no hardware needed.', createdAt: monthsAgo(5, 1) },
  { id: id(), name: 'P2S #1', model: 'Bambu Lab P2S', type: 'mock', host: '', apiKey: '', powerDrawWatts: 220, printHours: 340, notes: '', createdAt: monthsAgo(8, 1) },
  { id: id(), name: 'P2S #2', model: 'Bambu Lab P2S', type: 'mock', host: '', apiKey: '', powerDrawWatts: 220, printHours: 289, notes: '', createdAt: monthsAgo(8, 1) },
  { id: id(), name: 'Snapmaker U1', model: 'Snapmaker U1', type: 'octoprint', host: 'http://octopi.local', apiKey: 'CHANGE_ME', powerDrawWatts: 180, printHours: 28, notes: 'Example real OctoPrint connection - update host/apiKey to connect for real.', createdAt: monthsAgo(1, 1) },
];
const [p1, p2, p3, p4, p5] = printers;

// ---------- Customers ----------

const customers = [
  { id: id(), customerNumber: 'C-0001', name: 'Maria Chen', email: 'maria@brightloop.co', phone: '555-0142', notes: 'Repeat client, prefers PETG.', createdAt: monthsAgo(5, 3) },
  { id: id(), customerNumber: 'C-0002', name: 'Dev Patel', email: 'dev.patel@example.com', phone: '555-0198', notes: '', createdAt: monthsAgo(4, 12) },
  { id: id(), customerNumber: 'C-0003', name: 'Cascade Robotics', email: 'orders@cascaderobotics.com', phone: '555-0111', notes: 'B2B account, net-30 terms.', createdAt: monthsAgo(3, 8) },
  { id: id(), customerNumber: 'C-0004', name: 'Sarah Kim', email: 'sarahk@example.com', phone: '555-0177', notes: '', createdAt: monthsAgo(1, 20) },
  { id: id(), customerNumber: 'C-0005', name: 'Tom Rivera', email: 'tom.rivera@example.com', phone: '555-0133', notes: 'Found us through Etsy.', createdAt: daysFromNow(-6) },
];
const [c1, c2, c3, c4, c5] = customers;

// ---------- Products ----------

const products = [
  { id: id(), name: 'Cable Clip (5-pack)', sku: 'CC-005', price: 12.0, stock: 84, calculatedCost: 3.1, variants: [{ name: 'Black', sku: 'CC-005-BLK' }, { name: 'White', sku: 'CC-005-WHT' }], notes: '0.2mm layer, 15% infill.', createdAt: monthsAgo(6, 2) },
  { id: id(), name: 'Articulated Dragon', sku: 'ART-DRG', price: 38.0, stock: 12, calculatedCost: 9.4, variants: [{ name: 'Silk Gold' }, { name: 'Silk Copper' }], notes: 'Print-in-place, PLA silk recommended.', createdAt: monthsAgo(5, 10) },
  { id: id(), name: 'Camera Mount Bracket', sku: 'CAM-MNT', price: 22.5, stock: 30, calculatedCost: 6.8, variants: [], notes: 'PETG for outdoor durability.', createdAt: monthsAgo(4, 5) },
  { id: id(), name: 'Desk Organizer Tray', sku: 'DSK-TRAY', price: 27.0, stock: 18, calculatedCost: 8.2, variants: [{ name: 'Small' }, { name: 'Large' }], notes: '', createdAt: monthsAgo(2, 15) },
];
const [prod1, prod2, prod3, prod4] = products;

// ---------- Spools ----------

const spools = [
  { id: id(), spoolNumber: 'SP-0001', brand: 'Prusament', material: 'PLA', color: 'Galaxy Black', totalWeightGrams: 1000, remainingWeightGrams: 730, lowStockThresholdGrams: 150, location: 'Shelf A1', lastDriedAt: daysFromNow(-9), spoolPrice: 29.99, createdAt: monthsAgo(3, 1) },
  { id: id(), spoolNumber: 'SP-0002', brand: 'Overture', material: 'PETG', color: 'Clear', totalWeightGrams: 1000, remainingWeightGrams: 90, lowStockThresholdGrams: 150, location: 'Shelf A2', lastDriedAt: daysFromNow(-2), spoolPrice: 21.99, createdAt: monthsAgo(3, 1) },
  { id: id(), spoolNumber: 'SP-0003', brand: 'Polymaker', material: 'PLA Silk', color: 'Gold', totalWeightGrams: 750, remainingWeightGrams: 750, lowStockThresholdGrams: 150, location: 'Shelf B1', lastDriedAt: null, spoolPrice: 27.5, createdAt: daysFromNow(-14) },
  { id: id(), spoolNumber: 'SP-0004', brand: 'eSun', material: 'ABS', color: 'Gray', totalWeightGrams: 1000, remainingWeightGrams: 410, lowStockThresholdGrams: 150, location: 'Shelf A3', lastDriedAt: daysFromNow(-20), spoolPrice: 19.99, createdAt: monthsAgo(4, 1) },
];
const [sp1, sp2, sp3, sp4] = spools;

// ---------- Inventory (non-filament) ----------

const inventoryItems = [
  { id: id(), name: 'Cardboard shipping boxes (M)', quantity: 42, unitPrice: 0.65, lowStockThreshold: 20, expiry: null, createdAt: monthsAgo(2, 1) },
  { id: id(), name: 'Nozzles 0.4mm (brass)', quantity: 6, unitPrice: 3.2, lowStockThreshold: 8, expiry: null, createdAt: monthsAgo(2, 1) },
  { id: id(), name: 'Build plate adhesive glue sticks', quantity: 3, unitPrice: 4.0, lowStockThreshold: 5, expiry: null, createdAt: monthsAgo(1, 1) },
  { id: id(), name: 'Silica gel packs', quantity: 25, unitPrice: 0.2, lowStockThreshold: 10, expiry: null, createdAt: monthsAgo(1, 1) },
];

// ---------- Orders (kanban + revenue source) ----------

const orders = [
  {
    id: id(), orderNumber: 'O-0001', customerId: c1.id, status: 'printing', priority: 'high',
    dueDate: daysFromNow(2), fulfillment: 'ship', total: 84.0,
    items: [{ productId: prod1.id, productName: 'Cable Clip (5-pack)', qty: 4, price: 12 }, { productId: prod3.id, productName: 'Camera Mount Bracket', qty: 1, price: 22.5 }],
    printerId: p1.id, fileName: 'cable_clip_batch.gcode', estimatedSeconds: 5400, filamentUsedGrams: 180,
    startedAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(), notes: '', createdAt: daysFromNow(-1),
  },
  {
    id: id(), orderNumber: 'O-0002', customerId: c2.id, status: 'pending', priority: 'normal',
    dueDate: daysFromNow(5), fulfillment: 'pickup', total: 38.0,
    items: [{ productId: prod2.id, productName: 'Articulated Dragon', qty: 1, price: 38 }],
    printerId: null, fileName: null, filamentUsedGrams: null, notes: 'Wants gold silk PLA.', createdAt: daysFromNow(-2),
  },
  {
    id: id(), orderNumber: 'O-0003', customerId: c3.id, status: 'post_processing', priority: 'normal',
    dueDate: daysFromNow(1), fulfillment: 'ship', total: 270.0,
    items: [{ productId: prod3.id, productName: 'Camera Mount Bracket', qty: 12, price: 22.5 }],
    printerId: p3.id, fileName: 'camera_mount_x12.gcode', filamentUsedGrams: 620, notes: 'B2B bulk order, needs sanding.', createdAt: daysFromNow(-4),
  },
  {
    id: id(), orderNumber: 'O-0004', customerId: c4.id, status: 'fulfilled', priority: 'low',
    dueDate: daysFromNow(-3), fulfillment: 'pickup', total: 27.0,
    items: [{ productId: prod4.id, productName: 'Desk Organizer Tray', qty: 1, price: 27 }],
    printerId: p2.id, fileName: 'desk_tray.gcode', filamentUsedGrams: 140, notes: '', createdAt: daysFromNow(-8),
  },
  {
    id: id(), orderNumber: 'O-0005', customerId: c5.id, status: 'cancelled', priority: 'normal',
    dueDate: daysFromNow(-1), fulfillment: 'ship', total: 45.0,
    items: [{ productId: prod1.id, productName: 'Cable Clip (5-pack)', qty: 2, price: 12 }, { productId: prod4.id, productName: 'Desk Organizer Tray', qty: 1, price: 27 }],
    printerId: null, fileName: null, filamentUsedGrams: null, notes: 'Customer cancelled - duplicate order.', createdAt: daysFromNow(-5),
  },
  {
    id: id(), orderNumber: 'O-0006', customerId: c1.id, status: 'fulfilled', priority: 'normal',
    dueDate: monthsAgo(1, 10), fulfillment: 'ship', total: 96.0,
    items: [{ productId: prod2.id, productName: 'Articulated Dragon', qty: 2, price: 38 }, { productId: prod1.id, productName: 'Cable Clip (5-pack)', qty: 1, price: 12 }],
    printerId: p1.id, fileName: 'dragon_x2.gcode', filamentUsedGrams: 260, notes: '', createdAt: monthsAgo(1, 8),
  },
  {
    id: id(), orderNumber: 'O-0007', customerId: c3.id, status: 'fulfilled', priority: 'high',
    dueDate: monthsAgo(2, 20), fulfillment: 'ship', total: 450.0,
    items: [{ productId: prod3.id, productName: 'Camera Mount Bracket', qty: 20, price: 22.5 }],
    printerId: p3.id, fileName: 'camera_mount_x20.gcode', filamentUsedGrams: 1040, notes: 'B2B restock order.', createdAt: monthsAgo(2, 18),
  },
  {
    id: id(), orderNumber: 'O-0008', customerId: c2.id, status: 'fulfilled', priority: 'normal',
    dueDate: monthsAgo(3, 5), fulfillment: 'pickup', total: 54.0,
    items: [{ productId: prod1.id, productName: 'Cable Clip (5-pack)', qty: 3, price: 12 }, { productId: prod4.id, productName: 'Desk Organizer Tray', qty: 1, price: 18 }],
    printerId: p2.id, fileName: 'mixed_batch.gcode', filamentUsedGrams: 210, notes: '', createdAt: monthsAgo(3, 3),
  },
];
const [o1, , o3, o4, , o6, o7] = orders;

// ---------- Quotes ----------

const quotes = [
  { id: id(), quoteNumber: 'Q-0001', customerId: c4.id, status: 'pending', materialCost: 6.5, electricityCost: 1.2, marginPercent: 35, discount: 0, total: 41.0, issuedAt: daysFromNow(-1), notes: 'Awaiting customer approval.', createdAt: daysFromNow(-1) },
  { id: id(), quoteNumber: 'Q-0002', customerId: c5.id, status: 'draft', materialCost: 3.1, electricityCost: 0.6, marginPercent: 30, discount: 0, total: 18.5, issuedAt: null, notes: '', createdAt: daysFromNow(-1) },
  { id: id(), quoteNumber: 'Q-0003', customerId: c3.id, status: 'accepted', materialCost: 42, electricityCost: 6, marginPercent: 28, discount: 15, total: 270.0, issuedAt: monthsAgo(0, 20), notes: 'Converted to O-0003.', createdAt: monthsAgo(0, 19) },
  { id: id(), quoteNumber: 'Q-0004', customerId: c2.id, status: 'rejected', materialCost: 9, electricityCost: 1.5, marginPercent: 30, discount: 0, total: 33.0, issuedAt: monthsAgo(1, 2), notes: 'Went with a competitor.', createdAt: monthsAgo(1, 1) },
];

// ---------- Invoices ----------

const invoices = [
  { id: id(), invoiceNumber: 'INV-0001', customerId: c3.id, orderId: o3.id, status: 'outstanding', issuedAt: daysFromNow(-2), dueAt: daysFromNow(12), total: 270.0, createdAt: daysFromNow(-2) },
  { id: id(), invoiceNumber: 'INV-0002', customerId: c1.id, orderId: o1.id, status: 'draft', issuedAt: null, dueAt: null, total: 84.0, createdAt: daysFromNow(-1) },
  { id: id(), invoiceNumber: 'INV-0003', customerId: c1.id, orderId: o6.id, status: 'paid', issuedAt: monthsAgo(1, 8), dueAt: monthsAgo(1, 22), paidAt: monthsAgo(1, 15), total: 96.0, createdAt: monthsAgo(1, 8) },
  { id: id(), invoiceNumber: 'INV-0004', customerId: c3.id, orderId: o7.id, status: 'overdue', issuedAt: monthsAgo(2, 18), dueAt: daysFromNow(-15), total: 450.0, createdAt: monthsAgo(2, 18) },
  { id: id(), invoiceNumber: 'INV-0005', customerId: c4.id, orderId: o4.id, status: 'paid', issuedAt: daysFromNow(-8), dueAt: daysFromNow(6), paidAt: daysFromNow(-6), total: 27.0, createdAt: daysFromNow(-8) },
];

// ---------- Expenses (spread across months for report charts) ----------

const expenses = [
  { id: id(), date: daysFromNow(-3), category: 'Filament', description: 'Bulk PLA restock', amount: 180.0, recurring: false, createdAt: daysFromNow(-3) },
  { id: id(), date: daysFromNow(-6), category: 'Shipping', description: 'Postage - weekly batch', amount: 42.5, recurring: false, createdAt: daysFromNow(-6) },
  { id: id(), date: daysFromNow(-10), category: 'Software', description: 'Slicer Pro subscription', amount: 15.0, recurring: true, createdAt: daysFromNow(-10) },
  { id: id(), date: monthsAgo(0, 1), category: 'Electricity', description: 'Shop power bill', amount: 64.0, recurring: true, createdAt: monthsAgo(0, 1) },
  { id: id(), date: monthsAgo(1, 4), category: 'Filament', description: 'PETG + ABS restock', amount: 210.0, recurring: false, createdAt: monthsAgo(1, 4) },
  { id: id(), date: monthsAgo(1, 1), category: 'Electricity', description: 'Shop power bill', amount: 58.0, recurring: true, createdAt: monthsAgo(1, 1) },
  { id: id(), date: monthsAgo(1, 12), category: 'Maintenance', description: 'Replacement nozzles + hotend', amount: 38.0, recurring: false, createdAt: monthsAgo(1, 12) },
  { id: id(), date: monthsAgo(2, 1), category: 'Electricity', description: 'Shop power bill', amount: 61.0, recurring: true, createdAt: monthsAgo(2, 1) },
  { id: id(), date: monthsAgo(2, 9), category: 'Filament', description: 'PLA + Silk restock', amount: 165.0, recurring: false, createdAt: monthsAgo(2, 9) },
  { id: id(), date: monthsAgo(3, 1), category: 'Electricity', description: 'Shop power bill', amount: 55.0, recurring: true, createdAt: monthsAgo(3, 1) },
  { id: id(), date: monthsAgo(3, 15), category: 'Shipping', description: 'Postage - monthly', amount: 95.0, recurring: false, createdAt: monthsAgo(3, 15) },
  { id: id(), date: monthsAgo(4, 1), category: 'Electricity', description: 'Shop power bill', amount: 52.0, recurring: true, createdAt: monthsAgo(4, 1) },
];

// ---------- Maintenance ----------

const maintenanceSchedules = [
  { id: id(), printerId: p1.id, task: 'Nozzle replacement', intervalDays: 60, lastServicedAt: daysFromNow(-50), notes: '0.4mm brass', createdAt: monthsAgo(3, 1) },
  { id: id(), printerId: p1.id, task: 'Bed leveling check', intervalDays: 14, lastServicedAt: daysFromNow(-3), notes: '', createdAt: monthsAgo(3, 1) },
  { id: id(), printerId: p3.id, task: 'Belt tension check', intervalDays: 30, lastServicedAt: daysFromNow(-40), notes: 'Overdue - schedule soon.', createdAt: monthsAgo(4, 1) },
  { id: id(), printerId: p5.id, task: 'Firmware update check', intervalDays: 45, lastServicedAt: daysFromNow(-5), notes: '', createdAt: monthsAgo(1, 1) },
];

const maintenanceLog = [
  { id: id(), printerId: p1.id, scheduleId: maintenanceSchedules[1].id, date: daysFromNow(-3), downtimeMinutes: 25, notes: 'Routine bed leveling.', createdAt: daysFromNow(-3) },
  { id: id(), printerId: p3.id, scheduleId: null, date: daysFromNow(-12), downtimeMinutes: 90, notes: 'Clogged nozzle, cleared.', createdAt: daysFromNow(-12) },
  { id: id(), printerId: p2.id, scheduleId: null, date: monthsAgo(1, 6), downtimeMinutes: 45, notes: 'Extruder gear slipping, tightened.', createdAt: monthsAgo(1, 6) },
  { id: id(), printerId: p4.id, scheduleId: null, date: monthsAgo(1, 20), downtimeMinutes: 120, notes: 'Hotend replacement.', createdAt: monthsAgo(1, 20) },
  { id: id(), printerId: p1.id, scheduleId: null, date: monthsAgo(2, 10), downtimeMinutes: 30, notes: 'Belt tightening.', createdAt: monthsAgo(2, 10) },
  { id: id(), printerId: p3.id, scheduleId: null, date: monthsAgo(3, 5), downtimeMinutes: 60, notes: 'PSU fan replaced.', createdAt: monthsAgo(3, 5) },
];

// ---------- Settings ----------

const settings = {
  workspaceName: 'Rivera Print Co.',
  contactEmail: 'lacosta0217@gmail.com',
  contactPhone: '555-0100',
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
};

const data = {
  customers, quotes, orders, invoices, printers,
  maintenanceSchedules, maintenanceLog, spools, products, inventoryItems, expenses, settings,
};

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
console.log(`Seeded ${DB_FILE} with a demo print shop's worth of data across every section.`);
