// public/page-requests.js
// Inbox for submissions from the public, unauthenticated /request intake
// form (see server.js + lib/api.js's "public" routes). Reviewed here and
// either converted into a real Quote or archived/deleted.

let requestListStatusFilter = 'new';

const REQUEST_STATUS_OPTIONS = ['all', 'new', 'converted', 'archived'];
const REQUEST_STATUS_LABELS = { all: 'All', new: 'New', converted: 'Converted', archived: 'Archived' };

function getFilteredRequests() {
  const list = state.quoteRequests.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (requestListStatusFilter === 'all') return list;
  return list.filter((r) => r.status === requestListStatusFilter);
}

// Converting a request creates (or reuses) a Customer from the contact
// info on the request, marks the request "converted", then opens a
// prefilled New Quote drawer - same document, no re-typing what the
// customer already told you.
async function convertRequestToQuote(request) {
  try {
    let customerId = request.customerId;
    if (!customerId) {
      const created = await api('POST', '/api/customers', {
        customerNumber: nextNumber('customerNumberPrefix', state.customers, 'customerNumber'),
        name: request.name || 'New customer',
        email: request.email || '',
        phone: request.phone || '',
      });
      customerId = created.id;
    }
    await api('PUT', `/api/quoteRequests/${request.id}`, { customerId, status: 'converted' });
    await refreshAndRerender();
    await navigate('quotes');
    const links = Array.isArray(request.links) ? request.links.filter(Boolean) : [];
    const colors = Array.isArray(request.colors) ? request.colors.filter((c) => c && (c.hex || c.colorName || c.description || c.part)) : [];
    const noteParts = [
      request.description,
      colors.length ? 'Colors:\n' + colors.map((c) => `- ${[c.colorName, c.part, c.description].filter(Boolean).join(' — ')}`).join('\n') : '',
      request.specialRequests ? `Special requests: ${request.specialRequests}` : '',
      request.deadline ? `Requested by: ${fmtDateSlash(request.deadline)}` : '',
    ].filter(Boolean);
    openQuoteModal(null, {
      customerId,
      modelLink: links[0] || '',
      additionalLinks: links.slice(1),
      notes: noteParts.join('\n\n'),
    });
  } catch (err) {
    showToast(err.message, true);
  }
}

function requestCardHtml(r) {
  const links = Array.isArray(r.links) ? r.links.filter(Boolean) : [];
  const colors = Array.isArray(r.colors) ? r.colors.filter((c) => c && (c.hex || c.colorName || c.description || c.part)) : [];
  return `
    <tr>
      <td>
        <div style="font-weight:600;">${escapeHtml(r.name || '—')}</div>
        <div class="muted" style="font-size:11.5px;">${escapeHtml(r.email || '')}${r.phone ? ' · ' + escapeHtml(r.phone) : ''}</div>
      </td>
      <td style="max-width:280px;">
        <div style="overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapeHtml(r.description || '—')}</div>
        ${r.specialRequests ? `<div class="muted" style="font-size:11.5px; margin-top:2px;">Special: ${escapeHtml(r.specialRequests)}</div>` : ''}
        ${links.map((l) => `<a href="${escapeHtml(l)}" target="_blank" rel="noopener noreferrer" class="muted" style="font-size:11.5px; display:block;">${icon('externalLink', 11)} ${escapeHtml(l)}</a>`).join('')}
      </td>
      <td>
        ${colors.length
          ? `<div style="display:flex; flex-direction:column; gap:3px;">${colors.map((c) => `
              <div style="display:flex; align-items:center; gap:5px; font-size:11.5px;">
                <span style="width:11px; height:11px; border-radius:999px; border:1px solid var(--border); background:${escapeHtml(c.hex || '#fff')}; flex-shrink:0;"></span>
                <span class="muted">${escapeHtml([c.colorName, c.part, c.description].filter(Boolean).join(' — ')) || '—'}</span>
              </div>
            `).join('')}</div>`
          : '<span class="muted">—</span>'}
      </td>
      <td>${r.deadline ? fmtDateSlash(r.deadline) : '—'}</td>
      <td>${fmtDate(r.createdAt)}</td>
      <td>${badge(REQUEST_STATUS_LABELS[r.status] || r.status, r.status)}</td>
      <td>
        <div class="row-actions">
          ${r.status !== 'converted' ? `<button class="btn outline small" data-convert-request="${r.id}">${icon('quotes', 13)} Convert</button>` : ''}
          ${r.status === 'new' ? `<button class="btn outline small" data-archive-request="${r.id}" title="Archive">${icon('x', 13)}</button>` : ''}
          <button class="btn outline small" data-del-request="${r.id}" title="Delete">${icon('trash', 13)}</button>
        </div>
      </td>
    </tr>
  `;
}

