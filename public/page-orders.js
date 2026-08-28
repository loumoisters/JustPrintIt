// public/page-orders.js

function orderCardHtml(o) {
  return `
    <div class="kanban-card" draggable="true" data-order-id="${o.id}">
      <div class="kc-title">${escapeHtml(o.orderNumber || 'Order')}</div>
      <div class="kc-meta">${escapeHtml(customerName(o.customerId))}</div>
      <div class="kc-meta" style="margin-top:4px; display:flex; justify-content:space-between;">
        <span>${o.dueDate ? fmtDate(o.dueDate) : 'No due date'}</span>
        <span>${money(o.total)}</span>
      </div>
    </div>
  `;
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
              <span>${ORDER_STATUS_LABELS[s]}</span>
              <span class="count">${items.length}</span>
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
        if (state.page === 'orders') await renderOrders();
        else if (state.page === 'dashboard') await renderDashboard();
      } catch (err) {
        showToast(err.message, true);
      }
    });
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

function nextNumber(prefixKey, list, field) {
  const prefix = state.settings[prefixKey] || '';
  const n = list.length + 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
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
    <div class="card" id="orders-table"></div>
  `;

  renderKanbanBoard('orders-kanban', state.orders);

  const rows = state.orders.map((o) => `
    <tr>
      <td>${escapeHtml(o.orderNumber || '—')}</td>
      <td>${escapeHtml(customerName(o.customerId))}</td>
      <td>${badge(ORDER_STATUS_LABELS[o.status] || o.status, o.status)}</td>
      <td>${escapeHtml(o.priority || 'normal')}</td>
      <td>${fmtDate(o.dueDate)}</td>
      <td>${escapeHtml(o.fulfillment || '—')}</td>
      <td>${money(o.total)}</td>
      <td>
        <div class="row-actions">
          <button class="btn outline small" data-edit-order="${o.id}">${icon('edit', 13)}</button>
          <button class="btn outline small" data-del-order="${o.id}">${icon('trash', 13)}</button>
        </div>
      </td>
    </tr>
  `).join('');

  document.getElementById('orders-table').innerHTML = state.orders.length ? `
    <table>
      <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Priority</th><th>Due</th><th>Fulfillment</th><th>Total</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  ` : `<div class="empty-state">No orders yet. Create your first order to see it here.</div>`;

  state.orders.forEach((o) => {
    const editBtn = document.querySelector(`[data-edit-order="${o.id}"]`);
    const delBtn = document.querySelector(`[data-del-order="${o.id}"]`);
    if (editBtn) editBtn.onclick = () => openModal('Edit Order', orderFormFields(o), async (data) => {
      await api('PUT', `/api/orders/${o.id}`, data);
      showToast('Order updated');
      await renderOrders();
    });
    if (delBtn) delBtn.onclick = async () => {
      if (!confirm('Delete this order?')) return;
      await api('DELETE', `/api/orders/${o.id}`);
      showToast('Order deleted');
      await renderOrders();
    };
  });

  document.getElementById('add-order').onclick = () => openModal('New Order', orderFormFields(), async (data) => {
    await api('POST', '/api/orders', data);
    showToast('Order created');
    await renderOrders();
  });
}

registerPage('orders', renderOrders);
