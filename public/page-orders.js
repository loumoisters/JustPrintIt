// public/page-orders.js

// Once an order is linked to an invoice it disappears from the New Invoice
// "Autofill from order" dropdown (see page-invoices.js) - that's silent
// from the Orders side, so this small badge is the only place it shows.
function isOrderInvoiced(orderId) {
  return state.invoices.some((i) => i.orderId === orderId);
}

function orderPrinterName(printerId) {
  const p = state.printers.find((pr) => pr.id === printerId);
  return p ? p.name : '';
}

function orderCardHtml(o) {
  const printerName = orderPrinterName(o.printerId);
  return `
    <div class="kanban-card" draggable="true" data-order-id="${o.id}" title="Double-click to open">
      <div class="kc-title" style="display:flex; align-items:center; gap:6px;">
        ${escapeHtml(o.orderNumber || 'Order')}
        ${o.priority === 'high' ? `<span class="badge red" style="font-size:10px; padding:1px 6px;">High</span>` : ''}
        ${isOrderInvoiced(o.id) ? `<span class="badge gray" style="font-size:10px; padding:1px 6px;">Invoiced</span>` : ''}
        ${o.quoteId ? `<span class="badge blue" style="font-size:10px; padding:1px 6px;">From Quote</span>` : ''}
        ${o.invoiceId ? `<span class="badge blue" style="font-size:10px; padding:1px 6px;">From Invoice</span>` : ''}
      </div>
      <div class="kc-meta">${escapeHtml(customerName(o.customerId))}</div>
      ${o.fileName || printerName ? `
        <div class="kc-meta" style="margin-top:4px; display:flex; align-items:center; gap:5px; overflow:hidden;">
          ${printerName ? `<span style="display:flex; align-items:center; gap:3px; flex-shrink:0;">${icon('printers', 11)}${escapeHtml(printerName)}</span>` : ''}
          ${o.fileName ? `<span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(o.fileName)}">${printerName ? '· ' : ''}${escapeHtml(o.fileName)}</span>` : ''}
        </div>
      ` : ''}
      <div class="kc-meta" style="margin-top:4px; display:flex; justify-content:space-between; align-items:center;">
        <span style="display:flex; align-items:center; gap:6px;">
          ${o.dueDate ? fmtDate(o.dueDate) : 'No due date'}
          ${o.fulfillment === 'ship' ? '<span class="muted">· Ship</span>' : ''}
        </span>
        <span>${money(o.total)}</span>
      </div>
    </div>
  `;
}

// Shared by the kanban card double-click and the Orders table's edit
// button, so there's one "open an order for editing" implementation.
function openEditOrderModal(o) {
  openModal('Edit Order', orderFormFields(o), async (data) => {
    await api('PUT', `/api/orders/${o.id}`, data);
    showToast('Order updated');
    await refreshAndRerender();
  });
}

// Renders a draggable kanban board of orders into #<elId>. Used by both the
// Dashboard (preview) and the Orders page (full board).
function renderKanbanBoard(elId, orders) {
  const el = document.getElementById(elId);
  if (!el) return;

  el.innerHTML = `
    <div class="kanban-board">
      ${ORDER_STATUSES.map((s) => {
        const items = orders.filter((o) => o.status === s);
        return `
          <div class="kanban-column" data-status="${s}">
            <div class="kanban-column-header">
              <span style="display:flex; align-items:center; gap:6px;">
                <span style="width:7px; height:7px; border-radius:999px; background:${ORDER_STATUS_DOT[s]}; flex-shrink:0;"></span>
                ${ORDER_STATUS_LABELS[s]}
              </span>
              <span style="display:flex; align-items:center; gap:6px;">
                <span class="count">${items.length}</span>
                <span class="muted" style="cursor:${items.length ? 'pointer' : 'default'};" data-archive-column="${s}" title="${items.length ? `Archive all ${items.length} order${items.length === 1 ? '' : 's'} in this column` : 'No orders in this column'}">${icon('more', 13)}</span>
              </span>
            </div>
            <div class="kanban-drop-zone" data-status="${s}" style="min-height:40px;">
              ${items.map(orderCardHtml).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  let draggedId = null;
  el.querySelectorAll('.kanban-card').forEach((card) => {
    card.addEventListener('dragstart', () => { draggedId = card.dataset.orderId; card.style.opacity = '0.5'; });
    card.addEventListener('dragend', () => { card.style.opacity = '1'; });
    card.addEventListener('dblclick', () => {
      const order = orders.find((o) => o.id === card.dataset.orderId);
      if (order) openEditOrderModal(order);
    });
  });
  el.querySelectorAll('.kanban-column').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const newStatus = col.dataset.status;
      if (!draggedId) return;
      const order = orders.find((o) => o.id === draggedId);
      if (!order || order.status === newStatus) return;
      try {
        await api('PUT', `/api/orders/${draggedId}`, { status: newStatus });
        showToast(`Moved to ${ORDER_STATUS_LABELS[newStatus]}`);
        await refreshAndRerender();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });

  el.querySelectorAll('[data-archive-column]').forEach((btn) => {
    btn.onclick = async () => {
      const status = btn.dataset.archiveColumn;
      const columnOrders = orders.filter((o) => o.status === status);
      if (!columnOrders.length) return;
      if (!confirm(`Archive all ${columnOrders.length} order${columnOrders.length === 1 ? '' : 's'} in ${ORDER_STATUS_LABELS[status]}? You can find them later under the Archived filter.`)) return;
      try {
        await Promise.all(columnOrders.map((o) => api('PUT', `/api/orders/${o.id}`, { archived: true })));
        showToast('Orders archived');
        await refreshAndRerender();
      } catch (err) {
        showToast(err.message, true);
      }
    };
  });
}

