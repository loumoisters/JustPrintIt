// lib/api.js
// Hand-rolled JSON API router (no Express). Generic CRUD for every
// collection, plus a handful of computed endpoints (dashboard, reports,
// printer status, settings) that aggregate across collections.

const db = require('./db');
const printers = require('./printers');

const ORDER_STATUSES = ['pending', 'printing', 'post_processing', 'fulfilled', 'cancelled'];

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function notFound(res) {
  send(res, 404, { error: 'Not found' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 5_000_000) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function crudRoutes(collection) {
  return {
    async list(req, res) {
      send(res, 200, db.list(collection));
    },
    async get(req, res, id) {
      const item = db.get(collection, id);
      if (!item) return notFound(res);
      send(res, 200, item);
    },
    async create(req, res) {
      const body = await readBody(req);
      const created = await db.create(collection, body);
      send(res, 201, created);
    },
    async update(req, res, id) {
      const body = await readBody(req);
      const updated = await db.update(collection, id, body);
      if (!updated) return notFound(res);
      send(res, 200, updated);
    },
    async remove(req, res, id) {
      const ok = await db.remove(collection, id);
      if (!ok) return notFound(res);
      send(res, 204, null);
    },
  };
}

const COLLECTIONS = [
  'customers', 'quotes', 'orders', 'invoices', 'printers',
  'maintenanceSchedules', 'maintenanceLog', 'spools', 'products',
  'inventoryItems', 'expenses',
];

const tables = {};
for (const c of COLLECTIONS) tables[c] = crudRoutes(c);

// ---------- Printer live status ----------

async function handlePrinterStatus(req, res, id) {
  const printer = db.get('printers', id);
  if (!printer) return notFound(res);
  const status = await printers.getStatus(printer);
  send(res, 200, status);
}

async function handleAllPrinterStatuses(req, res) {
  const all = db.list('printers');
  const results = await Promise.all(
    all.map(async (p) => ({ printerId: p.id, ...(await printers.getStatus(p)) }))
  );
  send(res, 200, results);
}

// ---------- Settings ----------

async function handleGetSettings(req, res) {
  send(res, 200, db.getSettings());
}

async function handleUpdateSettings(req, res) {
  const body = await readBody(req);
  const updated = await db.updateSettings(body);
  send(res, 200, updated);
}

// ---------- Dashboard ----------

function isSameMonth(dateStr, ref) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

function computeDashboard() {
  const now = new Date();
  const orders = db.list('orders');
  const expenses = db.list('expenses');
  const spools = db.list('spools');
  const customers = db.list('customers');

  const ordersThisMonth = orders.filter((o) => isSameMonth(o.createdAt, now) && o.status !== 'cancelled');
  const revenueMTD = ordersThisMonth.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const expensesThisMonth = expenses.filter((e) => isSameMonth(e.date, now));
  const expensesMTD = expensesThisMonth.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const profitMTD = revenueMTD - expensesMTD;

  const ordersByStatus = {};
  for (const s of ORDER_STATUSES) ordersByStatus[s] = 0;
  for (const o of orders) ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;

  const activeOrders = orders.filter((o) => o.status !== 'fulfilled' && o.status !== 'cancelled');

  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingDeadlines = orders
    .filter((o) => o.dueDate && o.status !== 'fulfilled' && o.status !== 'cancelled')
    .filter((o) => {
      const d = new Date(o.dueDate);
      return d >= now && d <= in7Days;
    })
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const lowStockSpools = spools.filter(
    (s) => typeof s.remainingWeightGrams === 'number' && s.remainingWeightGrams <= (s.lowStockThresholdGrams ?? 100)
  );

  return {
    revenueMTD,
    profitMTD,
    ordersByStatus,
    activeOrderCount: activeOrders.length,
    activeOrders,
    upcomingDeadlines,
    lowStockSpools,
    customerCount: customers.length,
    printerCount: db.list('printers').length,
  };
}

async function handleDashboard(req, res) {
  send(res, 200, computeDashboard());
}

// ---------- Reports ----------

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function computeReports(months) {
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const orders = db.list('orders').filter((o) => o.status !== 'cancelled' && new Date(o.createdAt) >= rangeStart);
  const expenses = db.list('expenses').filter((e) => e.date && new Date(e.date) >= rangeStart);
  const customers = db.list('customers').filter((c) => new Date(c.createdAt) >= rangeStart);
  const maintenanceLog = db.list('maintenanceLog').filter((m) => m.date && new Date(m.date) >= rangeStart);
  const printersAll = db.list('printers');

  const revenue = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const expenseTotal = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const net = revenue - expenseTotal;
  const avgOrder = orders.length ? revenue / orders.length : 0;

  // filament used: sum grams from order items that reference a spool, fallback to job-level field
  const filamentUsedGrams = orders.reduce((sum, o) => sum + (Number(o.filamentUsedGrams) || 0), 0);

  const downtimeMinutes = maintenanceLog.reduce((sum, m) => sum + (Number(m.downtimeMinutes) || 0), 0);

  // month buckets
  const monthLabels = [];
  const monthBuckets = {};
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    monthLabels.push({ key, label: d.toLocaleString('en-US', { month: 'short' }) });
    monthBuckets[key] = { revenue: 0, expenses: 0, filament: 0, downtime: 0 };
  }
  for (const o of orders) {
    const key = monthKey(new Date(o.createdAt));
    if (monthBuckets[key]) monthBuckets[key].revenue += Number(o.total) || 0;
    if (monthBuckets[key]) monthBuckets[key].filament += Number(o.filamentUsedGrams) || 0;
  }
  for (const e of expenses) {
    const key = monthKey(new Date(e.date));
    if (monthBuckets[key]) monthBuckets[key].expenses += Number(e.amount) || 0;
  }
  for (const m of maintenanceLog) {
    const key = monthKey(new Date(m.date));
    if (monthBuckets[key]) monthBuckets[key].downtime += Number(m.downtimeMinutes) || 0;
  }

  const revenueByMonth = monthLabels.map((m) => ({ label: m.label, value: monthBuckets[m.key].revenue }));
  const expensesByMonth = monthLabels.map((m) => ({ label: m.label, value: monthBuckets[m.key].expenses }));
  const filamentByMonth = monthLabels.map((m) => ({ label: m.label, value: monthBuckets[m.key].filament }));
  const downtimeByMonth = monthLabels.map((m) => ({ label: m.label, value: monthBuckets[m.key].downtime }));

  // top products by quantity ordered
  const productQty = {};
  for (const o of orders) {
    for (const item of o.items || []) {
      const name = item.productName || item.description || 'Item';
      productQty[name] = (productQty[name] || 0) + (Number(item.qty) || 1);
    }
  }
  const topProducts = Object.entries(productQty)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  // biggest client by spend
  const customerSpend = {};
  for (const o of orders) {
    if (!o.customerId) continue;
    customerSpend[o.customerId] = (customerSpend[o.customerId] || 0) + (Number(o.total) || 0);
  }
  const allCustomers = db.list('customers');
  const topCustomers = Object.entries(customerSpend)
    .map(([customerId, spend]) => ({
      name: allCustomers.find((c) => c.id === customerId)?.name || 'Unknown',
      spend,
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5);

  // downtime by printer
  const printerDowntime = {};
  for (const m of maintenanceLog) {
    if (!m.printerId) continue;
    printerDowntime[m.printerId] = (printerDowntime[m.printerId] || 0) + (Number(m.downtimeMinutes) || 0);
  }
  const downtimeByPrinter = Object.entries(printerDowntime)
    .map(([printerId, minutes]) => ({
      name: printersAll.find((p) => p.id === printerId)?.name || 'Unknown',
      minutes,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  return {
    revenue, expenseTotal, net, avgOrder,
    orderCount: orders.length,
    newCustomerCount: customers.length,
    filamentUsedGrams, downtimeMinutes,
    revenueByMonth, expensesByMonth, filamentByMonth, downtimeByMonth,
    topProducts, topCustomers, downtimeByPrinter,
  };
}

async function handleReports(req, res, url) {
  const months = Number(url.searchParams.get('months')) || 6;
  send(res, 200, computeReports(months));
}

// ---------- Router ----------

async function handleApi(req, res, pathname, url) {
  const parts = pathname.split('/').filter(Boolean);
  const [, collection, idOrAction, subAction] = parts;
  const method = req.method;

  try {
    if (collection === 'dashboard' && method === 'GET') return handleDashboard(req, res);
    if (collection === 'reports' && method === 'GET') return handleReports(req, res, url);

    if (collection === 'settings') {
      if (method === 'GET') return handleGetSettings(req, res);
      if (method === 'PUT' || method === 'PATCH') return handleUpdateSettings(req, res);
      return notFound(res);
    }

    if (collection === 'printers' && idOrAction === 'status' && method === 'GET') {
      return handleAllPrinterStatuses(req, res);
    }
    if (collection === 'printers' && subAction === 'status' && method === 'GET') {
      return handlePrinterStatus(req, res, idOrAction);
    }

    const table = tables[collection];
    if (!table) return notFound(res);

    if (!idOrAction) {
      if (method === 'GET') return table.list(req, res);
      if (method === 'POST') return table.create(req, res);
      return notFound(res);
    }

    if (method === 'GET') return table.get(req, res, idOrAction);
    if (method === 'PUT' || method === 'PATCH') return table.update(req, res, idOrAction);
    if (method === 'DELETE') return table.remove(req, res, idOrAction);

    return notFound(res);
  } catch (err) {
    send(res, 500, { error: err.message });
  }
}

module.exports = { handleApi, ORDER_STATUSES };
