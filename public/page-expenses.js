// public/page-expenses.js
// Expenses gets its own dedicated modal (not the generic resource-page
// modal) because it needs a Type/Credit toggle, a section that swaps
// between "recurring frequency" controls and a receipts uploader depending
// on a toggle, and file uploads - none of which the generic openModal()
// field renderer supports.

let expenseFormState = null;
let expenseFormIsEdit = false;

const EXPENSE_CATEGORIES = [
  'Filament', 'Hardware', 'Electricity', 'Software', 'Shipping',
  'Marketing', 'Maintenance', 'Fees', 'Other',
];

const RECURRING_FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

// Mirrors lib/api.js's RECEIPT_MAX_FILES/RECEIPT_MAX_BYTES/RECEIPT_MIME_RE -
// this is the client-side half of "images or PDF, up to 3 files at 5 MB
// each"; the server re-checks the same rule since this endpoint is
// reachable directly, not just through this form.
const RECEIPT_MAX_FILES = 3;
const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
const RECEIPT_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,application/pdf';
const RECEIPT_TYPE_RE = /^image\/(png|jpe?g|webp|gif)$|^application\/pdf$/;

function fmtFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------- Stat cards ----------

function expenseStatsHtml(items) {
  const now = new Date();
  const thisMonth = items.filter((e) => e.date && new Date(e.date).getMonth() === now.getMonth() && new Date(e.date).getFullYear() === now.getFullYear());
  // Credits/refunds are stored as negative amounts (see readExpenseFormValues),
  // so a plain sum already nets them out of every total below.
  const spent = thisMonth.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const byCategory = {};
  for (const e of thisMonth) {
    const cat = e.category || 'Other';
    byCategory[cat] = (byCategory[cat] || 0) + (Number(e.amount) || 0);
  }
  const biggest = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
  return `
    <div class="card stat-card"><div class="stat-label">Spent this month</div><div class="stat-sub">Month to date, net of credits</div><div class="stat-value">${money(spent)}</div></div>
    <div class="card stat-card"><div class="stat-label">Projected this month</div><div class="stat-sub">At the current run-rate</div><div class="stat-value">${money(now.getDate() ? (spent / now.getDate()) * 30 : 0)}</div></div>
    <div class="card stat-card"><div class="stat-label">Biggest category</div><div class="stat-sub">${biggest ? escapeHtml(biggest[0]) : 'No spending this month'}</div><div class="stat-value">${biggest ? money(biggest[1]) : '—'}</div></div>
  `;
}

// ---------- Receipts ----------

