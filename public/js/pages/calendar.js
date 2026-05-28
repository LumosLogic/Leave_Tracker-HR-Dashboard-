'use strict';

// ── Calendar Page ─────────────────────────────────────────────────────────────
async function loadCalendar() {
  setHeaderTitle('Calendar', 'Attendance overview');
  const content = document.getElementById('content');
  content.innerHTML = `<div class="loading"><div class="spinner"></div> Loading…</div>`;
  try {
    await Promise.all([
      fetchCalendarData(),
      state.employees.length === 0 ? fetchEmployees() : Promise.resolve(),
    ]);
    renderCalendarView();
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><p>Failed to load calendar: ${err.message}</p></div>`;
  }
}

async function fetchCalendarData() {
  const d     = state.calendarDate;
  const year  = d.getFullYear();
  const month = d.getMonth() + 1;
  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === (today.getMonth() + 1);

  const fetches = [apiGet('/attendance', { year, month })];
  if (isCurrentMonth && state.user?.role === 'admin') {
    fetches.push(apiGet('/clockify/live').catch(() => ({ timers: {} })));
  }
  const [records, liveData] = await Promise.all(fetches);
  if (liveData) clockifyTimers = liveData.timers || {};

  const grouped = {};
  for (const r of records) {
    if (!grouped[r.date]) grouped[r.date] = [];
    grouped[r.date].push(r);
  }
  state.calendarData = grouped;
}

async function fetchEmployees() {
  const emps    = await apiGet('/employees');
  state.employees = emps.filter(e => e.role === 'employee');
}

function renderCalendarView() {
  const content  = document.getElementById('content');
  const isAdmin  = state.user.role === 'admin';
  const culture  = state.culture || {};
  const events   = (culture.events   || []).filter(ev => ev.date >= todayStr()).sort((a,b) => a.date.localeCompare(b.date)).slice(0, 3);
  const bdays    = (culture.birthdays|| []).slice(0, 3);
  const modeMonth = state.calendarMode !== 'week';

  // Compute month totals from calendarData
  let presentTotal = 0, absentTotal = 0, leaveTotal = 0, wfhTotal = 0;
  Object.values(state.calendarData || {}).forEach(records => {
    presentTotal += records.filter(r => r.status === 'present' || r.status === 'half_day').length;
    absentTotal  += records.filter(r => r.status === 'absent').length;
    leaveTotal   += records.filter(r => r.status === 'on_leave').length;
    wfhTotal     += records.filter(r => r.status === 'wfh').length;
  });
  const holidayCount = (culture.holidays || []).length;

  const summaryGrid = isAdmin ? `
    <div class="grid grid-cols-2 md:grid-cols-5 gap-md">
      ${[
        { color: 'bg-emerald-500', label: 'Present',  value: presentTotal  },
        { color: 'bg-red-500',     label: 'Absent',   value: absentTotal   },
        { color: 'bg-amber-500',   label: 'Leave',    value: leaveTotal    },
        { color: 'bg-blue-500',    label: 'WFH',      value: wfhTotal      },
        { color: 'bg-purple-500',  label: 'Holidays', value: holidayCount  },
      ].map(s => `
        <div class="bg-surface-container-lowest p-md rounded-xl border border-outline-variant shadow-sm flex items-center gap-md">
          <span class="w-3 h-3 rounded-full ${s.color} flex-shrink-0"></span>
          <div>
            <p class="text-label-sm text-on-surface-variant uppercase tracking-wider">${s.label}</p>
            <p class="text-title-lg font-bold text-on-surface">${s.value}</p>
          </div>
        </div>`).join('')}
    </div>` : '';

  const eventsHtml = events.length === 0
    ? `<p class="text-label-md text-on-surface-variant">No upcoming events</p>`
    : events.map(ev => {
        const evDate = new Date(ev.date + 'T12:00:00');
        return `
          <div class="flex gap-md p-sm rounded-lg hover:bg-surface-container-low transition-all">
            <div class="w-12 h-12 bg-primary/10 rounded-lg flex flex-col items-center justify-center shrink-0">
              <span class="text-[10px] font-bold text-primary">${MONTHS[evDate.getMonth()].substring(0,3).toUpperCase()}</span>
              <span class="text-lg font-bold text-primary leading-none">${evDate.getDate()}</span>
            </div>
            <div>
              <p class="text-body-md font-semibold text-on-surface">${ev.title || ev.name || ''}</p>
              ${ev.description ? `<p class="text-label-md text-on-surface-variant">${ev.description}</p>` : ''}
            </div>
          </div>`;
      }).join('');

  const bdaysHtml = bdays.length === 0
    ? `<p class="text-label-md text-on-surface-variant">No upcoming birthdays</p>`
    : bdays.map(b => {
        const bDate  = new Date(b.date + 'T12:00:00');
        const now    = new Date();
        const isToday = bDate.getDate() === now.getDate() && bDate.getMonth() === now.getMonth();
        return `
          <div class="flex items-center gap-md">
            <div class="w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-bold text-on-primary flex-shrink-0 relative" style="background:${b.avatar_color || '#4f46e5'}">
              ${initials(b.name)}
              ${isToday ? `<span class="absolute -bottom-0.5 -right-0.5 text-[10px]">🎈</span>` : ''}
            </div>
            <div class="flex-1">
              <p class="text-body-md font-medium text-on-surface">${b.name}</p>
              <p class="text-label-md text-on-surface-variant">${isToday ? 'Today' : MONTHS[bDate.getMonth()].substring(0,3)+' '+bDate.getDate()} · ${b.department || ''}</p>
            </div>
          </div>`;
      }).join('');

  content.innerHTML = `
    <div class="p-lg max-w-container-max mx-auto w-full">
      <div class="flex gap-lg">
        <!-- Main Calendar -->
        <div class="flex-1 space-y-lg min-w-0">

          <!-- Toolbar Card -->
          <div class="bg-surface-container-lowest p-lg rounded-xl shadow-sm border border-outline-variant flex items-center justify-between flex-wrap gap-md">
            <div class="flex items-center gap-md">
              <h2 class="text-headline-md font-semibold text-on-surface" id="cal-title"></h2>
              <div class="flex items-center border border-outline-variant rounded-lg overflow-hidden">
                <button class="p-2 hover:bg-surface-container-low transition-colors" onclick="calNavPrev()">
                  <span class="material-symbols-outlined">chevron_left</span>
                </button>
                <button class="p-2 hover:bg-surface-container-low border-l border-outline-variant transition-colors" onclick="calNavNext()">
                  <span class="material-symbols-outlined">chevron_right</span>
                </button>
              </div>
            </div>
            <div class="flex items-center gap-md">
              <div class="flex p-1 bg-surface-container rounded-lg border border-outline-variant">
                <button id="cal-mode-month" class="px-lg py-1.5 rounded-md text-label-md font-medium transition-all ${modeMonth ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}" onclick="setCalMode('month')">Month</button>
                <button id="cal-mode-week"  class="px-lg py-1.5 rounded-md text-label-md font-medium transition-all ${!modeMonth? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}" onclick="setCalMode('week')">Week</button>
              </div>
              <button class="flex items-center gap-sm border border-outline-variant px-lg py-2 rounded-lg text-label-md hover:bg-surface-container-low transition-all" onclick="calToday()">Today</button>
            </div>
          </div>

          ${summaryGrid}

          <!-- Calendar Body -->
          <div class="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant overflow-hidden">
            <div id="cal-body">
              <div class="flex items-center justify-center p-xl"><div class="spinner"></div></div>
            </div>
          </div>
        </div>

        <!-- Right Sidebar -->
        <aside class="w-80 shrink-0 space-y-lg hidden xl:block">
          <section class="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg">
            <div class="flex items-center justify-between mb-lg">
              <h3 class="text-title-sm font-semibold text-on-surface">Upcoming Events</h3>
            </div>
            <div class="space-y-sm">${eventsHtml}</div>
          </section>

          <section class="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg">
            <div class="flex items-center gap-sm mb-lg">
              <span class="material-symbols-outlined text-secondary">cake</span>
              <h3 class="text-title-sm font-semibold text-on-surface">Birthdays</h3>
            </div>
            <div class="space-y-md">${bdaysHtml}</div>
          </section>

          <section class="bg-primary-container text-on-primary rounded-xl p-lg relative overflow-hidden shadow-md">
            <div class="relative z-10">
              <h4 class="text-label-sm uppercase tracking-wider opacity-80 mb-sm">${isAdmin ? 'Monthly Attendance' : 'Your Attendance'}</h4>
              <p class="text-display-lg font-bold">${isAdmin ? presentTotal : '—'}</p>
              <p class="text-label-md mt-md flex items-center gap-xs">
                <span class="material-symbols-outlined text-[16px]">trending_up</span>
                ${isAdmin ? 'Total present records this month' : 'Check-ins this month'}
              </p>
            </div>
            <div class="absolute -right-4 -bottom-4 opacity-10">
              <span class="material-symbols-outlined text-[120px]">bar_chart</span>
            </div>
          </section>
        </aside>
      </div>
    </div>`;

  renderCalBody();
}

function renderCalBody() {
  const body    = document.getElementById('cal-body');
  const titleEl = document.getElementById('cal-title');
  if (!body || !titleEl) return;
  if (state.calendarMode === 'month') {
    titleEl.textContent = `${MONTHS[state.calendarDate.getMonth()]} ${state.calendarDate.getFullYear()}`;
    body.innerHTML = renderMonthView();
  } else {
    const weekDates = getWeekDates(state.calendarDate);
    const s = weekDates[0]; const e = weekDates[6];
    titleEl.textContent = s.getMonth() === e.getMonth()
      ? `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`
      : `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
    body.innerHTML = renderWeekView(weekDates);
  }
  // Sync mode button styles
  const mMonth = document.getElementById('cal-mode-month');
  const mWeek  = document.getElementById('cal-mode-week');
  if (mMonth && mWeek) {
    const activeC   = 'px-lg py-1.5 rounded-md text-label-md font-medium transition-all bg-surface-container-lowest text-primary shadow-sm';
    const inactiveC = 'px-lg py-1.5 rounded-md text-label-md font-medium transition-all text-on-surface-variant hover:text-on-surface';
    mMonth.className = state.calendarMode === 'month' ? activeC : inactiveC;
    mWeek.className  = state.calendarMode === 'week'  ? activeC : inactiveC;
  }
}

