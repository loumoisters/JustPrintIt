// lib/routes/public.js
// Routes under /api/public/* - reachable with no login even when
// APP_PASSWORD is set (see server.js's PUBLIC_PATHS allowlist, which only
// opens up /request and /api/public/*). Keep this module deliberately
// narrow: it should only ever expose what a stranger filling out the
// public quote-request form legitimately needs.

const db = require('../db');
const { send, notFound, readBody, clip } = require('./helpers');

// ---- Minimal in-memory rate limit for the public intake endpoint ----
// No external dependency, so a plain sliding-window counter per IP. This
// endpoint is reachable with no login by design (see the file header
// comment), so without *some* throttle a script could hammer it and either
// fill up db.json with junk or just tie up the process. A single self-
// hosted instance doesn't need anything fancier than this.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 20; // submissions per IP per window
const rateLimitHits = new Map(); // ip -> timestamps[]

function isRateLimited(ip) {
  const now = Date.now();
  const hits = (rateLimitHits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateLimitHits.set(ip, hits);
  return hits.length > RATE_LIMIT_MAX;
}

// Sweep stale entries occasionally so long-running processes don't
// accumulate one array per distinct IP forever. unref() so this timer alone
// never keeps the process alive.
setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of rateLimitHits) {
    const fresh = hits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (fresh.length) rateLimitHits.set(ip, fresh);
    else rateLimitHits.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS).unref();

// Only http:/https: links are ever stored - a "link to your model" field is
// rendered back as a real <a href> to whoever reviews the request, and
// nothing stops someone from POSTing straight to this API instead of using
// the form, so this can't be enforced client-side. Without it, a
// javascript: URL here would run in the shop owner's already-authenticated
// tab the moment they clicked what looks like an ordinary link.
function safePublicUrl(v, max) {
  const s = clip(v, max).trim();
  if (!s) return '';
  try {
    const parsed = new URL(s);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? s : '';
  } catch {
    return '';
  }
}

// Same idea for color swatches: `hex` ends up directly in an inline
// `background:` style, so it needs to actually be a hex color and nothing
// else (an unvalidated `url(https://attacker/track.gif)` would silently
// fetch a remote image, and leak that the request was opened, the moment
// the shop owner viewed the list - no click needed).
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/;
function safeHexColor(v) {
  const s = clip(v, 20).trim();
  return HEX_COLOR_RE.test(s) ? s : '';
}

async function handleBranding(req, res) {
  const settings = db.getSettings();
  send(res, 200, {
    brandName: settings.brandName || 'JustPrintIt',
    brandIconUrl: settings.brandIconUrl || '',
    workspaceName: settings.workspaceName || '',
  });
}

async function handleCreateRequest(req, res) {
  const body = await readBody(req);

  // Honeypot: a field real visitors never see or fill in (hidden via CSS
  // on the form). A bot that fills in every field trips it; pretend
  // success without actually saving anything so it doesn't learn to skip
  // the field next time.
  if (body.website) {
    return send(res, 201, { ok: true });
  }

  if (!body.name || !String(body.name).trim() || !body.email || !String(body.email).trim()) {
    return send(res, 400, { error: 'Name and email are required' });
  }

  const ip = req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return send(res, 429, { error: 'Too many requests. Please try again later.' });
  }

  // Colors/links are small user-built lists from the public form - cap
  // array length as well as per-item length so nobody can pad the body
  // with thousands of entries. hex/links additionally go through
  // safeHexColor/safePublicUrl (see their comments above) rather than a
  // plain clip(), since both get rendered back as real href/style values.
  const links = Array.isArray(body.links)
    ? body.links.map((v) => safePublicUrl(v, 500)).filter(Boolean).slice(0, 10)
    : [];
  const colors = Array.isArray(body.colors)
    ? body.colors
        .map((c) => ({
          hex: safeHexColor(c && c.hex),
          colorName: clip(c && c.colorName, 60),
          description: clip(c && c.description, 200),
          part: clip(c && c.part, 100),
        }))
        .filter((c) => c.hex || c.colorName || c.description || c.part)
        .slice(0, 10)
    : [];

  // Mirrors the client-side check in request.html - enforced here too since
  // this endpoint can be POSTed to directly, bypassing the form's own JS.
  // At least one row needs an actual chosen hex, not just "No color
  // preference" (which the client sends as hex: '').
  if (!colors.some((c) => c.hex)) {
    return send(res, 400, { error: 'Please select at least one color.' });
  }

  const record = await db.create('quoteRequests', {
    name: clip(body.name, 200),
    email: clip(body.email, 200),
    phone: clip(body.phone, 60),
    description: clip(body.description, 4000),
    specialRequests: clip(body.specialRequests, 2000),
    links,
    colors,
    deadline: clip(body.deadline, 40),
    status: 'new',
    customerId: null,
  });
  send(res, 201, { ok: true, id: record.id });
}

async function tryHandle(ctx) {
  if (ctx.collection !== 'public') return false;
  if (ctx.idOrAction === 'branding' && ctx.method === 'GET') {
    await handleBranding(ctx.req, ctx.res);
    return true;
  }
  if (ctx.idOrAction === 'quote-requests' && ctx.method === 'POST') {
    await handleCreateRequest(ctx.req, ctx.res);
    return true;
  }
  // Matched the /api/public/* namespace but no known sub-route - respond
  // 404 here rather than falling through to the generic collection
  // dispatch, same as the original single-file router did.
  notFound(ctx.res);
  return true;
}

module.exports = { tryHandle };
