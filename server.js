// server.js
// Entry point. Plain node:http server - no framework, no build step.
// Run with: node server.js  (or: PORT=8080 node server.js)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const os = require('os');
const { handleApi } = require('./lib/api');
const db = require('./lib/db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
// Where uploaded files (currently just expense receipts - see
// lib/routes/expenses.js) get written, alongside db.json and its backups.
// Not under PUBLIC_DIR: these are private business records, so they're
// served through their own handler below, gated by the same auth check as
// everything else in the app (unlike PUBLIC_DIR/PUBLIC_PATHS, which are
// reachable with no login).
const UPLOADS_DIR = path.join(db.getDataDir(), 'uploads');

// Optional password gate. Unset by default (fine for local use on your own
// machine/network). If you deploy this somewhere public, set APP_PASSWORD
// (and optionally APP_USERNAME, default "admin") as environment variables
// and every request will require an HTTP Basic Auth login.
const APP_USERNAME = process.env.APP_USERNAME || 'admin';
const APP_PASSWORD = process.env.APP_PASSWORD || '';

// Constant-time string compare so a byte-by-byte early mismatch can't leak
// timing information about how much of the guess was correct. Pads both
// sides to equal length first since timingSafeEqual throws on a length
// mismatch (that throw path is itself fast, so this stays comparably safe).
function timingSafeEqualString(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Still do a same-cost compare against a dummy of A's length so the
    // response time doesn't reveal that the length itself was wrong.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function isAuthorized(req) {
  if (!APP_PASSWORD) return true; // no password configured - auth disabled
  const header = req.headers['authorization'] || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  let decoded;
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return false;
  }
  const sep = decoded.indexOf(':');
  if (sep === -1) return false;
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  return timingSafeEqualString(user, APP_USERNAME) && timingSafeEqualString(pass, APP_PASSWORD);
}

function requireAuth(res) {
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="Print Fleet Manager"',
    'Content-Type': 'text/plain',
  });
  res.end('Authentication required');
}

// The public quote-request intake form has to stay reachable by customers
// even when APP_PASSWORD is set to lock down the rest of the app for you -
// this is a deliberately narrow allowlist, not a general auth bypass.
// /request is fully self-contained (inline CSS/JS) specifically so this
// list doesn't need to grow to cover /styles.css or other shared assets.
const PUBLIC_PATHS = new Set(['/request']);
function isPublicPath(pathname) {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith('/api/public/');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
};

// Worth gzipping: text formats compress well (often 60-80% smaller).
// Images/PDFs are already compressed internally, so re-gzipping them wastes
// CPU for no size benefit - left out on purpose.
const GZIPPABLE_EXTS = new Set(['.html', '.js', '.css', '.svg', '.json']);

// Shared by serveStatic() and serveUpload() below. `cacheMode` controls how
// the response can be cached:
//  - 'revalidate' (public/ static assets): these can change between app
//    updates without their URL changing, so nothing is cached blindly -
//    instead this sends Last-Modified and honors If-Modified-Since with a
//    304, so an unchanged file costs a small round trip instead of zero
//    bytes, but a *changed* file is never served stale.
//  - 'immutable' (uploaded receipts): each upload gets a fresh
//    crypto.randomUUID() filename and is never edited in place after that
//    (see lib/routes/expenses.js), so the content at a given URL genuinely
//    never changes - safe to tell the browser to cache it indefinitely and
//    skip the revalidation round trip entirely.
function sendFile(req, res, fullPath, cacheMode) {
  fs.stat(fullPath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }

    const ext = path.extname(fullPath);
    const headers = { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' };

    if (cacheMode === 'immutable') {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    } else {
      headers['Cache-Control'] = 'no-cache';
      const lastModified = stat.mtime.toUTCString();
      headers['Last-Modified'] = lastModified;
      if (req.headers['if-modified-since'] === lastModified) {
        res.writeHead(304, headers);
        return res.end();
      }
    }

    fs.readFile(fullPath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not found');
      }
      const acceptsGzip = (req.headers['accept-encoding'] || '').includes('gzip');
      if (acceptsGzip && GZIPPABLE_EXTS.has(ext)) {
        zlib.gzip(data, (gzErr, compressed) => {
          if (gzErr) { res.writeHead(200, headers); return res.end(data); }
          res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding' });
          res.end(compressed);
        });
      } else {
        res.writeHead(200, headers);
        res.end(data);
      }
    });
  });
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  if (filePath === '/request') filePath = '/request.html';
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(PUBLIC_DIR, filePath);

  // Prevent path traversal outside the public dir. Checking against
  // PUBLIC_DIR + separator (not just PUBLIC_DIR) matters: without the
  // trailing separator, a sibling folder like "public-evil" would also
  // pass a bare startsWith(PUBLIC_DIR) check since it shares the string
  // prefix, even though it's a completely different directory.
  if (fullPath !== PUBLIC_DIR && !fullPath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  sendFile(req, res, fullPath, 'revalidate');
}