function calNavPrev() {
  if (state.calendarMode === 'month') {
    state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() - 1, 1);
  } else {
    const d = new Date(state.calendarDate); d.setDate(d.getDate() - 7);
    state.calendarDate = d;
  }
  fetchCalendarData().then(renderCalBody);
}
function calNavNext() {
  if (state.calendarMode === 'month') {
    state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + 1, 1);
  } else {
    const d = new Date(state.calendarDate); d.setDate(d.getDate() + 7);
    state.calendarDate = d;
  }
  fetchCalendarData().then(renderCalBody);
}
function calToday() {
  state.calendarDate = new Date();
  fetchCalendarData().then(renderCalBody);
}
function setCalMode(mode) {
  state.calendarMode = mode;
  renderCalBody();
}

// ── Month View ────────────────────────────────────────────────────────────────
function renderMonthView() {
  const year     = state.calendarDate.getFullYear();
  const month    = state.calendarDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const today    = todayStr();
  const isAdmin  = state.user.role === 'admin';

  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startDate.getDay());
  const endDate = new Date(lastDay);
  endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

  let cells = '';
  let cur = new Date(startDate);
  while (cur <= endDate) {
    const ds       = toISODate(cur);
    const isOther  = cur.getMonth() !== month;
    const isTodayD = ds === today;
    const isWkend  = cur.getDay() === 0 || cur.getDay() === 6;
    const records  = state.calendarData[ds] || [];

    let bg = isOther ? 'bg-surface/30' : isWkend ? 'bg-surface-container/30' : '';
    if (isTodayD) bg = 'bg-primary-container/5 ring-1 ring-inset ring-primary';
    const dateClass = isOther ? 'text-label-md text-outline'
                    : isTodayD ? 'text-label-md font-bold text-primary'
                    : 'text-label-md font-medium text-on-surface';
    const badge = isTodayD ? `<span class="text-[9px] bg-primary text-on-primary px-1 rounded leading-tight">Today</span>` : '';

    let cellInner = '';
    if (!isOther && !isWkend) {
      cellInner = isAdmin ? renderAdminCellContent(ds, records) : renderEmployeeCellContent(ds, records);
    }

    cells += `
      <div class="p-md border-r border-b border-outline-variant/60 ${bg} hover:bg-surface-container-low transition-all cursor-pointer flex flex-col gap-xs min-h-[80px]" onclick="openDayModal('${ds}')">
        <div class="flex justify-between items-start">
          <span class="${dateClass}">${cur.getDate()}</span>
          ${badge}
        </div>
        ${cellInner}
      </div>`;
    cur.setDate(cur.getDate() + 1);
  }

  const headers = DAYS.map(d => `<div class="p-md text-center text-label-sm font-semibold text-on-surface-variant">${d.toUpperCase()}</div>`).join('');

  return `
    <div class="grid border-b border-outline-variant bg-surface-container-low" style="grid-template-columns:repeat(7,1fr)">${headers}</div>
    <div class="grid" style="grid-template-columns:repeat(7,1fr);min-height:480px">${cells}</div>`;
}

