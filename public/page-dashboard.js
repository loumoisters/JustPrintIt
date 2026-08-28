// public/page-dashboard.js

function barChartSvg(data, opts = {}) {
  const w = opts.width || 260;
  const h = opts.height || 60;
  const max = Math.max(1, ...data.map((d) => d.value));
  const barW = w / data.length - 4;
  const color = opts.color || 'var(--accent-brand)';
  const bars = data.map((d, i) => {
    const barH = Math.max(2, (d.value / max) * (h - 14));
    const x = i * (w / data.length) + 2;
    const y = h - barH - 14;
    return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="2" fill="${color}"></rect>
      <text x="${x + barW / 2}" y="${h - 2}" font-size="9" fill="var(--muted-foreground)" text-anchor="middle">${d.label}</text>`;
  }).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bars}</svg>`;
}

function weekStripHtml() {
  const now = new Date();
  const day = now.getDay();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - day);
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

  return `<div class="muted" style="font-size:12px; margin-bottom:10px;">${startLabel} – ${endLabel}</div><div class="week-strip">${strip}</div>`;
}

async function renderDashboard() {
  await refreshStatuses();
  const main = document.getElementById('main');
  const d = await api('GET', '/api/dashboard');
  const reportsData = await api('GET', '/api/reports?months=6').catch(() => null);

  const onlineCount = Object.values(state.statuses).filter((s) => s.online).length;
  const profitByMonth = reportsData
    ? reportsData.revenueByMonth.map((r, i) => ({ label: r.label, value: r.value - reportsData.expensesByMonth[i].value }))
    : [];

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">A snapshot of your shop this month.</p>
      </div>
      <div class="page-actions">
        <button class="btn outline" id="btn-new-expense">New expense</button>
        <button class="btn outline" id="btn-new-quote">New quote</button>
        <button class="btn brand" id="btn-new-order">New order</button>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="stat-label">Revenue</div>
        <div class="stat-sub">Month to date</div>
        <div class="stat-value">${money(d.revenueMTD)}</div>
        ${reportsData ? barChartSvg(reportsData.revenueByMonth) : ''}
      </div>
      <div class="card">
        <div class="stat-label">Profit</div>
        <div class="stat-sub">Month to date</div>
        <div class="stat-value">${money(d.profitMTD)}</div>
        ${reportsData ? barChartSvg(profitByMonth, { color: 'var(--status-green-fg)' }) : ''}
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:14px;">
      <div class="card">
        <div class="stat-label">Active orders</div>
        <div class="stat-value">${d.activeOrderCount}</div>
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:14px;">
          ${ORDER_STATUSES.filter((s) => s !== 'cancelled').map((s) => `
            <div style="display:flex; justify-content:space-between; font-size:12.5px;">
              <span>${badge(ORDER_STATUS_LABELS[s], s)}</span>
              <span class="muted">${d.ordersByStatus[s] || 0}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="card">
        <div class="stat-label">Upcoming Deadlines</div>
        ${weekStripHtml()}
      </div>
    </div>

    <div class="section-header"><h2>Active Orders</h2></div>
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

  state.pollTimer = setInterval(refreshStatuses, 5000);
}

registerPage('dashboard', renderDashboard);
