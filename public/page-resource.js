// public/page-resource.js
// Generic "list + add/edit/delete modal" page renderer, driven by a config
// object. Used for every simple CRUD collection: Customers, Quotes,
// Invoices, Filament, Products, Inventory, Expenses.

function renderResourcePage(config) {
  return async function render() {
    const items = state[config.stateKey];
    const main = document.getElementById('main');

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${config.title}</h1>
          <p class="page-subtitle">${config.subtitle}</p>
        </div>
        <div class="page-actions">
          ${config.extraHeaderActions || '<button class="btn outline" disabled title="Demo app - CSV import not wired up">Import CSV</button>'}
          <button class="btn brand" id="add-${config.key}">+ ${config.addLabel}</button>
        </div>
      </div>
      ${config.beforeTable ? config.beforeTable(items) : ''}
      <div class="card" id="${config.key}-table"></div>
    `;

    const wire = () => {
      const tableEl = document.getElementById(`${config.key}-table`);
      if (!items.length) {
        tableEl.innerHTML = `<div class="empty-state">${config.emptyMessage}</div>`;
        return;
      }
      const rows = items.map((item) => `
        <tr>
          ${config.columns.map((c) => `<td>${c.render(item)}</td>`).join('')}
          <td>
            <div class="row-actions">
              <button class="btn outline small" data-edit="${item.id}">${icon('edit', 13)}</button>
              <button class="btn outline small" data-del="${item.id}">${icon('trash', 13)}</button>
            </div>
          </td>
        </tr>
      `).join('');

      tableEl.innerHTML = `
        <table>
          <thead><tr>${config.columns.map((c) => `<th>${c.header}</th>`).join('')}<th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;

      items.forEach((item) => {
        const editBtn = tableEl.querySelector(`[data-edit="${item.id}"]`);
        const delBtn = tableEl.querySelector(`[data-del="${item.id}"]`);
        if (editBtn) editBtn.onclick = () => openModal(`Edit ${config.singular}`, config.formFields(item), async (data) => {
          await api('PUT', `/api/${config.key}/${item.id}`, data);
          showToast(`${config.singular} updated`);
          await refreshAndRerender();
        });
        if (delBtn) delBtn.onclick = async () => {
          if (!confirm(`Delete this ${config.singular.toLowerCase()}?`)) return;
          await api('DELETE', `/api/${config.key}/${item.id}`);
          showToast(`${config.singular} deleted`);
          await refreshAndRerender();
        };
      });
    };
    wire();

    document.getElementById(`add-${config.key}`).onclick = () => {
      openModal(`New ${config.singular}`, config.formFields(), async (data) => {
        await api('POST', `/api/${config.key}`, data);
        showToast(`${config.singular} added`);
        await refreshAndRerender();
      });
    };
  };
}

// ---------- Customers ----------

registerPage('customers', renderResourcePage({
  key: 'customers', stateKey: 'customers', title: 'Customers', singular: 'Customer',
  subtitle: 'Your CRM: contacts, spend, and order history.', addLabel: 'New customer',
  emptyMessage: 'No customers yet. Add your first customer to see them here.',
  columns: [
    { header: 'Customer #', render: (c) => escapeHtml(c.customerNumber || '—') },
    { header: 'Name', render: (c) => escapeHtml(c.name) },
    { header: 'Email', render: (c) => escapeHtml(c.email || '—') },
    { header: 'Phone', render: (c) => escapeHtml(c.phone || '—') },
    { header: 'Orders', render: (c) => state.orders.filter((o) => o.customerId === c.id).length },
    { header: 'Lifetime spend', render: (c) => money(state.orders.filter((o) => o.customerId === c.id && o.status !== 'cancelled').reduce((s, o) => s + (Number(o.total) || 0), 0)) },
  ],
  formFields: (c = {}) => [
    { name: 'name', label: 'Name', required: true, value: c.name },
    { name: 'email', label: 'Email', value: c.email },
    { name: 'phone', label: 'Phone', value: c.phone },
    { name: 'notes', label: 'Notes', type: 'textarea', value: c.notes },
  ],
}));