function expenseReceiptsListHtml() {
  const receipts = expenseFormState.receipts || [];
  if (!receipts.length) {
    return `<div class="muted" style="font-size:12.5px; margin-bottom:8px;">No receipts attached yet</div>`;
  }
  return receipts.map((r, i) => {
    // r.url is set once a receipt has actually been saved to disk (see
    // lib/routes/expenses.js); a receipt just picked in this session but
    // not saved yet only has r.dataUrl so far - either way, whatever's
    // there previews/downloads the same file.
    const href = r.url || r.dataUrl;
    const nameHtml = `<span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12.5px;">${escapeHtml(r.name)}</span>`;
    return `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
      ${icon('fileText', 15)}
      ${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="flex:1; min-width:0; color:inherit; text-decoration:none;" title="Open receipt">${nameHtml}</a>` : nameHtml}
      <span class="muted" style="font-size:11px; flex-shrink:0;">${fmtFileSize(r.size)}</span>
      <button type="button" class="btn outline small" data-remove-receipt="${i}" title="Remove receipt">${icon('x', 13)}</button>
    </div>
  `;
  }).join('');
}

// ---------- Recurring / Receipts conditional section ----------
// The two are mutually exclusive in the UI (a recurring expense's card is
// its schedule, not a paper trail), but flipping the toggle back and forth
// while filling out the form never discards whichever one you'd already
// entered - both stay in expenseFormState regardless of which is visible.

function recurringOrReceiptsHtml() {
  const s = expenseFormState;
  if (s.recurring) {
    return `
      <div class="field">
        <label>Repeats</label>
        <div class="status-filter-group">
          ${RECURRING_FREQUENCIES.map((f) => `<button type="button" class="status-filter-btn ${s.recurringFrequency === f.value ? 'active' : ''}" data-freq="${f.value}">${f.label}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>Repeat every</label>
        <input type="number" id="e-recurringInterval" min="1" step="1" value="${s.recurringInterval ?? 1}" style="width:100px;"/>
      </div>
    `;
  }
  return `
    <div class="field">
      <label>Receipts</label>
      <div id="e-receipts-list">${expenseReceiptsListHtml()}</div>
      <button type="button" class="btn outline small" id="e-add-receipt-btn">${icon('plus', 13)} Add a receipt</button>
      <div class="field-hint">Images or PDF, up to 3 files at 5 MB each.</div>
      <input type="file" id="e-receipt-file-input" accept="${RECEIPT_ACCEPT}" multiple style="display:none;"/>
    </div>
  `;
}

function wireRecurringSection() {
  const s = expenseFormState;

  if (s.recurring) {
    document.querySelectorAll('[data-freq]').forEach((btn) => {
      btn.onclick = () => {
        s.recurringFrequency = btn.dataset.freq;
        document.querySelectorAll('[data-freq]').forEach((b) => b.classList.toggle('active', b.dataset.freq === s.recurringFrequency));
      };
    });
    const intervalInput = document.getElementById('e-recurringInterval');
    if (intervalInput) intervalInput.oninput = () => { s.recurringInterval = Math.max(1, Number(intervalInput.value) || 1); };
    return;
  }

  const addBtn = document.getElementById('e-add-receipt-btn');
  const fileInput = document.getElementById('e-receipt-file-input');
  const list = document.getElementById('e-receipts-list');

  if (addBtn && fileInput) {
    addBtn.onclick = () => {
      if ((s.receipts || []).length >= RECEIPT_MAX_FILES) {
        showToast(`Up to ${RECEIPT_MAX_FILES} receipts allowed`, true);
        return;
      }
      fileInput.click();
    };
    fileInput.onchange = async () => {
      const files = Array.from(fileInput.files || []);
      fileInput.value = ''; // so re-selecting the same file later still fires 'change'
      s.receipts = s.receipts || [];
      for (const file of files) {
        if (s.receipts.length >= RECEIPT_MAX_FILES) {
          showToast(`Up to ${RECEIPT_MAX_FILES} receipts allowed`, true);
          break;
        }
        if (!RECEIPT_TYPE_RE.test(file.type)) {
          showToast(`"${file.name}" must be an image or PDF`, true);
          continue;
        }
        if (file.size > RECEIPT_MAX_BYTES) {
          showToast(`"${file.name}" is over the 5 MB limit`, true);
          continue;
        }
        try {
          const dataUrl = await readFileAsDataUrl(file);
          s.receipts.push({ name: file.name, type: file.type, size: file.size, dataUrl });
        } catch (err) {
          showToast(err.message, true);
        }
      }
      if (list) list.innerHTML = expenseReceiptsListHtml();
    };
  }

  // Delegated on the stable list container so it survives the list's own
  // innerHTML being replaced every time a receipt is added or removed.
  if (list) {
    list.onclick = (e) => {
      const btn = e.target.closest('[data-remove-receipt]');
      if (!btn) return;
      s.receipts.splice(Number(btn.dataset.removeReceipt), 1);
      list.innerHTML = expenseReceiptsListHtml();
    };
  }
}

// ---------- Modal ----------

function expenseModalBodyHtml() {
  const s = expenseFormState;
  return `
    <div class="field-row">
      <div class="field">
        <label>Type</label>
        <select id="e-type">
          <option value="expense" ${s.type === 'expense' ? 'selected' : ''}>Expense</option>
          <option value="credit" ${s.type === 'credit' ? 'selected' : ''}>Credit / refund</option>
        </select>
      </div>
      <div class="field">
        <label>Amount</label>
        <input type="number" id="e-amount" min="0" step="0.01" value="${s.amount ?? ''}" required/>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Category</label>
        <select id="e-category" required>
          <option value="">Select a category…</option>
          ${EXPENSE_CATEGORIES.map((c) => `<option value="${c}" ${s.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Date</label>
        <div class="date-input-wrap">
          <input type="date" id="e-date" value="${s.date || ''}"/>
          <button type="button" class="date-picker-btn" data-date-btn="e-date" title="Pick a date">${icon('calendar', 15)}</button>
        </div>
      </div>
    </div>
    <div class="field">
      <label>Description</label>
      <input type="text" id="e-description" value="${escapeHtml(s.description || '')}"/>
    </div>
    <div class="field toggle-row">
      <label class="switch"><input type="checkbox" id="e-recurring" ${s.recurring ? 'checked' : ''}/><span class="slider-track"></span></label>
      <span class="toggle-label">Recurring expense</span>
    </div>
    <div id="e-recurring-section"></div>
    <div class="field">
      <label>Vendor</label>
      <input type="text" id="e-vendor" value="${escapeHtml(s.vendor || '')}"/>
    </div>
    <div class="field">
      <label>Notes</label>
      <textarea id="e-notes" rows="3">${escapeHtml(s.notes || '')}</textarea>
    </div>
  `;
}

function readExpenseFormValues() {
  const byId = (id) => document.getElementById(id);
  const type = byId('e-type').value;
  const rawAmount = Math.abs(Number(byId('e-amount').value) || 0);
  return {
    // Credits/refunds are stored as a negative amount so every existing
    // sum-based total (dashboard, reports, the stat cards above) nets them
    // out automatically with no special-casing - the Amount field itself
    // always shows/accepts a plain positive number, the Type dropdown is
    // what decides the sign.
    type,
    amount: type === 'credit' ? -rawAmount : rawAmount,
    category: byId('e-category').value,
    date: byId('e-date').value || null,
    description: byId('e-description').value,
    recurring: expenseFormState.recurring,
    recurringFrequency: expenseFormState.recurring ? expenseFormState.recurringFrequency : null,
    recurringInterval: expenseFormState.recurring ? (expenseFormState.recurringInterval || 1) : null,
    vendor: byId('e-vendor').value,
    notes: byId('e-notes').value,
    receipts: expenseFormState.receipts || [],
  };
}

// opts: { rootId, stacked }
function openExpenseModal(existing, opts = {}) {
  expenseFormIsEdit = !!existing;
  expenseFormState = existing ? {
    ...existing,
    type: existing.type || (Number(existing.amount) < 0 ? 'credit' : 'expense'),
    amount: Math.abs(Number(existing.amount) || 0),
    date: existing.date ? existing.date.slice(0, 10) : '',
    recurringFrequency: existing.recurringFrequency || 'monthly',
    recurringInterval: existing.recurringInterval || 1,
    receipts: existing.receipts ? existing.receipts.slice() : [],
  } : {
    type: 'expense', amount: '', category: '', date: new Date().toISOString().slice(0, 10),
    description: '', recurring: false, recurringFrequency: 'monthly', recurringInterval: 1,
    vendor: '', notes: '', receipts: [],
  };

  const rootId = opts.rootId || 'modal-root';
  const suffix = rootSuffix(rootId);

  renderModalShell({
    title: expenseFormIsEdit ? 'Edit expense' : 'New expense',
    subtitle: 'Track a shop cost or a credit/refund.',
    rootId,
    stacked: opts.stacked,
    bodyHtml: expenseModalBodyHtml(),
    footerHtml: `
      <button type="button" class="btn outline" id="e-cancel${suffix}">Cancel</button>
      <button type="button" class="btn" id="e-submit${suffix}">${expenseFormIsEdit ? 'Save changes' : 'Add expense'}</button>
    `,
  });

  document.getElementById('e-recurring-section').innerHTML = recurringOrReceiptsHtml();
  wireRecurringSection();

  document.getElementById('e-recurring').onchange = (e) => {
    expenseFormState.recurring = e.target.checked;
    document.getElementById('e-recurring-section').innerHTML = recurringOrReceiptsHtml();
    wireRecurringSection();
  };

  document.querySelectorAll('[data-date-btn]').forEach((btn) => {
    btn.onclick = () => {
      const input = document.getElementById(btn.dataset.dateBtn);
      if (!input) return;
      if (input.showPicker) { try { input.showPicker(); } catch { input.focus(); } } else { input.focus(); }
    };
  });

  document.getElementById(`e-cancel${suffix}`).onclick = () => closeModal(rootId);
  document.getElementById(`e-submit${suffix}`).onclick = async () => {
    const values = readExpenseFormValues();
    if (!values.category) { showToast('Category is required', true); return; }
    if (!values.amount) { showToast('Amount is required', true); return; }
    try {
      let record;
      if (expenseFormIsEdit && expenseFormState.id) {
        record = await api('PUT', `/api/expenses/${expenseFormState.id}`, values);
        showToast('Expense updated');
      } else {
        record = await api('POST', '/api/expenses', values);
        state.expenses.push(record);
        showToast('Expense added');
      }
      closeModal(rootId);
      await refreshAndRerender();
    } catch (err) {
      showToast(err.message, true);
    }
  };
}

// ---------- List page ----------

async function renderExpenses() {
  const main = document.getElementById('main');
  const items = state.expenses;

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Expenses</h1>
        <p class="page-subtitle">Track shop costs by category.</p>
      </div>
      <div class="page-actions">
        <button class="btn outline" disabled title="Demo app">Import CSV</button>
        <button class="btn brand" id="add-expense">+ New expense</button>
      </div>
    </div>
    <div class="grid grid-3" style="margin-bottom:20px;" id="expense-stats"></div>
    <div class="card" id="expenses-table"></div>
  `;

  document.getElementById('expense-stats').innerHTML = expenseStatsHtml(items);

  const tableEl = document.getElementById('expenses-table');
  if (!items.length) {
    tableEl.innerHTML = `<div class="empty-state">No expenses yet. Add your first entry to see it here.</div>`;
  } else {
    const rows = items.map((e) => {
      const receiptCount = (e.receipts || []).length;
      return `
        <tr>
          <td>${fmtDate(e.date)}</td>
          <td>${escapeHtml(e.category || '—')}</td>
          <td>
            ${escapeHtml(e.description || '—')}
            ${e.vendor ? `<div class="muted" style="font-size:11px;">${escapeHtml(e.vendor)}</div>` : ''}
          </td>
          <td>${money(e.amount)}${e.type === 'credit' ? ' <span class="badge gray">credit</span>' : ''}${e.recurring ? ' <span class="badge gray">recurring</span>' : ''}</td>
          <td>${receiptCount ? `${receiptCount} file${receiptCount > 1 ? 's' : ''}` : '—'}</td>
          <td>
            <div class="row-actions">
              <button class="btn outline small" data-edit-expense="${e.id}">${icon('edit', 13)}</button>
              <button class="btn outline small" data-del-expense="${e.id}">${icon('trash', 13)}</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tableEl.innerHTML = `
      <table>
        <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Receipts</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    items.forEach((e) => {
      const editBtn = tableEl.querySelector(`[data-edit-expense="${e.id}"]`);
      const delBtn = tableEl.querySelector(`[data-del-expense="${e.id}"]`);
      if (editBtn) editBtn.onclick = () => openExpenseModal(e);
      if (delBtn) delBtn.onclick = async () => {
        if (!confirm('Delete this expense?')) return;
        await api('DELETE', `/api/expenses/${e.id}`);
        showToast('Expense deleted');
        await refreshAndRerender();
      };
    });
  }

  document.getElementById('add-expense').onclick = () => openExpenseModal();
}

registerPage('expenses', renderExpenses);