function orderFormFields(order = {}) {
  return [
    { name: 'orderNumber', label: 'Order #', value: order.orderNumber || nextNumber('orderNumberPrefix', state.orders, 'orderNumber') },
    {
      name: 'customerId', label: 'Customer', type: 'select', value: order.customerId,
      options: [{ value: '', label: '(none)' }, ...state.customers.map((c) => ({ value: c.id, label: c.name }))],
    },
    {
      name: 'status', label: 'Status', type: 'select', value: order.status || 'pending',
      options: ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] })),
    },
    {
      name: 'priority', label: 'Priority', type: 'select', value: order.priority || 'normal',
      options: ['low', 'normal', 'high'].map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) })),
    },
    { name: 'dueDate', label: 'Due date', type: 'date', value: order.dueDate ? order.dueDate.slice(0, 10) : '' },
    {
      name: 'fulfillment', label: 'Fulfillment', type: 'select', value: order.fulfillment || 'pickup',
      options: [{ value: 'pickup', label: 'Pickup' }, { value: 'ship', label: 'Ship' }],
    },
    { name: 'total', label: 'Total', type: 'number', step: '0.01', value: order.total },
    {
      name: 'printerId', label: 'Assigned printer (optional)', type: 'select', value: order.printerId,
      options: [{ value: '', label: '(unassigned)' }, ...state.printers.map((p) => ({ value: p.id, label: p.name }))],
    },
    { name: 'fileName', label: 'Print file name (optional)', value: order.fileName },
    { name: 'estimatedSeconds', label: 'Estimated print time (seconds, optional)', type: 'number', value: order.estimatedSeconds },
    { name: 'filamentUsedGrams', label: 'Filament used (grams)', type: 'number', value: order.filamentUsedGrams },
    { name: 'notes', label: 'Notes', type: 'textarea', value: order.notes },
  ];
}

// nextNumber() lives in core.js so every page (Orders, Quotes, Invoices,
// Customers, Filament) shares the same numbering logic.

// ---------- Orders table: search + status filters ----------

let orderListSearch = '';
let orderListStatusFilter = 'all';

function getFilteredOrders() {
  let list = state.orders.slice();
  if (orderListStatusFilter === 'archived') {
    list = list.filter((o) => o.archived);
  } else {
    list = list.filter((o) => !o.archived);
    if (orderListStatusFilter !== 'all') list = list.filter((o) => o.status === orderListStatusFilter);
  }
  if (orderListSearch.trim()) {
    list = list.filter((o) => [o.orderNumber, customerName(o.customerId), ORDER_STATUS_LABELS[o.status] || o.status, o.notes].some((h) => fuzzyMatch(orderListSearch, h)));
  }
  return list;
}

