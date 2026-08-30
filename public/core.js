// public/core.js
// Shared state, API helper, formatting, modal/toast, icons, and the sidebar
// router. Loaded first; every other page-*.js file relies on these globals.

const state = {
  customers: [], quotes: [], orders: [], invoices: [], printers: [],
  maintenanceSchedules: [], maintenanceLog: [], spools: [], products: [],
  inventoryItems: [], expenses: [], quoteRequests: [], settings: {},
  statuses: {},
  page: 'dashboard',
  pollTimer: null,
};

const ORDER_STATUSES = ['pending', 'printing', 'post_processing', 'fulfilled', 'cancelled'];
const ORDER_STATUS_LABELS = {
  pending: 'Pending', printing: 'Printing', post_processing: 'Post-Processing',
  fulfilled: 'Fulfilled', cancelled: 'Cancelled',
};
// Dot colors for the Active Orders donut chart / kanban column headers.
const ORDER_STATUS_DOT = {
  pending: 'var(--status-purple-fg)',
  printing: 'var(--status-amber-fg)',
  post_processing: 'var(--status-blue-fg)',
  fulfilled: 'var(--status-green-fg)',
  cancelled: 'var(--status-red-fg)',
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

// Modals normally render into #modal-root. A second root (#modal-root-2)
// exists for a modal opened from within another modal (e.g. "Add new
// customer" from inside the New Quote drawer) so it layers on top instead
// of replacing the one underneath. Every element id renderModalShell/
// openModal create is suffixed per-root so the two can be open at once
// without id collisions.
function rootSuffix(rootId) {
  return rootId === 'modal-root' ? '' : `-${rootId}`;
}

// Slides the drawer back out to the right (and fades its backdrop) before
// actually clearing it from the DOM, instead of just vanishing instantly.
function closeModal(rootId = 'modal-root') {
  const root = document.getElementById(rootId);
  if (!root) return;
  const backdrop = root.querySelector('.modal-backdrop');
  const modal = root.querySelector('.modal');
  if (!backdrop || !modal) { root.innerHTML = ''; return; }

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    root.innerHTML = '';
  };

  backdrop.classList.add('closing');
  modal.classList.add('closing');
  modal.addEventListener('animationend', finish, { once: true });
  setTimeout(finish, 220); // fallback in case the animation event doesn't fire
}

// fields: [{name, label, type: 'text'|'number'|'select'|'textarea'|'date'|'checkbox', options?, required?, value?}]
// opts: {subtitle, submitLabel, rootId, stacked, skipAutoClose}
function openModal(title, fields, onSubmit, opts = {}) {
  const rootId = opts.rootId || 'modal-root';
  const suffix = rootSuffix(rootId);
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
    rootId,
    stacked: opts.stacked,
    bodyHtml: `<form id="modal-form${suffix}">${fieldsHtml}</form>`,
    footerHtml: `
      <button type="button" class="btn outline" id="modal-cancel${suffix}">Cancel</button>
      <button type="submit" form="modal-form${suffix}" class="btn" id="modal-submit${suffix}">${opts.submitLabel || 'Save'}</button>
    `,
  });

  document.getElementById(`modal-cancel${suffix}`).onclick = () => closeModal(rootId);
  document.getElementById(`modal-form${suffix}`).onsubmit = async (e) => {
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
      if (!opts.skipAutoClose) closeModal(rootId);
    } catch (err) {
      showToast(err.message, true);
    }
  };
}

