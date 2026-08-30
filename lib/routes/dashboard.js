// lib/routes/dashboard.js
// GET /api/dashboard - the aggregated numbers the Dashboard page renders
// (revenue/profit MTD, orders by status, upcoming deadlines, low-stock
// filament). Nothing here writes data, so there's no create/update/remove
// to speak of - just one computed GET.

const db = require('../db');
const { send } = require('./helpers');

const ORDER_STATUSES = ['pending', 'printing', 'post_processing', 'fulfilled', 'cancelled'];

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

  // Archived orders are done and tucked away by the user - they shouldn't
  // clutter the "active work" views even if their status hasn't moved.
  const activeOrders = orders.filter((o) => o.status !== 'fulfilled' && o.status !== 'cancelled' && !o.archived);

  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingDeadlines = orders
    .filter((o) => o.dueDate && o.status !== 'fulfilled' && o.status !== 'cancelled' && !o.archived)
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

async function tryHandle(ctx) {
  if (ctx.collection === 'dashboard' && ctx.method === 'GET') {
    send(ctx.res, 200, computeDashboard());
    return true;
  }
  return false;
}

module.exports = { tryHandle, computeDashboard, ORDER_STATUSES };
