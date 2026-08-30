// public/page-quotes.js
// Quotes get a dedicated modal (not the generic resource-page modal)
// because the quote builder here is a real pricing calculator: line
// items priced from filament + printer + labor (or a straight inventory
// item), with live-recalculating waste/overhead/margin/discount/tax down
// to a final total.

let quoteFormState = null;
let quoteFormIsEdit = false;

// Cleans up the previous modal instance's "click outside the combobox"
// listener before wiring a new one, so re-rendering the quote modal
// (which happens on every add/remove line, etc.) doesn't stack up
// duplicate document-level listeners.
let comboboxOutsideCleanup = null;

const QUOTE_LANGUAGES = ['English (US)', 'Spanish', 'French', 'German', 'Dutch'];

function newQuoteLine() {
  return { description: '', spoolId: '', grams: '', printerId: '', hours: '', laborMinutes: '', qty: 1, inventoryItems: [] };
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ---------- Calculation ----------

function computeQuoteLineNumbers(line) {
  const settings = state.settings;
  const qty = Number(line.qty) || 1;

  const spool = state.spools.find((s) => s.id === line.spoolId);
  const grams = Number(line.grams) || 0;
  const matPerGram = spool && spool.totalWeightGrams ? (Number(spool.spoolPrice) || 0) / spool.totalWeightGrams : 0;
  const lineMaterial = matPerGram * grams;

  const printer = state.printers.find((p) => p.id === line.printerId);
  const hours = Number(line.hours) || 0;
  const lineElectricity = printer && printer.powerDrawWatts
    ? (printer.powerDrawWatts / 1000) * hours * (Number(settings.electricityRatePerKwh) || 0)
    : 0;

  const laborMin = Number(line.laborMinutes) || 0;
  const lineLabor = quoteFormState.laborEnabled ? (laborMin / 60) * (Number(settings.hourlyRate) || 0) : 0;

  // Each attached inventory item has its own quantity, independent of the
  // print line's qty, so their combined cost is a flat amount - not
  // multiplied again by the line's qty in recalcAndPatchQuote().
  const lineInventory = (line.inventoryItems || []).reduce((sum, inv) => {
    const item = state.inventoryItems.find((i) => i.id === inv.inventoryItemId);
    const invQty = Number(inv.qty) || 1;
    return sum + (item ? (Number(item.unitPrice) || 0) * invQty : 0);
  }, 0);

  return { lineMaterial, lineElectricity, lineLabor, lineInventory, qty };
}

function recalcAndPatchQuote() {
  let totalMaterial = 0, totalElectricity = 0, totalLabor = 0, totalInventory = 0;

  quoteFormState.lines.forEach((line, i) => {
    const { lineMaterial, lineElectricity, lineLabor, lineInventory, qty } = computeQuoteLineNumbers(line);
    totalMaterial += lineMaterial * qty;
    totalElectricity += lineElectricity * qty;
    totalLabor += lineLabor * qty;
    totalInventory += lineInventory; // already a flat total, not per print-qty

    const row = document.querySelector(`[data-line-idx="${i}"]`);
    if (row) {
      const perUnitEl = row.querySelector('[data-line-perunit]');
      const totalEl = row.querySelector('[data-line-total]');
      if (perUnitEl) {
        const parts = [`${money(lineMaterial)} mat`, `${money(lineElectricity)} pwr`];
        perUnitEl.textContent = parts.join(' + ') + ((line.inventoryItems || []).length ? ` /unit + ${money(lineInventory)} inv` : ' /unit');
      }
      if (totalEl) totalEl.textContent = money((lineMaterial + lineElectricity + lineLabor) * qty + lineInventory);
    }
  });

  const wastePct = Number(quoteFormState.wastePercent) || 0;
  const overheadPct = Number(quoteFormState.overheadPercent) || 0;
  const waste = quoteFormState.wasteEnabled ? totalMaterial * wastePct / 100 : 0;
  const overhead = quoteFormState.overheadEnabled ? totalMaterial * overheadPct / 100 : 0;
  const subtotal = totalMaterial + totalElectricity + totalLabor + totalInventory + waste + overhead;

  const margin = Number(quoteFormState.marginPercent) || 0;
  const markup = subtotal * margin / 100;
  const afterMargin = subtotal + markup;

  const discountVal = Number(quoteFormState.discountValue) || 0;
  const discountAmt = quoteFormState.discountType === 'usd' ? discountVal : afterMargin * discountVal / 100;
  const afterDiscount = Math.max(0, afterMargin - discountAmt);

  const taxPct = quoteFormState.taxExempt ? 0 : (Number(quoteFormState.taxPercent) || 0);
  const tax = afterDiscount * taxPct / 100;
  const total = afterDiscount + tax;

  setText('calc-material', money(totalMaterial));
  setText('calc-electricity', money(totalElectricity));
  setText('calc-labor', money(totalLabor));
  setText('calc-inventory', money(totalInventory));
  setText('calc-waste', money(waste));
  setText('calc-overhead', money(overhead));
  setText('calc-subtotal', money(subtotal));
  setText('calc-markup', `+ ${money(markup)}`);
  setText('calc-discount', `− ${money(discountAmt)}`);
  setText('calc-tax', money(tax));
  setText('calc-total', money(total));

  setText('calc-waste-label', `Waste (${quoteFormState.wasteEnabled ? wastePct : 0}%)`);
  setText('calc-overhead-label', `Overhead (${quoteFormState.overheadEnabled ? overheadPct : 0}%)`);
  setText('calc-discount-label', `Discount (${quoteFormState.discountType === 'usd' ? 'flat' : discountVal + '%'})`);
  setText('calc-tax-label', `Tax (${taxPct}%)`);
  setText('q-waste-pct-display', `${quoteFormState.wasteEnabled ? wastePct : 0}% of material`);
  setText('q-overhead-pct-display', `${quoteFormState.overheadEnabled ? overheadPct : 0}% of material`);

  // Labor/waste/overhead rows only show in the summary when their toggle
  // is on - runs every recalc so flipping a toggle (which always triggers
  // a recalc) keeps this in sync without a separate re-render path.
  const laborRow = document.getElementById('calc-labor-row');
  if (laborRow) laborRow.style.display = quoteFormState.laborEnabled ? '' : 'none';
  const wasteRow = document.getElementById('calc-waste-row');
  if (wasteRow) wasteRow.style.display = quoteFormState.wasteEnabled ? '' : 'none';
  const overheadRow = document.getElementById('calc-overhead-row');
  if (overheadRow) overheadRow.style.display = quoteFormState.overheadEnabled ? '' : 'none';

  return { material: totalMaterial, electricity: totalElectricity, labor: totalLabor, inventory: totalInventory, waste, overhead, subtotal, markup, discountAmt, tax, total };
}

// ---------- Markup ----------

function extraLinkRowHtml(url, idx) {
  return `
    <div class="repeat-row" data-link-idx="${idx}" style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
      <input type="url" class="q-extra-link-input" placeholder="https://..." value="${escapeHtml(url || '')}" style="flex:1;"/>
      <button type="button" class="btn outline small" data-remove-link title="Remove link">${icon('x', 13)}</button>
    </div>
  `;
}

function quoteLineHtml(line, idx) {
  const hoursVal = line.hours === '' || line.hours == null ? 0 : line.hours;
  const laborVal = line.laborMinutes === '' || line.laborMinutes == null ? 0 : line.laborMinutes;
  return `
    <div class="qline" data-line-idx="${idx}">
      <div class="qline-desc-row">
        <input type="text" placeholder="Line description (optional)" data-field="description" value="${escapeHtml(line.description || '')}"/>
        <button type="button" class="qline-remove" data-remove-line="${idx}" title="Remove line">${icon('trash', 14)}</button>
      </div>
      <div class="qline-row">
        <div>
          <label class="mini">Material</label>
          <div style="display:flex; gap:6px; align-items:center;">
            <select data-field="spoolId" style="flex:1;">
              <option value="">Select material</option>
              ${state.spools.map((s) => `<option value="${s.id}" ${s.id === line.spoolId ? 'selected' : ''}>${escapeHtml(s.brand)} ${escapeHtml(s.material)} ${escapeHtml(s.color || '')}</option>`).join('')}
            </select>
            <button type="button" class="btn outline small" data-add-filament="${idx}" title="Add new filament">${icon('plus', 13)}</button>
          </div>
        </div>
        <div>
          <label class="mini">Grams</label>
          <input type="number" data-field="grams" value="${line.grams ?? ''}" min="0" ${!line.spoolId ? 'disabled' : ''} placeholder="${!line.spoolId ? 'Select a material first' : ''}"/>
        </div>
      </div>
      ${(line.inventoryItems || []).map((inv, invIdx) => `
        <div class="qline-row qline-inventory-row">
          <div>
            <label class="mini">Inventory item</label>
            <select data-inv-field="inventoryItemId" data-inv-idx="${invIdx}">
              <option value="">Select item</option>
              ${state.inventoryItems.map((i) => `<option value="${i.id}" ${i.id === inv.inventoryItemId ? 'selected' : ''}>${escapeHtml(i.name)}${i.unitPrice != null ? ` (${money(i.unitPrice)})` : ''}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="mini">Qty</label>
            <input type="number" data-inv-field="qty" data-inv-idx="${invIdx}" value="${inv.qty ?? 1}" min="1"/>
          </div>
          <button type="button" class="qline-remove" data-remove-inventory="${idx}" data-remove-inventory-idx="${invIdx}" title="Remove inventory item">${icon('x', 14)}</button>
        </div>
      `).join('')}
      <button type="button" class="qline-add-inventory-btn" data-add-inventory="${idx}">${icon('inventory', 13)} Add inventory item</button>
      <div class="qline-row">
        <div>
          <label class="mini">Printer</label>
          <select data-field="printerId">
            <option value="">No printer</option>
            ${state.printers.map((p) => `<option value="${p.id}" ${p.id === line.printerId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="mini">Hours</label>
          <input type="number" data-field="hours" value="${hoursVal}" min="0" step="0.1"/>
        </div>
        <div>
          <label class="mini">Labor min</label>
          <input type="number" data-field="laborMinutes" value="${laborVal}" min="0"/>
        </div>
        <div>
          <label class="mini">Qty</label>
          <input type="number" data-field="qty" value="${line.qty ?? 1}" min="1"/>
        </div>
      </div>
      <div class="qline-sub">
        <span data-line-perunit>$0.00 mat + $0.00 pwr /unit</span>
        <span class="qline-total" data-line-total>$0.00</span>
      </div>
    </div>
  `;
}

function quoteLeftHtml() {
  const s = quoteFormState;
  const settings = state.settings;
  const selectedCustomerName = state.customers.find((c) => c.id === s.customerId)?.name || 'No customer';
  return `
    <div class="field-row">
      <div class="field">
        <label>Customer</label>
        <div class="combobox" id="q-customer-combobox">
          <input type="text" class="combobox-input" id="q-customer-search" autocomplete="off" placeholder="Search or add a customer..." value="${escapeHtml(selectedCustomerName)}"/>
          <div class="combobox-panel" id="q-customer-panel" style="display:none;"></div>
        </div>
      </div>
      <div class="field">
        <label>Status</label>
        <select id="q-status">
          ${['draft', 'pending', 'accepted', 'rejected'].map((st) => `<option value="${st}" ${st === s.status ? 'selected' : ''}>${st[0].toUpperCase() + st.slice(1)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Issue date</label>
        <div class="date-input-wrap">
          <input type="date" id="q-issuedAt" value="${s.issuedAt || ''}"/>
          <button type="button" class="date-picker-btn" data-date-btn="q-issuedAt" title="Pick a date">${icon('calendar', 15)}</button>
        </div>
      </div>
      <div class="field">
        <label>Expiry date</label>
        <div class="date-input-wrap">
          <input type="date" id="q-expiresAt" value="${s.expiresAt || ''}"/>
          <button type="button" class="date-picker-btn" data-date-btn="q-expiresAt" title="Pick a date">${icon('calendar', 15)}</button>
        </div>
      </div>
    </div>
    <div class="field">
      <label>Language</label>
      <select id="q-language" style="width:auto; min-width:140px; max-width:180px;">
        ${QUOTE_LANGUAGES.map((l) => `<option value="${escapeHtml(l)}" ${l === (s.language || 'English (US)') ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
      </select>
    </div>

    <div class="field">
      <label>Link to model</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="url" id="q-modelLink" placeholder="https://..." value="${escapeHtml(s.modelLink || '')}" style="flex:1;"/>
        <a id="q-modelLink-open" href="${s.modelLink ? escapeHtml(s.modelLink) : ''}" target="_blank" rel="noopener noreferrer" class="btn outline small ${!s.modelLink ? 'disabled-link' : ''}" title="Open model link">${icon('externalLink', 14)}</a>
      </div>
      <div id="q-extra-links" style="margin-top:8px;">${(s.additionalLinks || []).map((l, i) => extraLinkRowHtml(l, i)).join('')}</div>
      <button type="button" class="btn outline small" id="q-add-link" style="margin-top:8px;">${icon('plus', 13)} Add another link</button>
    </div>

    <div style="font-weight:600; font-size:13px; margin: 18px 0 10px 0;">Line items</div>
    <div id="qlines">${s.lines.map((l, i) => quoteLineHtml(l, i)).join('')}</div>
    <button type="button" class="btn outline small" id="q-add-line">${icon('plus', 13)} Add line</button>

    <div class="card" id="cost-adjustments-card" style="margin-top:18px;">${costAdjustmentsInnerHtml()}</div>

    <div class="field" style="margin-top:18px;">
      <label>Notes</label>
      <textarea id="q-notes" rows="3" placeholder="Anything to remember about this quote...">${escapeHtml(s.notes || '')}</textarea>
    </div>
  `;
}

function costAdjustmentsInnerHtml() {
  const s = quoteFormState;
  const settings = state.settings;
  return `
    <div style="font-size:11px; text-transform:uppercase; color:var(--muted-foreground); margin-bottom:12px; letter-spacing:0.04em;">Cost adjustments</div>

    <div class="toggle-row" style="margin-bottom:14px;">
      <label class="switch"><input type="checkbox" id="q-laborEnabled" ${s.laborEnabled ? 'checked' : ''}/><span class="slider-track"></span></label>
      <div>
        <div class="toggle-label">Labor</div>
        <div class="toggle-hint">${money(settings.hourlyRate || 0)}/hr &times; labor minutes per line</div>
      </div>
    </div>

    <div style="margin-bottom:14px;">
      <div class="toggle-row" style="justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:10px;">
          <label class="switch"><input type="checkbox" id="q-wasteEnabled" ${s.wasteEnabled ? 'checked' : ''}/><span class="slider-track"></span></label>
          <span class="toggle-label">Waste</span>
        </div>
        <span class="muted" id="q-waste-pct-display" style="font-size:11.5px;">${s.wasteEnabled ? (s.wastePercent || 0) : 0}% of material</span>
      </div>
      ${s.wasteEnabled ? `<input type="range" class="range-slider" id="q-wastePercent" min="0" max="100" value="${s.wastePercent || 0}"/>` : ''}
    </div>

    <div>
      <div class="toggle-row" style="justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:10px;">
          <label class="switch"><input type="checkbox" id="q-overheadEnabled" ${s.overheadEnabled ? 'checked' : ''}/><span class="slider-track"></span></label>
          <span class="toggle-label">Overhead</span>
        </div>
        <span class="muted" id="q-overhead-pct-display" style="font-size:11.5px;">${s.overheadEnabled ? (s.overheadPercent || 0) : 0}% of material</span>
      </div>
      ${s.overheadEnabled ? `<input type="range" class="range-slider" id="q-overheadPercent" min="0" max="100" value="${s.overheadPercent || 0}"/>` : ''}
    </div>

    <div class="field-hint" style="margin-top:12px;">Electricity &amp; labor rates are set in Settings &rarr; Quoting.</div>
  `;
}

function quoteRightHtml() {
  const s = quoteFormState;
  return `
    <div class="calc-row"><span class="calc-label">Material</span><span id="calc-material">$0.00</span></div>
    <div class="calc-row"><span class="calc-label">Electricity</span><span id="calc-electricity">$0.00</span></div>
    <div class="calc-row" id="calc-labor-row" style="${s.laborEnabled ? '' : 'display:none;'}"><span class="calc-label">Labor</span><span id="calc-labor">$0.00</span></div>
    <div class="calc-row"><span class="calc-label">Inventory</span><span id="calc-inventory">$0.00</span></div>
    <div class="calc-row" id="calc-waste-row" style="${s.wasteEnabled ? '' : 'display:none;'}"><span class="calc-label" id="calc-waste-label">Waste (${s.wasteEnabled ? (s.wastePercent || 0) : 0}%)</span><span id="calc-waste">$0.00</span></div>
    <div class="calc-row" id="calc-overhead-row" style="${s.overheadEnabled ? '' : 'display:none;'}"><span class="calc-label" id="calc-overhead-label">Overhead (${s.overheadEnabled ? (s.overheadPercent || 0) : 0}%)</span><span id="calc-overhead">$0.00</span></div>
    <div class="calc-divider"></div>
    <div class="calc-row"><span class="calc-label">Subtotal</span><span id="calc-subtotal">$0.00</span></div>

    <div class="calc-input-row">
      <label style="font-weight:600; font-size:13px;">Margin</label>
      <div style="display:flex; align-items:center; gap:4px;"><input type="number" id="q-marginPercent" value="${s.marginPercent ?? 0}" min="0" max="500"/><span class="muted" style="font-size:12px;">%</span></div>
    </div>
    <div class="calc-row"><span class="calc-label">Markup</span><span id="calc-markup">+ $0.00</span></div>

    <div style="margin-top:12px;">
      <label style="font-weight:600; font-size:13px;">Discount</label>
      <div style="display:flex; gap:8px; align-items:center; margin-top:6px;">
        <div class="discount-type-toggle">
          <button type="button" id="q-discount-pct" class="${s.discountType === 'percent' ? 'active' : ''}">%</button>
          <button type="button" id="q-discount-usd" class="${s.discountType === 'usd' ? 'active' : ''}">USD</button>
        </div>
        <input type="number" id="q-discountValue" value="${s.discountValue ?? 0}" min="0" style="flex:1; background:var(--background); border:1px solid var(--border); color:var(--foreground); border-radius:6px; padding:6px 8px; font-size:12.5px;"/>
      </div>
    </div>
    <div class="calc-row"><span class="calc-label" id="calc-discount-label">Discount (${s.discountType === 'usd' ? 'flat' : (s.discountValue || 0) + '%'})</span><span id="calc-discount">&minus; $0.00</span></div>

    <div style="margin-top:12px;">
      <div class="calc-input-row">
        <label style="font-weight:600; font-size:13px;">Tax</label>
        <div style="display:flex; align-items:center; gap:4px;"><input type="number" id="q-taxPercent" value="${s.taxPercent ?? 0}" min="0" max="100"/><span class="muted" style="font-size:12px;">%</span></div>
      </div>
      <div class="toggle-row" style="margin-top:6px;">
        <label class="switch"><input type="checkbox" id="q-taxExempt" ${s.taxExempt ? 'checked' : ''}/><span class="slider-track"></span></label>
        <span class="toggle-label" style="font-size:12.5px; font-weight:500;">Tax exempt</span>
      </div>
    </div>
    <div class="calc-row"><span class="calc-label" id="calc-tax-label">Tax (${s.taxExempt ? 0 : (s.taxPercent || 0)}%)</span><span id="calc-tax">$0.00</span></div>

    <div style="margin-top:auto; padding-top:14px;">
      <div class="calc-divider"></div>
      <div class="calc-row calc-total"><span>Total</span><span id="calc-total">$0.00</span></div>
      ${quoteFormIsEdit ? `
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button type="button" class="btn outline small" id="q-gen-invoice" style="flex:1; justify-content:center; gap:6px;">${icon('fileText', 13)} Invoice</button>
          <button type="button" class="btn outline small" id="q-download-pdf" style="flex:1; justify-content:center; gap:6px;">${icon('download', 13)} PDF</button>
        </div>
        <button type="button" class="btn outline small" id="q-gen-order" style="width:100%; margin-top:8px; justify-content:center; gap:6px;">${icon('orders', 13)} Convert to Order</button>
      ` : ''}
      <button type="button" class="btn" id="q-submit" style="width:100%; margin-top:12px; justify-content:center;">${quoteFormIsEdit ? 'Save changes' : 'Create quote'}</button>
      <button type="button" class="btn ghost" id="q-cancel" style="width:100%; margin-top:4px; justify-content:center;">Cancel</button>
      ${quoteFormIsEdit ? `<button type="button" class="btn ghost" id="q-delete" style="width:100%; margin-top:4px; justify-content:center; color:var(--status-red-fg);">Delete quote</button>` : ''}
    </div>
  `;
}

// ---------- PDF (browser print-to-PDF - no external dependency) ----------

function downloadQuotePdf(s, calc) {
  const settings = state.settings;
  const customer = state.customers.find((c) => c.id === s.customerId);
  const win = window.open('', '_blank');
  if (!win) { showToast('Please allow pop-ups to download the PDF', true); return; }

  const lineRows = s.lines.map((line) => {
    const nums = computeQuoteLineNumbers(line);
    const qty = nums.qty;
    const printUnit = nums.lineMaterial + nums.lineElectricity + nums.lineLabor;
    const label = line.description || 'Print job';
    let rows = `<tr><td>${escapeHtml(label)}</td><td style="text-align:center;">${qty}</td><td style="text-align:right;">${money(printUnit)}</td><td style="text-align:right;">${money(printUnit * qty)}</td></tr>`;
    (line.inventoryItems || []).forEach((inv) => {
      const item = state.inventoryItems.find((i) => i.id === inv.inventoryItemId);
      const invQty = Number(inv.qty) || 1;
      const invTotal = item ? (Number(item.unitPrice) || 0) * invQty : 0;
      rows += `<tr><td>${escapeHtml(item?.name || 'Inventory item')}</td><td style="text-align:center;">${invQty}</td><td style="text-align:right;">${money(item?.unitPrice)}</td><td style="text-align:right;">${money(invTotal)}</td></tr>`;
    });
    return rows;
  }).join('');

  win.document.write(`
    <!doctype html><html><head><meta charset="utf-8"><title>Quote ${escapeHtml(s.quoteNumber || '')}</title>
    <style>
      body { font-family: -apple-system, "Segoe UI", sans-serif; color:#111; padding: 40px; max-width: 720px; margin: 0 auto; }
      h1 { font-size: 20px; margin: 0 0 2px 0; }
      .muted { color: #666; font-size: 12.5px; }
      .row { display:flex; justify-content:space-between; margin: 18px 0; }
      table { width:100%; border-collapse: collapse; margin-top: 18px; }
      th, td { padding: 8px 6px; border-bottom: 1px solid #ddd; font-size: 13px; text-align: left; }
      th { color: #666; font-size: 11px; text-transform: uppercase; }
      .totals { margin-top: 14px; width: 260px; margin-left: auto; }
      .totals div { display:flex; justify-content:space-between; padding: 3px 0; font-size: 13px; }
      .totals .grand { font-weight:700; font-size: 16px; border-top: 1px solid #333; margin-top: 6px; padding-top: 8px; }
      @media print { body { padding: 0; } }
    </style>
    </head><body>
      <div class="row">
        <div>
          <h1>${escapeHtml(settings.workspaceName || 'Quote')}</h1>
          <div class="muted">${escapeHtml(settings.contactEmail || '')}${settings.contactPhone ? ' · ' + escapeHtml(settings.contactPhone) : ''}</div>
        </div>
        <div style="text-align:right;">
          <div><strong>Quote ${escapeHtml(s.quoteNumber || '')}</strong></div>
          <div class="muted">Issued ${s.issuedAt ? fmtDateSlash(s.issuedAt) : '—'}</div>
          <div class="muted">Expires ${s.expiresAt ? fmtDateSlash(s.expiresAt) : '—'}</div>
        </div>
      </div>
      <div class="muted">Bill to</div>
      <div><strong>${escapeHtml(customer?.name || 'No customer')}</strong></div>
      <div class="muted">${escapeHtml(customer?.email || '')}${customer?.phone ? ' · ' + escapeHtml(customer.phone) : ''}</div>
      ${s.modelLink ? `<div class="muted" style="margin-top:6px;">Model: <a href="${escapeHtml(s.modelLink)}">${escapeHtml(s.modelLink)}</a></div>` : ''}
      ${(s.additionalLinks || []).filter(Boolean).map((l) => `<div class="muted">Model: <a href="${escapeHtml(l)}">${escapeHtml(l)}</a></div>`).join('')}

      <table>
        <thead><tr><th>Item</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Unit</th><th style="text-align:right;">Total</th></tr></thead>
        <tbody>${lineRows}</tbody>
      </table>

      <div class="totals">
        <div><span>Subtotal</span><span>${money(calc.subtotal)}</span></div>
        <div><span>Markup</span><span>${money(calc.markup)}</span></div>
        <div><span>Discount</span><span>&minus;${money(calc.discountAmt)}</span></div>
        <div><span>Tax</span><span>${money(calc.tax)}</span></div>
        <div class="grand"><span>Total</span><span>${money(calc.total)}</span></div>
      </div>

      ${s.notes ? `<div class="muted" style="margin-top:24px; white-space:pre-wrap;">${escapeHtml(s.notes)}</div>` : ''}
    </body></html>
  `);
  win.document.close();
  win.focus();
  // Print as soon as the popup has actually laid out its content, instead of
  // guessing with a fixed delay (a slower machine could still be mid-layout
  // at 300ms, and a fast one just sits there waiting for no reason). Two
  // nested rAFs is the standard way to wait for "after the next paint" -
  // there's nothing else async to wait for here (no images/fonts to load).
  win.requestAnimationFrame(() => win.requestAnimationFrame(() => win.print()));
}

// ---------- Wiring ----------

function renderQuoteModal() {
  renderModalShell({
    title: quoteFormIsEdit ? 'Edit quote' : 'New quote',
    subtitle: 'The quote number is assigned automatically on save.',
    wide: true,
    twoCol: true,
    bodyHtml: `<div class="modal-col-left">${quoteLeftHtml()}</div><div class="modal-col-right">${quoteRightHtml()}</div>`,
    footerHtml: '',
  });
  wireQuoteModalEvents();
  recalcAndPatchQuote();
}

// Targeted partial re-renders. A full renderQuoteModal() tears down and
// recreates the whole .modal DOM node, which replays its CSS slide-in
// animation - jarring for something as minor as adding a line or flipping
// a toggle. These instead only replace the contents of a stable inner
// container (#qlines / #cost-adjustments-card) whose event listeners are
// delegated on the container itself, so nothing needs re-wiring after.
function rerenderQlines() {
  const s = quoteFormState;
  const qlines = document.getElementById('qlines');
  if (!qlines) return;
  qlines.innerHTML = s.lines.map((l, i) => quoteLineHtml(l, i)).join('');
  recalcAndPatchQuote();
}

function rerenderExtraLinks() {
  const s = quoteFormState;
  const container = document.getElementById('q-extra-links');
  if (!container) return;
  container.innerHTML = (s.additionalLinks || []).map((l, i) => extraLinkRowHtml(l, i)).join('');
}

function rerenderCostAdjustments() {
  const card = document.getElementById('cost-adjustments-card');
  if (!card) return;
  card.innerHTML = costAdjustmentsInnerHtml();
  recalcAndPatchQuote();
}

// Opens a normal openModal() popup - the same chrome used everywhere else
// in the app (e.g. the standalone "New customer" button on the Customers
// page) - but targeting the secondary modal root so it slides in on top of
// / to the right of the New Quote drawer instead of replacing it.
function openCustomerSubModal(prefillName) {
  openModal('New customer', [
    { name: 'name', label: 'Name', required: true, value: prefillName || '' },
    { name: 'email', label: 'Email' },
    { name: 'phone', label: 'Phone' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ], async (data) => {
    const created = await api('POST', '/api/customers', data);
    state.customers.push(created);
    quoteFormState.customerId = created.id;
    showToast('Customer added');
    // Directly update the search input rather than calling renderQuoteModal()
    // - the primary quote drawer is untouched by this sub-modal, so a full
    // re-render would only replay its slide-in animation for no reason.
    const input = document.getElementById('q-customer-search');
    if (input) input.value = created.name;
  }, { submitLabel: 'Save customer', rootId: 'modal-root-2', stacked: true });
}

function wireCustomerCombobox() {
  const s = quoteFormState;
  const wrap = document.getElementById('q-customer-combobox');
  const input = document.getElementById('q-customer-search');
  const panel = document.getElementById('q-customer-panel');
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
        <div class="combobox-add-btn" id="q-customer-add-btn">${icon('plus', 13)} Add new customer</div>
      </div>
    `;
    panel.querySelectorAll('[data-customer-id]').forEach((el) => {
      el.onclick = () => {
        s.customerId = el.dataset.customerId || '';
        input.value = selectedName();
        panel.style.display = 'none';
      };
    });
    const addBtn = document.getElementById('q-customer-add-btn');
    if (addBtn) addBtn.onclick = () => { panel.style.display = 'none'; openCustomerSubModal(query); };
  }

  input.addEventListener('focus', () => {
    input.select();
    panel.style.display = 'block';
    renderOptions('');
  });
  input.addEventListener('input', () => renderOptions(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { panel.style.display = 'none'; input.value = selectedName(); input.blur(); }
  });

  // Outside-click detection has to run on mousedown, not click: selecting
  // an option (or "Add new customer") replaces panel.innerHTML from a
  // click handler, which detaches the original e.target from the document
  // - a document-level 'click' listener checking wrap.contains(e.target)
  // would then see a detached node, wrongly conclude the click was
  // "outside", and immediately re-close whatever the click just opened.
  // Deciding on mousedown (which always fires before click's DOM mutation)
  // sidesteps that entirely.
  if (comboboxOutsideCleanup) document.removeEventListener('mousedown', comboboxOutsideCleanup);
  comboboxOutsideCleanup = (e) => {
    if (!wrap.contains(e.target)) {
      panel.style.display = 'none';
      input.value = selectedName();
    }
  };
  document.addEventListener('mousedown', comboboxOutsideCleanup);
}

function wireQuoteModalEvents() {
  const s = quoteFormState;
  const byId = (id) => document.getElementById(id);

  wireCustomerCombobox();

  byId('q-status').onchange = (e) => { s.status = e.target.value; };
  byId('q-issuedAt').onchange = (e) => { s.issuedAt = e.target.value; };
  byId('q-expiresAt').onchange = (e) => { s.expiresAt = e.target.value; };
  byId('q-language').onchange = (e) => { s.language = e.target.value; };
  byId('q-notes').oninput = (e) => { s.notes = e.target.value; };

  document.querySelectorAll('[data-date-btn]').forEach((btn) => {
    btn.onclick = () => {
      const input = byId(btn.dataset.dateBtn);
      if (!input) return;
      if (input.showPicker) {
        try { input.showPicker(); } catch { input.focus(); }
      } else {
        input.focus();
      }
    };
  });

  const qlines = byId('qlines');
  qlines.addEventListener('input', (e) => {
    const row = e.target.closest('[data-line-idx]');
    if (!row) return;
    const idx = Number(row.dataset.lineIdx);
    const invField = e.target.dataset.invField;
    if (invField) {
      const invIdx = Number(e.target.dataset.invIdx);
      s.lines[idx].inventoryItems[invIdx][invField] = e.target.value;
      recalcAndPatchQuote();
      return;
    }
    const field = e.target.dataset.field;
    if (!field) return;
    s.lines[idx][field] = e.target.value;
    recalcAndPatchQuote();
  });
  qlines.addEventListener('change', (e) => {
    const row = e.target.closest('[data-line-idx]');
    if (!row) return;
    const idx = Number(row.dataset.lineIdx);
    const invField = e.target.dataset.invField;
    if (invField) {
      const invIdx = Number(e.target.dataset.invIdx);
      s.lines[idx].inventoryItems[invIdx][invField] = e.target.value;
      recalcAndPatchQuote();
      return;
    }
    const field = e.target.dataset.field;
    if (!field) return;
    if (field === 'spoolId') {
      const gramsInput = row.querySelector('[data-field="grams"]');
      const hasMaterial = !!e.target.value;
      if (gramsInput) {
        gramsInput.disabled = !hasMaterial;
        gramsInput.placeholder = hasMaterial ? '' : 'Select a material first';
        if (!hasMaterial) { gramsInput.value = ''; s.lines[idx].grams = ''; }
      }
    }
    recalcAndPatchQuote();
  });
  qlines.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-remove-line]');
    if (removeBtn) {
      const idx = Number(removeBtn.dataset.removeLine);
      if (s.lines.length <= 1) { s.lines[idx] = newQuoteLine(); rerenderQlines(); return; }
      s.lines.splice(idx, 1);
      rerenderQlines();
      return;
    }
    const addFilamentBtn = e.target.closest('[data-add-filament]');
    if (addFilamentBtn) {
      const idx = Number(addFilamentBtn.dataset.addFilament);
      openFilamentModal(null, {
        rootId: 'modal-root-2',
        stacked: true,
        onSaved: async (record) => {
          s.lines[idx].spoolId = record.id;
          rerenderQlines();
        },
      });
      return;
    }
    const addInvBtn = e.target.closest('[data-add-inventory]');
    if (addInvBtn) {
      const idx = Number(addInvBtn.dataset.addInventory);
      s.lines[idx].inventoryItems = s.lines[idx].inventoryItems || [];
      s.lines[idx].inventoryItems.push({ inventoryItemId: '', qty: 1 });
      rerenderQlines();
      return;
    }
    const removeInvBtn = e.target.closest('[data-remove-inventory]');
    if (removeInvBtn) {
      const idx = Number(removeInvBtn.dataset.removeInventory);
      const invIdx = Number(removeInvBtn.dataset.removeInventoryIdx);
      s.lines[idx].inventoryItems.splice(invIdx, 1);
      rerenderQlines();
    }
  });
  qlines.addEventListener('focusin', (e) => {
    const field = e.target.dataset.field;
    if ((field === 'hours' || field === 'laborMinutes') && e.target.value === '0') {
      e.target.value = '';
    }
  });
  qlines.addEventListener('focusout', (e) => {
    const field = e.target.dataset.field;
    if ((field === 'hours' || field === 'laborMinutes') && e.target.value.trim() === '') {
      e.target.value = '0';
      const row = e.target.closest('[data-line-idx]');
      if (row) {
        const idx = Number(row.dataset.lineIdx);
        s.lines[idx][field] = 0;
        recalcAndPatchQuote();
      }
    }
  });

  byId('q-add-line').onclick = () => { s.lines.push(newQuoteLine()); rerenderQlines(); };

  byId('q-modelLink').oninput = (e) => {
    s.modelLink = e.target.value;
    const openBtn = byId('q-modelLink-open');
    if (openBtn) {
      openBtn.href = s.modelLink || '';
      openBtn.classList.toggle('disabled-link', !s.modelLink);
    }
  };

  byId('q-add-link').onclick = () => {
    s.additionalLinks = s.additionalLinks || [];
    s.additionalLinks.push('');
    rerenderExtraLinks();
  };

  const extraLinksContainer = byId('q-extra-links');
  extraLinksContainer.addEventListener('input', (e) => {
    if (!e.target.classList.contains('q-extra-link-input')) return;
    const row = e.target.closest('[data-link-idx]');
    if (!row) return;
    s.additionalLinks[Number(row.dataset.linkIdx)] = e.target.value;
  });
  extraLinksContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-link]');
    if (!btn) return;
    const row = btn.closest('[data-link-idx]');
    if (!row) return;
    s.additionalLinks.splice(Number(row.dataset.linkIdx), 1);
    rerenderExtraLinks();
  });

  // Delegated on the stable #cost-adjustments-card container so toggling a
  // checkbox (which swaps the card's inner HTML via rerenderCostAdjustments)
  // never needs its listeners re-wired, and never replays the drawer's
  // slide-in animation the way a full renderQuoteModal() would.
  const costCard = byId('cost-adjustments-card');
  costCard.addEventListener('change', (e) => {
    if (e.target.id === 'q-laborEnabled') { s.laborEnabled = e.target.checked; rerenderCostAdjustments(); }
    else if (e.target.id === 'q-wasteEnabled') { s.wasteEnabled = e.target.checked; rerenderCostAdjustments(); }
    else if (e.target.id === 'q-overheadEnabled') { s.overheadEnabled = e.target.checked; rerenderCostAdjustments(); }
  });
  costCard.addEventListener('input', (e) => {
    if (e.target.id === 'q-wastePercent') { s.wastePercent = Number(e.target.value); recalcAndPatchQuote(); }
    else if (e.target.id === 'q-overheadPercent') { s.overheadPercent = Number(e.target.value); recalcAndPatchQuote(); }
  });

  byId('q-marginPercent').oninput = (e) => { s.marginPercent = Number(e.target.value); recalcAndPatchQuote(); };
  byId('q-discountValue').oninput = (e) => { s.discountValue = Number(e.target.value); recalcAndPatchQuote(); };
  byId('q-taxPercent').oninput = (e) => { s.taxPercent = Number(e.target.value); recalcAndPatchQuote(); };
  byId('q-taxExempt').onchange = (e) => { s.taxExempt = e.target.checked; recalcAndPatchQuote(); };

  byId('q-discount-pct').onclick = () => { s.discountType = 'percent'; byId('q-discount-pct').classList.add('active'); byId('q-discount-usd').classList.remove('active'); recalcAndPatchQuote(); };
  byId('q-discount-usd').onclick = () => { s.discountType = 'usd'; byId('q-discount-usd').classList.add('active'); byId('q-discount-pct').classList.remove('active'); recalcAndPatchQuote(); };

  byId('q-cancel').onclick = () => closeModal();
  byId('q-submit').onclick = async () => {
    const calc = recalcAndPatchQuote();
    const payload = {
      quoteNumber: s.quoteNumber || nextNumber('quoteNumberPrefix', state.quotes, 'quoteNumber'),
      customerId: s.customerId || null,
      status: s.status,
      issuedAt: s.issuedAt || null,
      expiresAt: s.expiresAt || null,
      language: s.language || 'English (US)',
      modelLink: s.modelLink || null,
      additionalLinks: (s.additionalLinks || []).filter(Boolean),
      lines: s.lines,
      laborEnabled: s.laborEnabled,
      wasteEnabled: s.wasteEnabled, wastePercent: s.wastePercent,
      overheadEnabled: s.overheadEnabled, overheadPercent: s.overheadPercent,
      marginPercent: s.marginPercent,
      discountType: s.discountType, discountValue: s.discountValue,
      taxPercent: s.taxPercent, taxExempt: s.taxExempt,
      notes: s.notes,
      materialCost: calc.material, electricityCost: calc.electricity, laborCost: calc.labor,
      inventoryCost: calc.inventory,
      discount: calc.discountAmt, total: calc.total,
    };
    try {
      if (quoteFormIsEdit && s.id) {
        await api('PUT', `/api/quotes/${s.id}`, payload);
        showToast('Quote updated');
      } else {
        await api('POST', '/api/quotes', payload);
        showToast('Quote created');
      }
      closeModal();
      await refreshAndRerender();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  if (quoteFormIsEdit) {
    byId('q-gen-invoice').onclick = async () => {
      const calc = recalcAndPatchQuote();
      try {
        const created = await api('POST', '/api/invoices', {
          invoiceNumber: nextNumber('invoiceNumberPrefix', state.invoices, 'invoiceNumber'),
          customerId: s.customerId || null,
          quoteId: s.id,
          status: 'draft',
          issuedAt: new Date().toISOString().slice(0, 10),
          items: [{ description: `Quote ${s.quoteNumber || ''}`.trim(), notes: '', qty: 1, rate: calc.total }],
          total: calc.total,
        });
        state.invoices.push(created);
        showToast('Invoice created from this quote');
      } catch (err) {
        showToast(err.message, true);
      }
    };

    byId('q-download-pdf').onclick = () => {
      const calc = recalcAndPatchQuote();
      downloadQuotePdf(s, calc);
    };

    byId('q-gen-order').onclick = async () => {
      const calc = recalcAndPatchQuote();
      try {
        const created = await api('POST', '/api/orders', {
          orderNumber: nextNumber('orderNumberPrefix', state.orders, 'orderNumber'),
          customerId: s.customerId || null,
          quoteId: s.id,
          status: 'pending',
          priority: 'normal',
          fulfillment: 'pickup',
          total: calc.total,
          notes: [s.notes, `From Quote ${s.quoteNumber || ''}`.trim()].filter(Boolean).join('\n\n'),
        });
        state.orders.push(created);
        showToast('Order created from this quote');
        closeModal();
        await refreshAndRerender();
        await navigate('orders');
      } catch (err) {
        showToast(err.message, true);
      }
    };

    byId('q-delete').onclick = async () => {
      if (!confirm('Delete this quote? This cannot be undone.')) return;
      try {
        await api('DELETE', `/api/quotes/${s.id}`);
        showToast('Quote deleted');
        closeModal();
        await refreshAndRerender();
      } catch (err) {
        showToast(err.message, true);
      }
    };
  }
}

// `prefill` (only used for a brand-new quote, e.g. converting a Requests
// inbox entry) lets a caller seed customerId/modelLink/notes without a
// second render - it's merged into the "new quote" branch below, then
// openQuoteModal renders once, so there's no double slide-in animation.
function openQuoteModal(existing, prefill) {
  quoteFormIsEdit = !!existing;
  quoteFormState = existing ? {
    id: existing.id,
    quoteNumber: existing.quoteNumber || null,
    customerId: existing.customerId || '',
    status: existing.status || 'draft',
    issuedAt: existing.issuedAt ? existing.issuedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
    expiresAt: existing.expiresAt ? existing.expiresAt.slice(0, 10) : '',
    language: existing.language || 'English (US)',
    modelLink: existing.modelLink || '',
    additionalLinks: existing.additionalLinks && existing.additionalLinks.length ? existing.additionalLinks.slice() : [],
    lines: existing.lines && existing.lines.length ? existing.lines.map((l) => {
      // Back-compat: older saved quotes may carry the single-inventory-item
      // shape (hasInventory/inventoryItemId/inventoryQty) from before lines
      // supported multiple attached inventory items.
      const { hasInventory, inventoryItemId, inventoryQty, inventoryItems, ...rest } = l;
      const migrated = inventoryItems || (hasInventory && inventoryItemId ? [{ inventoryItemId, qty: inventoryQty ?? 1 }] : []);
      return { ...rest, inventoryItems: migrated };
    }) : [newQuoteLine()],
    laborEnabled: existing.laborEnabled !== false,
    wasteEnabled: !!existing.wasteEnabled, wastePercent: existing.wastePercent ?? 0,
    overheadEnabled: !!existing.overheadEnabled, overheadPercent: existing.overheadPercent ?? 0,
    marginPercent: existing.marginPercent ?? (state.settings.defaultMarginPercent ?? 0),
    discountType: existing.discountType || 'percent', discountValue: existing.discountValue ?? 0,
    taxPercent: existing.taxPercent ?? 0, taxExempt: !!existing.taxExempt,
    notes: existing.notes || '',
  } : {
    quoteNumber: null,
    customerId: (prefill && prefill.customerId) || '', status: 'draft',
    issuedAt: new Date().toISOString().slice(0, 10), expiresAt: '',
    language: 'English (US)',
    modelLink: (prefill && prefill.modelLink) || '',
    additionalLinks: (prefill && prefill.additionalLinks) || [],
    lines: [newQuoteLine()],
    laborEnabled: true,
    wasteEnabled: (state.settings.defaultWastePercent || 0) > 0, wastePercent: state.settings.defaultWastePercent ?? 0,
    overheadEnabled: (state.settings.defaultOverheadPercent || 0) > 0, overheadPercent: state.settings.defaultOverheadPercent ?? 0,
    marginPercent: state.settings.defaultMarginPercent ?? 30,
    discountType: 'percent', discountValue: 0,
    taxPercent: (state.settings.defaultTaxBasisPoints || 0) / 100, taxExempt: false,
    notes: (prefill && prefill.notes) || '',
  };
  renderQuoteModal();
}

// ---------- Quotes list page ----------

let quoteListSearch = '';
let quoteListStatusFilter = 'all';
let quoteListSort = { field: 'issuedAt', dir: 'desc' };

const QUOTE_STATUS_OPTIONS = ['all', 'draft', 'pending', 'accepted', 'rejected'];
const QUOTE_SORT_COLUMNS = [
  { key: 'quoteNumber', label: 'Quote' },
  { key: 'customer', label: 'Customer' },
  { key: 'status', label: 'Status' },
  { key: 'issuedAt', label: 'Issued' },
  { key: 'total', label: 'Total' },
];

// fuzzyMatch() lives in core.js so Orders can share it too.

function getFilteredSortedQuotes() {
  let list = state.quotes.slice();
  if (quoteListStatusFilter !== 'all') list = list.filter((q) => q.status === quoteListStatusFilter);
  if (quoteListSearch.trim()) {
    list = list.filter((q) => [q.quoteNumber, customerName(q.customerId), q.status, q.notes].some((h) => fuzzyMatch(quoteListSearch, h)));
  }

  const { field, dir } = quoteListSort;
  const mult = dir === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    if (field === 'total') return ((Number(a.total) || 0) - (Number(b.total) || 0)) * mult;
    let av, bv;
    if (field === 'customer') { av = customerName(a.customerId); bv = customerName(b.customerId); }
    else if (field === 'issuedAt') { av = a.issuedAt || a.createdAt || ''; bv = b.issuedAt || b.createdAt || ''; }
    else { av = a[field]; bv = b[field]; }
    av = (av || '').toString().toLowerCase();
    bv = (bv || '').toString().toLowerCase();
    if (av < bv) return -1 * mult;
    if (av > bv) return 1 * mult;
    return 0;
  });
  return list;
}

function renderQuotesTable() {
  const tableEl = document.getElementById('quotes-table');
  if (!tableEl) return;

  if (!state.quotes.length) {
    tableEl.innerHTML = `<div class="empty-state">No quotes yet. Create your first quote to price up a print job.</div>`;
    return;
  }

  const list = getFilteredSortedQuotes();
  if (!list.length) {
    tableEl.innerHTML = `<div class="empty-state">No quotes match your search or filter.</div>`;
    return;
  }

  const headerCell = (col) => {
    const active = quoteListSort.field === col.key;
    const arrow = active ? (quoteListSort.dir === 'asc' ? '▲' : '▼') : '';
    return `<th class="sortable ${active ? 'sort-active' : ''}" data-sort-key="${col.key}">${col.label}<span class="sort-arrow">${arrow}</span></th>`;
  };

  const rows = list.map((q) => `
    <tr class="clickable-row" data-open-quote="${q.id}">
      <td>${escapeHtml(q.quoteNumber || '—')}</td>
      <td>${escapeHtml(customerName(q.customerId))}</td>
      <td>${badge(q.status, q.status)}</td>
      <td>${fmtDateSlash(q.issuedAt || q.createdAt)}</td>
      <td>${money(q.total)}</td>
    </tr>
  `).join('');

  tableEl.innerHTML = `
    <table>
      <thead><tr>${QUOTE_SORT_COLUMNS.map(headerCell).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  tableEl.querySelectorAll('[data-sort-key]').forEach((th) => {
    th.onclick = () => {
      const key = th.dataset.sortKey;
      if (quoteListSort.field === key) quoteListSort = { field: key, dir: quoteListSort.dir === 'asc' ? 'desc' : 'asc' };
      else quoteListSort = { field: key, dir: 'asc' };
      renderQuotesTable();
    };
  });
  tableEl.querySelectorAll('[data-open-quote]').forEach((row) => {
    row.onclick = () => {
      const q = state.quotes.find((x) => x.id === row.dataset.openQuote);
      if (q) openQuoteModal(q);
    };
  });
}

async function renderQuotes() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Quotes</h1>
        <p class="page-subtitle">Price up print jobs from material and electricity, with margin and discounts.</p>
      </div>
      <div class="page-actions">
        <button class="btn brand" id="add-quote">+ New quote</button>
      </div>
    </div>
    <div class="quotes-toolbar">
      <div class="quotes-search">${icon('search', 15)}<input type="text" id="quotes-search-input" placeholder="Search quotes..." value="${escapeHtml(quoteListSearch)}" autocomplete="off"/></div>
      <div class="status-filter-group">
        ${QUOTE_STATUS_OPTIONS.map((st) => `<button type="button" class="status-filter-btn ${quoteListStatusFilter === st ? 'active' : ''}" data-status-filter="${st}">${st === 'all' ? 'All' : st[0].toUpperCase() + st.slice(1)}</button>`).join('')}
      </div>
    </div>
    <div class="card" id="quotes-table"></div>
  `;

  document.getElementById('add-quote').onclick = () => openQuoteModal();

  document.getElementById('quotes-search-input').oninput = (e) => {
    quoteListSearch = e.target.value;
    renderQuotesTable();
  };

  document.querySelectorAll('[data-status-filter]').forEach((btn) => {
    btn.onclick = () => {
      quoteListStatusFilter = btn.dataset.statusFilter;
      document.querySelectorAll('[data-status-filter]').forEach((b) => b.classList.toggle('active', b.dataset.statusFilter === quoteListStatusFilter));
      renderQuotesTable();
    };
  });

  renderQuotesTable();
}

registerPage('quotes', renderQuotes);
