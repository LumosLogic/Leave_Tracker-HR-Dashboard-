'use strict';

// ── Check-In Widget ───────────────────────────────────────────────────────────
function renderCheckinWidget(record) {
  const w = document.getElementById('checkin-widget');
  if (!w) return;
  if (!record || !record.check_in) {
    w.innerHTML = `
      <div class="flex flex-col items-center gap-md w-full">
        <div class="text-4xl font-mono font-bold text-on-surface-variant/30 mb-xs tracking-widest">--:--</div>
        <p class="text-label-md text-on-surface-variant mb-sm">Not checked in</p>
        <button class="w-full bg-primary text-on-primary py-md rounded-lg text-label-md font-semibold flex items-center justify-center gap-sm hover:opacity-90 active:scale-95 transition-all" onclick="doCheckIn()">
          <span class="material-symbols-outlined text-[18px]">login</span> Check In
        </button>
      </div>`;
  } else if (!record.check_out) {
    const elapsed = getElapsed(record.check_in);
    w.innerHTML = `
      <div class="flex flex-col items-center gap-md w-full">
        <div class="text-4xl font-mono font-bold text-primary tracking-widest" id="elapsed-time">${elapsed}</div>
        <span class="px-md py-xs rounded-full text-label-sm font-semibold ${record.is_late ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'}">${record.is_late ? 'Late Check-in' : 'Checked In'} · ${fmtTime(record.check_in)}</span>
        <button class="w-full bg-primary text-on-primary py-md rounded-lg text-label-md font-semibold flex items-center justify-center gap-sm hover:opacity-90 active:scale-95 transition-all" onclick="doCheckOut()">
          <span class="material-symbols-outlined text-[18px]">logout</span> Check Out
        </button>
      </div>`;
  } else {
    w.innerHTML = `
      <div class="flex flex-col items-center gap-md w-full">
        <div class="text-4xl font-mono font-bold text-on-surface tracking-widest">${fmtHours(record.work_hours)}</div>
        <div class="flex gap-sm flex-wrap justify-center">
          <span class="px-md py-xs rounded-full text-label-sm font-semibold bg-primary/10 text-primary">${statusLabel(record.status || 'present')}</span>
          ${record.is_late ? `<span class="px-md py-xs rounded-full text-label-sm font-semibold bg-error/10 text-error">Late</span>` : ''}
        </div>
        <p class="text-label-md text-on-surface-variant">Session complete</p>
      </div>`;
  }
}

function getElapsed(checkInTime) {
  const [h, m] = checkInTime.split(':').map(Number);
  const checkIn = new Date(); checkIn.setHours(h, m, 0, 0);
  const diff = Date.now() - checkIn.getTime();
  const totalMin = Math.floor(diff / 60000);
  const hrs = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return hrs > 0 ? `${hrs}h ${min}m` : `${min}m`;
}

function startWidgetTimer() {
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(() => {
    if (state.todayRecord?.check_in && !state.todayRecord?.check_out) {
      const el = document.getElementById('elapsed-time');
      if (el) el.textContent = getElapsed(state.todayRecord.check_in);
    }
  }, 30000);
}

async function loadCheckinWidget() {
  try {
    const record = await apiGet('/attendance/today');
    state.todayRecord = record;
    renderCheckinWidget(record);
    startWidgetTimer();
  } catch (e) { /* silent */ }
}

async function doCheckIn() {
  try {
    const { record, message } = await apiPost('/attendance/checkin', {});
    state.todayRecord = record;
    renderCheckinWidget(record);
    startWidgetTimer();
    toast(message || 'Checked in!', record.is_late ? 'warning' : 'success');
    if (state.view === 'dashboard') loadDashboard();
    if (state.view === 'calendar')  loadCalendar();
  } catch (err) { toast(err.message, 'error'); }
}

async function doCheckOut() {
  try {
    const { record, message } = await apiPost('/attendance/checkout', {});
    state.todayRecord = record;
    renderCheckinWidget(record);
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    toast(message || 'Checked out!', record.status === 'half_day' ? 'warning' : 'success');
    if (state.view === 'dashboard') loadDashboard();
    if (state.view === 'calendar')  loadCalendar();
  } catch (err) { toast(err.message, 'error'); }
}

