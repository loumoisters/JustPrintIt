// public/core.js
// Shared state, API helper, formatting, modal/toast, icons, and the sidebar
// router. Loaded first; every other page-*.js file relies on these globals.

const state = {
  customers: [], quotes: [], orders: [], invoices: [], printers: [],
  maintenanceSchedules: [], maintenanceLog: [], spools: [], products: [],
  inventoryItems: [], expenses: [], settings: {},
  statuses: {},
  page: 'dashboard',
  pollTimer: null,
};

const ORDER_STATUSES = ['pending', 'printing', 'post_processing', 'fulfilled', 'cancelled'];
const ORDER_STATUS_LABELS = {
  pending: 'Pending', printing: 'Printing', post_processing: 'Post-Processing',
  fulfilled: 'Fulfilled', cancelled: 'Cancelled',
};

// ---------- API helper ----------

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------- Toast ----------

function showToast(msg, isError) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  if (isError) el.style.borderColor = 'var(--status-red-fg)';
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ---------- Modal ----------

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

// fields: [{name, label, type: 'text'|'number'|'select'|'textarea'|'date'|'checkbox', options?, required?, value?}]
// opts: {subtitle, submitLabel}
function openModal(title, fields, onSubmit, opts = {}) {
  const fieldsHtml = fields.map((f) => {
    const val = f.value ?? '';
    if (f.type === 'select') {
      const optsHtml = f.options.map((o) => `<option value="${escapeHtml(o.value)}" ${String(o.value) === String(val) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
      return `<div class="field"><label>${f.label}</label><select name="${f.name}">${optsHtml}</select></div>`;
    }
    if (f.type === 'textarea') {
      return `<div class="field"><label>${f.label}</label><textarea name="${f.name}" rows="3">${escapeHtml(val)}</textarea></div>`;
    }
    if (f.type === 'checkbox') {
      return `<div class="field toggle-row"><label class="switch"><input type="checkbox" name="${f.name}" ${val ? 'checked' : ''}/><span class="slider-track"></span></label><span class="toggle-label">${f.label}</span></div>`;
    }
    return `<div class="field"><label>${f.label}</label><input name="${f.name}" type="${f.type || 'text'}" value="${escapeHtml(val)}" ${f.required ? 'required' : ''} ${f.step ? `step="${f.step}"` : ''}/></div>`;
  }).join('');

  renderModalShell({
    title,
    subtitle: opts.subtitle,
    bodyHtml: `<form id="modal-form">${fieldsHtml}</form>`,
    footerHtml: `
      <button type="button" class="btn outline" id="modal-cancel">Cancel</button>
      <button type="submit" form="modal-form" class="btn" id="modal-submit">${opts.submitLabel || 'Save'}</button>
    `,
  });

  document.getElementById('modal-cancel').onclick = closeModal;
  document.getElementById('modal-form').onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {};
    for (const f of fields) {
      if (f.type === 'checkbox') {
        data[f.name] = formData.get(f.name) === 'on';
        continue;
      }
      let v = formData.get(f.name);
      if (f.type === 'number') v = v === '' || v === null ? null : Number(v);
      data[f.name] = v;
    }
    try {
      await onSubmit(data);
      closeModal();
    } catch (err) {
      showToast(err.message, true);
    }
  };
}

// Low-level modal shell used by openModal() and by custom modals (like the
// quote calculator) that need full control over their body markup.
// config: {title, subtitle, wide, twoCol, bodyHtml, footerHtml}
function renderModalShell(config) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal ${config.wide ? 'modal-wide' : ''}">
        <div class="modal-header">
          <div>
            <h3>${escapeHtml(config.title)}</h3>
            ${config.subtitle ? `<div class="modal-subtitle">${escapeHtml(config.subtitle)}</div>` : ''}
          </div>
          <button type="button" class="modal-close" id="modal-close-x" aria-label="Close">${icon('x', 18)}</button>
        </div>
        <div class="modal-body ${config.twoCol ? 'modal-two-col' : ''}">${config.bodyHtml}</div>
        ${config.footerHtml ? `<div class="modal-actions">${config.footerHtml}</div>` : ''}
      </div>
    </div>
  `;
  document.getElementById('modal-close-x').onclick = closeModal;
  document.getElementById('modal-backdrop').onclick = (e) => { if (e.target.id === 'modal-backdrop') closeModal(); };
}

// ---------- Formatting ----------

function money(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', { style: 'currency', currency: state.settings.currency || 'USD' });
}

function fmtPct(n) { return `${Math.round(n || 0)}%`; }

function fmtDuration(seconds) {
  if (seconds == null) return '–';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtMinutes(mins) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtGrams(g) {
  if (g == null) return '–';
  return `${Math.round(g)} g`;
}

function fmtDate(d) {
  if (!d) return '–';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function badge(text, cls) {
  const c = cls || (text || '').toString().toLowerCase().replace(/\s+/g, '_');
  return `<span class="badge ${c}">${escapeHtml(text)}</span>`;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
}

// ---------- Icons (subset of lucide, inlined as SVG strings) ----------

const ICONS = {
  dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  quotes: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><polyline points="14 2 14 8 20 8"/><path d="M10 12h4M10 16h4M10 8h1"/>',
  orders: '<path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/>',
  invoices: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  customers: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  printers: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  maintenance: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  filament: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>',
  products: '<path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
  inventory: '<path d="M20 7h-9M14 17H5M17 3v20"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  expenses: '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  reports: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  edit: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
};

function icon(name, size = 16) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

// ---------- Data loading ----------

async function loadAll() {
  const [
    customers, quotes, orders, invoices, printersList,
    maintenanceSchedules, maintenanceLog, spools, products, inventoryItems, expenses, settings,
  ] = await Promise.all([
    api('GET', '/api/customers'),
    api('GET', '/api/quotes'),
    api('GET', '/api/orders'),
    api('GET', '/api/invoices'),
    api('GET', '/api/printers'),
    api('GET', '/api/maintenanceSchedules'),
    api('GET', '/api/maintenanceLog'),
    api('GET', '/api/spools'),
    api('GET', '/api/products'),
    api('GET', '/api/inventoryItems'),
    api('GET', '/api/expenses'),
    api('GET', '/api/settings'),
  ]);
  Object.assign(state, {
    customers, quotes, orders, invoices, printers: printersList,
    maintenanceSchedules, maintenanceLog, spools, products, inventoryItems, expenses, settings,
  });
}

async function refreshStatuses() {
  if (state.printers.length === 0) return;
  const results = await api('GET', '/api/printers/status');
  const map = {};
  for (const r of results) map[r.printerId] = r;
  state.statuses = map;
}

function customerName(id) {
  return state.customers.find((c) => c.id === id)?.name || '—';
}

function printerName(id) {
  return state.printers.find((p) => p.id === id)?.name || '—';
}

// ---------- Router ----------

const PAGES = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'quotes', label: 'Quotes', icon: 'quotes' },
  { key: 'orders', label: 'Orders', icon: 'orders' },
  { key: 'invoices', label: 'Invoices', icon: 'invoices' },
  { key: 'customers', label: 'Customers', icon: 'customers' },
  { key: 'printers', label: 'Printers', icon: 'printers' },
  { key: 'maintenance', label: 'Maintenance', icon: 'maintenance' },
  { key: 'filament', label: 'Filament', icon: 'filament' },
  { key: 'products', label: 'Products', icon: 'products' },
  { key: 'inventory', label: 'Inventory', icon: 'inventory' },
  { key: 'expenses', label: 'Expenses', icon: 'expenses' },
  { key: 'reports', label: 'Reports', icon: 'reports' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

function renderSidebar() {
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = PAGES.map((p) => `
    <div class="nav-item ${p.key === state.page ? 'active' : ''}" data-page="${p.key}">
      ${icon(p.icon)}<span>${p.label}</span>
    </div>
  `).join('');
  nav.querySelectorAll('.nav-item').forEach((el) => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });
}

const PAGE_RENDERERS = {}; // populated by page-*.js files via registerPage()

function registerPage(key, fn) {
  PAGE_RENDERERS[key] = fn;
}

async function navigate(page) {
  state.page = page;
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.page === page));
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }

  await loadAll();
  const renderer = PAGE_RENDERERS[page];
  if (renderer) {
    await renderer();
  } else {
    document.getElementById('main').innerHTML = `<div class="empty-state">Page not implemented.</div>`;
  }
}

function initShell() {
  renderSidebar();
  const footer = document.getElementById('sidebar-footer');
  footer.innerHTML = `
    <div class="avatar">${initials(state.settings.contactEmail || 'You')}</div>
    <div style="min-width:0;">
      <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(state.settings.workspaceName || 'My Workspace')}</div>
      <div class="muted" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:11px;">${escapeHtml(state.settings.contactEmail || '')}</div>
    </div>
  `;
}