function renderAdminCellContent(ds, records) {
  if (ds > todayStr()) return '';
  if (state.employees.length === 0) return '';
  const present  = records.filter(r => r.status === 'present' || r.status === 'half_day').length;
  const onLeave  = records.filter(r => r.status === 'on_leave').length;
  const absent   = records.filter(r => r.status === 'absent').length;
  const wfh      = records.filter(r => r.status === 'wfh').length;
  const late     = records.filter(r => r.is_late).length;

  const dots = [];
  for (let i = 0; i < Math.min(present, 3); i++)          dots.push('bg-emerald-500');
  for (let i = 0; i < Math.min(onLeave + absent, 2); i++) dots.push('bg-red-500');
  for (let i = 0; i < Math.min(wfh, 2); i++)              dots.push('bg-blue-500');
  if (late > 0) dots.push('bg-orange-400');

  return `<div class="flex flex-wrap gap-0.5">${dots.slice(0, 8).map(c => `<div class="w-2 h-2 rounded-full ${c}"></div>`).join('')}</div>`;
}

function renderEmployeeCellContent(ds, records) {
  const myRecord = records.find(r => r.user_id === state.user.id);
  if (!myRecord) return '';
  const dotColors = { present: 'bg-emerald-500', absent: 'bg-red-500', on_leave: 'bg-amber-500', half_day: 'bg-blue-500', wfh: 'bg-cyan-500' };
  const dot = dotColors[myRecord.status] || 'bg-outline';
  const mods = [
    myRecord.is_late       ? `<span class="text-[9px] bg-orange-100 text-orange-700 px-1 py-0.5 rounded font-semibold">Late</span>`  : '',
    myRecord.is_early_exit ? `<span class="text-[9px] bg-purple-100 text-purple-700 px-1 py-0.5 rounded font-semibold">Early</span>` : '',
  ].filter(Boolean);
  return `
    <div class="flex items-center gap-xs">
      <div class="w-2 h-2 rounded-full ${dot} flex-shrink-0"></div>
      <span class="text-[10px] text-on-surface-variant capitalize">${statusLabel(myRecord.status)}</span>
    </div>
    ${mods.length ? `<div class="flex gap-xs flex-wrap">${mods.join('')}</div>` : ''}
    ${myRecord.work_hours ? `<div class="text-[10px] text-on-surface-variant">${fmtHours(myRecord.work_hours)}</div>` : ''}`;
}