// Quotes has its own dedicated calculator modal - see page-quotes.js.

// ---------- Invoices ----------

registerPage('invoices', renderResourcePage({
  key: 'invoices', stateKey: 'invoices', title: 'Invoices', singular: 'Invoice',
  subtitle: 'Bill customers from orders or manually, and track who still owes you.', addLabel: 'New invoice',
  emptyMessage: 'No invoices yet. Create one from an order, or add a manual invoice here.',
  beforeTable: (items) => {
    const outstanding = items.filter((i) => i.status === 'outstanding').reduce((s, i) => s + (Number(i.total) || 0), 0);
    const overdue = items.filter((i) => i.status === 'overdue').reduce((s, i) => s + (Number(i.total) || 0), 0);
    const now = new Date();
    const paidThisMonth = items.filter((i) => i.status === 'paid' && i.paidAt && new Date(i.paidAt).getMonth() === now.getMonth() && new Date(i.paidAt).getFullYear() === now.getFullYear()).reduce((s, i) => s + (Number(i.total) || 0), 0);
    return `
      <div class="grid grid-3" style="margin-bottom:20px;">
        <div class="card stat-card"><div class="stat-label">Outstanding</div><div class="stat-sub">Across all issued, unpaid invoices</div><div class="stat-value">${money(outstanding)}</div></div>
        <div class="card stat-card"><div class="stat-label">Overdue</div><div class="stat-sub">Outstanding past their due date</div><div class="stat-value">${money(overdue)}</div></div>
        <div class="card stat-card"><div class="stat-label">Paid this month</div><div class="stat-sub">Invoices paid in the current calendar month</div><div class="stat-value">${money(paidThisMonth)}</div></div>
      </div>
    `;
  },
  columns: [
    { header: 'Invoice', render: (i) => escapeHtml(i.invoiceNumber || '—') },
    { header: 'Customer', render: (i) => escapeHtml(customerName(i.customerId)) },
    { header: 'Order', render: (i) => escapeHtml(state.orders.find((o) => o.id === i.orderId)?.orderNumber || '—') },
    { header: 'Issued', render: (i) => fmtDate(i.issuedAt) },
    { header: 'Due', render: (i) => fmtDate(i.dueAt) },
    { header: 'Status', render: (i) => badge(i.status, i.status) },
    { header: 'Total', render: (i) => money(i.total) },
  ],
  formFields: (i = {}) => [
    { name: 'invoiceNumber', label: 'Invoice #', value: i.invoiceNumber || nextNumber('invoiceNumberPrefix', state.invoices, 'invoiceNumber') },
    { name: 'customerId', label: 'Customer', type: 'select', value: i.customerId, options: [{ value: '', label: '(none)' }, ...state.customers.map((c) => ({ value: c.id, label: c.name }))] },
    { name: 'orderId', label: 'Order (optional)', type: 'select', value: i.orderId, options: [{ value: '', label: '(none)' }, ...state.orders.map((o) => ({ value: o.id, label: o.orderNumber || o.id.slice(0, 8) }))] },
    { name: 'status', label: 'Status', type: 'select', value: i.status || 'draft', options: ['draft', 'outstanding', 'overdue', 'paid'].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) },
    { name: 'issuedAt', label: 'Issued', type: 'date', value: i.issuedAt ? i.issuedAt.slice(0, 10) : '' },
    { name: 'dueAt', label: 'Due', type: 'date', value: i.dueAt ? i.dueAt.slice(0, 10) : '' },
    { name: 'total', label: 'Total', type: 'number', step: '0.01', value: i.total },
  ],
}));

// ---------- Filament (spools) ----------

