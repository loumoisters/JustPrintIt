// public/page-inventory.js
// Inventory gets its own dedicated modal (not the generic openModal() field
// renderer) so Quantity/Unit price can sit in a two-column row and Expiry
// can be a toggle-revealed field instead of an always-visible date picker -
// neither of which the generic field-list renderer supports.

let inventoryFormState = null;
let inventoryFormIsEdit = false;

function inventoryExpiryFieldHtml() {
  const i = inventoryFormState;
  return `
    <div class="field" style="max-width:180px;">
      <label>Expiry date</label>
      <div class="date-input-wrap">
        <input type="date" id="inv-expiry" value="${i.expiry ? i.expiry.slice(0, 10) : ''}"/>
        <button type="button" class="date-picker-btn" data-date-btn="inv-expiry" title="Pick a date">${icon('calendar', 15)}</button>
      </div>
    </div>
  `;
}

function inventoryModalBodyHtml() {
  const i = inventoryFormState;
  return `
    <div class="field">
      <label>Name</label>
      <input type="text" id="inv-name" value="${escapeHtml(i.name || '')}" placeholder="PLA filament, shipping boxes, ..." required/>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Quantity on hand</label>
        <input type="number" id="inv-quantity" min="0" value="${i.quantity ?? ''}" placeholder="0"/>
      </div>
      <div class="field">
        <label>Unit price</label>
        <input type="number" id="inv-unitPrice" min="0" step="0.01" value="${i.unitPrice ?? ''}" placeholder="0.00"/>
      </div>
    </div>
    <div class="field">
      <label>Low-stock threshold</label>
      <input type="number" id="inv-lowStockThreshold" min="0" value="${i.lowStockThreshold ?? ''}" placeholder="Low-stock threshold"/>
    </div>
    <div class="field" style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
      <div>
        <label style="margin-bottom:2px;">Track expiry date</label>
        <div class="muted" style="font-size:11.5px;">Flag this item when it approaches or passes its expiry date.</div>
      </div>
      <label class="switch" style="flex-shrink:0;"><input type="checkbox" id="inv-trackExpiry" ${i.trackExpiry ? 'checked' : ''}/><span class="slider-track"></span></label>
    </div>
    <div id="inv-expiry-wrap">${i.trackExpiry ? inventoryExpiryFieldHtml() : ''}</div>
    <div class="field" style="margin-bottom:0;">
      <label>Notes</label>
      <textarea id="inv-notes" rows="3" placeholder="Supplier, lot number, anything worth remembering...">${escapeHtml(i.notes || '')}</textarea>
    </div>
    <div class="field-hint" style="margin-top:12px;">Prices are in USD. Items at or below their minimum quantity, or past their expiry date, are flagged in the list.</div>
  `;
}

function readInventoryFormValues() {
  const byId = (id) => document.getElementById(`inv-${id}`);
  const trackExpiry = byId('trackExpiry').checked;
  const expiryEl = document.getElementById('inv-expiry'); // only present while trackExpiry is on
  return {
    name: byId('name').value,
    quantity: Number(byId('quantity').value) || 0,
    unitPrice: byId('unitPrice').value === '' ? null : Number(byId('unitPrice').value),
    lowStockThreshold: byId('lowStockThreshold').value === '' ? null : Number(byId('lowStockThreshold').value),
    expiry: trackExpiry && expiryEl && expiryEl.value ? expiryEl.value : '',
    notes: byId('notes').value,
  };
}