// ── Week View ─────────────────────────────────────────────────────────────────
function renderWeekView(weekDates) {
  const today   = todayStr();
  const isAdmin = state.user.role === 'admin';
  const emps    = state.employees;
  const dotColors = { present: 'bg-emerald-500', absent: 'bg-red-500', on_leave: 'bg-amber-500', half_day: 'bg-blue-500', wfh: 'bg-cyan-500' };

  const cols = weekDates.map(date => {
    const ds      = toISODate(date);
    const records = state.calendarData[ds] || [];
    const isToday = ds === today;
    const isWknd  = date.getDay() === 0 || date.getDay() === 6;
    const bgCell  = isToday ? 'bg-primary-container/5 ring-1 ring-inset ring-primary'
                  : isWknd  ? 'bg-surface-container/30' : '';

    let empRows = '';
    if (isWknd) {
      empRows = `<p class="text-[10px] text-on-surface-variant text-center p-sm">Weekend</p>`;
    } else if (isAdmin) {
      if (emps.length === 0) {
        empRows = `<p class="text-[10px] text-on-surface-variant text-center p-sm">No data</p>`;
      } else {
        empRows = emps.slice(0, 7).map(emp => {
          const r      = records.find(x => x.user_id === emp.id);
          const status = r ? r.status : '';
          const dot    = dotColors[status] || 'bg-outline/30';
          return `
            <div class="flex items-center gap-xs px-sm py-0.5 hover:bg-surface-container rounded transition-colors">
              <div class="w-1.5 h-1.5 rounded-full ${dot} flex-shrink-0"></div>
              <span class="text-[10px] text-on-surface truncate">${emp.name.split(' ')[0]}</span>
              ${r?.is_late ? '<span class="text-[8px] text-orange-500">⏰</span>' : ''}
            </div>`;
        }).join('');
        if (emps.length > 7) {
          empRows += `<p class="text-[10px] text-on-surface-variant text-center px-sm">+${emps.length - 7} more</p>`;
        }
      }
    } else {
      const r      = records.find(x => x.user_id === state.user.id);
      const status = r ? r.status : (ds <= today && !isWknd ? 'present' : '');
      const dot    = dotColors[status] || '';
      empRows = status ? `
        <div class="px-sm py-xs text-center">
          <div class="flex items-center justify-center gap-xs mb-xs">
            ${dot ? `<div class="w-2 h-2 rounded-full ${dot}"></div>` : ''}
            <span class="text-[10px] font-semibold text-on-surface capitalize">${statusLabel(status)}</span>
          </div>
          ${r?.check_in  ? `<p class="text-[9px] text-on-surface-variant">${fmtTime(r.check_in)}${r.check_out?'–'+fmtTime(r.check_out):''}</p>` : ''}
          ${r?.work_hours ? `<p class="text-[10px] font-bold text-primary">${fmtHours(r.work_hours)}</p>` : ''}
          ${r?.is_late       ? '<span class="text-[9px] bg-orange-100 text-orange-700 px-1 rounded">Late</span>' : ''}
          ${r?.is_early_exit ? '<span class="text-[9px] bg-purple-100 text-purple-700 px-1 rounded">Early</span>' : ''}
        </div>` : `<p class="text-[10px] text-on-surface-variant text-center p-sm">—</p>`;
    }

    return `
      <div class="border-r border-b border-outline-variant/60 ${bgCell} transition-all flex flex-col">
        <div class="p-sm border-b border-outline-variant/60 bg-surface-container-low cursor-pointer hover:bg-surface-container transition-colors" onclick="openDayModal('${ds}')">
          <p class="text-[10px] font-semibold text-on-surface-variant uppercase">${DAYS_FULL[date.getDay()].substring(0,3)}</p>
          <p class="text-label-md font-bold ${isToday ? 'text-primary' : 'text-on-surface'}">${date.getDate()}</p>
          <p class="text-[9px] text-on-surface-variant">${MONTHS[date.getMonth()].substring(0,3)}</p>
        </div>
        <div class="flex-1 p-xs space-y-0.5">${empRows}</div>
      </div>`;
  });

  return `<div class="grid" style="grid-template-columns:repeat(7,1fr);min-height:480px">${cols.join('')}</div>`;
}

