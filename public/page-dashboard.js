// public/page-dashboard.js

let dashboardWeekOffset = 0; // weeks from the current week, changed by the </> arrows
let onboardingDismissed = null; // lazily read from localStorage

function lineChartSvg(data, opts = {}) {
  const w = opts.width || 260;
  const h = opts.height || 60;
  const max = Math.max(1, ...data.map((d) => d.value));
  const stepX = data.length > 1 ? w / (data.length - 1) : w;
  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = h - 16 - (d.value / max) * (h - 22);
    return [x, y];
  });
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const labels = data.map((d, i) => `<text x="${points[i][0].toFixed(1)}" y="${h - 2}" font-size="9" fill="var(--muted-foreground)" text-anchor="middle">${d.label}</text>`).join('');
  const color = opts.color || 'var(--foreground)';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="max-width:100%; height:auto;"><path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${labels}</svg>`;
}

// Multi-segment ring chart, e.g. the "Active orders" breakdown. segments:
// [{ value, color }]. Falls back to a plain empty ring when everything's 0.
function donutChartSvg(segments, opts = {}) {
  const size = opts.size || 128;
  const stroke = opts.stroke || 13;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((sum, seg) => sum + seg.value, 0);

  const bg = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--muted)" stroke-width="${stroke}"/>`;
  if (total <= 0) return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}</svg>`;

  let offset = 0;
  const arcs = segments.filter((s) => s.value > 0).map((seg) => {
    const dash = (seg.value / total) * circumference;
    const circle = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${stroke}" stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`;
    offset += dash;
    return circle;
  }).join('');

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}${arcs}</svg>`;
}

function weekStripHtml() {
  const now = new Date();
  const day = now.getDay();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - day + dashboardWeekOffset * 7);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    days.push(d);
  }
  const startLabel = days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const deadlinesByDate = {};
  for (const o of state.orders) {
    if (!o.dueDate) continue;
    const key = new Date(o.dueDate).toDateString();
    (deadlinesByDate[key] = deadlinesByDate[key] || []).push(o);
  }

  const strip = days.map((d) => {
    const isToday = d.toDateString() === now.toDateString();
    const count = (deadlinesByDate[d.toDateString()] || []).length;
    return `
      <div class="week-day ${isToday ? 'today' : ''}">
        <div class="wd-name">${d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
        <div class="wd-num">${d.getDate()}</div>
        ${count ? `<div style="font-size:10px; color: var(--accent-brand); margin-top:2px;">${count} due</div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div style="display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:10px;">
      <button type="button" class="icon-btn" id="week-prev" style="width:22px; height:22px;">${icon('chevronLeft', 14)}</button>
      <span class="muted" style="font-size:12px;">${startLabel} – ${endLabel}</span>
      <button type="button" class="icon-btn" id="week-next" style="width:22px; height:22px;">${icon('chevronRight', 14)}</button>
    </div>
    <div class="week-strip">${strip}</div>
  `;
}

function onboardingChecklistHtml() {
  const items = [
    { label: 'Add your first printer', done: state.printers.length > 0 },
    { label: 'Track a filament spool', done: state.spools.length > 0 },
    { label: 'Add a product', done: state.products.length > 0 },
    { label: 'Add a customer', done: state.customers.length > 0 },
    { label: 'Create your first order', done: state.orders.length > 0 },
    { label: 'Log an expense', done: state.expenses.length > 0 },
  ];
  return `
    <div class="card" id="onboarding-card" style="margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div style="font-weight:600; font-size:13.5px;">Get started with JustPrintIt</div>
        <button type="button" class="icon-btn" id="onboarding-dismiss" style="width:24px; height:24px;">${icon('x', 14)}</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${items.map((it) => `
          <div style="display:flex; align-items:center; gap:10px; font-size:13px; ${it.done ? 'color:var(--muted-foreground); text-decoration:line-through;' : ''}">
            <span style="width:18px; height:18px; border-radius:999px; border:1.5px solid ${it.done ? 'var(--status-green-fg)' : 'var(--border)'}; background:${it.done ? 'var(--status-green-fg)' : 'transparent'}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${it.done ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>` : ''}
            </span>
            ${it.label}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function renderDashboard(navEpochAtStart = navEpoch) {
  if (onboardingDismissed === null) onboardingDismissed = localStorage.getItem('jpi-onboarding-dismissed') === 'true';

  await refreshStatuses();
  if (!isCurrentNav(navEpochAtStart)) return; // user already navigated elsewhere

  const main = document.getElementById('main');
  const d = await api('GET', '/api/dashboard');
  const reportsData = await api('GET', '/api/reports?months=6').catch(() => null);
  if (!isCurrentNav(navEpochAtStart)) return;

  const profitByMonth = reportsData
    ? reportsData.revenueByMonth.map((r, i) => ({ label: r.label, value: r.value - reportsData.expensesByMonth[i].value }))
    : [];

  // The ring itself only represents active (non-terminal) orders; the
  // legend below it shows the full breakdown including fulfilled/cancelled
  // for context, matching FoxTrack's layout.
  const ringSegments = ORDER_STATUSES.filter((s) => s !== 'fulfilled' && s !== 'cancelled').map((s) => ({
    status: s, value: d.ordersByStatus[s] || 0, color: ORDER_STATUS_DOT[s],
  }));
  const legendSegments = ORDER_STATUSES.map((s) => ({
    status: s, value: d.ordersByStatus[s] || 0, color: ORDER_STATUS_DOT[s],
  }));

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Overview</h1>
        <p class="page-subtitle">A snapshot of your shop this month.</p>
      </div>
      <div class="page-actions">
        <button class="btn outline" id="btn-new-expense">+ New expense</button>
        <button class="btn outline" id="btn-new-quote">+ New quote</button>
        <button class="btn" id="btn-new-order">+ New order</button>
      </div>
    </div>

    ${onboardingDismissed ? '' : onboardingChecklistHtml()}

    <div class="grid grid-2">
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div class="stat-label">Revenue</div>
          <div class="muted" style="font-size:11px;">Month to date</div>
        </div>
        <div class="stat-value">${money(d.revenueMTD)}</div>
        ${reportsData ? lineChartSvg(reportsData.revenueByMonth) : ''}
      </div>
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div class="stat-label">Profit</div>
          <div class="muted" style="font-size:11px;">Month to date</div>
        </div>
        <div class="stat-value">${money(d.profitMTD)}</div>
        ${reportsData ? lineChartSvg(profitByMonth, { color: 'var(--status-green-fg)' }) : ''}
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:14px;">
      <div class="card">
        <div class="stat-label" style="margin-bottom:14px;">Active orders</div>
        <div style="display:flex; align-items:center; gap:20px;">
          <div style="position:relative; width:128px; height:128px; flex-shrink:0;">
            ${donutChartSvg(ringSegments)}
            <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;">
              <div style="font-size:24px; font-weight:700;">${d.activeOrderCount}</div>
              <div class="muted" style="font-size:9.5px; letter-spacing:0.06em;">ACTIVE</div>
            </div>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px; flex:1;">
            ${legendSegments.map((seg) => `
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:12.5px;">
                <span style="display:flex; align-items:center; gap:7px;">
                  <span style="width:8px; height:8px; border-radius:999px; background:${seg.color}; flex-shrink:0;"></span>
                  ${ORDER_STATUS_LABELS[seg.status]}
                </span>
                <span class="muted">${seg.value}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="stat-label">Upcoming Deadlines</div>
        ${weekStripHtml()}
      </div>
    </div>

    <div class="section-header">
      <h2>Active Orders</h2>
      <button class="btn outline small" disabled title="Custom columns aren't implemented in this build">+ Add column</button>
    </div>
    <div id="dash-kanban"></div>

    ${d.lowStockSpools.length ? `
      <div class="section-header"><h2>Low Stock Alerts</h2></div>
      <div class="card">
        ${d.lowStockSpools.map((s) => `<div style="padding:6px 0; font-size:13px;">${escapeHtml(s.brand)} ${escapeHtml(s.material)} ${escapeHtml(s.color || '')} — <span class="low-stock">${fmtGrams(s.remainingWeightGrams)} left</span></div>`).join('')}
      </div>
    ` : ''}
  `;

  renderKanbanBoard('dash-kanban', state.orders);

  document.getElementById('btn-new-order').onclick = () => navigate('orders').then(() => document.getElementById('add-order')?.click());
  document.getElementById('btn-new-quote').onclick = () => navigate('quotes').then(() => document.getElementById('add-quote')?.click());
  document.getElementById('btn-new-expense').onclick = () => navigate('expenses').then(() => document.getElementById('add-expense')?.click());

  const prevBtn = document.getElementById('week-prev');
  const nextBtn = document.getElementById('week-next');
  if (prevBtn) prevBtn.onclick = () => { dashboardWeekOffset -= 1; renderDashboard(); };
  if (nextBtn) nextBtn.onclick = () => { dashboardWeekOffset += 1; renderDashboard(); };

  const dismissBtn = document.getElementById('onboarding-dismiss');
  if (dismissBtn) dismissBtn.onclick = () => {
    onboardingDismissed = true;
    localStorage.setItem('jpi-onboarding-dismissed', 'true');
    renderDashboard();
  };

  state.pollTimer = setInterval(() => {
    if (state.page === 'dashboard') refreshStatuses();
  }, 5000);
}

registerPage('dashboard', renderDashboard);
