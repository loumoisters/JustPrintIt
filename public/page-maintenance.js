// public/page-maintenance.js

let maintenanceTab = 'schedules'; // 'schedules' | 'log'

// ---------- New/Edit Schedule (dedicated modal) ----------
// Schedule needs its own modal (not the generic openModal() field list) for
// the Interval type/Every pairing (the "Every" label changes units based on
// the selected type) and the bordered Active toggle card. "Last serviced" is
// deliberately not a field here - it's set automatically from the Log tab
// (see handleCreateMaintenanceLog server-side) whenever a log entry is
// linked to this schedule, rather than hand-edited when creating one.

let scheduleFormState = null;
let scheduleFormIsEdit = false;

const INTERVAL_TYPES = [
  { value: 'print_hours', label: 'Print hours' },
  { value: 'days', label: 'Days' },
];

function scheduleModalBodyHtml() {
  const s = scheduleFormState;
  const unit = s.intervalType === 'days' ? 'days' : 'hours';
  return `
    <div class="field">
      <label>Printer</label>
      <select id="sch-printerId">
        ${state.printers.map((p) => `<option value="${p.id}" ${s.printerId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>Task name</label>
      <input type="text" id="sch-task" value="${escapeHtml(s.task || '')}" placeholder="Lubricate Z rods, replace nozzle, ..." required/>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Interval type</label>
        <select id="sch-intervalType">
          ${INTERVAL_TYPES.map((t) => `<option value="${t.value}" ${s.intervalType === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label id="sch-interval-label">Every (${unit})</label>
        <input type="number" id="sch-intervalValue" min="0" value="${s.intervalValue ?? ''}"/>
      </div>
    </div>
    <div class="field">
      <label>Description</label>
      <textarea id="sch-notes" rows="3" placeholder="What the service involves...">${escapeHtml(s.notes || '')}</textarea>
    </div>
    <div class="card" style="padding:14px; margin-bottom:0; display:flex; align-items:center; justify-content:space-between; gap:12px;">
      <div>
        <div style="font-weight:600; font-size:13px;">Active</div>
        <div class="muted" style="font-size:11.5px; margin-top:2px;">Inactive schedules never fall due.</div>
      </div>
      <label class="switch"><input type="checkbox" id="sch-active" ${s.active !== false ? 'checked' : ''}/><span class="slider-track"></span></label>
    </div>
  `;
}

function readScheduleFormValues() {
  const byId = (id) => document.getElementById(id);
  return {
    printerId: byId('sch-printerId').value,
    task: byId('sch-task').value,
    intervalType: byId('sch-intervalType').value,
    intervalValue: Number(byId('sch-intervalValue').value) || 0,
    notes: byId('sch-notes').value,
    active: byId('sch-active').checked,
  };
}

function openScheduleModal(existing) {
  scheduleFormIsEdit = !!existing;
  scheduleFormState = existing ? {
    ...existing,
    // Belt-and-suspenders: lib/db.js normalizes intervalDays-only records to
    // intervalType/intervalValue server-side now, so the API never actually
    // sends the old shape - this fallback just means the UI still degrades
    // gracefully if that ever changes.
    intervalType: existing.intervalType || (existing.intervalDays != null ? 'days' : 'print_hours'),
    intervalValue: existing.intervalValue ?? existing.intervalDays ?? '',
  } : {
    printerId: state.printers[0]?.id || '', task: '', intervalType: 'print_hours', intervalValue: 200,
    notes: '', active: true,
  };

  renderModalShell({
    title: scheduleFormIsEdit ? 'Edit schedule' : 'New schedule',
    subtitle: 'Recurring upkeep for a printer. It falls due once the interval since the last service has elapsed.',
    bodyHtml: scheduleModalBodyHtml(),
    footerHtml: `
      <button type="button" class="btn outline" id="sch-cancel">Cancel</button>
      <button type="button" class="btn" id="sch-submit">${scheduleFormIsEdit ? 'Save changes' : 'Add schedule'}</button>
    `,
  });

  document.getElementById('sch-intervalType').onchange = (e) => {
    scheduleFormState.intervalType = e.target.value;
    const label = document.getElementById('sch-interval-label');
    if (label) label.textContent = `Every (${e.target.value === 'days' ? 'days' : 'hours'})`;
  };

  document.getElementById('sch-cancel').onclick = () => closeModal();
  document.getElementById('sch-submit').onclick = async () => {
    const values = readScheduleFormValues();
    if (!values.printerId) { showToast('Printer is required', true); return; }
    if (!values.task.trim()) { showToast('Task name is required', true); return; }
    try {
      if (scheduleFormIsEdit && scheduleFormState.id) {
        await api('PUT', `/api/maintenanceSchedules/${scheduleFormState.id}`, values);
        showToast('Schedule updated');
      } else {
        await api('POST', '/api/maintenanceSchedules', values);
        showToast('Schedule added');
      }
      closeModal();
      await refreshAndRerender();
    } catch (err) {
      showToast(err.message, true);
    }
  };
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
  if (s.active === false) return { label: 'Inactive', cls: 'gray' };

  const intervalType = s.intervalType || (s.intervalDays != null ? 'days' : 'print_hours');
  const intervalValue = Number(s.intervalValue ?? s.intervalDays) || 0;
  if (!intervalValue) return { label: 'Not tracked', cls: 'gray' };

  if (intervalType === 'print_hours') {
    const printer = state.printers.find((p) => p.id === s.printerId);
    if (!printer || s.lastServicePrintHours == null) return { label: 'Not tracked', cls: 'gray' };
    const elapsed = (Number(printer.printHours) || 0) - (Number(s.lastServicePrintHours) || 0);
    const remaining = intervalValue - elapsed;
    if (remaining <= 0) return { label: 'Overdue', cls: 'red' };
    // No natural "days until due" unit for a usage-based interval, so "due
    // soon" is the last 10% of the interval remaining instead of a fixed
    // threshold like the days-based branch below uses.
    if (remaining <= intervalValue * 0.1) return { label: 'Due soon', cls: 'amber' };
    return { label: 'On schedule', cls: 'green' };
  }

  // days-based
  if (!s.lastServicedAt) return { label: 'Not tracked', cls: 'gray' };
  const due = new Date(s.lastServicedAt);
  due.setDate(due.getDate() + intervalValue);
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
          <td>${(() => {
            const v = s.intervalValue ?? s.intervalDays;
            if (!v) return '—';
            return (s.intervalType || (s.intervalDays != null ? 'days' : 'print_hours')) === 'days' ? `${v} days` : `${v} print hrs`;
          })()}</td>
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
      if (editBtn) editBtn.onclick = () => openScheduleModal(s);
      if (delBtn) delBtn.onclick = async () => {
        if (!confirm('Delete this schedule?')) return;
        await api('DELETE', `/api/maintenanceSchedules/${s.id}`);
        showToast('Schedule deleted');
        await refreshAndRerender();
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
        await refreshAndRerender();
      });
      if (delBtn) delBtn.onclick = async () => {
        if (!confirm('Delete this log entry?')) return;
        await api('DELETE', `/api/maintenanceLog/${l.id}`);
        showToast('Log entry deleted');
        await refreshAndRerender();
      };
    });
  }

  document.getElementById('add-maint').onclick = () => {
    if (maintenanceTab === 'schedules') {
      openScheduleModal();
    } else {
      openModal('New Log Entry', logFormFields(), async (data) => {
        await api('POST', '/api/maintenanceLog', data);
        showToast('Log entry added');
        await refreshAndRerender();
      });
    }
  };
}

registerPage('maintenance', renderMaintenance);
