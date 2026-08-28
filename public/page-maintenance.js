// public/page-maintenance.js

let maintenanceTab = 'schedules'; // 'schedules' | 'log'

function scheduleFormFields(s = {}) {
  return [
    { name: 'printerId', label: 'Printer', type: 'select', required: true, value: s.printerId, options: state.printers.map((p) => ({ value: p.id, label: p.name })) },
    { name: 'task', label: 'Task (e.g. Nozzle replacement)', required: true, value: s.task },
    { name: 'intervalDays', label: 'Interval (days)', type: 'number', value: s.intervalDays ?? 30 },
    { name: 'lastServicedAt', label: 'Last serviced', type: 'date', value: s.lastServicedAt ? s.lastServicedAt.slice(0, 10) : '' },
    { name: 'notes', label: 'Notes', type: 'textarea', value: s.notes },
  ];
}

function logFormFields(l = {}) {
  return [
    { name: 'printerId', label: 'Printer', type: 'select', required: true, value: l.printerId, options: state.printers.map((p) => ({ value: p.id, label: p.name })) },
    { name: 'scheduleId', label: 'Related schedule (optional)', type: 'select', value: l.scheduleId, options: [{ value: '', label: '(none)' }, ...state.maintenanceSchedules.map((s) => ({ value: s.id, label: s.task }))] },
    { name: 'date', label: 'Date', type: 'date', required: true, value: l.date ? l.date.slice(0, 10) : new Date().toISOString().slice(0, 10) },
    { name: 'downtimeMinutes', label: 'Downtime (minutes)', type: 'number', value: l.downtimeMinutes ?? 0 },
    { name: 'notes', label: 'Notes', type: 'textarea', value: l.notes },
  ];
}

