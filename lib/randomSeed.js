// lib/randomSeed.js
// Generates a fresh, randomized batch of realistic-looking test data across
// every collection and appends it to whatever's already in the database.
// Used by the "Add test data" button in Settings -> Developer, so testing
// the app doesn't require hand-entering dummy customers/orders/etc. every
// time. Every call produces different names, counts, and values.

const db = require('./db');

// ---------- Random helpers ----------

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickSome(arr, min, max) {
  const n = randInt(min, Math.min(max, arr.length));
  const pool = arr.slice();
  const out = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min, max, decimals = 2) {
  return Number((Math.random() * (max - min) + min).toFixed(decimals));
}
function maybe(prob = 0.5) {
  return Math.random() < prob;
}
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}
function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
}

// ---------- Word banks ----------

const FIRST_NAMES = ['Maria', 'Dev', 'Sarah', 'Tom', 'Alex', 'Priya', 'Jordan', 'Casey', 'Liam', 'Nina', 'Omar', 'Ellie', 'Marcus', 'Zoe', 'Felix', 'Ravi', 'Grace', 'Diego', 'Ines', 'Noah'];
const LAST_NAMES = ['Chen', 'Patel', 'Kim', 'Rivera', 'Nguyen', 'Cole', 'Santos', 'Okafor', 'Bianchi', 'Novak', 'Fischer', 'Dubois', 'Alvarez', 'Larsen', 'Haddad', 'Petrov', 'Morrow', 'Singh'];
const COMPANY_PREFIX = ['Cascade', 'Summit', 'Northwind', 'Bluepeak', 'Iron Oak', 'Redline', 'Nova', 'Sable', 'Fathom', 'Anvil', 'Brightloop', 'Silverline', 'Vertex', 'Drift'];
const COMPANY_SUFFIX = ['Robotics', 'Studios', 'Fabrication', 'Design Co.', 'Makers', 'Labs', 'Prototyping', 'Works', 'Collective', 'Industries'];
const CUSTOMER_NOTES = ['Repeat client.', 'Found us through Etsy.', 'B2B account, net-30 terms.', 'Prefers PETG.', 'Wants rush shipping when possible.', ''];

const PRINTER_NAME_PREFIX = ['Bambu H2C', 'Bambu H2D', 'Bambu X1C', 'Bambu P2S', 'Prusa MK4', 'Prusa XL', 'Creality K2', 'Voron 2.4', 'Snapmaker U1', 'Elegoo Neptune 4'];

const MATERIALS = ['PLA', 'PETG', 'ABS', 'TPU', 'PLA Silk', 'Nylon', 'ASA', 'PC'];
const BRANDS = ['Prusament', 'Overture', 'Polymaker', 'eSun', 'Hatchbox', 'Sunlu', 'Bambu Lab', 'Fillamentum'];
const COLORS = ['Black', 'White', 'Galaxy Black', 'Gray', 'Red', 'Blue', 'Gold', 'Silver', 'Clear', 'Orange', 'Green', 'Copper'];
const LOCATIONS = ['Shelf A1', 'Shelf A2', 'Shelf A3', 'Shelf B1', 'Shelf B2', 'Dry box 1', 'Dry box 2'];

const PRODUCT_NAMES = ['Cable Clip (5-pack)', 'Articulated Dragon', 'Camera Mount Bracket', 'Desk Organizer Tray', 'Phone Stand', 'Planter Pot', 'Keychain Set', 'Wall Hook', 'Tool Holder', 'Cosplay Prop', 'Drone Frame', 'Miniature Figure', 'Headphone Stand', 'Cord Organizer'];
const PRODUCT_NOTES = ['0.2mm layer, 15% infill.', 'PETG for outdoor durability.', 'Print-in-place, silk PLA recommended.', 'Supports needed.', ''];

const INVENTORY_NAMES = ['Cardboard shipping boxes (M)', 'Nozzles 0.4mm (brass)', 'Build plate adhesive glue sticks', 'Silica gel packs', 'Bubble wrap roll', 'Packing tape', 'Zip ties (100pk)', 'PTFE tubing (1m)', 'Thermal paste', 'M3 bolt kit', 'Hot end kit', 'Print bed clips'];

