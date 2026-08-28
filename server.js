// server.js
// Entry point. Plain node:http server - no framework, no build step.
// Run with: node server.js  (or: PORT=8080 node server.js)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleApi } = require('./lib/api');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Optional password gate. Unset by default (fine for local use on your own
// machine/network). If you deploy this somewhere public, set APP_PASSWORD
// (and optionally APP_USERNAME, default "admin") as environment variables
// and every request will require an HTTP Basic Auth login.
const APP_USERNAME = process.env.APP_USERNAME || 'admin';
const APP_PASSWORD = process.env.APP_PASSWORD || '';

function isAuthorized(req) {
  if (!APP_PASSWORD) return true; // no password configured - auth disabled
  const header = req.headers['authorization'] || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  return user === APP_USERNAME && pass === APP_PASSWORD;
}

function requireAuth(res) {
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="Print Fleet Manager"',
    'Content-Type': 'text/plain',
  });
  res.end('Authentication required');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(PUBLIC_DIR, filePath);

  // Prevent path traversal outside the public dir.
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (!isAuthorized(req)) return requireAuth(res);

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname, url);
  }

  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Print Fleet Manager running at http://localhost:${PORT}`);
  if (APP_PASSWORD) console.log('Password protection is ON (Basic Auth).');
  else console.log('Password protection is OFF - set APP_PASSWORD to enable it before deploying publicly.');
});
