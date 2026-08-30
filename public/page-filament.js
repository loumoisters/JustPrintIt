// public/page-filament.js
// Filament gets its own dedicated modal (not the generic resource-page
// modal) because it needs a side-by-side brand/material row, a custom
// RGB+hex color picker, and a calendar-button date picker for "Last dried"
// - none of which the generic openModal() field renderer supports.

let filamentFormState = null;
let filamentFormIsEdit = false;

// ---------- SpoolmanDB lookup (see lib/spoolmandb.js) ----------
// Autofill helper: search a locally-cached copy of the community SpoolmanDB
// filament database by brand/material/color and fill in the form instead of
// hand-typing every spec. Entirely optional - the form works fine without
// ever touching it.

let spoolmanCacheState = null; // { cached, count, fetchedAt } from the server
let spoolmanSearchTimer = null;

const MATERIAL_PALETTE = ['#8b5cf6', '#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#f97316'];

// hexToRgb/rgbToHex/colorSwatchPickerHtml/wireColorSwatchPicker live in
// core.js - shared with Settings > Appearance's accent color picker.

// ---------- Charts ----------

function filamentByFilamentSegments() {
  const groups = {};
  for (const s of state.spools) {
    const key = `${s.brand || 'Unknown'} · ${s.material || 'Unknown'} · ${s.color || 'Uncolored'}`;
    const weight = Number(s.remainingWeightGrams ?? s.totalWeightGrams) || 0;
    if (!groups[key]) groups[key] = { label: key, value: 0, color: s.colorHex || '#8b5cf6' };
    groups[key].value += weight;
  }
  return Object.values(groups).filter((g) => g.value > 0).sort((a, b) => b.value - a.value);
}

function filamentByMaterialSegments() {
  const groups = {};
  for (const s of state.spools) {
    const key = s.material || 'Unknown';
    const weight = Number(s.remainingWeightGrams ?? s.totalWeightGrams) || 0;
    if (!groups[key]) groups[key] = { label: key, value: 0 };
    groups[key].value += weight;
  }
  const list = Object.values(groups).filter((g) => g.value > 0).sort((a, b) => b.value - a.value);
  list.forEach((g, i) => { g.color = MATERIAL_PALETTE[i % MATERIAL_PALETTE.length]; });
  return list;
}