const EXPENSE_CATEGORIES = ['Filament', 'Shipping', 'Software', 'Electricity', 'Maintenance', 'Marketing', 'Packaging', 'Rent'];
const EXPENSE_DESCRIPTIONS = {
  Filament: ['Bulk PLA restock', 'PETG + ABS restock', 'PLA + Silk restock', 'Specialty filament order'],
  Shipping: ['Postage - weekly batch', 'Postage - monthly', 'Shipping supplies'],
  Software: ['Slicer Pro subscription', 'Design software renewal', 'Inventory app subscription'],
  Electricity: ['Shop power bill'],
  Maintenance: ['Replacement nozzles + hotend', 'Belt replacement', 'PSU fan replaced'],
  Marketing: ['Social ad spend', 'Craft fair booth fee'],
  Packaging: ['Custom box order', 'Branded stickers'],
  Rent: ['Workshop rent'],
};

const MAINT_TASKS = ['Nozzle replacement', 'Bed leveling check', 'Belt tension check', 'Firmware update check', 'Hotend cleaning', 'PSU fan check', 'Extruder calibration', 'Build plate replacement'];
const MAINT_LOG_NOTES = ['Routine bed leveling.', 'Clogged nozzle, cleared.', 'Extruder gear slipping, tightened.', 'Hotend replacement.', 'Belt tightening.', 'PSU fan replaced.', 'Firmware updated.', ''];

const ORDER_STATUSES = ['pending', 'printing', 'post_processing', 'fulfilled', 'cancelled'];
const PRIORITIES = ['low', 'normal', 'normal', 'high'];
const QUOTE_STATUSES = ['draft', 'pending', 'accepted', 'rejected'];
const INVOICE_STATUSES = ['draft', 'outstanding', 'overdue', 'paid'];