function renderOrdersTable() {
  const tableEl = document.getElementById('orders-table');
  if (!tableEl) return;

  if (!state.orders.length) {
    tableEl.innerHTML = `<div class="empty-state">No orders yet. Create your first order to see it here.</div>`;
    return;
  }

  const list = getFilteredOrders();
  if (!list.length) {
    tableEl.innerHTML = `<div class="empty-state">No orders match your search or filter.</div>`;
    return;
  }

  const rows = list.map((o) => `
    <tr>
      <td>${escapeHtml(o.orderNumber || '—')}${isOrderInvoiced(o.id) ? ` <span class="badge gray" style="font-size:10px; padding:1px 6px;">Invoiced</span>` : ''}</td>
      <td>${escapeHtml(customerName(o.customerId))}</td>
      <td>${badge(ORDER_STATUS_LABELS[o.status] || o.status, o.status)}</td>
      <td>${escapeHtml(o.priority || 'normal')}</td>
      <td>${fmtDate(o.dueDate)}</td>
      <td>${escapeHtml(o.fulfillment || '—')}</td>
      <td>${money(o.total)}</td>
      <td>
        <div class="row-actions">
          <button class="btn outline small" data-edit-order="${o.id}">${icon('edit', 13)}</button>
          ${o.archived
            ? `<button class="btn outline small" data-unarchive-order="${o.id}" title="Unarchive">${icon('inbox', 13)}</button>`
            : `<button class="btn outline small" data-archive-order="${o.id}" title="Archive">${icon('x', 13)}</button>`}
          <button class="btn outline small" data-del-order="${o.id}">${icon('trash', 13)}</button>
        </div>
      </td>
    </tr>
  `).join('');

  tableEl.innerHTML = `
    <table>
      <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Priority</th><th>Due</th><th>Fulfillment</th><th>Total</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  list.forEach((o) => {
    const editBtn = tableEl.querySelector(`[data-edit-order="${o.id}"]`);
    const delBtn = tableEl.querySelector(`[data-del-order="${o.id}"]`);
    const archiveBtn = tableEl.querySelector(`[data-archive-order="${o.id}"]`);
    const unarchiveBtn = tableEl.querySelector(`[data-unarchive-order="${o.id}"]`);
    if (editBtn) editBtn.onclick = () => openEditOrderModal(o);
    if (delBtn) delBtn.onclick = async () => {
      if (!confirm('Delete this order?')) return;
      await api('DELETE', `/api/orders/${o.id}`);
      showToast('Order deleted');
      await refreshAndRerender();
    };
    if (archiveBtn) archiveBtn.onclick = async () => {
      try {
        await api('PUT', `/api/orders/${o.id}`, { archived: true });
        showToast('Order archived');
        await refreshAndRerender();
      } catch (err) {
        showToast(err.message, true);
      }
    };
    if (unarchiveBtn) unarchiveBtn.onclick = async () => {
      try {
        await api('PUT', `/api/orders/${o.id}`, { archived: false });
        showToast('Order restored');
        await refreshAndRerender();
      } catch (err) {
        showToast(err.message, true);
      }
    };
  });
}

async function renderOrders() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Orders</h1>
        <p class="page-subtitle">Track and fulfill customer orders.</p>
      </div>
      <div class="page-actions">
        <button class="btn outline" disabled title="Demo app - CSV import not wired up">Import CSV</button>
        <button class="btn brand" id="add-order">+ New order</button>
      </div>
    </div>

    <div id="orders-kanban"></div>

    <div class="section-header"><h2>All Orders</h2></div>
    <div class="quotes-toolbar">
      <div class="quotes-search">${icon('search', 15)}<input type="text" id="orders-search-input" placeholder="Search orders..." value="${escapeHtml(orderListSearch)}" autocomplete="off"/></div>
      <div class="status-filter-group">
        ${['all', ...ORDER_STATUSES, 'archived'].map((st) => `<button type="button" class="status-filter-btn ${orderListStatusFilter === st ? 'active' : ''}" data-status-filter="${st}">${st === 'all' ? 'All' : st === 'archived' ? 'Archived' : ORDER_STATUS_LABELS[st]}</button>`).join('')}
      </div>
    </div>
    <div class="card" id="orders-table"></div>
  `;

  // Archived orders are done with production - they don't belong on the
  // live kanban board, only in the table below under the Archived filter.
  renderKanbanBoard('orders-kanban', state.orders.filter((o) => !o.archived));

  document.getElementById('orders-search-input').oninput = (e) => {
    orderListSearch = e.target.value;
    renderOrdersTable();
  };

  document.querySelectorAll('[data-status-filter]').forEach((btn) => {
    btn.onclick = () => {
      orderListStatusFilter = btn.dataset.statusFilter;
      document.querySelectorAll('[data-status-filter]').forEach((b) => b.classList.toggle('active', b.dataset.statusFilter === orderListStatusFilter));
      renderOrdersTable();
    };
  });

  renderOrdersTable();

  document.getElementById('add-order').onclick = () => openModal('New Order', orderFormFields(), async (data) => {
    await api('POST', '/api/orders', data);
    showToast('Order created');
    await refreshAndRerender();
  });
}

registerPage('orders', renderOrders);