// Low-level modal shell used by openModal() and by custom modals (like the
// quote calculator) that need full control over their body markup.
// config: {title, subtitle, wide, twoCol, bodyHtml, footerHtml, rootId, stacked}
function renderModalShell(config) {
  const rootId = config.rootId || 'modal-root';
  const suffix = rootSuffix(rootId);
  const root = document.getElementById(rootId);
  if (!root) return;
  root.innerHTML = `
    <div class="modal-backdrop ${config.stacked ? 'modal-backdrop-secondary' : ''}" id="modal-backdrop${suffix}">
      <div class="modal ${config.wide ? 'modal-wide' : ''} ${config.stacked ? 'modal-secondary' : ''}">
        <div class="modal-header">
          <div>
            <h3>${escapeHtml(config.title)}</h3>
            ${config.subtitle ? `<div class="modal-subtitle">${escapeHtml(config.subtitle)}</div>` : ''}
          </div>
          <button type="button" class="modal-close" id="modal-close-x${suffix}" aria-label="Close">${icon('x', 18)}</button>
        </div>
        <div class="modal-body ${config.twoCol ? 'modal-two-col' : ''}">${config.bodyHtml}</div>
        ${config.footerHtml ? `<div class="modal-actions">${config.footerHtml}</div>` : ''}
      </div>
    </div>
  `;
  document.getElementById(`modal-close-x${suffix}`).onclick = () => closeModal(rootId);
  // Clicking the backdrop deliberately does NOT close the drawer - it was
  // too easy to miss the drawer and accidentally lose an in-progress form.
  // Closing now requires the X button, a Cancel button, or Escape; a click
  // on the backdrop just nudges the drawer as a hint to use one of those.
  document.getElementById(`modal-backdrop${suffix}`).onclick = (e) => {
    if (e.target.id !== `modal-backdrop${suffix}`) return;
    const modalEl = document.getElementById(rootId)?.querySelector('.modal');
    if (!modalEl) return;
    modalEl.classList.remove('nudge');
    void modalEl.offsetWidth; // restart the animation if clicked again quickly
    modalEl.classList.add('nudge');

    // Also flash whatever actually closes the drawer - the X button always
    // exists; a footer "Cancel" button doesn't on every modal (some build
    // their own footer), so it's found by its label rather than a fixed id.
    const closeTargets = [
      document.getElementById(`modal-close-x${suffix}`),
      ...Array.from(modalEl.querySelectorAll('button')).filter((b) => b.textContent.trim() === 'Cancel'),
    ].filter(Boolean);
    closeTargets.forEach((el) => {
      el.classList.remove('attn-flash');
      void el.offsetWidth;
      el.classList.add('attn-flash');
    });
  };
}

// ---------- What's New / changelog ----------
// Plain data so the topbar "What's New" button and Settings > What's New
// both render from one source. Newest release first. Bug fixes, performance,
// and security work are deliberately summarized rather than itemized here -
// this list is meant to be a quick, readable read for anyone using the app,
// not a commit log.
const CHANGELOG = [
  {
    version: '0.6',
    date: '2026-08-30',
    items: [
      'Double-click a card on the Orders board to open it - no more hunting for the edit button.',
      'Order cards now show priority, assigned printer, and fulfillment method at a glance.',
      'Invoices default to English instead of a "Workspace default" placeholder.',
      'Closing the "New Order" quick action from the Dashboard now keeps you on the Dashboard instead of jumping to Orders.',
      'Cleaned up a few leftover placeholder elements in the sidebar and on the Printers page.',
      'Various bug fixes and performance improvements.',
    ],
  },
  {
    version: '0.5',
    date: '2026-08-24',
    items: [
      'Redesigned the New/Edit Customer and New/Edit Inventory Item forms with a cleaner, more organized layout.',
      'Various bug fixes and performance improvements.',
    ],
  },
  {
    version: '0.4',
    date: '2026-08-17',
    items: [
      'Deleted records now go to a recycle bin instead of disappearing for good - restore them anytime from Settings > Data.',
      'Added the ability to restore your workspace from an automatic backup.',
      'Expense receipts now upload and open noticeably faster.',
      'Various performance improvements and bug fixes.',
    ],
  },
  {
    version: '0.3',
    date: '2026-08-05',
    items: [
      'Customers can now submit project requests through a public link - they land in a new Requests inbox for review and can be converted straight into a quote.',
      'Filament colors and specs can be looked up and auto-filled from an online filament database.',
      'Various bug fixes and security improvements.',
    ],
  },
  {
    version: '0.2',
    date: '2026-07-20',
    items: [
      'Rebuilt the invoice builder with discounts, tax, and PDF export.',
      'Added dedicated filament spool tracking with usage charts.',
      'Various bug fixes and performance improvements.',
    ],
  },
  {
    version: '0.1',
    date: '2026-07-01',
    items: [
      'First release of JustPrintIt: customers, quotes, orders, invoices, printers, filament, inventory, products, expenses, and reporting, all in one self-hosted app.',
    ],
  },
];

function changelogHtml() {
  return CHANGELOG.map((release) => `
    <div class="card" style="margin-bottom:14px;">
      <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:10px; gap:10px;">
        <div style="font-weight:700; font-size:14px;">Beta ${escapeHtml(release.version)}</div>
        <div class="muted" style="font-size:11.5px; flex-shrink:0;">${fmtDate(release.date)}</div>
      </div>
      <ul style="margin:0; padding-left:18px; display:flex; flex-direction:column; gap:6px; font-size:13px;">
        ${release.items.map((it) => `<li>${escapeHtml(it)}</li>`).join('')}
      </ul>
    </div>
  `).join('');
}

