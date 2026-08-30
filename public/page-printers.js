// public/page-printers.js

// The card is split into a static shell (name/model/hours/watts/actions -
// only ever needs a fresh render when the printer list itself changes) and
// a status region (badge/progress/temps/error - refreshed every 5s from
// live polling). Originally this was one big template re-rendered whole on
// every poll tick; at 5s intervals that's constant unnecessary DOM
// rebuilding (losing hover/transition state, plus the wasted work itself)
// for data that usually hasn't changed. applyPrinterStatusPatch() now
// patches just the two poll-sensitive spots, same pattern as Products'
// live totals block.

// Live status/print queue (job progress, nozzle/bed temps, connection
// errors) are deferred to a future "Bridge integration" pass - showing
// simulated progress bars and temps, or a raw fetch error from an
// unconfigured real connection, reads as broken/misleading rather than
// helpful. The card sticks to what's actually meaningful today: whether the
// printer is online.
function printerStatusPatchHtml(s) {
  const stateLabel = s.online ? (s.state || 'online') : 'offline';
  const badgeHtml = badge(stateLabel, s.online ? (s.state || 'online') : 'offline');
  return { badgeHtml, bodyHtml: '' };
}

function applyPrinterStatusPatch(printerId, s) {
  const badgeEl = document.getElementById(`printer-badge-${printerId}`);
  const bodyEl = document.getElementById(`printer-status-${printerId}`);
  if (!badgeEl || !bodyEl) return; // card isn't on screen (page navigated away)
  const { badgeHtml, bodyHtml } = printerStatusPatchHtml(s);
  badgeEl.innerHTML = badgeHtml;
  bodyEl.innerHTML = bodyHtml;
}

