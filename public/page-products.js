// public/page-products.js
// Products gets its own dedicated modal (not the generic resource-page
// modal) for the tab bar, the fulfillment segmented control, the repeatable
// variant cards, and the live totals row - none of which the generic
// openModal() field renderer supports.
//
// Only the "Details" tab has real fields. Pricing/Stock/BOM are shown as
// disabled tabs (same treatment as Settings' not-yet-built tabs) because
// nothing beyond their names and a one-line description exists to build
// them from yet - "Calculated cost" is a manually-entered estimate for now,
// not something computed from a bill of materials.

let productFormState = null;
let productFormIsEdit = false;

const PRODUCT_TABS = ['Details', 'Pricing', 'Stock', 'BOM'];

const FULFILLMENT_MODES = [
  { value: 'made_to_order', label: 'Made to order', help: 'Printed after the order comes in.' },
  { value: 'from_stock', label: 'From stock', help: 'Fulfilled from on-hand inventory.' },
  { value: 'hybrid', label: 'Hybrid', help: 'Some from stock, the rest made to order.' },
];

function fulfillmentLabel(mode) {
  return (FULFILLMENT_MODES.find((f) => f.value === mode) || FULFILLMENT_MODES[0]).label;
}

function newVariant(name = '') {
  return { name, priceOverride: '', quantity: 0, sku: '', lowStockThreshold: '' };
}

// Belt-and-suspenders: lib/db.js normalizes old-shaped records (variants
// without their own quantity) server-side now, so the API never actually
// sends that shape - this just means the UI still degrades gracefully if
// that ever changes (e.g. a restored backup from before normalization
// existed, read by an older server build).
function productStock(p) {
  const variants = p.variants || [];
  if (variants.length && variants.some((v) => v.quantity != null)) {
    return variants.reduce((sum, v) => sum + (Number(v.quantity) || 0), 0);
  }
  return Number(p.stock) || 0;
}

// ---------- Tabs (Details only is real) ----------

function productTabsHtml() {
  return `
    <div class="segmented-tabs">
      ${PRODUCT_TABS.map((t) => {
        const isDetails = t === 'Details';
        return `<button type="button" class="segmented-tab ${isDetails ? 'active' : 'disabled'}" ${isDetails ? '' : 'disabled title="Not built yet"'}>${t}</button>`;
      }).join('')}
    </div>
  `;
}

// ---------- Fulfillment ----------

function fulfillmentButtonsHtml() {
  const s = productFormState;
  return FULFILLMENT_MODES.map((m) => `
    <button type="button" class="btn ${s.fulfillmentMode === m.value ? 'brand' : 'outline'} small" data-fulfillment="${m.value}" title="${escapeHtml(m.help)}" style="flex:1; justify-content:center; gap:5px;">
      ${escapeHtml(m.label)} ${icon('help', 12)}
    </button>
  `).join('');
}

function wireFulfillmentButtons() {
  document.querySelectorAll('[data-fulfillment]').forEach((btn) => {
    btn.onclick = () => {
      productFormState.fulfillmentMode = btn.dataset.fulfillment;
      const wrap = document.getElementById('p-fulfillment');
      if (wrap) wrap.innerHTML = fulfillmentButtonsHtml();
      wireFulfillmentButtons();
    };
  });
}

// ---------- Variants ----------

function variantRowHtml(v, idx) {
  return `
    <div class="qline" data-variant-idx="${idx}">
      <div class="qline-row">
        <div style="flex:2;"><input type="text" data-variant-field="name" value="${escapeHtml(v.name || '')}" placeholder="Variant name"/></div>
        <div><input type="number" step="0.01" data-variant-field="priceOverride" value="${v.priceOverride ?? ''}" placeholder="—"/></div>
        <div style="flex:0 0 80px;"><input type="number" min="0" data-variant-field="quantity" value="${v.quantity ?? 0}"/></div>
        <button type="button" class="qline-remove" data-remove-variant title="Remove variant">${icon('trash', 14)}</button>
      </div>
      <div class="qline-row">
        <div><input type="text" data-variant-field="sku" value="${escapeHtml(v.sku || '')}" placeholder="SKU (optional)"/></div>
        <div><input type="number" min="0" data-variant-field="lowStockThreshold" value="${v.lowStockThreshold ?? ''}" placeholder="Low-stock threshold"/></div>
      </div>
    </div>
  `;
}

function rerenderVariants() {
  const container = document.getElementById('p-variants-list');
  if (!container) return;
  container.innerHTML = productFormState.variants.map(variantRowHtml).join('');
  updateTotals();
}

// ---------- Totals ----------
// Total quantity and Estimated profit are pure read-only text (updated via
// textContent, never re-rendered as HTML) so typing in the Calculated cost
// field next to them never loses focus/cursor position.