function scheduleStatus(s) {
  if (!s.lastServicedAt || !s.intervalDays) return { label: 'Not tracked', cls: 'gray' };
  const due = new Date(s.lastServicedAt);
  due.setDate(due.getDate() + Number(s.intervalDays));
  const daysLeft = Math.round((due - new Date()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { label: 'Overdue', cls: 'red' };
  if (daysLeft <= 7) return { label: 'Due soon', cls: 'amber' };
  return { label: 'On schedule', cls: 'green' };
}

async function renderMaintenance() {
  const main = document.getElementById('main');
  const now = new Date();
  const thisMonthLog = state.maintenanceLog.filter((l) => l.date && new Date(l.date).getMonth() === now.getMonth() && new Date(l.date).getFullYear() === now.getFullYear());
  const thisYearLog = state.maintenanceLog.filter((l) => l.date && new Date(l.date).getFullYear() === now.getFullYear());
  const downtimeMonth = thisMonthLog.reduce((s, l) => s + (Number(l.downtimeMinutes) || 0), 0);
  const downtimeYear = thisYearLog.reduce((s, l) => s + (Number(l.downtimeMinutes) || 0), 0);
  const dueCount = state.maintenanceSchedules.filter((s) => ['Overdue', 'Due soon'].includes(scheduleStatus(s).label)).length;

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Maintenance</h1>
        <p class="page-subtitle">Recurring upkeep schedules and the service log.</p>
      </div>
      <div class="page-actions">
        <button class="btn brand" id="add-maint">+ ${maintenanceTab === 'schedules' ? 'New schedule' : 'Log entry'}</button>
      </div>
    </div>

    <div class="grid grid-3" style="margin-bottom:20px;">
      <div class="card stat-card"><div class="stat-label">Downtime this month</div><div class="stat-sub">${now.toLocaleString('en-US', { month: 'long', year: 'numeric' })}</div><div class="stat-value">${fmtMinutes(downtimeMonth)}</div></div>
      <div class="card stat-card"><div class="stat-label">Downtime this year</div><div class="stat-sub">${now.getFullYear()}</div><div class="stat-value">${fmtMinutes(downtimeYear)}</div></div>
      <div class="card stat-card"><div class="stat-label">Schedules due</div><div class="stat-sub">${dueCount} schedules need service</div><div class="stat-value">${dueCount}</div></div>
    </div>

    <div class="tabs">
      <div class="tab ${maintenanceTab === 'schedules' ? 'active' : ''}" data-tab="schedules">Schedules</div>
      <div class="tab ${maintenanceTab === 'log' ? 'active' : ''}" data-tab="log">Log</div>
    </div>
    <div class="card" id="maint-content"></div>
  `;

  document.querySelectorAll('.tab').forEach((el) => {
    el.onclick = () => { maintenanceTab = el.dataset.tab; renderMaintenance(); };
  });

  const content = document.getElementById('maint-content');
  if (maintenanceTab === 'schedules') {
    const rows = state.maintenanceSchedules.map((s) => {
      const st = scheduleStatus(s);
      return `
        <tr>
          <td>${escapeHtml(printerName(s.printerId))}</td>
          <td>${escapeHtml(s.task)}</td>
          <td>${s.intervalDays ? `${s.intervalDays} days` : '—'}</td>
          <td>${s.lastServicedAt ? fmtDate(s.lastServicedAt) : '—'}</td>
          <td>${badge(st.label, st.cls)}</td>
          <td>
            <div class="row-actions">
              <button class="btn outline small" data-edit-sched="${s.id}">${icon('edit', 13)}</button>
              <button class="btn outline small" data-del-sched="${s.id}">${icon('trash', 13)}</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    content.innerHTML = state.maintenanceSchedules.length ? `
      <table><thead><tr><th>Printer</th><th>Task</th><th>Interval</th><th>Last serviced</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    ` : `<div class="empty-state">No schedules yet. Add one to track recurring upkeep.</div>`;

    state.maintenanceSchedules.forEach((s) => {
      const editBtn = document.querySelector(`[data-edit-sched="${s.id}"]`);
      const delBtn = document.querySelector(`[data-del-sched="${s.id}"]`);
      if (editBtn) editBtn.onclick = () => openModal('Edit Schedule', scheduleFormFields(s), async (data) => {
        await api('PUT', `/api/maintenanceSchedules/${s.id}`, data);
        showToast('Schedule updated');
        await renderMaintenance();
      });
      if (delBtn) delBtn.onclick = async () => {
        if (!confirm('Delete this schedule?')) return;
        await api('DELETE', `/api/maintenanceSchedules/${s.id}`);
        showToast('Schedule deleted');
        await renderMaintenance();
      };
    });
  } else {
    const rows = state.maintenanceLog.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).map((l) => `
      <tr>
        <td>${fmtDate(l.date)}</td>
        <td>${escapeHtml(printerName(l.printerId))}</td>
        <td>${escapeHtml(state.maintenanceSchedules.find((s) => s.id === l.scheduleId)?.task || '—')}</td>
        <td>${fmtMinutes(l.downtimeMinutes)}</td>
        <td>${escapeHtml(l.notes || '—')}</td>
        <td>
          <div class="row-actions">
            <button class="btn outline small" data-edit-log="${l.id}">${icon('edit', 13)}</button>
            <button class="btn outline small" data-del-log="${l.id}">${icon('trash', 13)}</button>
          </div>
        </td>
      </tr>
    `).join('');
    content.innerHTML = state.maintenanceLog.length ? `
      <table><thead><tr><th>Date</th><th>Printer</th><th>Schedule</th><th>Downtime</th><th>Notes</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    ` : `<div class="empty-state">No log entries yet.</div>`;

    state.maintenanceLog.forEach((l) => {
      const editBtn = document.querySelector(`[data-edit-log="${l.id}"]`);
      const delBtn = document.querySelector(`[data-del-log="${l.id}"]`);
      if (editBtn) editBtn.onclick = () => openModal('Edit Log Entry', logFormFields(l), async (data) => {
        await api('PUT', `/api/maintenanceLog/${l.id}`, data);
        showToast('Log entry updated');
        await renderMaintenance();
      });
      if (delBtn) delBtn.onclick = async () => {
        if (!confirm('Delete this log entry?')) return;
        await api('DELETE', `/api/maintenanceLog/${l.id}`);
        showToast('Log entry deleted');
        await renderMaintenance();
      };
    });
  }

  document.getElementById('add-maint').onclick = () => {
    if (maintenanceTab === 'schedules') {
      openModal('New Schedule', scheduleFormFields(), async (data) => {
        await api('POST', '/api/maintenanceSchedules', data);
        showToast('Schedule added');
        await renderMaintenance();
      });
    } else {
      openModal('New Log Entry', logFormFields(), async (data) => {
        await api('POST', '/api/maintenanceLog', data);
        showToast('Log entry added');
        await renderMaintenance();
      });
    }
  };
}

registerPage('maintenance', renderMaintenance);
