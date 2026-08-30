// public/page-invoices.js
// Invoices get a dedicated builder modal (not the generic resource-page
// modal), mirroring the Quotes calculator: a real document builder with
// autofill-from-order, bill-to/ship-to, a line-item table, and live totals
// (discount, tax, shipping, amount paid, balance due).

let invoiceFormState = null;
let invoiceFormIsEdit = false;
let invoiceCustomerComboboxCleanup = null;

const INVOICE_LANGUAGES = ['English (US)', 'Spanish', 'French', 'German', 'Dutch'];

function newInvoiceItem() {
  return { description: '', notes: '', qty: 1, rate: 0 };
}

function newCustomField() {
  return { label: '', value: '' };
}

// Orders that already belong to another invoice shouldn't be offered again
// in "Autofill from order" - once an order is linked to an invoice it
// disappears from that list (the current invoice's own order, if editing,
// stays available so re-saving doesn't lose it).
function availableOrdersForAutofill() {
  const currentInvoiceId = invoiceFormState && invoiceFormState.id;
  const invoicedOrderIds = new Set(
    state.invoices
      .filter((i) => i.orderId && i.id !== currentInvoiceId)
      .map((i) => i.orderId)
  );
  return state.orders.filter((o) => !invoicedOrderIds.has(o.id));
}

// ---------- Calculation ----------

function computeInvoiceTotals() {
  const s = invoiceFormState;
  const subtotal = s.items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
  const discountVal = Number(s.discountValue) || 0;
  const discountAmt = s.discountEnabled ? (s.discountType === 'usd' ? discountVal : subtotal * discountVal / 100) : 0;
  const afterDiscount = Math.max(0, subtotal - discountAmt);
  const taxPct = (s.taxEnabled && !s.taxExempt) ? (Number(s.taxPercent) || 0) : 0;
  const taxAmt = afterDiscount * taxPct / 100;
  const shipping = Number(s.shipping) || 0;
  const total = afterDiscount + taxAmt + shipping;
  const amountPaid = Number(s.amountPaid) || 0;
  const balanceDue = total - amountPaid;
  return { subtotal, discountAmt, taxAmt, shipping, total, amountPaid, balanceDue };
}

function recalcAndPatchInvoiceTotals() {
  const calc = computeInvoiceTotals();
  setText('calc-inv-subtotal', money(calc.subtotal));
  setText('calc-inv-discount', `− ${money(calc.discountAmt)}`);
  setText('calc-inv-tax', money(calc.taxAmt));
  setText('calc-inv-shipping', money(calc.shipping));
  setText('calc-inv-total', money(calc.total));
  setText('calc-inv-balance', money(calc.balanceDue));

  invoiceFormState.items.forEach((it, i) => {
    const row = document.querySelector(`[data-inv-item-idx="${i}"]`);
    if (row) {
      const amountEl = row.querySelector('[data-inv-item-amount]');
      if (amountEl) amountEl.textContent = money((Number(it.qty) || 0) * (Number(it.rate) || 0));
    }
  });
  return calc;
}

// ---------- Markup: items ----------

function invoiceItemHtml(item, idx) {
  return `
    <div class="qline" data-inv-item-idx="${idx}">
      <div class="qline-desc-row">
        <input type="text" placeholder="Description of item/service..." data-inv-item-field="description" value="${escapeHtml(item.description || '')}"/>
        <button type="button" class="qline-remove" data-inv-remove-item="${idx}" title="Remove item">${icon('trash', 14)}</button>
      </div>
      ${item.notes != null && item.showNotes ? `
        <textarea rows="2" placeholder="Additional description (optional)" data-inv-item-field="notes" style="margin-bottom:8px;">${escapeHtml(item.notes || '')}</textarea>
      ` : `<button type="button" class="qline-add-inventory-btn" data-inv-toggle-notes="${idx}">${icon('plus', 12)} description (optional)</button>`}
      <div class="qline-row" style="justify-content:flex-end;">
        <div style="width:80px;">
          <label class="mini">Quantity</label>
          <input type="number" data-inv-item-field="qty" value="${item.qty ?? 1}" min="0" step="1"/>
        </div>
        <div style="width:90px;">
          <label class="mini">Rate</label>
          <input type="number" data-inv-item-field="rate" value="${item.rate ?? 0}" min="0" step="0.01"/>
        </div>
        <div style="width:90px;">
          <label class="mini">Amount</label>
          <div style="padding:7px 0; font-weight:600; font-size:13px;" data-inv-item-amount>${money((Number(item.qty) || 0) * (Number(item.rate) || 0))}</div>
        </div>
      </div>
    </div>
  `;
}

function rerenderInvItems() {
  const el = document.getElementById('inv-items');
  if (!el) return;
  el.innerHTML = invoiceFormState.items.map((it, i) => invoiceItemHtml(it, i)).join('');
  recalcAndPatchInvoiceTotals();
}

// ---------- Markup: custom fields ----------

function invoiceCustomFieldHtml(f, idx) {
  return `
    <div class="field-row" data-inv-customfield-idx="${idx}" style="align-items:flex-end;">
      <div class="field" style="flex:0 0 130px;">
        <label class="mini">Field name</label>
        <input type="text" data-inv-cf-field="label" value="${escapeHtml(f.label || '')}" placeholder="e.g. Project"/>
      </div>
      <div class="field">
        <label class="mini">Value</label>
        <input type="text" data-inv-cf-field="value" value="${escapeHtml(f.value || '')}"/>
      </div>
      <button type="button" class="qline-remove" data-inv-remove-field="${idx}" title="Remove field" style="margin-bottom:12px;">${icon('x', 14)}</button>
    </div>
  `;
}

