// lib/routes/spoolman.js
// Thin HTTP wrappers around lib/spoolmandb.js (the module that actually
// fetches/caches/searches the open SpoolmanDB filament dataset - see its
// own comments for why this is the one feature that talks to the open
// internet instead of just the local network).

const spoolmandb = require('../spoolmandb');
const { send, notFound } = require('./helpers');

async function tryHandle(ctx) {
  if (ctx.collection !== 'spoolmandb') return false;

  if (ctx.idOrAction === 'status' && ctx.method === 'GET') {
    send(ctx.res, 200, spoolmandb.getStatus());
    return true;
  }

  if (ctx.idOrAction === 'refresh' && ctx.method === 'POST') {
    try {
      const status = await spoolmandb.refresh();
      send(ctx.res, 200, status);
    } catch (err) {
      // Expected to fail on an offline/air-gapped install - that's fine,
      // it's an optional feature. Surface the reason (e.g. "fetch failed")
      // rather than a generic 500 so the settings/filament UI can show
      // something useful instead of just "something went wrong."
      send(ctx.res, 502, { error: `Couldn't reach SpoolmanDB: ${err.message}` });
    }
    return true;
  }

  if (ctx.idOrAction === 'search' && ctx.method === 'GET') {
    const q = ctx.url.searchParams.get('q') || '';
    send(ctx.res, 200, { results: spoolmandb.search(q, 25), ...spoolmandb.getStatus() });
    return true;
  }

  // Matched the /api/spoolmandb/* namespace but no known action.
  notFound(ctx.res);
  return true;
}

module.exports = { tryHandle };
