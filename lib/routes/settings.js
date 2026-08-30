// lib/routes/settings.js
// GET/PUT/PATCH /api/settings - workspace configuration (business info,
// quoting rates, numbering prefixes, appearance). Not a normal collection
// (there's exactly one settings object, not a list of records), so it gets
// its own tiny route module instead of going through the generic CRUD path.

const db = require('../db');
const { send, readBody } = require('./helpers');

async function tryHandle(ctx) {
  if (ctx.collection !== 'settings') return false;
  if (ctx.method === 'GET') {
    send(ctx.res, 200, db.getSettings());
    return true;
  }
  if (ctx.method === 'PUT' || ctx.method === 'PATCH') {
    const body = await readBody(ctx.req);
    const updated = await db.updateSettings(body);
    send(ctx.res, 200, updated);
    return true;
  }
  return false;
}

module.exports = { tryHandle };
