// public/page-reports.js

let reportsMonths = 6;

function dualBarChart(seriesA, seriesB, labelA, labelB, colorA, colorB, opts = {}) {
  const w = opts.width || 560;
  const h = opts.height || 140;
  const max = Math.max(1, ...seriesA.map((d) => d.value), ...seriesB.map((d) => d.value));
  const groupW = w / seriesA.length;
  const barW = groupW / 2 - 4;
  let bars = '';
  seriesA.forEach((d, i) => {
    const bh = Math.max(1, (d.value / max) * (h - 24));
    const x = i * groupW + 4;
    bars += `<rect x="${x}" y="${h - bh - 20}" width="${barW}" height="${bh}" rx="2" fill="${colorA}"></rect>`;
    const bh2 = Math.max(1, (seriesB[i].value / max) * (h - 24));
    const x2 = x + barW + 2;
    bars += `<rect x="${x2}" y="${h - bh2 - 20}" width="${barW}" height="${bh2}" rx="2" fill="${colorB}"></rect>`;
    bars += `<text x="${i * groupW + groupW / 2}" y="${h - 4}" font-size="10" fill="var(--muted-foreground)" text-anchor="middle">${d.label}</text>`;
  });
  return `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="max-width:100%; height:auto;">${bars}</svg>
    <div class="legend">
      <div class="legend-item"><span class="legend-dot" style="background:${colorA}"></span>${labelA}</div>
      <div class="legend-item"><span class="legend-dot" style="background:${colorB}"></span>${labelB}</div>
    </div>
  `;
}

function singleBarChart(series, color, opts = {}) {
  const w = opts.width || 560;
  const h = opts.height || 120;
  const max = Math.max(1, ...series.map((d) => d.value));
  const barW = w / series.length - 8;
  const bars = series.map((d, i) => {
    const bh = Math.max(1, (d.value / max) * (h - 24));
    const x = i * (w / series.length) + 4;
    return `<rect x="${x}" y="${h - bh - 20}" width="${barW}" height="${bh}" rx="2" fill="${color}"></rect>
      <text x="${x + barW / 2}" y="${h - 4}" font-size="10" fill="var(--muted-foreground)" text-anchor="middle">${d.label}</text>`;
  }).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="max-width:100%; height:auto;">${bars}</svg>`;
}

function hasData(series) {
  return series.some((d) => d.value > 0);
}

async function renderReports() {
  const main = document.getElementById('main');
  const r = await api('GET', `/api/reports?months=${reportsMonths}`);

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Reports</h1>
        <p class="page-subtitle">Insights across your business.</p>
      </div>
      <div class="page-actions">
        <select id="range-select" style="background:var(--card); border:1px solid var(--border); border-radius:6px; padding:7px 10px; font-size:13px; color:var(--foreground);">
          <option value="3" ${reportsMonths === 3 ? 'selected' : ''}>Last 3 months</option>
          <option value="6" ${reportsMonths === 6 ? 'selected' : ''}>Last 6 months</option>
          <option value="12" ${reportsMonths === 12 ? 'selected' : ''}>Last 12 months</option>
        </select>
        <button class="btn outline" disabled title="Demo app">Export CSV</button>
        <button class="btn outline" disabled title="Demo app">Export PDF</button>
      </div>
    </div>

    <div class="section-header" style="margin-top:0;"><h2>Summary</h2></div>
    <div class="grid grid-4">
      <div class="card stat-card"><div class="stat-label">Revenue</div><div class="stat-value">${money(r.revenue)}</div></div>
      <div class="card stat-card"><div class="stat-label">Expenses</div><div class="stat-value">${money(r.expenseTotal)}</div></div>
      <div class="card stat-card"><div class="stat-label">Net</div><div class="stat-value">${money(r.net)}</div></div>
      <div class="card stat-card"><div class="stat-label">Orders</div><div class="stat-value">${r.orderCount}</div></div>
      <div class="card stat-card"><div class="stat-label">Average order</div><div class="stat-value">${money(r.avgOrder)}</div></div>
      <div class="card stat-card"><div class="stat-label">New customers</div><div class="stat-value">${r.newCustomerCount}</div></div>
      <div class="card stat-card"><div class="stat-label">Filament used</div><div class="stat-value">${fmtGrams(r.filamentUsedGrams)}</div></div>
      <div class="card stat-card"><div class="stat-label">Downtime</div><div class="stat-value">${fmtMinutes(r.downtimeMinutes)}</div></div>
    </div>

    <div class="section-header"><h2>Revenue vs expenses</h2></div>
    <div class="card">
      <p class="muted" style="margin-top:0; font-size:12.5px;">Monthly order revenue against expenses.</p>
      ${hasData(r.revenueByMonth) || hasData(r.expensesByMonth)
        ? dualBarChart(r.revenueByMonth, r.expensesByMonth, 'Revenue', 'Expenses', 'var(--accent-brand)', 'var(--status-red-fg)')
        : '<div class="chart-empty">No data for this range yet.</div>'}
    </div>

    <div class="grid grid-2" style="margin-top:22px;">
      <div>
        <div class="section-header" style="margin-top:0;"><h2>Most popular products</h2></div>
        <div class="card">
          ${r.topProducts.length ? `
            <table><thead><tr><th>Product</th><th>Qty</th></tr></thead><tbody>
              ${r.topProducts.map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${p.qty}</td></tr>`).join('')}
            </tbody></table>
          ` : '<div class="chart-empty">No products have been ordered in this range yet.</div>'}
        </div>
      </div>
      <div>
        <div class="section-header" style="margin-top:0;"><h2>Biggest client</h2></div>
        <div class="card">
          ${r.topCustomers.length ? `
            <table><thead><tr><th>Customer</th><th>Spend</th></tr></thead><tbody>
              ${r.topCustomers.map((c) => `<tr><td>${escapeHtml(c.name)}</td><td>${money(c.spend)}</td></tr>`).join('')}
            </tbody></table>
          ` : '<div class="chart-empty">No customer orders in this range yet.</div>'}
        </div>
      </div>
    </div>

    <div class="section-header"><h2>Filament consumption</h2></div>
    <div class="card">
      <p class="muted" style="margin-top:0; font-size:12.5px;">Grams used per month, from order records. Total: ${fmtGrams(r.filamentUsedGrams)}</p>
      ${hasData(r.filamentByMonth) ? singleBarChart(r.filamentByMonth, 'var(--status-blue-fg)') : '<div class="chart-empty">No filament has been consumed in this range yet.</div>'}
    </div>

    <div class="grid grid-2" style="margin-top:22px;">
      <div>
        <div class="section-header" style="margin-top:0;"><h2>Downtime by printer</h2></div>
        <div class="card">
          ${r.downtimeByPrinter.length ? `
            <table><thead><tr><th>Printer</th><th>Downtime</th></tr></thead><tbody>
              ${r.downtimeByPrinter.map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${fmtMinutes(p.minutes)}</td></tr>`).join('')}
            </tbody></table>
          ` : '<div class="chart-empty">No recorded downtime in this range.</div>'}
        </div>
      </div>
      <div>
        <div class="section-header" style="margin-top:0;"><h2>Downtime by month</h2></div>
        <div class="card">
          ${hasData(r.downtimeByMonth) ? singleBarChart(r.downtimeByMonth, 'var(--status-amber-fg)') : '<div class="chart-empty">No recorded downtime in this range.</div>'}
        </div>
      </div>
    </div>
  `;

  document.getElementById('range-select').onchange = (e) => {
    reportsMonths = Number(e.target.value);
    renderReports();
  };
}

registerPage('reports', renderReports);