function filamentChartCardHtml(title, segments) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  return `
    <div class="card">
      <div class="stat-label" style="margin-bottom:14px;">${title}</div>
      ${total > 0 ? `
        <div style="display:flex; align-items:center; gap:20px;">
          <div style="position:relative; width:128px; height:128px; flex-shrink:0;">
            ${donutChartSvg(segments)}
            <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;">
              <div style="font-size:15px; font-weight:700;">${fmtGrams(total)}</div>
              <div class="muted" style="font-size:9px; letter-spacing:0.06em;">TOTAL</div>
            </div>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px; flex:1; min-width:0;">
            ${segments.slice(0, 6).map((seg) => `
              <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:12.5px;">
                <span style="display:flex; align-items:center; gap:7px; min-width:0;">
                  <span style="width:8px; height:8px; border-radius:999px; background:${seg.color}; flex-shrink:0;"></span>
                  <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(seg.label)}</span>
                </span>
                <span class="muted" style="flex-shrink:0;">${fmtGrams(seg.value)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : `<div class="empty-state" style="padding:24px 0;">No filament weight to chart yet.</div>`}
    </div>
  `;
}

// ---------- Color picker ----------

function colorPickerHtml(colorHex) {
  return `
    <div class="field">
      <label>Color</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="text" id="f-color" placeholder="e.g. Galaxy Purple" value="${escapeHtml(filamentFormState.color || '')}" style="flex:1;"/>
        ${colorSwatchPickerHtml('f-color', colorHex)}
      </div>
    </div>
  `;
}

function wireColorPicker() {
  wireColorSwatchPicker('f-color', (hex) => { filamentFormState.colorHex = hex; });
}

// ---------- SpoolmanDB lookup ----------

function spoolmanStatusLineHtml() {
  if (!spoolmanCacheState) return 'Checking SpoolmanDB…';
  if (!spoolmanCacheState.cached) {
    return `Filament database not synced yet. <a href="#" id="spoolman-sync-link">Sync now</a> (one-time download from the internet).`;
  }
  const when = spoolmanCacheState.fetchedAt ? new Date(spoolmanCacheState.fetchedAt).toLocaleDateString() : '—';
  return `${spoolmanCacheState.count.toLocaleString()} filaments synced · ${when} · <a href="#" id="spoolman-sync-link">Refresh</a>`;
}

function renderSpoolmanStatus() {
  const el = document.getElementById('spoolman-status');
  if (!el) return;
  el.innerHTML = spoolmanStatusLineHtml();
  const link = document.getElementById('spoolman-sync-link');
  if (link) {
    link.onclick = async (e) => {
      e.preventDefault();
      link.textContent = 'Syncing…';
      try {
        spoolmanCacheState = await api('POST', '/api/spoolmandb/refresh');
        showToast(`Synced ${spoolmanCacheState.count.toLocaleString()} filaments from SpoolmanDB`);
      } catch (err) {
        showToast(err.message, true);
      }
      renderSpoolmanStatus();
    };
  }
}

async function loadSpoolmanStatus() {
  try {
    spoolmanCacheState = await api('GET', '/api/spoolmandb/status');
  } catch {
    spoolmanCacheState = { cached: false, count: 0, fetchedAt: null };
  }
  renderSpoolmanStatus();
}

function spoolmanResultOptionHtml(r) {
  const dot = r.colorHex
    ? `<span style="width:9px; height:9px; border-radius:999px; background:${r.colorHex}; border:1px solid var(--border); flex-shrink:0; display:inline-block;"></span>`
    : `<span style="width:9px; height:9px; flex-shrink:0;"></span>`;
  const meta = [r.material, r.diameter ? `${r.diameter}mm` : null, r.weight ? `${r.weight}g` : null].filter(Boolean).join(' · ');
  return `
    <div class="combobox-option" data-spoolman-result="${escapeHtml(r.id)}" style="display:flex; align-items:center; gap:8px;">
      ${dot}
      <span style="flex:1; min-width:0;">
        <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(r.manufacturer)} — ${escapeHtml(r.name)}</div>
        <div class="muted" style="font-size:11px;">${escapeHtml(meta)}</div>
      </span>
    </div>
  `;
}

function applySpoolmanResult(r) {
  const byId = (id) => document.getElementById(id);
  if (r.manufacturer) byId('f-brand').value = r.manufacturer;
  if (r.material) byId('f-material').value = r.material;
  if (r.name) byId('f-color').value = r.name;
  if (r.colorHex) {
    filamentFormState.colorHex = r.colorHex;
    const native = byId('f-color-native');
    const hexField = byId('f-color-hex');
    if (native) native.value = r.colorHex;
    if (hexField) hexField.value = r.colorHex;
  }
  if (r.diameter) byId('f-diameterMm').value = r.diameter;
  if (r.spoolWeight) byId('f-spoolWeightGrams').value = r.spoolWeight;
  if (r.weight) {
    byId('f-totalWeightGrams').value = r.weight;
    // Only overwrite "remaining" for a brand-new spool - editing an existing
    // one shouldn't silently reset how much filament is left on it.
    if (!filamentFormIsEdit) byId('f-remainingWeightGrams').value = r.weight;
  }
  if (r.extruderTemp) byId('f-extruderTempC').value = r.extruderTemp;
  if (r.bedTemp) byId('f-bedTempC').value = r.bedTemp;

  const panel = document.getElementById('spoolman-panel');
  if (panel) { panel.innerHTML = ''; panel.style.display = 'none'; }
  const searchInput = document.getElementById('f-spoolman-search');
  if (searchInput) searchInput.value = `${r.manufacturer} — ${r.name}`;
  showToast('Filled in from SpoolmanDB');
}

let _spoolmanOutsideClickCleanup = null;

function wireSpoolmanSearch() {
  const input = document.getElementById('f-spoolman-search');
  const panel = document.getElementById('spoolman-panel');
  if (!input || !panel) return;

  input.oninput = () => {
    clearTimeout(spoolmanSearchTimer);
    const q = input.value.trim();
    if (q.length < 2) { panel.innerHTML = ''; panel.style.display = 'none'; return; }
    spoolmanSearchTimer = setTimeout(async () => {
      let data;
      try {
        data = await api('GET', `/api/spoolmandb/search?q=${encodeURIComponent(q)}`);
      } catch {
        return;
      }
      // A stale response landing after the user kept typing shouldn't clobber
      // a newer, more specific result set.
      if (input.value.trim() !== q) return;
      spoolmanCacheState = { cached: data.cached, count: data.count, fetchedAt: data.fetchedAt };
      renderSpoolmanStatus();
      if (!data.results.length) {
        panel.innerHTML = data.cached
          ? `<div class="combobox-option muted">No matches</div>`
          : `<div class="combobox-option muted">Filament database not synced yet - see "Sync now" above</div>`;
        panel.style.display = 'block';
        return;
      }
      panel.innerHTML = data.results.map(spoolmanResultOptionHtml).join('');
      panel.style.display = 'block';
      panel.querySelectorAll('[data-spoolman-result]').forEach((el, i) => {
        el.onclick = () => applySpoolmanResult(data.results[i]);
      });
    }, 300);
  };

  if (_spoolmanOutsideClickCleanup) document.removeEventListener('mousedown', _spoolmanOutsideClickCleanup);
  _spoolmanOutsideClickCleanup = (e) => {
    if (!input.contains(e.target) && !panel.contains(e.target)) { panel.innerHTML = ''; panel.style.display = 'none'; }
  };
  document.addEventListener('mousedown', _spoolmanOutsideClickCleanup);
}

// ---------- Modal ----------

function filamentModalBodyHtml() {
  const s = filamentFormState;
  return `
    <div class="field">
      <label>Look up in SpoolmanDB <span class="muted" style="font-weight:400;">(optional)</span></label>
      <div class="combobox" id="spoolman-combobox">
        <input type="text" id="f-spoolman-search" class="combobox-input" placeholder="Search by brand, material, or color…" autocomplete="off"/>
        <div id="spoolman-panel" class="combobox-panel" style="display:none;"></div>
      </div>
      <div class="muted" id="spoolman-status" style="font-size:11.5px; margin-top:4px;"></div>
    </div>
    <div class="field">
      <label>Spool #</label>
      <input type="text" id="f-spoolNumber" value="${escapeHtml(s.spoolNumber || '')}"/>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Brand</label>
        <input type="text" id="f-brand" value="${escapeHtml(s.brand || '')}" required/>
      </div>
      <div class="field">
        <label>Material</label>
        <input type="text" id="f-material" value="${escapeHtml(s.material || '')}" required/>
      </div>
    </div>
    ${colorPickerHtml(s.colorHex || '#8b5cf6')}
    <div class="field-row">
      <div class="field">
        <label>Weight (g)</label>
        <input type="number" id="f-totalWeightGrams" value="${s.totalWeightGrams ?? 1000}" min="0"/>
      </div>
      <div class="field">
        <label>Remaining weight (g)</label>
        <input type="number" id="f-remainingWeightGrams" value="${s.remainingWeightGrams ?? 1000}" min="0"/>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Diameter (mm)</label>
        <input type="number" id="f-diameterMm" value="${s.diameterMm ?? 1.75}" min="0" step="0.01"/>
      </div>
      <div class="field">
        <label>Spool weight (g)</label>
        <input type="number" id="f-spoolWeightGrams" value="${s.spoolWeightGrams ?? 200}" min="0"/>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Low stock threshold (g)</label>
        <input type="number" id="f-lowStockThresholdGrams" value="${s.lowStockThresholdGrams ?? 100}" min="0"/>
      </div>
      <div class="field">
        <label>Unit price</label>
        <input type="number" id="f-spoolPrice" value="${s.spoolPrice ?? ''}" min="0" step="0.01"/>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Extruder temp (°C)</label>
        <input type="number" id="f-extruderTempC" value="${s.extruderTempC ?? ''}" min="0"/>
      </div>
      <div class="field">
        <label>Bed temp (°C)</label>
        <input type="number" id="f-bedTempC" value="${s.bedTempC ?? ''}" min="0"/>
      </div>
    </div>
    <div class="field">
      <label>Last dried</label>
      <div class="date-input-wrap">
        <input type="date" id="f-lastDriedAt" value="${s.lastDriedAt || ''}"/>
        <button type="button" class="date-picker-btn" data-date-btn="f-lastDriedAt" title="Pick a date">${icon('calendar', 15)}</button>
      </div>
    </div>
    <div class="field">
      <label>Storage location</label>
      <input type="text" id="f-location" value="${escapeHtml(s.location || '')}"/>
    </div>
    <div class="field">
      <label>Notes</label>
      <textarea id="f-notes" rows="3">${escapeHtml(s.notes || '')}</textarea>
    </div>
  `;
}

function readFilamentFormValues() {
  const byId = (id) => document.getElementById(id);
  return {
    spoolNumber: byId('f-spoolNumber').value,
    brand: byId('f-brand').value,
    material: byId('f-material').value,
    color: byId('f-color').value,
    colorHex: filamentFormState.colorHex || '#8b5cf6',
    totalWeightGrams: Number(byId('f-totalWeightGrams').value) || 0,
    remainingWeightGrams: Number(byId('f-remainingWeightGrams').value) || 0,
    diameterMm: Number(byId('f-diameterMm').value) || 0,
    spoolWeightGrams: Number(byId('f-spoolWeightGrams').value) || 0,
    lowStockThresholdGrams: Number(byId('f-lowStockThresholdGrams').value) || 0,
    spoolPrice: byId('f-spoolPrice').value === '' ? null : Number(byId('f-spoolPrice').value),
    extruderTempC: byId('f-extruderTempC').value === '' ? null : Number(byId('f-extruderTempC').value),
    bedTempC: byId('f-bedTempC').value === '' ? null : Number(byId('f-bedTempC').value),
    lastDriedAt: byId('f-lastDriedAt').value || null,
    location: byId('f-location').value,
    notes: byId('f-notes').value,
  };
}

// opts: { rootId, stacked, onSaved(record) } - onSaved lets a caller (e.g.
// the Quotes line-item material combobox's "Add new filament" quick-add)
// hook into a successful save without this module knowing about quotes.
function openFilamentModal(existing, opts = {}) {
  filamentFormIsEdit = !!existing;
  filamentFormState = existing ? { ...existing } : {
    spoolNumber: nextNumber('filamentNumberPrefix', state.spools, 'spoolNumber'),
    brand: '', material: '', color: '', colorHex: '#8b5cf6',
    totalWeightGrams: 1000, remainingWeightGrams: 1000,
    diameterMm: 1.75, spoolWeightGrams: 200,
    lowStockThresholdGrams: 100, spoolPrice: null,
    extruderTempC: null, bedTempC: null,
    lastDriedAt: '', location: '', notes: '',
  };

  const rootId = opts.rootId || 'modal-root';
  const suffix = rootSuffix(rootId);

  renderModalShell({
    title: filamentFormIsEdit ? 'Edit filament' : 'New filament',
    rootId,
    stacked: opts.stacked,
    bodyHtml: filamentModalBodyHtml(),
    footerHtml: `
      <button type="button" class="btn outline" id="f-cancel${suffix}">Cancel</button>
      <button type="button" class="btn" id="f-submit${suffix}">${filamentFormIsEdit ? 'Save changes' : 'Add filament'}</button>
    `,
  });

  wireColorPicker();
  wireSpoolmanSearch();
  loadSpoolmanStatus();

  document.querySelectorAll('[data-date-btn]').forEach((btn) => {
    btn.onclick = () => {
      const input = document.getElementById(btn.dataset.dateBtn);
      if (!input) return;
      if (input.showPicker) { try { input.showPicker(); } catch { input.focus(); } } else { input.focus(); }
    };
  });

  document.getElementById(`f-cancel${suffix}`).onclick = () => closeModal(rootId);
  document.getElementById(`f-submit${suffix}`).onclick = async () => {
    const values = readFilamentFormValues();
    if (!values.brand.trim() || !values.material.trim()) {
      showToast('Brand and material are required', true);
      return;
    }
    try {
      let record;
      if (filamentFormIsEdit && filamentFormState.id) {
        record = await api('PUT', `/api/spools/${filamentFormState.id}`, values);
        showToast('Filament updated');
      } else {
        record = await api('POST', '/api/spools', values);
        state.spools.push(record);
        showToast('Filament added');
      }
      closeModal(rootId);
      if (opts.onSaved) {
        await opts.onSaved(record);
      } else {
        await refreshAndRerender();
      }
    } catch (err) {
      showToast(err.message, true);
    }
  };
}

// ---------- List page ----------

async function renderFilament() {
  const main = document.getElementById('main');
  const items = state.spools;

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Filament</h1>
        <p class="page-subtitle">Spools, materials, and stock levels.</p>
      </div>
      <div class="page-actions">
        <button class="btn outline" disabled title="Demo app">Filament catalog</button>
        <button class="btn outline" disabled title="Demo app">Log usage</button>
        <button class="btn outline" disabled title="Demo app">Import CSV</button>
        <button class="btn brand" id="add-filament">+ New filament</button>
      </div>
    </div>
    <div class="grid grid-2" style="margin-bottom:20px;">
      ${filamentChartCardHtml('By filament (brand · material · color)', filamentByFilamentSegments())}
      ${filamentChartCardHtml('By material', filamentByMaterialSegments())}
    </div>
    <div class="card" id="filament-table"></div>
  `;

  const tableEl = document.getElementById('filament-table');
  if (!items.length) {
    tableEl.innerHTML = `<div class="empty-state">No filament yet. Add your first spool to start tracking stock.</div>`;
  } else {
    const rows = items.map((s) => {
      const low = s.remainingWeightGrams <= (s.lowStockThresholdGrams ?? 100);
      return `
        <tr>
          <td>${escapeHtml(s.spoolNumber || '—')}</td>
          <td>${escapeHtml(s.brand)}</td>
          <td>${escapeHtml(s.material)}</td>
          <td><span style="display:inline-flex; align-items:center; gap:6px;"><span style="width:10px; height:10px; border-radius:999px; background:${s.colorHex || '#8b5cf6'}; display:inline-block; flex-shrink:0;"></span>${escapeHtml(s.color || '—')}</span></td>
          <td><span class="${low ? 'low-stock' : ''}">${fmtGrams(s.remainingWeightGrams)} / ${fmtGrams(s.totalWeightGrams)}</span></td>
          <td>${escapeHtml(s.location || '—')}</td>
          <td>${s.lastDriedAt ? fmtDate(s.lastDriedAt) : '—'}</td>
          <td>${s.spoolPrice != null ? money(s.spoolPrice) : '—'}</td>
          <td>
            <div class="row-actions">
              <button class="btn outline small" data-edit-spool="${s.id}">${icon('edit', 13)}</button>
              <button class="btn outline small" data-del-spool="${s.id}">${icon('trash', 13)}</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tableEl.innerHTML = `
      <table>
        <thead><tr><th>Spool #</th><th>Brand</th><th>Material</th><th>Color</th><th>Weight (g)</th><th>Location</th><th>Last dried</th><th>Unit price</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    items.forEach((s) => {
      const editBtn = tableEl.querySelector(`[data-edit-spool="${s.id}"]`);
      const delBtn = tableEl.querySelector(`[data-del-spool="${s.id}"]`);
      if (editBtn) editBtn.onclick = () => openFilamentModal(s);
      if (delBtn) delBtn.onclick = async () => {
        if (!confirm('Delete this spool?')) return;
        await api('DELETE', `/api/spools/${s.id}`);
        showToast('Filament deleted');
        await refreshAndRerender();
      };
    });
  }

  document.getElementById('add-filament').onclick = () => openFilamentModal();
}

registerPage('filament', renderFilament);