// ── Right Sidebar (Admin) ─────────────────────────────────────────────────────
function renderRightSidebar(culture) {
  const { birthdaysToday = [], upcomingBirthdays = [], holidays = [], events = [] } = culture || {};
  const isAdmin = state.user.role === 'admin';
  const allBirthdays = [
    ...birthdaysToday.map(b => ({ ...b, when: 'Today' })),
    ...upcomingBirthdays.map(b => ({ ...b, when: `In ${b.days_until} day${b.days_until > 1 ? 's' : ''}` })),
  ];

  const eventsHtml = events.length === 0
    ? `<p class="text-body-md text-on-surface-variant text-center py-md">No upcoming events</p>`
    : events.slice(0, 3).map(ev => {
        const dd = new Date(ev.date + 'T12:00:00');
        return `
          <div class="flex gap-md">
            <div class="w-12 h-12 rounded-lg bg-primary/5 flex flex-col items-center justify-center border border-primary/20 shrink-0">
              <span class="text-[10px] font-bold text-primary uppercase">${dd.toLocaleString('en-US',{month:'short'})}</span>
              <span class="text-title-lg font-semibold text-primary leading-tight">${dd.getDate()}</span>
            </div>
            <div>
              <p class="text-body-md text-on-surface font-bold">${ev.title}</p>
              ${ev.description ? `<p class="text-label-md text-on-surface-variant">${ev.description}</p>` : ''}
              <p class="text-label-sm text-primary mt-xs">${fmtDate(ev.date)}${ev.end_date && ev.end_date !== ev.date ? ' – ' + fmtDate(ev.end_date) : ''}</p>
            </div>
          </div>`;
      }).join('');

  const birthdaysHtml = allBirthdays.length === 0
    ? `<p class="text-body-md text-on-surface-variant text-center py-md">No birthdays in next 7 days</p>`
    : allBirthdays.slice(0, 3).map(b => `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-md">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-on-primary flex-shrink-0"
              style="background:${b.avatar_color || '#4f46e5'}">${initials(b.name)}</div>
            <div>
              <p class="text-body-md text-on-surface font-medium">${b.name}</p>
              <p class="text-[11px] text-on-surface-variant">${b.when}${b.department ? ' · ' + b.department : ''}</p>
            </div>
          </div>
          ${b.when === 'Today' ? `<button class="bg-secondary/10 text-secondary p-xs rounded-full hover:bg-secondary/20 transition-colors"><span class="material-symbols-outlined text-[20px]">celebration</span></button>` : ''}
        </div>`).join('');

  const holidaysHtml = holidays.length === 0
    ? `<p class="text-body-md text-on-surface-variant text-center py-md">No holidays in next 30 days</p>`
    : holidays.slice(0, 3).map(h => `
        <div class="flex items-center justify-between p-md bg-surface-container-low rounded-lg border border-outline-variant/30">
          <div>
            <p class="text-body-md text-on-surface font-bold">${h.name}</p>
            <p class="text-label-md text-on-surface-variant">${fmtDate(h.date)}</p>
          </div>
          <span class="text-tertiary text-label-sm font-bold capitalize">${h.type}</span>
        </div>`).join('');

  return `
    <aside class="w-[320px] space-y-lg hidden xl:block shrink-0">
      <div class="bg-surface-container-lowest p-lg rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-outline-variant">
        <div class="flex items-center justify-between mb-lg">
          <h3 class="text-title-lg font-semibold text-on-surface">Upcoming Events</h3>
          <div class="flex items-center gap-sm">
            ${isAdmin ? `<button class="text-primary text-[12px] font-semibold hover:underline" onclick="openManageEventsModal()">Manage</button>` : ''}
            <span class="material-symbols-outlined text-on-surface-variant">event</span>
          </div>
        </div>
        <div class="space-y-md">${eventsHtml}</div>
        <button class="w-full mt-lg py-md border border-outline-variant rounded-lg text-label-md text-on-surface hover:bg-surface-container-low transition-colors" onclick="navigate('calendar')">View All Events</button>
      </div>

      <div class="bg-surface-container-lowest p-lg rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-outline-variant">
        <div class="flex items-center justify-between mb-lg">
          <h3 class="text-title-lg font-semibold text-on-surface">Birthdays</h3>
          <span class="material-symbols-outlined text-secondary">cake</span>
        </div>
        <div class="space-y-md">${birthdaysHtml}</div>
      </div>

      <div class="bg-surface-container-lowest p-lg rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-outline-variant">
        <div class="flex items-center justify-between mb-lg">
          <h3 class="text-title-lg font-semibold text-on-surface">Holidays</h3>
          <div class="flex items-center gap-sm">
            ${isAdmin ? `<button class="text-primary text-[12px] font-semibold hover:underline" onclick="openManageHolidaysModal()">Manage</button>` : ''}
            <span class="material-symbols-outlined text-tertiary">beach_access</span>
          </div>
        </div>
        <div class="space-y-md">${holidaysHtml}</div>
      </div>

      <div class="relative bg-primary-container overflow-hidden rounded-xl p-lg text-on-primary">
        <div class="relative z-10">
          <h4 class="text-headline-md font-semibold mb-xs">${isAdmin ? 'Leave Policy Update' : 'Need a break?'}</h4>
          <p class="text-label-md opacity-90 mb-lg">${isAdmin ? 'New parental leave guidelines are now active for all employees.' : 'Plan your next vacation or medical leave in seconds.'}</p>
          <button class="bg-surface text-primary px-lg py-md rounded-lg text-label-md font-bold"
            onclick="${isAdmin ? "openManageHolidaysModal()" : "typeof openApplyLeaveModal==='function'?openApplyLeaveModal():navigate('leaves')"}">
            ${isAdmin ? 'Manage Holidays' : 'Request Leave Now'}
          </button>
        </div>
        <div class="absolute -right-8 -bottom-8 opacity-10">
          <span class="material-symbols-outlined text-[120px]">description</span>
        </div>
      </div>
    </aside>`;
}