function renderRequestsTable() {
  const tableEl = document.getElementById('requests-table');
  if (!tableEl) return;

  if (!state.quoteRequests.length) {
    tableEl.innerHTML = `<div class="empty-state">No requests yet. Share your <a href="/request" target="_blank">request link</a> with customers to start collecting them here.</div>`;
    return;
  }

  const list = getFilteredRequests();
  if (!list.length) {
    tableEl.innerHTML = `<div class="empty-state">No requests match this filter.</div>`;
    return;
  }

  tableEl.innerHTML = `
    <table>
      <thead><tr><th>Contact</th><th>Project</th><th>Colors</th><th>Needed by</th><th>Submitted</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.map(requestCardHtml).join('')}</tbody>
    </table>
  `;

  tableEl.querySelectorAll('[data-convert-request]').forEach((btn) => {
    btn.onclick = () => {
      const r = state.quoteRequests.find((x) => x.id === btn.dataset.convertRequest);
      if (r) convertRequestToQuote(r);
    };
  });
  tableEl.querySelectorAll('[data-archive-request]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api('PUT', `/api/quoteRequests/${btn.dataset.archiveRequest}`, { status: 'archived' });
        showToast('Request archived');
        await refreshAndRerender();
      } catch (err) {
        showToast(err.message, true);
      }
    };
  });
  tableEl.querySelectorAll('[data-del-request]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Delete this request? This cannot be undone.')) return;
      try {
        await api('DELETE', `/api/quoteRequests/${btn.dataset.delRequest}`);
        showToast('Request deleted');
        await refreshAndRerender();
      } catch (err) {
        showToast(err.message, true);
      }
    };
  });
}

async function renderRequests() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Requests</h1>
        <p class="page-subtitle">Quote requests submitted through your public <a href="/request" target="_blank">request link</a>.</p>
      </div>
      <div class="page-actions">
        <button class="btn outline" id="copy-request-link">${icon('externalLink', 13)} Copy request link</button>
      </div>
    </div>
    <div class="status-filter-group" style="margin-bottom:16px;">
      ${REQUEST_STATUS_OPTIONS.map((st) => `<button type="button" class="status-filter-btn ${requestListStatusFilter === st ? 'active' : ''}" data-status-filter="${st}">${REQUEST_STATUS_LABELS[st]}</button>`).join('')}
    </div>
    <div class="card" id="requests-table"></div>
  `;

  document.getElementById('copy-request-link').onclick = async () => {
    const url = `${window.location.origin}/request`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied');
    } catch {
      showToast(url);
    }
  };

  document.querySelectorAll('[data-status-filter]').forEach((btn) => {
    btn.onclick = () => {
      requestListStatusFilter = btn.dataset.statusFilter;
      document.querySelectorAll('[data-status-filter]').forEach((b) => b.classList.toggle('active', b.dataset.statusFilter === requestListStatusFilter));
      renderRequestsTable();
    };
  });

  renderRequestsTable();
}

registerPage('requests', renderRequests);
