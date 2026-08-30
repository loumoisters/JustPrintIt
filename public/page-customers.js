// public/page-customers.js
// Customers gets its own dedicated modal (not the generic openModal() field
// renderer) so it can group Email/Phone and the address fields into
// two-column rows, show the "Shipping address" section break, and place
// the Customer # auto-assign hint right under that field - none of which
// the generic field-list renderer supports.
//
// openCustomerModal() is shared: the standalone "+ New customer" button on
// this page uses it directly, and so does the "Add new customer" quick-add
// sub-modal on the Invoices drawer (see page-invoices.js) - that one
// already collected the full address, just through the old plain-list
// renderer, so it gets the same visual upgrade via `opts.onSaved`/
// `opts.rootId`/`opts.stacked` rather than a second, drifting copy of this
// form. Quotes' own quick-add sub-modal is intentionally much shorter
// (name/email/phone/notes only, see page-quotes.js's openCustomerSubModal)
// - that's a deliberate "don't interrupt building the quote" tradeoff, not
// an oversight, so it's left as-is rather than switched to this fuller form.

let customerFormState = null;
let customerFormIsEdit = false;

function customerModalBodyHtml() {
  const c = customerFormState;
  return `
    <div class="field">
      <label>Customer #</label>
      <input type="text" id="cu-customerNumber${customerModalSuffix}" value="${escapeHtml(c.customerNumber || '')}" placeholder="Auto-assigned on save"/>
      <div class="field-hint">Auto-assigned on creation. You can override it here.</div>
    </div>
    <div class="field">
      <label>Name</label>
      <input type="text" id="cu-name${customerModalSuffix}" value="${escapeHtml(c.name || '')}" placeholder="Acme Co. or Jane Doe" required/>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Email</label>
        <input type="email" id="cu-email${customerModalSuffix}" value="${escapeHtml(c.email || '')}" placeholder="jane@example.com"/>
      </div>
      <div class="field">
        <label>Phone</label>
        <input type="text" id="cu-phone${customerModalSuffix}" value="${escapeHtml(formatPhoneNumber(c.phone))}" placeholder="(555) 123-4567"/>
      </div>
    </div>
    <div class="field">
      <label>Company</label>
      <input type="text" id="cu-company${customerModalSuffix}" value="${escapeHtml(c.company || '')}"/>
    </div>
    <div style="font-weight:600; font-size:13px; margin:20px 0 10px 0;">Shipping address</div>
    <div class="field">
      <input type="text" id="cu-address1${customerModalSuffix}" value="${escapeHtml(c.address1 || '')}" placeholder="Address line 1"/>
    </div>
    <div class="field">
      <input type="text" id="cu-address2${customerModalSuffix}" value="${escapeHtml(c.address2 || '')}" placeholder="Address line 2"/>
    </div>
    <div class="field-row">
      <div class="field">
        <input type="text" id="cu-city${customerModalSuffix}" value="${escapeHtml(c.city || '')}" placeholder="City"/>
      </div>
      <div class="field">
        <input type="text" id="cu-state${customerModalSuffix}" value="${escapeHtml(c.state || '')}" placeholder="State / Province"/>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <input type="text" id="cu-postalCode${customerModalSuffix}" value="${escapeHtml(c.postalCode || '')}" placeholder="Postal code"/>
      </div>
      <div class="field">
        <input type="text" id="cu-country${customerModalSuffix}" value="${escapeHtml(c.country || '')}" placeholder="Country"/>
      </div>
    </div>
    <div class="field" style="margin-bottom:0;">
      <label>Notes</label>
      <textarea id="cu-notes${customerModalSuffix}" rows="3" placeholder="Preferences, context, anything worth remembering...">${escapeHtml(c.notes || '')}</textarea>
    </div>
  `;
}

function readCustomerFormValues() {
  const byId = (id) => document.getElementById(`cu-${id}${customerModalSuffix}`);
  return {
    customerNumber: byId('customerNumber').value.trim(),
    name: byId('name').value,
    email: byId('email').value,
    phone: formatPhoneNumber(byId('phone').value),
    company: byId('company').value,
    address1: byId('address1').value,
    address2: byId('address2').value,
    city: byId('city').value,
    state: byId('state').value,
    postalCode: byId('postalCode').value,
    country: byId('country').value,
    notes: byId('notes').value,
  };
}

// Tracks the suffix (see core.js's rootSuffix()) for whichever modal root
// the form is currently rendered into, so field ids never collide when
// this modal is stacked on top of another one (Invoices' sub-modal).
let customerModalSuffix = '';

