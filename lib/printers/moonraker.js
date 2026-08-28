// lib/printers/moonraker.js
// Talks to a Klipper printer via its Moonraker REST API.
// Docs: https://moonraker.readthedocs.io/en/latest/web_api/
// Needs: printer.host (e.g. "http://klipper.local:7125"), printer.apiKey (optional, only if trusted-client auth is off)

async function getStatus(printer) {
  const { host, apiKey } = printer;
  if (!host) return { online: false, error: 'Missing host' };

  const headers = apiKey ? { 'X-Api-Key': apiKey } : {};
  const base = host.replace(/\/$/, '');
  const query =
    'print_stats&extruder&heater_bed&virtual_sdcard&display_status';

  try {
    const res = await fetch(
      `${base}/printer/objects/query?${query}`,
      { headers, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return { online: false, error: `HTTP ${res.status}` };

    const body = await res.json();
    const s = body?.result?.status || {};
    const printStats = s.print_stats || {};
    const virtualSd = s.virtual_sdcard || {};
    const display = s.display_status || {};

    return {
      online: true,
      state: (printStats.state || 'unknown').toLowerCase(),
      fileName: printStats.filename || null,
      progress: (virtualSd.progress ?? display.progress ?? 0) * 100,
      timeLeftSeconds:
        printStats.print_duration && virtualSd.progress
          ? Math.round(
              (printStats.print_duration / Math.max(virtualSd.progress, 0.0001)) *
                (1 - virtualSd.progress)
            )
          : null,
      nozzleTemp: s.extruder?.temperature ?? null,
      nozzleTarget: s.extruder?.target ?? null,
      bedTemp: s.heater_bed?.temperature ?? null,
      bedTarget: s.heater_bed?.target ?? null,
    };
  } catch (err) {
    return { online: false, error: err.message };
  }
}

module.exports = { getStatus };
