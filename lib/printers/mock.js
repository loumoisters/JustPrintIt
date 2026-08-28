// lib/printers/mock.js
// Simulated printer so the dashboard is fully demoable with no real
// hardware. Progress advances deterministically based on wall-clock time
// since the linked job's startedAt, so refreshing the page shows sane values.

const db = require('../db');

async function getStatus(printer) {
  const orders = db.list('orders');
  const activeJob = orders.find(
    (o) => o.printerId === printer.id && o.status === 'printing'
  );

  if (!activeJob) {
    return {
      online: true,
      state: 'operational',
      fileName: null,
      progress: 0,
      timeLeftSeconds: null,
      nozzleTemp: 25,
      nozzleTarget: 0,
      bedTemp: 24,
      bedTarget: 0,
    };
  }

  const startedAt = activeJob.startedAt
    ? new Date(activeJob.startedAt).getTime()
    : Date.now();
  const elapsedSeconds = Math.max(0, (Date.now() - startedAt) / 1000);
  const estTotalSeconds = activeJob.estimatedSeconds || 3600;
  const progress = Math.min(100, (elapsedSeconds / estTotalSeconds) * 100);
  const timeLeftSeconds = Math.max(0, estTotalSeconds - elapsedSeconds);

  return {
    online: true,
    state: progress >= 100 ? 'operational' : 'printing',
    fileName: activeJob.fileName || null,
    progress,
    timeLeftSeconds,
    nozzleTemp: 210 + (Math.random() * 2 - 1),
    nozzleTarget: 210,
    bedTemp: 60 + (Math.random() * 1 - 0.5),
    bedTarget: 60,
  };
}

module.exports = { getStatus };
