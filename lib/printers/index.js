// lib/printers/index.js
// Unified interface over the different printer backends. Every adapter
// returns the same shape from getStatus() so the UI doesn't care which
// firmware/host software a given printer runs.

const octoprint = require('./octoprint');
const moonraker = require('./moonraker');
const mock = require('./mock');

const ADAPTERS = {
  octoprint,
  moonraker,
  mock,
};

async function getStatus(printer) {
  // A printer created via the New Printer form has no `type` at all (that
  // field only appears when editing - see page-printers.js) - treat that,
  // and any other unrecognized value, as the simulated adapter rather than
  // surfacing an "unknown printer type" error for what's really just a
  // printer nobody's connected to real hardware yet.
  const adapter = ADAPTERS[printer.type] || ADAPTERS.mock;
  return adapter.getStatus(printer);
}

module.exports = { getStatus, SUPPORTED_TYPES: Object.keys(ADAPTERS) };
