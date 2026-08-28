// lib/printers/octoprint.js
// Talks to a real OctoPrint instance via its REST API.
// Docs: https://docs.octoprint.org/en/master/api/index.html
// Needs: printer.host (e.g. "http://octopi.local"), printer.apiKey

async function getStatus(printer) {
  const { host, apiKey } = printer;
  if (!host || !apiKey) {
    return { online: false, error: 'Missing host or API key' };
  }

  const headers = { 'X-Api-Key': apiKey };
  const base = host.replace(/\/$/, '');

  try {
    const [jobRes, printerRes] = await Promise.all([
      fetch(`${base}/api/job`, { headers, signal: AbortSignal.timeout(5000) }),
      fetch(`${base}/api/printer`, { headers, signal: AbortSignal.timeout(5000) }),
    ]);

    if (!jobRes.ok || !printerRes.ok) {
      // printerRes can 409 if printer is not operational yet - still "online"
      if (printerRes.status === 409) {
        const job = await jobRes.json().catch(() => ({}));
        return {
          online: true,
          state: 'not_operational',
          fileName: job?.job?.file?.name || null,
          progress: job?.progress?.completion || 0,
          timeLeftSeconds: job?.progress?.printTimeLeft ?? null,
        };
      }
      return { online: false, error: `HTTP ${jobRes.status}/${printerRes.status}` };
    }

    const job = await jobRes.json();
    const printerState = await printerRes.json();

    return {
      online: true,
      state: (printerState?.state?.text || 'Unknown').toLowerCase(),
      fileName: job?.job?.file?.name || null,
      progress: job?.progress?.completion || 0,
      timeLeftSeconds: job?.progress?.printTimeLeft ?? null,
      nozzleTemp: printerState?.temperature?.tool0?.actual ?? null,
      nozzleTarget: printerState?.temperature?.tool0?.target ?? null,
      bedTemp: printerState?.temperature?.bed?.actual ?? null,
      bedTarget: printerState?.temperature?.bed?.target ?? null,
    };
  } catch (err) {
    return { online: false, error: err.message };
  }
}

module.exports = { getStatus };