function openInventoryModal(existing) {
  inventoryFormIsEdit = !!existing;
  inventoryFormState = existing ? {
    ...existing,
    // trackExpiry is derived, not its own stored field - a saved date means
    // tracking was on; nothing saved means it wasn't.
    trackExpiry: !!existing.expiry,
  } : {
    name: '', quantity: 0, unitPrice: null, lowStockThreshold: null,
    trackExpiry: false, expiry: '', notes: '',
  };

  renderModalShell({
    title: inventoryFormIsEdit ? 'Edit item' : 'New item',
    subtitle: inventoryFormIsEdit ? undefined : 'Add a stock item to track on-hand quantity and reorder points.',
    bodyHtml: inventoryModalBodyHtml(),
    footerHtml: `
      <button type="button" class="btn outline" id="inv-cancel">Cancel</button>
      <button type="button" class="btn" id="inv-submit">${inventoryFormIsEdit ? 'Save changes' : 'Add item'}</button>
    `,
  });

  const wireInventoryDateBtn = () => {
    const btn = document.querySelector('[data-date-btn="inv-expiry"]');
    if (!btn) return;
    btn.onclick = () => {
      const input = document.getElementById('inv-expiry');
      if (!input) return;
      if (input.showPicker) { try { input.showPicker(); } catch { input.focus(); } } else { input.focus(); }
    };
  };
  wireInventoryDateBtn();

  document.getElementById('inv-trackExpiry').onchange = (e) => {
    inventoryFormState.trackExpiry = e.target.checked;
    document.getElementById('inv-expiry-wrap').innerHTML = inventoryFormState.trackExpiry ? inventoryExpiryFieldHtml() : '';
    wireInventoryDateBtn();
  };

  document.getElementById('inv-cancel').onclick = () => closeModal();
  document.getElementById('inv-submit').onclick = async () => {
    const values = readInventoryFormValues();
    if (!values.name.trim()) { showToast('Name is required', true); return; }
    try {
      if (inventoryFormIsEdit && inventoryFormState.id) {
        await api('PUT', `/api/inventoryItems/${inventoryFormState.id}`, values);
        showToast('Item updated');
      } else {
        await api('POST', '/api/inventoryItems', values);
        showToast('Item added');
      }
      closeModal();
      await refreshAndRerender();
    } catch (err) {
      showToast(err.message, true);
    }
  };
}

async function renderInventory() {
  const items = state.inventoryItems;
  const main = document.getElementById('main');

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Inventory</h1>
        <p class="page-subtitle">On-hand stock, unit prices, and reorder points.</p>
      </div>
      <div class="page-actions">
        <button class="btn outline" disabled title="Demo app - CSV import not wired up">Import CSV</button>
        <button class="btn brand" id="add-item">+ New item</button>
      </div>
    </div>
    <div class="card" id="inventory-table"></div>
  `;

  const tableEl = document.getElementById('inventory-table');
  if (!items.length) {
    tableEl.innerHTML = `<div class="empty-state">No stock items yet. Add your first item to start tracking inventory.</div>`;
  } else {
    const rows = items.map((i) => {
      const low = (i.quantity ?? 0) <= (i.lowStockThreshold ?? 0);
      return `
        <tr>
          <td>${escapeHtml(i.name)}</td>
          <td><span class="${low ? 'low-stock' : ''}">${i.quantity ?? 0}</span></td>
          <td>${i.unitPrice != null ? money(i.unitPrice) : '—'}</td>
          <td>${i.lowStockThreshold ?? '—'}</td>
          <td>${i.expiry ? fmtDate(i.expiry) : '—'}</td>
          <td>
            <div class="row-actions">
              <button class="btn outline small" data-edit="${i.id}">${icon('edit', 13)}</button>
              <button class="btn outline small" data-del="${i.id}">${icon('trash', 13)}</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tableEl.innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>Quantity</th><th>Unit price</th><th>Low-stock threshold</th><th>Expiry</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    items.forEach((i) => {
      const editBtn = tableEl.querySelector(`[data-edit="${i.id}"]`);
      const delBtn = tableEl.querySelector(`[data-del="${i.id}"]`);
      if (editBtn) editBtn.onclick = () => openInventoryModal(i);
      if (delBtn) delBtn.onclick = async () => {
        if (!confirm(`Delete this item?`)) return;
        await api('DELETE', `/api/inventoryItems/${i.id}`);
        showToast('Item deleted');
        await refreshAndRerender();
      };
    });
  }

  document.getElementById('add-item').onclick = () => openInventoryModal();
}

registerPage('inventory', renderInventory);