function totalQuantity() {
  return productStock(productFormState);
}

function updateTotals() {
  const qtyEl = document.getElementById('p-total-qty');
  const profitEl = document.getElementById('p-est-profit');
  const priceInput = document.getElementById('p-price');
  if (qtyEl) qtyEl.textContent = totalQuantity();
  if (profitEl) {
    const price = priceInput ? (Number(priceInput.value) || 0) : (Number(productFormState.price) || 0);
    const cost = Number(productFormState.calculatedCost) || 0;
    profitEl.textContent = money(price - cost);
  }
}

// ---------- Modal ----------

function productModalBodyHtml() {
  const p = productFormState;
  return `
    ${productTabsHtml()}
    <div class="field">
      <label>Name</label>
      <input type="text" id="p-name" value="${escapeHtml(p.name || '')}" placeholder="Articulated dragon, desk organizer, ..." required/>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Price</label>
        <input type="number" id="p-price" min="0" step="0.01" value="${p.price ?? 0}"/>
      </div>
      <div class="field">
        <label>SKU</label>
        <input type="text" id="p-sku" value="${escapeHtml(p.sku || '')}" placeholder="Optional"/>
      </div>
    </div>
    <div class="field">
      <label>Description</label>
      <textarea id="p-description" rows="3" placeholder="Materials, print time, anything worth noting...">${escapeHtml(p.description || '')}</textarea>
    </div>
    <div class="field">
      <label>Fulfillment</label>
      <div id="p-fulfillment" style="display:flex; gap:8px;">${fulfillmentButtonsHtml()}</div>
    </div>
    <div class="field">
      <label>Variants</label>
      <div style="display:flex; gap:8px; font-size:10px; text-transform:uppercase; letter-spacing:0.04em; color:var(--muted-foreground); padding:0 12px; margin-bottom:6px;">
        <span style="flex:2;">Name</span><span style="flex:1;">Price override</span><span style="flex:0 0 80px;">Qty</span>
      </div>
      <div id="p-variants-list">${p.variants.map(variantRowHtml).join('')}</div>
      <button type="button" class="btn outline small" id="p-add-variant">${icon('plus', 13)} Add variant</button>
    </div>
    <div style="border-top:1px solid var(--border); margin:18px 0 4px 0; padding-top:10px;">
      <div class="calc-row"><span class="calc-label">Total quantity</span><span id="p-total-qty">0</span></div>
      <div class="calc-row"><span class="calc-label">Calculated cost</span><span>$<input type="number" id="p-calculatedCost" min="0" step="0.01" value="${p.calculatedCost ?? 0}" style="width:80px; text-align:right; border:none; background:transparent; padding:0; font:inherit; color:inherit;"/></span></div>
      <div class="calc-row calc-total"><span class="calc-label">Estimated profit</span><span id="p-est-profit">$0.00</span></div>
    </div>
    <div class="field-hint" style="margin-top:10px;">Prices are in USD. Variants without a price override use the product price. A product with no extra options keeps one "Default" variant, and its quantity becomes the product's stock. Calculated cost is a manual estimate for now - it'll pull from bill-of-materials, inventory, electricity, depreciation, and labor once the BOM tab is built. Estimated profit is price minus calculated cost.</div>
  `;
}

function readProductFormValues() {
  const byId = (id) => document.getElementById(id);
  const variants = productFormState.variants.map((v) => ({
    name: (v.name || '').trim() || 'Default',
    priceOverride: v.priceOverride === '' || v.priceOverride == null ? null : Number(v.priceOverride),
    quantity: Number(v.quantity) || 0,
    sku: v.sku || '',
    lowStockThreshold: v.lowStockThreshold === '' || v.lowStockThreshold == null ? null : Number(v.lowStockThreshold),
  }));
  return {
    name: byId('p-name').value,
    price: Number(byId('p-price').value) || 0,
    sku: byId('p-sku').value,
    description: byId('p-description').value,
    fulfillmentMode: productFormState.fulfillmentMode,
    variants,
    // Kept in sync for anything reading the product-level total directly
    // (e.g. the products table) without re-summing the variants array.
    stock: variants.reduce((sum, v) => sum + v.quantity, 0),
    calculatedCost: Number(productFormState.calculatedCost) || 0,
  };
}