// ── Admin Dashboard ───────────────────────────────────────────────────────────
function renderAdminDashboard(d, culture, isToday, displayDate) {
  const total = d.totalEmployees || 1;
  const lateCount = (d.recentActivity || []).filter(r => r.is_late).length;
  const earlyExitCount = (d.recentActivity || []).filter(r => r.is_early_exit).length;
  const pendingCount = (d.pendingLeaveList || []).filter(l => l.status === 'pending').length;

  const cards = [
    { label: 'Present',      value: d.presentToday  ?? '—', icon: 'group',           color: 'primary',            pct: Math.min(100, Math.round(((d.presentToday||0)/total)*100)) },
    { label: 'On Leave',     value: d.onLeaveToday  ?? '—', icon: 'event_busy',       color: 'secondary',          pct: Math.min(100, Math.round(((d.onLeaveToday||0)/total)*100)) },
    { label: 'Late Entries', value: lateCount,               icon: 'timer',            color: 'error',              pct: Math.min(100, Math.round((lateCount/total)*100)) },
    { label: 'Early Exits',  value: earlyExitCount,          icon: 'exit_to_app',      color: 'tertiary',           pct: Math.min(100, Math.round((earlyExitCount/total)*100)) },
    { label: 'WFH Users',    value: d.wfhToday      ?? '—', icon: 'home_work',        color: 'primary-container',  pct: Math.min(100, Math.round(((d.wfhToday||0)/total)*100)) },
    { label: 'Pending',      value: pendingCount,            icon: 'pending_actions',  color: 'secondary-container', pct: Math.min(100, Math.round((pendingCount/total)*100)) },
  ];

  const activityRows = (d.recentActivity || []).length === 0
    ? `<tr><td colspan="5" class="px-lg py-2xl text-center text-on-surface-variant text-body-md">No activity recorded${isToday ? ' today' : ' on this date'}</td></tr>`
    : (d.recentActivity || []).map(r => {
        const wsLabel = r.is_late ? 'Late' : r.status === 'wfh' ? 'WFH' : r.status === 'half_day' ? 'Half Day' : r.status === 'absent' ? 'Absent' : 'Present';
        const wsCls   = r.is_late ? 'bg-error/10 text-error' : r.status === 'wfh' ? 'bg-primary-container/10 text-primary-container' : r.status === 'absent' ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary';
        const sysDot  = r.check_out ? 'bg-outline' : r.check_in ? 'bg-green-500' : 'bg-outline';
        const sysLbl  = r.check_out ? 'Checked Out' : r.check_in ? 'Active Now' : 'Not Checked In';
        return `
          <tr class="hover:bg-surface-container-low transition-colors h-[56px]">
            <td class="px-lg py-md">
              <div class="flex items-center gap-md">
                <div class="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-on-primary flex-shrink-0"
                  style="background:${r.avatar_color||'#4f46e5'}">${initials(r.name)}</div>
                <div>
                  <p class="text-body-md text-on-surface font-medium">${r.name}</p>
                  <p class="text-[11px] text-on-surface-variant">${r.department||''}</p>
                </div>
              </div>
            </td>
            <td class="px-lg py-md text-body-md text-on-surface">${r.check_in ? fmtTime(r.check_in) : '—'}</td>
            <td class="px-lg py-md">
              <span class="px-md py-xs rounded-full ${wsCls} text-label-sm font-semibold">${wsLabel}</span>
              ${r.is_early_exit ? `<span class="ml-xs px-md py-xs rounded-full bg-tertiary/10 text-tertiary text-label-sm font-semibold">Early Exit</span>` : ''}
            </td>
            <td class="px-lg py-md">
              <div class="flex items-center gap-xs">
                <div class="w-2 h-2 rounded-full ${sysDot}"></div>
                <span class="text-label-sm text-on-surface-variant">${sysLbl}</span>
              </div>
            </td>
            <td class="px-lg py-md text-right text-label-sm text-on-surface-variant">${r.work_hours ? fmtHours(r.work_hours) : '—'}</td>
          </tr>`;
      }).join('');

  const leaveQueue = (d.pendingLeaveList || []).length === 0 ? '' :
    (d.pendingLeaveList || []).map(l => `
      <div class="flex items-center gap-md p-md rounded-lg hover:bg-surface-container-low transition-colors">
        <div class="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-on-primary flex-shrink-0"
          style="background:${l.avatar_color||'#4f46e5'}">${initials(l.name)}</div>
        <div class="flex-1 min-w-0">
          <p class="text-body-md text-on-surface font-medium truncate">${l.name}</p>
          <p class="text-[11px] text-on-surface-variant">${fmtDateRange(l.start_date, l.end_date)} · <span class="capitalize">${l.leave_type}</span></p>
          ${l.reason ? `<p class="text-[11px] text-on-surface-variant truncate italic">"${l.reason}"</p>` : ''}
        </div>
        <div class="flex flex-col items-end gap-xs shrink-0">
          <span class="px-md py-xs rounded-full text-label-sm font-semibold ${l.status==='approved'?'bg-primary/10 text-primary':l.status==='rejected'?'bg-error/10 text-error':'bg-secondary/10 text-secondary'}">${l.status}</span>
          ${l.status === 'pending' ? `
            <div class="flex gap-xs">
              <button class="p-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors" onclick="approveLeave(${l.id})" title="Approve"><span class="material-symbols-outlined text-[16px]">check</span></button>
              <button class="p-1 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors" onclick="rejectLeave(${l.id})" title="Reject"><span class="material-symbols-outlined text-[16px]">close</span></button>
            </div>` : ''}
        </div>
      </div>`).join('');

  return `
    <div class="p-lg flex gap-lg max-w-container-max mx-auto w-full">
      <div class="flex-1 space-y-lg min-w-0">

        <!-- Header row -->
        <div class="flex items-center justify-between flex-wrap gap-md">
          <div>
            <h2 class="text-title-lg font-semibold text-on-surface">${isToday ? 'Management Console' : `Viewing: ${displayDate}`}</h2>
            <p class="text-body-md text-on-surface-variant">${isToday ? displayDate : 'Historical attendance data'}</p>
          </div>
          <div class="flex items-center gap-sm">
            <div id="checkin-widget" class="flex items-center gap-sm">
              <div class="loading"><div class="spinner" style="width:16px;height:16px"></div></div>
            </div>
            <input type="date"
              class="py-sm px-md text-body-md border border-outline-variant rounded-lg bg-surface-container-low text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all"
              value="${state.dashboardDate || ''}"
              max="${new Date().toISOString().split('T')[0]}"
              onchange="setDashboardDate(this.value)" />
            ${!isToday ? `<button class="py-sm px-md rounded-lg border border-outline-variant text-body-md text-on-surface hover:bg-surface-container-low transition-colors flex items-center gap-xs" onclick="setDashboardDate('')"><span class="material-symbols-outlined text-[16px]">refresh</span> Today</button>` : ''}
          </div>
        </div>

        <!-- Analytics Grid -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-md">
          ${cards.map(c => `
            <div class="bg-surface-container-lowest p-lg rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-outline-variant hover:shadow-[0_8px_20px_rgba(0,0,0,0.06)] transition-all">
              <div class="flex items-center justify-between mb-sm">
                <span class="material-symbols-outlined text-${c.color}">${c.icon}</span>
                <span class="text-label-sm font-semibold text-${c.color} bg-${c.color}/10 px-sm py-xs rounded-full">${c.pct}%</span>
              </div>
              <p class="text-label-md text-on-surface-variant">${c.label}</p>
              <h3 class="text-headline-md font-semibold text-on-surface">${c.value}</h3>
              <div class="mt-md h-1.5 w-full bg-surface-container-high rounded-full overflow-hidden">
                <div class="h-full bg-${c.color} rounded-full" style="width:${Math.max(c.pct, 2)}%"></div>
              </div>
            </div>`).join('')}
        </div>

        <!-- Live Attendance Feed -->
        <section class="bg-surface-container-lowest rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-outline-variant overflow-hidden">
          <div class="p-lg border-b border-outline-variant flex justify-between items-center">
            <div>
              <h2 class="text-title-lg font-semibold text-on-surface">${isToday ? 'Live Attendance Feed' : 'Attendance Records'}</h2>
              <p class="text-body-md text-on-surface-variant">${isToday ? 'Real-time employee check-in monitoring' : displayDate}</p>
            </div>
            <button class="text-primary text-label-md font-semibold hover:underline" onclick="navigate('calendar')">View All Records</button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead class="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th class="px-lg py-md text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider">Employee</th>
                  <th class="px-lg py-md text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider">Check-in Time</th>
                  <th class="px-lg py-md text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider">Work Status</th>
                  <th class="px-lg py-md text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider">System Status</th>
                  <th class="px-lg py-md text-label-sm font-semibold text-on-surface-variant uppercase tracking-wider text-right">Hours</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-outline-variant">${activityRows}</tbody>
            </table>
          </div>
        </section>

        <!-- Pending Leave Requests -->
        ${leaveQueue ? `
        <section class="bg-surface-container-lowest rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.04)] border border-outline-variant overflow-hidden">
          <div class="p-lg border-b border-outline-variant flex justify-between items-center">
            <div>
              <h2 class="text-title-lg font-semibold text-on-surface">Leave Requests</h2>
              <p class="text-body-md text-on-surface-variant">Pending approvals</p>
            </div>
            <button class="text-primary text-label-md font-semibold hover:underline" onclick="navigate('leaves')">View All</button>
          </div>
          <div class="p-lg space-y-xs">${leaveQueue}</div>
        </section>` : ''}
      </div>

      ${renderRightSidebar(culture)}
    </div>`;
}