registerPage('filament', renderResourcePage({
  key: 'spools', stateKey: 'spools', title: 'Filament', singular: 'Spool',
  subtitle: 'Spools, materials, and stock levels.', addLabel: 'New filament',
  extraHeaderActions: '<button class="btn outline" disabled title="Demo app">Filament catalog</button><button class="btn outline" disabled title="Demo app">Log usage</button><button class="btn outline" disabled title="Demo app">Import CSV</button>',
  emptyMessage: 'No filament yet. Add your first spool to start tracking stock.',
  columns: [
    { header: 'Spool #', render: (s) => escapeHtml(s.spoolNumber || '—') },
    { header: 'Brand', render: (s) => escapeHtml(s.brand) },
    { header: 'Material', render: (s) => escapeHtml(s.material) },
    { header: 'Color', render: (s) => escapeHtml(s.color || '—') },
    { header: 'Weight (g)', render: (s) => {
      const low = s.remainingWeightGrams <= (s.lowStockThresholdGrams ?? 100);
      return `<span class="${low ? 'low-stock' : ''}">${fmtGrams(s.remainingWeightGrams)} / ${fmtGrams(s.totalWeightGrams)}</span>`;
    } },
    { header: 'Location', render: (s) => escapeHtml(s.location || '—') },
    { header: 'Last dried', render: (s) => s.lastDriedAt ? fmtDate(s.lastDriedAt) : '—' },
    { header: 'Spool price', render: (s) => s.spoolPrice != null ? money(s.spoolPrice) : '—' },
  ],
  formFields: (s = {}) => [
    { name: 'spoolNumber', label: 'Spool #', value: s.spoolNumber || `SP-${String(state.spools.length + 1).padStart(4, '0')}` },
    { name: 'brand', label: 'Brand', required: true, value: s.brand },
    { name: 'material', label: 'Material', required: true, value: s.material },
    { name: 'color', label: 'Color', value: s.color },
    { name: 'totalWeightGrams', label: 'Total spool weight (g)', type: 'number', value: s.totalWeightGrams ?? 1000 },
    { name: 'remainingWeightGrams', label: 'Remaining weight (g)', type: 'number', value: s.remainingWeightGrams ?? 1000 },
    { name: 'lowStockThresholdGrams', label: 'Low-stock threshold (g)', type: 'number', value: s.lowStockThresholdGrams ?? 100 },
    { name: 'location', label: 'Location', value: s.location },
    { name: 'lastDriedAt', label: 'Last dried', type: 'date', value: s.lastDriedAt ? s.lastDriedAt.slice(0, 10) : '' },
    { name: 'spoolPrice', label: 'Spool price', type: 'number', step: '0.01', value: s.spoolPrice },
  ],
}));

// ---------- Products ----------

registerPage('products', renderResourcePage({
  key: 'products', stateKey: 'products', title: 'Products', singular: 'Product',
  subtitle: 'Your catalog, variants, and on-hand stock.', addLabel: 'New product',
  emptyMessage: 'No products yet. Add your first product to start building your catalog.',
  columns: [
    { header: 'Name', render: (p) => escapeHtml(p.name) },
    { header: 'SKU', render: (p) => escapeHtml(p.sku || '—') },
    { header: 'Price', render: (p) => money(p.price) },
    { header: 'In stock', render: (p) => p.stock ?? 0 },
    { header: 'Variants', render: (p) => (p.variants || []).length },
    { header: 'Calculated cost', render: (p) => p.calculatedCost != null ? money(p.calculatedCost) : '—' },
    { header: 'Est. profit', render: (p) => (p.price != null && p.calculatedCost != null) ? money(p.price - p.calculatedCost) : '—' },
  ],
  formFields: (p = {}) => [
    { name: 'name', label: 'Name', required: true, value: p.name },
    { name: 'sku', label: 'SKU', value: p.sku },
    { name: 'price', label: 'Price', type: 'number', step: '0.01', value: p.price },
    { name: 'stock', label: 'In stock', type: 'number', value: p.stock },
    { name: 'calculatedCost', label: 'Calculated cost', type: 'number', step: '0.01', value: p.calculatedCost },
    { name: 'notes', label: 'Notes', type: 'textarea', value: p.notes },
  ],
}));

// ---------- Inventory ----------

