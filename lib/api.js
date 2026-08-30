// lib/api.js
// Hand-rolled JSON API router (no Express). This file is deliberately thin:
// it builds the generic CRUD table for each plain collection, then tries
// each domain-specific route module in lib/routes/ in turn before falling
// back to that generic CRUD. Each module exports an async
// `tryHandle(ctx) -> boolean` - true means it already sent a response and
// the router should stop, false means "not mine, try the next one."
//
// This used to be one ~700-line file with every handler inline. Splitting
// it out means each domain (dashboard, reports, the public intake form,
// backups/reset/trash, printer status, spoolmandb, maintenance, expenses)
// can be read and changed independently of the others - see lib/routes/*.js.

const db = require('./db');
const { send, notFound, readBody } = require('./routes/helpers');

const dashboardRoutes = require('./routes/dashboard');
const reportsRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');
const publicRoutes = require('./routes/public');
const dataRoutes = require('./routes/data');
const printerRoutes = require('./routes/printers');
const spoolmanRoutes = require('./routes/spoolman');
const maintenanceRoutes = require('./routes/maintenance');
const expensesRoutes = require('./routes/expenses');

// Re-exported for backward compatibility - nothing in this codebase
// currently imports it from here (dashboard.js is the source of truth
// now), but it was part of this module's public surface before the split.
const ORDER_STATUSES = dashboardRoutes.ORDER_STATUSES;

// ---------- Generic CRUD ----------
// Every collection not handled by a route module above (customers, quotes,
// orders, invoices, printers, maintenanceSchedules, maintenanceLog, spools,
// products, inventoryItems, quoteRequests - expenses has its own module
// because create/update need receipt validation) gets plain list/get/
// create/update/remove for free from here.

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
  'inventoryItems', 'quoteRequests',
  // Note: 'expenses' is deliberately excluded - lib/routes/expenses.js
  // handles that collection entirely, including its own list/get/remove.
];

const tables = {};
for (const c of COLLECTIONS) tables[c] = crudRoutes(c);

// Tried in order for every request. Order mostly doesn't matter (each
// module only claims its own `collection` value), but expenses/maintenance
// are checked before the generic fallback naturally since they're modules,
// not part of `tables`.
const ROUTE_MODULES = [
  dashboardRoutes, reportsRoutes, settingsRoutes, publicRoutes, dataRoutes,
  printerRoutes, spoolmanRoutes, maintenanceRoutes, expensesRoutes,
];

// ---------- Router ----------

async function handleApi(req, res, pathname, url) {
  const parts = pathname.split('/').filter(Boolean);
  const [, collection, idOrAction, subAction] = parts;
  const method = req.method;

  // Every branch below `await`s its handler, even where the result isn't
  // otherwise used. That await is not decorative: without it, a handler
  // called without awaiting hands back a still-pending promise, so if it
  // later rejects (a bad JSON body, a disk error, anything), the rejection
  // happens *after* this function has already returned - outside the
  // try/catch below, as an unhandled rejection. Node treats unhandled
  // rejections as fatal by default, which means a single malformed request
  // body could crash the whole process. This bit real - a malformed body
  // to the public, unauthenticated intake endpoint reproduced it during
  // testing.
  try {
    const ctx = { req, res, url, pathname, collection, idOrAction, subAction, method };

    for (const mod of ROUTE_MODULES) {
      if (await mod.tryHandle(ctx)) return;
    }

    const table = tables[collection];
    if (!table) return notFound(res);

    if (!idOrAction) {
      if (method === 'GET') return await table.list(req, res);
      if (method === 'POST') return await table.create(req, res);
      return notFound(res);
    }

    if (method === 'GET') return await table.get(req, res, idOrAction);
    if (method === 'PUT' || method === 'PATCH') return await table.update(req, res, idOrAction);
    if (method === 'DELETE') return await table.remove(req, res, idOrAction);

    return notFound(res);
  } catch (err) {
    console.error(`[api] ${method} ${pathname} failed:`, err);
    // The /api/public/* routes are reachable by anyone with no login, so an
    // unexpected error there (e.g. a filesystem failure) must not echo
    // err.message back - Node's own error strings routinely embed absolute
    // server file paths. Every other route here already requires whatever
    // auth this deployment has configured, so its operator seeing the real
    // error (e.g. "printer unreachable at 192.168.1.50") is a feature, not
    // a leak - it's their own diagnostic information.
    const isPublicRoute = collection === 'public';
    if (err && err.expose) {
      send(res, err.statusCode || 400, { error: err.message });
    } else if (isPublicRoute) {
      send(res, 500, { error: 'Internal server error' });
    } else {
      send(res, 500, { error: err.message });
    }
  }
}

module.exports = { handleApi, ORDER_STATUSES };
