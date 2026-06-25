import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Home, Umbrella, Globe, Users, CalendarDays, Clock } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/context/AuthContext';
import { MONTHS } from '@/lib/utils';

const DAYS    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LEAVE_TYPE_COLORS = {
  casual:    { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  sick:      { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  annual:    { bg: '#ede9fe', text: '#4c1d95', border: '#c4b5fd' },
  emergency: { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' },
  wfh:       { bg: '#eff6ff', text: '#1e40af', border: '#93c5fd' },
  other:     { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
};

function pad(n) { return String(n).padStart(2, '0'); }

function getCalendarDays(year, month) {
  const first = new Date(year, month - 1, 1).getDay();
  const total = new Date(year, month, 0).getDate();
  const days  = [];
  for (let i = 0; i < first; i++) days.push(null);
  for (let i = 1; i <= total; i++) days.push(i);
  return days;
}

function avatarInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function TeamCalendar() {
  const { user } = useAuth();
  const now   = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState(null);

  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd   = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`;
  const today      = now.toISOString().split('T')[0];

  // ── Fetch ALL approved leaves for the org (new team-leaves endpoint) ────────
  const { data: teamLeaves = [], isLoading } = useQuery({
    queryKey: ['team-leaves', year, month],
    queryFn:  () => apiGet('/team-leaves', { startDate: monthStart, endDate: monthEnd }),
    staleTime: 60000,
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ['holidays', year],
    queryFn:  () => apiGet('/holidays', { year }),
    staleTime: 300000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-calendar'],
    queryFn:  () => apiGet('/employees'),
    staleTime: 300000,
  });

  function getLeavesForDay(day) {
    const ds = `${year}-${pad(month)}-${pad(day)}`;
    return teamLeaves.filter(l => l.start_date <= ds && l.end_date >= ds);
  }

  function getHolidayForDay(day) {
    const ds = `${year}-${pad(month)}-${pad(day)}`;
    return holidays.find(h => h.date === ds);
  }

  function prev() { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); }
  function next() { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); }

  const calDays        = getCalendarDays(year, month);
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const todayLeaves    = isCurrentMonth ? getLeavesForDay(now.getDate()) : [];
  const selectedLeaves = selectedDay ? getLeavesForDay(selectedDay) : [];
  const selectedDs     = selectedDay ? `${year}-${pad(month)}-${pad(selectedDay)}` : null;
  const selectedHol    = selectedDay ? getHolidayForDay(selectedDay) : null;

  // Build a unique list of people on leave this month for the sidebar
  const onLeaveThisMonth = [];
  const seen = new Set();
  for (const l of teamLeaves) {
    if (!seen.has(l.user_id)) {
      seen.add(l.user_id);
      onLeaveThisMonth.push({ user_id: l.user_id, name: l.name, avatar_color: l.avatar_color, department: l.department });
    }
  }

  // Count leave days per person this month
  const leaveDayCount = {};
  for (const l of teamLeaves) {
    const start = new Date(Math.max(new Date(l.start_date + 'T12:00:00'), new Date(monthStart + 'T12:00:00')));
    const end   = new Date(Math.min(new Date(l.end_date   + 'T12:00:00'), new Date(monthEnd   + 'T12:00:00')));
    if (start > end) continue;
    let count = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0 && d.getDay() !== 6) count++;
    }
    leaveDayCount[l.user_id] = (leaveDayCount[l.user_id] || 0) + count;
  }

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-[#151c27] tracking-tight">Team Calendar</h1>
          <p className="text-sm text-[#777587] mt-0.5">All approved leaves across your team — {MONTHS[month - 1]} {year}</p>
        </div>
        <div className="flex items-center gap-1 bg-white border border-[#c7c4d8] rounded-xl px-2 py-1.5 shadow-sm">
          <button onClick={prev} className="w-7 h-7 flex items-center justify-center rounded-lg text-[#777587] hover:text-[#3525cd] hover:bg-[#f0f3ff] transition-colors"><ChevronLeft size={15} /></button>
          <span className="font-black text-[#151c27] min-w-[8rem] text-center text-sm">{MONTHS[month - 1]} {year}</span>
          <button onClick={next} className="w-7 h-7 flex items-center justify-center rounded-lg text-[#777587] hover:text-[#3525cd] hover:bg-[#f0f3ff] transition-colors"><ChevronRight size={15} /></button>
        </div>
      </div>

      {/* ── Today's snapshot ─────────────────────────────────────────────────── */}
      {isCurrentMonth && todayLeaves.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-black uppercase tracking-widest text-amber-700">
              Out Today — {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {todayLeaves.map(l => {
              const typeLabel = l.leave_time === 'wfh' ? 'WFH' : l.leave_time === 'half' ? 'Half Day' : l.leave_type === 'sick' ? 'Sick' : 'On Leave';
              const isWfh    = l.leave_time === 'wfh';
              return (
                <div key={l.id} className={`flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1 border ${isWfh ? 'bg-[#f0f3ff] border-[#c7c4d8]' : 'bg-amber-50 border-amber-200'}`}>
                  <Avatar name={l.name || '?'} color={l.avatar_color} size={22} />
                  <span className={`text-xs font-semibold ${isWfh ? 'text-[#3525cd]' : 'text-amber-800'}`}>{l.name}</span>
                  {l.department && <span className="text-[0.6rem] text-[#9ca3af]">· {l.department}</span>}
                  <span className={`text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full ${isWfh ? 'bg-[#3525cd] text-white' : 'bg-amber-200 text-amber-800'}`}>{typeLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isCurrentMonth && todayLeaves.length === 0 && !isLoading && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-sm font-semibold text-emerald-700">Everyone is in today — no approved leaves.</span>
        </div>
      )}

      <div className="flex gap-5">

        {/* ── Calendar grid ─────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 bg-[#f0f3ff] border-b border-[#c7c4d8]">
              {DAYS.map((d, i) => (
                <div key={d} className={`py-3 text-center text-[0.65rem] font-black uppercase tracking-wider ${i === 0 || i === 6 ? 'text-rose-400' : 'text-[#777587]'}`}>{d}</div>
              ))}
            </div>

            {isLoading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="spinner w-6 h-6" />
              </div>
            ) : (
              <div className="grid grid-cols-7">
                {calDays.map((day, i) => {
                  if (!day) return <div key={`e-${i}`} className="min-h-[96px] border-b border-r border-[#f0f3ff] bg-[#fafafa]" />;

                  const ds         = `${year}-${pad(month)}-${pad(day)}`;
                  const isToday_   = ds === today;
                  const isSelected = selectedDay === day;
                  const holiday    = getHolidayForDay(day);
                  const dayLeaves  = getLeavesForDay(day);
                  const dow        = new Date(ds + 'T12:00:00').getDay();
                  const isWeekend  = dow === 0 || dow === 6;
                  const myLeave    = dayLeaves.find(l => l.user_id === user?.id);

                  return (
                    <div key={day} onClick={() => setSelectedDay(selectedDay === day ? null : day)}
                      className={`min-h-[96px] border-b border-r border-[#f0f3ff] p-1.5 cursor-pointer transition-all
                        ${isWeekend ? 'bg-[#fafafe]' : 'bg-white'}
                        ${holiday   ? 'bg-emerald-50/50' : ''}
                        ${isSelected ? 'ring-2 ring-inset ring-[#3525cd]' : 'hover:bg-[#f9f9ff]'}
                        ${isToday_  ? 'ring-2 ring-inset ring-[#3525cd]/30' : ''}`}>

                      {/* Day number */}
                      <div className="flex items-center justify-between mb-1">
                        <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold transition-colors
                          ${isToday_ ? 'bg-[#3525cd] text-white shadow-sm' : isWeekend ? 'text-rose-400' : 'text-[#464555]'}`}>
                          {day}
                        </div>
                        <div className="flex items-center gap-0.5">
                          {myLeave && <div className="w-1.5 h-1.5 rounded-full bg-[#3525cd]" title="You're on leave" />}
                          {holiday && <Globe size={9} className="text-emerald-600" />}
                        </div>
                      </div>

                      {/* Holiday */}
                      {holiday && (
                        <div className="text-[0.54rem] font-bold text-emerald-700 truncate px-0.5 mb-0.5 leading-tight">{holiday.name}</div>
                      )}

                      {/* Leave chips — show avatar + name */}
                      <div className="space-y-0.5">
                        {dayLeaves.slice(0, 3).map(l => {
                          const isWfh   = l.leave_time === 'wfh';
                          const isMe    = l.user_id === user?.id;
                          const colors  = isWfh ? LEAVE_TYPE_COLORS.wfh : (LEAVE_TYPE_COLORS[l.leave_type] || LEAVE_TYPE_COLORS.other);
                          return (
                            <div key={l.id} className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[0.54rem] font-bold truncate"
                              style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}>
                              <div className="w-3 h-3 rounded-full flex-shrink-0 flex items-center justify-center text-[0.42rem] font-black text-white"
                                style={{ background: l.avatar_color || '#3525cd' }}>
                                {avatarInitials(l.name)}
                              </div>
                              <span className="truncate">{isMe ? 'You' : l.name?.split(' ')[0]}</span>
                              {isWfh ? <Home size={7} className="flex-shrink-0 ml-auto" /> : <Umbrella size={7} className="flex-shrink-0 ml-auto" />}
                            </div>
                          );
                        })}
                        {dayLeaves.length > 3 && (
                          <div className="text-[0.54rem] text-[#777587] pl-1 font-semibold">+{dayLeaves.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 mt-3 flex-wrap">
            {[
              { label: 'On Leave',  bg: '#fef3c7', border: '#fcd34d' },
              { label: 'WFH',       bg: '#eff6ff', border: '#93c5fd' },
              { label: 'Sick',      bg: '#fee2e2', border: '#fca5a5' },
              { label: 'Holiday',   bg: '#d1fae5', border: '#6ee7b7' },
              { label: 'Weekend',   bg: '#fafafe', border: '#e7eefe' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5 text-xs text-[#777587]">
                <div className="w-3 h-3 rounded border" style={{ background: l.bg, borderColor: l.border }} />
                {l.label}
              </div>
            ))}
            <div className="flex items-center gap-1.5 text-xs text-[#777587]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#3525cd]" /> Your leave
            </div>
          </div>
        </div>

        {/* ── Right panel: selected day detail + team absence list ──────────── */}
        <div className="w-64 flex-shrink-0 space-y-4 hidden lg:block">

          {/* Selected day detail */}
          {selectedDay && (
            <div className="bg-white rounded-xl border border-[#3525cd]/30 shadow-sm overflow-hidden">
              <div className="bg-[#3525cd] px-4 py-3">
                <p className="text-white text-xs font-black uppercase tracking-wide">
                  {new Date(selectedDs + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </p>
                {selectedHol && <p className="text-white/70 text-[0.6rem] mt-0.5">🎉 {selectedHol.name}</p>}
              </div>
              <div className="p-3">
                {selectedLeaves.length === 0 ? (
                  <p className="text-xs text-[#9ca3af] text-center py-4">Everyone is in ✓</p>
                ) : (
                  <div className="space-y-2">
                    {selectedLeaves.map(l => {
                      const isWfh  = l.leave_time === 'wfh';
                      const isHalf = l.leave_time === 'half';
                      const isMe   = l.user_id === user?.id;
                      return (
                        <div key={l.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-[#f9f9ff]">
                          <Avatar name={l.name || '?'} color={l.avatar_color} size={28} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-[#151c27] truncate">
                              {isMe ? `${l.name} (You)` : l.name}
                            </p>
                            <p className="text-[0.6rem] text-[#9ca3af]">{l.department}</p>
                          </div>
                          <span className={`text-[0.55rem] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                            isWfh  ? 'bg-[#f0f3ff] text-[#3525cd]' :
                            isHalf ? 'bg-purple-50 text-purple-700' :
                            'bg-amber-50 text-amber-700'}`}>
                            {isWfh ? 'WFH' : isHalf ? 'Half' : 'Leave'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Team absence summary this month */}
          <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e7eefe] flex items-center justify-between">
              <h3 className="text-xs font-black text-[#151c27] flex items-center gap-1.5">
                <Users size={13} className="text-[#3525cd]" /> On Leave This Month
              </h3>
              <span className="text-[0.65rem] text-[#9ca3af]">{onLeaveThisMonth.length} people</span>
            </div>
            {onLeaveThisMonth.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-[#9ca3af]">No approved leaves this month</p>
              </div>
            ) : (
              <div className="divide-y divide-[#f9f9ff]">
                {onLeaveThisMonth.map(p => (
                  <div key={p.user_id} className="flex items-center gap-2.5 px-4 py-2.5">
                    <Avatar name={p.name || '?'} color={p.avatar_color} size={26} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[#151c27] truncate">
                        {p.user_id === user?.id ? `${p.name} (You)` : p.name}
                      </p>
                      {p.department && <p className="text-[0.6rem] text-[#9ca3af] truncate">{p.department}</p>}
                    </div>
                    <span className="text-[0.6rem] font-bold text-[#3525cd] bg-[#f0f3ff] px-1.5 py-0.5 rounded-full flex-shrink-0">
                      {leaveDayCount[p.user_id] || 1}d
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Monthly summary stats */}
          <div className="bg-white rounded-xl border border-[#c7c4d8] shadow-sm p-4">
            <h3 className="text-xs font-black text-[#151c27] mb-3 uppercase tracking-wide">Month Summary</h3>
            <div className="space-y-2">
              {[
                { label: 'Total leaves',    value: teamLeaves.length,                                        color: 'text-amber-600 bg-amber-50' },
                { label: 'On leave',        value: teamLeaves.filter(l => l.leave_time !== 'wfh').length,   color: 'text-rose-600 bg-rose-50' },
                { label: 'WFH',             value: teamLeaves.filter(l => l.leave_time === 'wfh').length,   color: 'text-[#3525cd] bg-[#f0f3ff]' },
                { label: 'People affected', value: onLeaveThisMonth.length,                                  color: 'text-purple-600 bg-purple-50' },
                { label: 'Public holidays', value: holidays.filter(h => h.date >= monthStart && h.date <= monthEnd).length, color: 'text-emerald-600 bg-emerald-50' },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between text-xs">
                  <span className="text-[#777587]">{s.label}</span>
                  <span className={`font-black px-2 py-0.5 rounded-full ${s.color}`}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