// opts:
//   prefillName - prefills Name (used when "Add new customer" is clicked
//     from a combobox that already has search text typed in)
//   rootId, stacked - passed through to renderModalShell for the stacked
//     sub-modal case
//   onSaved(customer) - called after a successful save instead of the
//     default showToast+refreshAndRerender, for callers (Invoices) that
//     need to update their own in-progress form state instead of
//     re-rendering the whole page
function openCustomerModal(existing, opts = {}) {
  customerFormIsEdit = !!existing;
  customerFormState = existing ? { ...existing } : {
    customerNumber: '', name: opts.prefillName || '', email: '', phone: '', company: '',
    address1: '', address2: '', city: '', state: '', postalCode: '', country: '', notes: '',
  };

  const rootId = opts.rootId || 'modal-root';
  customerModalSuffix = rootSuffix(rootId);

  renderModalShell({
    title: customerFormIsEdit ? 'Edit customer' : 'New customer',
    subtitle: customerFormIsEdit ? undefined : 'Add a customer to assign to orders and quotes.',
    rootId,
    stacked: opts.stacked,
    bodyHtml: customerModalBodyHtml(),
    footerHtml: `
      <button type="button" class="btn outline" id="cu-cancel${customerModalSuffix}">Cancel</button>
      <button type="button" class="btn" id="cu-submit${customerModalSuffix}">${customerFormIsEdit ? 'Save changes' : 'Save customer'}</button>
    `,
  });

  // Live-format as they type, rather than only on save, so what's on
  // screen always matches what'll be stored - no surprise reformatting
  // after the fact.
  const phoneInput = document.getElementById(`cu-phone${customerModalSuffix}`);
  if (phoneInput) phoneInput.oninput = () => { phoneInput.value = formatPhoneNumber(phoneInput.value); };

  document.getElementById(`cu-cancel${customerModalSuffix}`).onclick = () => closeModal(rootId);
  document.getElementById(`cu-submit${customerModalSuffix}`).onclick = async () => {
    const values = readCustomerFormValues();
    if (!values.name.trim()) { showToast('Name is required', true); return; }
    // Left blank -> auto-assign the next number for this prefix; typed a
    // value -> that's an explicit override, use it as-is.
    if (!values.customerNumber) {
      values.customerNumber = nextNumber('customerNumberPrefix', state.customers, 'customerNumber');
    }
    try {
      let saved;
      if (customerFormIsEdit && customerFormState.id) {
        saved = await api('PUT', `/api/customers/${customerFormState.id}`, values);
        showToast('Customer updated');
      } else {
        saved = await api('POST', '/api/customers', values);
        showToast('Customer added');
      }
      closeModal(rootId);
      if (opts.onSaved) {
        opts.onSaved(saved);
      } else {
        await refreshAndRerender();
      }
    } catch (err) {
      showToast(err.message, true);
    }
  };
}

async function renderCustomers() {
  const items = state.customers;
  const main = document.getElementById('main');

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Customers</h1>
        <p class="page-subtitle">Your CRM: contacts, spend, and order history.</p>
      </div>
      <div class="page-actions">
        <button class="btn outline" disabled title="Demo app - CSV import not wired up">Import CSV</button>
        <button class="btn brand" id="add-customer">+ New customer</button>
      </div>
    </div>
    <div class="card" id="customers-table"></div>
  `;

  const tableEl = document.getElementById('customers-table');
  if (!items.length) {
    tableEl.innerHTML = `<div class="empty-state">No customers yet. Add your first customer to see them here.</div>`;
  } else {
    const rows = items.map((c) => `
      <tr>
        <td>${escapeHtml(c.customerNumber || '—')}</td>
        <td>${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.company || '—')}</td>
        <td>${escapeHtml(c.email || '—')}</td>
        <td>${escapeHtml(c.phone || '—')}</td>
        <td>${state.orders.filter((o) => o.customerId === c.id).length}</td>
        <td>${money(state.orders.filter((o) => o.customerId === c.id && o.status !== 'cancelled').reduce((s, o) => s + (Number(o.total) || 0), 0))}</td>
        <td>
          <div class="row-actions">
            <button class="btn outline small" data-edit="${c.id}">${icon('edit', 13)}</button>
            <button class="btn outline small" data-del="${c.id}">${icon('trash', 13)}</button>
          </div>
        </td>
      </tr>
    `).join('');

    tableEl.innerHTML = `
      <table>
        <thead><tr><th>Customer #</th><th>Name</th><th>Company</th><th>Email</th><th>Phone</th><th>Orders</th><th>Lifetime spend</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    items.forEach((c) => {
      const editBtn = tableEl.querySelector(`[data-edit="${c.id}"]`);
      const delBtn = tableEl.querySelector(`[data-del="${c.id}"]`);
      if (editBtn) editBtn.onclick = () => openCustomerModal(c);
      if (delBtn) delBtn.onclick = async () => {
        if (!confirm(`Delete this customer?`)) return;
        await api('DELETE', `/api/customers/${c.id}`);
        showToast('Customer deleted');
        await refreshAndRerender();
      };
    });
  }

  document.getElementById('add-customer').onclick = () => openCustomerModal();
}

registerPage('customers', renderCustomers);
