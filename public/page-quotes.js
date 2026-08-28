// public/page-quotes.js
// Quotes get a dedicated modal (not the generic resource-page modal)
// because FoxTrack's quote builder is a real pricing calculator: line
// items priced from filament + printer + labor, with live-recalculating
// waste/overhead/margin/discount/tax down to a final total.

let quoteFormState = null;
let quoteFormIsEdit = false;

function newQuoteLine() {
  return { description: '', spoolId: '', grams: '', printerId: '', hours: '', laborMinutes: '', qty: 1 };
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ---------- Calculation ----------

function computeQuoteLineNumbers(line) {
  const settings = state.settings;
  const spool = state.spools.find((s) => s.id === line.spoolId);
  const grams = Number(line.grams) || 0;
  const qty = Number(line.qty) || 1;
  const matPerGram = spool && spool.totalWeightGrams ? (Number(spool.spoolPrice) || 0) / spool.totalWeightGrams : 0;
  const lineMaterial = matPerGram * grams;

  const printer = state.printers.find((p) => p.id === line.printerId);
  const hours = Number(line.hours) || 0;
  const lineElectricity = printer && printer.powerDrawWatts
    ? (printer.powerDrawWatts / 1000) * hours * (Number(settings.electricityRatePerKwh) || 0)
    : 0;

  const laborMin = Number(line.laborMinutes) || 0;
  const lineLabor = quoteFormState.laborEnabled ? (laborMin / 60) * (Number(settings.hourlyRate) || 0) : 0;

  return { lineMaterial, lineElectricity, lineLabor, qty };
}

function recalcAndPatchQuote() {
  let totalMaterial = 0, totalElectricity = 0, totalLabor = 0;

  quoteFormState.lines.forEach((line, i) => {
    const { lineMaterial, lineElectricity, lineLabor, qty } = computeQuoteLineNumbers(line);
    totalMaterial += lineMaterial * qty;
    totalElectricity += lineElectricity * qty;
    totalLabor += lineLabor * qty;

    const row = document.querySelector(`[data-line-idx="${i}"]`);
    if (row) {
      const perUnitEl = row.querySelector('[data-line-perunit]');
      const totalEl = row.querySelector('[data-line-total]');
      if (perUnitEl) perUnitEl.textContent = `${money(lineMaterial)} mat + ${money(lineElectricity)} pwr /unit`;
      if (totalEl) totalEl.textContent = money((lineMaterial + lineElectricity + lineLabor) * qty);
    }
  });

  const wastePct = Number(quoteFormState.wastePercent) || 0;
  const overheadPct = Number(quoteFormState.overheadPercent) || 0;
  const waste = quoteFormState.wasteEnabled ? totalMaterial * wastePct / 100 : 0;
  const overhead = quoteFormState.overheadEnabled ? totalMaterial * overheadPct / 100 : 0;
  const subtotal = totalMaterial + totalElectricity + totalLabor + waste + overhead;

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

  return { material: totalMaterial, electricity: totalElectricity, labor: totalLabor, waste, overhead, subtotal, markup, discountAmt, tax, total };
}

// ---------- Markup ----------

function quoteLineHtml(line, idx) {
  return `
    <div class="qline" data-line-idx="${idx}">
      <div class="qline-desc-row">
        <input type="text" placeholder="Line description (optional)" data-field="description" value="${escapeHtml(line.description || '')}"/>
        <button type="button" class="qline-remove" data-remove-line="${idx}" title="Remove line">${icon('trash', 14)}</button>
      </div>
      <div class="qline-row">
        <div>
          <label class="mini">Material</label>
          <select data-field="spoolId">
            <option value="">Select material</option>
            ${state.spools.map((s) => `<option value="${s.id}" ${s.id === line.spoolId ? 'selected' : ''}>${escapeHtml(s.brand)} ${escapeHtml(s.material)} ${escapeHtml(s.color || '')}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="mini">Grams</label>
          <input type="number" data-field="grams" value="${line.grams ?? ''}" min="0"/>
        </div>
      </div>
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
          <input type="number" data-field="hours" value="${line.hours ?? ''}" min="0" step="0.1"/>
        </div>
        <div>
          <label class="mini">Labor min</label>
          <input type="number" data-field="laborMinutes" value="${line.laborMinutes ?? ''}" min="0"/>
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
  return `
    <div class="field-row">
      <div class="field">
        <label>Customer</label>
        <select id="q-customerId">
          <option value="">No customer</option>
          ${state.customers.map((c) => `<option value="${c.id}" ${c.id === s.customerId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Status</label>
        <select id="q-status">
          ${['draft', 'pending', 'accepted', 'rejected'].map((st) => `<option value="${st}" ${st === s.status ? 'selected' : ''}>${st[0].toUpperCase() + st.slice(1)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Issue date</label><input type="date" id="q-issuedAt" value="${s.issuedAt || ''}"/></div>
      <div class="field"><label>Expiry date</label><input type="date" id="q-expiresAt" value="${s.expiresAt || ''}"/></div>
    </div>
    <div class="field">
      <label>Language</label>
      <select id="q-language" disabled><option>English (US)</option></select>
    </div>

    <div style="font-weight:600; font-size:13px; margin: 18px 0 10px 0;">Line items</div>
    <div id="qlines">${s.lines.map((l, i) => quoteLineHtml(l, i)).join('')}</div>
    <button type="button" class="btn outline small" id="q-add-line">${icon('plus', 13)} Add line</button>

    <div class="card" style="margin-top:18px;">
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
    </div>

    <div class="field" style="margin-top:18px;">
      <label>Notes</label>
      <textarea id="q-notes" rows="3" placeholder="Anything to remember about this quote...">${escapeHtml(s.notes || '')}</textarea>
    </div>
  `;
}

function quoteRightHtml() {
  const s = quoteFormState;
  return `
    <div class="calc-row"><span class="calc-label">Material</span><span id="calc-material">$0.00</span></div>
    <div class="calc-row"><span class="calc-label">Electricity</span><span id="calc-electricity">$0.00</span></div>
    <div class="calc-row"><span class="calc-label">Labor</span><span id="calc-labor">$0.00</span></div>
    <div class="calc-row"><span class="calc-label" id="calc-waste-label">Waste (${s.wasteEnabled ? (s.wastePercent || 0) : 0}%)</span><span id="calc-waste">$0.00</span></div>
    <div class="calc-row"><span class="calc-label" id="calc-overhead-label">Overhead (${s.overheadEnabled ? (s.overheadPercent || 0) : 0}%)</span><span id="calc-overhead">$0.00</span></div>
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
      <button type="button" class="btn" id="q-submit" style="width:100%; margin-top:12px; justify-content:center;">${quoteFormIsEdit ? 'Save quote' : 'Create quote'}</button>
      <button type="button" class="btn ghost" id="q-cancel" style="width:100%; margin-top:4px; justify-content:center;">Cancel</button>
    </div>
  `;
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

function wireQuoteModalEvents() {
  const s = quoteFormState;
  const byId = (id) => document.getElementById(id);

  byId('q-customerId').onchange = (e) => { s.customerId = e.target.value; };
  byId('q-status').onchange = (e) => { s.status = e.target.value; };
  byId('q-issuedAt').onchange = (e) => { s.issuedAt = e.target.value; };
  byId('q-expiresAt').onchange = (e) => { s.expiresAt = e.target.value; };
  byId('q-notes').oninput = (e) => { s.notes = e.target.value; };

  const qlines = byId('qlines');
  qlines.addEventListener('input', (e) => {
    const field = e.target.dataset.field;
    if (!field) return;
    const row = e.target.closest('[data-line-idx]');
    const idx = Number(row.dataset.lineIdx);
    s.lines[idx][field] = e.target.value;
    recalcAndPatchQuote();
  });
  qlines.addEventListener('change', (e) => {
    if (e.target.dataset.field) recalcAndPatchQuote();
  });
  qlines.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-line]');
    if (!btn) return;
    const idx = Number(btn.dataset.removeLine);
    if (s.lines.length <= 1) { s.lines[idx] = newQuoteLine(); renderQuoteModal(); return; }
    s.lines.splice(idx, 1);
    renderQuoteModal();
  });

  byId('q-add-line').onclick = () => { s.lines.push(newQuoteLine()); renderQuoteModal(); };

  byId('q-laborEnabled').onchange = (e) => { s.laborEnabled = e.target.checked; renderQuoteModal(); };
  byId('q-wasteEnabled').onchange = (e) => { s.wasteEnabled = e.target.checked; renderQuoteModal(); };
  byId('q-overheadEnabled').onchange = (e) => { s.overheadEnabled = e.target.checked; renderQuoteModal(); };

  const wasteSlider = byId('q-wastePercent');
  if (wasteSlider) wasteSlider.oninput = (e) => { s.wastePercent = Number(e.target.value); recalcAndPatchQuote(); };
  const overheadSlider = byId('q-overheadPercent');
  if (overheadSlider) overheadSlider.oninput = (e) => { s.overheadPercent = Number(e.target.value); recalcAndPatchQuote(); };

  byId('q-marginPercent').oninput = (e) => { s.marginPercent = Number(e.target.value); recalcAndPatchQuote(); };
  byId('q-discountValue').oninput = (e) => { s.discountValue = Number(e.target.value); recalcAndPatchQuote(); };
  byId('q-taxPercent').oninput = (e) => { s.taxPercent = Number(e.target.value); recalcAndPatchQuote(); };
  byId('q-taxExempt').onchange = (e) => { s.taxExempt = e.target.checked; recalcAndPatchQuote(); };

  byId('q-discount-pct').onclick = () => { s.discountType = 'percent'; byId('q-discount-pct').classList.add('active'); byId('q-discount-usd').classList.remove('active'); recalcAndPatchQuote(); };
  byId('q-discount-usd').onclick = () => { s.discountType = 'usd'; byId('q-discount-usd').classList.add('active'); byId('q-discount-pct').classList.remove('active'); recalcAndPatchQuote(); };

  byId('q-cancel').onclick = closeModal;
  byId('q-submit').onclick = async () => {
    const calc = recalcAndPatchQuote();
    const payload = {
      quoteNumber: s.quoteNumber || nextNumber('quoteNumberPrefix', state.quotes, 'quoteNumber'),
      customerId: s.customerId || null,
      status: s.status,
      issuedAt: s.issuedAt || null,
      expiresAt: s.expiresAt || null,
      language: 'English (US)',
      lines: s.lines,
      laborEnabled: s.laborEnabled,
      wasteEnabled: s.wasteEnabled, wastePercent: s.wastePercent,
      overheadEnabled: s.overheadEnabled, overheadPercent: s.overheadPercent,
      marginPercent: s.marginPercent,
      discountType: s.discountType, discountValue: s.discountValue,
      taxPercent: s.taxPercent, taxExempt: s.taxExempt,
      notes: s.notes,
      materialCost: calc.material, electricityCost: calc.electricity, laborCost: calc.labor,
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
      await navigate('quotes');
    } catch (err) {
      showToast(err.message, true);
    }
  };
}

function openQuoteModal(existing) {
  quoteFormIsEdit = !!existing;
  quoteFormState = existing ? {
    id: existing.id,
    quoteNumber: existing.quoteNumber || null,
    customerId: existing.customerId || '',
    status: existing.status || 'draft',
    issuedAt: existing.issuedAt ? existing.issuedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
    expiresAt: existing.expiresAt ? existing.expiresAt.slice(0, 10) : '',
    lines: existing.lines && existing.lines.length ? existing.lines.map((l) => ({ ...l })) : [newQuoteLine()],
    laborEnabled: existing.laborEnabled !== false,
    wasteEnabled: !!existing.wasteEnabled, wastePercent: existing.wastePercent ?? 0,
    overheadEnabled: !!existing.overheadEnabled, overheadPercent: existing.overheadPercent ?? 0,
    marginPercent: existing.marginPercent ?? (state.settings.defaultMarginPercent ?? 0),
    discountType: existing.discountType || 'percent', discountValue: existing.discountValue ?? 0,
    taxPercent: existing.taxPercent ?? 0, taxExempt: !!existing.taxExempt,
    notes: existing.notes || '',
  } : {
    quoteNumber: null,
    customerId: '', status: 'draft',
    issuedAt: new Date().toISOString().slice(0, 10), expiresAt: '',
    lines: [newQuoteLine()],
    laborEnabled: true, wasteEnabled: false, wastePercent: 0,
    overheadEnabled: false, overheadPercent: 0,
    marginPercent: state.settings.defaultMarginPercent ?? 30,
    discountType: 'percent', discountValue: 0,
    taxPercent: 0, taxExempt: false,
    notes: '',
  };
  renderQuoteModal();
}

// ---------- Quotes list page ----------

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
    <div class="card" id="quotes-table"></div>
  `;

  const rows = state.quotes.map((q) => `
    <tr>
      <td>${escapeHtml(q.quoteNumber || '—')}</td>
      <td>${escapeHtml(customerName(q.customerId))}</td>
      <td>${badge(q.status, q.status)}</td>
      <td>${fmtDate(q.issuedAt || q.createdAt)}</td>
      <td>${money(q.total)}</td>
      <td>
        <div class="row-actions">
          <button class="btn outline small" data-edit-quote="${q.id}">${icon('edit', 13)}</button>
          <button class="btn outline small" data-del-quote="${q.id}">${icon('trash', 13)}</button>
        </div>
      </td>
    </tr>
  `).join('');

  document.getElementById('quotes-table').innerHTML = state.quotes.length ? `
    <table><thead><tr><th>Quote</th><th>Customer</th><th>Status</th><th>Issued</th><th>Total</th><th></th></tr></thead><tbody>${rows}</tbody></table>
  ` : `<div class="empty-state">No quotes yet. Create your first quote to price up a print job.</div>`;

  state.quotes.forEach((q) => {
    const editBtn = document.querySelector(`[data-edit-quote="${q.id}"]`);
    const delBtn = document.querySelector(`[data-del-quote="${q.id}"]`);
    if (editBtn) editBtn.onclick = () => openQuoteModal(q);
    if (delBtn) delBtn.onclick = async () => {
      if (!confirm('Delete this quote?')) return;
      await api('DELETE', `/api/quotes/${q.id}`);
      showToast('Quote deleted');
      await renderQuotes();
    };
  });

  document.getElementById('add-quote').onclick = () => openQuoteModal();
}

registerPage('quotes', renderQuotes);