// ── Day Modal ─────────────────────────────────────────────────────────────────
function renderEmpRow(r, ds, showLive) {
  const st      = r.status || '';
  const isLeave = st === 'on_leave';
  const userId  = r.user_id || r.id;
  const statusColors = {
    present: 'bg-primary/10 text-primary', absent: 'bg-error/10 text-error',
    on_leave: 'bg-secondary/10 text-secondary', half_day: 'bg-blue-500/10 text-blue-600',
    wfh: 'bg-cyan-500/10 text-cyan-700',
  };
  const statusCl = statusColors[st] || 'bg-outline/10 text-outline';

  return `
    <div class="flex items-start gap-md py-md border-b border-outline-variant/20 last:border-b-0" id="emp-row-${userId}">
      <div class="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-on-primary flex-shrink-0" style="background:${r.avatar_color||'#4f46e5'}">${initials(r.name)}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-sm flex-wrap">
          <span class="text-body-md font-semibold text-on-surface">${r.name}</span>
          ${st ? `<span class="inline-flex items-center px-sm py-0.5 rounded-full text-label-sm font-medium ${statusCl} capitalize">${statusLabel(st)}</span>` : ''}
          ${r.is_late       ? `<span class="inline-flex items-center px-sm py-0.5 rounded-full text-label-sm font-medium bg-orange-100 text-orange-700">Late</span>` : ''}
          ${r.is_early_exit ? `<span class="inline-flex items-center px-sm py-0.5 rounded-full text-label-sm font-medium bg-purple-100 text-purple-700">Early Exit</span>` : ''}
        </div>
        <p class="text-label-sm text-on-surface-variant mt-0.5">${r.department || ''}</p>
        ${!r.no_record && r.check_in ? `
          <div class="flex items-center gap-md mt-sm text-label-sm text-on-surface-variant">
            <span class="flex items-center gap-xs"><span class="material-symbols-outlined text-[13px]">login</span> ${fmtTime(r.check_in)}</span>
            ${r.check_out ? `<span class="flex items-center gap-xs"><span class="material-symbols-outlined text-[13px]">logout</span> ${fmtTime(r.check_out)}</span>` : ''}
            ${r.work_hours ? `<span class="text-primary font-semibold">${fmtHours(r.work_hours)}</span>` : ''}
          </div>` : ''}
        ${!isLeave && showLive ? `
          <div id="cfy-${userId}" class="mt-sm">
            <span class="text-label-sm text-on-surface-variant">Fetching Clockify…</span>
          </div>` : ''}
        ${!isLeave && !showLive ? `
          <div class="mt-sm inline-flex items-center gap-sm bg-surface-container border border-outline-variant rounded-lg px-sm py-xs">
            <span class="text-body-md font-bold text-primary font-mono">${r.cfy_hours ? fmtHours(r.cfy_hours) : (r.work_hours ? fmtHours(r.work_hours) : '—')}</span>
            <span class="text-label-sm text-on-surface-variant">Clockify Total</span>
          </div>` : ''}
        ${isLeave ? `<p class="mt-sm text-label-sm text-secondary italic">On approved leave — no tracking</p>` : ''}
      </div>
      ${state.user.role === 'admin' ? `
        <div class="flex flex-col gap-xs flex-shrink-0">
          <button class="flex items-center gap-xs text-label-sm text-on-surface-variant hover:text-primary border border-outline-variant rounded-lg px-sm py-xs hover:border-primary transition-all" onclick="openEditAttModal(${userId},'${ds}')">
            <span class="material-symbols-outlined text-[14px]">edit</span> Edit
          </button>
          ${st !== 'absent' ? `<button class="flex items-center gap-xs text-label-sm text-on-surface-variant hover:text-error border border-outline-variant rounded-lg px-sm py-xs hover:border-error transition-all" onclick="markAbsentInModal(${userId},'${ds}')">
            <span class="material-symbols-outlined text-[14px]">close</span> Absent
          </button>` : ''}
        </div>` : ''}
    </div>`;
}