function rerenderInvCustomFields() {
  const el = document.getElementById('inv-custom-fields');
  if (!el) return;
  el.innerHTML = invoiceFormState.customFields.map((f, i) => invoiceCustomFieldHtml(f, i)).join('');
}

// ---------- Markup: bill to / ship to ----------

function billToPreviewHtml() {
  const s = invoiceFormState;
  const c = state.customers.find((x) => x.id === s.customerId);
  if (!c) return `<div class="muted" style="font-size:12.5px;">Select a customer to fill this in.</div>`;
  const lines = [c.company, c.address1, c.address2, [c.city, c.state, c.postalCode].filter(Boolean).join(', '), c.country].filter(Boolean);
  return `
    <div style="font-size:12.5px; line-height:1.5;">
      <div style="font-weight:600;">${escapeHtml(c.name)}</div>
      ${lines.map((l) => `<div class="muted">${escapeHtml(l)}</div>`).join('')}
      ${c.email ? `<div class="muted">${escapeHtml(c.email)}</div>` : ''}
      ${c.phone ? `<div class="muted">${escapeHtml(c.phone)}</div>` : ''}
    </div>
  `;
}

function rerenderBillToPreview() {
  const el = document.getElementById('inv-billto-preview');
  if (el) el.innerHTML = billToPreviewHtml();
}

function shipToFieldsHtml() {
  const s = invoiceFormState.shipTo || {};
  return `
    <input type="text" id="inv-ship-address1" placeholder="Address line 1" value="${escapeHtml(s.address1 || '')}" style="margin-bottom:6px;"/>
    <input type="text" id="inv-ship-address2" placeholder="Address line 2" value="${escapeHtml(s.address2 || '')}" style="margin-bottom:6px;"/>
    <input type="text" id="inv-ship-city" placeholder="City, region postcode" value="${escapeHtml(s.cityLine || '')}" style="margin-bottom:6px;"/>
    <input type="text" id="inv-ship-country" placeholder="Country" value="${escapeHtml(s.country || '')}"/>
  `;
}

function rerenderShipTo() {
  const el = document.getElementById('inv-shipto-fields');
  if (!el) return;
  el.innerHTML = shipToFieldsHtml();
  wireShipToInputs();
}

function wireShipToInputs() {
  const byId = (id) => document.getElementById(id);
  const s = invoiceFormState;
  const bind = (id, key) => { const el = byId(id); if (el) el.oninput = (e) => { s.shipTo[key] = e.target.value; }; };
  bind('inv-ship-address1', 'address1');
  bind('inv-ship-address2', 'address2');
  bind('inv-ship-city', 'cityLine');
  bind('inv-ship-country', 'country');
}

// ---------- Left column ----------

