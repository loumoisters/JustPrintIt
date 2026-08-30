// public/page-settings.js

let settingsTab = 'general';

const SETTINGS_NAV = [
  { group: 'Workspace', items: [
    { key: 'general', label: 'General' },
    { key: 'appearance', label: 'Appearance' },
    { key: 'whitelabel', label: 'White Labeling' },
    { key: 'documents', label: 'Documents' },
    { key: 'quoting', label: 'Quoting' },
    { key: 'statuses', label: 'Item Statuses' },
    { key: 'numbering', label: 'Numbering' },
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

const IMPLEMENTED_TABS = new Set(['general', 'appearance', 'whitelabel', 'quoting', 'numbering', 'danger', 'developer', 'data', 'whatsnew']);

const TRASH_COLLECTION_LABELS = {
  customers: 'Customer', quotes: 'Quote', orders: 'Order', invoices: 'Invoice',
  printers: 'Printer', maintenanceSchedules: 'Maintenance schedule', maintenanceLog: 'Maintenance log entry',
  spools: 'Filament spool', products: 'Product', inventoryItems: 'Inventory item',
  expenses: 'Expense', quoteRequests: 'Quote request',
};

// Deleted records span every collection, each with its own shape - there's
// no single field guaranteed to exist. Try the fields that read as a
// meaningful title on most of them, in order, before falling back to the id.
function trashItemLabel(record) {
  return record.name || record.task || record.workspaceName || record.model
    || record.sku || record.category || `#${String(record.id || '').slice(0, 8)}`;
}

// Curated, modern, clean sans (and one serif) stacks built entirely from
// fonts already shipped with major OSes - no webfont/CDN loading, so this
// stays true to the app's zero-external-dependency, self-hosted design.
const FONT_PRESETS = [
  { value: '', label: 'System default', preview: '-apple-system, BlinkMacSystemFont, "Segoe UI", ui-sans-serif, system-ui, sans-serif' },
  { value: '"Helvetica Neue", Helvetica, Arial, sans-serif', label: 'Helvetica / Arial' },
  { value: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif', label: 'Segoe UI' },
  { value: '"Avenir Next", Avenir, "Century Gothic", "Segoe UI", sans-serif', label: 'Avenir (rounded)' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Georgia (serif)' },
];

// Plain country names (value === label, like the currency dropdown) - the
// stored value ("United States", etc.) already matches these exactly, so
// existing data doesn't need a migration.
const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Australia',
  'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium',
  'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei',
  'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon', 'Canada', 'Cape Verde',
  'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Costa Rica',
  'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Denmark', 'Djibouti', 'Dominica',
  'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea',
  'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia',
  'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana',
  'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland',
  'Israel', 'Italy', 'Ivory Coast', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya',
  'Kiribati', 'Kosovo', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia',
  'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia',
  'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico',
  'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique',
  'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger',
  'Nigeria', 'North Korea', 'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Palestine',
  'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar',
  'Romania', 'Russia', 'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia',
  'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe',
  'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia',
  'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain',
  'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan',
  'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia',
  'Turkey', 'Turkmenistan', 'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates',
  'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu', 'Vatican City',
  'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
];

// {value, label} pairs: value is a real IANA zone name (so it's a stable,
// unambiguous identifier if this ever feeds real date/time math later),
// label is the friendlier text people actually recognize. Offsets shown are
// standard (non-DST) time, same convention most timezone pickers use.
const TIMEZONES = [
  { value: 'Pacific/Midway', label: '(UTC-11:00) Midway Island, Samoa' },
  { value: 'Pacific/Honolulu', label: '(UTC-10:00) Hawaii' },
  { value: 'America/Anchorage', label: '(UTC-09:00) Alaska' },
  { value: 'America/Los_Angeles', label: '(UTC-08:00) Pacific Time (US & Canada)' },
  { value: 'America/Phoenix', label: '(UTC-07:00) Arizona' },
  { value: 'America/Denver', label: '(UTC-07:00) Mountain Time (US & Canada)' },
  { value: 'America/Chicago', label: '(UTC-06:00) Central Time (US & Canada)' },
  { value: 'America/Mexico_City', label: '(UTC-06:00) Mexico City' },
  { value: 'America/New_York', label: '(UTC-05:00) Eastern Time (US & Canada)' },
  { value: 'America/Bogota', label: '(UTC-05:00) Bogota, Lima' },
  { value: 'America/Halifax', label: '(UTC-04:00) Atlantic Time (Canada)' },
  { value: 'America/Santiago', label: '(UTC-04:00) Santiago' },
  { value: 'America/Argentina/Buenos_Aires', label: '(UTC-03:00) Buenos Aires' },
  { value: 'America/Sao_Paulo', label: '(UTC-03:00) Sao Paulo' },
  { value: 'Atlantic/Azores', label: '(UTC-01:00) Azores' },
  { value: 'UTC', label: '(UTC+00:00) UTC' },
  { value: 'Europe/London', label: '(UTC+00:00) London, Dublin, Lisbon' },
  { value: 'Europe/Paris', label: '(UTC+01:00) Paris, Berlin, Madrid' },
  { value: 'Africa/Lagos', label: '(UTC+01:00) Lagos' },
  { value: 'Africa/Cairo', label: '(UTC+02:00) Cairo' },
  { value: 'Europe/Athens', label: '(UTC+02:00) Athens, Helsinki' },
  { value: 'Africa/Johannesburg', label: '(UTC+02:00) Johannesburg' },
  { value: 'Europe/Moscow', label: '(UTC+03:00) Moscow' },
  { value: 'Africa/Nairobi', label: '(UTC+03:00) Nairobi' },
  { value: 'Asia/Tehran', label: '(UTC+03:30) Tehran' },
  { value: 'Asia/Dubai', label: '(UTC+04:00) Dubai' },
  { value: 'Asia/Karachi', label: '(UTC+05:00) Karachi' },
  { value: 'Asia/Kolkata', label: '(UTC+05:30) Mumbai, New Delhi' },
  { value: 'Asia/Dhaka', label: '(UTC+06:00) Dhaka' },
  { value: 'Asia/Bangkok', label: '(UTC+07:00) Bangkok, Jakarta' },
  { value: 'Asia/Shanghai', label: '(UTC+08:00) Beijing, Shanghai' },
  { value: 'Asia/Singapore', label: '(UTC+08:00) Singapore' },
  { value: 'Australia/Perth', label: '(UTC+08:00) Perth' },
  { value: 'Asia/Tokyo', label: '(UTC+09:00) Tokyo, Seoul' },
  { value: 'Australia/Adelaide', label: '(UTC+09:30) Adelaide' },
  { value: 'Australia/Sydney', label: '(UTC+10:00) Sydney, Melbourne' },
  { value: 'Australia/Brisbane', label: '(UTC+10:00) Brisbane' },
  { value: 'Pacific/Auckland', label: '(UTC+12:00) Auckland' },
];

const NUMBERING_ROWS = [
  { label: 'Orders', prefixKey: 'orderNumberPrefix', collection: 'orders', field: 'orderNumber' },
  { label: 'Quotes', prefixKey: 'quoteNumberPrefix', collection: 'quotes', field: 'quoteNumber' },
  { label: 'Invoices', prefixKey: 'invoiceNumberPrefix', collection: 'invoices', field: 'invoiceNumber' },
  { label: 'Customers', prefixKey: 'customerNumberPrefix', collection: 'customers', field: 'customerNumber' },
  { label: 'Filaments', prefixKey: 'filamentNumberPrefix', collection: 'spools', field: 'spoolNumber' },
];

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
    // Options are either plain strings (value and label are the same,
    // e.g. currency codes) or {value, label} objects for cases like
    // Timezone, where the stored value should be a stable IANA zone name
    // but the displayed text is a friendlier "(UTC-05:00) Eastern Time".
    const opts = f.options.map((o) => {
      const value = typeof o === 'string' ? o : o.value;
      const label = typeof o === 'string' ? o : o.label;
      return `<option value="${escapeHtml(value)}" ${value === val ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
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
    ${g.items.map((it) => `<div class="settings-nav-item ${settingsTab === it.key ? 'active' : ''} ${IMPLEMENTED_TABS.has(it.key) ? '' : 'settings-nav-item-stub'}" data-tab="${it.key}">${it.label}</div>`).join('')}
  `).join('');
  nav.querySelectorAll('.settings-nav-item').forEach((el) => {
    el.onclick = () => { settingsTab = el.dataset.tab; renderSettings(); };
  });

  const content = document.getElementById('settings-content');
  const s = state.settings;

  if (settingsTab === 'general') {
    content.innerHTML = `
      ${renderFormCard('Your account', 'Shown in the sidebar - not used for login, just display.', [
        { name: 'yourName', label: 'Your name' },
      ])}
      ${renderFormCard('Business info', "Your shop's name, logo, and contact details.", [
        { name: 'workspaceName', label: 'Workspace name' },
        { name: 'contactEmail', label: 'Contact email' },
        { name: 'contactPhone', label: 'Contact phone' },
        { name: 'identifierLabel', label: 'Identifier label' },
      ])}
      ${renderFormCard('Localization', 'Currency, region, and formats.', [
        { name: 'currency', label: 'Currency', type: 'select', options: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] },
        { name: 'country', label: 'Country', type: 'select', options: COUNTRIES },
        { name: 'timezone', label: 'Timezone', type: 'select', options: TIMEZONES },
        { name: 'dateFormat', label: 'Date format' },
      ])}
    `;
  } else if (settingsTab === 'appearance') {
    const defaultAccentSwatch = '#e2793c';
    content.innerHTML = `
      <div class="card">
        <div style="font-weight:600; margin-bottom:2px;">Appearance</div>
        <div class="muted" style="font-size:12.5px; margin-bottom:16px;">Visual defaults for everyone in this workspace. The moon icon in the top bar always lets a person override light/dark and the sidebar state just for their own browser.</div>

        <div class="field">
          <label>Accent color</label>
          <div style="display:flex; gap:8px; align-items:center;">
            ${colorSwatchPickerHtml('ap-accent', s.accentColor || defaultAccentSwatch)}
            <button type="button" class="btn ghost small" id="ap-accent-reset" style="padding:2px 6px; font-size:11px;">Reset to default</button>
          </div>
          <div class="field-hint">${s.accentColor ? 'Custom color set.' : 'Using the default color - pick one above to customize.'} Colors "brand" buttons, active tabs, and highlighted selections across the app.</div>
        </div>

        <div class="field">
          <label>Density</label>
          <div class="discount-type-toggle">
            <button type="button" id="ap-density-comfortable" class="${(s.density || 'comfortable') === 'comfortable' ? 'active' : ''}">Comfortable</button>
            <button type="button" id="ap-density-compact" class="${s.density === 'compact' ? 'active' : ''}">Compact</button>
          </div>
          <div class="field-hint">Compact tightens table rows and card padding for denser screens.</div>
        </div>

        <div class="field">
          <label>Font</label>
          <select id="ap-font-preset">
            ${FONT_PRESETS.map((f) => `<option value="${escapeHtml(f.value)}" style="font-family: ${escapeHtml(f.preview || f.value)};" ${f.value === (s.fontFamily || '') ? 'selected' : ''}>${escapeHtml(f.label)}</option>`).join('')}
          </select>
          <div class="field-hint">Each option previews in its own font. All presets use clean, modern fonts already built into your OS - no external font loading, so this keeps working offline.</div>
        </div>

        <div class="field">
          <label>Default theme</label>
          <div class="discount-type-toggle">
            <button type="button" id="ap-theme-light" class="${s.defaultTheme === 'light' ? 'active' : ''}">Light</button>
            <button type="button" id="ap-theme-dark" class="${s.defaultTheme === 'dark' ? 'active' : ''}">Dark</button>
            <button type="button" id="ap-theme-system" class="${(s.defaultTheme || 'system') === 'system' ? 'active' : ''}">Match system</button>
          </div>
          <div class="field-hint">Used the first time someone opens the app on a given browser, before they've toggled the moon icon themselves.</div>
        </div>

        <div class="field" style="margin-bottom:0;">
          <label>Default sidebar state</label>
          <div class="discount-type-toggle">
            <button type="button" id="ap-sidebar-expanded" class="${!s.defaultSidebarCollapsed ? 'active' : ''}">Expanded</button>
            <button type="button" id="ap-sidebar-collapsed" class="${s.defaultSidebarCollapsed ? 'active' : ''}">Collapsed</button>
          </div>
        </div>

        <button type="button" class="btn brand" id="ap-save" style="margin-top:16px;">Save changes</button>
      </div>
    `;

    let pendingAccentColor = s.accentColor || '';
    let pendingDensity = s.density || 'comfortable';
    let pendingTheme = s.defaultTheme || 'system';
    let pendingSidebarCollapsed = !!s.defaultSidebarCollapsed;
    let pendingFontFamily = s.fontFamily || '';

    const fontPresetSelect = document.getElementById('ap-font-preset');
    // Match the closed <select>'s own text to whichever option is selected,
    // so the picker previews the chosen font even before it's applied.
    const syncFontSelectPreview = () => {
      const match = FONT_PRESETS.find((f) => f.value === fontPresetSelect.value);
      fontPresetSelect.style.fontFamily = (match && (match.preview || match.value)) || '';
    };
    syncFontSelectPreview();
    fontPresetSelect.onchange = () => {
      pendingFontFamily = fontPresetSelect.value;
      syncFontSelectPreview();
    };

    wireColorSwatchPicker('ap-accent', (hex) => { pendingAccentColor = hex; });
    document.getElementById('ap-accent-reset').onclick = () => {
      pendingAccentColor = '';
      const { r, g, b } = hexToRgb(defaultAccentSwatch);
      document.getElementById('ap-accent-native').value = defaultAccentSwatch;
      document.getElementById('ap-accent-hex').value = defaultAccentSwatch;
      document.getElementById('ap-accent-r').value = r;
      document.getElementById('ap-accent-g').value = g;
      document.getElementById('ap-accent-b').value = b;
    };

    const densityBtns = { comfortable: document.getElementById('ap-density-comfortable'), compact: document.getElementById('ap-density-compact') };
    Object.entries(densityBtns).forEach(([val, btn]) => {
      btn.onclick = () => { pendingDensity = val; Object.entries(densityBtns).forEach(([v, b]) => b.classList.toggle('active', v === val)); };
    });

    const themeBtns = { light: document.getElementById('ap-theme-light'), dark: document.getElementById('ap-theme-dark'), system: document.getElementById('ap-theme-system') };
    Object.entries(themeBtns).forEach(([val, btn]) => {
      btn.onclick = () => { pendingTheme = val; Object.entries(themeBtns).forEach(([v, b]) => b.classList.toggle('active', v === val)); };
    });

    const sidebarBtns = { false: document.getElementById('ap-sidebar-expanded'), true: document.getElementById('ap-sidebar-collapsed') };
    Object.entries(sidebarBtns).forEach(([val, btn]) => {
      btn.onclick = () => { pendingSidebarCollapsed = val === 'true'; Object.entries(sidebarBtns).forEach(([v, b]) => b.classList.toggle('active', v === String(pendingSidebarCollapsed))); };
    });

    document.getElementById('ap-save').onclick = async () => {
      try {
        state.settings = await api('PUT', '/api/settings', {
          accentColor: pendingAccentColor,
          density: pendingDensity,
          defaultTheme: pendingTheme,
          defaultSidebarCollapsed: pendingSidebarCollapsed,
          fontFamily: pendingFontFamily,
        });
        showToast('Appearance saved');
        initShell();
      } catch (err) {
        showToast(err.message, true);
      }
    };
  } else if (settingsTab === 'whitelabel') {
    content.innerHTML = `
      <details class="card" open>
        <summary>Brand Name</summary>
        <div class="details-body">
          <div class="field">
            <label>Brand name</label>
            <input type="text" id="wl-brandName" value="${escapeHtml(s.brandName || '')}" placeholder="JustPrintIt" maxlength="30"/>
            <div class="field-hint"><span id="wl-brandName-count">${(s.brandName || '').length}</span>/30 characters</div>
          </div>
          <button type="button" class="btn brand" id="wl-brandName-save">Save changes</button>
        </div>
      </details>
      <details class="card" style="margin-top:16px;" open>
        <summary>Brand Icon</summary>
        <div class="details-body">
          <div style="display:flex; align-items:center; gap:16px;">
            <div class="brand-icon-preview" id="wl-icon-preview">${s.brandIconUrl ? `<img src="${s.brandIconUrl}" alt=""/>` : 'JP'}</div>
            <div>
              <input type="file" id="wl-icon-file" accept="image/png,image/jpeg,image/webp" style="display:none;"/>
              <button type="button" class="btn outline small" id="wl-icon-upload-btn">${icon('upload', 13)} Upload icon</button>
              <div class="muted" style="font-size:11.5px; margin-top:6px;">PNG, JPG, or WEBP. Up to 5MB.</div>
            </div>
          </div>
          <div style="display:flex; gap:8px; margin-top:14px;">
            <button type="button" class="btn brand" id="wl-icon-save">Save changes</button>
            <button type="button" class="btn ghost" id="wl-icon-remove" ${!s.brandIconUrl ? 'disabled' : ''}>Remove icon</button>
          </div>
        </div>
      </details>
    `;

    let pendingIconDataUrl = s.brandIconUrl || '';

    const brandNameInput = document.getElementById('wl-brandName');
    brandNameInput.oninput = () => {
      document.getElementById('wl-brandName-count').textContent = brandNameInput.value.length;
    };
    document.getElementById('wl-brandName-save').onclick = async () => {
      const val = brandNameInput.value.trim().slice(0, 30);
      try {
        state.settings = await api('PUT', '/api/settings', { brandName: val || 'JustPrintIt' });
        showToast('Brand name saved');
        initShell();
      } catch (err) {
        showToast(err.message, true);
      }
    };

    const iconFileInput = document.getElementById('wl-icon-file');
    const iconPreview = document.getElementById('wl-icon-preview');
    document.getElementById('wl-icon-upload-btn').onclick = () => iconFileInput.click();
    iconFileInput.onchange = async () => {
      const file = iconFileInput.files && iconFileInput.files[0];
      if (!file) return;
      const okTypes = ['image/png', 'image/jpeg', 'image/webp'];
      if (!okTypes.includes(file.type)) {
        showToast('Please choose a PNG, JPG, or WEBP file', true);
        iconFileInput.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast('Icon must be 5MB or smaller', true);
        iconFileInput.value = '';
        return;
      }
      try {
        // Downscaled/cropped to a fixed square so a huge photo doesn't
        // bloat storage or spill out of the small logo area it renders in.
        pendingIconDataUrl = await resizeImageFileToDataUrl(file, 128);
        iconPreview.innerHTML = `<img src="${pendingIconDataUrl}" alt=""/>`;
      } catch (err) {
        showToast(err.message, true);
      }
    };

    document.getElementById('wl-icon-save').onclick = async () => {
      try {
        state.settings = await api('PUT', '/api/settings', { brandIconUrl: pendingIconDataUrl });
        showToast('Brand icon saved');
        initShell();
        renderSettings();
      } catch (err) {
        showToast(err.message, true);
      }
    };
    document.getElementById('wl-icon-remove').onclick = async () => {
      pendingIconDataUrl = '';
      try {
        state.settings = await api('PUT', '/api/settings', { brandIconUrl: '' });
        showToast('Brand icon removed');
        initShell();
        renderSettings();
      } catch (err) {
        showToast(err.message, true);
      }
    };
  } else if (settingsTab === 'quoting') {
    content.innerHTML = `
      ${renderFormCard('Quoting defaults', 'Used to price up new quotes automatically.', [
        { name: 'electricityRatePerKwh', label: 'Electricity rate (per kWh)', type: 'number', step: '0.001' },
        { name: 'defaultMarginPercent', label: 'Default margin', type: 'number' },
        { name: 'hourlyRate', label: 'Labor rate (per hour)', type: 'number', step: '0.01' },
        { name: 'defaultWastePercent', label: 'Default waste %', type: 'number' },
        { name: 'defaultOverheadPercent', label: 'Default overhead %', type: 'number' },
      ])}
      <div class="card" style="margin-top:16px;">
        <div style="font-weight:600; margin-bottom:2px;">Tax</div>
        <div class="muted" style="font-size:12.5px; margin-bottom:16px;">Applied automatically to new quotes. Set to 0 to disable.</div>
        <div class="field">
          <label>Default VAT / tax rate (%)</label>
          <input type="number" id="tax-rate-input" step="0.01" min="0" max="100" value="${(s.defaultTaxBasisPoints || 0) / 100}"/>
        </div>
        <div class="field-hint" style="margin-bottom:14px;">Stored in basis points internally. Enter a percentage, e.g. 20 for 20% VAT.</div>
        <button type="button" class="btn brand" id="tax-rate-save">Save changes</button>
      </div>
    `;
    document.getElementById('tax-rate-save').onclick = async () => {
      const pct = Number(document.getElementById('tax-rate-input').value) || 0;
      try {
        state.settings = await api('PUT', '/api/settings', { defaultTaxBasisPoints: Math.round(pct * 100) });
        showToast('Tax settings saved');
      } catch (err) {
        showToast(err.message, true);
      }
    };
  } else if (settingsTab === 'numbering') {
    const rows = NUMBERING_ROWS.map((r) => {
      const prefix = s[r.prefixKey] || '';
      const next = nextNumberForPrefix(prefix, state[r.collection] || [], r.field);
      const doc = `${prefix}${String(next).padStart(4, '0')}`;
      return `
        <tr data-numbering-row="${r.prefixKey}">
          <td>${r.label}</td>
          <td><input type="text" data-prefix-input="${r.prefixKey}" value="${escapeHtml(prefix)}" style="width:100px;"/></td>
          <td data-next-number>${next}</td>
          <td data-next-doc class="muted">${escapeHtml(doc)}</td>
        </tr>
      `;
    }).join('');
    content.innerHTML = `
      <div class="card">
        <div style="font-weight:600; margin-bottom:2px;">Document numbering</div>
        <div class="muted" style="font-size:12.5px; margin-bottom:16px;">Prefixes used for auto-generated document numbers, and a preview of what's next.</div>
        <table>
          <thead><tr><th>Type</th><th>Prefix</th><th>Next number</th><th>Next document</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <button type="button" class="btn brand" id="numbering-save" style="margin-top:16px;">Save changes</button>
      </div>
    `;
    content.querySelectorAll('[data-prefix-input]').forEach((input) => {
      input.oninput = () => {
        const row = input.closest('[data-numbering-row]');
        const rowDef = NUMBERING_ROWS.find((r) => r.prefixKey === input.dataset.prefixInput);
        const nextEl = row.querySelector('[data-next-number]');
        const docEl = row.querySelector('[data-next-doc]');
        const next = nextNumberForPrefix(input.value, state[rowDef.collection] || [], rowDef.field);
        nextEl.textContent = next;
        docEl.textContent = `${input.value}${String(next).padStart(4, '0')}`;
      };
    });
    document.getElementById('numbering-save').onclick = async () => {
      const patch = {};
      content.querySelectorAll('[data-prefix-input]').forEach((input) => {
        patch[input.dataset.prefixInput] = input.value;
      });
      try {
        state.settings = await api('PUT', '/api/settings', patch);
        showToast('Numbering settings saved');
        renderSettings();
      } catch (err) {
        showToast(err.message, true);
      }
    };
  } else if (settingsTab === 'data') {
    const trash = await api('GET', '/api/trash').catch(() => []);
    content.innerHTML = `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <div style="font-weight:600; margin-bottom:2px;">Recently deleted</div>
            <p class="muted" style="font-size:12.5px; margin:0;">
              Anything deleted anywhere in the app - customers, quotes, orders, printers, all of it - lands here
              first instead of disappearing outright. Restore it, or delete it permanently. The last 200 deletions
              are kept.
            </p>
          </div>
          ${trash.length ? `<button type="button" class="btn outline small" id="trash-empty-btn">Empty trash</button>` : ''}
        </div>
        ${trash.length ? `
          <table style="margin-top:14px;">
            <thead><tr><th>Type</th><th>Item</th><th>Deleted</th><th></th></tr></thead>
            <tbody>
              ${trash.map((t) => `
                <tr>
                  <td>${escapeHtml(TRASH_COLLECTION_LABELS[t.collection] || t.collection)}</td>
                  <td>${escapeHtml(String(trashItemLabel(t.record)))}</td>
                  <td class="muted">${escapeHtml(fmtDateTime(t.deletedAt))}</td>
                  <td>
                    <div class="row-actions">
                      <button type="button" class="btn outline small" data-restore-trash="${t.id}">Restore</button>
                      <button type="button" class="btn outline small" data-purge-trash="${t.id}">${icon('trash', 13)}</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `<div class="empty-state" style="margin-top:14px;">Nothing deleted recently.</div>`}
      </div>
    `;
    content.querySelectorAll('[data-restore-trash]').forEach((btn) => {
      btn.onclick = async () => {
        try {
          await api('POST', `/api/trash/${btn.dataset.restoreTrash}/restore`);
          showToast('Restored');
          await refreshAndRerender();
        } catch (err) {
          showToast(err.message, true);
        }
      };
    });
    content.querySelectorAll('[data-purge-trash]').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm('Permanently delete this item? It cannot be restored after this.')) return;
        try {
          await api('DELETE', `/api/trash/${btn.dataset.purgeTrash}`);
          showToast('Permanently deleted');
          renderSettings();
        } catch (err) {
          showToast(err.message, true);
        }
      };
    });
    const emptyBtn = document.getElementById('trash-empty-btn');
    if (emptyBtn) {
      emptyBtn.onclick = async () => {
        if (!confirm(`Permanently delete all ${trash.length} item(s) in the trash? This cannot be undone.`)) return;
        try {
          await api('DELETE', '/api/trash');
          showToast('Trash emptied');
          renderSettings();
        } catch (err) {
          showToast(err.message, true);
        }
      };
    }
  } else if (settingsTab === 'developer') {
    content.innerHTML = `
      <div class="card">
        <div style="font-weight:600; margin-bottom:2px;">Add test data</div>
        <p class="muted" style="font-size:12.5px; margin: 0 0 14px 0;">
          Generates a fresh, randomized batch of customers, printers, filament, products, inventory, orders,
          quotes, invoices, maintenance records, and expenses, and adds it to your current data. Every click
          produces different names and numbers, so you can click it repeatedly to build up a bigger test dataset.
        </p>
        <button type="button" class="btn brand" id="seed-random-btn">${icon('sparkles', 14)} Add test data</button>
        <div class="muted" id="seed-random-result" style="font-size:12px; margin-top:12px;"></div>
      </div>
    `;
    const seedBtn = document.getElementById('seed-random-btn');
    const resultEl = document.getElementById('seed-random-result');
    seedBtn.onclick = async () => {
      seedBtn.disabled = true;
      seedBtn.textContent = 'Adding...';
      try {
        const res = await api('POST', '/api/data/seed-random', {});
        const parts = Object.entries(res.counts).map(([k, v]) => `${v} ${k}`);
        resultEl.textContent = `Added: ${parts.join(', ')}.`;
        showToast('Test data added');
        await refreshAndRerender();
      } catch (err) {
        showToast(err.message, true);
        seedBtn.disabled = false;
        seedBtn.innerHTML = `${icon('sparkles', 14)} Add test data`;
      }
    };
  } else if (settingsTab === 'danger') {
    const backups = await api('GET', '/api/data/backups').catch(() => []);
    content.innerHTML = `
      <div class="card" style="border-color: var(--status-red-fg);">
        <div style="font-weight:600; margin-bottom:2px;">Delete all data</div>
        <p class="muted" style="font-size:12.5px; margin: 0 0 14px 0;">
          Permanently deletes every customer, quote, order, invoice, printer, maintenance record, filament spool,
          product, inventory item, and expense. Your business info and quoting rates in Settings are kept.
          A backup is saved automatically right before this runs (see "Restore from backup" below) - use it to
          clear out test/demo data and start fresh from the get-started checklist.
        </p>
        <div class="field">
          <label>Type DELETE to confirm</label>
          <input type="text" id="danger-confirm-input" placeholder="DELETE" autocomplete="off"/>
        </div>
        <button type="button" class="btn danger" id="danger-delete-btn" disabled>Delete all data</button>
      </div>
      <div class="card" style="margin-top:16px;">
        <div style="font-weight:600; margin-bottom:2px;">Restore from backup</div>
        <p class="muted" style="font-size:12.5px; margin: 0 0 14px 0;">
          A snapshot is saved automatically right before "Delete all data" runs. Restoring replaces your current
          data with the snapshot you pick - your current data is snapshotted first too, so restoring is itself
          undoable by restoring again.
        </p>
        ${backups.length ? `
          <table>
            <thead><tr><th>Saved</th><th>Size</th><th></th></tr></thead>
            <tbody>
              ${backups.map((b) => `
                <tr>
                  <td>${escapeHtml(fmtDateTime(b.createdAt))}</td>
                  <td class="muted">${fmtBytes(b.sizeBytes)}</td>
                  <td><button type="button" class="btn outline small" data-restore="${escapeHtml(b.file)}">Restore</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `<div class="empty-state">No backups yet - one is created automatically the first time "Delete all data" runs.</div>`}
      </div>
    `;
    const confirmInput = document.getElementById('danger-confirm-input');
    const deleteBtn = document.getElementById('danger-delete-btn');
    confirmInput.oninput = () => { deleteBtn.disabled = confirmInput.value.trim() !== 'DELETE'; };
    deleteBtn.onclick = async () => {
      try {
        await api('POST', '/api/data/reset', {});
        showToast('All data deleted - starting fresh');
        await refreshAndRerender();
      } catch (err) {
        showToast(err.message, true);
      }
    };
    content.querySelectorAll('[data-restore]').forEach((btn) => {
      btn.onclick = async () => {
        const file = btn.dataset.restore;
        const when = btn.closest('tr').querySelector('td').textContent;
        if (!confirm(`Replace your current data with the backup from ${when}? Your current data will be snapshotted first, so you can undo this by restoring again.`)) return;
        try {
          await api('POST', '/api/data/backups/restore', { file });
          showToast('Data restored');
          await refreshAndRerender();
        } catch (err) {
          showToast(err.message, true);
        }
      };
    });
  } else if (settingsTab === 'whatsnew') {
    // Same changelog data/renderer as the topbar "What's New" button (see
    // core.js) - one source, shown in two places.
    content.innerHTML = changelogHtml();
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
