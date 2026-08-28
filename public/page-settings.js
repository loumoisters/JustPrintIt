// public/page-settings.js

let settingsTab = 'general';

const SETTINGS_NAV = [
  { group: 'Workspace', items: [
    { key: 'general', label: 'General' },
    { key: 'whitelabel', label: 'White Labeling' },
    { key: 'documents', label: 'Documents' },
    { key: 'quoting', label: 'Quoting' },
    { key: 'statuses', label: 'Item Statuses' },
    { key: 'numbering', label: 'Numbering' },
    { key: 'ai', label: 'AI' },
  ] },
  { group: 'Personal', items: [
    { key: 'account', label: 'Account' },
    { key: 'billing', label: 'Billing' },
    { key: 'team', label: 'Team' },
    { key: 'whatsnew', label: "What's New" },
  ] },
  { group: 'Admin', items: [
    { key: 'activity', label: 'Activity' },
    { key: 'integrations', label: 'Integrations' },
    { key: 'data', label: 'Data' },
    { key: 'developer', label: 'Developer' },
    { key: 'danger', label: 'Danger zone' },
  ] },
];

const IMPLEMENTED_TABS = new Set(['general', 'quoting', 'numbering']);

async function saveSettingsField(e, fields) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const patch = {};
  for (const f of fields) {
    let v = formData.get(f.name);
    if (f.type === 'number') v = v === '' ? null : Number(v);
    patch[f.name] = v;
  }
  try {
    state.settings = await api('PUT', '/api/settings', patch);
    showToast('Settings saved');
    initShell();
  } catch (err) {
    showToast(err.message, true);
  }
}

function settingsFieldHtml(f, val) {
  if (f.type === 'select') {
    const opts = f.options.map((o) => `<option value="${escapeHtml(o)}" ${o === val ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('');
    return `<div class="field"><label>${f.label}</label><select name="${f.name}">${opts}</select></div>`;
  }
  return `<div class="field"><label>${f.label}</label><input name="${f.name}" type="${f.type || 'text'}" ${f.step ? `step="${f.step}"` : ''} value="${escapeHtml(val ?? '')}"/></div>`;
}

function renderFormCard(title, subtitle, fields) {
  const s = state.settings;
  return `
    <div class="card">
      <div style="font-weight:600; margin-bottom:2px;">${title}</div>
      <div class="muted" style="font-size:12.5px; margin-bottom:16px;">${subtitle}</div>
      <form data-settings-form>
        ${fields.map((f) => settingsFieldHtml(f, s[f.name])).join('')}
        <button type="submit" class="btn brand">Save changes</button>
      </form>
    </div>
  `;
}

function stubCard(label) {
  return `
    <div class="card">
      <div style="font-weight:600; margin-bottom:4px;">${label}</div>
      <p class="muted" style="font-size:12.5px; margin:0;">This is a SaaS-only feature in the original app (accounts, billing, team seats, etc). Not applicable to this self-hosted, single-user build - stubbed here for layout fidelity.</p>
    </div>
  `;
}

async function renderSettings() {
  const main = document.getElementById('main');

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Manage your workspace, quoting defaults, and account.</p>
      </div>
    </div>
    <div class="settings-layout">
      <div class="settings-nav" id="settings-nav"></div>
      <div class="settings-content" id="settings-content"></div>
    </div>
  `;

  const nav = document.getElementById('settings-nav');
  nav.innerHTML = SETTINGS_NAV.map((g) => `
    <div class="settings-nav-label">${g.group}</div>
    ${g.items.map((it) => `<div class="settings-nav-item ${settingsTab === it.key ? 'active' : ''}" data-tab="${it.key}">${it.label}</div>`).join('')}
  `).join('');
  nav.querySelectorAll('.settings-nav-item').forEach((el) => {
    el.onclick = () => { settingsTab = el.dataset.tab; renderSettings(); };
  });

  const content = document.getElementById('settings-content');
  const s = state.settings;

  if (settingsTab === 'general') {
    content.innerHTML = `
      ${renderFormCard('Business info', "Your shop's name, logo, and contact details.", [
        { name: 'workspaceName', label: 'Workspace name' },
        { name: 'contactEmail', label: 'Contact email' },
        { name: 'contactPhone', label: 'Contact phone' },
        { name: 'identifierLabel', label: 'Identifier label' },
      ])}
      ${renderFormCard('Localization', 'Currency, region, and formats.', [
        { name: 'currency', label: 'Currency', type: 'select', options: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] },
        { name: 'country', label: 'Country' },
        { name: 'timezone', label: 'Timezone' },
        { name: 'dateFormat', label: 'Date format' },
      ])}
    `;
  } else if (settingsTab === 'quoting') {
    content.innerHTML = renderFormCard('Quoting defaults', 'Used to price up new quotes automatically.', [
      { name: 'hourlyRate', label: 'Machine hourly rate ($/hr)', type: 'number', step: '0.01' },
      { name: 'electricityRatePerKwh', label: 'Electricity rate ($/kWh)', type: 'number', step: '0.001' },
      { name: 'defaultMarginPercent', label: 'Default margin (%)', type: 'number' },
    ]);
  } else if (settingsTab === 'numbering') {
    content.innerHTML = renderFormCard('Document numbering', 'Prefixes used for auto-generated quote, order, and invoice numbers.', [
      { name: 'quoteNumberPrefix', label: 'Quote prefix' },
      { name: 'orderNumberPrefix', label: 'Order prefix' },
      { name: 'invoiceNumberPrefix', label: 'Invoice prefix' },
    ]);
  } else {
    const label = SETTINGS_NAV.flatMap((g) => g.items).find((it) => it.key === settingsTab)?.label || settingsTab;
    content.innerHTML = stubCard(label);
  }

  content.querySelectorAll('[data-settings-form]').forEach((form) => {
    const fields = Array.from(form.querySelectorAll('[name]')).map((el) => ({ name: el.name, type: el.type === 'number' ? 'number' : 'text' }));
    form.onsubmit = (e) => saveSettingsField(e, fields);
  });
}

registerPage('settings', renderSettings);
