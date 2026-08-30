// lib/routes/helpers.js
// Small, dependency-free HTTP response/body helpers shared by every route
// module in lib/routes/. Kept separate from lib/api.js (which used to hold
// all of this plus every route handler in one ~700-line file) so each
// domain's routes can be read, tested, and changed independently.

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

// Errors thrown/rejected with `expose: true` are safe, deliberately-worded
// validation messages that are fine to send back verbatim (e.g. "Body too
// large"). Anything else - a filesystem error, a bug's TypeError, whatever -
// gets logged server-side and replaced with a generic message before it
// reaches the client, since Node's own error messages routinely embed
// absolute server file paths and other internals that shouldn't leak to an
// anonymous caller (this endpoint set includes the unauthenticated public
// intake routes). See handleApi()'s catch block in lib/api.js for where
// `expose`/`statusCode` get read back out.
function exposedError(message, statusCode) {
  const err = new Error(message);
  err.expose = true;
  if (statusCode) err.statusCode = statusCode;
  return err;
}

// maxBytes is overridable per-route (see lib/routes/expenses.js) - expenses
// can carry up to 3 base64-encoded receipt files and need a much higher
// ceiling than every other route, which only ever sends plain form fields.
function readBody(req, maxBytes = 5_000_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > maxBytes) {
        req.destroy();
        reject(exposedError('Body too large'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(exposedError('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const clip = (v, max) => (v == null ? '' : String(v).slice(0, max));

module.exports = { send, notFound, exposedError, readBody, clip };