function invoiceLeftHtml() {
  const s = invoiceFormState;
  const selectedCustomerName = state.customers.find((c) => c.id === s.customerId)?.name || 'No customer';
  const availableOrders = availableOrdersForAutofill();

  return `
    <div class="field-row">
      <div class="field">
        <label>Status</label>
        <select id="inv-status">
          ${['draft', 'outstanding', 'overdue', 'paid'].map((st) => `<option value="${st}" ${st === s.status ? 'selected' : ''}>${st[0].toUpperCase() + st.slice(1)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Fulfillment</label>
        <div class="discount-type-toggle">
          <button type="button" id="inv-fulfillment-pickup" class="${s.fulfillment === 'pickup' ? 'active' : ''}">Collection</button>
          <button type="button" id="inv-fulfillment-ship" class="${s.fulfillment === 'ship' ? 'active' : ''}">Shipping</button>
        </div>
      </div>
      <div class="field">
        <label>Language</label>
        <select id="inv-language" style="width:auto; min-width:140px; max-width:180px;">
          ${INVOICE_LANGUAGES.map((l) => `<option value="${escapeHtml(l)}" ${l === (s.language || 'English (US)') ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field">
      <label>Autofill from order</label>
      <select id="inv-autofill-order">
        <option value="">Blank invoice (no order)</option>
        ${availableOrders.map((o) => `<option value="${o.id}" ${o.id === s.orderId ? 'selected' : ''}>${escapeHtml(o.orderNumber || o.id.slice(0, 8))} — ${escapeHtml(customerName(o.customerId))}</option>`).join('')}
      </select>
    </div>

    <div class="field-row" style="margin-top:8px;">
      <div class="field">
        <label>Bill to</label>
        <div class="combobox" id="inv-customer-combobox">
          <input type="text" class="combobox-input" id="inv-customer-search" autocomplete="off" placeholder="Search or add a customer..." value="${escapeHtml(selectedCustomerName)}"/>
          <div class="combobox-panel" id="inv-customer-panel" style="display:none;"></div>
        </div>
        <div id="inv-billto-preview" style="margin-top:8px;">${billToPreviewHtml()}</div>
      </div>
      <div class="field">
        <label style="display:flex; justify-content:space-between; align-items:center;">
          <span>Ship to</span>
          <button type="button" class="btn ghost small" id="inv-ship-use-customer" style="padding:2px 6px; font-size:11px;">Use customer address</button>
        </label>
        <div id="inv-shipto-fields">${shipToFieldsHtml()}</div>
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label>Date</label>
        <div class="date-input-wrap">
          <input type="date" id="inv-issuedAt" value="${s.issuedAt || ''}"/>
          <button type="button" class="date-picker-btn" data-date-btn="inv-issuedAt" title="Pick a date">${icon('calendar', 15)}</button>
        </div>
      </div>
      <div class="field">
        <label>Due date</label>
        <div class="date-input-wrap">
          <input type="date" id="inv-dueAt" value="${s.dueAt || ''}"/>
          <button type="button" class="date-picker-btn" data-date-btn="inv-dueAt" title="Pick a date">${icon('calendar', 15)}</button>
        </div>
      </div>
      <div class="field">
        <label>PO Number</label>
        <input type="text" id="inv-poNumber" value="${escapeHtml(s.poNumber || '')}"/>
      </div>
    </div>

    <div id="inv-custom-fields">${s.customFields.map((f, i) => invoiceCustomFieldHtml(f, i)).join('')}</div>
    <button type="button" class="btn outline small" id="inv-add-field">${icon('plus', 13)} Add field</button>

    <div style="font-weight:600; font-size:13px; margin: 18px 0 10px 0;">Items</div>
    <div id="inv-items">${s.items.map((it, i) => invoiceItemHtml(it, i)).join('')}</div>
    <button type="button" class="btn outline small" id="inv-add-item">${icon('plus', 13)} Add item</button>

    <div class="field" style="margin-top:18px;">
      <label>Notes</label>
      <textarea id="inv-notes" rows="3" placeholder="Notes: any relevant information not already covered">${escapeHtml(s.notes || '')}</textarea>
    </div>
    <div class="field">
      <label>Terms</label>
      <textarea id="inv-terms" rows="3" placeholder="Terms and conditions: late fees, payment methods, delivery schedule">${escapeHtml(s.terms || '')}</textarea>
    </div>
  `;
}

// ---------- Right column (totals) ----------

function invoiceRightHtml() {
  const s = invoiceFormState;
  const calc = computeInvoiceTotals();
  return `
    <div class="calc-row"><span class="calc-label">Subtotal</span><span id="calc-inv-subtotal">${money(calc.subtotal)}</span></div>

    <div id="inv-discount-section">
      ${s.discountEnabled ? `
        <div style="margin-top:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <label style="font-weight:600; font-size:13px;">Discount</label>
            <button type="button" class="btn ghost small" id="inv-discount-remove" style="padding:2px 6px; font-size:11px;">${icon('x', 12)} Remove</button>
          </div>
          <div style="display:flex; gap:8px; align-items:center; margin-top:6px;">
            <div class="discount-type-toggle">
              <button type="button" id="inv-discount-pct" class="${s.discountType === 'percent' ? 'active' : ''}">%</button>
              <button type="button" id="inv-discount-usd" class="${s.discountType === 'usd' ? 'active' : ''}">USD</button>
            </div>
            <input type="number" id="inv-discountValue" value="${s.discountValue ?? 0}" min="0" style="flex:1; background:var(--background); border:1px solid var(--border); color:var(--foreground); border-radius:6px; padding:6px 8px; font-size:12.5px;"/>
          </div>
        </div>
        <div class="calc-row"><span class="calc-label">Discount</span><span id="calc-inv-discount">− ${money(calc.discountAmt)}</span></div>
      ` : `<button type="button" class="btn ghost small" id="inv-discount-add" style="padding:2px 0; font-size:12px; margin-top:6px;">${icon('plus', 12)} Discount</button>`}
    </div>

    <div id="inv-tax-section">
      ${s.taxEnabled ? `
        <div style="margin-top:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <label style="font-weight:600; font-size:13px;">Tax</label>
            <button type="button" class="btn ghost small" id="inv-tax-remove" style="padding:2px 6px; font-size:11px;">${icon('x', 12)} Remove</button>
          </div>
          <div style="display:flex; align-items:center; gap:4px; margin-top:6px;">
            <input type="number" id="inv-taxPercent" value="${s.taxPercent ?? 0}" min="0" max="100"/><span class="muted" style="font-size:12px;">%</span>
          </div>
          <div class="toggle-row" style="margin-top:8px;">
            <label class="switch"><input type="checkbox" id="inv-taxExempt" ${s.taxExempt ? 'checked' : ''}/><span class="slider-track"></span></label>
            <span class="toggle-label" style="font-size:12.5px; font-weight:500;">Tax exempt</span>
          </div>
        </div>
        <div class="calc-row"><span class="calc-label">Tax</span><span id="calc-inv-tax">${money(calc.taxAmt)}</span></div>
      ` : `<button type="button" class="btn ghost small" id="inv-tax-add" style="padding:2px 0; font-size:12px; margin-top:6px;">${icon('plus', 12)} Tax</button>`}
    </div>

    <div class="calc-input-row" style="margin-top:10px;">
      <label style="font-weight:600; font-size:13px;">Shipping</label>
      <input type="number" id="inv-shipping" value="${s.shipping ?? 0}" min="0" step="0.01" style="width:90px;"/>
    </div>

    <div style="margin-top:auto; padding-top:14px;">
      <div class="calc-divider"></div>
      <div class="calc-row calc-total"><span>Total</span><span id="calc-inv-total">${money(calc.total)}</span></div>
      <div class="calc-input-row" style="margin-top:10px;">
        <label style="font-weight:600; font-size:13px;">Amount Paid</label>
        <input type="number" id="inv-amountPaid" value="${s.amountPaid ?? 0}" min="0" step="0.01" style="width:90px;"/>
      </div>
      <div class="calc-row calc-total"><span>Balance Due</span><span id="calc-inv-balance">${money(calc.balanceDue)}</span></div>

      ${invoiceFormIsEdit ? `
        <button type="button" class="btn outline small" id="inv-download-pdf" style="width:100%; justify-content:center; gap:6px; margin-top:12px;">${icon('download', 13)} Download PDF</button>
        <button type="button" class="btn outline small" id="inv-gen-order" style="width:100%; justify-content:center; gap:6px; margin-top:8px;">${icon('orders', 13)} Convert to Order</button>
      ` : ''}
      <button type="button" class="btn" id="inv-submit" style="width:100%; margin-top:12px; justify-content:center;">${invoiceFormIsEdit ? 'Save changes' : 'Create invoice'}</button>
      <button type="button" class="btn ghost" id="inv-cancel" style="width:100%; margin-top:4px; justify-content:center;">Cancel</button>
      ${invoiceFormIsEdit ? `<button type="button" class="btn ghost" id="inv-delete" style="width:100%; margin-top:4px; justify-content:center; color:var(--status-red-fg);">Delete invoice</button>` : ''}
    </div>
  `;
}

// ---------- PDF ----------

function downloadInvoicePdf(s, calc) {
  const settings = state.settings;
  const customer = state.customers.find((c) => c.id === s.customerId);
  const win = window.open('', '_blank');
  if (!win) { showToast('Please allow pop-ups to download the PDF', true); return; }

  const itemRows = s.items.map((it) => {
    const amount = (Number(it.qty) || 0) * (Number(it.rate) || 0);
    return `<tr><td>${escapeHtml(it.description || 'Item')}${it.notes ? `<div class="muted" style="font-size:11px;">${escapeHtml(it.notes)}</div>` : ''}</td><td style="text-align:center;">${it.qty ?? 1}</td><td style="text-align:right;">${money(it.rate)}</td><td style="text-align:right;">${money(amount)}</td></tr>`;
  }).join('');

  const customFieldsHtml = (s.customFields || []).filter((f) => f.label || f.value).map((f) => `<div><span>${escapeHtml(f.label)}</span><span>${escapeHtml(f.value)}</span></div>`).join('');

  win.document.write(`
    <!doctype html><html><head><meta charset="utf-8"><title>Invoice ${escapeHtml(s.invoiceNumber || '')}</title>
    <style>
      body { font-family: -apple-system, "Segoe UI", sans-serif; color:#111; padding: 40px; max-width: 720px; margin: 0 auto; }
      h1 { font-size: 20px; margin: 0 0 2px 0; }
      .muted { color: #666; font-size: 12.5px; }
      .row { display:flex; justify-content:space-between; margin: 18px 0; }
      table { width:100%; border-collapse: collapse; margin-top: 18px; }
      th, td { padding: 8px 6px; border-bottom: 1px solid #ddd; font-size: 13px; text-align: left; vertical-align: top; }
      th { color: #666; font-size: 11px; text-transform: uppercase; }
      .totals { margin-top: 14px; width: 260px; margin-left: auto; }
      .totals div { display:flex; justify-content:space-between; padding: 3px 0; font-size: 13px; }
      .totals .grand { font-weight:700; font-size: 16px; border-top: 1px solid #333; margin-top: 6px; padding-top: 8px; }
      .fields { margin-top:10px; }
      .fields div { display:flex; justify-content:space-between; font-size:12.5px; color:#555; max-width:260px; }
      @media print { body { padding: 0; } }
    </style>
    </head><body>
      <div class="row">
        <div>
          <h1>${escapeHtml(settings.workspaceName || 'Invoice')}</h1>
          <div class="muted">${escapeHtml(settings.contactEmail || '')}${settings.contactPhone ? ' · ' + escapeHtml(settings.contactPhone) : ''}</div>
        </div>
        <div style="text-align:right;">
          <div><strong>Invoice ${escapeHtml(s.invoiceNumber || '')}</strong></div>
          <div class="muted">Issued ${s.issuedAt ? fmtDateSlash(s.issuedAt) : '—'}</div>
          <div class="muted">Due ${s.dueAt ? fmtDateSlash(s.dueAt) : '—'}</div>
          ${s.poNumber ? `<div class="muted">PO ${escapeHtml(s.poNumber)}</div>` : ''}
        </div>
      </div>
      <div class="row" style="margin-top:0;">
        <div>
          <div class="muted">Bill to</div>
          <div><strong>${escapeHtml(customer?.name || 'No customer')}</strong></div>
          ${customer?.company ? `<div class="muted">${escapeHtml(customer.company)}</div>` : ''}
          ${customer?.address1 ? `<div class="muted">${escapeHtml(customer.address1)}</div>` : ''}
          ${[customer?.city, customer?.state, customer?.postalCode].filter(Boolean).length ? `<div class="muted">${escapeHtml([customer?.city, customer?.state, customer?.postalCode].filter(Boolean).join(', '))}</div>` : ''}
        </div>
        <div style="text-align:right;">
          <div class="muted">Ship to</div>
          ${s.shipTo?.address1 ? `<div class="muted">${escapeHtml(s.shipTo.address1)}</div>` : ''}
          ${s.shipTo?.cityLine ? `<div class="muted">${escapeHtml(s.shipTo.cityLine)}</div>` : ''}
        </div>
      </div>
      ${customFieldsHtml ? `<div class="fields">${customFieldsHtml}</div>` : ''}

      <table>
        <thead><tr><th>Item</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Amount</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div class="totals">
        <div><span>Subtotal</span><span>${money(calc.subtotal)}</span></div>
        <div><span>Discount</span><span>&minus;${money(calc.discountAmt)}</span></div>
        <div><span>Tax</span><span>${money(calc.taxAmt)}</span></div>
        <div><span>Shipping</span><span>${money(calc.shipping)}</span></div>
        <div class="grand"><span>Total</span><span>${money(calc.total)}</span></div>
        <div><span>Amount paid</span><span>${money(calc.amountPaid)}</span></div>
        <div class="grand"><span>Balance due</span><span>${money(calc.balanceDue)}</span></div>
      </div>

      ${s.notes ? `<div class="muted" style="margin-top:24px; white-space:pre-wrap;">${escapeHtml(s.notes)}</div>` : ''}
      ${s.terms ? `<div class="muted" style="margin-top:12px; white-space:pre-wrap;">${escapeHtml(s.terms)}</div>` : ''}
    </body></html>
  `);
  win.document.close();
  win.focus();
  // See the matching comment in page-quotes.js's downloadQuotePdf - two
  // nested rAFs waits for the popup to actually finish laying out instead
  // of guessing with a fixed delay.
  win.requestAnimationFrame(() => win.requestAnimationFrame(() => win.print()));
}

// ---------- Wiring ----------

function renderInvoiceModal() {
  renderModalShell({
    title: invoiceFormIsEdit ? 'Edit invoice' : 'New invoice',
    subtitle: 'The invoice number is assigned automatically on save.',
    wide: true,
    twoCol: true,
    bodyHtml: `<div class="modal-col-left">${invoiceLeftHtml()}</div><div class="modal-col-right">${invoiceRightHtml()}</div>`,
    footerHtml: '',
  });
  wireInvoiceModalEvents();
  recalcAndPatchInvoiceTotals();
}

// Uses the same dedicated Customer modal as the main Customers page (see
// page-customers.js) - it already collects the full address, this just
// stacks it on top of the Invoice drawer instead of navigating away, and
// hands the saved customer back to onSaved() instead of doing a full page
// re-render (which would replay the drawer's own slide-in animation for no
// reason - the drawer underneath is untouched by this sub-modal).
function openInvoiceCustomerSubModal(prefillName) {
  openCustomerModal(null, {
    prefillName,
    rootId: 'modal-root-2',
    stacked: true,
    onSaved: (created) => {
      state.customers.push(created);
      invoiceFormState.customerId = created.id;
      const input = document.getElementById('inv-customer-search');
      if (input) input.value = created.name;
      rerenderBillToPreview();
    },
  });
}

function wireInvoiceCustomerCombobox() {
  const s = invoiceFormState;
  const wrap = document.getElementById('inv-customer-combobox');
  const input = document.getElementById('inv-customer-search');
  const panel = document.getElementById('inv-customer-panel');
  if (!wrap || !input || !panel) return;

  function selectedName() {
    return state.customers.find((c) => c.id === s.customerId)?.name || 'No customer';
  }

  function renderOptions(query) {
    const q = (query || '').trim().toLowerCase();
    const matches = q ? state.customers.filter((c) => c.name.toLowerCase().includes(q)) : state.customers;
    panel.innerHTML = `
      <div class="combobox-option combobox-option-none ${!s.customerId ? 'active' : ''}" data-customer-id="">${icon('x', 12)} No customer</div>
      ${matches.length
        ? matches.map((c) => `<div class="combobox-option" data-customer-id="${c.id}">${escapeHtml(c.name)}</div>`).join('')
        : (q ? `<div class="combobox-option muted">No matching customers</div>` : '')}
      <div class="combobox-add">
        <div class="combobox-add-btn" id="inv-customer-add-btn">${icon('plus', 13)} Add new customer</div>
      </div>
    `;
    panel.querySelectorAll('[data-customer-id]').forEach((el) => {
      el.onclick = () => {
        s.customerId = el.dataset.customerId || '';
        input.value = selectedName();
        panel.style.display = 'none';
        rerenderBillToPreview();
      };
    });
    const addBtn = document.getElementById('inv-customer-add-btn');
    if (addBtn) addBtn.onclick = () => { panel.style.display = 'none'; openInvoiceCustomerSubModal(query); };
  }

  input.addEventListener('focus', () => { input.select(); panel.style.display = 'block'; renderOptions(''); });
  input.addEventListener('input', () => renderOptions(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { panel.style.display = 'none'; input.value = selectedName(); input.blur(); }
  });

  if (invoiceCustomerComboboxCleanup) document.removeEventListener('mousedown', invoiceCustomerComboboxCleanup);
  invoiceCustomerComboboxCleanup = (e) => {
    if (!wrap.contains(e.target)) { panel.style.display = 'none'; input.value = selectedName(); }
  };
  document.addEventListener('mousedown', invoiceCustomerComboboxCleanup);
}

function wireInvoiceModalEvents() {
  const s = invoiceFormState;
  const byId = (id) => document.getElementById(id);

  wireInvoiceCustomerCombobox();
  wireShipToInputs();

  byId('inv-status').onchange = (e) => { s.status = e.target.value; };
  byId('inv-fulfillment-pickup').onclick = () => { s.fulfillment = 'pickup'; byId('inv-fulfillment-pickup').classList.add('active'); byId('inv-fulfillment-ship').classList.remove('active'); };
  byId('inv-fulfillment-ship').onclick = () => { s.fulfillment = 'ship'; byId('inv-fulfillment-ship').classList.add('active'); byId('inv-fulfillment-pickup').classList.remove('active'); };
  byId('inv-language').onchange = (e) => { s.language = e.target.value; };
  byId('inv-poNumber').oninput = (e) => { s.poNumber = e.target.value; };
  byId('inv-notes').oninput = (e) => { s.notes = e.target.value; };
  byId('inv-terms').oninput = (e) => { s.terms = e.target.value; };
  byId('inv-issuedAt').onchange = (e) => { s.issuedAt = e.target.value; };
  byId('inv-dueAt').onchange = (e) => { s.dueAt = e.target.value; };

  byId('inv-autofill-order').onchange = (e) => {
    const orderId = e.target.value;
    s.orderId = orderId || null;
    if (orderId) {
      const order = state.orders.find((o) => o.id === orderId);
      if (order) {
        s.customerId = order.customerId || s.customerId;
        s.items = [{ description: order.fileName || `Order ${order.orderNumber || ''}`.trim(), notes: '', qty: 1, rate: Number(order.total) || 0 }];
        if (order.dueDate) s.dueAt = order.dueDate.slice(0, 10);
        const input = byId('inv-customer-search');
        if (input) input.value = customerName(s.customerId);
        rerenderBillToPreview();
        rerenderInvItems();
      }
    }
  };

  document.querySelectorAll('[data-date-btn]').forEach((btn) => {
    btn.onclick = () => {
      const input = byId(btn.dataset.dateBtn);
      if (!input) return;
      if (input.showPicker) { try { input.showPicker(); } catch { input.focus(); } } else { input.focus(); }
    };
  });

  byId('inv-ship-use-customer').onclick = () => {
    const c = state.customers.find((x) => x.id === s.customerId);
    if (!c) { showToast('Select a customer first', true); return; }
    s.shipTo = {
      address1: c.address1 || '', address2: c.address2 || '',
      cityLine: [c.city, c.state, c.postalCode].filter(Boolean).join(', '),
      country: c.country || '',
    };
    rerenderShipTo();
  };

  // Custom fields ("+ Add field")
  const customFieldsEl = byId('inv-custom-fields');
  customFieldsEl.addEventListener('input', (e) => {
    const row = e.target.closest('[data-inv-customfield-idx]');
    if (!row) return;
    const idx = Number(row.dataset.invCustomfieldIdx);
    const field = e.target.dataset.invCfField;
    if (!field) return;
    s.customFields[idx][field] = e.target.value;
  });
  customFieldsEl.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-inv-remove-field]');
    if (!removeBtn) return;
    const idx = Number(removeBtn.dataset.invRemoveField);
    s.customFields.splice(idx, 1);
    rerenderInvCustomFields();
  });
  byId('inv-add-field').onclick = () => { s.customFields.push(newCustomField()); rerenderInvCustomFields(); };

  // Items table
  const itemsEl = byId('inv-items');
  itemsEl.addEventListener('input', (e) => {
    const row = e.target.closest('[data-inv-item-idx]');
    if (!row) return;
    const idx = Number(row.dataset.invItemIdx);
    const field = e.target.dataset.invItemField;
    if (!field) return;
    s.items[idx][field] = e.target.value;
    recalcAndPatchInvoiceTotals();
  });
  itemsEl.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-inv-remove-item]');
    if (removeBtn) {
      const idx = Number(removeBtn.dataset.invRemoveItem);
      if (s.items.length <= 1) { s.items[idx] = newInvoiceItem(); rerenderInvItems(); return; }
      s.items.splice(idx, 1);
      rerenderInvItems();
      return;
    }
    const toggleNotesBtn = e.target.closest('[data-inv-toggle-notes]');
    if (toggleNotesBtn) {
      const idx = Number(toggleNotesBtn.dataset.invToggleNotes);
      s.items[idx].showNotes = true;
      rerenderInvItems();
    }
  });
  byId('inv-add-item').onclick = () => { s.items.push(newInvoiceItem()); rerenderInvItems(); };

  // Right column (totals: discount/tax/shipping/amount paid/submit/cancel/
  // delete/PDF) is wired by a single shared function so rerenderInvoiceRight()
  // never needs a second copy of these handlers.
  wireInvoiceRightEvents();
}

