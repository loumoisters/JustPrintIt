// public/page-printers.js

let printersView = 'fleet'; // 'fleet' | 'live'

function printerCardHtml(printer) {
  const s = state.statuses[printer.id] || {};
  const stateLabel = s.online ? (s.state || 'online') : 'offline';
  return `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-weight:700; font-size:14.5px;">${escapeHtml(printer.name)}</div>
          <div class="muted" style="font-size:12px; margin-top:2px;">${escapeHtml(printer.model || printer.type)}</div>
        </div>
        ${badge(stateLabel, s.online ? (s.state || 'online') : 'offline')}
      </div>
      ${printersView === 'live' && s.online && s.fileName ? `
        <div style="margin-top:10px; font-size:12px;">${escapeHtml(s.fileName)}</div>
        <div class="progress-track"><div class="progress-fill" style="width:${s.progress || 0}%"></div></div>
        <div class="muted" style="margin-top:4px; font-size:11.5px;">${fmtPct(s.progress)} • ${fmtDuration(s.timeLeftSeconds)} left</div>
      ` : ''}
      ${printersView === 'live' && s.online && !s.error ? `
        <div style="display:flex; gap:14px; margin-top:10px; font-size:12px; color:var(--muted-foreground);">
          <span>Nozzle ${s.nozzleTemp != null ? Math.round(s.nozzleTemp) + '°' : '–'}</span>
          <span>Bed ${s.bedTemp != null ? Math.round(s.bedTemp) + '°' : '–'}</span>
        </div>
      ` : ''}
      ${s.error ? `<div class="muted" style="color:var(--status-red-fg); margin-top:8px; font-size:11.5px;">${escapeHtml(s.error)}</div>` : ''}
      <div class="muted" style="margin-top:12px; font-size:11.5px; display:flex; justify-content:space-between;">
        <span>${printer.printHours != null ? `${printer.printHours} h` : '—'}</span>
        <span>${printer.powerDrawWatts != null ? `${printer.powerDrawWatts} W` : ''}</span>
      </div>
      <div class="row-actions" style="margin-top:10px;">
        <button class="btn outline small" data-edit-printer="${printer.id}">Edit</button>
        <button class="btn outline small" data-del-printer="${printer.id}">Delete</button>
      </div>
    </div>
  `;
}

function printerFormFields(printer = {}) {
  return [
    { name: 'name', label: 'Name', required: true, value: printer.name },
    { name: 'model', label: 'Model (e.g. Bambu H2C)', value: printer.model },
    {
      name: 'type', label: 'Connection type', type: 'select', value: printer.type || 'mock',
      options: [
        { value: 'mock', label: 'Demo / simulated' },
        { value: 'octoprint', label: 'OctoPrint' },
        { value: 'moonraker', label: 'Klipper (Moonraker)' },
      ],
    },
    { name: 'host', label: 'Host URL (e.g. http://octopi.local)', value: printer.host },
    { name: 'apiKey', label: 'API Key (if required)', value: printer.apiKey },
    { name: 'powerDrawWatts', label: 'Power draw (W)', type: 'number', value: printer.powerDrawWatts },
    { name: 'printHours', label: 'Total print hours', type: 'number', value: printer.printHours },
    { name: 'notes', label: 'Notes', type: 'textarea', value: printer.notes },
  ];
}

async function renderPrinters() {
  await refreshStatuses();
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Printers</h1>
        <p class="page-subtitle">Your fleet: hardware, power draw, and print hours.</p>
      </div>
      <div class="page-actions">
        <button class="btn brand" id="add-printer">+ New printer</button>
      </div>
    </div>
    <div class="pill-tabs">
      <div class="pill-tab ${printersView === 'fleet' ? 'active' : ''}" data-view="fleet">Fleet</div>
      <div class="pill-tab ${printersView === 'live' ? 'active' : ''}" data-view="live">Live</div>
    </div>
    <div class="grid grid-3" id="printer-grid"></div>
  `;

  document.querySelectorAll('.pill-tab').forEach((el) => {
    el.onclick = () => { printersView = el.dataset.view; renderPrinters(); };
  });

  const grid = document.getElementById('printer-grid');
  grid.innerHTML = state.printers.length
    ? state.printers.map(printerCardHtml).join('')
    : `<div class="empty-state">No printers yet. Add your first printer to get live status.</div>`;

  wirePrinterCardActions();

  document.getElementById('add-printer').onclick = () => {
    openModal('New Printer', printerFormFields(), async (data) => {
      await api('POST', '/api/printers', data);
      showToast('Printer added');
      await renderPrinters();
    });
  };

  if (printersView === 'live') {
    state.pollTimer = setInterval(async () => {
      await refreshStatuses();
      grid.innerHTML = state.printers.map(printerCardHtml).join('');
      wirePrinterCardActions();
    }, 5000);
  }
}

function wirePrinterCardActions() {
  state.printers.forEach((p) => {
    const editBtn = document.querySelector(`[data-edit-printer="${p.id}"]`);
    const delBtn = document.querySelector(`[data-del-printer="${p.id}"]`);
    if (editBtn) editBtn.onclick = () => openModal('Edit Printer', printerFormFields(p), async (data) => {
      await api('PUT', `/api/printers/${p.id}`, data);
      showToast('Printer updated');
      await renderPrinters();
    });
    if (delBtn) delBtn.onclick = async () => {
      if (!confirm(`Delete printer "${p.name}"?`)) return;
      await api('DELETE', `/api/printers/${p.id}`);
      showToast('Printer deleted');
      await renderPrinters();
    };
  });
}

registerPage('printers', renderPrinters);