// ── Employee Dashboard ────────────────────────────────────────────────────────
function renderEmployeeDashboard(d, culture, myStats, isToday, displayDate, greetVerb, firstName) {
  const { birthdaysToday = [], upcomingBirthdays = [], holidays = [], events = [] } = culture || {};
  const allBirthdays = [
    ...birthdaysToday.map(b => ({ ...b, when: 'Today' })),
    ...upcomingBirthdays.map(b => ({ ...b, when: `In ${b.days_until} day${b.days_until > 1 ? 's' : ''}` })),
  ];
  const nextEvent = events[0] || null;

  const statCards = [
    {
      icon: 'calendar_today', iconColor: 'secondary',
      badge: 'Annual', badgeCls: 'bg-secondary/10 text-secondary',
      headline: myStats ? `${20 - (myStats.leavesCount || 0)} Days` : '—',
      label: 'Remaining Leaves',
    },
    {
      icon: 'pie_chart', iconColor: 'tertiary',
      badge: myStats ? `Used ${myStats.leavesCount || 0}/20` : '',
      badgeCls: 'bg-surface-container-high text-on-surface-variant',
      progress: myStats ? Math.min(100, Math.round(((myStats.leavesCount || 0) / 20) * 100)) : 0,
      progressColor: 'bg-tertiary',
      label: 'Leave Balance Progress',
    },
    {
      icon: 'check_circle', iconColor: 'primary',
      badge: 'This Month', badgeCls: 'bg-green-100 text-green-700',
      headline: myStats ? `${myStats.presentCount ?? '—'}` : '—',
      label: 'Days Present',
    },
    {
      icon: 'schedule', iconColor: 'error',
      badge: '', badgeCls: '',
      headline: myStats ? `${myStats.lateCount ?? 0}` : '—',
      label: 'Late Entries',
    },
  ];

  const holidaysHtml = holidays.length === 0
    ? `<p class="text-body-md text-on-surface-variant py-md text-center">No upcoming holidays</p>`
    : holidays.slice(0, 3).map(h => {
        const hd = new Date(h.date + 'T12:00:00');
        return `
          <div class="flex items-center justify-between p-md bg-surface-container-low rounded-lg">
            <div class="flex items-center gap-md">
              <div class="w-12 h-12 bg-surface-container-lowest rounded-lg flex flex-col items-center justify-center shadow-sm border border-outline-variant/30">
                <span class="text-label-sm font-semibold text-error uppercase">${hd.toLocaleString('en-US',{month:'short'})}</span>
                <span class="text-title-lg font-semibold leading-tight">${hd.getDate()}</span>
              </div>
              <div>
                <p class="text-label-md font-bold text-on-surface">${h.name}</p>
                <p class="text-label-sm text-on-surface-variant capitalize">${hd.toLocaleString('en-US',{weekday:'long'})} · ${h.type} Holiday</p>
              </div>
            </div>
            <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
          </div>`;
      }).join('');

  const birthdaysHtml = allBirthdays.length === 0
    ? `<p class="text-body-md text-on-surface-variant text-center py-md">No birthdays in next 7 days</p>`
    : allBirthdays.slice(0, 3).map(b => `
        <div class="flex items-center gap-md">
          <div class="relative">
            <div class="w-12 h-12 rounded-full flex items-center justify-center font-bold text-on-primary"
              style="background:${b.avatar_color||'#4f46e5'}">${initials(b.name)}</div>
            ${b.when === 'Today' ? `<div class="absolute -bottom-1 -right-1 bg-surface-container-lowest p-1 rounded-full shadow-sm"><span class="material-symbols-outlined text-[14px] text-secondary" style="font-variation-settings:'FILL' 1">cake</span></div>` : ''}
          </div>
          <div>
            <p class="text-label-md font-bold text-on-surface">${b.name}</p>
            <p class="text-label-sm text-on-surface-variant">${b.when}${b.department ? ' · ' + b.department : ''}</p>
          </div>
          ${b.when === 'Today' ? `<button class="ml-auto text-primary p-2 hover:bg-primary/10 rounded-full transition-colors"><span class="material-symbols-outlined">send</span></button>` : ''}
        </div>`).join('');

  const myLeaves = (d.pendingLeaveList || []);

  return `
    <div class="p-lg overflow-y-auto">
      <div class="max-w-container-max mx-auto space-y-lg">

        <!-- Welcome + Check-in -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-lg items-stretch">
          <div class="lg:col-span-8 flex flex-col justify-center">
            <h2 class="text-headline-lg font-semibold text-on-surface mb-xs">${greetVerb}, ${firstName}!</h2>
            <p class="text-body-lg text-on-surface-variant">${isToday ? displayDate : `Viewing: ${displayDate}`}</p>
            <div class="flex items-center gap-sm mt-md flex-wrap">
              <input type="date"
                class="py-sm px-md text-body-md border border-outline-variant rounded-lg bg-surface-container-low text-on-surface focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                value="${state.dashboardDate || ''}"
                max="${new Date().toISOString().split('T')[0]}"
                onchange="setDashboardDate(this.value)" />
              ${!isToday ? `<button class="py-sm px-md rounded-lg border border-outline-variant text-body-md text-on-surface hover:bg-surface-container-low transition-colors flex items-center gap-xs" onclick="setDashboardDate('')"><span class="material-symbols-outlined text-[16px]">refresh</span> Today</button>` : ''}
            </div>
          </div>
          <div class="lg:col-span-4 bg-surface-container-lowest rounded-xl p-lg flex flex-col items-center justify-center text-center border border-outline-variant shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <p class="text-label-md text-on-surface-variant uppercase tracking-wider mb-md">Today's Session</p>
            <div id="checkin-widget" class="w-full">
              <div class="loading"><div class="spinner"></div></div>
            </div>
          </div>
        </div>

        <!-- Stats Bento -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-lg">
          ${statCards.map(c => `
            <div class="bg-surface-container-lowest rounded-xl p-lg border border-outline-variant/30 shadow-[0_4px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.06)] transition-all">
              <div class="flex items-center justify-between mb-md">
                <div class="p-2 bg-${c.iconColor}/10 rounded-lg">
                  <span class="material-symbols-outlined text-${c.iconColor}">${c.icon}</span>
                </div>
                ${c.badge ? `<span class="text-label-sm font-semibold px-2 py-1 rounded ${c.badgeCls}">${c.badge}</span>` : ''}
              </div>
              ${c.progress !== undefined
                ? `<div class="w-full bg-surface-container-high h-2 rounded-full overflow-hidden mb-sm"><div class="${c.progressColor} h-full rounded-full" style="width:${Math.max(c.progress,2)}%"></div></div>`
                : `<h4 class="text-headline-md font-semibold text-on-surface">${c.headline}</h4>`}
              <p class="text-label-md text-on-surface-variant mt-xs">${c.label}</p>
            </div>`).join('')}
        </div>

        <!-- Events + Holidays + Side widgets -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-lg">
          <div class="lg:col-span-8 space-y-lg">
            ${nextEvent ? `
              <div class="relative rounded-2xl p-xl overflow-hidden min-h-[180px] flex flex-col justify-center"
                style="background:linear-gradient(135deg,#1a1040 0%,#2d1fb5 55%,#3525cd 100%)">
                <div class="absolute inset-0 opacity-10" style="background-image:linear-gradient(rgba(255,255,255,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.1) 1px,transparent 1px);background-size:24px 24px"></div>
                <div class="relative z-10 space-y-md">
                  <span class="px-md py-xs bg-primary text-on-primary rounded-full text-label-sm font-semibold uppercase">Next Event</span>
                  <h3 class="text-headline-md font-semibold text-white">${nextEvent.title}</h3>
                  ${nextEvent.description ? `<p class="text-white/80 text-body-md">${nextEvent.description}</p>` : ''}
                  <p class="text-white/70 text-label-md">${fmtDate(nextEvent.date)}${nextEvent.end_date && nextEvent.end_date !== nextEvent.date ? ' – ' + fmtDate(nextEvent.end_date) : ''}</p>
                </div>
              </div>` : ''}
            <div class="bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-lg shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
              <div class="flex items-center justify-between mb-lg">
                <h3 class="text-title-lg font-semibold text-on-surface">Upcoming Holidays</h3>
                <button class="text-primary text-label-md font-semibold hover:underline" onclick="navigate('calendar')">View Calendar</button>
              </div>
              <div class="space-y-md">${holidaysHtml}</div>
            </div>
          </div>

          <div class="lg:col-span-4 space-y-lg">
            <div class="bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-lg shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
              <div class="flex items-center gap-sm mb-lg">
                <span class="material-symbols-outlined text-secondary">cake</span>
                <h3 class="text-title-lg font-semibold text-on-surface">Birthdays</h3>
              </div>
              <div class="space-y-lg">${birthdaysHtml}</div>
            </div>
            <div class="bg-primary-container text-on-primary rounded-xl p-lg relative overflow-hidden">
              <div class="relative z-10">
                <h4 class="text-headline-md font-semibold mb-xs">Need a break?</h4>
                <p class="text-label-md opacity-80 mb-md">Plan your next vacation or medical leave in seconds.</p>
                <button class="w-full bg-surface text-primary py-md rounded-lg text-label-md font-bold hover:opacity-90 transition-all"
                  onclick="typeof openApplyLeaveModal==='function'?openApplyLeaveModal():navigate('leaves')">
                  Request Leave Now
                </button>
              </div>
              <span class="material-symbols-outlined absolute -bottom-4 -right-4 text-[120px] opacity-10">beach_access</span>
            </div>
          </div>
        </div>

        <!-- My Leave History -->
        ${myLeaves.length > 0 ? `
          <div class="bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-lg shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <div class="flex items-center justify-between mb-lg">
              <h3 class="text-title-lg font-semibold text-on-surface">My Leave Requests</h3>
              <button class="text-primary text-label-md font-semibold hover:underline" onclick="navigate('leaves')">View All</button>
            </div>
            <div class="space-y-xs">
              ${myLeaves.map(l => {
                const ld = new Date(l.start_date + 'T12:00:00');
                return `
                  <div class="flex items-center gap-md p-md rounded-lg hover:bg-surface-container-low transition-colors">
                    <div class="w-12 h-12 rounded-lg bg-primary/5 border border-primary/20 flex flex-col items-center justify-center shrink-0">
                      <span class="text-[10px] font-bold text-primary uppercase">${ld.toLocaleString('en-US',{month:'short'})}</span>
                      <span class="text-title-lg font-semibold text-primary leading-tight">${ld.getDate()}</span>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-body-md text-on-surface font-medium capitalize">${l.leave_type} Leave</p>
                      <p class="text-[11px] text-on-surface-variant">${fmtDateRange(l.start_date, l.end_date)}</p>
                      ${l.reason ? `<p class="text-[11px] text-on-surface-variant truncate italic">"${l.reason}"</p>` : ''}
                    </div>
                    <span class="px-md py-xs rounded-full text-label-sm font-semibold shrink-0 ${l.status==='approved'?'bg-primary/10 text-primary':l.status==='rejected'?'bg-error/10 text-error':'bg-secondary/10 text-secondary'}">${l.status}</span>
                  </div>`;
              }).join('')}
            </div>
          </div>` : ''}
      </div>
    </div>`;
}