function printerCardHtml(printer) {
  const s = state.statuses[printer.id] || {};
  const { badgeHtml, bodyHtml } = printerStatusPatchHtml(s);
  return `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-weight:700; font-size:14.5px;">${escapeHtml(printer.name)}</div>
          <div class="muted" style="font-size:12px; margin-top:2px;">${escapeHtml(printer.model || '—')}</div>
        </div>
        <span id="printer-badge-${printer.id}">${badgeHtml}</span>
      </div>
      <div id="printer-status-${printer.id}">${bodyHtml}</div>
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

// Printer gets its own dedicated modal (not the generic openModal() field
// renderer) so it can show the two informational helper paragraphs in the
// exact spots the spec calls for - one right under Machine cost/Lifespan,
// one right under Notes - which the generic field-list renderer has no way
// to place. Connection type/Host/API key are gone entirely: live status and
// the print queue are deferred to a future "Bridge integration" (per spec),
// so every printer runs on the simulated "mock" adapter for now (see
// lib/printers/index.js) regardless of what's saved here.

let printerFormState = null;
let printerFormIsEdit = false;

function printerModalBodyHtml() {
  const p = printerFormState;
  return `
    <div class="field">
      <label>Name</label>
      <input type="text" id="pr-name" value="${escapeHtml(p.name || '')}" placeholder="Workhorse, Prusa #1, ..." required/>
    </div>
    <div class="field">
      <label>Model / hardware</label>
      <input type="text" id="pr-model" value="${escapeHtml(p.model || '')}" placeholder="Prusa MK4, Bambu X1C, ..."/>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Power draw (watts)</label>
        <input type="number" id="pr-powerDrawWatts" min="0" value="${p.powerDrawWatts ?? ''}" placeholder="e.g. 120"/>
      </div>
      <div class="field">
        <label>Print hours</label>
        <input type="number" id="pr-printHours" min="0" value="${p.printHours ?? 0}"/>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Machine cost</label>
        <input type="number" id="pr-machineCost" min="0" step="0.01" value="${p.machineCost ?? 0}"/>
      </div>
      <div class="field">
        <label>Lifespan (print hours)</label>
        <input type="number" id="pr-lifespanPrintHours" min="0" value="${p.lifespanPrintHours ?? 0}"/>
      </div>
    </div>
    <div class="field-hint" style="margin-top:-6px;">These power per-print machine depreciation in quotes; leave lifespan at 0 to skip depreciation.</div>
    <div class="field">
      <label>Notes</label>
      <textarea id="pr-notes" rows="3" placeholder="Nozzle size, mods, quirks, anything worth remembering...">${escapeHtml(p.notes || '')}</textarea>
    </div>
    <div class="field-hint">Power draw is used to estimate electricity cost on quotes. Live status and the print queue come from the Bridge integration (a later pass).</div>
  `;
}

function readPrinterFormValues() {
  const byId = (id) => document.getElementById(id);
  return {
    name: byId('pr-name').value,
    model: byId('pr-model').value,
    powerDrawWatts: byId('pr-powerDrawWatts').value === '' ? null : Number(byId('pr-powerDrawWatts').value),
    printHours: Number(byId('pr-printHours').value) || 0,
    machineCost: Number(byId('pr-machineCost').value) || 0,
    lifespanPrintHours: Number(byId('pr-lifespanPrintHours').value) || 0,
    notes: byId('pr-notes').value,
  };
}

function openPrinterModal(existing) {
  printerFormIsEdit = !!existing;
  printerFormState = existing ? { ...existing } : {
    name: '', model: '', powerDrawWatts: null, printHours: 0,
    machineCost: 0, lifespanPrintHours: 0, notes: '',
  };

  renderModalShell({
    title: printerFormIsEdit ? 'Edit printer' : 'New printer',
    subtitle: printerFormIsEdit ? undefined : 'Add a printer to your fleet to track hardware and print hours.',
    bodyHtml: printerModalBodyHtml(),
    footerHtml: `
      <button type="button" class="btn outline" id="pr-cancel">Cancel</button>
      <button type="button" class="btn" id="pr-submit">${printerFormIsEdit ? 'Save changes' : 'Create printer'}</button>
    `,
  });

  document.getElementById('pr-cancel').onclick = () => closeModal();
  document.getElementById('pr-submit').onclick = async () => {
    const values = readPrinterFormValues();
    if (!values.name.trim()) { showToast('Name is required', true); return; }
    try {
      if (printerFormIsEdit && printerFormState.id) {
        await api('PUT', `/api/printers/${printerFormState.id}`, values);
        showToast('Printer updated');
      } else {
        await api('POST', '/api/printers', values);
        showToast('Printer added');
      }
      closeModal();
      await refreshAndRerender();
    } catch (err) {
      showToast(err.message, true);
    }
  };
}

async function renderPrinters(navEpochAtStart = navEpoch) {
  await refreshStatuses();
  if (!isCurrentNav(navEpochAtStart)) return; // user already navigated elsewhere

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
    <div class="grid grid-3" id="printer-grid"></div>
  `;

  const grid = document.getElementById('printer-grid');
  grid.innerHTML = state.printers.length
    ? state.printers.map(printerCardHtml).join('')
    : `<div class="empty-state">No printers yet. Add your first printer to get live status.</div>`;

  wirePrinterCardActions();

  document.getElementById('add-printer').onclick = () => openPrinterModal();

  state.pollTimer = setInterval(async () => {
    if (state.page !== 'printers') return;
    await refreshStatuses();
    if (state.page !== 'printers') return;
    // Patch each card's status region in place rather than rebuilding the
    // whole grid - the shell (name/model/actions) never changes on a poll
    // tick, only the badge/progress/temps. If a printer was added/removed
    // while this page was open, refreshAndRerender() (called from the add/
    // edit/delete flows) already does a full renderPrinters() to rebuild
    // the shells - this loop only has to keep existing cards current.
    for (const p of state.printers) {
      applyPrinterStatusPatch(p.id, state.statuses[p.id] || {});
    }
  }, 5000);
}

function wirePrinterCardActions() {
  state.printers.forEach((p) => {
    const editBtn = document.querySelector(`[data-edit-printer="${p.id}"]`);
    const delBtn = document.querySelector(`[data-del-printer="${p.id}"]`);
    if (editBtn) editBtn.onclick = () => openPrinterModal(p);
    if (delBtn) delBtn.onclick = async () => {
      if (!confirm(`Delete printer "${p.name}"?`)) return;
      await api('DELETE', `/api/printers/${p.id}`);
      showToast('Printer deleted');
      await refreshAndRerender();
    };
  });
}

registerPage('printers', renderPrinters);