async function openDayModal(ds) {
  const records = state.calendarData[ds] || [];
  const date    = new Date(ds + 'T12:00:00');
  const dayName = DAYS_FULL[date.getDay()];
  const isAdmin = state.user.role === 'admin';
  const isWknd  = date.getDay() === 0 || date.getDay() === 6;
  const emps    = state.employees;
  const isToday = ds === todayStr();

  if (isToday) {
    stopClockifyLive();
    try {
      const { timers } = await apiGet('/clockify/live');
      clockifyTimers = timers || {};
    } catch { clockifyTimers = {}; }
  }

  let clockifyDayHours = {};
  if (!isToday && ds < todayStr()) {
    try {
      const { hours } = await apiGet('/clockify/day', { date: ds });
      clockifyDayHours = hours || {};
    } catch { /* silent */ }
  }

  const onLeaveIds  = new Set(records.filter(r => r.status === 'on_leave').map(r => r.user_id));
  const totalEmps   = emps.length;
  const onLeave     = onLeaveIds.size;
  const present     = totalEmps - onLeave;
  const absent      = onLeave;
  const late        = records.filter(r => r.is_late).length;

  let empRows = '';
  if (isAdmin) {
    const merged = isWknd ? records : emps.map(emp => {
      const r         = records.find(x => x.user_id === emp.id);
      const cfy_hours = clockifyDayHours[emp.id] || 0;
      if (r) return { ...emp, ...r, cfy_hours };
      return { ...emp, status: ds <= todayStr() ? 'present' : '', no_record: true, cfy_hours };
    });
    empRows = merged.length === 0
      ? `<div class="empty-state"><div class="empty-icon">📭</div><p>No records for this day</p></div>`
      : merged.map(r => renderEmpRow(r, ds, isToday)).join('');
  } else {
    const r         = records.find(x => x.user_id === state.user.id);
    const cfy_hours = clockifyDayHours[state.user.id] || 0;
    if (!r) {
      empRows = ds > todayStr()
        ? `<div class="empty-state"><div class="empty-icon">📅</div><p>Future date — no record yet</p></div>`
        : isWknd
          ? `<div class="empty-state"><div class="empty-icon">🏖️</div><p>Weekend</p></div>`
          : `<div class="employee-detail-item">
               <div class="emp-detail-info"><div class="emp-detail-name">${state.user.name}</div></div>
               <span class="status-badge present">Present</span>
             </div>`;
    } else {
      empRows = renderEmpRow({ ...state.user, ...r, user_id: state.user.id, cfy_hours }, ds, isToday && r.status !== 'on_leave');
    }
  }

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${dayName}, ${fmtDate(ds)}</div>
      <button class="btn btn-ghost btn-icon" onclick="closeModal()">${I('x')}</button>
    </div>
    <div class="modal-body">
      ${isAdmin ? `
        <div class="flex items-center gap-md mb-lg flex-wrap">
          <div class="w-12 h-12 bg-surface-container rounded-xl flex flex-col items-center justify-center border border-outline-variant flex-shrink-0">
            <span class="text-[10px] font-bold text-on-surface-variant uppercase">${MONTHS[date.getMonth()].substring(0,3)}</span>
            <span class="text-title-lg font-bold text-on-surface">${date.getDate()}</span>
          </div>
          <div class="flex-1">
            <p class="text-title-sm font-semibold text-on-surface">${MONTHS[date.getMonth()]} ${date.getFullYear()}</p>
            <div class="flex items-center gap-sm flex-wrap mt-xs">
              ${present ? `<span class="inline-flex items-center px-sm py-0.5 rounded-full text-label-sm font-medium bg-emerald-100 text-emerald-700">${present} Present</span>` : ''}
              ${onLeave ? `<span class="inline-flex items-center px-sm py-0.5 rounded-full text-label-sm font-medium bg-amber-100 text-amber-700">${onLeave} On Leave</span>` : ''}
              ${absent  ? `<span class="inline-flex items-center px-sm py-0.5 rounded-full text-label-sm font-medium bg-red-100 text-red-700">${absent} Absent</span>` : ''}
              ${late    ? `<span class="inline-flex items-center px-sm py-0.5 rounded-full text-label-sm font-medium bg-orange-100 text-orange-700">${late} Late</span>` : ''}
            </div>
          </div>
          <button class="flex items-center gap-sm border border-outline-variant px-lg py-sm rounded-lg text-label-md hover:bg-surface-container-low transition-all" onclick="syncClockifyDay('${ds}')">
            <span class="material-symbols-outlined text-[16px]">sync</span> Sync Clockify
          </button>
        </div>` : ''}
      <div>${empRows}</div>
    </div>`, 'modal-lg');

  if (isToday) {
    updateClockifyDom();
    clockifyLiveInterval = setInterval(tickClockifyTimers, 1000);
    setTimeout(() => { if (clockifyLiveInterval) startClockifyLive(); }, 120000);
  }
}

// ── Clockify Live Timers ──────────────────────────────────────────────────────
function liveElapsed(startISO) {
  const diff = Date.now() - new Date(startISO).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function updateClockifyDom() {
  Object.entries(clockifyTimers).forEach(([userId, timer]) => {
    const el = document.getElementById(`cfy-${userId}`);
    if (!el) return;
    if (timer.running && timer.start) {
      el.innerHTML = `
        <div class="inline-flex items-center gap-sm bg-emerald-50 border border-emerald-200 rounded-lg px-sm py-xs">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]"></span>
          <span class="text-label-sm font-bold text-emerald-800 font-mono" id="cfy-time-${userId}">${liveElapsed(timer.start)}</span>
          <span class="text-label-sm text-emerald-600">Clockify Live</span>
        </div>
        ${timer.description ? `<span class="text-label-sm text-on-surface-variant italic ml-sm">${timer.description}</span>` : ''}`;
    } else {
      el.innerHTML = `<span class="text-label-sm text-on-surface-variant">Not tracking on Clockify</span>`;
    }
  });
}
function tickClockifyTimers() {
  Object.entries(clockifyTimers).forEach(([userId, timer]) => {
    if (!timer.running || !timer.start) return;
    const el = document.getElementById(`cfy-time-${userId}`);
    if (el) el.textContent = liveElapsed(timer.start);
  });
}
async function startClockifyLive() {
  stopClockifyLive();
  try {
    const { timers } = await apiGet('/clockify/live');
    clockifyTimers   = timers || {};
    updateClockifyDom();
    clockifyLiveInterval = setInterval(tickClockifyTimers, 1000);
    setTimeout(() => { if (clockifyLiveInterval) startClockifyLive(); }, 120000);
  } catch { /* silent */ }
}
function stopClockifyLive() {
  if (clockifyLiveInterval) { clearInterval(clockifyLiveInterval); clockifyLiveInterval = null; }
  clockifyTimers = {};
}
async function syncClockifyDay(ds) {
  try {
    toast('Syncing Clockify data…', 'info');
    const result = await apiPost('/clockify/sync', { date: ds });
    toast(`Synced ${result.synced} users from Clockify`, 'success');
    await fetchCalendarData();
    closeModal();
    openDayModal(ds);
  } catch (err) { toast('Clockify sync: ' + err.message, 'error'); }
}

// ── Admin Attendance Edit ─────────────────────────────────────────────────────
async function openEditAttModal(userId, ds) {
  const records = state.calendarData[ds] || [];
  const r   = records.find(x => x.user_id === parseInt(userId));
  const emp = [...(state.employees || [])].find(e => e.id === parseInt(userId)) || {};
  closeModal();
  openModal(`
    <div class="modal-header">
      <div class="modal-title">${I('edit')} Edit Attendance — ${emp.name || ''}</div>
      <button class="btn btn-ghost btn-icon" onclick="closeModal();openDayModal('${ds}')">${I('x')}</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Date</label>
        <div style="font-size:.9rem;font-weight:600;padding:8px 0;color:var(--text)">${fmtDate(ds)}</div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Check-In Time</label>
          <input type="time" class="form-control" id="att-ci" value="${(r?.check_in || '').slice(0,5)}" />
        </div>
        <div class="form-group">
          <label class="form-label">Check-Out Time</label>
          <input type="time" class="form-control" id="att-co" value="${(r?.check_out || '').slice(0,5)}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-control" id="att-status">
          <option value="present"  ${(r?.status||'present')==='present' ?'selected':''}>Present</option>
          <option value="absent"   ${r?.status==='absent'  ?'selected':''}>Absent</option>
          <option value="half_day" ${r?.status==='half_day'?'selected':''}>Half Day</option>
          <option value="wfh"      ${r?.status==='wfh'     ?'selected':''}>Work From Home</option>
          <option value="on_leave" ${r?.status==='on_leave'?'selected':''}>On Leave</option>
        </select>
      </div>
      <div style="display:flex;gap:20px;margin-bottom:14px">
        <label style="display:flex;align-items:center;gap:6px;font-size:.85rem;cursor:pointer">
          <input type="checkbox" id="att-late"  ${r?.is_late       ?'checked':''} /> Late Entry
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:.85rem;cursor:pointer">
          <input type="checkbox" id="att-early" ${r?.is_early_exit ?'checked':''} /> Early Exit
        </label>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <input class="form-control" id="att-notes" value="${r?.notes||''}" placeholder="Optional notes…" />
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal();openDayModal('${ds}')">Back</button>
      <button class="btn btn-primary" onclick="submitEditAtt(${userId},'${ds}',${r?.id||'null'})">Save Changes</button>
    </div>`, 'modal-md');
}

async function submitEditAtt(userId, ds, existingId) {
  const check_in      = document.getElementById('att-ci')?.value    || null;
  const check_out     = document.getElementById('att-co')?.value    || null;
  const status        = document.getElementById('att-status')?.value;
  const is_late       = document.getElementById('att-late')?.checked;
  const is_early_exit = document.getElementById('att-early')?.checked;
  const notes         = document.getElementById('att-notes')?.value  || '';
  try {
    if (existingId && existingId !== 'null') {
      await apiPut(`/attendance/${existingId}`, { check_in, check_out, status, is_late, is_early_exit, notes });
    } else {
      await apiPost('/attendance/admin-edit', { user_id: parseInt(userId), date: ds, check_in, check_out, status, is_late, is_early_exit, notes });
    }
    toast('Attendance updated', 'success');
    await fetchCalendarData();
    closeModal();
    openDayModal(ds);
  } catch (err) { toast(err.message, 'error'); }
}

async function markAbsentInModal(userId, ds) {
  if (!confirm('Mark this employee as absent for ' + fmtDate(ds) + '?')) return;
  try {
    await apiPost('/attendance/mark-absent', { user_id: parseInt(userId), date: ds });
    toast('Marked as absent', 'warning');
    await fetchCalendarData();
    closeModal();
    openDayModal(ds);
  } catch (err) { toast(err.message, 'error'); }
}
