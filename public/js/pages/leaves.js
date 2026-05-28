'use strict';

// ── Leaves Page ───────────────────────────────────────────────────────────────
async function loadLeaves() {
  setHeaderTitle('Leave Management', 'Apply and manage leaves');
  const content = document.getElementById('content');
  content.innerHTML = `<div class="loading"><div class="spinner"></div> Loading…</div>`;
  try {
    if (!state.leavesFilterDate) state.leavesFilterDate = todayStr();
    const [leaves, lateEarly] = await Promise.all([
      apiGet('/leaves'),
      apiGet('/attendance/late-early', { date: state.leavesFilterDate }),
    ]);
    state.leaves           = leaves;
    state.lateEarlyRecords = lateEarly;
    renderLeavesView();
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

function renderLeavesView() {
  const content   = document.getElementById('content');
  const isAdmin   = state.user.role === 'admin';
  const allLeaves = state.leaves;
  const myLeaves  = allLeaves.filter(l => l.user_id === state.user.id);
  if (!state.leavesTab) state.leavesTab = isAdmin ? 'all' : 'mine';

  const leRecords    = state.lateEarlyRecords || [];
  const pendingCount = allLeaves.filter(l => l.status === 'pending').length;
  const fd           = state.leavesFilterDate;

  // helpers
  const daysCount = (s, e) => {
    const d = Math.round((new Date(e+'T12:00:00') - new Date(s+'T12:00:00')) / 86400000) + 1;
    return d === 1 ? '1 Day' : `${d} Days`;
  };
  const statusPill = st => st === 'approved' ? 'bg-green-500/10 text-green-700' : st === 'rejected' ? 'bg-red-500/10 text-red-700' : 'bg-orange-500/10 text-orange-700';
  const typeIconMap = {
    annual:       { icon: 'flight',                  bg: 'bg-tertiary-fixed',        color: 'text-tertiary'   },
    sick:         { icon: 'medical_services',         bg: 'bg-error-container/20',    color: 'text-error'      },
    casual:       { icon: 'weekend',                  bg: 'bg-primary-container/10',  color: 'text-primary'    },
    wfh:          { icon: 'home_work',                bg: 'bg-secondary-fixed',       color: 'text-secondary'  },
    maternity:    { icon: 'child_care',               bg: 'bg-secondary/10',          color: 'text-secondary'  },
    paternity:    { icon: 'family_restroom',          bg: 'bg-primary/10',            color: 'text-primary'    },
    bereavement:  { icon: 'sentiment_dissatisfied',  bg: 'bg-outline/10',            color: 'text-outline'    },
    unpaid:       { icon: 'money_off',               bg: 'bg-tertiary/10',           color: 'text-tertiary'   },
    emergency:    { icon: 'emergency',               bg: 'bg-error/10',              color: 'text-error'      },
    compensatory: { icon: 'swap_horiz',              bg: 'bg-primary/10',            color: 'text-primary'    },
  };
  const ti = t => typeIconMap[t] || { icon: 'event_busy', bg: 'bg-primary/10', color: 'text-primary' };

  const empCell = (r) => isAdmin ? `
    <td class="px-lg py-lg">
      <div class="flex items-center gap-md">
        <div class="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-on-primary flex-shrink-0"
          style="background:${r.avatar_color||'#4f46e5'}">${initials(r.name)}</div>
        <div>
          <p class="text-body-md text-on-surface font-medium">${r.name}</p>
          <p class="text-[11px] text-on-surface-variant">${r.department||''}</p>
        </div>
      </div>
    </td>` : '';

  // ── Late/Early rows ──────────────────────────────────────────────────────
  const leRows = leRecords.length === 0
    ? `<tr><td colspan="${isAdmin?6:5}" class="px-lg py-2xl text-center text-on-surface-variant">No late arrivals or early exits recorded</td></tr>`
    : leRecords.map(r => `
        <tr class="hover:bg-surface-container-low/50 transition-colors cursor-pointer" onclick='openEditLateEarlyModal(${JSON.stringify(r)})'>
          ${empCell(r)}
          <td class="px-lg py-lg text-body-md text-on-surface">${fmtDate(r.date)}</td>
          <td class="px-lg py-lg">
            <div class="flex flex-wrap gap-xs">
              ${r.is_late       ? `<span class="inline-flex px-sm py-xs rounded-full text-[11px] font-bold bg-error/10 text-error">Late ${r.check_in ? fmtTime(r.check_in) : ''}</span>` : ''}
              ${r.is_early_exit ? `<span class="inline-flex px-sm py-xs rounded-full text-[11px] font-bold bg-tertiary/10 text-tertiary">Early Exit ${r.check_out ? fmtTime(r.check_out) : ''}</span>` : ''}
            </div>
          </td>
          <td class="px-lg py-lg"><span class="inline-flex px-sm py-xs rounded-full text-[11px] font-bold ${statusPill(r.status)}">${statusLabel(r.status).toUpperCase()}</span></td>
          <td class="px-lg py-lg text-body-md text-on-surface-variant">${r.work_hours ? fmtHours(r.work_hours) : '—'}</td>
          <td class="px-lg py-lg text-right"><button class="p-sm text-on-surface-variant hover:text-primary rounded-full hover:bg-primary/10 transition-all"><span class="material-symbols-outlined text-[20px]">edit</span></button></td>
        </tr>`).join('');

  // ── Leave rows (shared renderer) ──────────────────────────────────────────
  const leaveRow = (l) => {
    const t = ti(l.leave_type);
    return `
      <tr class="hover:bg-surface-container-low/50 transition-colors">
        ${empCell(l)}
        <td class="px-lg py-lg">
          <div class="flex items-center gap-md">
            <div class="w-8 h-8 rounded-lg ${t.bg} ${t.color} flex items-center justify-center flex-shrink-0">
              <span class="material-symbols-outlined text-[18px]">${t.icon}</span>
            </div>
            <div>
              <p class="text-label-md text-on-surface capitalize">${l.leave_type} Leave</p>
              <p class="text-[11px] text-on-surface-variant">${l.reason ? l.reason.slice(0,40)+(l.reason.length>40?'…':'') : '—'}</p>
            </div>
          </div>
        </td>
        <td class="px-lg py-lg">
          <p class="text-body-md text-on-surface">${fmtDateRange(l.start_date, l.end_date)}</p>
          ${l.leave_time==='half' ? `<p class="text-[11px] text-on-surface-variant">${l.half_type==='second_half'?'Second Half':'First Half'}</p>` : ''}
        </td>
        <td class="px-lg py-lg text-body-md text-on-surface">${daysCount(l.start_date, l.end_date)}</td>
        <td class="px-lg py-lg"><span class="inline-flex px-sm py-xs rounded-full text-[11px] font-bold ${statusPill(l.status)}">${l.status.toUpperCase()}</span></td>
        <td class="px-lg py-lg text-right">
          <div class="flex items-center justify-end gap-xs">
            ${isAdmin && l.status==='pending' ? `
              <button class="p-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors" onclick="approveLeave(${l.id})" title="Approve"><span class="material-symbols-outlined text-[16px]">check</span></button>
              <button class="p-1 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors" onclick="rejectLeave(${l.id})" title="Reject"><span class="material-symbols-outlined text-[16px]">close</span></button>` : ''}
            ${l.status==='pending' && l.user_id===state.user.id ? `
              <button class="p-1 rounded-lg bg-secondary/10 text-secondary hover:bg-secondary/20 transition-colors" onclick="cancelLeave(${l.id})" title="Cancel"><span class="material-symbols-outlined text-[16px]">cancel</span></button>` : ''}
            <button class="p-sm text-on-surface-variant hover:text-primary rounded-full hover:bg-primary/10 transition-all" onclick='openEditLeaveModal(${JSON.stringify(l)})' title="Edit"><span class="material-symbols-outlined text-[20px]">more_vert</span></button>
          </div>
        </td>
      </tr>`;
  };

  const filteredLeaveRows = (() => {
    let src = isAdmin && state.leavesTab === 'all' ? allLeaves : myLeaves;
    src = src.filter(l => l.leave_time !== 'wfh');
    if (fd) src = src.filter(l => l.start_date <= fd && l.end_date >= fd);
    if (!src.length) return `<tr><td colspan="${isAdmin?6:5}" class="px-lg py-2xl text-center text-on-surface-variant">No leave records${fd?' for this date':''}</td></tr>`;
    return src.map(leaveRow).join('');
  })();

  const wfhRows = (() => {
    const src = (isAdmin ? allLeaves : myLeaves).filter(l => l.leave_time === 'wfh');
    if (!src.length) return `<tr><td colspan="${isAdmin?6:5}" class="px-lg py-2xl text-center text-on-surface-variant">No WFH records</td></tr>`;
    return src.map(leaveRow).join('');
  })();

  const activeRows = state.leavesTab==='late_early' ? leRows : state.leavesTab==='wfh' ? wfhRows : filteredLeaveRows;

  const leaveHeaders = (cols) => cols.map(c =>
    `<th class="px-lg py-md text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider${c.r?' text-right':''}">${c.l}</th>`
  ).join('');
  const empH = isAdmin ? [{l:'Employee'}] : [];
  const activeHeaders = state.leavesTab==='late_early'
    ? leaveHeaders([...empH, {l:'Date'}, {l:'Flags'}, {l:'Status'}, {l:'Hours'}, {l:'Actions',r:true}])
    : leaveHeaders([...empH, {l:'Leave Type'}, {l:'Dates'}, {l:'Duration'}, {l:'Status'}, {l:'Actions',r:true}]);

  // Balance cards
  const balanceTypes = [
    { type:'sick',   label:'Sick Leave',  icon:'medical_services', bg:'bg-error-container/20',   color:'text-error',     badge:'Accrued Yearly'   },
    { type:'casual', label:'Casual Leave',icon:'weekend',           bg:'bg-primary-container/10', color:'text-primary',   badge:'Available'        },
    { type:'annual', label:'Annual Leave',icon:'flight',            bg:'bg-tertiary-fixed',       color:'text-tertiary',  badge:'Carried Forward'  },
    { type:'wfh',    label:'WFH Balance', icon:'home_work',         bg:'bg-secondary-fixed',      color:'text-secondary', badge:'Monthly Usage'    },
  ];

  content.innerHTML = `
    <div class="p-lg max-w-container-max mx-auto w-full space-y-xl">
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-md">
        <div>
          <h2 class="text-headline-lg font-semibold text-on-surface">Leave Management</h2>
          <p class="text-body-md text-on-surface-variant">Review and manage employee leave requests and balances.</p>
        </div>
        <div class="flex gap-sm flex-wrap">
          <button class="bg-surface-container-lowest border border-outline-variant px-lg py-sm rounded-lg text-label-md text-on-surface hover:bg-surface-container-low transition-colors flex items-center gap-xs" onclick="openLateEarlyModal()">
            <span class="material-symbols-outlined text-[18px]">schedule</span> Late / Early Exit
          </button>
          <button class="bg-primary text-on-primary px-lg py-sm rounded-lg text-label-md font-semibold hover:opacity-90 transition-opacity flex items-center gap-xs" onclick="openApplyLeaveModal()">
            <span class="material-symbols-outlined text-[18px]">add</span> Apply Leave
          </button>
        </div>
      </div>

      <!-- Balance Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-lg">
        ${balanceTypes.map(lt => {
          const used    = myLeaves.filter(l => (lt.type==='wfh' ? l.leave_time==='wfh' : l.leave_type===lt.type) && l.status==='approved').length;
          const pending = myLeaves.filter(l => (lt.type==='wfh' ? l.leave_time==='wfh' : l.leave_type===lt.type) && l.status==='pending').length;
          return `
            <div class="bg-surface-container-lowest p-lg rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-transparent hover:shadow-[0_8px_20px_rgba(0,0,0,0.06)] transition-all flex flex-col justify-between">
              <div class="flex justify-between items-start mb-md">
                <div class="p-sm ${lt.bg} ${lt.color} rounded-lg">
                  <span class="material-symbols-outlined">${lt.icon}</span>
                </div>
                <span class="text-label-sm font-semibold text-on-surface-variant">${lt.badge}</span>
              </div>
              <div>
                <h4 class="text-label-md text-on-surface-variant mb-xs">${lt.label}</h4>
                <div class="flex items-baseline gap-xs">
                  <span class="text-headline-md font-semibold text-on-surface">${String(used).padStart(2,'0')}</span>
                  <span class="text-body-md text-on-surface-variant">days used${pending ? ` · ${pending} pending` : ''}</span>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>

      <!-- Leave History Table -->
      <section class="bg-surface-container-lowest rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] overflow-hidden">
        <div class="px-lg py-md border-b border-outline-variant flex flex-wrap justify-between items-center gap-md bg-surface-container-low/30">
          <div class="flex items-center gap-sm flex-wrap">
            <h3 class="text-title-lg font-semibold text-on-surface">Leave History</h3>
            <div class="flex gap-xs ml-md flex-wrap">
              ${isAdmin ? `<button class="px-md py-xs rounded-full text-label-sm font-semibold transition-all ${state.leavesTab==='all'?'bg-primary text-on-primary':'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}" onclick="setLeavesTab('all')">All ${pendingCount?`(${pendingCount})`:''}</button>` : ''}
              <button class="px-md py-xs rounded-full text-label-sm font-semibold transition-all ${state.leavesTab==='mine'?'bg-primary text-on-primary':'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}" onclick="setLeavesTab('mine')">My Leaves</button>
              <button class="px-md py-xs rounded-full text-label-sm font-semibold transition-all ${state.leavesTab==='wfh'?'bg-primary text-on-primary':'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}" onclick="setLeavesTab('wfh')">WFH</button>
              <button class="px-md py-xs rounded-full text-label-sm font-semibold transition-all ${state.leavesTab==='late_early'?'bg-primary text-on-primary':'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}" onclick="setLeavesTab('late_early')">Late/Early ${leRecords.length?`(${leRecords.length})`:''}</button>
            </div>
          </div>
          <div class="flex items-center gap-sm">
            <input type="date"
              class="py-xs px-md text-[13px] border border-outline-variant rounded-lg bg-surface-container-low text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all"
              value="${fd||''}" onchange="onLeavesDateFilter(this.value)" />
            ${fd ? `<button class="p-xs text-on-surface-variant hover:text-on-surface transition-colors" onclick="onLeavesDateFilter('')"><span class="material-symbols-outlined text-[20px]">close</span></button>` : ''}
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-surface-container-low/10 border-b border-outline-variant">${activeHeaders}</tr>
            </thead>
            <tbody class="divide-y divide-outline-variant/30" id="leave-list">${activeRows}</tbody>
          </table>
        </div>
        <div class="px-lg py-md border-t border-outline-variant">
          <p class="text-label-sm text-on-surface-variant">Showing all records</p>
        </div>
      </section>

      <!-- CTA Banner -->
      <div class="relative w-full min-h-[160px] rounded-2xl overflow-hidden flex flex-col justify-center"
        style="background:linear-gradient(135deg,#2d1fb5 0%,#3525cd 50%,#4f46e5 100%)">
        <div class="absolute inset-0 opacity-10" style="background-image:linear-gradient(rgba(255,255,255,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.1) 1px,transparent 1px);background-size:24px 24px"></div>
        <div class="relative z-10 px-2xl py-xl">
          <h3 class="text-headline-md font-semibold text-white mb-sm">Need a long break?</h3>
          <p class="text-body-md text-white/80 max-w-md mb-lg">Talk to your HR representative about extended leave policies for tenured employees.</p>
          <button class="bg-surface text-primary px-xl py-md rounded-lg text-label-md font-semibold hover:opacity-90 transition-all" onclick="openApplyLeaveModal()">Apply for Leave</button>
        </div>
        <div class="absolute right-xl bottom-0 opacity-20">
          <span class="material-symbols-outlined text-[120px] text-white">beach_access</span>
        </div>
      </div>
    </div>`;
}

async function setLeavesTab(tab) {
  state.leavesTab = tab;
  if (tab === 'late_early' && !state.leavesFilterDate) state.leavesFilterDate = todayStr();
  if (tab === 'late_early') {
    try {
      const qs            = state.leavesFilterDate ? { date: state.leavesFilterDate } : {};
      state.lateEarlyRecords = await apiGet('/attendance/late-early', qs);
    } catch { /* keep existing */ }
  }
  renderLeavesView();
}

async function onLeavesDateFilter(val) {
  state.leavesFilterDate = val || null;
  if (state.leavesTab === 'late_early') {
    try {
      const qs            = val ? { date: val } : {};
      state.lateEarlyRecords = await apiGet('/attendance/late-early', qs);
    } catch { /* keep existing */ }
  }
  renderLeavesView();
}

function renderLeaveSummary(myLeaves) {
  const types = ['casual','sick','annual','maternity','paternity'];
  return types.map(t => {
    const approved = myLeaves.filter(l => l.leave_type === t && l.status === 'approved').length;
    const pending  = myLeaves.filter(l => l.leave_type === t && l.status === 'pending').length;
    return `
      <div class="flex items-center justify-between" style="padding:6px 0;border-bottom:1px solid var(--border-light)">
        <span class="leave-type-badge ${t}" style="font-size:.72rem">${t}</span>
        <div class="flex gap-2">
          ${approved ? `<span class="status-badge approved">${approved} approved</span>` : ''}
          ${pending  ? `<span class="status-badge pending">${pending} pending</span>`    : ''}
          ${!approved && !pending ? `<span style="font-size:.78rem;color:var(--text-muted)">None</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

async function refreshAfterLeaveChange() {
  await apiPost('/attendance/cleanup-orphaned', {}).catch(() => {});
  const leaves     = await apiGet('/leaves');
  state.leaves     = leaves;
  if (state.view === 'leaves')    renderLeavesView();
  if (state.view === 'dashboard') loadDashboard();
  if (state.view === 'calendar')  loadCalendar();
  if (state.view !== 'calendar')  fetchCalendarData().catch(() => {});
}
async function approveLeave(id) {
  try { await apiPut(`/leaves/${id}/approve`, {}); toast('Leave approved', 'success'); await refreshAfterLeaveChange(); }
  catch (err) { toast(err.message, 'error'); }
}
async function rejectLeave(id) {
  try { await apiPut(`/leaves/${id}/reject`, {}); toast('Leave rejected', 'warning'); await refreshAfterLeaveChange(); }
  catch (err) { toast(err.message, 'error'); }
}
async function cancelLeave(id) {
  try { await apiDelete(`/leaves/${id}`); toast('Leave cancelled', 'info'); await refreshAfterLeaveChange(); }
  catch (err) { toast(err.message, 'error'); }
}
async function deleteLeave(id) {
  if (!confirm('Delete this leave record? This cannot be undone.')) return;
  try { await apiDelete(`/leaves/${id}`); toast('Leave deleted', 'success'); closeModal(); await refreshAfterLeaveChange(); }
  catch (err) { toast(err.message, 'error'); }
}

function leaveTypeOptions() {
  return ['casual','sick','annual','maternity','paternity','bereavement','unpaid']
    .map(t => `<option value="${t}">${t.charAt(0).toUpperCase()+t.slice(1)}</option>`).join('');
}
function empOptions() {
  return state.employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
}

function onLeaveTimeChange(index) {
  const val     = document.getElementById(`lf-leavetime-${index}`)?.value;
  const halfRow = document.getElementById(`lf-halftype-row-${index}`);
  if (halfRow) halfRow.style.display = val === 'half' ? 'block' : 'none';
}
function onQLLeaveTimeChange() {
  const val     = document.getElementById('ql-leavetime')?.value;
  const halfRow = document.getElementById('ql-halftype-row');
  if (halfRow) halfRow.style.display = val === 'half' ? 'block' : 'none';
}

function renderLeaveFormCard(index) {
  const isAdmin = state.user.role === 'admin';
  return `
    <div class="leave-form-card" id="leave-form-${index}" style="background:var(--bg);border:1.5px solid var(--border);border-radius:var(--r);padding:16px 18px;margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:.83rem;font-weight:700;color:var(--primary)">
          ${index === 0 ? 'Leave Request' : `Leave Request #${index + 1}`}
        </div>
        ${index > 0 ? `<button class="btn btn-ghost btn-sm" onclick="removeLeaveForm(${index})" style="color:var(--danger);padding:4px 8px">${I('x')} Remove</button>` : ''}
      </div>
      ${isAdmin ? `
        <div class="form-group">
          <label class="form-label">Employee</label>
          <select class="form-control" id="lf-emp-${index}" required>
            <option value="">Select employee…</option>
            ${empOptions()}
          </select>
        </div>` : ''}
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Leave Type</label>
          <select class="form-control" id="lf-type-${index}">${leaveTypeOptions()}</select>
        </div>
        <div class="form-group">
          <label class="form-label">Leave Time</label>
          <select class="form-control" id="lf-leavetime-${index}" onchange="onLeaveTimeChange(${index})">
            <option value="full">Full Leave</option>
            <option value="half">Half Leave</option>
            <option value="wfh">Work from Home</option>
          </select>
        </div>
      </div>
      <div class="form-group" id="lf-halftype-row-${index}" style="display:none">
        <label class="form-label">Which Half?</label>
        <select class="form-control" id="lf-halftype-${index}">
          <option value="first_half">First Half &nbsp;(Morning — till lunch)</option>
          <option value="second_half">Second Half (Afternoon — post lunch)</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Start Date</label>
          <input type="date" class="form-control" id="lf-start-${index}" required />
        </div>
        <div class="form-group">
          <label class="form-label">End Date</label>
          <input type="date" class="form-control" id="lf-end-${index}" required />
        </div>
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">Reason</label>
        <textarea class="form-control" id="lf-reason-${index}" rows="2" placeholder="Optional reason…"></textarea>
      </div>
    </div>`;
}

async function openApplyLeaveModal() {
  if (state.employees.length === 0) await fetchEmployees();
  leaveFormCount = 0;
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Apply for Leave</div>
      <button class="btn btn-ghost btn-icon" onclick="closeModal()">${I('x')}</button>
    </div>
    <div class="modal-body" style="padding-bottom:8px">
      <div id="leave-forms-container">
        ${renderLeaveFormCard(0)}
      </div>
      <button class="btn btn-outline btn-sm" style="margin-top:4px;margin-bottom:8px" onclick="addAnotherLeaveForm()">
        ${I('plus')} Add Another
      </button>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitAllLeaves()">Submit All Requests</button>
    </div>`, 'modal-lg');
}

function addAnotherLeaveForm() {
  leaveFormCount++;
  const container = document.getElementById('leave-forms-container');
  if (!container) return;
  const div = document.createElement('div');
  div.innerHTML = renderLeaveFormCard(leaveFormCount);
  container.appendChild(div.firstElementChild);
}
function removeLeaveForm(index) {
  document.getElementById(`leave-form-${index}`)?.remove();
}

async function submitAllLeaves() {
  const isAdmin = state.user.role === 'admin';
  const forms   = document.querySelectorAll('.leave-form-card');
  if (!forms.length) return;

  const requests = [];
  for (const form of forms) {
    const idx        = form.id.replace('leave-form-', '');
    const start_date = document.getElementById(`lf-start-${idx}`)?.value;
    const end_date   = document.getElementById(`lf-end-${idx}`)?.value;
    const empEl      = document.getElementById(`lf-emp-${idx}`);
    if (!start_date || !end_date) { toast('Fill in all start and end dates', 'warning'); return; }
    if (isAdmin && empEl && !empEl.value) { toast('Select an employee for each request', 'warning'); return; }
    const leave_time = document.getElementById(`lf-leavetime-${idx}`)?.value || 'full';
    const body = {
      leave_type: document.getElementById(`lf-type-${idx}`)?.value || 'casual',
      start_date,
      end_date,
      reason:     document.getElementById(`lf-reason-${idx}`)?.value || '',
      leave_time,
      half_type:  leave_time === 'half' ? (document.getElementById(`lf-halftype-${idx}`)?.value || 'first_half') : null,
    };
    if (isAdmin && empEl?.value) body.user_id = parseInt(empEl.value);
    requests.push(body);
  }

  try {
    await Promise.all(requests.map(r => apiPost('/leaves', r)));
    const empName = requests.length === 1 && state.user.role === 'admin'
      ? state.employees.find(e => e.id === requests[0].user_id)?.name || ''
      : '';
    toast(`${requests.length} leave request${requests.length > 1 ? 's' : ''} submitted!${empName ? ' for ' + empName : ''}`, 'success');
    closeModal();
    const leaves = await apiGet('/leaves');
    state.leaves = leaves;
    renderLeavesView();
  } catch (err) { toast(err.message, 'error'); }
}

async function submitQuickLeave(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const isAdmin = state.user.role === 'admin';
    const empEl   = document.getElementById('ql-emp');
    if (isAdmin && empEl && !empEl.value) { toast('Please select an employee', 'warning'); btn.disabled = false; return; }
    const leave_time = document.getElementById('ql-leavetime')?.value || 'full';
    const body = {
      leave_type: document.getElementById('ql-type').value,
      start_date: document.getElementById('ql-start').value,
      end_date:   document.getElementById('ql-end').value,
      reason:     document.getElementById('ql-reason').value,
      leave_time,
      half_type:  leave_time === 'half' ? (document.getElementById('ql-halftype')?.value || 'first_half') : null,
    };
    if (isAdmin && empEl?.value) body.user_id = parseInt(empEl.value);
    await apiPost('/leaves', body);
    toast('Leave request submitted!', 'success');
    const leaves = await apiGet('/leaves');
    state.leaves = leaves;
    renderLeavesView();
  } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
}

// ── Late Come / Early Exit ────────────────────────────────────────────────────
function onLateSelectChange() {
  const val = document.getElementById('le-late-select')?.value;
  const row = document.getElementById('le-late-time-row');
  if (row) row.style.display = val === 'yes' ? 'block' : 'none';
}
function onEarlySelectChange() {
  const val = document.getElementById('le-early-select')?.value;
  const row = document.getElementById('le-early-time-row');
  if (row) row.style.display = val === 'yes' ? 'block' : 'none';
}

async function openLateEarlyModal() {
  if (state.employees.length === 0) await fetchEmployees();
  const empOpts = state.employees.map(e => `<option value="${e.id}">${e.name} — ${e.department || ''}</option>`).join('');
  openModal(`
    <div class="modal-header">
      <div class="modal-title">${I('clock')} Record Late Come / Early Exit</div>
      <button class="btn btn-ghost btn-icon" onclick="closeModal()">${I('x')}</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Employee <span style="color:var(--danger)">*</span></label>
        <select class="form-control" id="le-emp">
          <option value="">— Select Employee —</option>
          ${empOpts}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Date <span style="color:var(--danger)">*</span></label>
        <input type="date" class="form-control" id="le-date" value="${todayStr()}">
      </div>
      <div style="border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px">
        <div class="form-label" style="font-weight:600;margin-bottom:8px;color:var(--orange)">⏰ Late Come</div>
        <div class="form-group" style="margin-bottom:6px">
          <select class="form-control" id="le-late-select" onchange="onLateSelectChange()">
            <option value="none">None (No late entry)</option>
            <option value="yes">Late Come</option>
          </select>
        </div>
        <div class="form-group" id="le-late-time-row" style="display:none;margin-bottom:0">
          <label class="form-label" style="font-size:.78rem">Arrival Time</label>
          <input type="time" class="form-control" id="le-late-time" placeholder="HH:MM">
        </div>
      </div>
      <div style="border:1px solid var(--border);border-radius:10px;padding:14px">
        <div class="form-label" style="font-weight:600;margin-bottom:8px;color:var(--purple)">◀ Early Exit</div>
        <div class="form-group" style="margin-bottom:6px">
          <select class="form-control" id="le-early-select" onchange="onEarlySelectChange()">
            <option value="none">None (No early exit)</option>
            <option value="yes">Early Exit</option>
          </select>
        </div>
        <div class="form-group" id="le-early-time-row" style="display:none;margin-bottom:0">
          <label class="form-label" style="font-size:.78rem">Exit Time</label>
          <input type="time" class="form-control" id="le-early-time" placeholder="HH:MM">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitLateEarly()">Save Record</button>
    </div>`, 'modal-md');
}

async function submitLateEarly() {
  const user_id    = document.getElementById('le-emp')?.value;
  const date       = document.getElementById('le-date')?.value;
  const late_come  = document.getElementById('le-late-select')?.value  || 'none';
  const late_time  = document.getElementById('le-late-time')?.value;
  const early_exit = document.getElementById('le-early-select')?.value || 'none';
  const early_time = document.getElementById('le-early-time')?.value;
  if (!user_id) return toast('Please select an employee', 'warning');
  if (!date)    return toast('Please select a date', 'warning');
  if (late_come  === 'yes' && !late_time)  return toast('Enter the late arrival time', 'warning');
  if (early_exit === 'yes' && !early_time) return toast('Enter the early exit time', 'warning');
  if (late_come === 'none' && early_exit === 'none') return toast('Select at least one — Late Come or Early Exit', 'warning');
  try {
    await apiPost('/attendance/late-early', {
      user_id:         parseInt(user_id),
      date,
      late_come,
      late_come_time:  late_come  === 'yes' ? late_time  : null,
      early_exit,
      early_exit_time: early_exit === 'yes' ? early_time : null,
    });
    const empName = state.employees.find(e => e.id === parseInt(user_id))?.name || '';
    toast(`Late/Early exit recorded for ${empName}`, 'success');
    closeModal();
    const [, lateEarly] = await Promise.all([fetchCalendarData(), apiGet('/attendance/late-early')]);
    state.lateEarlyRecords = lateEarly;
    if (state.view === 'leaves') renderLeavesView();
  } catch (err) { toast(err.message, 'error'); }
}

// ── Edit Late / Early Modal ───────────────────────────────────────────────────
function openEditLateEarlyModal(r) {
  const isLate  = !!r.is_late;
  const isEarly = !!r.is_early_exit;
  const toInputTime = t => t ? t.slice(0, 5) : '';
  openModal(`
    <div class="modal-header" style="position:relative">
      <div class="modal-title">${I('edit')} Edit Late / Early Exit</div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-danger btn-sm" onclick="deleteLateEarlyRecord(${r.id})">${I('trash')} Delete</button>
        <button class="btn btn-ghost btn-icon" onclick="closeModal()">${I('x')}</button>
      </div>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Employee</label>
        <input class="form-control" value="${r.name}" disabled style="background:var(--bg);color:var(--text-muted)">
      </div>
      <div class="form-group">
        <label class="form-label">Date</label>
        <input type="date" class="form-control" value="${r.date}" disabled style="background:var(--bg);color:var(--text-muted)">
      </div>
      <div style="border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px">
        <div class="form-label" style="font-weight:600;margin-bottom:8px;color:var(--orange)">⏰ Late Come</div>
        <div class="form-group" style="margin-bottom:6px">
          <select class="form-control" id="le-edit-late-select" onchange="onEditLateSelectChange()">
            <option value="none" ${!isLate ? 'selected' : ''}>None (No late entry)</option>
            <option value="yes"  ${isLate  ? 'selected' : ''}>Late Come</option>
          </select>
        </div>
        <div class="form-group" id="le-edit-late-time-row" style="display:${isLate ? 'block' : 'none'};margin-bottom:0">
          <label class="form-label" style="font-size:.78rem">Arrival Time</label>
          <input type="time" class="form-control" id="le-edit-late-time" value="${toInputTime(r.check_in)}">
        </div>
      </div>
      <div style="border:1px solid var(--border);border-radius:10px;padding:14px">
        <div class="form-label" style="font-weight:600;margin-bottom:8px;color:var(--purple)">◀ Early Exit</div>
        <div class="form-group" style="margin-bottom:6px">
          <select class="form-control" id="le-edit-early-select" onchange="onEditEarlySelectChange()">
            <option value="none" ${!isEarly ? 'selected' : ''}>None (No early exit)</option>
            <option value="yes"  ${isEarly  ? 'selected' : ''}>Early Exit</option>
          </select>
        </div>
        <div class="form-group" id="le-edit-early-time-row" style="display:${isEarly ? 'block' : 'none'};margin-bottom:0">
          <label class="form-label" style="font-size:.78rem">Exit Time</label>
          <input type="time" class="form-control" id="le-edit-early-time" value="${toInputTime(r.check_out)}">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitEditLateEarly(${r.id})">Save Changes</button>
    </div>`, 'modal-md');
}
function onEditLateSelectChange() {
  const val = document.getElementById('le-edit-late-select')?.value;
  const row = document.getElementById('le-edit-late-time-row');
  if (row) row.style.display = val === 'yes' ? 'block' : 'none';
}
function onEditEarlySelectChange() {
  const val = document.getElementById('le-edit-early-select')?.value;
  const row = document.getElementById('le-edit-early-time-row');
  if (row) row.style.display = val === 'yes' ? 'block' : 'none';
}
async function submitEditLateEarly(id) {
  const late_come  = document.getElementById('le-edit-late-select')?.value  || 'none';
  const late_time  = document.getElementById('le-edit-late-time')?.value;
  const early_exit = document.getElementById('le-edit-early-select')?.value || 'none';
  const early_time = document.getElementById('le-edit-early-time')?.value;
  if (late_come  === 'yes' && !late_time)  return toast('Enter the late arrival time', 'warning');
  if (early_exit === 'yes' && !early_time) return toast('Enter the early exit time', 'warning');
  if (late_come === 'none' && early_exit === 'none') return toast('Select at least one — Late Come or Early Exit', 'warning');
  try {
    await apiPut(`/attendance/late-early/${id}`, {
      late_come,
      late_come_time:  late_come  === 'yes' ? late_time  : null,
      early_exit,
      early_exit_time: early_exit === 'yes' ? early_time : null,
    });
    toast('Record updated', 'success');
    closeModal();
    const [, lateEarly] = await Promise.all([fetchCalendarData(), apiGet('/attendance/late-early')]);
    state.lateEarlyRecords = lateEarly;
    if (state.view === 'leaves') renderLeavesView();
  } catch (err) { toast(err.message, 'error'); }
}
async function deleteLateEarlyRecord(id) {
  if (!confirm('Remove this late/early exit record?')) return;
  try {
    await apiDelete(`/attendance/late-early/${id}`);
    toast('Record deleted', 'success');
    closeModal();
    const [, lateEarly] = await Promise.all([fetchCalendarData(), apiGet('/attendance/late-early')]);
    state.lateEarlyRecords = lateEarly;
    if (state.view === 'leaves') renderLeavesView();
  } catch (err) { toast(err.message, 'error'); }
}

// ── Edit Leave Modal ──────────────────────────────────────────────────────────
function openEditLeaveModal(l) {
  const isAdmin  = state.user.role === 'admin';
  const canEdit  = l.status !== 'approved' || isAdmin;
  const typeOpts = ['casual','sick','annual','maternity','paternity','bereavement','unpaid'].map(t =>
    `<option value="${t}" ${l.leave_type===t?'selected':''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`).join('');
  openModal(`
    <div class="modal-header">
      <div class="modal-title">${I('edit')} Edit Leave</div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-danger btn-sm" onclick="deleteLeave(${l.id})">${I('trash')} Delete</button>
        <button class="btn btn-ghost btn-icon" onclick="closeModal()">${I('x')}</button>
      </div>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Employee</label>
        <input class="form-control" value="${l.name}" disabled style="background:var(--bg);color:var(--text-muted)">
      </div>
      <div class="form-group">
        <label class="form-label">Leave Type</label>
        <select class="form-control" id="el-type" ${!canEdit?'disabled':''}>${typeOpts}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Leave Time</label>
        <select class="form-control" id="el-leavetime" onchange="onEditLeaveTimeChange()" ${!canEdit?'disabled':''}>
          <option value="full" ${l.leave_time==='full'?'selected':''}>Full Leave</option>
          <option value="half" ${l.leave_time==='half'?'selected':''}>Half Leave</option>
          <option value="wfh"  ${l.leave_time==='wfh' ?'selected':''}>Work from Home</option>
        </select>
      </div>
      <div class="form-group" id="el-halftype-row" style="display:${l.leave_time==='half'?'block':'none'}">
        <label class="form-label">Which Half?</label>
        <select class="form-control" id="el-halftype" ${!canEdit?'disabled':''}>
          <option value="first_half"  ${l.half_type!=='second_half'?'selected':''}>☀️ First Half (Morning)</option>
          <option value="second_half" ${l.half_type==='second_half'?'selected':''}>🌙 Second Half (Afternoon)</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Start Date</label>
          <input type="date" class="form-control" id="el-start" value="${l.start_date}" ${!canEdit?'disabled':''}>
        </div>
        <div class="form-group">
          <label class="form-label">End Date</label>
          <input type="date" class="form-control" id="el-end" value="${l.end_date}" ${!canEdit?'disabled':''}>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Reason</label>
        <textarea class="form-control" id="el-reason" rows="2" ${!canEdit?'disabled':''}>${l.reason||''}</textarea>
      </div>
      ${!canEdit ? `<div style="font-size:.78rem;color:var(--warning);margin-top:4px">⚠️ Approved leave — only admin can edit</div>` : ''}
      <div style="margin-top:6px">
        <span class="status-badge ${l.status}">${l.status}</span>
        ${l.approver_name ? `<span style="font-size:.75rem;color:var(--text-muted);margin-left:6px">By: ${l.approver_name}</span>` : ''}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      ${canEdit ? `<button class="btn btn-primary" onclick="submitEditLeave(${l.id})">Save Changes</button>` : ''}
    </div>`, 'modal-md');
}
function onEditLeaveTimeChange() {
  const val = document.getElementById('el-leavetime')?.value;
  const row = document.getElementById('el-halftype-row');
  if (row) row.style.display = val === 'half' ? 'block' : 'none';
}
async function submitEditLeave(id) {
  const start_date = document.getElementById('el-start')?.value;
  const end_date   = document.getElementById('el-end')?.value;
  if (!start_date || !end_date) return toast('Fill in start and end dates', 'warning');
  if (start_date > end_date)    return toast('Start date must be before end date', 'warning');
  const leave_time = document.getElementById('el-leavetime')?.value || 'full';
  try {
    await apiPut(`/leaves/${id}`, {
      start_date,
      end_date,
      leave_type: document.getElementById('el-type')?.value,
      reason:     document.getElementById('el-reason')?.value || '',
      leave_time,
      half_type:  leave_time === 'half' ? (document.getElementById('el-halftype')?.value || 'first_half') : null,
    });
    toast('Leave updated successfully', 'success');
    closeModal();
    const leaves = await apiGet('/leaves');
    state.leaves  = leaves;
    renderLeavesView();
  } catch (err) { toast(err.message, 'error'); }
}