registerPage('inventory', renderResourcePage({
  key: 'inventoryItems', stateKey: 'inventoryItems', title: 'Inventory', singular: 'Item',
  subtitle: 'On-hand stock, unit prices, and reorder points.', addLabel: 'New item',
  emptyMessage: 'No stock items yet. Add your first item to start tracking inventory.',
  columns: [
    { header: 'Name', render: (i) => escapeHtml(i.name) },
    { header: 'Quantity', render: (i) => {
      const low = i.quantity <= (i.lowStockThreshold ?? 0);
      return `<span class="${low ? 'low-stock' : ''}">${i.quantity ?? 0}</span>`;
    } },
    { header: 'Unit price', render: (i) => i.unitPrice != null ? money(i.unitPrice) : '—' },
    { header: 'Low-stock threshold', render: (i) => i.lowStockThreshold ?? '—' },
    { header: 'Expiry', render: (i) => i.expiry ? fmtDate(i.expiry) : '—' },
  ],
  formFields: (i = {}) => [
    { name: 'name', label: 'Name', required: true, value: i.name },
    { name: 'quantity', label: 'Quantity', type: 'number', value: i.quantity ?? 0 },
    { name: 'unitPrice', label: 'Unit price', type: 'number', step: '0.01', value: i.unitPrice },
    { name: 'lowStockThreshold', label: 'Low-stock threshold', type: 'number', value: i.lowStockThreshold },
    { name: 'expiry', label: 'Expiry', type: 'date', value: i.expiry ? i.expiry.slice(0, 10) : '' },
  ],
}));

// ---------- Expenses ----------

registerPage('expenses', renderResourcePage({
  key: 'expenses', stateKey: 'expenses', title: 'Expenses', singular: 'Entry',
  subtitle: 'Track shop costs by category.', addLabel: 'New entry',
  emptyMessage: 'No expenses yet. Add your first entry to see it here.',
  beforeTable: (items) => {
    const now = new Date();
    const thisMonth = items.filter((e) => e.date && new Date(e.date).getMonth() === now.getMonth() && new Date(e.date).getFullYear() === now.getFullYear());
    const spent = thisMonth.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const byCategory = {};
    for (const e of thisMonth) byCategory[e.category || 'Other'] = (byCategory[e.category || 'Other'] || 0) + (Number(e.amount) || 0);
    const biggest = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
    return `
      <div class="grid grid-3" style="margin-bottom:20px;">
        <div class="card stat-card"><div class="stat-label">Spent this month</div><div class="stat-sub">Month to date, net of credits</div><div class="stat-value">${money(spent)}</div></div>
        <div class="card stat-card"><div class="stat-label">Projected this month</div><div class="stat-sub">At the current run-rate</div><div class="stat-value">${money(now.getDate() ? (spent / now.getDate()) * 30 : 0)}</div></div>
        <div class="card stat-card"><div class="stat-label">Biggest category</div><div class="stat-sub">${biggest ? escapeHtml(biggest[0]) : 'No spending this month'}</div><div class="stat-value">${biggest ? money(biggest[1]) : '—'}</div></div>
      </div>
    `;
  },
  columns: [
    { header: 'Date', render: (e) => fmtDate(e.date) },
    { header: 'Category', render: (e) => escapeHtml(e.category || '—') },
    { header: 'Description', render: (e) => escapeHtml(e.description || '—') },
    { header: 'Amount', render: (e) => `${money(e.amount)}${e.recurring ? ' <span class="badge gray">recurring</span>' : ''}` },
  ],
  formFields: (e = {}) => [
    { name: 'date', label: 'Date', type: 'date', value: e.date ? e.date.slice(0, 10) : new Date().toISOString().slice(0, 10) },
    { name: 'category', label: 'Category', value: e.category, required: true },
    { name: 'description', label: 'Description', value: e.description },
    { name: 'amount', label: 'Amount', type: 'number', step: '0.01', required: true, value: e.amount },
    { name: 'recurring', label: 'Recurring expense', type: 'checkbox', value: e.recurring },
  ],
}));
