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
  const adapter = ADAPTERS[printer.type];
  if (!adapter) {
    return { online: false, error: `Unknown printer type "${printer.type}"` };
  }
  return adapter.getStatus(printer);
}

module.exports = { getStatus, SUPPORTED_TYPES: Object.keys(ADAPTERS) };
