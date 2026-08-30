// lib/routes/maintenance.js
// maintenanceLog reuses the generic collection CRUD for list/get/update/
// remove - this module only intercepts POST (create), so a log entry that
// completes a maintenance schedule can also update that schedule's service
// baseline in the same request.

const db = require('../db');
const { send, readBody } = require('./helpers');

// When a log entry is linked to a schedule (scheduleId set), that's the
// "service just happened" signal - record the service point on the
// schedule itself so its next-due calculation has a fresh baseline (a
// print-hours-based schedule needs the printer's print-hours *at that
// moment*, not just a date). See public/page-maintenance.js's
// scheduleStatus() for how these two fields get used.
async function handleCreateLog(req, res) {
  const body = await readBody(req);
  const created = await db.create('maintenanceLog', body);
  if (created.scheduleId) {
    const schedule = db.get('maintenanceSchedules', created.scheduleId);
    if (schedule) {
      const printer = db.get('printers', schedule.printerId);
      await db.update('maintenanceSchedules', schedule.id, {
        lastServicedAt: created.date || new Date().toISOString(),
        lastServicePrintHours: printer ? (Number(printer.printHours) || 0) : schedule.lastServicePrintHours,
      });
    }
  }
  send(res, 201, created);
}

async function tryHandle(ctx) {
  if (ctx.collection === 'maintenanceLog' && !ctx.idOrAction && ctx.method === 'POST') {
    await handleCreateLog(ctx.req, ctx.res);
    return true;
  }
  return false;
}

module.exports = { tryHandle };