function randomPersonOrCompanyName() {
  if (maybe(0.3)) return `${pick(COMPANY_PREFIX)} ${pick(COMPANY_SUFFIX)}`;
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

// ---------- Generators per collection ----------

async function genCustomers() {
  const out = [];
  const n = randInt(3, 6);
  for (let i = 0; i < n; i++) {
    const name = randomPersonOrCompanyName();
    const c = await db.create('customers', {
      customerNumber: `C-${randInt(1000, 9999)}`,
      name,
      email: `${slug(name)}@example.com`,
      phone: `555-0${randInt(100, 199)}`,
      notes: pick(CUSTOMER_NOTES),
    });
    out.push(c);
  }
  return out;
}

async function genPrinters() {
  const out = [];
  const n = randInt(1, 3);
  for (let i = 0; i < n; i++) {
    const model = pick(PRINTER_NAME_PREFIX);
    const machineCost = randInt(400, 1800);
    const c = await db.create('printers', {
      name: `${model} #${randInt(1, 9)}`,
      model,
      // No connection type/host/API key - the New/Edit Printer pane no
      // longer has those fields (see lib/printers/index.js), so seeding one
      // here would create a printer nothing in the UI can ever fix.
      powerDrawWatts: randInt(120, 400),
      printHours: randInt(5, 500),
      machineCost,
      lifespanPrintHours: maybe(0.6) ? randInt(1500, 6000) : 0,
      notes: 'Demo printer - no hardware needed.',
    });
    out.push(c);
  }
  return out;
}

async function genSpools() {
  const out = [];
  const n = randInt(3, 6);
  for (let i = 0; i < n; i++) {
    const total = pick([750, 1000, 1000, 2000]);
    const remaining = randInt(0, total);
    const c = await db.create('spools', {
      spoolNumber: `SP-${randInt(1000, 9999)}`,
      brand: pick(BRANDS),
      material: pick(MATERIALS),
      color: pick(COLORS),
      totalWeightGrams: total,
      remainingWeightGrams: remaining,
      lowStockThresholdGrams: 150,
      location: pick(LOCATIONS),
      lastDriedAt: maybe(0.6) ? daysFromNow(-randInt(1, 30)) : null,
      spoolPrice: randFloat(16, 34),
    });
    out.push(c);
  }
  return out;
}

async function genProducts() {
  const out = [];
  const names = pickSome(PRODUCT_NAMES, 2, 5);
  for (const name of names) {
    const cost = randFloat(2, 15);
    const price = Number((cost * randFloat(2, 4)).toFixed(2));
    const variants = maybe(0.5)
      ? pickSome(COLORS, 2, 3).map((color) => ({
          name: color,
          priceOverride: maybe(0.2) ? Number((price + randFloat(-2, 4)).toFixed(2)) : null,
          quantity: randInt(0, 40),
          sku: `${name.slice(0, 3).toUpperCase()}-${randInt(100, 999)}`,
          lowStockThreshold: maybe(0.5) ? pick([3, 5, 10]) : null,
        }))
      : [{ name: 'Default', priceOverride: null, quantity: randInt(0, 90), sku: `${name.slice(0, 3).toUpperCase()}-${randInt(100, 999)}`, lowStockThreshold: null }];
    const c = await db.create('products', {
      name,
      sku: `${name.slice(0, 3).toUpperCase()}-${randInt(100, 999)}`,
      price,
      description: pick(PRODUCT_NOTES),
      fulfillmentMode: pick(['made_to_order', 'made_to_order', 'from_stock', 'hybrid']),
      stock: variants.reduce((sum, v) => sum + v.quantity, 0),
      calculatedCost: cost,
      variants,
      notes: pick(PRODUCT_NOTES),
    });
    out.push(c);
  }
  return out;
}

async function genInventoryItems() {
  const out = [];
  const names = pickSome(INVENTORY_NAMES, 3, 6);
  for (const name of names) {
    const c = await db.create('inventoryItems', {
      name,
      quantity: randInt(0, 60),
      unitPrice: randFloat(0.15, 6),
      lowStockThreshold: randInt(5, 20),
      expiry: null,
    });
    out.push(c);
  }
  return out;
}

async function genOrders(customers, printers, products) {
  const out = [];
  if (!customers.length) return out;
  const n = randInt(4, 8);
  for (let i = 0; i < n; i++) {
    const status = pick(ORDER_STATUSES);
    const itemCount = randInt(1, 3);
    const items = [];
    let total = 0;
    for (let j = 0; j < itemCount && products.length; j++) {
      const p = pick(products);
      const qty = randInt(1, 6);
      items.push({ productId: p.id, productName: p.name, qty, price: p.price });
      total += (Number(p.price) || 0) * qty;
    }
    if (!items.length) total = randFloat(15, 300);
    const printer = printers.length && maybe(0.6) ? pick(printers) : null;
    const c = await db.create('orders', {
      orderNumber: `O-${randInt(1000, 9999)}`,
      customerId: pick(customers).id,
      status,
      priority: pick(PRIORITIES),
      dueDate: daysFromNow(randInt(-10, 14)),
      fulfillment: pick(['pickup', 'ship']),
      total: Number(total.toFixed(2)),
      items,
      printerId: printer ? printer.id : null,
      fileName: printer ? `job_${randInt(1000, 9999)}.gcode` : null,
      estimatedSeconds: printer ? randInt(1200, 20000) : null,
      filamentUsedGrams: printer ? randInt(20, 900) : null,
      startedAt: status === 'printing' ? new Date(Date.now() - randInt(5, 180) * 60000).toISOString() : null,
      notes: maybe(0.25) ? 'Rush order - please prioritize.' : '',
    });
    out.push(c);
  }
  return out;
}

async function genQuotes(customers, spools, printers, inventoryItems) {
  const out = [];
  const n = randInt(3, 6);
  for (let i = 0; i < n; i++) {
    const lineCount = randInt(1, 3);
    const lines = [];
    for (let j = 0; j < lineCount; j++) {
      const spool = spools.length && maybe(0.7) ? pick(spools) : null;
      const printer = printers.length && maybe(0.6) ? pick(printers) : null;
      const attachInv = inventoryItems.length && maybe(0.35);
      lines.push({
        description: pick(PRODUCT_NAMES),
        spoolId: spool ? spool.id : '',
        grams: spool ? randInt(10, 400) : '',
        printerId: printer ? printer.id : '',
        hours: printer ? randFloat(0.5, 8, 1) : 0,
        laborMinutes: randInt(0, 60),
        qty: randInt(1, 5),
        inventoryItems: attachInv ? [{ inventoryItemId: pick(inventoryItems).id, qty: randInt(1, 4) }] : [],
      });
    }
    const marginPercent = randInt(15, 45);
    const materialCost = randFloat(3, 60);
    const electricityCost = randFloat(0.3, 8);
    const laborCost = randFloat(0, 25);
    const total = Number(((materialCost + electricityCost + laborCost) * (1 + marginPercent / 100)).toFixed(2));
    const status = pick(QUOTE_STATUSES);
    const c = await db.create('quotes', {
      quoteNumber: `Q-${randInt(1000, 9999)}`,
      customerId: customers.length ? pick(customers).id : null,
      status,
      issuedAt: daysFromNow(-randInt(0, 20)),
      expiresAt: maybe(0.6) ? daysFromNow(randInt(5, 30)) : null,
      language: pick(['English (US)', 'Spanish', 'French', 'German', 'Dutch']),
      lines,
      laborEnabled: true,
      wasteEnabled: maybe(0.3), wastePercent: randInt(2, 10),
      overheadEnabled: maybe(0.3), overheadPercent: randInt(5, 15),
      marginPercent,
      discountType: 'percent', discountValue: maybe(0.2) ? randInt(5, 15) : 0,
      taxPercent: maybe(0.5) ? randInt(5, 9) : 0, taxExempt: false,
      notes: status === 'rejected' ? 'Went with a competitor.' : (status === 'accepted' ? 'Converted to an order.' : ''),
      materialCost, electricityCost, laborCost, inventoryCost: 0,
      discount: 0, total,
    });
    out.push(c);
  }
  return out;
}

async function genInvoices(customers, orders) {
  const out = [];
  if (!customers.length) return out;
  const n = randInt(2, 5);
  for (let i = 0; i < n; i++) {
    const status = pick(INVOICE_STATUSES);
    const order = orders.length && maybe(0.6) ? pick(orders) : null;
    const total = order ? Number(order.total) : randFloat(20, 400);
    const issuedAt = daysFromNow(-randInt(0, 25));
    const c = await db.create('invoices', {
      invoiceNumber: `INV-${randInt(1000, 9999)}`,
      customerId: order ? order.customerId : pick(customers).id,
      orderId: order ? order.id : null,
      status,
      issuedAt,
      dueAt: daysFromNow(randInt(5, 20)),
      paidAt: status === 'paid' ? daysFromNow(-randInt(0, 10)) : null,
      total,
    });
    out.push(c);
  }
  return out;
}

async function genMaintenanceSchedules(printers) {
  const out = [];
  if (!printers.length) return out;
  const n = randInt(1, 3);
  for (let i = 0; i < n; i++) {
    const printer = pick(printers);
    const isPrintHours = maybe(0.5);
    const c = await db.create('maintenanceSchedules', {
      printerId: printer.id,
      task: pick(MAINT_TASKS),
      intervalType: isPrintHours ? 'print_hours' : 'days',
      intervalValue: isPrintHours ? pick([100, 150, 200, 300]) : pick([14, 30, 45, 60, 90]),
      lastServicedAt: daysFromNow(-randInt(1, 55)),
      lastServicePrintHours: isPrintHours ? Math.max(0, (Number(printer.printHours) || 0) - randInt(0, 150)) : null,
      notes: '',
      active: maybe(0.85),
    });
    out.push(c);
  }
  return out;
}

async function genMaintenanceLog(printers, schedules) {
  const out = [];
  if (!printers.length) return out;
  const n = randInt(2, 5);
  for (let i = 0; i < n; i++) {
    const c = await db.create('maintenanceLog', {
      printerId: pick(printers).id,
      scheduleId: schedules.length && maybe(0.5) ? pick(schedules).id : null,
      date: daysFromNow(-randInt(0, 90)),
      downtimeMinutes: randInt(10, 150),
      notes: pick(MAINT_LOG_NOTES),
    });
    out.push(c);
  }
  return out;
}

async function genExpenses() {
  const out = [];
  const n = randInt(4, 8);
  for (let i = 0; i < n; i++) {
    const category = pick(EXPENSE_CATEGORIES);
    const c = await db.create('expenses', {
      date: daysFromNow(-randInt(0, 120)),
      category,
      description: pick(EXPENSE_DESCRIPTIONS[category] || ['Misc expense']),
      amount: randFloat(10, 220),
      recurring: maybe(0.3),
    });
    out.push(c);
  }
  return out;
}

// ---------- Entry point ----------

async function generateRandomTestData() {
  // Order matters: generate the "reference" collections first so orders/
  // quotes/invoices/maintenance can point at real ids (a mix of whatever
  // already existed plus what we just created).
  const customers = await genCustomers();
  const printers = await genPrinters();
  const spools = await genSpools();
  const products = await genProducts();
  const inventoryItems = await genInventoryItems();

  const allCustomers = db.list('customers');
  const allPrinters = db.list('printers');
  const allProducts = db.list('products');
  const allSpools = db.list('spools');
  const allInventoryItems = db.list('inventoryItems');

  const orders = await genOrders(allCustomers, allPrinters, allProducts);
  const quotes = await genQuotes(allCustomers, allSpools, allPrinters, allInventoryItems);
  const invoices = await genInvoices(allCustomers, db.list('orders'));
  const schedules = await genMaintenanceSchedules(allPrinters);
  const log = await genMaintenanceLog(allPrinters, db.list('maintenanceSchedules'));
  const expenses = await genExpenses();

  return {
    customers: customers.length, printers: printers.length, spools: spools.length,
    products: products.length, inventoryItems: inventoryItems.length,
    orders: orders.length, quotes: quotes.length, invoices: invoices.length,
    maintenanceSchedules: schedules.length, maintenanceLog: log.length, expenses: expenses.length,
  };
}

module.exports = { generateRandomTestData };
