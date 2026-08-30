// lib/routes/printers.js
// Printer live-status endpoints only - GET /api/printers/status (all) and
// GET /api/printers/:id/status (one). Normal printer CRUD (create/edit/
// delete) goes through the generic collection dispatch in lib/api.js; this
// module exists because status is computed on demand from lib/printers/,
// not stored data.

const db = require('../db');
const printers = require('../printers');
const { send, notFound } = require('./helpers');

async function handleOne(req, res, id) {
  const printer = db.get('printers', id);
  if (!printer) return notFound(res);
  const status = await printers.getStatus(printer);
  send(res, 200, status);
}

async function handleAll(req, res) {
  const all = db.list('printers');
  const results = await Promise.all(
    all.map(async (p) => ({ printerId: p.id, ...(await printers.getStatus(p)) }))
  );
  send(res, 200, results);
}

async function tryHandle(ctx) {
  if (ctx.collection === 'printers' && ctx.idOrAction === 'status' && ctx.method === 'GET') {
    await handleAll(ctx.req, ctx.res);
    return true;
  }
  if (ctx.collection === 'printers' && ctx.subAction === 'status' && ctx.method === 'GET') {
    await handleOne(ctx.req, ctx.res, ctx.idOrAction);
    return true;
  }
  return false;
}

module.exports = { tryHandle };