// Builds the API payload from current form state - the single source of
// truth for both the initial save and any re-saves after the right column
// has been rebuilt (discount/tax added, removed, or switched).
function buildInvoicePayload(s, calc) {
  return {
    invoiceNumber: s.invoiceNumber || nextNumber('invoiceNumberPrefix', state.invoices, 'invoiceNumber'),
    status: s.status,
    fulfillment: s.fulfillment,
    language: s.language,
    orderId: s.orderId || null,
    customerId: s.customerId || null,
    shipTo: s.shipTo,
    issuedAt: s.issuedAt || null,
    dueAt: s.dueAt || null,
    dueDate: s.dueAt || null,
    poNumber: s.poNumber || '',
    customFields: s.customFields.filter((f) => f.label || f.value),
    items: s.items,
    notes: s.notes,
    terms: s.terms,
    discountEnabled: s.discountEnabled, discountType: s.discountType, discountValue: s.discountValue,
    taxEnabled: s.taxEnabled, taxPercent: s.taxPercent, taxExempt: s.taxExempt,
    shipping: s.shipping,
    amountPaid: s.amountPaid,
    subtotal: calc.subtotal, discount: calc.discountAmt, tax: calc.taxAmt,
    total: calc.total, balanceDue: calc.balanceDue,
  };
}