function openWhatsNewModal() {
  renderModalShell({
    title: "What's New",
    subtitle: 'Recent updates and improvements.',
    bodyHtml: changelogHtml(),
    footerHtml: `<button type="button" class="btn" id="whatsnew-close">Close</button>`,
  });
  document.getElementById('whatsnew-close').onclick = () => closeModal();
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

// Formats a phone number into a consistent US-style layout as the digits
// come in: (555) 123-4567, or +1 (555) 123-4567 when an 11-digit number
// starts with a leading "1" country code. Anything past the first 10 digits
// (an extension, or a longer non-US number) is left as trailing digits
// rather than guessing at a format that doesn't apply. Non-digit characters
// (spaces, dashes, parens the user typed) are stripped and reapplied, so
// this is safe to run on a value that's already partly formatted.
function formatPhoneNumber(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  let core = digits;
  let prefix = '';
  if (digits.length === 11 && digits[0] === '1') {
    prefix = '+1 ';
    core = digits.slice(1);
  }
  const extra = core.slice(10);
  core = core.slice(0, 10);
  let formatted = core;
  if (core.length > 6) formatted = `(${core.slice(0, 3)}) ${core.slice(3, 6)}-${core.slice(6)}`;
  else if (core.length > 3) formatted = `(${core.slice(0, 3)}) ${core.slice(3)}`;
  else if (core.length > 0) formatted = `(${core}`;
  return prefix + formatted + (extra ? ` ${extra}` : '');
}

function fmtDate(d) {
  if (!d) return '–';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// "Aug 28, 2026, 3:04 PM" - used for backup timestamps in Settings > Danger
// Zone, where the time (not just the day) matters for telling snapshots apart.
function fmtDateTime(d) {
  if (!d) return '–';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtBytes(n) {
  if (n == null) return '–';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// MM/DD/YYYY - used on Quotes, which wants a slash format instead of the
// "Aug 28, 2026" style used elsewhere in the app.
function fmtDateSlash(d) {
  if (!d) return '–';
  const date = new Date(d);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${date.getFullYear()}`;
}

// Scans existing records for the highest number already used with a given
// prefix and returns the next one - robust to deletions/gaps, unlike a
// naive list.length+1 count (which can collide with an existing number
// once anything's been deleted).
function nextNumberForPrefix(prefix, list, field) {
  let max = 0;
  for (const item of list) {
    const val = item[field];
    if (typeof val !== 'string' || !val.startsWith(prefix)) continue;
    const n = parseInt(val.slice(prefix.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

// Builds the full next document number (prefix + zero-padded number) for
// auto-generated order/quote/invoice/customer/filament numbers.
function nextNumber(prefixKey, list, field) {
  const prefix = state.settings[prefixKey] || '';
  const n = nextNumberForPrefix(prefix, list, field);
  return `${prefix}${String(n).padStart(4, '0')}`;
}

// Loose typo-tolerant match shared by every page's search box: prefers a
// plain substring match, falls back to an in-order subsequence match (so
// "jsmth" still finds "J. Smith").
function fuzzyMatch(query, text) {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = (text || '').toString().toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function badge(text, cls) {
  const c = cls || (text || '').toString().toLowerCase().replace(/\s+/g, '_');
  return `<span class="badge ${c}">${escapeHtml(text)}</span>`;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
  panel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  chevronUpDown: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  fileText: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><polyline points="14 2 14 8 20 8"/><path d="M10 12h4M10 16h4M10 8h1"/>',
  download: '<path d="M12 15V3M6 13l6 6 6-6"/><path d="M4 21h16"/>',
  upload: '<path d="M12 3v12M6 9l6-6 6 6"/><path d="M4 21h16"/>',
  externalLink: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
};

function icon(name, size = 16) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

// ---------- Image resize ----------

// Downscales/crops an uploaded image file to a square `size`x`size` PNG
// data URL (center-cropped, "cover" style) before it's stored - so a user
// uploading a multi-megabyte photo as a brand icon doesn't bloat the
// settings payload or overflow the small logo area it's actually displayed
// in. Returns a Promise<string> (the data URL).
function resizeImageFileToDataUrl(file, size = 128) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Could not read that image'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

// Reads a file as-is (no resizing/cropping) into a base64 data URL - for
// attachments like expense receipts, where the original file matters,
// unlike resizeImageFileToDataUrl() above which is for small square icons.
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

// ---------- Color picker (swatch + RGB/hex popover) ----------
// Shared by Filament's spool color and Settings > Appearance's accent
// color, so there's one implementation instead of two copies drifting.

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return { r: 139, g: 92, b: 246 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

// `prefix` scopes element ids so multiple pickers can exist on the same
// page (e.g. a spool's color swatch and, separately, the accent color
// swatch in Settings) without colliding.
//
// The swatch itself is a native <input type="color"> - clicking it opens
// the browser/OS's real color picker (hue/saturation area, eyedropper on
// browsers that support it, etc.), not just a re-implementation of one.
// A hex field sits next to it for typing/pasting an exact value, and a
// small "RGB" button reveals precise R/G/B number fields for people who
// think in those instead.
function colorSwatchPickerHtml(prefix, hex) {
  const { r, g, b } = hexToRgb(hex);
  return `
    <div class="color-picker-inline" id="${prefix}-wrap">
      <input type="color" class="color-native-swatch" id="${prefix}-native" value="${hex}" title="Pick a color"/>
      <input type="text" class="color-hex-input" id="${prefix}-hex" value="${hex}" maxlength="7" placeholder="#RRGGBB"/>
      <button type="button" class="btn outline small" id="${prefix}-more-btn" title="Enter exact RGB values">RGB</button>
      <div class="color-picker-panel" id="${prefix}-panel" style="display:none;">
        <div class="color-rgb-row">
          <div><label class="mini">R</label><input type="number" id="${prefix}-r" min="0" max="255" value="${r}"/></div>
          <div><label class="mini">G</label><input type="number" id="${prefix}-g" min="0" max="255" value="${g}"/></div>
          <div><label class="mini">B</label><input type="number" id="${prefix}-b" min="0" max="255" value="${b}"/></div>
        </div>
      </div>
    </div>
  `;
}

const _colorPickerCleanups = {};

// Wires the native color input + hex field + RGB popover rendered by
// colorSwatchPickerHtml(). `onChange(hex)` fires whenever any of the three
// inputs changes, always with the others kept in sync.
function wireColorSwatchPicker(prefix, onChange) {
  const wrap = document.getElementById(`${prefix}-wrap`);
  const nativeInput = document.getElementById(`${prefix}-native`);
  const hexInput = document.getElementById(`${prefix}-hex`);
  const moreBtn = document.getElementById(`${prefix}-more-btn`);
  const panel = document.getElementById(`${prefix}-panel`);
  const rInput = document.getElementById(`${prefix}-r`);
  const gInput = document.getElementById(`${prefix}-g`);
  const bInput = document.getElementById(`${prefix}-b`);
  if (!wrap || !nativeInput || !hexInput) return;

  if (moreBtn && panel) {
    moreBtn.onclick = () => { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; };
  }

  const applyHex = (hex) => {
    nativeInput.value = hex;
    hexInput.value = hex;
    if (rInput) {
      const { r, g, b } = hexToRgb(hex);
      rInput.value = r; gInput.value = g; bInput.value = b;
    }
    onChange(hex);
  };
  const applyRgb = () => {
    const hex = rgbToHex(rInput.value, gInput.value, bInput.value);
    nativeInput.value = hex;
    hexInput.value = hex;
    onChange(hex);
  };

  // Both 'input' and 'change' are wired for the native swatch: 'input'
  // covers browsers that fire it live while the picker is open, 'change'
  // is the one guaranteed to fire once the picker closes/commits - relying
  // on only one of the two has been flaky across browsers in the past.
  nativeInput.oninput = () => applyHex(nativeInput.value);
  nativeInput.onchange = () => applyHex(nativeInput.value);
  hexInput.oninput = () => {
    const v = hexInput.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) applyHex(v);
  };
  if (rInput) [rInput, gInput, bInput].forEach((el) => { el.oninput = applyRgb; el.onchange = applyRgb; });

  if (_colorPickerCleanups[prefix]) document.removeEventListener('mousedown', _colorPickerCleanups[prefix]);
  _colorPickerCleanups[prefix] = (e) => { if (panel && !wrap.contains(e.target)) panel.style.display = 'none'; };
  document.addEventListener('mousedown', _colorPickerCleanups[prefix]);
}

// ---------- Data loading ----------
//
// All collections are cached client-side in `state`. Page navigation
// (clicking the sidebar) re-renders from that cache instantly - it does
// NOT hit the network. Data is only refetched:
//   1. once when the app boots (app-init.js)
//   2. after any create/update/delete, via refreshAndRerender()
// This is what makes clicking around the sidebar feel instant instead of
// re-fetching all 12 collections on every single click.

async function refreshCollections() {
  const [
    customers, quotes, orders, invoices, printersList,
    maintenanceSchedules, maintenanceLog, spools, products, inventoryItems, expenses, quoteRequests, settings,
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
    api('GET', '/api/quoteRequests'),
    api('GET', '/api/settings'),
  ]);
  Object.assign(state, {
    customers, quotes, orders, invoices, printers: printersList,
    maintenanceSchedules, maintenanceLog, spools, products, inventoryItems, expenses, quoteRequests, settings,
  });
  updateBellBadge();
}

// Keeps the topbar bell's badge in sync with unreviewed ("new") public
// quote requests. Called on every refreshCollections() so it stays current
// after boot and after any create/update/delete anywhere in the app.
function updateBellBadge() {
  const badge = document.getElementById('bell-badge');
  if (!badge) return;
  const count = state.quoteRequests.filter((r) => r.status === 'new').length;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
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

// Grouped to mirror a typical print-shop sidebar. `label: null` sections
// render with no header (Dashboard up top, Settings pinned at the bottom).
const NAV_SECTIONS = [
  { label: null, items: [
    { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  ] },
  { label: 'Sales', items: [
    { key: 'quotes', label: 'Quotes', icon: 'quotes' },
    { key: 'requests', label: 'Requests', icon: 'inbox' },
    { key: 'orders', label: 'Orders', icon: 'orders' },
    { key: 'invoices', label: 'Invoices', icon: 'invoices' },
    { key: 'customers', label: 'Customers', icon: 'customers' },
  ] },
  { label: 'Production', items: [
    { key: 'printers', label: 'Printers', icon: 'printers' },
    { key: 'maintenance', label: 'Maintenance', icon: 'maintenance' },
  ] },
  { label: 'Stock', items: [
    { key: 'filament', label: 'Filament', icon: 'filament' },
    { key: 'products', label: 'Products', icon: 'products' },
    { key: 'inventory', label: 'Inventory', icon: 'inventory' },
  ] },
  { label: 'Finance', items: [
    { key: 'expenses', label: 'Expenses', icon: 'expenses' },
    { key: 'reports', label: 'Reports', icon: 'reports' },
  ] },
  { label: null, items: [
    { key: 'settings', label: 'Settings', icon: 'settings' },
  ] },
];

// Flat lookup, e.g. for the topbar breadcrumb title.
const PAGES = NAV_SECTIONS.flatMap((s) => s.items);

function renderSidebar() {
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = NAV_SECTIONS.map((section) => `
    ${section.label ? `<div class="nav-group-label">${section.label}</div>` : ''}
    ${section.items.map((p) => `
      <div class="nav-item ${p.key === state.page ? 'active' : ''}" data-page="${p.key}">
        ${icon(p.icon)}<span>${p.label}</span>
      </div>
    `).join('')}
  `).join('');
  nav.querySelectorAll('.nav-item').forEach((el) => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });
}

const PAGE_RENDERERS = {}; // populated by page-*.js files via registerPage()

function registerPage(key, fn) {
  PAGE_RENDERERS[key] = fn;
}

// Bumped on every navigate() call. Page renderers that do async work before
// touching the DOM (Dashboard, Printers - both fetch live printer status)
// should check `isCurrentNav(myEpoch)` after each await and bail out if a
// newer navigation has since started, so a slow response can't clobber
// whatever page the user has since clicked to.
let navEpoch = 0;

function isCurrentNav(epoch) {
  return epoch === navEpoch;
}

async function navigate(page) {
  const myEpoch = ++navEpoch;
  state.page = page;
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.page === page));
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }

  // Keep the URL hash in sync with the current page, so refreshing (or
  // bookmarking/sharing a link) lands back on the same page instead of
  // always resetting to the Dashboard - see app-init.js for the boot-time
  // read of this, and the hashchange listener below for back/forward.
  // Guarded so this doesn't push a redundant duplicate history entry when
  // it's the hashchange listener that called navigate() in the first place
  // (by then location.hash already matches `page`).
  if (location.hash.slice(1) !== page) location.hash = page;

  const topbarTitle = document.getElementById('topbar-title');
  if (topbarTitle) topbarTitle.textContent = PAGES.find((p) => p.key === page)?.label || page;

  const renderer = PAGE_RENDERERS[page];
  if (renderer) {
    await renderer(myEpoch);
  } else {
    document.getElementById('main').innerHTML = `<div class="empty-state">Page not implemented.</div>`;
  }
}

// Browser back/forward between pages.
window.addEventListener('hashchange', () => {
  const page = location.hash.slice(1);
  if (page && page !== state.page && PAGE_RENDERERS[page]) navigate(page);
});

// Persists to localStorage so a manual toggle sticks across reloads on this
// browser, independent of the workspace-wide "Default sidebar state" set in
// Settings > Appearance (that default only decides the very first load).
function toggleSidebar() {
  const collapsed = document.querySelector('.app-shell').classList.toggle('sidebar-collapsed');
  localStorage.setItem('sidebarCollapsed', String(collapsed));
}

// Call this after any create/update/delete so the next render reflects the
// change, then re-renders the current page from the refreshed cache.
async function refreshAndRerender() {
  await refreshCollections();
  await navigate(state.page);
}

// Browser tab icon. If a brand icon was uploaded (already a data: URL from
// the auto-resize step in Settings > White Labeling) it's used as-is;
// otherwise a small generated "initials on accent color" SVG stands in, the
// same look as the sidebar brand mark.
function updateFavicon() {
  const link = document.getElementById('favicon-link');
  if (!link) return;
  const iconUrl = state.settings.brandIconUrl;
  if (iconUrl) {
    link.href = iconUrl;
    return;
  }
  const brandName = state.settings.brandName || 'JustPrintIt';
  const initials = brandName.trim().slice(0, 2).toUpperCase() || 'JP';
  const color = state.settings.accentColor || '#e2793c';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${color}"/><text x="16" y="22" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#ffffff" text-anchor="middle">${initials}</text></svg>`;
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function initShell() {
  renderSidebar();
  document.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon, 16);
  });

  // White-labeling: brand name/icon are configurable in Settings, applied
  // here so both the initial boot and any settings save pick them up.
  const brandNameEl = document.getElementById('brand-name-text');
  if (brandNameEl) brandNameEl.textContent = state.settings.brandName || 'JustPrintIt';
  const brandMarkEl = document.getElementById('brand-mark');
  if (brandMarkEl) {
    brandMarkEl.innerHTML = state.settings.brandIconUrl
      ? `<img src="${state.settings.brandIconUrl}" alt=""/>`
      : 'JP';
  }
  updateFavicon();

  // Beta badge: this build is a work in progress, so it's flagged right on
  // the brand mark rather than buried in a settings page. Version text
  // stays in sync with the newest changelog entry - click it to see what's
  // actually changed.
  const betaBadgeEl = document.getElementById('beta-badge');
  if (betaBadgeEl) {
    betaBadgeEl.textContent = CHANGELOG.length ? `Beta ${CHANGELOG[0].version}` : 'Beta';
    betaBadgeEl.onclick = () => openWhatsNewModal();
  }

  // Visual theme (Settings > Appearance): accent color overrides the
  // --accent-brand CSS variable everywhere it's used (buttons, active tabs,
  // combobox highlights, etc); empty means "use the built-in default".
  if (state.settings.accentColor) {
    document.documentElement.style.setProperty('--accent-brand', state.settings.accentColor);
  } else {
    document.documentElement.style.removeProperty('--accent-brand');
  }
  document.body.classList.toggle('density-compact', state.settings.density === 'compact');
  if (state.settings.fontFamily) {
    document.documentElement.style.setProperty('--font-sans', state.settings.fontFamily);
  } else {
    document.documentElement.style.removeProperty('--font-sans');
  }

  const collapseBtn = document.getElementById('sidebar-collapse-btn');
  if (collapseBtn) collapseBtn.onclick = toggleSidebar;

  const bellBtn = document.getElementById('topbar-bell');
  if (bellBtn) bellBtn.onclick = () => navigate('requests');

  const sparklesBtn = document.getElementById('topbar-sparkles');
  if (sparklesBtn) sparklesBtn.onclick = () => openWhatsNewModal();

  const helpBtn = document.getElementById('topbar-help');
  if (helpBtn) helpBtn.onclick = () => showToast('Not wired up in this build yet');

  updateBellBadge();
}
