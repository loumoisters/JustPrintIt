// lib/routes/reports.js
// GET /api/reports?months=N - the Reports page's charts and top-N tables
// (revenue/expenses/filament/downtime by month, top products/customers,
// downtime by printer). Also a single computed GET, no writes.

const db = require('../db');
const { send } = require('./helpers');

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

async function tryHandle(ctx) {
  if (ctx.collection === 'reports' && ctx.method === 'GET') {
    // Clamped so a stray or malicious ?months= value can't make the month-
    // bucket loop in computeReports() build an unbounded array.
    const requested = Number(ctx.url.searchParams.get('months'));
    const months = Number.isFinite(requested) ? Math.min(60, Math.max(1, Math.round(requested))) : 6;
    send(ctx.res, 200, computeReports(months));
    return true;
  }
  return false;
}

module.exports = { tryHandle, computeReports };