function wireProductModalEvents() {
  document.getElementById('p-price').oninput = () => updateTotals();
  document.getElementById('p-calculatedCost').oninput = (e) => {
    productFormState.calculatedCost = Number(e.target.value) || 0;
    updateTotals();
  };

  wireFulfillmentButtons();

  const list = document.getElementById('p-variants-list');
  list.addEventListener('input', (e) => {
    const field = e.target.dataset.variantField;
    if (!field) return;
    const row = e.target.closest('[data-variant-idx]');
    if (!row) return;
    productFormState.variants[Number(row.dataset.variantIdx)][field] = e.target.value;
    if (field === 'quantity') updateTotals();
  });
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-variant]');
    if (!btn) return;
    if (productFormState.variants.length <= 1) {
      showToast('A product needs at least one variant', true);
      return;
    }
    const row = btn.closest('[data-variant-idx]');
    productFormState.variants.splice(Number(row.dataset.variantIdx), 1);
    rerenderVariants();
  });

  document.getElementById('p-add-variant').onclick = () => {
    productFormState.variants.push(newVariant());
    rerenderVariants();
  };
}

function openProductModal(existing) {
  productFormIsEdit = !!existing;
  productFormState = existing ? {
    ...existing,
    variants: existing.variants && existing.variants.length ? existing.variants.map((v) => ({ ...v })) : [newVariant('Default')],
    fulfillmentMode: existing.fulfillmentMode || 'made_to_order',
    calculatedCost: existing.calculatedCost ?? 0,
  } : {
    name: '', price: 0, sku: '', description: '',
    fulfillmentMode: 'made_to_order',
    variants: [newVariant('Default')],
    calculatedCost: 0,
  };

  renderModalShell({
    title: productFormIsEdit ? 'Edit product' : 'New product',
    subtitle: 'Add a product to your catalog. Stock is tracked per variant.',
    bodyHtml: productModalBodyHtml(),
    footerHtml: `
      <button type="button" class="btn outline" id="p-cancel">Cancel</button>
      <button type="button" class="btn" id="p-submit">${productFormIsEdit ? 'Save changes' : 'Create product'}</button>
    `,
  });

  wireProductModalEvents();
  updateTotals();

  document.getElementById('p-cancel').onclick = () => closeModal();
  document.getElementById('p-submit').onclick = async () => {
    const values = readProductFormValues();
    if (!values.name.trim()) { showToast('Name is required', true); return; }
    try {
      if (productFormIsEdit && productFormState.id) {
        await api('PUT', `/api/products/${productFormState.id}`, values);
        showToast('Product updated');
      } else {
        await api('POST', '/api/products', values);
        showToast('Product added');
      }
      closeModal();
      await refreshAndRerender();
    } catch (err) {
      showToast(err.message, true);
    }
  };
}

// ---------- List page ----------

async function renderProducts() {
  const main = document.getElementById('main');
  const items = state.products;

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Products</h1>
        <p class="page-subtitle">Your catalog, variants, and on-hand stock.</p>
      </div>
      <div class="page-actions">
        <button class="btn outline" disabled title="Demo app">Import CSV</button>
        <button class="btn brand" id="add-product">+ New product</button>
      </div>
    </div>
    <div class="card" id="products-table"></div>
  `;

  const tableEl = document.getElementById('products-table');
  if (!items.length) {
    tableEl.innerHTML = `<div class="empty-state">No products yet. Add your first product to start building your catalog.</div>`;
  } else {
    const rows = items.map((p) => {
      const variants = p.variants || [];
      const stock = productStock(p);
      const cost = Number(p.calculatedCost) || 0;
      return `
        <tr>
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(p.sku || '—')}</td>
          <td>${money(p.price)}</td>
          <td>${escapeHtml(fulfillmentLabel(p.fulfillmentMode))}</td>
          <td><span class="${variants.some((v) => (Number(v.quantity) || 0) <= (Number(v.lowStockThreshold) || 0) && v.lowStockThreshold) ? 'low-stock' : ''}">${stock}</span></td>
          <td>${variants.length || 1}</td>
          <td>${money((Number(p.price) || 0) - cost)}</td>
          <td>
            <div class="row-actions">
              <button class="btn outline small" data-edit="${p.id}">${icon('edit', 13)}</button>
              <button class="btn outline small" data-del="${p.id}">${icon('trash', 13)}</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tableEl.innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>SKU</th><th>Price</th><th>Fulfillment</th><th>Stock</th><th>Variants</th><th>Est. profit</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    items.forEach((p) => {
      const editBtn = tableEl.querySelector(`[data-edit="${p.id}"]`);
      const delBtn = tableEl.querySelector(`[data-del="${p.id}"]`);
      if (editBtn) editBtn.onclick = () => openProductModal(p);
      if (delBtn) delBtn.onclick = async () => {
        if (!confirm('Delete this product?')) return;
        await api('DELETE', `/api/products/${p.id}`);
        showToast('Product deleted');
        await refreshAndRerender();
      };
    });
  }

  document.getElementById('add-product').onclick = () => openProductModal();
}

registerPage('products', renderProducts);