// Serves uploaded files (expense receipts) from DATA_DIR/uploads/. Same
// path-traversal guard as serveStatic() above, against UPLOADS_DIR instead
// of PUBLIC_DIR - lib/routes/expenses.js only ever writes filenames it
// generated itself (a UUID + extension), but this endpoint parses whatever
// URL a client sends, so it can't assume that.
function serveUpload(req, res, pathname) {
  const rel = pathname.slice('/uploads/'.length);
  const filePath = path.normalize('/' + rel).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(UPLOADS_DIR, filePath);

  if (fullPath !== UPLOADS_DIR && !fullPath.startsWith(UPLOADS_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  sendFile(req, res, fullPath, 'immutable');
}

const server = http.createServer((req, res) => {
  // Cheap, no-downside defense-in-depth: stop the browser from guessing a
  // response's type into something more dangerous than what we declared,
  // and refuse to render inside a frame (this app was never meant to be
  // embedded, so there's no reason to allow the clickjacking surface).
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (!isPublicPath(pathname) && !isAuthorized(req)) return requireAuth(res);

  if (pathname.startsWith('/api/')) {
    // Belt-and-suspenders on top of handleApi's own try/catch: if anything
    // ever throws here without that catch seeing it, this stops a single
    // bad request from becoming an unhandled rejection that takes the
    // whole process down for every other user.
    return handleApi(req, res, pathname, url).catch((err) => {
      console.error(`[server] unexpected error handling ${req.method} ${pathname}:`, err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      } else {
        res.end();
      }
    });
  }

  if (pathname.startsWith('/uploads/')) {
    return serveUpload(req, res, pathname);
  }

  return serveStatic(req, res, pathname);
});

// Last-resort safety net. Everything above already handles its own errors
// per-request, but a single self-hosted process serving one shop has no
// redundancy - crashing on something unforeseen takes the whole app down
// until someone notices and restarts it. Logging and staying up is the
// better failure mode here.
process.on('unhandledRejection', (err) => {
  console.error('[server] unhandled rejection (recovered):', err);
});
process.on('uncaughtException', (err) => {
  console.error('[server] uncaught exception (recovered):', err);
});

// server.listen(PORT) with no host binds to every network interface (Node's
// default), not just localhost - the server was always reachable from other
// devices on the LAN. The missing piece was just telling you the URL to use,
// since "localhost" on a phone means the phone itself, not this computer.
function lanAddresses() {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const iface of Object.values(nets)) {
    for (const net of iface || []) {
      if (net.family === 'IPv4' && !net.internal) addrs.push(net.address);
    }
  }
  return addrs;
}

server.listen(PORT, () => {
  console.log(`Print Fleet Manager running at http://localhost:${PORT}`);
  const addrs = lanAddresses();
  if (addrs.length) {
    console.log('On your phone or another device on the same Wi-Fi/network, use instead:');
    addrs.forEach((addr) => console.log(`  http://${addr}:${PORT}`));
    console.log("If that still doesn't load, your computer's firewall is likely blocking incoming connections on this port - allow Node.js (or this port) through it for private/home networks.");
  }
  if (APP_PASSWORD) console.log('Password protection is ON (Basic Auth).');
  else console.log('Password protection is OFF - set APP_PASSWORD to enable it before deploying publicly (recommended once other devices can reach it).');
});