// ── Dashboard Dispatcher ──────────────────────────────────────────────────────
function renderDashboard(d, culture, myStats) {
  const isAdmin   = state.user.role === 'admin';
  const isToday   = d.isToday;
  const displayDate = new Date((d.today || new Date().toISOString().split('T')[0]) + 'T12:00:00')
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const hour      = new Date().getHours();
  const greetVerb = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = state.user.name.split(' ')[0];

  return isAdmin
    ? renderAdminDashboard(d, culture, isToday, displayDate)
    : renderEmployeeDashboard(d, culture, myStats, isToday, displayDate, greetVerb, firstName);
}

// ── Load Dashboard ────────────────────────────────────────────────────────────
async function loadDashboard() {
  setHeaderTitle('Dashboard', 'Overview of attendance');
  const content = document.getElementById('content');
  content.innerHTML = `<div class="loading"><div class="spinner"></div> Loading…</div>`;
  try {
    await apiPost('/attendance/cleanup-orphaned', {}).catch(() => {});
    const qs = state.dashboardDate ? { date: state.dashboardDate } : {};
    const [data, culture, myStats] = await Promise.all([
      apiGet('/dashboard', qs),
      apiGet('/culture').catch(() => ({ birthdaysToday: [], upcomingBirthdays: [], holidays: [], events: [] })),
      (!state.dashboardDate && state.user.role !== 'admin') ? apiGet('/my-stats').catch(() => null) : Promise.resolve(null),
    ]);
    state.dashboard = data;
    content.innerHTML = renderDashboard(data, culture, myStats);
    bindDashboard();
    if (!state.dashboardDate) loadCheckinWidget();
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><p>Failed to load dashboard: ${err.message}</p></div>`;
  }
}

function setDashboardDate(val) {
  state.dashboardDate = val || null;
  loadDashboard();
}

function bindDashboard() {
  // onclick handlers are bound via global window functions
}

// ── Manage Holidays ───────────────────────────────────────────────────────────
async function openManageHolidaysModal() {
  const holidays = await apiGet('/holidays').catch(() => []);
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Manage Holidays</div>
      <button class="btn btn-ghost btn-icon" onclick="closeModal()">${I('x')}</button>
    </div>
    <div class="modal-body">
      <div style="margin-bottom:18px">
        <div style="font-size:.8rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px">Add New Holiday</div>
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Holiday Name</label>
            <input class="form-control" id="h-name" placeholder="e.g. Diwali" />
          </div>
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" class="form-control" id="h-date" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-control" id="h-type">
              <option value="public">Public</option>
              <option value="optional">Optional</option>
              <option value="restricted">Restricted</option>
            </select>
          </div>
          <div class="form-group" style="flex:2">
            <label class="form-label">Description</label>
            <input class="form-control" id="h-desc" placeholder="Optional description" />
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="submitAddHoliday()">Add Holiday</button>
      </div>
      <div style="border-top:1px solid var(--border);padding-top:14px">
        <div style="font-size:.8rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px">All Holidays</div>
        <div id="holiday-list-container">
          ${holidays.length === 0
            ? `<div style="font-size:.82rem;color:var(--text-muted)">No holidays added yet.</div>`
            : holidays.map(h => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-light);gap:8px" id="hrow-${h.id}">
                  <div style="min-width:0">
                    <div style="font-weight:600;font-size:.85rem">${h.name}</div>
                    <div style="font-size:.72rem;color:var(--text-muted)">${fmtDate(h.date)} · <span style="text-transform:capitalize">${h.type}</span></div>
                  </div>
                  <button class="btn btn-danger btn-sm" style="font-size:.72rem;padding:3px 8px" onclick="deleteHoliday(${h.id})">${I('trash')}</button>
                </div>`).join('')}
        </div>
      </div>
    </div>`, 'modal-md');
}

async function submitAddHoliday() {
  const name        = document.getElementById('h-name')?.value?.trim();
  const date        = document.getElementById('h-date')?.value;
  const type        = document.getElementById('h-type')?.value;
  const description = document.getElementById('h-desc')?.value?.trim();
  if (!name) return toast('Enter holiday name', 'warning');
  if (!date) return toast('Select a date', 'warning');
  try {
    await apiPost('/holidays', { name, date, type, description });
    toast('Holiday added!', 'success');
    closeModal();
    openManageHolidaysModal();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteHoliday(id) {
  if (!confirm('Delete this holiday?')) return;
  try {
    await apiDelete(`/holidays/${id}`);
    document.getElementById(`hrow-${id}`)?.remove();
    toast('Holiday deleted', 'info');
  } catch (err) { toast(err.message, 'error'); }
}

// ── Manage Events ─────────────────────────────────────────────────────────────
async function openManageEventsModal() {
  const events = await apiGet('/events').catch(() => []);
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Manage Events</div>
      <button class="btn btn-ghost btn-icon" onclick="closeModal()">${I('x')}</button>
    </div>
    <div class="modal-body">
      <div style="margin-bottom:18px">
        <div style="font-size:.8rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px">Add New Event</div>
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">Event Title</label>
            <input class="form-control" id="ev-title" placeholder="e.g. Team Building Day" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Start Date</label>
            <input type="date" class="form-control" id="ev-date" />
          </div>
          <div class="form-group">
            <label class="form-label">End Date (optional)</label>
            <input type="date" class="form-control" id="ev-end" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <input class="form-control" id="ev-desc" placeholder="Optional description" />
        </div>
        <button class="btn btn-primary btn-sm" onclick="submitAddEvent()">Add Event</button>
      </div>
      <div style="border-top:1px solid var(--border);padding-top:14px">
        <div style="font-size:.8rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px">All Events</div>
        <div id="event-list-container">
          ${events.length === 0
            ? `<div style="font-size:.82rem;color:var(--text-muted)">No events added yet.</div>`
            : events.map(ev => `
                <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-light);gap:8px" id="evrow-${ev.id}">
                  <div style="min-width:0">
                    <div style="font-weight:600;font-size:.85rem">${ev.title}</div>
                    <div style="font-size:.72rem;color:var(--text-muted)">${fmtDate(ev.date)}${ev.end_date && ev.end_date !== ev.date ? ' – ' + fmtDate(ev.end_date) : ''}</div>
                    ${ev.description ? `<div style="font-size:.75rem;color:var(--text-muted)">${ev.description}</div>` : ''}
                  </div>
                  <button class="btn btn-danger btn-sm" style="font-size:.72rem;padding:3px 8px;flex-shrink:0" onclick="deleteEvent(${ev.id})">${I('trash')}</button>
                </div>`).join('')}
        </div>
      </div>
    </div>`, 'modal-md');
}

async function submitAddEvent() {
  const title       = document.getElementById('ev-title')?.value?.trim();
  const date        = document.getElementById('ev-date')?.value;
  const end_date    = document.getElementById('ev-end')?.value || null;
  const description = document.getElementById('ev-desc')?.value?.trim();
  if (!title) return toast('Enter event title', 'warning');
  if (!date)  return toast('Select a date', 'warning');
  try {
    await apiPost('/events', { title, date, end_date, description });
    toast('Event added!', 'success');
    closeModal();
    openManageEventsModal();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteEvent(id) {
  if (!confirm('Delete this event?')) return;
  try {
    await apiDelete(`/events/${id}`);
    document.getElementById(`evrow-${id}`)?.remove();
    toast('Event deleted', 'info');
  } catch (err) { toast(err.message, 'error'); }
}
