import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Clock, Home, Umbrella, UserCheck, XCircle, Timer, Play, Pause, Square, ChevronDown, ChevronUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { StatusBadge, LeaveTypeBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  fmtDate, fmtTime, fmtHours, toISODate, todayStr, statusLabel,
  MONTHS, DAYS, DAYS_FULL, getWeekDates, initials, cn
} from '@/lib/utils';

const LEAVE_TYPE_LABEL = { annual:'Annual', sick:'Sick', casual:'Casual', emergency:'Emergency', other:'Other' };

export default function Calendar() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [date, setDate]   = useState(new Date());
  const [mode, setMode]   = useState('month');
  const [dayModal, setDayModal] = useState(null);
  const [editModal, setEditModal] = useState(null);

  const year  = date.getFullYear();
  const month = date.getMonth() + 1;
  const today = new Date();

  const { data: attendance = [], isLoading, refetch } = useQuery({
    queryKey: ['calendar', year, month],
    queryFn: () => apiGet('/attendance', { year, month }),
  });

  // Fetch leaves for the month to show leave types in calendar
  const { data: leaves = [] } = useQuery({
    queryKey: ['calendar-leaves', year, month],
    queryFn: () => apiGet('/leaves', { year, month }),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-list'],
    queryFn: async () => {
      const all = await apiGet('/employees');
      return all.filter(e => e.role === 'employee');
    },
  });

  // Build attendance map + overlay approved leaves so calendar cells always show leave status
  const grouped = {};
  attendance.forEach(r => {
    if (!grouped[r.date]) grouped[r.date] = [];
    grouped[r.date].push(r);
  });

  // Overlay approved leaves: employees on leave appear in calendar even with no attendance record
  leaves.filter(l => l.status === 'approved').forEach(l => {
    const start = new Date(l.start_date + 'T12:00:00');
    const end   = new Date(l.end_date   + 'T12:00:00');
    const leaveStatus = l.leave_time === 'wfh' ? 'wfh'
                      : l.leave_time === 'half' ? 'half_day'
                      : 'on_leave';
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue; // Skip Saturday and Sunday
      const ds = toISODate(d);
      if (!grouped[ds]) grouped[ds] = [];
      const existingIdx = grouped[ds].findIndex(r => r.user_id === l.user_id);
      if (existingIdx === -1) {
        grouped[ds].push({ user_id: l.user_id, date: ds, status: leaveStatus, _synthetic: true });
      } else if (
        !['on_leave', 'wfh', 'half_day'].includes(grouped[ds][existingIdx].status) &&
        !grouped[ds][existingIdx].check_in
      ) {
        // Only override with leave status if the employee didn't actually clock in
        grouped[ds][existingIdx] = { ...grouped[ds][existingIdx], status: leaveStatus };
      }
    }
  });

  // Build a map: userId → [leave records] for quick lookup of leave type
  const leavesByUser = leaves.reduce((acc, l) => {
    if (!acc[l.user_id]) acc[l.user_id] = [];
    acc[l.user_id].push(l);
    return acc;
  }, {});

  // For a given user + date, find the relevant leave (if any)
  function getLeaveForDate(userId, dateStr) {
    return (leavesByUser[userId] || []).find(l =>
      l.status === 'approved' && dateStr >= l.start_date && dateStr <= l.end_date
    ) || null;
  }

  function navPrev() {
    if (mode === 'month') setDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    else { setDate(d => { const x = new Date(d); x.setDate(x.getDate() - 7); return x; }); }
  }
  function navNext() {
    if (mode === 'month') setDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    else { setDate(d => { const x = new Date(d); x.setDate(x.getDate() + 7); return x; }); }
  }

  const weekDates = getWeekDates(date);
  const titleText = mode === 'month'
    ? `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
    : (() => {
        const s = weekDates[0]; const e = weekDates[6];
        return s.getMonth() === e.getMonth()
          ? `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`
          : `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
      })();

  if (isLoading) return <div className="loading"><span className="spinner" /> Loading…</div>;

  return (
    <div>
      {/* Toolbar */}
      <div className="card px-5 py-3.5 mb-5 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button className="btn btn-outline btn-icon p-1.5" onClick={navPrev}><ChevronLeft size={18} /></button>
          <span className="text-base font-black min-w-[200px] text-center tracking-tight"
            style={{ background: 'linear-gradient(135deg, #151c27 30%, #3525cd)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            {titleText}
          </span>
          <button className="btn btn-outline btn-icon p-1.5" onClick={navNext}><ChevronRight size={18} /></button>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => setDate(new Date())}>Today</button>
        <div className="flex bg-[#f0f3ff] border border-[#c7c4d8] rounded-xl p-1 gap-1">
          {['month','week'].map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={cn('px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-150', mode === m ? 'bg-white text-[#3525cd] shadow-sm' : 'text-[#777587] hover:text-[#151c27]')}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <div className="hidden lg:flex items-center gap-3.5 ml-auto flex-wrap">
          {[['#10B981','Present'],['#EF4444','Absent'],['#F59E0B','On Leave'],['#4f46e5','Half Day'],['#3525cd','WFH']].map(([c, l]) => (
            <div key={l} className="flex items-center gap-1.5 text-xs text-[#777587] font-semibold">
              <span className="w-2 h-2 rounded-full" style={{ background: c, boxShadow: `0 0 5px ${c}` }} /> {l}
            </div>
          ))}
        </div>
      </div>

      {/* Calendar Body */}
      {mode === 'month'
        ? <MonthView year={year} month={month - 1} grouped={grouped} employees={employees} user={user} isAdmin={isAdmin} onDayClick={setDayModal} />
        : <WeekView weekDates={weekDates} grouped={grouped} employees={employees} user={user} isAdmin={isAdmin} onDayClick={setDayModal} getLeaveForDate={getLeaveForDate} />
      }

      {/* Day Modal */}
      {dayModal && (
        <DayModal dateStr={dayModal} records={grouped[dayModal] || []} employees={employees} isAdmin={isAdmin} user={user}
          getLeaveForDate={getLeaveForDate}
          onClose={() => setDayModal(null)} onEditAtt={r => { setDayModal(null); setEditModal(r); }} onRefresh={refetch} />
      )}

      {/* Edit Attendance Modal */}
      {editModal && (
        <EditAttModal record={editModal} onClose={() => setEditModal(null)} onRefresh={refetch} />
      )}
    </div>
  );
}

// ── Month View ────────────────────────────────────────────────────────────────
function MonthView({ year, month, grouped, employees, user, isAdmin, onDayClick }) {
  const today = todayStr();
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);

  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startDate.getDay());
  const endDate = new Date(lastDay);
  endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

  const cells = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    cells.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }

  return (
    <>
      <div className="grid grid-cols-7 rounded-t-xl overflow-hidden border border-[#c7c4d8] border-b-0" style={{ background: 'linear-gradient(135deg, #f0f3ff, #fff)' }}>
        {DAYS.map(d => (
          <div key={d} className={cn('py-3 text-center text-[0.7rem] font-black uppercase tracking-widest text-[#777587]', (d === 'Sun' || d === 'Sat') && 'text-rose-400')}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 border border-[#c7c4d8] rounded-b-xl overflow-hidden shadow-card"
        style={{ background: 'rgba(14,165,233,.04)', gap: '1px' }}>
        {cells.map((c, i) => {
          const ds      = toISODate(c);
          const isOther = c.getMonth() !== month;
          const isTodayD = ds === today;
          const isWkend  = c.getDay() === 0 || c.getDay() === 6;
          const records  = grouped[ds] || [];

          return (
            <div
              key={i}
              onClick={() => onDayClick(ds)}
              className={cn(
                'bg-white min-h-[110px] p-2 cursor-pointer flex flex-col gap-1 transition-colors duration-100',
                isOther  && 'bg-[#f0f3ff]',
                isTodayD && 'bg-[#eef0ff]',
                isWkend  && !isTodayD && 'bg-slate-50',
                'hover:bg-[#f0f3ff]'
              )}
            >
              {/* Date number */}
              <div className={cn(
                'text-[0.8rem] font-black w-6.5 h-6.5 flex items-center justify-center shrink-0',
                isOther && 'opacity-25',
                isTodayD && 'w-7 h-7 rounded-full text-white text-xs',
              )} style={isTodayD ? { background: '#3525cd' } : {}}>
                {c.getDate()}
              </div>

              {/* Cell content */}
              {!isOther && !isWkend && (
                isAdmin
                  ? <AdminCellContent ds={ds} records={records} total={employees.length} />
                  : <EmpCellContent records={records} userId={user?.id} />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function AdminCellContent({ ds, records, total }) {
  if (total === 0) return null;
  const isFuture = ds > todayStr();
  const present  = records.filter(r => r.status === 'present').length;
  const onLeave  = records.filter(r => r.status === 'on_leave').length;
  const absent   = records.filter(r => r.status === 'absent').length;
  const half     = records.filter(r => r.status === 'half_day').length;
  const wfh      = records.filter(r => r.status === 'wfh').length;

  // For future dates only show approved leave indicators
  if (isFuture) {
    if (onLeave + half + wfh === 0) return null;
    return (
      <div className="flex flex-col gap-0.5 mt-0.5">
        {onLeave > 0 && <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{onLeave} Leave</span>}
        {half    > 0 && <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded bg-cyan-100  text-cyan-700">{half} Half Day</span>}
        {wfh     > 0 && <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded bg-blue-100  text-blue-700">{wfh} WFH</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 mt-0.5">
      {present  > 0 && <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{present} Present</span>}
      {onLeave  > 0 && <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded bg-amber-100   text-amber-700">{onLeave} Leave</span>}
      {absent   > 0 && <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded bg-rose-100    text-rose-700">{absent} Absent</span>}
      {half     > 0 && <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded bg-cyan-100    text-cyan-700">{half} Half Day</span>}
      {wfh      > 0 && <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded bg-blue-100    text-blue-700">{wfh} WFH</span>}
    </div>
  );
}

function EmpCellContent({ records, userId }) {
  const my = records.find(r => r.user_id === userId);
  if (!my) return null;
  const totalHours = my.clockify_hours ?? my.work_hours;
  return (
    <div className="flex flex-col gap-0.5">
      <span className={cn('text-[0.64rem] font-black px-1.5 py-0.5 rounded capitalize',
        { present: 'bg-emerald-100 text-emerald-700', absent: 'bg-rose-100 text-rose-700', on_leave: 'bg-amber-100 text-amber-700', half_day: 'bg-cyan-100 text-cyan-700', wfh: 'bg-[#e7eefe] text-[#3525cd]' }[my.status] || 'bg-[#f0f3ff] text-[#464555]'
      )}>
        {statusLabel(my.status)}
      </span>
      {totalHours > 0 && <span className="text-[0.58rem] text-[#777587]">{fmtHours(totalHours)}</span>}
    </div>
  );
}

// ── Week View ─────────────────────────────────────────────────────────────────
const STATUS_COLORS_MAP = { present: '#10B981', absent: '#EF4444', on_leave: '#F59E0B', half_day: '#4f46e5', wfh: '#3525cd' };

function WeekView({ weekDates, grouped, employees, user, isAdmin, onDayClick, getLeaveForDate }) {
  const today = todayStr();
  return (
    <div className="grid grid-cols-7 gap-2.5">
      {weekDates.map(d => {
        const ds      = toISODate(d);
        const isToday = ds === today;
        const records  = grouped[ds] || [];
        const displayRecords = isAdmin ? records.slice(0, 8) : records.filter(r => r.user_id === user?.id);

        return (
          <div key={ds} className={cn('card overflow-hidden hover:translate-y-[-4px] hover:shadow-card-hover transition-all duration-200', isToday && 'ring-2 ring-[#3525cd]/30')}>
            <div
              className={cn('py-3.5 px-2.5 text-center border-b border-[#f0f3ff] cursor-pointer hover:bg-[#f0f3ff] transition-colors', isToday && 'bg-[#f0f3ff]/60')}
              onClick={() => onDayClick(ds)}
            >
              <div className={cn('text-[0.64rem] font-black uppercase tracking-widest mb-1', isToday ? 'text-[#3525cd]' : 'text-[#777587]')}>{DAYS[d.getDay()]}</div>
              <div className={cn('text-2xl font-black tracking-tight', isToday ? 'text-[#3525cd]' : 'text-[#151c27]')}>{d.getDate()}</div>
              {isAdmin && records.length > 0 && (
                <div className="mt-1 text-[0.6rem] text-[#777587]">{records.length} records</div>
              )}
            </div>
            <div className="p-1.5 flex flex-col gap-0.5 max-h-48 overflow-y-auto">
              {displayRecords.map(r => {
                const leave = isAdmin ? getLeaveForDate?.(r.user_id, ds) : null;
                return (
                  <div key={r.id} className="flex items-start gap-1.5 px-1.5 py-1 rounded hover:bg-[#f0f3ff] transition-colors">
                    <span className="w-2 h-2 rounded-full shrink-0 mt-0.5" style={{ background: STATUS_COLORS_MAP[r.status] || '#777587' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[0.68rem] font-semibold truncate">
                        {isAdmin ? r.name?.split(' ')[0] : statusLabel(r.status)}
                      </div>
                      {r.status === 'on_leave' && leave && (
                        <div className="text-[0.58rem] text-amber-600 font-medium truncate">
                          {LEAVE_TYPE_LABEL[leave.leave_type] || leave.leave_type}
                        </div>
                      )}
                      {r.status === 'wfh' && (
                        <div className="text-[0.58rem] text-[#3525cd] font-medium">WFH</div>
                      )}
                      {((r.clockify_hours > 0 ? r.clockify_hours : r.work_hours)) > 0 && r.status === 'present' && (
                        <div className="text-[0.58rem] text-[#777587]">{fmtHours((r.clockify_hours > 0 ? r.clockify_hours : r.work_hours))}</div>
                      )}
                    </div>
                  </div>
                );
              })}
              {isAdmin && records.length > 8 && (
                <button className="text-[0.6rem] text-[#3525cd] font-bold px-1.5 py-1 text-left hover:underline"
                  onClick={() => onDayClick(ds)}>
                  +{records.length - 8} more
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Clockify Timeline Row ─────────────────────────────────────────────────────
function ClockifyTimeline({ userId, dateStr }) {
  const [open,    setOpen]    = useState(false);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (open) { setOpen(false); return; }
    setLoading(true);
    try {
      const { entries: e } = await apiGet('/clockify/user-entries', { userId, date: dateStr });
      setEntries(e || []);
    } catch { setEntries([]); }
    finally { setLoading(false); setOpen(true); }
  }

  const ICONS = [<Play size={11} />, <Pause size={11} />, <Play size={11} />, <Square size={11} />];

  return (
    <div className="mt-1.5 w-full">
      <button
        onClick={load}
        className="flex items-center gap-1 text-[0.68rem] font-bold text-[#3525cd] hover:text-[#4f46e5] transition-colors"
      >
        <Timer size={11} />
        {loading ? 'Loading…' : open ? <><ChevronUp size={11} /> Hide Timeline</> : <><ChevronDown size={11} /> View Clockify Timeline</>}
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-[#c7c4d8] overflow-hidden bg-[#f9f9ff]">
          {entries.length === 0 ? (
            <p className="text-[0.68rem] text-[#777587] px-3 py-2 text-center italic">No Clockify entries found for this date</p>
          ) : (
            <div className="divide-y divide-[#f0f3ff]">
              {entries.map((e, i) => (
                <div key={e.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="text-[#3525cd] flex-shrink-0">{ICONS[Math.min(i, ICONS.length - 1)]}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[0.68rem] font-bold text-[#151c27]">{e.start}</span>
                    {e.end && <span className="text-[0.65rem] text-[#777587]"> → {e.end}</span>}
                    {e.description && <span className="text-[0.63rem] text-[#777587] ml-1.5 truncate">· {e.description}</span>}
                  </div>
                  {e.durationMin > 0 && (
                    <span className="text-[0.65rem] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded flex-shrink-0">
                      {e.durationMin >= 60 ? `${Math.floor(e.durationMin/60)}h ${e.durationMin%60}m` : `${e.durationMin}m`}
                    </span>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-2 bg-[#f0f3ff]">
                <span className="text-[0.68rem] font-bold text-[#464555]">Total Work</span>
                <span className="text-[0.7rem] font-black text-[#3525cd]">
                  {(() => {
                    const total = entries.reduce((s, e) => s + (e.durationMin || 0), 0);
                    return total >= 60 ? `${Math.floor(total/60)}h ${total%60}m` : `${total}m`;
                  })()}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Day Modal ─────────────────────────────────────────────────────────────────
function DayModal({ dateStr, records, employees, isAdmin, user, onClose, onEditAtt, onRefresh, getLeaveForDate }) {
  const toast = useToast();
  const d = new Date(dateStr + 'T12:00:00');
  const [activeTab, setActiveTab] = useState('all');

  async function markAbsent(emp) {
    if (!confirm(`Mark ${emp.name} as absent for ${dateStr}?`)) return;
    try {
      await apiPost('/attendance/mark-absent', { user_id: emp.id, date: dateStr });
      toast('Marked absent', 'success');
      onRefresh();
      onClose();
    } catch (err) { toast(err.message, 'error'); }
  }

  const present  = records.filter(r => r.status === 'present').length;
  const absent   = records.filter(r => r.status === 'absent').length;
  const onLeave  = records.filter(r => r.status === 'on_leave').length;
  const wfhCount = records.filter(r => r.status === 'wfh').length;
  const halfDay  = records.filter(r => r.status === 'half_day').length;

  const isFutureDay = dateStr > todayStr();
  const displayEmployees = isAdmin ? employees : employees.filter(e => e.id === user?.id);
  const filteredEmps = activeTab === 'all'
    ? (isFutureDay
        ? displayEmployees.filter(emp => records.some(r => r.user_id === emp.id && ['on_leave','half_day','wfh'].includes(r.status)))
        : displayEmployees)
    : displayEmployees.filter(emp => {
        const rec = records.find(r => r.user_id === emp.id);
        if (activeTab === 'present')  return rec && rec.status === 'present' && !rec._synthetic;
        if (activeTab === 'on_leave') return rec && (rec.status === 'on_leave' || rec.status === 'half_day');
        if (activeTab === 'wfh')      return rec && rec.status === 'wfh';
        if (activeTab === 'absent')   return rec && rec.status === 'absent';
        if (activeTab === 'none')     return !rec;
        return true;
      });

  return (
    <Modal open onClose={onClose} title="" size="lg">
      {{
        body: (
          <>
            {/* Date header */}
            <div className="flex items-center gap-5 mb-4 p-4 rounded-xl border border-[#c7c4d8] relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, rgba(53,37,205,.06), rgba(113,42,226,.04))' }}>
              <div className="text-5xl font-black tracking-[-0.05em]"
                style={{ background: 'linear-gradient(135deg, #3525cd, #712ae2)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {d.getDate()}
              </div>
              <div className="flex-1">
                <div className="text-base font-black">{DAYS_FULL[d.getDay()]}, {MONTHS[d.getMonth()]} {d.getFullYear()}</div>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-[0.7rem] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                    <UserCheck size={11} /> {present} Present
                  </span>
                  <span className="inline-flex items-center gap-1 text-[0.7rem] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                    <Umbrella size={11} /> {onLeave} On Leave
                  </span>
                  {wfhCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-[0.7rem] font-bold px-2 py-0.5 rounded-full bg-[#e7eefe] text-[#3525cd] border border-[#c7c4d8]">
                      <Home size={11} /> {wfhCount} WFH
                    </span>
                  )}
                  {halfDay > 0 && (
                    <span className="inline-flex items-center gap-1 text-[0.7rem] font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 border border-cyan-200">
                      {halfDay} Half Day
                    </span>
                  )}
                  {absent > 0 && (
                    <span className="inline-flex items-center gap-1 text-[0.7rem] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                      <XCircle size={11} /> {absent} Absent
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Filter tabs (admin only) */}
            {isAdmin && (
              <div className="flex gap-1 mb-3 flex-wrap">
                {(isFutureDay
                  ? [['all','On Leave'],['on_leave','Leave'],['wfh','WFH']]
                  : [['all','All'],['present','Present'],['on_leave','On Leave'],['wfh','WFH'],['absent','Absent'],['none','No Record']]
                ).map(([k,l]) => (
                  <button key={k} onClick={() => setActiveTab(k)}
                    className={cn('text-[0.7rem] font-bold px-2.5 py-1 rounded-lg transition-colors',
                      activeTab === k ? 'bg-[#3525cd] text-white' : 'bg-[#f0f3ff] text-[#464555] hover:bg-[#e7eefe]'
                    )}>{l}</button>
                ))}
              </div>
            )}

            {/* Employee list */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {filteredEmps.map(emp => {
                const rec   = records.find(r => r.user_id === emp.id);
                const leave = getLeaveForDate?.(emp.id, dateStr);
                return (
                  <div key={emp.id}
                    className={cn('flex items-center gap-3.5 p-3.5 border rounded-xl transition-all duration-150',
                      rec?.status === 'present' ? 'border-emerald-300 bg-emerald-50 hover:border-emerald-400' :
                      rec?.status === 'on_leave' ? 'border-amber-300 bg-amber-50 hover:border-amber-400' :
                      rec?.status === 'wfh' ? 'border-[#c7c4d8] bg-[#f0f3ff] hover:border-[#3525cd]' :
                      rec?.status === 'absent' ? 'border-rose-300 bg-rose-50 hover:border-rose-400' :
                      rec?.status === 'half_day' ? 'border-cyan-300 bg-cyan-50 hover:border-cyan-400' :
                      'border-[#e7eefe] hover:border-[#3525cd] hover:bg-[#f0f3ff]'
                    )}>
                    <Avatar name={emp.name} color={emp.avatar_color} size={38} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold">{emp.name}</span>
                        {rec?.status === 'on_leave' && leave && (
                          <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                            {LEAVE_TYPE_LABEL[leave.leave_type] || leave.leave_type} Leave
                          </span>
                        )}
                        {rec?.status === 'wfh' && (
                          <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-[#e7eefe] text-[#3525cd] border border-[#c7c4d8]">
                            Work from Home
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#777587]">{emp.department}{emp.position ? ` · ${emp.position}` : ''}</div>
                      {rec && (
                        <div className="mt-1 w-full">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <StatusBadge status={rec.status} />
                            {leave && (rec.status === 'on_leave' || rec.status === 'wfh' || rec.status === 'half_day') && (
                              <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 capitalize">
                                {leave.leave_type} leave
                              </span>
                            )}
                            {(rec.clockify_hours ?? rec.work_hours) > 0 && !rec._synthetic && (
                              <span className="text-xs font-bold text-[#3525cd] flex items-center gap-1">
                                <Timer size={11} /> {fmtHours(rec.clockify_hours ?? rec.work_hours)}
                              </span>
                            )}
                          </div>
                          {isAdmin && rec.status === 'present' && !rec._synthetic && (
                            <ClockifyTimeline userId={rec.user_id} dateStr={dateStr} />
                          )}
                        </div>
                      )}
                      {!rec && <span className="text-xs text-[#777587] italic">No record yet</span>}
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1.5 shrink-0">
                        {rec && <button className="btn btn-outline btn-sm text-xs py-1 px-2" onClick={() => onEditAtt(rec)}>Edit</button>}
                        {!rec && dateStr <= todayStr() && (
                          <button className="btn btn-danger btn-sm text-xs py-1 px-2" onClick={() => markAbsent(emp)}>Absent</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredEmps.length === 0 && (
                <div className="text-center py-8 text-sm text-[#777587]">No employees in this filter</div>
              )}
            </div>
          </>
        ),
      }}
    </Modal>
  );
}

// ── Edit Attendance Modal ─────────────────────────────────────────────────────
function EditAttModal({ record: r, onClose, onRefresh }) {
  const toast = useToast();
  const [form, setForm] = useState({
    check_in:   r.check_in  || '',
    check_out:  r.check_out || '',
    status:     r.status    || 'present',
    work_hours: r.work_hours || '',
  });

  async function save() {
    try {
      await apiPut(`/attendance/${r.id}`, form);
      toast('Attendance updated', 'success');
      onRefresh();
      onClose();
    } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <Modal open onClose={onClose} title={`Edit Attendance — ${r.name}`} size="sm"
      footer={<><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      {{
        body: (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="form-label">Check In</label><input type="time" className="form-control" value={form.check_in} onChange={e => setForm(f => ({ ...f, check_in: e.target.value }))} /></div>
              <div><label className="form-label">Check Out</label><input type="time" className="form-control" value={form.check_out} onChange={e => setForm(f => ({ ...f, check_out: e.target.value }))} /></div>
            </div>
            <div><label className="form-label">Status</label>
              <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {['present','absent','on_leave','half_day','wfh'].map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>
            </div>
            <div><label className="form-label">Work Hours</label><input type="number" className="form-control" step="0.25" value={form.work_hours} onChange={e => setForm(f => ({ ...f, work_hours: e.target.value }))} /></div>
          </div>
        ),
      }}
    </Modal>
  );
}