async function submitInvoice() {
  const s = invoiceFormState;
  const calc = recalcAndPatchInvoiceTotals();
  const payload = buildInvoicePayload(s, calc);
  try {
    if (invoiceFormIsEdit && s.id) {
      await api('PUT', `/api/invoices/${s.id}`, payload);
      showToast('Invoice updated');
    } else {
      await api('POST', '/api/invoices', payload);
      showToast('Invoice created');
    }
    closeModal();
    await refreshAndRerender();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function deleteInvoice() {
  const s = invoiceFormState;
  if (!confirm('Delete this invoice? This cannot be undone.')) return;
  try {
    await api('DELETE', `/api/invoices/${s.id}`);
    showToast('Invoice deleted');
    closeModal();
    await refreshAndRerender();
  } catch (err) {
    showToast(err.message, true);
  }
}

// Re-renders just the right (totals) column - used when discount/tax
// sections are added/removed/switched, which changes the DOM structure
// enough that in-place patching isn't practical, but this is still far
// smaller in scope than a full renderInvoiceModal() (never replaces the
// .modal itself, so no slide-in replay).
function rerenderInvoiceRight() {
  const rightCol = document.querySelector('.modal-col-right');
  if (!rightCol) return;
  rightCol.innerHTML = invoiceRightHtml();
  wireInvoiceRightEvents();
  recalcAndPatchInvoiceTotals();
}

// The right column's event wiring is split out into its own function - both
// the initial wireInvoiceModalEvents() call and every rerenderInvoiceRight()
// (which replaces the whole column's markup) call this same single copy,
// instead of keeping two copies of the same handlers in sync.
function wireInvoiceRightEvents() {
  const s = invoiceFormState;
  const byId = (id) => document.getElementById(id);

  const discountSection = byId('inv-discount-section');
  discountSection.addEventListener('click', (e) => {
    if (e.target.closest('#inv-discount-add')) { s.discountEnabled = true; s.discountType = s.discountType || 'percent'; rerenderInvoiceRight(); return; }
    if (e.target.closest('#inv-discount-remove')) { s.discountEnabled = false; s.discountValue = 0; rerenderInvoiceRight(); return; }
    if (e.target.closest('#inv-discount-pct')) { s.discountType = 'percent'; rerenderInvoiceRight(); return; }
    if (e.target.closest('#inv-discount-usd')) { s.discountType = 'usd'; rerenderInvoiceRight(); return; }
  });
  discountSection.addEventListener('input', (e) => {
    if (e.target.id === 'inv-discountValue') { s.discountValue = Number(e.target.value); recalcAndPatchInvoiceTotals(); }
  });

  const taxSection = byId('inv-tax-section');
  taxSection.addEventListener('click', (e) => {
    if (e.target.closest('#inv-tax-add')) { s.taxEnabled = true; s.taxPercent = s.taxPercent || (state.settings.defaultTaxBasisPoints || 0) / 100; rerenderInvoiceRight(); return; }
    if (e.target.closest('#inv-tax-remove')) { s.taxEnabled = false; rerenderInvoiceRight(); return; }
  });
  taxSection.addEventListener('input', (e) => {
    if (e.target.id === 'inv-taxPercent') { s.taxPercent = Number(e.target.value); recalcAndPatchInvoiceTotals(); }
  });
  taxSection.addEventListener('change', (e) => {
    if (e.target.id === 'inv-taxExempt') { s.taxExempt = e.target.checked; recalcAndPatchInvoiceTotals(); }
  });

  byId('inv-shipping').oninput = (e) => { s.shipping = Number(e.target.value); recalcAndPatchInvoiceTotals(); };
  byId('inv-amountPaid').oninput = (e) => { s.amountPaid = Number(e.target.value); recalcAndPatchInvoiceTotals(); };

  if (invoiceFormIsEdit) {
    const dl = byId('inv-download-pdf');
    if (dl) dl.onclick = () => { const calc = recalcAndPatchInvoiceTotals(); downloadInvoicePdf(s, calc); };
    const del = byId('inv-delete');
    if (del) del.onclick = deleteInvoice;
    const genOrder = byId('inv-gen-order');
    if (genOrder) genOrder.onclick = async () => {
      const calc = recalcAndPatchInvoiceTotals();
      try {
        const created = await api('POST', '/api/orders', {
          orderNumber: nextNumber('orderNumberPrefix', state.orders, 'orderNumber'),
          customerId: s.customerId || null,
          invoiceId: s.id,
          status: 'pending',
          priority: 'normal',
          fulfillment: s.fulfillment || 'pickup',
          dueDate: s.dueAt || '',
          total: calc.total,
          notes: [s.notes, `From Invoice ${s.invoiceNumber || ''}`.trim()].filter(Boolean).join('\n\n'),
        });
        state.orders.push(created);
        showToast('Order created from this invoice');
        closeModal();
        await refreshAndRerender();
        await navigate('orders');
      } catch (err) {
        showToast(err.message, true);
      }
    };
  }
  byId('inv-cancel').onclick = () => closeModal();
  byId('inv-submit').onclick = submitInvoice;
}

function openInvoiceModal(existing) {
  invoiceFormIsEdit = !!existing;
  invoiceFormState = existing ? {
    id: existing.id,
    invoiceNumber: existing.invoiceNumber || null,
    status: existing.status || 'draft',
    fulfillment: existing.fulfillment || 'pickup',
    language: existing.language && existing.language !== 'Workspace default' ? existing.language : 'English (US)',
    orderId: existing.orderId || null,
    customerId: existing.customerId || '',
    shipTo: existing.shipTo || { address1: '', address2: '', cityLine: '', country: '' },
    issuedAt: existing.issuedAt ? existing.issuedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
    dueAt: existing.dueAt ? existing.dueAt.slice(0, 10) : (existing.dueDate ? existing.dueDate.slice(0, 10) : ''),
    poNumber: existing.poNumber || '',
    customFields: existing.customFields && existing.customFields.length ? existing.customFields.map((f) => ({ ...f })) : [],
    items: existing.items && existing.items.length ? existing.items.map((it) => ({ ...it })) : [newInvoiceItem()],
    notes: existing.notes || '',
    terms: existing.terms || '',
    discountEnabled: !!existing.discountEnabled, discountType: existing.discountType || 'percent', discountValue: existing.discountValue ?? 0,
    taxEnabled: !!existing.taxEnabled, taxPercent: existing.taxPercent ?? 0, taxExempt: !!existing.taxExempt,
    shipping: existing.shipping ?? 0,
    amountPaid: existing.amountPaid ?? 0,
  } : {
    invoiceNumber: null,
    status: 'draft', fulfillment: 'pickup', language: 'English (US)',
    orderId: null, customerId: '',
    shipTo: { address1: '', address2: '', cityLine: '', country: '' },
    issuedAt: new Date().toISOString().slice(0, 10), dueAt: '',
    poNumber: '', customFields: [],
    items: [newInvoiceItem()],
    notes: '', terms: '',
    discountEnabled: false, discountType: 'percent', discountValue: 0,
    taxEnabled: (state.settings.defaultTaxBasisPoints || 0) > 0, taxPercent: (state.settings.defaultTaxBasisPoints || 0) / 100, taxExempt: false,
    shipping: 0, amountPaid: 0,
  };
  renderInvoiceModal();
}

// ---------- List page ----------

async function renderInvoices() {
  const main = document.getElementById('main');
  const items = state.invoices;

  const outstanding = items.filter((i) => i.status === 'outstanding').reduce((s, i) => s + (Number(i.total) || 0), 0);
  const overdue = items.filter((i) => i.status === 'overdue').reduce((s, i) => s + (Number(i.total) || 0), 0);
  const now = new Date();
  const paidThisMonth = items.filter((i) => i.status === 'paid' && i.paidAt && new Date(i.paidAt).getMonth() === now.getMonth() && new Date(i.paidAt).getFullYear() === now.getFullYear()).reduce((s, i) => s + (Number(i.total) || 0), 0);

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Invoices</h1>
        <p class="page-subtitle">Bill customers from orders or manually, and track who still owes you.</p>
      </div>
      <div class="page-actions">
        <button class="btn brand" id="add-invoice">+ New invoice</button>
      </div>
    </div>
    <div class="grid grid-3" style="margin-bottom:20px;">
      <div class="card stat-card"><div class="stat-label">Outstanding</div><div class="stat-sub">Across all issued, unpaid invoices</div><div class="stat-value">${money(outstanding)}</div></div>
      <div class="card stat-card"><div class="stat-label">Overdue</div><div class="stat-sub">Outstanding past their due date</div><div class="stat-value">${money(overdue)}</div></div>
      <div class="card stat-card"><div class="stat-label">Paid this month</div><div class="stat-sub">Invoices paid in the current calendar month</div><div class="stat-value">${money(paidThisMonth)}</div></div>
    </div>
    <div class="card" id="invoices-table"></div>
  `;

  const tableEl = document.getElementById('invoices-table');
  if (!items.length) {
    tableEl.innerHTML = `<div class="empty-state">No invoices yet. Create one from an order, or add a manual invoice here.</div>`;
  } else {
    const rows = items.map((i) => `
      <tr class="clickable-row" data-open-invoice="${i.id}">
        <td>${escapeHtml(i.invoiceNumber || '—')}</td>
        <td>${escapeHtml(customerName(i.customerId))}</td>
        <td>${escapeHtml(state.orders.find((o) => o.id === i.orderId)?.orderNumber || '—')}</td>
        <td>${fmtDate(i.issuedAt)}</td>
        <td>${fmtDate(i.dueAt || i.dueDate)}</td>
        <td>${badge(i.status, i.status)}</td>
        <td>${money(i.total)}</td>
      </tr>
    `).join('');
    tableEl.innerHTML = `
      <table>
        <thead><tr><th>Invoice</th><th>Customer</th><th>Order</th><th>Issued</th><th>Due</th><th>Status</th><th>Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    tableEl.querySelectorAll('[data-open-invoice]').forEach((row) => {
      row.onclick = () => {
        const inv = state.invoices.find((x) => x.id === row.dataset.openInvoice);
        if (inv) openInvoiceModal(inv);
      };
    });
  }

  document.getElementById('add-invoice').onclick = () => openInvoiceModal();
}

registerPage('invoices', renderInvoices);
